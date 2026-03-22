package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.io.InputStream;

/**
 * Document descriptor within a session configuration.
 * Field names match JSONConfigureDocument from the inSign REST API.
 *
 * The document content can be provided in multiple ways:
 * - {@code file}: inline as base64-encoded bytes (sent with the JSON request)
 * - {@code fileURL}: a URL the inSign server fetches the document from
 * - {@code fileStream}: a local InputStream (used by insign-java-api, excluded from JSON)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString(exclude = {"file", "fileStream"})
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignDocumentConfig {

    private String id;
    private String displayname;
    private boolean mustbesigned;
    private boolean mustberead;
    private Boolean allowFormEditing;
    private Boolean scanSigTags;

    /** Inline document content as bytes (base64 in JSON). */
    private byte[] file;

    /** URL for the inSign server to download the document from. */
    private String fileURL;

    /** Username for authenticated URL download. */
    private String fileDownloadUser;

    /** Password for authenticated URL download. */
    private String fileDownloadPassword;

    /**
     * Local InputStream for document upload via insign-java-api.
     * Excluded from JSON serialization.
     */
    @JsonIgnore
    private transient InputStream fileStream;

    /**
     * Filename for the document (used during multipart upload).
     * Excluded from JSON serialization.
     */
    @JsonIgnore
    private transient String filename;

    /**
     * File size in bytes (used during multipart upload).
     * Excluded from JSON serialization.
     */
    @JsonIgnore
    private transient long fileSize;

    /** Convenience constructor for simple document declarations (no file content). */
    public InsignDocumentConfig(String id, String displayname, boolean mustbesigned) {
        this.id = id;
        this.displayname = displayname;
        this.mustbesigned = mustbesigned;
    }
}
