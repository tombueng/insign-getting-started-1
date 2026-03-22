package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * Annotation on a document page (signature field, text field, etc.).
 * Field names match JSONAnnotation from the inSign REST API.
 * Internal fields like signatureData, signatureDataEncrypted, signatureInfo,
 * history, image, and script are intentionally omitted.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignAnnotation {

    private String id;
    private int posindex;
    private String text;
    private boolean required;
    private String type;
    private InsignPagePosition position;
    private Boolean readonly;
    private boolean moveable;
    private boolean transparent;
    private boolean deleteit;
    private String role;
    private String externRole;
    private String displayname;
    private String signatureLevel;
    private String stampType;
    private String signatureStampType;
    private boolean disabledByPageOverlay;
    private Integer posindexNullSafe;
}
