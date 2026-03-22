package com.example.insign;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeType;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import static org.junit.jupiter.api.Assertions.fail;

/**
 * Validates JSON API responses against captured template files.
 *
 * Accepts any Object (POJO or JsonNode) - converts to JsonNode for structural comparison.
 * Templates are stored in {@code src/test/resources/response-templates/}.
 *
 * <ul>
 *   <li><b>First run</b> (no template): response is captured as the template.</li>
 *   <li><b>Subsequent runs</b>: response is compared structurally (field names + types).</li>
 *   <li><b>Re-capture</b>: delete a template file and re-run.</li>
 * </ul>
 */
public class ResponseTemplateValidator {

    private final ObjectMapper mapper;
    private final Path templatesDir;

    public ResponseTemplateValidator(ObjectMapper mapper, Path templatesDir) {
        this.mapper = mapper;
        this.templatesDir = templatesDir;
    }

    public static ResponseTemplateValidator standard() {
        return new ResponseTemplateValidator(
                new ObjectMapper(),
                Path.of("src/test/resources/response-templates")
        );
    }

    /**
     * Validates that {@code actual} matches the structure of the stored template.
     * Accepts POJOs, Maps, or JsonNode - converts to JsonNode internally.
     */
    public void assertMatchesTemplate(String templateName, Object actual) throws IOException {
        JsonNode actualNode = mapper.valueToTree(actual);
        Path templateFile = templatesDir.resolve(templateName + ".json");

        if (!Files.exists(templateFile)) {
            Files.createDirectories(templatesDir);
            String pretty = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(actualNode);
            Files.writeString(templateFile, pretty);
            System.out.println("[Template] Captured: " + templateName + ".json");
            return;
        }

        JsonNode template = mapper.readTree(Files.readString(templateFile));
        List<String> errors = new ArrayList<>();
        assertStructureMatches("$", template, actualNode, errors);

        if (!errors.isEmpty()) {
            fail("Response does not match template '" + templateName + ".json':\n  - "
                    + String.join("\n  - ", errors));
        }
    }

    private void assertStructureMatches(String path, JsonNode template, JsonNode actual,
                                        List<String> errors) {
        if (template == null || template.isNull()) {
            return;
        }

        JsonNodeType expectedType = template.getNodeType();
        JsonNodeType actualType = actual == null ? JsonNodeType.NULL : actual.getNodeType();

        if (expectedType != actualType) {
            errors.add(path + ": expected type " + expectedType + " but got " + actualType);
            return;
        }

        switch (expectedType) {
            case OBJECT -> {
                Iterator<String> fieldNames = template.fieldNames();
                while (fieldNames.hasNext()) {
                    String field = fieldNames.next();
                    if (!actual.has(field)) {
                        errors.add(path + "." + field + ": missing field");
                    } else {
                        assertStructureMatches(path + "." + field,
                                template.get(field), actual.get(field), errors);
                    }
                }
            }
            case ARRAY -> {
                if (!template.isEmpty() && !actual.isEmpty()) {
                    JsonNode elementTemplate = template.get(0);
                    for (int i = 0; i < actual.size(); i++) {
                        assertStructureMatches(path + "[" + i + "]",
                                elementTemplate, actual.get(i), errors);
                    }
                }
            }
            default -> { }
        }
    }
}
