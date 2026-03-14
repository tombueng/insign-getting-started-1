// Node.js 18+ (native fetch)

const BASE_URL = "{{BASE_URL}}";
const credentials = Buffer.from("{{USERNAME}}:{{PASSWORD}}").toString("base64");

async function callInSignApi() {
{{#if HAS_BODY}}
  // Build request body
  const body = {{BODY_BUILD}};

{{/if}}
  try {
    const response = await fetch(`${BASE_URL}{{PATH}}`, {
      method: "{{METHOD}}",
      headers: {
        Authorization: `Basic ${credentials}`,
{{#if HAS_BODY}}
        "Content-Type": "{{CONTENT_TYPE}}",
{{/if}}
      },
{{#if HAS_BODY}}
      body: JSON.stringify(body),
{{/if}}
    });

    console.log(`HTTP Status: ${response.status}`);

    const text = await response.text();
    const data = JSON.parse(text);
    console.log(JSON.stringify(data, null, 2));

    if (data.sessionid) {
      await getStatus(data.sessionid);
      await downloadDocument(data.sessionid);
    }
  } catch (error) {
    console.error("Request failed:", error.message);
    process.exit(1);
  }
}

/** Check session status — prints completion flag and signature counts */
async function getStatus(sessionId) {
  const response = await fetch(`${BASE_URL}/get/status`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionid: sessionId }),
  });

  const status = await response.json();
  console.log("\n=== Session Status ===");
  console.log("Successfully completed:", status.successfullycompleted);
  console.log("Signatures done:", status.numberofsignaturesdone);
  console.log("Signatures missing:", status.numberofsignaturesmissing);
}

/** Download signed document(s) and save to disk */
async function downloadDocument(sessionId) {
  const fs = await import("fs");

  const response = await fetch(`${BASE_URL}/get/documents/download`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      Accept: "*/*",
    },
    body: JSON.stringify({ sessionid: sessionId }),
  });

  if (response.ok) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = "signed-document.pdf";
    fs.writeFileSync(fileName, buffer);
    console.log(`\nDocument saved to: ${fileName} (${buffer.length} bytes)`);
  } else {
    console.error(`Download failed: HTTP ${response.status}`);
  }
}

callInSignApi();
