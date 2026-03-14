import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.InputStreamReader;
{{#if HAS_BODY}}
import java.io.OutputStream;
{{/if}}
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class InSignApiCall {
    private static final String BASE_URL = "{{BASE_URL}}";
    private static final String AUTH_ENCODED = Base64.getEncoder().encodeToString(
        "{{USERNAME}}:{{PASSWORD}}".getBytes(StandardCharsets.UTF_8));

    public static void main(String[] args) throws Exception {
        ObjectMapper mapper = new ObjectMapper();

{{#if HAS_BODY}}
        // Build request body
{{BODY_BUILD}}

        String jsonBody = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(body);

{{/if}}
        // HTTP connection
        URL url = new URL("{{URL}}");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("{{METHOD}}");
        conn.setRequestProperty("Authorization", "Basic " + AUTH_ENCODED);
{{#if HAS_BODY}}
        conn.setRequestProperty("Content-Type", "{{CONTENT_TYPE}}");
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }
{{/if}}

        int status = conn.getResponseCode();
        System.out.println("HTTP Status: " + status);

        BufferedReader reader = new BufferedReader(
            new InputStreamReader(
                status >= 400 ? conn.getErrorStream() : conn.getInputStream(),
                StandardCharsets.UTF_8));
        StringBuilder response = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) response.append(line);
        reader.close();

        // Parse response JSON
        var json = mapper.readTree(response.toString());
        System.out.println(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(json));

        // Extract sessionid from response
        String sessionId = json.has("sessionid") ? json.get("sessionid").asText() : null;
        if (sessionId != null) {
            getStatus(mapper, sessionId);
            downloadDocument(mapper, sessionId);
        }
    }

    /** Check session status — prints completion flag and signature counts */
    static void getStatus(ObjectMapper mapper, String sessionId) throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("sessionid", sessionId);

        URL url = new URL(BASE_URL + "/get/status");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Authorization", "Basic " + AUTH_ENCODED);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(mapper.writeValueAsBytes(body));
        }

        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();

        var status = mapper.readTree(sb.toString());
        System.out.println("\n=== Session Status ===");
        System.out.println("Successfully completed: " + status.path("successfullycompleted").asBoolean());
        System.out.println("Signatures done: " + status.path("numberofsignaturesdone").asInt());
        System.out.println("Signatures missing: " + status.path("numberofsignaturesmissing").asInt());
    }

    /** Download signed document(s) and save to disk */
    static void downloadDocument(ObjectMapper mapper, String sessionId) throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("sessionid", sessionId);

        URL url = new URL(BASE_URL + "/get/documents/download");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Authorization", "Basic " + AUTH_ENCODED);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "*/*");
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(mapper.writeValueAsBytes(body));
        }

        if (conn.getResponseCode() == 200) {
            String fileName = "signed-document.pdf";
            String cd = conn.getHeaderField("Content-Disposition");
            if (cd != null && cd.contains("filename=")) {
                fileName = cd.split("filename=")[1].replace("\"", "").trim();
            }
            try (var is = conn.getInputStream();
                 var fos = new java.io.FileOutputStream(fileName)) {
                is.transferTo(fos);
            }
            System.out.println("\nDocument saved to: " + fileName);
        } else {
            System.err.println("Download failed: HTTP " + conn.getResponseCode());
        }
    }
}
