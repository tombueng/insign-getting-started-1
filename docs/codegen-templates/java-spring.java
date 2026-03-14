{{#if HAS_BODY}}
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

{{/if}}
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class InSignApiCall {
    private static final String BASE_URL = "{{BASE_URL}}";
    private static RestClient client;

    public static void main(String[] args) throws Exception {
        String auth = "{{USERNAME}}:{{PASSWORD}}";
        String encoded = Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8));

        client = RestClient.builder()
            .baseUrl(BASE_URL)
            .defaultHeader("Authorization", "Basic " + encoded)
            .build();

{{#if HAS_BODY}}
        // Build request body using Jackson
        ObjectMapper mapper = new ObjectMapper();
{{BODY_BUILD}}

{{/if}}
        ResponseEntity<String> response = client
            .{{METHOD_LOWER}}()
            .uri("{{PATH}}")
{{#if HAS_BODY}}
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapper.writeValueAsString(body))
{{/if}}
            .retrieve()
            .toEntity(String.class);

        System.out.println("HTTP Status: " + response.getStatusCode());
        System.out.println("Response: " + response.getBody());

        // Extract sessionid and call helper methods
        ObjectMapper mapper2 = new ObjectMapper();
        var json = mapper2.readTree(response.getBody());
        String sessionId = json.has("sessionid") ? json.get("sessionid").asText() : null;
        if (sessionId != null) {
            getStatus(sessionId);
            downloadDocument(sessionId);
        }
    }

    /** Check session status */
    static void getStatus(String sessionId) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode body = mapper.createObjectNode();
        body.put("sessionid", sessionId);

        ResponseEntity<String> response = client
            .post()
            .uri("/get/status")
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapper.writeValueAsString(body))
            .retrieve()
            .toEntity(String.class);

        var status = mapper.readTree(response.getBody());
        System.out.println("\n=== Session Status ===");
        System.out.println("Successfully completed: " + status.path("successfullycompleted").asBoolean());
        System.out.println("Signatures done: " + status.path("numberofsignaturesdone").asInt());
        System.out.println("Signatures missing: " + status.path("numberofsignaturesmissing").asInt());
    }

    /** Download signed document(s) and save to disk */
    static void downloadDocument(String sessionId) throws Exception {
        byte[] bytes = client
            .post()
            .uri("/get/documents/download")
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.ALL)
            .body("{\"sessionid\": \"" + sessionId + "\"}")
            .retrieve()
            .body(byte[].class);

        java.nio.file.Files.write(java.nio.file.Path.of("signed-document.pdf"), bytes);
        System.out.println("\nDocument saved to: signed-document.pdf (" + bytes.length + " bytes)");
    }
}
