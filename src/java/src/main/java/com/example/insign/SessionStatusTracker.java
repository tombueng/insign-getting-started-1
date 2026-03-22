package com.example.insign;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Tracks session status changes received via webhooks or polling.
 * Broadcasts changes to connected SSE clients.
 */
@Component
public class SessionStatusTracker {

    private final Map<String, JsonNode> lastKnownStatus = new ConcurrentHashMap<>();
    private final Map<String, Boolean> webhookReceived = new ConcurrentHashMap<>();
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final ObjectMapper mapper = new ObjectMapper();

    public SseEmitter registerEmitter() {
        SseEmitter emitter = new SseEmitter(0L); // no timeout
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        return emitter;
    }

    public void onWebhookReceived(String sessionId, JsonNode status) {
        lastKnownStatus.put(sessionId, status);
        webhookReceived.put(sessionId, true);
        broadcast("webhook", sessionId, status);
    }

    public void onPollResult(String sessionId, JsonNode status) {
        JsonNode previous = lastKnownStatus.get(sessionId);
        lastKnownStatus.put(sessionId, status);

        if (previous == null) {
            printStatusChange(sessionId, status, "Initial status");
            broadcast("status-change", sessionId, status);
            return;
        }

        if (hasChanges(previous, status)) {
            broadcast("status-change", sessionId, status);
        }

        detectChanges(sessionId, previous, status);
    }

    public boolean hasWebhookSupport(String sessionId) {
        return webhookReceived.getOrDefault(sessionId, false);
    }

    public JsonNode getLastStatus(String sessionId) {
        return lastKnownStatus.get(sessionId);
    }

    private boolean hasChanges(JsonNode previous, JsonNode current) {
        return countSignedFields(previous) != countSignedFields(current)
                || previous.path("sucessfullyCompleted").asBoolean(false) != current.path("sucessfullyCompleted").asBoolean(false);
    }

    private void broadcast(String eventType, String sessionId, JsonNode status) {
        ObjectNode event = mapper.createObjectNode();
        event.put("event", eventType);
        event.put("sessionId", sessionId);
        event.set("status", status);
        String json;
        try {
            json = mapper.writeValueAsString(event);
        } catch (Exception e) {
            return;
        }
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name(eventType).data(json));
            } catch (IOException e) {
                emitters.remove(emitter);
            }
        }
    }

    private void detectChanges(String sessionId, JsonNode previous, JsonNode current) {
        int prevSigned = countSignedFields(previous);
        int currSigned = countSignedFields(current);
        if (currSigned != prevSigned) {
            printStatusChange(sessionId, current,
                    currSigned + " field(s) signed (was " + prevSigned + ")");
        }

        boolean prevCompleted = previous.path("sucessfullyCompleted").asBoolean(false);
        boolean currCompleted = current.path("sucessfullyCompleted").asBoolean(false);
        if (!prevCompleted && currCompleted) {
            printStatusChange(sessionId, current, "SESSION SUCCESSFULLY COMPLETED");
        }
    }

    private int countSignedFields(JsonNode status) {
        int count = 0;
        JsonNode sigFields = status.path("signaturFieldsStatusList");
        if (sigFields.isArray()) {
            for (JsonNode field : sigFields) {
                if (field.path("signed").asBoolean(false)) {
                    count++;
                }
            }
        }
        return count;
    }

    private void printStatusChange(String sessionId, JsonNode status, String message) {
        System.out.println("\n--- [Poll] " + message + " ---");
        System.out.println("  Session: " + sessionId);
        System.out.println("  Completed: " + status.path("sucessfullyCompleted").asBoolean(false));
    }
}
