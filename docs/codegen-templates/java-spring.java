{{#if HAS_BODY}}
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

{{/if}}
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

public class InSignApiCall {
    static RestClient client;

    public static void main(String[] args) throws Exception {
        client = RestClient.builder()
            .baseUrl("{{BASE_URL}}")
            .defaultHeader("Authorization", "Basic " + Base64.getEncoder()
                .encodeToString("{{USERNAME}}:{{PASSWORD}}".getBytes(StandardCharsets.UTF_8)))
            .build();

{{#if HAS_BODY}}
        // Build request body
        ObjectMapper mapper = new ObjectMapper();
{{BODY_BUILD}}
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
        // 1) {{METHOD}} {{PATH}}
        ResponseEntity<String> res = client.{{METHOD_LOWER}}()
            .uri("{{PATH}}")
{{#if HAS_BODY}}
            .contentType(MediaType.APPLICATION_JSON)
            .body(mapper.writeValueAsString(body))
{{/if}}
            .retrieve().toEntity(String.class);
        System.out.println("HTTP " + res.getStatusCode().value());
        System.out.println(res.getBody());

        // 2) Get status
        var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(res.getBody());
        String sid = json.path("sessionid").asText(null);
        if (sid != null) {
            ResponseEntity<String> r2 = client.post().uri("/get/status?sessionid=" + sid)
                .retrieve().toEntity(String.class);
            System.out.println("\n=== Status (HTTP " + r2.getStatusCode().value() + ") ===");
            System.out.println(r2.getBody());

            // 3) Download document (first doc)
            var statusJson = new com.fasterxml.jackson.databind.ObjectMapper().readTree(r2.getBody());
            String docId = statusJson.at("/documentData/0/docid").asText("0");
            byte[] doc = client.post()
                .uri("/get/document?sessionid=" + sid + "&docid=" + docId)
                .retrieve().body(byte[].class);
            Files.write(Path.of("document.pdf"), doc);
            System.out.println("Saved document.pdf (" + doc.length + " bytes)");
        }
    }
}
