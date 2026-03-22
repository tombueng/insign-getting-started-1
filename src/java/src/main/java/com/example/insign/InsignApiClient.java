package com.example.insign;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

/**
 * Minimal REST client for the inSign API.
 * Uses Spring 6 RestClient with Basic authentication.
 * All HTTP and application-level errors are caught and printed to console.
 */
@Component
public class InsignApiClient {

    private final RestClient restClient;
    private final String baseUrl;
    private final ObjectMapper mapper = new ObjectMapper();

    public InsignApiClient(
            @Value("${insign.api.base-url}") String baseUrl,
            @Value("${insign.api.username}") String username,
            @Value("${insign.api.password}") String password) {

        this.baseUrl = baseUrl;
        String credentials = Base64.getEncoder()
                .encodeToString((username + ":" + password).getBytes(StandardCharsets.UTF_8));

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("Authorization", "Basic " + credentials)
                .defaultStatusHandler(status -> status.isError(), (request, response) -> {
                    String body = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
                    String msg = "HTTP " + response.getStatusCode().value()
                            + " " + request.getMethod() + " " + request.getURI();
                    // Try to extract error message from JSON response
                    try {
                        JsonNode json = mapper.readTree(body);
                        String errorMsg = json.path("message").asText(
                                json.path("errormessage").asText(""));
                        int errorCode = json.path("error").asInt(0);
                        if (!errorMsg.isEmpty()) {
                            msg += " | error=" + errorCode + " | " + errorMsg;
                        } else {
                            msg += " | " + body;
                        }
                    } catch (Exception e) {
                        msg += " | (non-JSON response)";
                    }
                    throw new InsignApiException(response.getStatusCode().value(), msg, body);
                })
                .build();
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    // -- Version --

    public String getVersion() {
        return restClient.get()
                .uri("/version")
                .retrieve().body(String.class);
    }

    // -- Session lifecycle --

    public JsonNode createSession(JsonNode sessionConfig) throws Exception {
        return postJson("/configure/session", sessionConfig);
    }

    public void uploadDocument(String sessionId, String docId, byte[] pdfBytes, String filename) {
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("sessionid", sessionId);
        parts.add("docid", docId);
        parts.add("filename", filename);
        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentType(MediaType.APPLICATION_PDF);
        parts.add("file", new HttpEntity<>(new ByteArrayResource(pdfBytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        }, fileHeaders));

        restClient.post()
                .uri("/configure/uploaddocument")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(parts)
                .retrieve().toBodilessEntity();
    }

    // -- Status --

    public JsonNode getStatus(String sessionId) throws Exception {
        return postSessionId("/get/status", sessionId);
    }

    public JsonNode checkStatus(String sessionId) throws Exception {
        return postSessionId("/get/checkstatus", sessionId);
    }

    // -- External signing --

    public JsonNode beginExtern(JsonNode externConfig) throws Exception {
        return postJson("/extern/beginmulti", externConfig);
    }

    public JsonNode revokeExtern(String sessionId) throws Exception {
        return postSessionId("/extern/abort", sessionId);
    }

    public JsonNode getExternUsers(String sessionId) throws Exception {
        return postSessionId("/extern/users", sessionId);
    }

    public JsonNode getExternInfos(String sessionId) throws Exception {
        return postSessionId("/get/externInfos", sessionId);
    }

    // -- Documents --

    public byte[] downloadDocumentsArchive(String sessionId) throws Exception {
        return postSessionIdBinary("/get/documents/download", sessionId);
    }

    public byte[] downloadAuditReport(String sessionId) throws Exception {
        return restClient.get()
                .uri("/get/audit/download?sessionid=" + sessionId)
                .retrieve().body(byte[].class);
    }

    public byte[] downloadSingleDocument(String sessionId, String docId) throws Exception {
        return restClient.post()
                .uri("/get/document?sessionid=" + sessionId + "&docid=" + docId)
                .retrieve().body(byte[].class);
    }

    public JsonNode getSessionMetadata(String sessionId) throws Exception {
        return postSessionId("/get/documents/full?includeAnnotations=true", sessionId);
    }

    // -- Session operations --

    public void purgeSession(String sessionId) {
        restClient.delete()
                .uri("/persistence/purge?sessionid=" + sessionId)
                .retrieve().toBodilessEntity();
    }

    // -- Reminders --

    public JsonNode sendReminder(String sessionId) throws Exception {
        return postSessionId("/load/sendManualReminder", sessionId);
    }

    // -- SSO / Owner link --

    public String createOwnerSSOLink(String forUser) throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("id", forUser);
        return restClient.post()
                .uri("/configure/createSSOForApiuser")
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(body))
                .retrieve().body(String.class);
    }

    // -- Audit --

    public JsonNode getAuditJson(String sessionId) throws Exception {
        return postSessionId("/get/audit", sessionId);
    }

    // -- User sessions --

    public JsonNode getUserSessions(String user) throws Exception {
        return postJson("/get/usersessions?user=" + user, mapper.createObjectNode());
    }

    public JsonNode queryUserSessions(List<String> sessionIds) throws Exception {
        ObjectNode body = mapper.createObjectNode();
        ArrayNode ids = mapper.createArrayNode();
        sessionIds.forEach(ids::add);
        body.set("sessionids", ids);
        return postJson("/get/querysessions", body);
    }

    // -- Helpers --

    private ObjectNode sessionIdBody(String sessionId) {
        ObjectNode body = mapper.createObjectNode();
        body.put("sessionid", sessionId);
        return body;
    }

    private JsonNode postSessionId(String path, String sessionId) throws Exception {
        return postJson(path, sessionIdBody(sessionId));
    }

    private JsonNode postJson(String path, JsonNode body) throws Exception {
        ResponseEntity<String> res = restClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(body))
                .retrieve().toEntity(String.class);
        return checkResponse(path, res);
    }

    private byte[] postSessionIdBinary(String path, String sessionId) throws Exception {
        return restClient.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(sessionIdBody(sessionId)))
                .retrieve().body(byte[].class);
    }

    /**
     * Checks a JSON response for application-level errors (error != 0).
     * The inSign API may return HTTP 200 but still signal an error in the JSON body.
     */
    private JsonNode checkResponse(String path, ResponseEntity<String> res) throws Exception {
        JsonNode json = mapper.readTree(res.getBody());
        int error = json.path("error").asInt(0);
        if (error != 0) {
            String message = json.path("message").asText(
                    json.path("errormessage").asText(res.getBody()));
            throw new InsignApiException(res.getStatusCode().value(),
                    "HTTP " + res.getStatusCode().value() + " POST " + path
                            + " | error=" + error + " | " + message,
                    res.getBody());
        }
        return json;
    }
}
