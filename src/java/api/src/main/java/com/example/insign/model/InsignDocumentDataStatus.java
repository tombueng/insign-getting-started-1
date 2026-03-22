package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.List;

/**
 * Document data as returned in a status response.
 * Field names match JSONDocumentDataStatus from the inSign REST API.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignDocumentDataStatus {

    private String docid;
    private String displayname;
    private String docchecksum;
    private String docchecksumSHA512;
    private String docname;
    private boolean hasbeenread;
    private boolean hasbeenchanged;
    private boolean hasbeenedited;
    private boolean hasbeensigned;
    private boolean hasbeensignedRequired;
    private boolean hasbeensignedCompletely;
    private boolean hasrequired;
    private boolean isUserAusgefuellt;
    private boolean isbipro;
    private Integer numberofpages;
    private Integer numberOfSignatures;
    private Integer numberOfSignaturesNeeded;
    private Integer numberOfSignaturesNeededDone;
    private Integer numberOfSignaturesNeededWithOptional;
    private Integer numberOfSignaturesNeededWithDisabled;
    private Integer numberOfSignaturesNeededWithOptionalWithDisabled;
    private List<InsignSignatureFieldStatus> signaturFieldsStatusList;
    private List<InsignQESStatus> completedQESList;
    private String additionalInfo;
}
