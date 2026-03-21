package com.example.insign;

/**
 * Thrown when the inSign API returns an HTTP error or an application-level error (error != 0).
 */
public class InsignApiException extends RuntimeException {

    private final int httpStatus;
    private final String responseBody;

    public InsignApiException(int httpStatus, String message, String responseBody) {
        super(message);
        this.httpStatus = httpStatus;
        this.responseBody = responseBody;
    }

    public InsignApiException(int httpStatus, String message) {
        this(httpStatus, message, null);
    }

    public int getHttpStatus() {
        return httpStatus;
    }

    public String getResponseBody() {
        return responseBody;
    }
}
