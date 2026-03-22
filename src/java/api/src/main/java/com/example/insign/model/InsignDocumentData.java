package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.List;

/**
 * Full document metadata response.
 * Field names match JSONDocumentData from the inSign REST API.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignDocumentData {

    private String sessionid;
    private String docid;
    private String displayname;
    private String docchecksum;
    private String docchecksumSHA512;
    private String docname;
    private boolean mustberead;
    private boolean mustbesigned;
    private boolean hasbeenread;
    private boolean hasbeenchanged;
    private boolean hasbeenedited;
    private boolean hasbeensigned;
    private boolean hasbeensignedRequired;
    private boolean hasbeensignedCompletely;
    private boolean hasrequired;
    @JsonProperty("isUserAusgefuellt")
    private boolean isUserAusgefuellt;
    private boolean isbipro;
    @JsonProperty("isUploadedByUser")
    private boolean isUploadedByUser;
    private boolean isformular;
    private boolean formfillingallowed;
    private String productid;
    private String productname;
    private String typeicon;
    private boolean canbedeleted;
    private boolean canbesigned;
    private Boolean canbeeditedExtern;
    private Integer numberofpages;
    private List<InsignPageRatio> ratios;
    private List<InsignAnnotation> annotations;
    private List<String> dsgvoRoles;
    private Integer numberOfSignatures;
    private Integer numberOfSignaturesNeeded;
    private Integer numberOfSignaturesNeededDone;
    private Integer numberOfSignaturesNeededWithOptional;
    private Integer numberOfSignaturesNeededWithDisabled;
    private Integer numberOfSignaturesNeededWithOptionalWithDisabled;
    private Integer numberOfAddedPages;
    private Boolean gwgImage;
    private String additionalInfo;
    private Boolean canResetSignatureExtern;
    private Integer docposition;
    private boolean allowFormEditing;
    private boolean roleFieldEmailAdded;
    private int numberOfFinishedSignatures;
    private boolean allowAppendAfterSign;
    private String pageOverlay;
    private List<String> recipientVisibilityBlacklist;
}
