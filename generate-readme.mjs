#!/usr/bin/env node
/**
 * generate-readme.mjs - Code sample generator for README.md
 *
 * Generates API code samples in multiple languages and injects them
 * into README.md between marker comments. This is the CLI counterpart
 * of docs/js/code-generator.js (browser-based).
 *
 * Usage: node generate-readme.mjs
 *
 * Markers in README.md:
 *   <!-- CODEGEN:section-name:START -->
 *   ... generated content replaced on each run ...
 *   <!-- CODEGEN:section-name:END -->
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(__dirname, 'README.md');

// ---------------------------------------------------------------------------
// Configuration - update these when sandbox credentials or URLs change
// ---------------------------------------------------------------------------

const CFG = {
  baseUrl: 'https://sandbox.test.getinsign.show',
  username: 'controller',
  password: 'pwd.insign.sandbox.4561',
  docUrl: 'https://tombueng.github.io/insign-getting-started-1/test.pdf',
  explorerUrl: 'https://tombueng.github.io/insign-getting-started-1/'
};

const AUTH_B64 = Buffer.from(`${CFG.username}:${CFG.password}`).toString('base64');

// ---------------------------------------------------------------------------
// Endpoint definitions
// ---------------------------------------------------------------------------

const ENDPOINTS = {
  'configure-session': {
    method: 'POST',
    path: '/configure/session',
    body: {
      foruser: 'demo-user',
      displayname: 'Getting Started Demo',
      documents: [{
        id: 'doc-1',
        displayname: 'Sample Contract',
        fileURL: CFG.docUrl
      }]
    }
  },
  'beginmulti': {
    method: 'POST',
    path: '/extern/beginmulti',
    body: {
      sessionid: '<session-id-from-step-1>',
      externUsers: [
        { recipient: 'signer1@example.test', realName: 'Alice Signer', roles: ['seller'], sendEmails: false },
        { recipient: 'signer2@example.test', realName: 'Bob Signer', roles: ['buyer'], sendEmails: false }
      ],
      inOrder: false
    }
  },
  'get-status': {
    method: 'POST',
    path: '/get/status',
    body: { sessionid: '<session-id>' }
  },
  'get-document': {
    method: 'POST',
    path: '/get/document',
    queryParams: { sessionid: '<session-id>', docid: 'doc-1', includeBiodata: 'true' },
    binary: true
  }
};

// ---------------------------------------------------------------------------
// Language registry
// ---------------------------------------------------------------------------

const LANGS = [
  { key: 'curl',   label: 'cURL',    fence: 'bash' },
  { key: 'python', label: 'Python',  fence: 'python' },
  { key: 'nodejs', label: 'Node.js', fence: 'javascript' },
  { key: 'java',   label: 'Java',    fence: 'java' },
  { key: 'php',    label: 'PHP',     fence: 'php' },
  { key: 'csharp', label: 'C#',      fence: 'csharp' }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonBlock(obj, leadingSpaces = 0) {
  const raw = JSON.stringify(obj, null, 2);
  if (leadingSpaces === 0) return raw;
  const pad = ' '.repeat(leadingSpaces);
  return raw.split('\n').map((l, i) => i === 0 ? l : pad + l).join('\n');
}

function qs(params) {
  return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}

/** Python dict/list literal from JS value */
function toPy(v, indent = 0) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 4);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const items = v.map(i => inner + toPy(i, indent + 4));
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  const entries = Object.entries(v).map(([k, val]) =>
    `${inner}"${k}": ${toPy(val, indent + 4)}`
  );
  return `{\n${entries.join(',\n')}\n${pad}}`;
}

/** PHP array literal from JS value */
function toPhp(v, indent = 0) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 4);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const items = v.map(i => inner + toPhp(i, indent + 4) + ',');
    return `[\n${items.join('\n')}\n${pad}]`;
  }
  const entries = Object.entries(v).map(([k, val]) =>
    `${inner}'${k}' => ${toPhp(val, indent + 4)},`
  );
  return `[\n${entries.join('\n')}\n${pad}]`;
}

// ---------------------------------------------------------------------------
// Per-language code generators (single endpoint)
// ---------------------------------------------------------------------------

function genCurl(ep) {
  if (ep.queryParams) {
    return [
      `curl -X POST '${CFG.baseUrl}${ep.path}?${qs(ep.queryParams)}' \\`,
      `  -u '${CFG.username}:${CFG.password}' \\`,
      `  -o signed-document.pdf`
    ].join('\n');
  }
  return [
    `curl -X POST '${CFG.baseUrl}${ep.path}' \\`,
    `  -u '${CFG.username}:${CFG.password}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${jsonBlock(ep.body, 5)}'`
  ].join('\n');
}

function genPython(ep) {
  if (ep.queryParams) {
    return [
      'import requests',
      '',
      'response = requests.post(',
      `    "${CFG.baseUrl}${ep.path}",`,
      `    params=${toPy(ep.queryParams, 4)},`,
      `    auth=("${CFG.username}", "${CFG.password}")`,
      ')',
      'with open("signed-document.pdf", "wb") as f:',
      '    f.write(response.content)'
    ].join('\n');
  }
  return [
    'import requests',
    '',
    'response = requests.post(',
    `    "${CFG.baseUrl}${ep.path}",`,
    `    auth=("${CFG.username}", "${CFG.password}"),`,
    `    json=${toPy(ep.body, 4)}`,
    ')',
    'print(response.json())'
  ].join('\n');
}

function genNodejs(ep) {
  const authLine = `const AUTH = "Basic " + Buffer.from("${CFG.username}:${CFG.password}").toString("base64");`;
  if (ep.queryParams) {
    return [
      authLine,
      '',
      `const response = await fetch("${CFG.baseUrl}${ep.path}?${qs(ep.queryParams)}", {`,
      '  method: "POST",',
      '  headers: { Authorization: AUTH }',
      '});',
      'const fs = require("fs");',
      'fs.writeFileSync("signed-document.pdf", Buffer.from(await response.arrayBuffer()));'
    ].join('\n');
  }
  return [
    authLine,
    '',
    `const response = await fetch("${CFG.baseUrl}${ep.path}", {`,
    '  method: "POST",',
    '  headers: { Authorization: AUTH, "Content-Type": "application/json" },',
    `  body: JSON.stringify(${jsonBlock(ep.body, 2)})`,
    '});',
    'const data = await response.json();',
    'console.log(data);'
  ].join('\n');
}

function genJava(ep) {
  const auth = `Base64.getEncoder().encodeToString("${CFG.username}:${CFG.password}".getBytes(StandardCharsets.UTF_8))`;
  if (ep.queryParams) {
    return [
      'RestClient client = RestClient.builder()',
      `    .baseUrl("${CFG.baseUrl}")`,
      `    .defaultHeader("Authorization", "Basic " + ${auth})`,
      '    .build();',
      '',
      `byte[] pdf = client.post().uri("/get/document?${qs(ep.queryParams)}")`,
      '    .retrieve().body(byte[].class);',
      'Files.write(Path.of("signed-document.pdf"), pdf);'
    ].join('\n');
  }
  const jsonStr = JSON.stringify(ep.body, null, 2)
    .split('\n').map(l => '    ' + l).join('\n');
  return [
    'RestClient client = RestClient.builder()',
    `    .baseUrl("${CFG.baseUrl}")`,
    `    .defaultHeader("Authorization", "Basic " + ${auth})`,
    '    .build();',
    '',
    'String json = """',
    jsonStr,
    '    """;',
    '',
    `ResponseEntity<String> response = client.post().uri("${ep.path}")`,
    '    .contentType(MediaType.APPLICATION_JSON)',
    '    .body(json)',
    '    .retrieve().toEntity(String.class);',
    'System.out.println(response.getBody());'
  ].join('\n');
}

function genPhp(ep) {
  if (ep.queryParams) {
    return [
      `$ch = curl_init('${CFG.baseUrl}${ep.path}?${qs(ep.queryParams)}');`,
      'curl_setopt_array($ch, [',
      '    CURLOPT_RETURNTRANSFER => true,',
      '    CURLOPT_POST           => true,',
      `    CURLOPT_USERPWD        => '${CFG.username}:${CFG.password}',`,
      ']);',
      '$pdf = curl_exec($ch);',
      "file_put_contents('signed-document.pdf', $pdf);"
    ].join('\n');
  }
  return [
    `$payload = ${toPhp(ep.body, 0)};`,
    '',
    `$ch = curl_init('${CFG.baseUrl}${ep.path}');`,
    'curl_setopt_array($ch, [',
    '    CURLOPT_RETURNTRANSFER => true,',
    '    CURLOPT_POST           => true,',
    `    CURLOPT_USERPWD        => '${CFG.username}:${CFG.password}',`,
    "    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],",
    '    CURLOPT_POSTFIELDS     => json_encode($payload),',
    ']);',
    '$response = curl_exec($ch);',
    '$data = json_decode($response, true);',
    'print_r($data);'
  ].join('\n');
}

function genCsharp(ep) {
  const auth = `Convert.ToBase64String(Encoding.UTF8.GetBytes("${CFG.username}:${CFG.password}"))`;
  if (ep.queryParams) {
    return [
      'var http = new HttpClient();',
      `http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", ${auth});`,
      '',
      `var response = await http.PostAsync("${CFG.baseUrl}${ep.path}?${qs(ep.queryParams)}", null);`,
      'var pdf = await response.Content.ReadAsByteArrayAsync();',
      'await File.WriteAllBytesAsync("signed-document.pdf", pdf);'
    ].join('\n');
  }
  const jsonStr = JSON.stringify(ep.body, null, 2)
    .split('\n').map(l => '    ' + l).join('\n');
  return [
    'var http = new HttpClient();',
    `http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", ${auth});`,
    '',
    'var json = """',
    jsonStr,
    '    """;',
    'var content = new StringContent(json, Encoding.UTF8, "application/json");',
    '',
    `var response = await http.PostAsync("${CFG.baseUrl}${ep.path}", content);`,
    'Console.WriteLine(await response.Content.ReadAsStringAsync());'
  ].join('\n');
}

const GENERATORS = { curl: genCurl, python: genPython, nodejs: genNodejs, java: genJava, php: genPhp, csharp: genCsharp };

// ---------------------------------------------------------------------------
// Combined flow generator (all 4 steps chained)
// ---------------------------------------------------------------------------

function genCombinedCurl() {
  return `# 1) Create a signing session
SESSION=$(curl -s -X POST '${CFG.baseUrl}/configure/session' \\
  -u '${CFG.username}:${CFG.password}' \\
  -H 'Content-Type: application/json' \\
  -d '${jsonBlock(ENDPOINTS['configure-session'].body, 5)}')
SESSION_ID=$(echo "$SESSION" | grep -o '"sessionid":"[^"]*"' | cut -d'"' -f4)
echo "Session created: $SESSION_ID"

# 2) Start external signing
curl -s -X POST '${CFG.baseUrl}/extern/beginmulti' \\
  -u '${CFG.username}:${CFG.password}' \\
  -H 'Content-Type: application/json' \\
  -d '{
  "sessionid": "'"$SESSION_ID"'",
  "externUsers": [
    { "recipient": "signer1@example.test", "realName": "Alice Signer", "roles": ["seller"], "sendEmails": false },
    { "recipient": "signer2@example.test", "realName": "Bob Signer", "roles": ["buyer"], "sendEmails": false }
  ],
  "inOrder": false
}'

# 3) Check session status
STATUS=$(curl -s -X POST '${CFG.baseUrl}/get/status' \\
  -u '${CFG.username}:${CFG.password}' \\
  -H 'Content-Type: application/json' \\
  -d '{"sessionid": "'"$SESSION_ID"'"}')
echo "$STATUS"
DOC_ID=$(echo "$STATUS" | grep -o '"docid":"[^"]*"' | head -1 | cut -d'"' -f4)

# 4) Download signed document
curl -s -X POST '${CFG.baseUrl}/get/document?sessionid='"$SESSION_ID"'&docid='"$DOC_ID"'&includeBiodata=true' \\
  -u '${CFG.username}:${CFG.password}' \\
  -o signed-document.pdf
echo "Downloaded: signed-document.pdf"`;
}

function genCombinedPython() {
  return `import requests, json

BASE = "${CFG.baseUrl}"
auth = ("${CFG.username}", "${CFG.password}")

# 1) Create a signing session
r1 = requests.post(f"{BASE}/configure/session", auth=auth, json=${toPy(ENDPOINTS['configure-session'].body, 0)})
session_id = r1.json()["sessionid"]
print(f"Session created: {session_id}")

# 2) Start external signing
r2 = requests.post(f"{BASE}/extern/beginmulti", auth=auth, json={
    "sessionid": session_id,
    "externUsers": [
        {"recipient": "signer1@example.test", "realName": "Alice Signer", "roles": ["seller"], "sendEmails": False},
        {"recipient": "signer2@example.test", "realName": "Bob Signer", "roles": ["buyer"], "sendEmails": False}
    ],
    "inOrder": False
})
print(f"External signing started: HTTP {r2.status_code}")

# 3) Check session status
r3 = requests.post(f"{BASE}/get/status", auth=auth, json={"sessionid": session_id})
status = r3.json()
doc_id = status["documentData"][0]["docid"]
print(f"Status: {status.get('sessionStatus', 'unknown')}")

# 4) Download signed document
r4 = requests.post(f"{BASE}/get/document", auth=auth,
    params={"sessionid": session_id, "docid": doc_id, "includeBiodata": "true"})
with open("signed-document.pdf", "wb") as f:
    f.write(r4.content)
print(f"Downloaded: signed-document.pdf ({len(r4.content)} bytes)")`;
}

function genCombinedNodejs() {
  return `const fs = require("fs");

const BASE = "${CFG.baseUrl}";
const AUTH = "Basic " + Buffer.from("${CFG.username}:${CFG.password}").toString("base64");
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// 1) Create a signing session
const r1 = await fetch(\`\${BASE}/configure/session\`, {
  method: "POST", headers,
  body: JSON.stringify(${jsonBlock(ENDPOINTS['configure-session'].body, 2)})
});
const { sessionid } = await r1.json();
console.log("Session created:", sessionid);

// 2) Start external signing
await fetch(\`\${BASE}/extern/beginmulti\`, {
  method: "POST", headers,
  body: JSON.stringify({
    sessionid,
    externUsers: [
      { recipient: "signer1@example.test", realName: "Alice Signer", roles: ["seller"], sendEmails: false },
      { recipient: "signer2@example.test", realName: "Bob Signer", roles: ["buyer"], sendEmails: false }
    ],
    inOrder: false
  })
});

// 3) Check session status
const r3 = await fetch(\`\${BASE}/get/status\`, {
  method: "POST", headers,
  body: JSON.stringify({ sessionid })
});
const status = await r3.json();
const docId = status.documentData[0].docid;
console.log("Status:", status.sessionStatus);

// 4) Download signed document
const r4 = await fetch(
  \`\${BASE}/get/document?sessionid=\${sessionid}&docid=\${docId}&includeBiodata=true\`,
  { method: "POST", headers: { Authorization: AUTH } }
);
fs.writeFileSync("signed-document.pdf", Buffer.from(await r4.arrayBuffer()));
console.log("Downloaded: signed-document.pdf");`;
}

function genCombinedJava() {
  const auth = `Base64.getEncoder().encodeToString("${CFG.username}:${CFG.password}".getBytes(StandardCharsets.UTF_8))`;
  const sessionJson = JSON.stringify(ENDPOINTS['configure-session'].body, null, 2)
    .split('\n').map(l => '    ' + l).join('\n');
  return `RestClient client = RestClient.builder()
    .baseUrl("${CFG.baseUrl}")
    .defaultHeader("Authorization", "Basic " + ${auth})
    .build();

ObjectMapper mapper = new ObjectMapper();

// 1) Create a signing session
String sessionJson = """
${sessionJson}
    """;
ResponseEntity<String> r1 = client.post().uri("/configure/session")
    .contentType(MediaType.APPLICATION_JSON).body(sessionJson)
    .retrieve().toEntity(String.class);
String sessionId = mapper.readTree(r1.getBody()).get("sessionid").asText();

// 2) Start external signing
String externJson = """
    {
      "sessionid": "%s",
      "externUsers": [
        {"recipient":"signer1@example.test","realName":"Alice Signer","roles":["seller"],"sendEmails":false},
        {"recipient":"signer2@example.test","realName":"Bob Signer","roles":["buyer"],"sendEmails":false}
      ],
      "inOrder": false
    }
    """.formatted(sessionId);
client.post().uri("/extern/beginmulti")
    .contentType(MediaType.APPLICATION_JSON).body(externJson)
    .retrieve().toEntity(String.class);

// 3) Check session status
String statusJson = """
    {"sessionid": "%s"}
    """.formatted(sessionId);
ResponseEntity<String> r3 = client.post().uri("/get/status")
    .contentType(MediaType.APPLICATION_JSON).body(statusJson)
    .retrieve().toEntity(String.class);
String docId = mapper.readTree(r3.getBody()).at("/documentData/0/docid").asText();

// 4) Download signed document
byte[] pdf = client.post()
    .uri("/get/document?sessionid=" + sessionId + "&docid=" + docId + "&includeBiodata=true")
    .retrieve().body(byte[].class);
Files.write(Path.of("signed-document.pdf"), pdf);
System.out.println("Downloaded: signed-document.pdf (" + pdf.length + " bytes)");`;
}

function genCombinedPhp() {
  return `<?php
$base = '${CFG.baseUrl}';
$auth = '${CFG.username}:${CFG.password}';

function insignPost($url, $auth, $payload = null) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_USERPWD        => $auth,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => $payload ? json_encode($payload) : null,
    ]);
    $response = curl_exec($ch);
    return $response;
}

// 1) Create a signing session
$r1 = insignPost("$base/configure/session", $auth, ${toPhp(ENDPOINTS['configure-session'].body, 0)});
$session = json_decode($r1, true);
$sessionId = $session['sessionid'];
echo "Session created: $sessionId\\n";

// 2) Start external signing
insignPost("$base/extern/beginmulti", $auth, [
    'sessionid' => $sessionId,
    'externUsers' => [
        ['recipient' => 'signer1@example.test', 'realName' => 'Alice Signer', 'roles' => ['seller'], 'sendEmails' => false],
        ['recipient' => 'signer2@example.test', 'realName' => 'Bob Signer', 'roles' => ['buyer'], 'sendEmails' => false],
    ],
    'inOrder' => false
]);

// 3) Check session status
$r3 = insignPost("$base/get/status", $auth, ['sessionid' => $sessionId]);
$status = json_decode($r3, true);
$docId = $status['documentData'][0]['docid'];
echo "Status: " . ($status['sessionStatus'] ?? 'unknown') . "\\n";

// 4) Download signed document
$ch = curl_init("$base/get/document?sessionid=" . urlencode($sessionId) . "&docid=" . urlencode($docId) . "&includeBiodata=true");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_USERPWD        => $auth,
]);
$pdf = curl_exec($ch);
file_put_contents('signed-document.pdf', $pdf);
echo "Downloaded: signed-document.pdf (" . strlen($pdf) . " bytes)\\n";`;
}

function genCombinedCsharp() {
  const auth = `Convert.ToBase64String(Encoding.UTF8.GetBytes("${CFG.username}:${CFG.password}"))`;
  const sessionJson = JSON.stringify(ENDPOINTS['configure-session'].body, null, 2)
    .split('\n').map(l => '    ' + l).join('\n');
  return `var http = new HttpClient { BaseAddress = new Uri("${CFG.baseUrl}") };
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",
    ${auth});

// 1) Create a signing session
var r1 = await http.PostAsync("/configure/session", new StringContent("""
${sessionJson}
    """, Encoding.UTF8, "application/json"));
var sessionId = JsonNode.Parse(await r1.Content.ReadAsStringAsync())?["sessionid"]?.ToString();

// 2) Start external signing
await http.PostAsync("/extern/beginmulti", new StringContent($$"""
    {
      "sessionid": "{{sessionId}}",
      "externUsers": [
        {"recipient":"signer1@example.test","realName":"Alice Signer","roles":["seller"],"sendEmails":false},
        {"recipient":"signer2@example.test","realName":"Bob Signer","roles":["buyer"],"sendEmails":false}
      ],
      "inOrder": false
    }
    """, Encoding.UTF8, "application/json"));

// 3) Check session status
var r3 = await http.PostAsync("/get/status", new StringContent(
    $$"""{"sessionid":"{{sessionId}}"}""", Encoding.UTF8, "application/json"));
var status = JsonNode.Parse(await r3.Content.ReadAsStringAsync());
var docId = status?["documentData"]?[0]?["docid"]?.ToString();

// 4) Download signed document
var r4 = await http.PostAsync($"/get/document?sessionid={sessionId}&docid={docId}&includeBiodata=true", null);
await File.WriteAllBytesAsync("signed-document.pdf", await r4.Content.ReadAsByteArrayAsync());
Console.WriteLine("Downloaded: signed-document.pdf");`;
}

const COMBINED_GENERATORS = {
  curl: genCombinedCurl, python: genCombinedPython, nodejs: genCombinedNodejs,
  java: genCombinedJava, php: genCombinedPhp, csharp: genCombinedCsharp
};

// ---------------------------------------------------------------------------
// Markdown output
// ---------------------------------------------------------------------------

function generateSection(endpointKey) {
  const ep = ENDPOINTS[endpointKey];
  if (!ep) return `<!-- Unknown endpoint: ${endpointKey} -->`;

  const blocks = LANGS.map((lang, i) => {
    const code = GENERATORS[lang.key](ep);
    const open = i === 0 ? ' open' : '';
    return `<details${open}>
<summary><strong>${lang.label}</strong></summary>

\`\`\`${lang.fence}
${code}
\`\`\`
</details>`;
  });

  return blocks.join('\n');
}

function generateCombinedSection() {
  const blocks = LANGS.map((lang, i) => {
    const code = COMBINED_GENERATORS[lang.key]();
    const open = i === 0 ? ' open' : '';
    return `<details${open}>
<summary><strong>${lang.label}</strong></summary>

\`\`\`${lang.fence}
${code}
\`\`\`
</details>`;
  });

  return blocks.join('\n');
}

// ---------------------------------------------------------------------------
// README injection
// ---------------------------------------------------------------------------

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function injectSection(readme, sectionKey, content) {
  const startMarker = `<!-- CODEGEN:${sectionKey}:START -->`;
  const endMarker = `<!-- CODEGEN:${sectionKey}:END -->`;
  const pattern = new RegExp(
    escapeRegex(startMarker) + '[\\s\\S]*?' + escapeRegex(endMarker),
    'g'
  );

  if (!readme.includes(startMarker)) {
    console.warn(`  Warning: marker not found for "${sectionKey}"`);
    return readme;
  }

  return readme.replace(pattern, `${startMarker}\n${content}\n${endMarker}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let readme = readFileSync(README_PATH, 'utf8');

console.log('Generating code samples for README.md...');

// Individual endpoints
for (const key of Object.keys(ENDPOINTS)) {
  const section = generateSection(key);
  readme = injectSection(readme, key, section);
  console.log(`  [OK] ${key}`);
}

// Combined flow
const combined = generateCombinedSection();
readme = injectSection(readme, 'complete-flow', combined);
console.log('  [OK] complete-flow');

writeFileSync(README_PATH, readme, 'utf8');
console.log('Done. README.md updated.');
