package com.example.insign;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.JsonNodeType;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.fail;

/**
 * Validates JSON API responses against captured template files stored in
 * {@code src/test/resources/response-templates/}.
 *
 * <h3>How it works</h3>
 * <ol>
 *   <li><b>Capture mode</b> (template file does not exist): the actual response is
 *       saved as the template. This happens automatically on first run.</li>
 *   <li><b>Validate mode</b> (template file exists): the actual response is compared
 *       structurally against the template. Every field present in the template must
 *       exist in the response with the same JSON type (STRING, NUMBER, BOOLEAN,
 *       OBJECT, ARRAY). Exact values are ignored - only structure matters.</li>
 * </ol>
 *
 * <h3>Comparison rules</h3>
 * <ul>
 *   <li>Objects: all template fields must be present; extra fields in the response
 *       are allowed (forward-compatible with API additions).</li>
 *   <li>Arrays: each element is validated against the first template element's
 *       structure (assumes homogeneous arrays).</li>
 *   <li>Null template values: no type constraint on the actual value.</li>
 *   <li>All mismatches are collected and reported together.</li>
 * </ul>
 *
 * <h3>Re-capturing templates</h3>
 * Delete a template file and re-run the test to capture a fresh baseline.
 *
 * @see FullWorkflowTest
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
     * If no template exists yet, captures {@code actual} as the new template.
     */
    public void assertMatchesTemplate(String templateName, JsonNode actual) throws IOException {
        Path templateFile = templatesDir.resolve(templateName + ".json");

        if (!Files.exists(templateFile)) {
            // Capture mode: save actual response as template
            Files.createDirectories(templatesDir);
            String pretty = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(actual);
            Files.writeString(templateFile, pretty);
            System.out.println("[Template] Captured: " + templateName + ".json");
            return;
        }

        // Validate mode: compare structure against template
        JsonNode template = mapper.readTree(Files.readString(templateFile));
        List<String> errors = new ArrayList<>();
        assertStructureMatches("$", template, actual, errors);

        if (!errors.isEmpty()) {
            fail("Response does not match template '" + templateName + ".json':\n  - "
                    + String.join("\n  - ", errors));
        }
    }

    private void assertStructureMatches(String path, JsonNode template, JsonNode actual,
                                        List<String> errors) {
        if (template == null || template.isNull()) {
            // Template had null - actual can be anything (null values are not structural)
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
                for (String field : template.propertyNames()) {
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
                    // Validate each actual element against the first template element
                    JsonNode elementTemplate = template.get(0);
                    for (int i = 0; i < actual.size(); i++) {
                        assertStructureMatches(path + "[" + i + "]",
                                elementTemplate, actual.get(i), errors);
                    }
                }
            }
            // Scalar types (STRING, NUMBER, BOOLEAN): type already matched above
            default -> { }
        }
    }
}
