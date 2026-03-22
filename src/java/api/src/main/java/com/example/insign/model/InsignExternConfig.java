package com.example.insign.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.List;

/**
 * External signing invitation configuration.
 * Field names match JSONStartExternMultiuser from the inSign REST API.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString
@JsonIgnoreProperties(ignoreUnknown = true)
public class InsignExternConfig {

    private String sessionid;
    private List<InsignExternUserConfig> externUsers;
    private boolean inOrder;
    private Boolean keepExisiting;
    private Long expirationDate;
}
