package com.example.insign.model;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * Response from getStatus / checkStatus.
 *
 * Handles field name differences between the two APIs:
 * - REST API getStatus returns "sucessfullyCompleted" (with typo) and "signaturFieldsStatusList"
 * - insign-java-api JSONCheckStatusResult uses "completed" and has no signaturFieldsStatusList
 * - insign-java-api JSONSessionStatusResult has "signaturFieldsStatusList" but no "completed"
 *
 * Both APIs are supported via {@link JsonProperty}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignStatusResult {

    private String sessionid;
    private String status;

    /** Maps to "completed" (JSONCheckStatusResult) and "sucessfullyCompleted" (REST API). */
    private Boolean completed;

    private List<InsignSignatureFieldStatus> signaturFieldsStatusList;
    private Integer error;
    private String message;

    @Builder.Default
    private final Map<String, Object> additionalProperties = new LinkedHashMap<>();

    /** Setter for the REST API's "sucessfullyCompleted" field (maps to completed). */
    @JsonProperty("sucessfullyCompleted")
    public void setSucessfullyCompleted(boolean sucessfullyCompleted) { this.completed = sucessfullyCompleted; }

    /** Convenience accessor matching the REST API name. */
    public boolean isSucessfullyCompleted() { return completed != null && completed; }

    @JsonAnyGetter
    public Map<String, Object> getAdditionalProperties() { return additionalProperties; }

    @JsonAnySetter
    public void setAdditionalProperty(String key, Object value) { additionalProperties.put(key, value); }
}
