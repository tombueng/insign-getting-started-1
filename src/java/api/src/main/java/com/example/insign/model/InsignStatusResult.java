package com.example.insign.model;

import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * Unified response from getStatus (JSONSessionStatusResult) and checkStatus (JSONCheckStatusResult).
 *
 * This is a superset of both response types. Fields from JSONSessionStatusMinResult,
 * JSONSessionStatusResult, and JSONCheckStatusResult are all included so that either
 * API response can be deserialized into this single type.
 *
 * The "sucessfullyCompleted" field (with the original typo) maps to "completed" via JsonProperty.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignStatusResult {

    // --- Common fields ---
    private String sessionid;
    private Integer error;
    private String message;
    private String trace;

    // --- JSONSessionStatusMinResult fields ---
    private Boolean sucessfullyCompleted;
    private String displayname;
    private String displaycustomer;
    private String tan;
    private Long modifiedTimestamp;
    private Boolean ausgehaendigtOriginal;
    private String userid;

    // --- JSONSessionStatusResult fields ---
    private Integer numberOfSignatures;
    private Collection<String> emails_abgeschlossen;
    private Collection<String> emails_ausgehaendigt;
    private Collection<String> docs_abgeschlossen;
    private Collection<String> docs_ausgehaendigt;
    private List<InsignDocumentDataStatus> documentData;
    private Date aushaendigen_bestaetigt_timestamp;
    private Integer numberOfSignaturesFields;
    private Integer numberOfOptionalSignatures;
    private Integer numberOfOptionalSignatureFields;
    private Integer numberOfMandatorySignatures;
    private Integer numberOfMandatorySignatureFields;
    private List<InsignSignatureFieldStatus> signaturFieldsStatusList;
    private List<InsignQESStatus> qesStatusList;
    private InsignQESStatus qesStatus;
    private Boolean gdprDeclined;
    private List<InsignGDPRConsent> gdprConsent;

    // --- JSONCheckStatusResult fields ---
    private String status;
    private String processStep;
    private Boolean completed;
    private Boolean extern;
    private Boolean offline;
    private Boolean offlineAvailable;
    private Boolean ausfuellbar;
    private Boolean inQes;
    private Boolean qesResultPreliminary;
    private Integer numberOfSignaturesNeeded;
    private Integer numberOfSignaturesNeededDone;
    private String dsgvoDeclined;
    private String specialStatus;

    @Builder.Default
    private final Map<String, Object> additionalProperties = new LinkedHashMap<>();

    /** Convenience accessor - returns true if the session completed successfully. */
    public boolean isSucessfullyCompleted() {
        if (sucessfullyCompleted != null) return sucessfullyCompleted;
        return completed != null && completed;
    }

    @JsonAnyGetter
    public Map<String, Object> getAdditionalProperties() { return additionalProperties; }

    @JsonAnySetter
    public void setAdditionalProperty(String key, Object value) { additionalProperties.put(key, value); }
}
