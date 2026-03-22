package com.example.insign;

import com.example.insign.model.*;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.is2.insign.javapi.*;
import de.is2.sign.service.rest.json.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * inSign API client using the typed insign-java-api library.
 *
 * Uses ObjectMapper.convertValue() to map between our common POJOs and
 * the insign-java-api typed classes, since field names match.
 * For fields that don't map directly, manual mapping is used.
 */
@Component
public class InsignJavaApiClient implements InsignApiService {

    @SuppressWarnings("rawtypes")
    private final IInSignAdapter adapter;
    private final String baseUrl;
    private final ObjectMapper mapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    @SuppressWarnings({"unchecked", "rawtypes"})
    public InsignJavaApiClient(
            @Value("${insign.api.base-url}") String baseUrl,
            @Value("${insign.api.username}") String username,
            @Value("${insign.api.password}") String password) {

        this.baseUrl = baseUrl;

        try {
            InSignTransPortAdpaterFactoryApacheHttpClient factory =
                    new InSignTransPortAdpaterFactoryApacheHttpClient(baseUrl, username, password);
            this.adapter = new InSignAdapter(factory);
        } catch (Exception e) {
            throw new InsignApiException("Failed to initialize inSign adapter: " + e.getMessage(), e);
        }
    }

    @Override
    public String getBaseUrl() { return baseUrl; }

    @Override
    public String getVersion() { return "insign-java-api"; }

    @Override
    public InsignSessionResult createSession(InsignSessionConfig config) {
        try {
            // Convert our POJO to JSONConfigureSession via ObjectMapper - field names match.
            // Documents are excluded here and handled separately below because the
            // insign-java-api requires document binaries to be registered via addDokument().
            InsignSessionConfig configWithoutDocs = config.toBuilder().documents(null).build();
            InSignConfigurationData configData = InSignConfigurationBuilder.createSessionConfiguration();
            JSONConfigureSession cfg = mapper.convertValue(configWithoutDocs, JSONConfigureSession.class);
            if (cfg.getCallbackURL() == null) {
                cfg.setCallbackURL("about:blank");
            }
            configData.setConfigureSession(cfg);

            // Add documents via InSignConfigurationBuilder (handles binary transport)
            if (config.getDocuments() != null) {
                for (var doc : config.getDocuments()) {
                    InputStream docStream = null;
                    long size = 0;
                    String fname = doc.getFilename() != null ? doc.getFilename() : doc.getId() + ".pdf";

                    if (doc.getFileStream() != null) {
                        docStream = doc.getFileStream();
                        size = doc.getFileSize();
                    } else if (doc.getFile() != null) {
                        docStream = new ByteArrayInputStream(doc.getFile());
                        size = doc.getFile().length;
                    } else if (doc.getFileURL() != null) {
                        // URL-based: use the overload that accepts a download URL
                        InSignConfigurationBuilder.addDokument(configData, doc.getId(),
                                doc.getFileURL(), doc.getFileDownloadUser(), doc.getFileDownloadPassword());
                        continue;
                    }

                    if (docStream != null) {
                        InSignConfigurationBuilder.addDokument(configData, doc.getId(),
                                doc.getDisplayname(), fname, size,
                                doc.getAllowFormEditing() != null && doc.getAllowFormEditing(),
                                doc.isMustbesigned(), doc.isMustberead(), docStream, doc.getScanSigTags());
                    }
                }
            }

            // Create session with documents in one request
            InSignSessionHandle handle = adapter.createinSignSessionOneRequest(configData);

            return InsignSessionResult.builder()
                    .sessionid(handle.getSessionID())
                    .token(handle.getToken())
                    .accessURL(handle.getAccessurl() != null ? handle.getAccessurl().toString() : null)
                    .build();
        } catch (InsignApiException e) { throw e; }
        catch (Exception e) {
            throw new InsignApiException("Failed to create session: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignStatusResult getStatus(String sessionId) {
        try {
            JSONSessionStatusResult status = adapter.getStatus(sessionHandle(sessionId));
            // Use ObjectMapper to convert between typed classes (field names match)
            return mapper.convertValue(status, InsignStatusResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to get status: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignStatusResult checkStatus(String sessionId) {
        try {
            JSONCheckStatusResult status = adapter.getCheckStatus(sessionHandle(sessionId));
            return mapper.convertValue(status, InsignStatusResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to check status: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignExternResult beginExtern(InsignExternConfig config) {
        try {
            // Field names match - ObjectMapper handles the conversion directly
            List<InsignExternUser> users = new ArrayList<>();
            if (config.getExternUsers() != null) {
                for (InsignExternUserConfig userCfg : config.getExternUsers()) {
                    users.add(mapper.convertValue(userCfg, InsignExternUser.class));
                }
            }

            JSONExternMultiuserResult result = adapter.setExternal(
                    sessionHandle(config.getSessionid()), users);
            return mapper.convertValue(result, InsignExternResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to begin extern: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignBasicResult revokeExtern(String sessionId) {
        try {
            JSONBasicResult result = adapter.abortExternal(sessionHandle(sessionId));
            return mapper.convertValue(result, InsignBasicResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to revoke extern: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignExternResult getExternUsers(String sessionId) {
        try {
            // Use getStatus as the adapter doesn't have a direct getExternUsers
            JSONSessionStatusResult result = adapter.getStatus(sessionHandle(sessionId));
            return mapper.convertValue(result, InsignExternResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to get extern users: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignExternInfosResult getExternInfos(String sessionId) {
        try {
            JSONSessionStatusResult result = adapter.getStatus(sessionHandle(sessionId));
            return mapper.convertValue(result, InsignExternInfosResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to get extern infos: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignBasicResult sendReminder(String sessionId) {
        // The insign-java-api does not expose sendReminder directly
        InsignBasicResult result = new InsignBasicResult();
        result.setMessage("Reminder not supported via insign-java-api. Use the Spring RestClient implementation.");
        return result;
    }

    @Override
    public String createOwnerSSOLink(String forUser) {
        try {
            return adapter.createJWTTokenForApiUser(forUser, null, null, null, null);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to create SSO link: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignBasicResult getAuditJson(String sessionId) {
        try {
            List<Map<String, String>> audit = adapter.getAuditJSON(sessionHandle(sessionId));
            InsignBasicResult result = new InsignBasicResult();
            result.setAdditionalProperty("audit", audit);
            return result;
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to get audit: " + e.getMessage(), e);
        }
    }

    @Override
    public byte[] downloadAuditReport(String sessionId) {
        try {
            InputStream is = adapter.getAuditPDF(sessionHandle(sessionId));
            return is.readAllBytes();
        } catch (Exception e) {
            throw new InsignApiException("Failed to download audit report: " + e.getMessage(), e);
        }
    }

    @Override
    public byte[] downloadDocumentsArchive(String sessionId) {
        try {
            InputStream is = adapter.getDocumentsZIP(sessionHandle(sessionId));
            return is.readAllBytes();
        } catch (Exception e) {
            throw new InsignApiException("Failed to download documents: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignSessionDataResult getSessionMetadata(String sessionId) {
        try {
            JSONSessionData data = adapter.getDocumentsFull(sessionHandle(sessionId));
            return mapper.convertValue(data, InsignSessionDataResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to get metadata: " + e.getMessage(), e);
        }
    }

    @Override
    public void unloadSession(String sessionId) {
        try {
            adapter.unloadSession(sessionHandle(sessionId));
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to unload session: " + e.getMessage(), e);
        }
    }

    @Override
    public void purgeSession(String sessionId) {
        try {
            adapter.deleteinSignSessionImmediately(sessionHandle(sessionId));
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to purge session: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignBasicResult getUserSessions(String user) {
        try {
            JSONSessionsResult result = adapter.getAllUserSessions(user);
            return mapper.convertValue(result, InsignBasicResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to get user sessions: " + e.getMessage(), e);
        }
    }

    @Override
    public InsignBasicResult queryUserSessions(List<String> sessionIds) {
        try {
            JSONSessionsResult result = adapter.getInfoForSessions(sessionIds);
            return mapper.convertValue(result, InsignBasicResult.class);
        } catch (InSignAdapterException e) {
            throw new InsignApiException("Failed to query sessions: " + e.getMessage(), e);
        }
    }

    private InSignSessionHandle sessionHandle(String sessionId) {
        return new InSignSessionHandle(sessionId, null);
    }
}
