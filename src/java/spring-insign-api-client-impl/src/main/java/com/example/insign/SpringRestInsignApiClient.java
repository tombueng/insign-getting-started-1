package com.example.insign;

import com.example.insign.model.*;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.Map;

/**
 * inSign API client using Spring RestClient with direct JSON serialization.
 *
 * Since our POJO field names match the inSign REST API exactly, ObjectMapper
 * serializes/deserializes our model classes directly to/from the API JSON.
 */
@Component
public class SpringRestInsignApiClient implements InsignApiService {

    private final RestClient restClient;
    private final String baseUrl;
    private final ObjectMapper mapper = new ObjectMapper();

    public SpringRestInsignApiClient(
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
                    try {
                        var json = mapper.readTree(body);
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

    @Override
    public String getBaseUrl() { return baseUrl; }

    @Override
    public String getVersion() {
        return restClient.get().uri("/version").retrieve().body(String.class);
    }

    @Override
    public InsignSessionResult createSession(InsignSessionConfig config) {
        // If documents have inline file content (byte[]), the REST API accepts them
        // as base64 in the "file" field of each document - ObjectMapper handles this.
        // For stream-based files, we create the session first, then upload via multipart.
        InsignSessionResult result = postJson("/configure/session", config, InsignSessionResult.class);

        // Upload any documents that use fileStream (not inline base64)
        if (config.getDocuments() != null && result.getSessionid() != null) {
            for (var doc : config.getDocuments()) {
                if (doc.getFile() == null && doc.getFileURL() == null && doc.getFileStream() != null) {
                    try {
                        uploadDocument(result.getSessionid(), doc.getId(),
                                doc.getFileStream().readAllBytes(),
                                doc.getFilename() != null ? doc.getFilename() : doc.getId() + ".pdf");
                    } catch (Exception e) {
                        throw new InsignApiException("Failed to upload document " + doc.getId() + ": " + e.getMessage(), e);
                    }
                }
            }
        }

        return result;
    }

    private void uploadDocument(String sessionId, String docId, byte[] pdfBytes, String filename) {
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("sessionid", sessionId);
        parts.add("docid", docId);
        parts.add("filename", filename);
        HttpHeaders fileHeaders = new HttpHeaders();
        fileHeaders.setContentType(MediaType.APPLICATION_PDF);
        parts.add("file", new HttpEntity<>(new ByteArrayResource(pdfBytes) {
            @Override public String getFilename() { return filename; }
        }, fileHeaders));

        restClient.post()
                .uri("/configure/uploaddocument")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(parts)
                .retrieve().toBodilessEntity();
    }

    @Override
    public InsignStatusResult getStatus(String sessionId) {
        return postSessionId("/get/status", sessionId, InsignStatusResult.class);
    }

    @Override
    public InsignStatusResult checkStatus(String sessionId) {
        return postSessionId("/get/checkstatus", sessionId, InsignStatusResult.class);
    }

    @Override
    public InsignBasicResult beginExtern(InsignExternConfig config) {
        return postJson("/extern/beginmulti", config, InsignBasicResult.class);
    }

    @Override
    public InsignBasicResult revokeExtern(String sessionId) {
        return postSessionId("/extern/abort", sessionId, InsignBasicResult.class);
    }

    @Override
    public InsignBasicResult getExternUsers(String sessionId) {
        return postSessionId("/extern/users", sessionId, InsignBasicResult.class);
    }

    @Override
    public InsignBasicResult getExternInfos(String sessionId) {
        return postSessionId("/get/externInfos", sessionId, InsignBasicResult.class);
    }

    @Override
    public InsignBasicResult sendReminder(String sessionId) {
        return postSessionId("/load/sendManualReminder", sessionId, InsignBasicResult.class);
    }

    @Override
    public String createOwnerSSOLink(String forUser) {
        try {
            String body = mapper.writeValueAsString(Map.of("id", forUser));
            return restClient.post()
                    .uri("/configure/createSSOForApiuser")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve().body(String.class);
        } catch (InsignApiException e) { throw e; }
        catch (Exception e) {
            throw new InsignApiException("Failed to create SSO link: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignBasicResult getAuditJson(String sessionId) {
        return postSessionId("/get/audit", sessionId, InsignBasicResult.class);
    }

    @Override
    public byte[] downloadAuditReport(String sessionId) {
        return restClient.get()
                .uri("/get/audit/download?sessionid=" + sessionId)
                .retrieve().body(byte[].class);
    }

    @Override
    public byte[] downloadDocumentsArchive(String sessionId) {
        try {
            String body = mapper.writeValueAsString(Map.of("sessionid", sessionId));
            return restClient.post()
                    .uri("/get/documents/download")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve().body(byte[].class);
        } catch (InsignApiException e) { throw e; }
        catch (Exception e) {
            throw new InsignApiException("Failed to download documents: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignBasicResult getSessionMetadata(String sessionId) {
        return postSessionId("/get/documents/full?includeAnnotations=true", sessionId, InsignBasicResult.class);
    }

    @Override
    public void purgeSession(String sessionId) {
        restClient.delete()
                .uri("/persistence/purge?sessionid=" + sessionId)
                .retrieve().toBodilessEntity();
    }

    @Override
    public InsignBasicResult getUserSessions(String user) {
        return postJson("/get/usersessions?user=" + user, Map.of(), InsignBasicResult.class);
    }

    @Override
    public InsignBasicResult queryUserSessions(List<String> sessionIds) {
        return postJson("/get/querysessions", Map.of("sessionids", sessionIds), InsignBasicResult.class);
    }

    // ==================== Helpers ====================

    private <T> T postSessionId(String path, String sessionId, Class<T> responseType) {
        return postJson(path, Map.of("sessionid", sessionId), responseType);
    }

    private <T> T postJson(String path, Object body, Class<T> responseType) {
        try {
            String json = mapper.writeValueAsString(body);
            ResponseEntity<String> res = restClient.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(json)
                    .retrieve().toEntity(String.class);
            return checkAndParse(path, res, responseType);
        } catch (InsignApiException e) { throw e; }
        catch (Exception e) {
            throw new InsignApiException("API call failed: " + path + " - " + e.getMessage(), e);
        }
    }

    /** Checks for application-level errors (error != 0) and deserializes to the target POJO. */
    private <T> T checkAndParse(String path, ResponseEntity<String> res, Class<T> responseType) throws Exception {
        var json = mapper.readTree(res.getBody());
        int error = json.path("error").asInt(0);
        if (error != 0) {
            String message = json.path("message").asText(
                    json.path("errormessage").asText(res.getBody()));
            throw new InsignApiException(res.getStatusCode().value(),
                    "HTTP " + res.getStatusCode().value() + " POST " + path
                            + " | error=" + error + " | " + message,
                    res.getBody());
        }
        return mapper.readValue(res.getBody(), responseType);
    }
}
