package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.List;
import java.util.Map;

/**
 * Session configuration POJO. Field names match JSONConfigureSession from the
 * inSign REST API exactly, allowing direct ObjectMapper.convertValue() mapping.
 *
 * Only commonly used fields are listed explicitly. Additional fields from the
 * API are preserved via the additionalProperties map when deserializing,
 * and can be set programmatically for advanced use cases.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignSessionConfig {

    // -- Identity & display --
    private String foruser;
    private String userFullName;
    private String userEmail;
    private String senderEmail;
    private String displayname;
    private String displaycustomer;
    private String mtanRecipient;

    // -- Signature settings --
    private String signatureLevel;
    private Boolean makeFieldsMandatory;
    private Boolean embedBiometricData;
    private Boolean writeAuditReport;

    // -- Callback URLs --
    private String callbackURL;
    private String serverSidecallbackURL;
    private String serversideCallbackMethod;
    private String serversideCallbackContenttype;

    // -- Feature flags --
    private Boolean uploadEnabled;
    private Boolean externEnabled;
    private Boolean externUploadEnabled;
    private Boolean pdfEditorOnly;

    // -- Sub-configurations --
    private Map<String, Object> guiProperties;
    private InsignDeliveryConfig deliveryConfig;
    private List<InsignDocumentConfig> documents;
}
