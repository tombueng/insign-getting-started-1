// Node.js 18+ (native fetch)
const fs = require("fs");

const BASE = "{{BASE_URL}}";
const AUTH = "Basic " + Buffer.from("{{USERNAME}}:{{PASSWORD}}").toString("base64");
const headers = { Authorization: AUTH };

(async () => {
{{#if HAS_BODY}}
  const body = {{BODY_BUILD}};
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
  // 1) {{METHOD}} {{PATH}}
  const res = await fetch(`${BASE}{{PATH}}`, {
    method: "{{METHOD}}",
    headers: { ...headers{{#if HAS_BODY}}, "Content-Type": "{{CONTENT_TYPE}}"{{/if}} },
{{#if HAS_BODY}}
    body: JSON.stringify(body),
{{/if}}
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
  if (res.status !== 200) { console.error(`FAILED: expected 200, got ${res.status}`); process.exit(1); }
  const data = JSON.parse(text);

  // 2) Get status
  const sid = data.sessionid;
  if (sid) {
    const r2 = await fetch(`${BASE}/get/status?sessionid=${sid}`, { method: "POST", headers });
    const statusText = await r2.text();
    console.log(`\n=== Status (HTTP ${r2.status}) ===`);
    console.log(statusText);
    if (r2.status !== 200) { console.error("FAILED: get/status"); process.exit(1); }
    const status = JSON.parse(statusText);

    // 3) Download document (first doc)
    const docId = status.documentData?.[0]?.docid ?? "0";
    const r3 = await fetch(`${BASE}/get/document?sessionid=${sid}&docid=${docId}`, { method: "POST", headers });
    console.log(`\n=== Download (HTTP ${r3.status}) ===`);
    if (r3.status === 200) {
      fs.writeFileSync("document.pdf", Buffer.from(await r3.arrayBuffer()));
      console.log("Saved document.pdf");
    } else {
      console.error("Download failed:", await r3.text());
      process.exit(1);
    }
  }
})();
