package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * Extern user information as returned by getExternInfos.
 * Field names match JSONExternUserInfo from the inSign REST API.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignExternUserInfo {

    private String externUser;
    private Integer orderNumber;
    private Boolean vorgangfertig;
    private Boolean dsgvoDeclined;
    private Boolean identReview;
    private Boolean rejected;
    private String message;
    private String userType;
    private Boolean signedAny;
}
