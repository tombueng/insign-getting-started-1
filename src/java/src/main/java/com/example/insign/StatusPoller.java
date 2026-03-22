package com.example.insign;

import tools.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Polls session status when webhooks are not available.
 * Automatically activates for sessions that have not received any webhook callbacks.
 */
@Component
public class StatusPoller {

    private final InsignApiClient apiClient;
    private final SessionStatusTracker tracker;
    private final Set<String> watchedSessions = ConcurrentHashMap.newKeySet();

    @Value("${insign.polling.interval-seconds:5}")
    private int pollingIntervalSeconds;

    public StatusPoller(InsignApiClient apiClient, SessionStatusTracker tracker) {
        this.apiClient = apiClient;
        this.tracker = tracker;
    }

    public void watchSession(String sessionId) {
        watchedSessions.add(sessionId);
        System.out.println("[Poller] Now watching session: " + sessionId);
    }

    public void unwatchSession(String sessionId) {
        watchedSessions.remove(sessionId);
    }

    @Scheduled(fixedDelayString = "${insign.polling.interval-seconds:5}000")
    public void poll() {
        for (String sessionId : watchedSessions) {
            // Skip polling if we are receiving webhooks for this session
            if (tracker.hasWebhookSupport(sessionId)) {
                continue;
            }

            try {
                JsonNode status = apiClient.checkStatus(sessionId);
                tracker.onPollResult(sessionId, status);

                // Stop watching completed or deleted sessions
                String sessionStatus = status.path("status").asText("");
                if ("COMPLETED".equalsIgnoreCase(sessionStatus)
                        || "DELETED".equalsIgnoreCase(sessionStatus)) {
                    watchedSessions.remove(sessionId);
                    System.out.println("[Poller] Session " + sessionId
                            + " reached terminal state: " + sessionStatus);
                }
            } catch (Exception e) {
                System.out.println("[Poller] Error polling " + sessionId + ": " + e.getMessage());
            }
        }
    }
}
