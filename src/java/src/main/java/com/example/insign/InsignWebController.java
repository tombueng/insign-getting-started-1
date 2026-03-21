package com.example.insign;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.*;

@RestController
@RequestMapping("/api")
public class InsignWebController {

    private final InsignApiClient apiClient;
    private final PdfGenerator pdfGenerator;
    private final StatusPoller poller;
    private final SessionStatusTracker tracker;
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${insign.api.username}")
    private String apiUsername;

    @Value("${insign.webhook.callback-url:}")
    private String webhookCallbackUrl;

    @Value("${insign.thankyou.url:}")
    private String thankyouUrl;

    private String currentSessionId;

    public InsignWebController(InsignApiClient apiClient, PdfGenerator pdfGenerator,
                               StatusPoller poller, SessionStatusTracker tracker) {
        this.apiClient = apiClient;
        this.pdfGenerator = pdfGenerator;
        this.poller = poller;
        this.tracker = tracker;
    }

    // -- SSE --

    @GetMapping("/events")
    public SseEmitter events() {
        return tracker.registerEmitter();
    }

    // -- Version --

    @GetMapping("/version")
    public Map<String, String> version() {
        return Map.of("version", apiClient.getVersion());
    }

    // -- Session lifecycle --

    @PostMapping("/session/create")
    public JsonNode createSession() throws Exception {
        byte[] pdf = pdfGenerator.generateTestPdf();

        ObjectNode config = mapper.createObjectNode();
        config.put("foruser", "getting-started-" + System.currentTimeMillis());
        config.put("userFullName", "Chris Signlord");
        config.put("userEmail", apiUsername);
        config.put("displayname", "Getting Started - Test Contract");
        config.put("makeFieldsMandatory", true);
        config.put("signatureLevel", "AES");
        config.put("embedBiometricData", true);
        config.put("writeAuditReport", true);

        ObjectNode guiProperties = mapper.createObjectNode();
        guiProperties.put("guiFertigbuttonSkipModalDialog", true);
        guiProperties.put("guiFertigbuttonSkipModalDialogExtern", true);
        guiProperties.put("guiFertigbuttonModalDialogExternSkipSendMail", true);
        guiProperties.put("guiAfterSignOpenNextSignatureField", true);
        config.set("guiProperties", guiProperties);

        // Thank-you page shown to signer after completion
        if (thankyouUrl != null && !thankyouUrl.isEmpty()) {
            config.put("callbackURL", thankyouUrl);
        }

        if (webhookCallbackUrl != null && !webhookCallbackUrl.isEmpty()) {
            config.put("serverSidecallbackURL", webhookCallbackUrl);
            config.put("serversideCallbackMethod", "POST");
            config.put("serversideCallbackContentType", "application/json");
        }

        ArrayNode documents = mapper.createArrayNode();
        ObjectNode doc = mapper.createObjectNode();
        doc.put("id", "doc1");
        doc.put("displayname", "Test Contract");
        doc.put("mustbesigned", true);
        documents.add(doc);
        config.set("documents", documents);

        JsonNode result = apiClient.createSession(config);
        currentSessionId = result.path("sessionid").asText(null);

        if (currentSessionId != null) {
            apiClient.uploadDocument(currentSessionId, "doc1", pdf, "contract.pdf");
            poller.watchSession(currentSessionId);
        }

        return result;
    }

    @GetMapping("/session/status")
    public JsonNode getStatus() throws Exception {
        requireSession();
        return apiClient.getStatus(currentSessionId);
    }

    @GetMapping("/session/checkstatus")
    public JsonNode checkStatus() throws Exception {
        requireSession();
        return apiClient.checkStatus(currentSessionId);
    }

    @GetMapping("/session/metadata")
    public JsonNode getSessionMetadata() throws Exception {
        requireSession();
        return apiClient.getSessionMetadata(currentSessionId);
    }

    @DeleteMapping("/session/purge")
    public Map<String, String> purgeSession() {
        requireSession();
        poller.unwatchSession(currentSessionId);
        apiClient.purgeSession(currentSessionId);
        String purgedId = currentSessionId;
        currentSessionId = null;
        return Map.of("message", "Session purged: " + purgedId);
    }

    // -- External signing --

    @PostMapping("/extern/invite")
    public JsonNode inviteExtern(@RequestBody JsonNode body) throws Exception {
        requireSession();

        String email1 = body.path("email1").asText("");
        String email2 = body.path("email2").asText("");
        String delivery = body.path("delivery").asText("link");
        String phone1 = body.path("phone1").asText("");
        String phone2 = body.path("phone2").asText("");

        // Check which roles still need signing
        JsonNode status = apiClient.getStatus(currentSessionId);
        Set<String> completedRoles = getCompletedRoles(status);

        ObjectNode externConfig = mapper.createObjectNode();
        externConfig.put("sessionid", currentSessionId);

        ArrayNode users = mapper.createArrayNode();
        if (!completedRoles.contains("Signer1")) {
            users.add(buildExternUser(email1, "Signer1", delivery, phone1));
        }
        if (!completedRoles.contains("Signer2")) {
            users.add(buildExternUser(email2, "Signer2", delivery, phone2));
        }

        if (users.isEmpty()) {
            ObjectNode result = mapper.createObjectNode();
            result.put("message", "All roles have completed signing. Nothing to invite.");
            return result;
        }

        externConfig.set("externUsers", users);
        return apiClient.beginExtern(externConfig);
    }

    @PostMapping("/extern/revoke")
    public JsonNode revokeExtern() throws Exception {
        requireSession();
        return apiClient.revokeExtern(currentSessionId);
    }

    @GetMapping("/extern/users")
    public JsonNode getExternUsers() throws Exception {
        requireSession();
        return apiClient.getExternUsers(currentSessionId);
    }

    @GetMapping("/extern/infos")
    public JsonNode getExternInfos() throws Exception {
        requireSession();
        return apiClient.getExternInfos(currentSessionId);
    }

    @PostMapping("/extern/reminder")
    public JsonNode sendReminder() throws Exception {
        requireSession();
        return apiClient.sendReminder(currentSessionId);
    }

    // -- Owner link --

    @GetMapping("/owner-link")
    public Map<String, String> getOwnerLink() throws Exception {
        requireSession();
        String jwt = apiClient.createOwnerSSOLink(apiUsername);
        String url = apiClient.getBaseUrl() + "/index?jwt=" + jwt + "&sessionid=" + currentSessionId;
        return Map.of("url", url, "jwt", jwt);
    }

    // -- Documents --

    @GetMapping("/documents/download")
    public ResponseEntity<byte[]> downloadDocuments() throws Exception {
        requireSession();
        byte[] zip = apiClient.downloadDocumentsArchive(currentSessionId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=documents_" + currentSessionId + ".zip")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(zip);
    }

    @GetMapping("/audit/download")
    public ResponseEntity<byte[]> downloadAuditReport() throws Exception {
        requireSession();
        byte[] pdf = apiClient.downloadAuditReport(currentSessionId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=audit_" + currentSessionId + ".pdf")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    // -- Error handling --

    @ExceptionHandler(InsignApiException.class)
    public ResponseEntity<Map<String, Object>> handleApiError(InsignApiException e) {
        var body = new LinkedHashMap<String, Object>();
        body.put("error", true);
        body.put("message", e.getMessage());
        if (e.getResponseBody() != null) {
            body.put("responseBody", e.getResponseBody());
        }
        return ResponseEntity.status(e.getHttpStatus() >= 400 ? e.getHttpStatus() : 400).body(body);
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException e) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", true, "message", e.getMessage()));
    }

    // -- Helpers --

    private void requireSession() {
        if (currentSessionId == null) {
            throw new IllegalStateException("No active session. Create a session first.");
        }
    }

    private ObjectNode buildExternUser(String email, String role, String delivery, String phone) {
        ObjectNode user = mapper.createObjectNode();
        if (email.isEmpty()) {
            email = System.currentTimeMillis() + "@example.invalid";
        }
        user.put("recipient", email);
        user.put("realName", email);
        ArrayNode roles = mapper.createArrayNode();
        roles.add(role);
        user.set("roles", roles);

        switch (delivery) {
            case "email" -> {
                user.put("sendEmails", true);
                user.put("sendSMS", false);
            }
            case "sms" -> {
                user.put("sendEmails", false);
                user.put("sendSMS", true);
                user.put("mobileNumber", phone);
            }
            default -> {
                user.put("sendEmails", false);
                user.put("sendSMS", false);
            }
        }
        user.put("singleSignOnEnabled", true);
        return user;
    }

    private Set<String> getCompletedRoles(JsonNode status) {
        Map<String, List<Boolean>> roleFields = new LinkedHashMap<>();
        JsonNode sigFields = status.path("signaturFieldsStatusList");
        if (sigFields.isArray()) {
            for (JsonNode field : sigFields) {
                String role = field.path("role").asText("");
                if (!role.isEmpty()) {
                    roleFields.computeIfAbsent(role, k -> new ArrayList<>())
                            .add(field.path("signed").asBoolean(false));
                }
            }
        }
        Set<String> completed = new LinkedHashSet<>();
        for (var entry : roleFields.entrySet()) {
            if (!entry.getValue().isEmpty() && entry.getValue().stream().allMatch(b -> b)) {
                completed.add(entry.getKey());
            }
        }
        return completed;
    }
}
