import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import static java.nio.charset.StandardCharsets.UTF_8;

public class InSignApiCall {
    static final String BASE = "{{BASE_URL}}";
    static final String AUTH = "Basic " + Base64.getEncoder()
        .encodeToString("{{USERNAME}}:{{PASSWORD}}".getBytes(UTF_8));
    static final HttpClient http = HttpClient.newHttpClient();
    static final ObjectMapper mapper = new ObjectMapper();

    public static void main(String[] args) throws Exception {
{{#if HAS_BODY}}
        // Build request body
{{BODY_BUILD}}
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
        // 1) {{METHOD}} {{PATH}}
        var req = HttpRequest.newBuilder(URI.create("{{URL}}"))
            .header("Authorization", AUTH)
{{#if HAS_BODY}}
            .header("Content-Type", "{{CONTENT_TYPE}}")
            .{{METHOD}}(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
{{/if}}
{{#unless HAS_BODY}}
            .{{METHOD}}()
{{/unless}}
            .build();
        var res = http.send(req, HttpResponse.BodyHandlers.ofString());
        System.out.println("HTTP " + res.statusCode());
        System.out.println(res.body());
        if (res.statusCode() != 200) {
            System.err.println("FAILED: expected HTTP 200, got " + res.statusCode());
            System.exit(1);
        }
        var json = mapper.readTree(res.body());

        // 2) Get status
        String sid = json.path("sessionid").asText(null);
        if (sid != null) {
            var r2 = post("/get/status?sessionid=" + sid);
            System.out.println("\n=== Status (HTTP " + r2.statusCode() + ") ===");
            System.out.println(r2.body());
            if (r2.statusCode() != 200) {
                System.err.println("FAILED: get/status returned HTTP " + r2.statusCode());
                System.exit(1);
            }
            var status = mapper.readTree(r2.body());

            // 3) Download document (first doc)
            String docId = status.at("/documentData/0/docid").asText("0");
            var r3 = http.send(HttpRequest.newBuilder(URI.create(BASE + "/get/document?sessionid=" + sid + "&docid=" + docId))
                .header("Authorization", AUTH).POST(HttpRequest.BodyPublishers.noBody()).build(),
                HttpResponse.BodyHandlers.ofByteArray());
            System.out.println("\n=== Download (HTTP " + r3.statusCode() + ") ===");
            if (r3.statusCode() == 200) {
                Files.write(Path.of("document.pdf"), r3.body());
                System.out.println("Saved document.pdf (" + r3.body().length + " bytes)");
            } else {
                System.err.println("Download failed: " + new String(r3.body(), UTF_8));
                System.exit(1);
            }
        }
    }

    static HttpResponse<String> post(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create(BASE + path))
            .header("Authorization", AUTH).POST(HttpRequest.BodyPublishers.noBody()).build(),
            HttpResponse.BodyHandlers.ofString());
    }
}
