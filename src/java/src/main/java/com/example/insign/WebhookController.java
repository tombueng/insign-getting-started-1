package com.example.insign;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Receives inSign webhook callbacks (serverside callbacks).
 *
 * inSign sends callbacks as GET (default) or POST requests with these query parameters:
 *   - sessionid:    Session the event was fired for
 *   - eventid:      Event type (see below)
 *   - data:         Optional JSON-encoded additional data (depends on event)
 *   - issued:       Timestamp in millis when the callback was created
 *   - docid:        Document ID (on DOCUMENTCHANGED, SIGNATURESDELETEDDOC)
 *   - externtoken:  Token identifying the extern user (if applicable)
 *   - type:         On VORGANGABGELEHNT/EXTERN: "gdpr", "rejected" or "clearance"
 *
 * Event IDs:
 *   SIGNATURERSTELLT                     - A single signature was provided
 *   EXTERNBEARBEITUNGFERTIG              - All external users finished processing
 *   EXTERNBEARBEITUNGSTART               - External processing started
 *   VORGANGABGESCHLOSSEN                 - Session completed (owner set status to completed)
 *   SESSIONREMINDER                      - Owner reminder fired
 *   EXTERNREMINDER                       - External user reminder fired
 *   SINGLEEXTERNALUSERCOMPLETEDPROCESSING - One extern user completed
 *   VORGANGVERLASSEN                     - Process completed by owner (ignoring sign status)
 *   VORGANGABGELEHNT                     - Owner declined
 *   VORGANGABGELEHNTEXTERN               - External user declined
 *   SIGNATURESDELETEDDOC                 - Signatures deleted for single document
 *   SIGNATURESDELETEDSESSION             - Signatures deleted for whole process
 *   DOCUMENTCHANGED                      - Changes were made to a document
 *   PROCESSDELETEDBYAGE                  - Process deleted after maxageindays
 *   EXTERNEXPIRED                        - Process retrieved by extern autofinish
 *   VORGANGERSTELLT                      - Process created, all documents uploaded
 *   COMMUNICATIONERROR                   - Error sending email or SMS
 *   SIGNATUREERROR                       - Error during signing
 *   DELETIONWARNING                      - Session will be deleted for inactivity
 *   EXTERNABORT                          - Signature request cancelled, returned to owner
 *   PROCESSRENAMED                       - Process was renamed
 *   DOCUMENTRENAMED                      - Document was renamed
 *   CHANGEOWNER                          - Process owner changed
 *   PROCESSDELETED                       - Process was deleted manually
 *   DOCUMENTDELETED                      - Document was deleted
 *
 * Configure your inSign session with:
 *   serverSidecallbackURL = "https://your-public-url/webhook"
 *   serversideCallbackMethod = "POST"        (default is GET)
 *   serversideCallbackContentType = "application/json"  (for POST with JSON body)
 *
 * Use ngrok or similar to expose this endpoint during development.
 * Must respond with HTTP 200, otherwise inSign will retry.
 */
@RestController
public class WebhookController {

    private final ObjectMapper mapper = new ObjectMapper();
    private final SessionStatusTracker tracker;

    public WebhookController(SessionStatusTracker tracker) {
        this.tracker = tracker;
    }

    /**
     * Handles POST with JSON body (when serversideCallbackMethod=POST and
     * serversideCallbackContentType=application/json).
     * The JSON body contains: sessionid, eventid, data, issued, docid, externtoken, type.
     */
    @PostMapping(value = "/webhook", consumes = "application/json")
    public ResponseEntity<String> receiveWebhookJson(@RequestBody String body) {
        try {
            ObjectNode event = (ObjectNode) mapper.readTree(body);
            String sessionId = event.path("sessionid").asText(null);
            String eventId = event.path("eventid").asText("UNKNOWN");

            printWebhookReceived(sessionId, eventId, event);

            if (sessionId != null) {
                tracker.onWebhookReceived(sessionId, event);
            }
        } catch (Exception e) {
            System.out.println("[Webhook] Failed to parse JSON body: " + e.getMessage());
            System.out.println("[Webhook] Body: " + body);
        }
        return ResponseEntity.ok("OK");
    }

    /**
     * Handles GET callbacks (default inSign behavior) and POST with form/query params.
     * Parameters come as query params appended to the callback URL.
     */
    @RequestMapping(value = "/webhook", method = {RequestMethod.GET})
    public ResponseEntity<String> receiveWebhookParams(
            @RequestParam(value = "sessionid", required = false) String sessionId,
            @RequestParam(value = "eventid", required = false) String eventId,
            @RequestParam(value = "data", required = false) String data,
            @RequestParam(value = "issued", required = false) String issued,
            @RequestParam(value = "docid", required = false) String docId,
            @RequestParam(value = "externtoken", required = false) String externToken,
            @RequestParam(value = "type", required = false) String type) {

        ObjectNode event = mapper.createObjectNode();
        if (sessionId != null) event.put("sessionid", sessionId);
        event.put("eventid", eventId != null ? eventId : "UNKNOWN");
        if (data != null) event.put("data", data);
        if (issued != null) event.put("issued", issued);
        if (docId != null) event.put("docid", docId);
        if (externToken != null) event.put("externtoken", externToken);
        if (type != null) event.put("type", type);

        printWebhookReceived(sessionId, eventId, event);

        if (sessionId != null) {
            tracker.onWebhookReceived(sessionId, event);
        }

        return ResponseEntity.ok("OK");
    }

    private void printWebhookReceived(String sessionId, String eventId, ObjectNode event) {
        System.out.println("\n========== WEBHOOK RECEIVED ==========");
        System.out.println("  Event:   " + eventId);
        System.out.println("  Session: " + sessionId);
        String docId = event.path("docid").asText(null);
        String data = event.path("data").asText(null);
        String issued = event.path("issued").asText(null);
        String externToken = event.path("externtoken").asText(null);
        String type = event.path("type").asText(null);
        if (docId != null) System.out.println("  DocID:   " + docId);
        if (data != null) System.out.println("  Data:    " + data);
        if (issued != null) System.out.println("  Issued:  " + issued);
        if (externToken != null) System.out.println("  Extern:  " + externToken);
        if (type != null) System.out.println("  Type:    " + type);
        printEventDescription(eventId);
        System.out.println("=======================================\n");
    }

    private void printEventDescription(String eventId) {
        if (eventId == null) return;
        String desc = switch (eventId) {
            case "SIGNATURERSTELLT" -> "A signature was provided";
            case "EXTERNBEARBEITUNGFERTIG" -> "All external users finished";
            case "EXTERNBEARBEITUNGSTART" -> "External processing started";
            case "VORGANGABGESCHLOSSEN" -> "Session successfully completed";
            case "SESSIONREMINDER" -> "Owner reminder fired";
            case "EXTERNREMINDER" -> "External user reminder fired";
            case "SINGLEEXTERNALUSERCOMPLETEDPROCESSING" -> "One extern user completed";
            case "VORGANGVERLASSEN" -> "Process completed by owner (ignoring sign status)";
            case "VORGANGABGELEHNT" -> "Owner declined";
            case "VORGANGABGELEHNTEXTERN" -> "External user declined";
            case "SIGNATURESDELETEDDOC" -> "Signatures deleted for document";
            case "SIGNATURESDELETEDSESSION" -> "Signatures deleted for whole process";
            case "DOCUMENTCHANGED" -> "Document was changed";
            case "PROCESSDELETEDBYAGE" -> "Process deleted (maxageindays)";
            case "EXTERNEXPIRED" -> "Extern process retrieved by autofinish";
            case "VORGANGERSTELLT" -> "Process created, all documents uploaded";
            case "COMMUNICATIONERROR" -> "Error sending email or SMS";
            case "SIGNATUREERROR" -> "Error during signing";
            case "DELETIONWARNING" -> "Session will be deleted for inactivity";
            case "EXTERNABORT" -> "Signature request cancelled, returned to owner";
            case "PROCESSRENAMED" -> "Process was renamed";
            case "DOCUMENTRENAMED" -> "Document was renamed";
            case "CHANGEOWNER" -> "Process owner changed";
            case "PROCESSDELETED" -> "Process was deleted manually";
            case "DOCUMENTDELETED" -> "Document was deleted";
            default -> "Unknown event";
        };
        System.out.println("  --> " + desc);
    }
}
