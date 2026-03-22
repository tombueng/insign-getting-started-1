package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.Date;

/**
 * Qualified Electronic Signature (QES) status information.
 * Field names match JSONQESStatus from the inSign REST API.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignQESStatus {

    private String username;
    private String email;
    private String mobilePhone;
    private String firstNames;
    private String lastNames;
    private String gender;
    private String placeOfBirth;
    private Date birthday;
    private String nationality;
    private String street;
    private String streetNumber;
    private String zipCode;
    private String city;
    private String country;
    private String status;
    private String qesTan;
    private String mobilePhoneOrUsername;
}
