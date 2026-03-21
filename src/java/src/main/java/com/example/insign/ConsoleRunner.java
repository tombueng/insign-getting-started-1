package com.example.insign;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Interactive console application that:
 * 1. Generates a test PDF with 2 SIG tags
 * 2. Creates an inSign session with that document
 * 3. Offers an interactive menu for session operations
 */
@Component
@ConditionalOnProperty(name = "app.console.enabled", havingValue = "true", matchIfMissing = true)
public class ConsoleRunner implements CommandLineRunner {

    private final InsignApiClient apiClient;
    private final PdfGenerator pdfGenerator;
    private final StatusPoller poller;
    private final SessionStatusTracker tracker;
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${insign.webhook.callback-url:}")
    private String webhookCallbackUrl;

    @Value("${insign.thankyou.url:}")
    private String thankyouUrl;

    @Value("${insign.api.username}")
    private String apiUsername;

    public ConsoleRunner(InsignApiClient apiClient, PdfGenerator pdfGenerator,
                         StatusPoller poller, SessionStatusTracker tracker) {
        this.apiClient = apiClient;
        this.pdfGenerator = pdfGenerator;
        this.poller = poller;
        this.tracker = tracker;
    }

    @Override
    public void run(String... args) throws Exception {
        Scanner scanner = new Scanner(System.in);

        System.out.println("=== inSign API - Getting Started ===\n");

        // Check connectivity
        String version = apiClient.getVersion();
        System.out.println("Connected to inSign server, version: " + version + "\n");

        // Step 1: Generate test PDF
        System.out.println("[1/3] Generating test PDF with 2 signature fields...");
        byte[] pdfBytes = pdfGenerator.generateTestPdf();
        System.out.println("  Generated PDF: " + pdfBytes.length + " bytes");

        // Step 2: Create session
        System.out.println("[2/3] Creating inSign session...");
        ObjectNode sessionConfig = buildSessionConfig();
        System.out.println("  Session config:");
        System.out.println("  " + mapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(sessionConfig).replace("\n", "\n  "));

        JsonNode createResult = apiClient.createSession(sessionConfig);
        String sessionId = createResult.path("sessionid").asText(null);
        String accessUrl = createResult.path("url").asText(null);

        if (sessionId == null) {
            System.out.println("ERROR: Failed to create session!");
            System.out.println(createResult.toPrettyString());
            return;
        }

        System.out.println("  Session ID: " + sessionId);
        if (accessUrl != null) {
            System.out.println("  Access URL: " + accessUrl);
        }

        // Step 3: Upload document
        System.out.println("[3/3] Uploading PDF...");
        apiClient.uploadDocument(sessionId, "doc1", pdfBytes, "contract.pdf");
        System.out.println("  Document uploaded successfully.");

        // Get initial status
        JsonNode status = apiClient.getStatus(sessionId);
        System.out.println("\nSession created. Status: " + status.path("status").asText("unknown"));

        // Start background polling (falls back to /get/checkstatus when no webhooks arrive)
        poller.watchSession(sessionId);

        // Interactive menu
        interactiveMenu(scanner, sessionId);
    }

    private void interactiveMenu(Scanner scanner, String sessionId) throws Exception {
        while (true) {
            System.out.println("\n--- Session Menu (" + sessionId + ") ---");
            System.out.println("   1) Invite users (Email/SMS/Link)");
            System.out.println("   2) Show status (/get/status)");
            System.out.println("   3) Check status (/get/checkstatus)");
            System.out.println("   4) Get fresh Owner-Entry link");
            System.out.println("   5) Revoke invites (abort extern)");
            System.out.println("   6) Download documents (ZIP)");
            System.out.println("   7) Download audit report (PDF)");
            System.out.println("   8) Show session data");
            System.out.println("   9) Show extern users");
            System.out.println("  10) Show extern infos");
            System.out.println("  11) Resend reminder");
            System.out.println("  12) Purge session");
            System.out.println("   0) Exit");
            System.out.print("\nChoice: ");

            String choice = scanner.nextLine().trim();
            try {
                switch (choice) {
                    case "1" -> inviteUsers(scanner, sessionId);
                    case "2" -> showStatus(sessionId);
                    case "3" -> showCheckStatus(sessionId);
                    case "4" -> getOwnerLink(sessionId);
                    case "5" -> revokeInvites(sessionId);
                    case "6" -> downloadDocuments(sessionId);
                    case "7" -> downloadAuditReport(sessionId);
                    case "8" -> showSessionMetadata(sessionId);
                    case "9" -> showExternUsers(sessionId);
                    case "10" -> showExternInfos(sessionId);
                    case "11" -> resendReminder(sessionId);
                    case "12" -> {
                        purgeSession(sessionId);
                        return;
                    }
                    case "0" -> {
                        poller.unwatchSession(sessionId);
                        System.out.println("Bye!");
                        return;
                    }
                    default -> System.out.println("Invalid choice.");
                }
            } catch (Exception e) {
                System.out.println("Error: " + e.getMessage());
            }
        }
    }

    // --- Menu actions ---

    private void inviteUsers(Scanner scanner, String sessionId) throws Exception {
        System.out.println("\nInvite external signers:");
        System.out.print("  Email for Signer1: ");
        String email1 = scanner.nextLine().trim();
        System.out.print("  Email for Signer2: ");
        String email2 = scanner.nextLine().trim();

        System.out.println("  Delivery method:");
        System.out.println("    1) Email");
        System.out.println("    2) SMS");
        System.out.println("    3) Link only (no notification)");
        System.out.print("  Choice: ");
        String deliveryChoice = scanner.nextLine().trim();

        // Check which roles still have unsigned fields
        JsonNode status = apiClient.getStatus(sessionId);
        Set<String> completedRoles = getCompletedRoles(status);

        ObjectNode externConfig = mapper.createObjectNode();
        externConfig.put("sessionid", sessionId);

        ArrayNode users = mapper.createArrayNode();
        if (completedRoles.contains("Signer1")) {
            System.out.println("  Signer1: all fields already signed - skipping");
        } else {
            users.add(buildExternUser(email1, "Signer1", deliveryChoice, scanner));
        }
        if (completedRoles.contains("Signer2")) {
            System.out.println("  Signer2: all fields already signed - skipping");
        } else {
            users.add(buildExternUser(email2, "Signer2", deliveryChoice, scanner));
        }

        if (users.isEmpty()) {
            System.out.println("\n  All roles have completed signing. Nothing to invite.");
            return;
        }

        externConfig.set("externUsers", users);

        System.out.println("\n  Sending invitations for " + users.size() + " user(s)...");
        JsonNode result = apiClient.beginExtern(externConfig);
        System.out.println("  Invitations sent successfully.");
        System.out.println("  Response:");
        System.out.println("  " + mapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(result).replace("\n", "\n  "));
    }

    private ObjectNode buildExternUser(String email, String role, String deliveryChoice,
                                       Scanner scanner) {
        ObjectNode user = mapper.createObjectNode();
        // recipient is always required - generate a placeholder if not provided
        if (email.isEmpty()) {
            email = System.currentTimeMillis() + "@example.invalid";
        }
        user.put("recipient", email);
        user.put("realName", email);
        ArrayNode roles = mapper.createArrayNode();
        roles.add(role);
        user.set("roles", roles);

        switch (deliveryChoice) {
            case "1" -> {
                user.put("sendEmails", true);
                user.put("sendSMS", false);
            }
            case "2" -> {
                user.put("sendEmails", false);
                user.put("sendSMS", true);
                System.out.print("  Phone number for " + role + ": ");
                String phone = scanner.nextLine().trim();
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

    private void showStatus(String sessionId) throws Exception {
        JsonNode status = apiClient.getStatus(sessionId);

        System.out.println("\n=== Session Status ===");
        System.out.println("  Session:   " + sessionId);
        System.out.println("  User:      " + status.path("userid").asText("-"));
        System.out.println("  TAN:       " + status.path("tan").asText("-"));
        System.out.println("  Completed: " + status.path("sucessfullyCompleted").asBoolean(false));

        // Signature counts
        System.out.println("  Total signature fields:    " + status.path("numberOfSignaturesFields").asInt(0));
        System.out.println("  Mandatory fields/sigs:     "
                + status.path("numberOfMandatorySignatureFields").asInt(0) + " / "
                + status.path("numberOfMandatorySignatures").asInt(0));
        System.out.println("  Optional fields/sigs:      "
                + status.path("numberOfOptionalSignatureFields").asInt(0) + " / "
                + status.path("numberOfOptionalSignatures").asInt(0));

        // Documents
        JsonNode docs = status.path("documents");
        if (docs.isArray()) {
            System.out.println("  Documents: " + docs.size());
            for (JsonNode doc : docs) {
                System.out.println("    - " + doc.path("displayname").asText("unnamed")
                        + " (docid: " + doc.path("docid").asText("?") + ")");
            }
        }

        // Signature fields
        JsonNode sigFields = status.path("signaturFieldsStatusList");
        if (sigFields.isArray()) {
            int signedCount = 0;
            System.out.println("  Signature fields:");
            for (JsonNode field : sigFields) {
                boolean signed = field.path("signed").asBoolean(false);
                boolean mandatory = field.path("mandatory").asBoolean(false);
                if (signed) signedCount++;
                String indicator = signed ? "[x]" : "[ ]";
                String mFlag = mandatory ? " *mandatory*" : "";
                System.out.println("    " + indicator + " "
                        + field.path("displayname").asText(field.path("name").asText("?"))
                        + " (role: " + field.path("role").asText("?") + ")" + mFlag);
            }
            System.out.println("  Signed: " + signedCount + " / " + sigFields.size());
        }
    }

    private void showCheckStatus(String sessionId) throws Exception {
        JsonNode status = apiClient.checkStatus(sessionId);
        System.out.println("\n=== Check Status (/get/checkstatus) ===");
        System.out.println(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(status));
    }

    private void getOwnerLink(String sessionId) throws Exception {
        String jwt = apiClient.createOwnerSSOLink(apiUsername);
        // Build the clickable entry link: baseUrl/index?jwt=...&sessionid=...
        String entryUrl = apiClient.getBaseUrl() + "/index?jwt=" + jwt + "&sessionid=" + sessionId;
        System.out.println("\n  Owner Entry Link:");
        System.out.println("  " + entryUrl);
    }

    private void revokeInvites(String sessionId) throws Exception {
        System.out.println("\n  Revoking all external invitations...");
        JsonNode result = apiClient.revokeExtern(sessionId);
        System.out.println("  Result: " + result.path("status").asText("unknown"));
    }

    private void downloadDocuments(String sessionId) throws Exception {
        System.out.println("\n  Downloading documents...");
        byte[] zipBytes = apiClient.downloadDocumentsArchive(sessionId);
        Path outPath = Path.of("documents_" + sessionId + ".zip");
        Files.write(outPath, zipBytes);
        System.out.println("  Saved to: " + outPath + " (" + zipBytes.length + " bytes)");
    }


    private void downloadAuditReport(String sessionId) throws Exception {
        System.out.println("\n  Downloading audit report...");
        byte[] pdfBytes = apiClient.downloadAuditReport(sessionId);
        Path outPath = Path.of("audit_" + sessionId + ".pdf");
        Files.write(outPath, pdfBytes);
        System.out.println("  Saved to: " + outPath + " (" + pdfBytes.length + " bytes)");
    }

    private void showSessionMetadata(String sessionId) throws Exception {
        JsonNode metadata = apiClient.getSessionMetadata(sessionId);
        System.out.println("\n=== Session Metadata ===");
        System.out.println(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(metadata));
    }

    private void showExternUsers(String sessionId) throws Exception {
        JsonNode result = apiClient.getExternUsers(sessionId);
        System.out.println("\n=== Extern Users ===");
        System.out.println(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(result));
    }

    private void showExternInfos(String sessionId) throws Exception {
        JsonNode result = apiClient.getExternInfos(sessionId);
        System.out.println("\n=== Extern Infos ===");
        System.out.println(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(result));
    }

    private void purgeSession(String sessionId) throws Exception {
        System.out.println("\n  Purging session...");
        apiClient.purgeSession(sessionId);
        System.out.println("  Session purged: " + sessionId);
    }

    private void resendReminder(String sessionId) throws Exception {
        // Auto-determine if extern users exist
        System.out.println("\n  Checking for external users...");
        JsonNode status = apiClient.getStatus(sessionId);
        JsonNode externUsers = status.path("externUsers");

        if (externUsers.isArray() && !externUsers.isEmpty()) {
            System.out.println("  Found " + externUsers.size()
                    + " external user(s) - sending reminder...");
            JsonNode result = apiClient.sendReminder(sessionId);
            System.out.println("  Reminder sent. Result: "
                    + result.path("status").asText("unknown"));
        } else {
            System.out.println("  No external users found. Reminder not applicable.");
            System.out.println("  (Reminders are sent to external/invited signers only)");
        }
    }

    /**
     * Returns the set of roles where all signature fields have been signed.
     */
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
        // A role is completed if it has fields and all are signed
        Set<String> completed = new LinkedHashSet<>();
        for (var entry : roleFields.entrySet()) {
            if (!entry.getValue().isEmpty() && entry.getValue().stream().allMatch(b -> b)) {
                completed.add(entry.getKey());
            }
        }
        return completed;
    }

    // --- Session config builder ---

    private ObjectNode buildSessionConfig() {
        ObjectNode config = mapper.createObjectNode();

        // --- Core session properties ---
        config.put("foruser", "getting-started-" + System.currentTimeMillis());
        config.put("userFullName", "Chris Signlord");
        config.put("userEmail", apiUsername);
        config.put("displayname", "Getting Started - Test Contract");

        // --- Signing behavior ---
        config.put("makeFieldsMandatory", true);
        config.put("signatureLevel", "AES");            // SES | AES | AESSMS | QES
        config.put("embedBiometricData", true);
        config.put("writeAuditReport", true);

        // --- Auto-finish: skip confirmation dialogs ---
        ObjectNode guiProperties = mapper.createObjectNode();
        guiProperties.put("guiFertigbuttonSkipModalDialog", true);       // owner: skip finish dialog
        guiProperties.put("guiFertigbuttonSkipModalDialogExtern", true); // extern: skip finish dialog
        guiProperties.put("guiFertigbuttonModalDialogExternSkipSendMail", true); // extern: skip send-mail dialog
        guiProperties.put("guiAfterSignOpenNextSignatureField", true);   // auto-advance to next field

        // --- Logos ---
        // App icon (30x30, shown in editor toolbar)
        // guiProperties.put("message.start.logo.url.editor.desktop", "https://example.test/logo-icon.svg");
        // Mail header (120x60, shown in invitation emails)
        // guiProperties.put("message.mt.header.image", "https://example.test/logo-mail.svg");
        config.set("guiProperties", guiProperties);
        // Login logo (314x100, shown on extern signing login page)
        // config.put("logoExtern", "https://example.test/logo-login.svg");

        // --- Branding CSS ---
        // Generate a complete color scheme from two base colors (primary + accent).
        // The CSS uses color-mix() to derive all palette shades automatically.
        // Uncomment and set your brand colors:
        // config.put("externalPropertiesURL", buildBrandingCss("#2563eb", "#f59e0b"));

        // --- Thank-you page shown to signer after completion ---
        if (thankyouUrl != null && !thankyouUrl.isEmpty()) {
            config.put("callbackURL", thankyouUrl);
        }

        // --- Webhook configuration (if URL is set) ---
        if (webhookCallbackUrl != null && !webhookCallbackUrl.isEmpty()) {
            config.put("serverSidecallbackURL", webhookCallbackUrl);
            config.put("serversideCallbackMethod", "POST");
            config.put("serversideCallbackContentType", "application/json");
        }

        // --- Document definition ---
        ArrayNode documents = mapper.createArrayNode();
        ObjectNode doc = mapper.createObjectNode();
        doc.put("id", "doc1");
        doc.put("displayname", "Test Contract");
        doc.put("mustbesigned", true);
        documents.add(doc);
        config.set("documents", documents);

        return config;
    }

    /**
     * Generates a complete inSign branding CSS from two base colors.
     * The CSS uses color-mix() to derive all palette shades - the inSign
     * farbpalette var() cascade handles the rest automatically.
     *
     * @param primary  Primary/brand color (hex), e.g. "#2563eb"
     * @param accent   Accent color (hex), e.g. "#f59e0b"
     * @return single-line CSS string for the externalPropertiesURL property
     */
    private String buildBrandingCss(String primary, String accent) {
        String dark = "color-mix(in srgb, " + primary + ", black 40%)";
        String error = "#dc2626";
        String success = "#16a34a";
        String surface = "#f3f4f6";
        String text = "#1f2937";

        String css = ":root {"
                // Primary palette - all shades derived from one color
                + " --insignBlue: " + primary + ";"
                + " --800: color-mix(in srgb, var(--insignBlue), white 30%);"
                + " --insignNavy: color-mix(in srgb, var(--insignBlue), black 20%);"
                + " --insignModernBlue: color-mix(in srgb, var(--insignBlue), white 30%);"
                + " --insignMediumBlue: color-mix(in srgb, var(--insignBlue), white 25%);"
                + " --insignLightBlue2: color-mix(in srgb, var(--insignBlue), white 40%);"
                + " --insignLighterBlue: color-mix(in srgb, var(--insignBlue), white 50%);"
                + " --insignUltraLightBlue: color-mix(in srgb, var(--insignBlue), white 85%);"
                + " --insignLightestBlue: color-mix(in srgb, var(--insignBlue), white 75%);"
                + " --insignHighlightBlue: color-mix(in srgb, var(--insignBlue), white 80%);"
                + " --insignHigherLightBlue: color-mix(in srgb, var(--insignBlue), white 90%);"
                // Accent palette
                + " --insignOrange: " + accent + ";"
                + " --insignBlueInverted: color-mix(in srgb, var(--insignOrange), white 25%);"
                + " --insignLightOrange: color-mix(in srgb, var(--insignOrange), white 25%);"
                + " --insignYellow: color-mix(in srgb, var(--insignOrange), white 40%);"
                + " --insignAlternativeYellow: var(--insignOrange);"
                // Surface / grey palette
                + " --insignLigtherGrey: " + surface + ";"
                + " --insignLightestGrey: color-mix(in srgb, var(--insignLigtherGrey), white 30%);"
                + " --insignLightestGrey2: color-mix(in srgb, var(--insignLigtherGrey), white 50%);"
                + " --insignLightGrey: color-mix(in srgb, var(--insignLigtherGrey), black 5%);"
                + " --insignGrey: color-mix(in srgb, var(--insignLigtherGrey), black 8%);"
                + " --insignGrey2: color-mix(in srgb, var(--insignLigtherGrey), white 15%);"
                + " --insignGrey3: color-mix(in srgb, var(--insignLigtherGrey), var(--insignBlue) 3%);"
                + " --insignGrey4: color-mix(in srgb, var(--insignLigtherGrey), black 18%);"
                + " --insignGrey5: color-mix(in srgb, var(--insignLigtherGrey), black 12%);"
                + " --insignMiddleGrey: color-mix(in srgb, var(--insignLigtherGrey), black 25%);"
                + " --insignMediumGrey: color-mix(in srgb, var(--insignLigtherGrey), black 40%);"
                + " --insignMediumGrey2: color-mix(in srgb, var(--insignLigtherGrey), black 55%);"
                + " --insignDarkGrey: color-mix(in srgb, var(--insignLigtherGrey), black 40%);"
                + " --insignDarkerGrey: color-mix(in srgb, var(--insignLigtherGrey), black 50%);"
                + " --insignDarkestGrey: color-mix(in srgb, var(--insignLigtherGrey), black 55%);"
                // Text / dark tones
                + " --insignDarkBlack: " + dark + ";"
                + " --insignBlack: " + text + ";"
                + " --insignLightBlack: color-mix(in srgb, var(--insignBlack), white 25%);"
                + " --insignAlternativeBlack: var(--insignBlack);"
                + " --insignLightDarkBlack: color-mix(in srgb, var(--insignBlack), black 10%);"
                // Error / success
                + " --insignRed: " + error + ";"
                + " --insignLightRed: color-mix(in srgb, var(--insignRed), white 30%);"
                + " --insignLightestRed: color-mix(in srgb, var(--insignRed), white 75%);"
                + " --insignLighterRed: color-mix(in srgb, var(--insignRed), white 55%);"
                + " --insignGreen: color-mix(in srgb, " + success + ", white 25%);"
                + " --insignLightGreen: color-mix(in srgb, " + success + ", white 50%);"
                + " --insignMiddleGreen: " + success + ";"
                + " --insignDarkGreen: color-mix(in srgb, " + success + ", black 15%);"
                + " }";
        return css;
    }
}
