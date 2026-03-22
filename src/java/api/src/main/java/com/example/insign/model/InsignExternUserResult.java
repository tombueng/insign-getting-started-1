package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.Map;

/**
 * Response from beginExtern or getExternUsers API calls.
 * Field names match JSONExternUserResult from the inSign REST API.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignExternUserResult {

    private Integer error;
    private String message;
    private String trace;
    private Map<String, String> messages;
    private String sessionid;
    private String usermessage;
    private String externUser;
    private String password;
    private String token;
    private String externAccessLink;
    private Boolean sendEmails;
    private Integer orderNumber;
    private String userType;
}
