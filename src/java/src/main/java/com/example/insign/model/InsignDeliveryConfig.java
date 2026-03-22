package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * Email/SMS delivery configuration for a session.
 * Field names match JSONDeliveryConfig from the inSign REST API.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignDeliveryConfig {

    private String emailEmpfaenger;
    private Boolean emailEmpfaengerReadOnly;
    private String emailEmpfaengerKopie;
    private String emailEmpfaengerBCC;
    private String replyTo;
    private String returnPath;
    private String empfaengerSMS;
    private String empfaengerExtern;
    private Boolean empfaengerReadOnlyExtern;
    private String empfaengerCCExtern;
    private String empfaengerBCCExtern;
    private String empfaengerSMSExtern;
    private String tanEmailInhalt;
    private String tanSMSText;
    private String tanEmailBetreff;
    private String externEmailInhalt;
    private String alleEmailBetreff;
    private String alleEmailInhalt;
    private String externEmailBetreff;
    private String unterschriebenEmailBetreff;
    private String unterschriebenEmailInhalt;
    private String mustbereadEmailBetreff;
    private String mustbereadEmailInhalt;
    private String abgeschlossenEmailBetreff;
    private String abgeschlossenEmailInhalt;
    private String passwortEmailBetreff;
    private String passwortEmailInhalt;
    private String erinnerungEmailBetreff;
    private String erinnerungEmailInhalt;
    private String zurueckholenEmailBetreff;
    private String zurueckholenEmailInhalt;
    private Boolean documentEmailDownload;
}
