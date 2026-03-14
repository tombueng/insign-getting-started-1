import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.getinsign.api.InSignAdapter;
import com.getinsign.api.InSignConfigurationBuilder;
import com.getinsign.api.transport.InSignTransPortAdapterFactoryJod;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class InSignSessionExample {

    static final String BASE_URL = "{{BASE_URL}}";
    static final String AUTH_ENCODED = Base64.getEncoder()
        .encodeToString("{{USERNAME}}:{{PASSWORD}}".getBytes(StandardCharsets.UTF_8));

    public static void main(String[] args) throws Exception {
        // Transport adapter
        InSignTransPortAdapterFactoryJod factory = new InSignTransPortAdapterFactoryJod();
        factory.setBaseUrl(BASE_URL);
        factory.setUsername("{{USERNAME}}");
        factory.setPassword("{{PASSWORD}}");

        InSignAdapter adapter = new InSignAdapter(factory);

        // Build session configuration
        InSignConfigurationBuilder.SessionConfiguration cfg =
            InSignConfigurationBuilder.createSessionConfiguration();

{{INSIGN_CONFIG}}

        // Create the session
        String sessionId = adapter.createinSignSession(cfg);
        System.out.println("Session created: " + sessionId);

        // Check status and download document (via REST — not wrapped by insign-java-api)
        ObjectMapper mapper = new ObjectMapper();
        getStatus(mapper, sessionId);
        downloadDocument(mapper, sessionId);
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
