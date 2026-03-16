<p align="center">
  <a href="https://www.getinsign.com/">
    <img src="./DEV/inSign_logo.svg" width="280" alt="inSign" />
  </a>
</p>

<h1 align="center">Electronic Signature API — Getting Started</h1>

<p align="center">
  Interactive demos, code samples, and everything you need to integrate the inSign API into your application.
</p>

<p align="center">
  <a href="https://tombueng.github.io/insign-getting-started-1/"><strong>Try the Interactive Demo &rarr;</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="https://sandbox.test.getinsign.show/docs/swagger-ui/index.html">Swagger Docs</a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="https://www.getinsign.com/">getinsign.com</a>
</p>

---

## Interactive API Explorer

The **API Explorer** is a browser-based tool that lets you interact with the inSign sandbox API directly — no backend or installation required.

**Features:**
- Create signing sessions with 12 pre-built branded test contracts or drag-and-drop your own PDF
- Execute API operations (status, download, external signing, and more)
- Full JSON editor with autocomplete and field descriptions
- Live webhook viewer with multiple relay providers (smee.io, ntfy.sh, webhook.site, Val.town, Deno Deploy)
- Configurable status polling with endpoint selector and adjustable interval
- Auto-generated code snippets in Java, PHP, C#, and Node.js

**Open the demo:** [getinsign.github.io/insign-getting-started](https://tombueng.github.io/insign-getting-started-1/)

---

## Quick Start

### 1. Open the API Explorer

Visit the [Interactive Demo](https://tombueng.github.io/insign-getting-started-1/) in your browser. Sandbox credentials are pre-filled.

### 2. Create a Session

Click **Send Request** to create a signing session with the sample car sale contract. The JSON request body is fully editable with autocomplete.

### 3. Sign the Document

Click **Open in inSign** to open the signing UI in a new tab. Draw your signature, complete the process, then use the API Explorer to query status and download signed documents.

---

## Sandbox Credentials

| Setting | Value |
|---------|-------|
| **API URL** | `https://sandbox.test.getinsign.show/` |
| **Username** | `controller` |
| **Password** | `pwd.insign.sandbox.4561` |
| **Swagger UI** | [sandbox.test.getinsign.show/docs](https://sandbox.test.getinsign.show/docs/swagger-ui/index.html) |

Authentication is via HTTP Basic Auth (`Authorization: Basic <base64>`).

---

## Test Documents

12 branded test contracts are included, each with unique company branding, logos, and color schemes. You can also drag and drop your own PDF directly into the Explorer.

| Document | Description |
|----------|-------------|
| `contract-sigtags.pdf` | Uses inSign **SIG-tag** text markers (`##SIG{role:'seller',...}`) for signature placement |
| `contract-sigfields.pdf` | Uses standard **AcroForm** PDF signature fields |

Both contain a fictive car sale contract between two parties (seller and buyer) with signature fields assigned to roles `seller` and `buyer`.

Uploaded documents are persisted in the browser (IndexedDB) and can be renamed or removed from the document selector.

---

## Java API

This project also includes Java samples using the `insign-java-api` library.

### Setup

1. Add the GitHub Package Registry to your `settings.xml`:
   See [Working with the Apache Maven registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-apache-maven-registry)

2. Run a Maven build to download dependencies:
   ```bash
   mvn clean package
   ```

### Demo Classes

- **`SimpleDemoTest.java`** — Basic session creation with a single document
- **`MultiExternSimpleDemoTest.java`** — Multi-user external signing with roles
- **`PdfTestFileGenerator.java`** — Generates the test PDF contracts and demo data JSON

### API Endpoints

#### POST /configure/session

Creates a signing session with document metadata.

```json
{
    "foruser": "session-owner-userid",
    "displayname": "demo session",
    "documents": [
        {
            "id": "document-id-1",
            "displayname": "my document",
            "fileURL": "https://example.com/document.pdf"
        }
    ]
}
```

#### POST /extern/beginmulti

Starts external signing for multiple recipients with role assignments.

#### POST /get/status

Returns session status including signing progress.

#### POST /get/documents/download

Downloads all signed documents as a ZIP file.

See the [Swagger UI](https://sandbox.test.getinsign.show/docs/swagger-ui/index.html) for the complete API reference.

---

## Postman Collection

Import the pre-built Postman collection for quick API testing:

- **Collection:** [Getting started with inSign API Sandbox](DEV/Getting%20started%20with%20inSign%20API%20Sandbox.postman_collection.json)
- **Environment:** [inSign Sandbox Environment](DEV/inSign%20environment%20sandbox.postman_environment.json)

---

## Project Structure

```
├── docs/                           # Interactive API Explorer (GitHub Pages)
│   ├── index.html                  # Main application
│   ├── css/style.css               # inSign-branded styles
│   ├── js/                         # Application modules
│   └── data/                       # Test PDFs, demo data, and relay worker scripts
├── src/test/java/                  # Java API demos
├── DEV/                            # Postman collections, logos, assets
├── pom.xml                         # Maven configuration
└── readme.md
```

---

## Developed By

[inSign GmbH](https://www.getinsign.com/) — Electronic Signature Solutions
