package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;
import lombok.experimental.SuperBuilder;

import java.util.Collection;

/**
 * Response from getSessionMetadata (documents/full).
 * Field names match JSONSessionData from the inSign REST API.
 */
@Data
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
@ToString(callSuper = true)
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignSessionDataResult extends InsignBasicResult {

    private String sessionid;
    private Collection<InsignDocumentData> documents;
    private Collection<InsignAttachmentData> attachments;
    private String displayname;
    private String displaycustomer;
    private String modifiedTimestamp;
    private String publickey;
    private String tan;
    private String fullName;
    private boolean ausgehaendigtOriginal;
    private String mailMode;
    private boolean dsgvoAbfrage;
    private String needToAcceeptToSignText;
    private Collection<String> dsgvoApprovedRoles;
    private boolean resetSignatureForExtern;
    private String resetSignatureForExternID;
}
