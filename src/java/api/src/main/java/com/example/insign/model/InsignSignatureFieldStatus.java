package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * Status of a single signature field.
 * Field names match JSONSignatureFieldStatus from the inSign REST API.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignSignatureFieldStatus {

    private String fieldID;
    private String role;
    private String displayname;
    private String documentID;
    private boolean signed;
    private boolean mandatory;
    private String signTimestamp;
    private String quickinfo;
    private Integer positionIndex;
    private String quickInfoParsedRole;
    private String externRole;
    private String deviceId;
    private String signatureBitmap;
}
