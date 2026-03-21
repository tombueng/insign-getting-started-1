# inSign API - Getting Started (Java / Spring Boot)

A Spring Boot web application that demonstrates the inSign API:
generates a PDF with signature fields, creates a signing session, and provides
a web UI and REST endpoints for all common operations.

## Prerequisites

- Java 17+
- Maven 3.8+
- An inSign API account (base URL, username, password)

## Configuration

Edit `src/main/resources/application.properties` or use environment variables:

```properties
insign.api.base-url=${INSIGN_BASE_URL:https://your-insign-instance.example.com/api}
insign.api.username=${INSIGN_USERNAME:your-api-user}
insign.api.password=${INSIGN_PASSWORD:your-api-password}
```

By default, the app connects to the inSign sandbox.

### Webhooks (optional)

If you have a public URL (e.g. via ngrok), uncomment and set:

```properties
insign.webhook.callback-url=https://your-public-url.ngrok.io/webhook
```

When no webhook URL is configured, the app falls back to polling
`/get/checkstatus` every 5 seconds.

## Build and Run

```bash
cd src/java
mvn spring-boot:run
```

Or build a JAR and run it:

```bash
mvn clean package -DskipTests
java -jar target/insign-getting-started-1.0.0.jar
```

The web UI is available at **http://localhost:8090**. Stop the server with
Ctrl+C (shuts down immediately, no graceful-shutdown delay).

## What It Does

1. **Generates a test PDF** with two signature fields (roles: Signer1, Signer2) using PDFBox
2. **Creates an inSign session** via the web UI
3. **Uploads the PDF** to the session
4. **Monitors status changes** via SSE events, webhooks, or polling
5. **Web UI** at http://localhost:8090 with buttons for all operations:
   create session, invite signers (email/SMS/link), check status, download
   documents, get owner link, revoke invites, send reminders, purge session

A **thank-you page** at http://localhost:8090/thankyou.html is shown to
signers after they complete signing (configurable via `insign.thankyou.url`).

## Webhook Endpoint

`POST /webhook` on port 8090. Status changes received via webhook are
broadcast to connected SSE clients. When webhooks are active, polling is
suppressed for that session.

## Tests

```bash
mvn test
```

### Response template validation

The integration test (`FullWorkflowTest`) validates JSON responses against template
files in `src/test/resources/response-templates/`. This checks that the API response
structure (field names and value types) stays consistent without comparing exact
values (which change per session).

- **First run** (no template files): responses are captured automatically as templates.
  Commit the generated `.json` files so subsequent runs validate against them.
- **Subsequent runs**: each response is compared structurally. Missing fields or type
  mismatches cause the test to fail.
- **Re-capture**: delete a template file and re-run to capture a fresh baseline
  after an intentional API change.

## Project Structure

```
src/main/java/com/example/insign/
  InsignGettingStartedApp.java   - Spring Boot entry point
  InsignApiClient.java           - REST client for all inSign API endpoints
  PdfGenerator.java              - Generates test PDF with ##SIG tags
  WebhookController.java         - Receives webhook callbacks, SSE events
  SessionStatusTracker.java      - Detects and broadcasts status changes
  StatusPoller.java              - Polls status when webhooks are unavailable

src/main/resources/
  application.properties         - Configuration (API credentials, port, webhooks)
  static/index.html              - Web UI
  static/thankyou.html           - Post-signing thank-you page

src/test/java/com/example/insign/
  FullWorkflowTest.java          - Integration test against sandbox
  ResponseTemplateValidator.java - Structural JSON response validation
  PdfGeneratorTest.java          - PDF generation test
```
