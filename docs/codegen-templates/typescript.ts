// TypeScript — run with: npx tsx insign.ts / deno run / bun run
import * as fs from "node:fs";

const BASE: string = "{{BASE_URL}}";
const AUTH: string = "Basic " + btoa("{{USERNAME}}:{{PASSWORD}}");
const headers: Record<string, string> = { Authorization: AUTH };

{{#if HAS_BODY}}
const body: Record<string, unknown> = {{BODY_BUILD}};
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
// 1) {{METHOD}} {{PATH}}
const res: Response = await fetch(`${BASE}{{PATH}}`, {
  method: "{{METHOD}}",
  headers: { ...headers{{#if HAS_BODY}}, "Content-Type": "{{CONTENT_TYPE}}"{{/if}} },
{{#if HAS_BODY}}
  body: JSON.stringify(body),
{{/if}}
});
const text: string = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text);
if (res.status !== 200) { console.error(`FAILED: expected 200, got ${res.status}`); process.exit(1); }
const data: Record<string, unknown> = JSON.parse(text);

// 2) Get status
const sid: string | undefined = data.sessionid as string;
if (sid) {
  const r2: Response = await fetch(`${BASE}/get/status?sessionid=${sid}`, { method: "POST", headers });
  const statusText: string = await r2.text();
  console.log(`\n=== Status (HTTP ${r2.status}) ===`);
  console.log(statusText);
  if (r2.status !== 200) { console.error("FAILED: get/status"); process.exit(1); }
  const status: Record<string, unknown> = JSON.parse(statusText);

  // 3) Download document (first doc)
  const docData = (status.documentData as Array<Record<string, unknown>>)?.[0];
  const docId: string = (docData?.docid as string) ?? "0";
  const r3: Response = await fetch(`${BASE}/get/document?sessionid=${sid}&docid=${docId}`, { method: "POST", headers });
  console.log(`\n=== Download (HTTP ${r3.status}) ===`);
  if (r3.status === 200) {
    const buf: ArrayBuffer = await r3.arrayBuffer();
    fs.writeFileSync("document.pdf", Buffer.from(buf));
    console.log(`Saved document.pdf (${buf.byteLength} bytes)`);
  } else {
    console.error("Download failed:", await r3.text());
    process.exit(1);
  }
}
