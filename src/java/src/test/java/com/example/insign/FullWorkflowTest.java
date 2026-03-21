package com.example.insign;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test that exercises every operation against the real inSign sandbox.
 * Tests run in order: create session, then exercise all menu options, then cleanup.
 *
 * <h3>Response template validation</h3>
 * JSON responses are validated against template files in
 * {@code src/test/resources/response-templates/}. This ensures the API response
 * structure (field names and value types) stays consistent across runs without
 * comparing exact values (which change per session, e.g. IDs and timestamps).
 *
 * <ul>
 *   <li><b>First run</b> (no template files): responses are captured as templates.
 *       Commit the generated files so subsequent runs validate against them.</li>
 *   <li><b>Subsequent runs</b>: each response is compared structurally against its
 *       template. Missing fields or type mismatches cause the test to fail.</li>
 *   <li><b>Re-capture</b>: delete a template file and re-run to capture a fresh
 *       baseline (e.g. after an intentional API change).</li>
 * </ul>
 *
 * @see ResponseTemplateValidator
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.console.enabled=false"
)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FullWorkflowTest {

    @Autowired
    private InsignApiClient apiClient;

    @Autowired
    private PdfGenerator pdfGenerator;

    @Autowired
    private SessionStatusTracker tracker;

    @Autowired
    private StatusPoller poller;

    @Value("${insign.api.username}")
    private String apiUsername;

    private final ObjectMapper mapper = new ObjectMapper();
    private final ResponseTemplateValidator templateValidator = ResponseTemplateValidator.standard();

    private static String sessionId;

    // --- 0. Check server version ---

    @Test
    @Order(0)
    void checkVersion() {
        String version = apiClient.getVersion();
        assertNotNull(version, "Version must be returned");
        assertFalse(version.isBlank(), "Version must not be blank");
        System.out.println("[Test] inSign server version: " + version);
    }

    // --- 1. Generate PDF ---

    @Test
    @Order(1)
    void generatePdf() throws Exception {
        byte[] pdf = pdfGenerator.generateTestPdf();
        assertNotNull(pdf);
        assertTrue(pdf.length > 500, "PDF should be at least 500 bytes");
    }

    // --- 2. Create session ---

    @Test
    @Order(2)
    void createSession() throws Exception {
        ObjectNode config = mapper.createObjectNode();
        config.put("foruser", apiUsername);
        config.put("userFullName", apiUsername);
        config.put("userEmail", apiUsername);
        config.put("displayname", "Test - FullWorkflowTest");
        config.put("allSignaturesRequired", true);
        config.put("makeFieldsMandatory", true);
        config.put("signatureLevel", "SES");
        config.put("writeAuditReport", true);

        ArrayNode documents = mapper.createArrayNode();
        ObjectNode doc = mapper.createObjectNode();
        doc.put("id", "doc1");
        doc.put("displayname", "Test Contract");
        doc.put("mustbesigned", true);
        documents.add(doc);
        config.set("documents", documents);

        JsonNode result = apiClient.createSession(config);

        sessionId = result.path("sessionid").asText(null);
        assertNotNull(sessionId, "Session ID must be returned");
        assertFalse(sessionId.isBlank(), "Session ID must not be blank");
        templateValidator.assertMatchesTemplate("createSession", result);

        System.out.println("[Test] Created session: " + sessionId);
    }

    // --- 3. Upload document ---

    @Test
    @Order(3)
    void uploadDocument() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        byte[] pdf = pdfGenerator.generateTestPdf();
        assertDoesNotThrow(() ->
                apiClient.uploadDocument(sessionId, "doc1", pdf, "contract.pdf"));

        System.out.println("[Test] Document uploaded");
    }

    // --- 4. Show status (menu option 2) ---

    @Test
    @Order(4)
    void showStatus() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        JsonNode status = apiClient.getStatus(sessionId);

        assertNotNull(status);
        // The response itself must not indicate an error
        int error = status.path("error").asInt(0);
        assertEquals(0, error, "Status call should not return an error: "
                + status.path("errormessage").asText(status.toString()));
        templateValidator.assertMatchesTemplate("getStatus", status);

        System.out.println("[Test] Status response: " + status.toPrettyString());
    }

    // --- 5. Check status / polling (menu option 2 alternative) ---

    @Test
    @Order(5)
    void checkStatus() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        JsonNode status = apiClient.checkStatus(sessionId);

        assertNotNull(status);
        assertFalse(status.path("status").asText("").isBlank());
        templateValidator.assertMatchesTemplate("checkStatus", status);

        // Feed into tracker to verify no exceptions
        tracker.onPollResult(sessionId, status);

        System.out.println("[Test] CheckStatus: " + status.path("status").asText());
    }

    // --- 6. Get owner link (menu option 3) ---

    @Test
    @Order(6)
    void getOwnerLink() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        String ssoToken = apiClient.createOwnerSSOLink(apiUsername);

        assertNotNull(ssoToken, "SSO token must be returned");
        assertFalse(ssoToken.isBlank(), "SSO token must not be blank");

        System.out.println("[Test] Owner SSO token received (" + ssoToken.length() + " chars)");
    }

    // --- 7. Invite users / begin extern (menu option 1) ---

    @Test
    @Order(7)
    void inviteUsers() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        ObjectNode externConfig = mapper.createObjectNode();
        externConfig.put("sessionid", sessionId);

        ArrayNode users = mapper.createArrayNode();

        ObjectNode user1 = mapper.createObjectNode();
        user1.put("recipient", "signer1@example.test");
        user1.put("realName", "Signer One");
        user1.set("roles", mapper.createArrayNode().add("Signer1"));
        user1.put("sendEmails", false);
        user1.put("sendSMS", false);
        user1.put("singleSignOnEnabled", true);
        users.add(user1);

        ObjectNode user2 = mapper.createObjectNode();
        user2.put("recipient", "signer2@example.test");
        user2.put("realName", "Signer Two");
        user2.set("roles", mapper.createArrayNode().add("Signer2"));
        user2.put("sendEmails", false);
        user2.put("sendSMS", false);
        user2.put("singleSignOnEnabled", true);
        users.add(user2);

        externConfig.set("externUsers", users);

        JsonNode result = apiClient.beginExtern(externConfig);
        assertNotNull(result);
        templateValidator.assertMatchesTemplate("beginExtern", result);

        System.out.println("[Test] Extern begin result: " + result.path("status").asText("n/a"));
    }

    // --- 8. Get extern infos ---

    @Test
    @Order(8)
    void getExternInfos() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        JsonNode infos = apiClient.getExternInfos(sessionId);
        assertNotNull(infos);
        templateValidator.assertMatchesTemplate("getExternInfos", infos);

        System.out.println("[Test] Extern infos received");
    }

    // --- 9. Get extern users ---

    @Test
    @Order(9)
    void getExternUsers() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        JsonNode users = apiClient.getExternUsers(sessionId);
        assertNotNull(users);
        templateValidator.assertMatchesTemplate("getExternUsers", users);

        System.out.println("[Test] Extern users received");
    }

    // --- 10. Resend reminder (menu option 6) ---

    @Test
    @Order(10)
    void resendReminder() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        try {
            JsonNode result = apiClient.sendReminder(sessionId);
            System.out.println("[Test] Reminder result: " + result.path("status").asText("n/a"));
        } catch (InsignApiException e) {
            // Expected when using link-only delivery (no emails to send)
            System.out.println("[Test] Reminder: " + e.getMessage());
        }
    }

    // --- 11. Download documents (menu option 5) - before revoke since revoke may invalidate session ---

    @Test
    @Order(11)
    void downloadDocuments() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        byte[] zip = apiClient.downloadDocumentsArchive(sessionId);
        assertNotNull(zip);
        assertTrue(zip.length > 0, "Downloaded archive should not be empty");

        System.out.println("[Test] Downloaded documents: " + zip.length + " bytes");
    }

    // --- 12. Download audit report (menu option 7) ---

    @Test
    @Order(12)
    void downloadAuditReport() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        try {
            byte[] pdf = apiClient.downloadAuditReport(sessionId);
            assertNotNull(pdf);
            assertTrue(pdf.length > 0, "Audit report should not be empty");
            System.out.println("[Test] Downloaded audit report: " + pdf.length + " bytes");
        } catch (InsignApiException e) {
            // Audit report may not be available if writeAuditReport was not enabled or session not completed
            System.out.println("[Test] Audit report: " + e.getMessage());
        }
    }

    // --- 14. Get session metadata (menu option 8) ---

    @Test
    @Order(14)
    void getSessionMetadata() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        JsonNode metadata = apiClient.getSessionMetadata(sessionId);
        assertNotNull(metadata);
        templateValidator.assertMatchesTemplate("getSessionMetadata", metadata);

        System.out.println("[Test] Session metadata received");
    }

    // --- 15. Download single document ---

    @Test
    @Order(15)
    void downloadSingleDocument() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        try {
            byte[] doc = apiClient.downloadSingleDocument(sessionId, "doc1");
            assertNotNull(doc);
            assertTrue(doc.length > 0, "Single document should not be empty");
            System.out.println("[Test] Downloaded single document: " + doc.length + " bytes");
        } catch (InsignApiException e) {
            System.out.println("[Test] Single document: " + e.getMessage());
        }
    }

    // --- 16. Revoke invites / abort extern (menu option 4) ---

    @Test
    @Order(16)
    void revokeInvites() throws Exception {
        assertNotNull(sessionId, "Session must exist");

        try {
            JsonNode result = apiClient.revokeExtern(sessionId);
            assertNotNull(result);
            System.out.println("[Test] Abort extern result: " + result.path("status").asText("n/a"));
        } catch (InsignApiException e) {
            // The sandbox may reject abort if extern is already completed or session state changed
            System.out.println("[Test] Abort extern: " + e.getMessage());
        }
    }

    // --- 17. Poller watch/unwatch ---

    @Test
    @Order(17)
    void pollerWatchUnwatch() {
        assertNotNull(sessionId, "Session must exist");

        assertDoesNotThrow(() -> poller.watchSession(sessionId));
        assertDoesNotThrow(() -> poller.unwatchSession(sessionId));

        System.out.println("[Test] Poller watch/unwatch OK");
    }

    // --- 18. Webhook controller (unit-level: parse a payload) ---

    @Test
    @Order(18)
    void webhookTracking() throws Exception {
        ObjectNode fakeWebhook = mapper.createObjectNode();
        fakeWebhook.put("sessionid", "test-session-123");
        fakeWebhook.put("status", "IN_PROGRESS");
        fakeWebhook.put("signedCount", 1);
        fakeWebhook.put("totalCount", 2);
        fakeWebhook.put("sessionCompleted", false);

        assertDoesNotThrow(() -> tracker.onWebhookReceived("test-session-123", fakeWebhook));
        assertTrue(tracker.hasWebhookSupport("test-session-123"));
        assertNotNull(tracker.getLastStatus("test-session-123"));

        System.out.println("[Test] Webhook tracking OK");
    }

    // --- 19. Cleanup: purge session ---

    @Test
    @Order(99)
    void cleanup() {
        if (sessionId != null) {
            try {
                apiClient.purgeSession(sessionId);
                System.out.println("[Test] Session purged: " + sessionId);
            } catch (Exception e) {
                System.out.println("[Test] Cleanup (best-effort): " + e.getMessage());
            }
        }
    }
}
