<p align="center">
  <a href="https://www.getinsign.com/">
    <img src="./DEV/inSign_logo.svg" width="300" alt="inSign - Electronic Signature Solutions" />
  </a>
</p>

<h1 align="center">inSign API - Getting Started</h1>

<p align="center">
  <strong>Integrate electronic signatures into your application in minutes.</strong><br>
  <sub>Free sandbox. No registration. No credit card. Just code.</sub>
</p>

<p align="center">
  <a href="https://sandbox.test.getinsign.show/docs/swagger-ui/index.html"><img src="https://img.shields.io/badge/API_Reference-Swagger-0165BC?style=flat-square&logo=swagger&logoColor=white" alt="Swagger Docs" /></a>&nbsp;
  <a href="https://tombueng.github.io/insign-getting-started-1/"><img src="https://img.shields.io/badge/Try-API_Explorer-F8A909?style=flat-square" alt="API Explorer" /></a>&nbsp;
  <a href="https://www.getinsign.com/"><img src="https://img.shields.io/badge/Website-getinsign.com-0165BC?style=flat-square" alt="Website" /></a>
</p>

<br>

---

## Public Sandbox

> **Try the inSign API right now** - no account, no registration, no setup.
>
> | | |
> |---|---|
> | **API URL** | `https://sandbox.test.getinsign.show/` |
> | **Username** | `controller` |
> | **Password** | `pwd.insign.sandbox.4561` |
> | **Auth** | HTTP Basic (`Authorization: Basic <base64>`) |
>
> The sandbox resets every night and has low rate limits. It is meant for quick testing and exploration, not production use.

---

## Quick Start

Copy any of the code samples below and run them. The sandbox credentials are included - they work out of the box.

> **No local setup needed?** Run the samples directly in your browser:
>
> | Tool | Languages | |
> |------|-----------|---|
> | [ReqBin](https://reqbin.com/curl) | cURL, Python, PHP, C#, Java | Paste cURL or code, click Run |
> | [Hoppscotch](https://hoppscotch.io/) | REST client | Paste URL + JSON body, set Basic Auth |
> | [OneCompiler](https://onecompiler.com/) | Python, Node.js, PHP, Java, C# | Full code runner, 100+ languages |

---

### Step 1 - Create a Signing Session

`POST /configure/session`

Upload a document and create a signing session. The response contains a `sessionid` you will use in all subsequent calls.

<!-- CODEGEN:configure-session:START -->
<details open>
<summary><strong>cURL</strong></summary>

```bash
curl -X POST 'https://sandbox.test.getinsign.show/configure/session' \
  -u 'controller:pwd.insign.sandbox.4561' \
  -H 'Content-Type: application/json' \
  -d '{
       "foruser": "demo-user",
       "displayname": "Getting Started Demo",
       "documents": [
         {
           "id": "doc-1",
           "displayname": "Sample Contract",
           "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
         }
       ]
     }'
```
</details>
<details>
<summary><strong>Python</strong></summary>

```python
import requests

response = requests.post(
    "https://sandbox.test.getinsign.show/configure/session",
    auth=("controller", "pwd.insign.sandbox.4561"),
    json={
        "foruser": "demo-user",
        "displayname": "Getting Started Demo",
        "documents": [
            {
                "id": "doc-1",
                "displayname": "Sample Contract",
                "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
            }
        ]
    }
)
print(response.json())
```
</details>
<details>
<summary><strong>Node.js</strong></summary>

```javascript
const AUTH = "Basic " + Buffer.from("controller:pwd.insign.sandbox.4561").toString("base64");

const response = await fetch("https://sandbox.test.getinsign.show/configure/session", {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({
    "foruser": "demo-user",
    "displayname": "Getting Started Demo",
    "documents": [
      {
        "id": "doc-1",
        "displayname": "Sample Contract",
        "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
      }
    ]
  })
});
const data = await response.json();
console.log(data);
```
</details>
<details>
<summary><strong>Java</strong></summary>

```java
RestClient client = RestClient.builder()
    .baseUrl("https://sandbox.test.getinsign.show")
    .defaultHeader("Authorization", "Basic " + Base64.getEncoder().encodeToString("controller:pwd.insign.sandbox.4561".getBytes(StandardCharsets.UTF_8)))
    .build();

String json = """
    {
      "foruser": "demo-user",
      "displayname": "Getting Started Demo",
      "documents": [
        {
          "id": "doc-1",
          "displayname": "Sample Contract",
          "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
        }
      ]
    }
    """;

ResponseEntity<String> response = client.post().uri("/configure/session")
    .contentType(MediaType.APPLICATION_JSON)
    .body(json)
    .retrieve().toEntity(String.class);
System.out.println(response.getBody());
```
</details>
<details>
<summary><strong>PHP</strong></summary>

```php
$payload = [
    'foruser' => 'demo-user',
    'displayname' => 'Getting Started Demo',
    'documents' => [
        [
            'id' => 'doc-1',
            'displayname' => 'Sample Contract',
            'fileURL' => 'https://tombueng.github.io/insign-getting-started-1/test.pdf',
        ],
    ],
];

$ch = curl_init('https://sandbox.test.getinsign.show/configure/session');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_USERPWD        => 'controller:pwd.insign.sandbox.4561',
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($payload),
]);
$response = curl_exec($ch);
$data = json_decode($response, true);
print_r($data);
```
</details>
<details>
<summary><strong>C#</strong></summary>

```csharp
var http = new HttpClient();
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("controller:pwd.insign.sandbox.4561")));

var json = """
    {
      "foruser": "demo-user",
      "displayname": "Getting Started Demo",
      "documents": [
        {
          "id": "doc-1",
          "displayname": "Sample Contract",
          "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
        }
      ]
    }
    """;
var content = new StringContent(json, Encoding.UTF8, "application/json");

var response = await http.PostAsync("https://sandbox.test.getinsign.show/configure/session", content);
Console.WriteLine(await response.Content.ReadAsStringAsync());
```
</details>
<!-- CODEGEN:configure-session:END -->

<p>
  <a href="https://tombueng.github.io/insign-getting-started-1/"><img src="https://img.shields.io/badge/API_Explorer_%E2%86%92-F8A909?style=flat-square" alt="Try in API Explorer" /></a>&nbsp;
  <a href="https://reqbin.com/curl"><img src="https://img.shields.io/badge/run_cURL-ReqBin-0165BC?style=flat-square" alt="Run on ReqBin" /></a>&nbsp;
  <a href="https://onecompiler.com/"><img src="https://img.shields.io/badge/run_code-OneCompiler-0165BC?style=flat-square" alt="Run on OneCompiler" /></a>
</p>

---

### Step 2 - Start External Signing

`POST /extern/beginmulti`

Send signing invitations to external signers. Each signer gets a link to sign the document in their browser. Replace `<session-id-from-step-1>` with the `sessionid` from Step 1.

<!-- CODEGEN:beginmulti:START -->
<details open>
<summary><strong>cURL</strong></summary>

```bash
curl -X POST 'https://sandbox.test.getinsign.show/extern/beginmulti' \
  -u 'controller:pwd.insign.sandbox.4561' \
  -H 'Content-Type: application/json' \
  -d '{
       "sessionid": "<session-id-from-step-1>",
       "externUsers": [
         {
           "recipient": "signer1@example.test",
           "realName": "Alice Signer",
           "roles": [
             "seller"
           ],
           "sendEmails": false
         },
         {
           "recipient": "signer2@example.test",
           "realName": "Bob Signer",
           "roles": [
             "buyer"
           ],
           "sendEmails": false
         }
       ],
       "inOrder": false
     }'
```
</details>
<details>
<summary><strong>Python</strong></summary>

```python
import requests

response = requests.post(
    "https://sandbox.test.getinsign.show/extern/beginmulti",
    auth=("controller", "pwd.insign.sandbox.4561"),
    json={
        "sessionid": "<session-id-from-step-1>",
        "externUsers": [
            {
                "recipient": "signer1@example.test",
                "realName": "Alice Signer",
                "roles": [
                    "seller"
                ],
                "sendEmails": False
            },
            {
                "recipient": "signer2@example.test",
                "realName": "Bob Signer",
                "roles": [
                    "buyer"
                ],
                "sendEmails": False
            }
        ],
        "inOrder": False
    }
)
print(response.json())
```
</details>
<details>
<summary><strong>Node.js</strong></summary>

```javascript
const AUTH = "Basic " + Buffer.from("controller:pwd.insign.sandbox.4561").toString("base64");

const response = await fetch("https://sandbox.test.getinsign.show/extern/beginmulti", {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({
    "sessionid": "<session-id-from-step-1>",
    "externUsers": [
      {
        "recipient": "signer1@example.test",
        "realName": "Alice Signer",
        "roles": [
          "seller"
        ],
        "sendEmails": false
      },
      {
        "recipient": "signer2@example.test",
        "realName": "Bob Signer",
        "roles": [
          "buyer"
        ],
        "sendEmails": false
      }
    ],
    "inOrder": false
  })
});
const data = await response.json();
console.log(data);
```
</details>
<details>
<summary><strong>Java</strong></summary>

```java
RestClient client = RestClient.builder()
    .baseUrl("https://sandbox.test.getinsign.show")
    .defaultHeader("Authorization", "Basic " + Base64.getEncoder().encodeToString("controller:pwd.insign.sandbox.4561".getBytes(StandardCharsets.UTF_8)))
    .build();

String json = """
    {
      "sessionid": "<session-id-from-step-1>",
      "externUsers": [
        {
          "recipient": "signer1@example.test",
          "realName": "Alice Signer",
          "roles": [
            "seller"
          ],
          "sendEmails": false
        },
        {
          "recipient": "signer2@example.test",
          "realName": "Bob Signer",
          "roles": [
            "buyer"
          ],
          "sendEmails": false
        }
      ],
      "inOrder": false
    }
    """;

ResponseEntity<String> response = client.post().uri("/extern/beginmulti")
    .contentType(MediaType.APPLICATION_JSON)
    .body(json)
    .retrieve().toEntity(String.class);
System.out.println(response.getBody());
```
</details>
<details>
<summary><strong>PHP</strong></summary>

```php
$payload = [
    'sessionid' => '<session-id-from-step-1>',
    'externUsers' => [
        [
            'recipient' => 'signer1@example.test',
            'realName' => 'Alice Signer',
            'roles' => [
                'seller',
            ],
            'sendEmails' => false,
        ],
        [
            'recipient' => 'signer2@example.test',
            'realName' => 'Bob Signer',
            'roles' => [
                'buyer',
            ],
            'sendEmails' => false,
        ],
    ],
    'inOrder' => false,
];

$ch = curl_init('https://sandbox.test.getinsign.show/extern/beginmulti');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_USERPWD        => 'controller:pwd.insign.sandbox.4561',
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($payload),
]);
$response = curl_exec($ch);
$data = json_decode($response, true);
print_r($data);
```
</details>
<details>
<summary><strong>C#</strong></summary>

```csharp
var http = new HttpClient();
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("controller:pwd.insign.sandbox.4561")));

var json = """
    {
      "sessionid": "<session-id-from-step-1>",
      "externUsers": [
        {
          "recipient": "signer1@example.test",
          "realName": "Alice Signer",
          "roles": [
            "seller"
          ],
          "sendEmails": false
        },
        {
          "recipient": "signer2@example.test",
          "realName": "Bob Signer",
          "roles": [
            "buyer"
          ],
          "sendEmails": false
        }
      ],
      "inOrder": false
    }
    """;
var content = new StringContent(json, Encoding.UTF8, "application/json");

var response = await http.PostAsync("https://sandbox.test.getinsign.show/extern/beginmulti", content);
Console.WriteLine(await response.Content.ReadAsStringAsync());
```
</details>
<!-- CODEGEN:beginmulti:END -->

<p>
  <a href="https://tombueng.github.io/insign-getting-started-1/"><img src="https://img.shields.io/badge/API_Explorer_%E2%86%92-F8A909?style=flat-square" alt="Try in API Explorer" /></a>&nbsp;
  <a href="https://reqbin.com/curl"><img src="https://img.shields.io/badge/run_cURL-ReqBin-0165BC?style=flat-square" alt="Run on ReqBin" /></a>&nbsp;
  <a href="https://onecompiler.com/"><img src="https://img.shields.io/badge/run_code-OneCompiler-0165BC?style=flat-square" alt="Run on OneCompiler" /></a>
</p>

---

### Step 3 - Check Session Status

`POST /get/status`

Poll the session status to see signing progress, document metadata, and signature field details. Replace `<session-id>` with your session ID.

<!-- CODEGEN:get-status:START -->
<details open>
<summary><strong>cURL</strong></summary>

```bash
curl -X POST 'https://sandbox.test.getinsign.show/get/status' \
  -u 'controller:pwd.insign.sandbox.4561' \
  -H 'Content-Type: application/json' \
  -d '{
       "sessionid": "<session-id>"
     }'
```
</details>
<details>
<summary><strong>Python</strong></summary>

```python
import requests

response = requests.post(
    "https://sandbox.test.getinsign.show/get/status",
    auth=("controller", "pwd.insign.sandbox.4561"),
    json={
        "sessionid": "<session-id>"
    }
)
print(response.json())
```
</details>
<details>
<summary><strong>Node.js</strong></summary>

```javascript
const AUTH = "Basic " + Buffer.from("controller:pwd.insign.sandbox.4561").toString("base64");

const response = await fetch("https://sandbox.test.getinsign.show/get/status", {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({
    "sessionid": "<session-id>"
  })
});
const data = await response.json();
console.log(data);
```
</details>
<details>
<summary><strong>Java</strong></summary>

```java
RestClient client = RestClient.builder()
    .baseUrl("https://sandbox.test.getinsign.show")
    .defaultHeader("Authorization", "Basic " + Base64.getEncoder().encodeToString("controller:pwd.insign.sandbox.4561".getBytes(StandardCharsets.UTF_8)))
    .build();

String json = """
    {
      "sessionid": "<session-id>"
    }
    """;

ResponseEntity<String> response = client.post().uri("/get/status")
    .contentType(MediaType.APPLICATION_JSON)
    .body(json)
    .retrieve().toEntity(String.class);
System.out.println(response.getBody());
```
</details>
<details>
<summary><strong>PHP</strong></summary>

```php
$payload = [
    'sessionid' => '<session-id>',
];

$ch = curl_init('https://sandbox.test.getinsign.show/get/status');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_USERPWD        => 'controller:pwd.insign.sandbox.4561',
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($payload),
]);
$response = curl_exec($ch);
$data = json_decode($response, true);
print_r($data);
```
</details>
<details>
<summary><strong>C#</strong></summary>

```csharp
var http = new HttpClient();
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("controller:pwd.insign.sandbox.4561")));

var json = """
    {
      "sessionid": "<session-id>"
    }
    """;
var content = new StringContent(json, Encoding.UTF8, "application/json");

var response = await http.PostAsync("https://sandbox.test.getinsign.show/get/status", content);
Console.WriteLine(await response.Content.ReadAsStringAsync());
```
</details>
<!-- CODEGEN:get-status:END -->

<p>
  <a href="https://tombueng.github.io/insign-getting-started-1/"><img src="https://img.shields.io/badge/API_Explorer_%E2%86%92-F8A909?style=flat-square" alt="Try in API Explorer" /></a>&nbsp;
  <a href="https://reqbin.com/curl"><img src="https://img.shields.io/badge/run_cURL-ReqBin-0165BC?style=flat-square" alt="Run on ReqBin" /></a>&nbsp;
  <a href="https://onecompiler.com/"><img src="https://img.shields.io/badge/run_code-OneCompiler-0165BC?style=flat-square" alt="Run on OneCompiler" /></a>
</p>

---

### Step 4 - Download Signed Document

`POST /get/document`

Download the signed PDF. Parameters are passed as query string. Replace `<session-id>` with your session ID.

<!-- CODEGEN:get-document:START -->
<details open>
<summary><strong>cURL</strong></summary>

```bash
curl -X POST 'https://sandbox.test.getinsign.show/get/document?sessionid=<session-id>&docid=doc-1&includeBiodata=true' \
  -u 'controller:pwd.insign.sandbox.4561' \
  -o signed-document.pdf
```
</details>
<details>
<summary><strong>Python</strong></summary>

```python
import requests

response = requests.post(
    "https://sandbox.test.getinsign.show/get/document",
    params={
        "sessionid": "<session-id>",
        "docid": "doc-1",
        "includeBiodata": "true"
    },
    auth=("controller", "pwd.insign.sandbox.4561")
)
with open("signed-document.pdf", "wb") as f:
    f.write(response.content)
```
</details>
<details>
<summary><strong>Node.js</strong></summary>

```javascript
const AUTH = "Basic " + Buffer.from("controller:pwd.insign.sandbox.4561").toString("base64");

const response = await fetch("https://sandbox.test.getinsign.show/get/document?sessionid=<session-id>&docid=doc-1&includeBiodata=true", {
  method: "POST",
  headers: { Authorization: AUTH }
});
const fs = require("fs");
fs.writeFileSync("signed-document.pdf", Buffer.from(await response.arrayBuffer()));
```
</details>
<details>
<summary><strong>Java</strong></summary>

```java
RestClient client = RestClient.builder()
    .baseUrl("https://sandbox.test.getinsign.show")
    .defaultHeader("Authorization", "Basic " + Base64.getEncoder().encodeToString("controller:pwd.insign.sandbox.4561".getBytes(StandardCharsets.UTF_8)))
    .build();

byte[] pdf = client.post().uri("/get/document?sessionid=<session-id>&docid=doc-1&includeBiodata=true")
    .retrieve().body(byte[].class);
Files.write(Path.of("signed-document.pdf"), pdf);
```
</details>
<details>
<summary><strong>PHP</strong></summary>

```php
$ch = curl_init('https://sandbox.test.getinsign.show/get/document?sessionid=<session-id>&docid=doc-1&includeBiodata=true');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_USERPWD        => 'controller:pwd.insign.sandbox.4561',
]);
$pdf = curl_exec($ch);
file_put_contents('signed-document.pdf', $pdf);
```
</details>
<details>
<summary><strong>C#</strong></summary>

```csharp
var http = new HttpClient();
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("controller:pwd.insign.sandbox.4561")));

var response = await http.PostAsync("https://sandbox.test.getinsign.show/get/document?sessionid=<session-id>&docid=doc-1&includeBiodata=true", null);
var pdf = await response.Content.ReadAsByteArrayAsync();
await File.WriteAllBytesAsync("signed-document.pdf", pdf);
```
</details>
<!-- CODEGEN:get-document:END -->

<p>
  <a href="https://tombueng.github.io/insign-getting-started-1/"><img src="https://img.shields.io/badge/API_Explorer_%E2%86%92-F8A909?style=flat-square" alt="Try in API Explorer" /></a>&nbsp;
  <a href="https://reqbin.com/curl"><img src="https://img.shields.io/badge/run_cURL-ReqBin-0165BC?style=flat-square" alt="Run on ReqBin" /></a>&nbsp;
  <a href="https://onecompiler.com/"><img src="https://img.shields.io/badge/run_code-OneCompiler-0165BC?style=flat-square" alt="Run on OneCompiler" /></a>
</p>

---

### Complete Flow - All Steps Combined

End-to-end example: create a session, invite signers, check status, and download the signed document.

<!-- CODEGEN:complete-flow:START -->
<details open>
<summary><strong>cURL</strong></summary>

```bash
# 1) Create a signing session
SESSION=$(curl -s -X POST 'https://sandbox.test.getinsign.show/configure/session' \
  -u 'controller:pwd.insign.sandbox.4561' \
  -H 'Content-Type: application/json' \
  -d '{
       "foruser": "demo-user",
       "displayname": "Getting Started Demo",
       "documents": [
         {
           "id": "doc-1",
           "displayname": "Sample Contract",
           "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
         }
       ]
     }')
SESSION_ID=$(echo "$SESSION" | grep -o '"sessionid":"[^"]*"' | cut -d'"' -f4)
echo "Session created: $SESSION_ID"

# 2) Start external signing
curl -s -X POST 'https://sandbox.test.getinsign.show/extern/beginmulti' \
  -u 'controller:pwd.insign.sandbox.4561' \
  -H 'Content-Type: application/json' \
  -d '{
  "sessionid": "'"$SESSION_ID"'",
  "externUsers": [
    { "recipient": "signer1@example.test", "realName": "Alice Signer", "roles": ["seller"], "sendEmails": false },
    { "recipient": "signer2@example.test", "realName": "Bob Signer", "roles": ["buyer"], "sendEmails": false }
  ],
  "inOrder": false
}'

# 3) Check session status
STATUS=$(curl -s -X POST 'https://sandbox.test.getinsign.show/get/status' \
  -u 'controller:pwd.insign.sandbox.4561' \
  -H 'Content-Type: application/json' \
  -d '{"sessionid": "'"$SESSION_ID"'"}')
echo "$STATUS"
DOC_ID=$(echo "$STATUS" | grep -o '"docid":"[^"]*"' | head -1 | cut -d'"' -f4)

# 4) Download signed document
curl -s -X POST 'https://sandbox.test.getinsign.show/get/document?sessionid='"$SESSION_ID"'&docid='"$DOC_ID"'&includeBiodata=true' \
  -u 'controller:pwd.insign.sandbox.4561' \
  -o signed-document.pdf
echo "Downloaded: signed-document.pdf"
```
</details>
<details>
<summary><strong>Python</strong></summary>

```python
import requests, json

BASE = "https://sandbox.test.getinsign.show"
auth = ("controller", "pwd.insign.sandbox.4561")

# 1) Create a signing session
r1 = requests.post(f"{BASE}/configure/session", auth=auth, json={
    "foruser": "demo-user",
    "displayname": "Getting Started Demo",
    "documents": [
        {
            "id": "doc-1",
            "displayname": "Sample Contract",
            "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
        }
    ]
})
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
print(f"Downloaded: signed-document.pdf ({len(r4.content)} bytes)")
```
</details>
<details>
<summary><strong>Node.js</strong></summary>

```javascript
const fs = require("fs");

const BASE = "https://sandbox.test.getinsign.show";
const AUTH = "Basic " + Buffer.from("controller:pwd.insign.sandbox.4561").toString("base64");
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// 1) Create a signing session
const r1 = await fetch(`${BASE}/configure/session`, {
  method: "POST", headers,
  body: JSON.stringify({
    "foruser": "demo-user",
    "displayname": "Getting Started Demo",
    "documents": [
      {
        "id": "doc-1",
        "displayname": "Sample Contract",
        "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
      }
    ]
  })
});
const { sessionid } = await r1.json();
console.log("Session created:", sessionid);

// 2) Start external signing
await fetch(`${BASE}/extern/beginmulti`, {
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
const r3 = await fetch(`${BASE}/get/status`, {
  method: "POST", headers,
  body: JSON.stringify({ sessionid })
});
const status = await r3.json();
const docId = status.documentData[0].docid;
console.log("Status:", status.sessionStatus);

// 4) Download signed document
const r4 = await fetch(
  `${BASE}/get/document?sessionid=${sessionid}&docid=${docId}&includeBiodata=true`,
  { method: "POST", headers: { Authorization: AUTH } }
);
fs.writeFileSync("signed-document.pdf", Buffer.from(await r4.arrayBuffer()));
console.log("Downloaded: signed-document.pdf");
```
</details>
<details>
<summary><strong>Java</strong></summary>

```java
RestClient client = RestClient.builder()
    .baseUrl("https://sandbox.test.getinsign.show")
    .defaultHeader("Authorization", "Basic " + Base64.getEncoder().encodeToString("controller:pwd.insign.sandbox.4561".getBytes(StandardCharsets.UTF_8)))
    .build();

ObjectMapper mapper = new ObjectMapper();

// 1) Create a signing session
String sessionJson = """
    {
      "foruser": "demo-user",
      "displayname": "Getting Started Demo",
      "documents": [
        {
          "id": "doc-1",
          "displayname": "Sample Contract",
          "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
        }
      ]
    }
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
System.out.println("Downloaded: signed-document.pdf (" + pdf.length + " bytes)");
```
</details>
<details>
<summary><strong>PHP</strong></summary>

```php
<?php
$base = 'https://sandbox.test.getinsign.show';
$auth = 'controller:pwd.insign.sandbox.4561';

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
$r1 = insignPost("$base/configure/session", $auth, [
    'foruser' => 'demo-user',
    'displayname' => 'Getting Started Demo',
    'documents' => [
        [
            'id' => 'doc-1',
            'displayname' => 'Sample Contract',
            'fileURL' => 'https://tombueng.github.io/insign-getting-started-1/test.pdf',
        ],
    ],
]);
$session = json_decode($r1, true);
$sessionId = $session['sessionid'];
echo "Session created: $sessionId\n";

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
echo "Status: " . ($status['sessionStatus'] ?? 'unknown') . "\n";

// 4) Download signed document
$ch = curl_init("$base/get/document?sessionid=" . urlencode($sessionId) . "&docid=" . urlencode($docId) . "&includeBiodata=true");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_USERPWD        => $auth,
]);
$pdf = curl_exec($ch);
file_put_contents('signed-document.pdf', $pdf);
echo "Downloaded: signed-document.pdf (" . strlen($pdf) . " bytes)\n";
```
</details>
<details>
<summary><strong>C#</strong></summary>

```csharp
var http = new HttpClient { BaseAddress = new Uri("https://sandbox.test.getinsign.show") };
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",
    Convert.ToBase64String(Encoding.UTF8.GetBytes("controller:pwd.insign.sandbox.4561")));

// 1) Create a signing session
var r1 = await http.PostAsync("/configure/session", new StringContent("""
    {
      "foruser": "demo-user",
      "displayname": "Getting Started Demo",
      "documents": [
        {
          "id": "doc-1",
          "displayname": "Sample Contract",
          "fileURL": "https://tombueng.github.io/insign-getting-started-1/test.pdf"
        }
      ]
    }
    """, Encoding.UTF8, "application/json"));
var sessionId = JsonNode.Parse(await r1.Content.ReadAsStringAsync())?["sessionid"]?.ToString();

// 2) Start external signing
await http.PostAsync("/extern/beginmulti", new StringContent($"""
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
    $"""{"sessionid":"{{sessionId}}"}""", Encoding.UTF8, "application/json"));
var status = JsonNode.Parse(await r3.Content.ReadAsStringAsync());
var docId = status?["documentData"]?[0]?["docid"]?.ToString();

// 4) Download signed document
var r4 = await http.PostAsync($"/get/document?sessionid={sessionId}&docid={docId}&includeBiodata=true", null);
await File.WriteAllBytesAsync("signed-document.pdf", await r4.Content.ReadAsByteArrayAsync());
Console.WriteLine("Downloaded: signed-document.pdf");
```
</details>
<!-- CODEGEN:complete-flow:END -->

<p>
  <a href="https://tombueng.github.io/insign-getting-started-1/"><img src="https://img.shields.io/badge/API_Explorer_%E2%86%92-F8A909?style=flat-square" alt="Try in API Explorer" /></a>&nbsp;
  <a href="https://reqbin.com/curl"><img src="https://img.shields.io/badge/run_cURL-ReqBin-0165BC?style=flat-square" alt="Run on ReqBin" /></a>&nbsp;
  <a href="https://onecompiler.com/"><img src="https://img.shields.io/badge/run_code-OneCompiler-0165BC?style=flat-square" alt="Run on OneCompiler" /></a>
</p>

---

## Interactive API Explorer

<p align="center">
  <a href="https://tombueng.github.io/insign-getting-started-1/">
    <img src="https://img.shields.io/badge/Open_API_Explorer-0165BC?style=for-the-badge" alt="Open API Explorer" />
  </a>
</p>

The **API Explorer** is a browser-based tool that lets you interact with the inSign API in real time - no backend or installation required. It works against the public sandbox, so you can start exploring right now.

**What makes it great:**

- **Live request editor** with JSON autocomplete, field descriptions, and validation
- **One-click operations** - create sessions, start external signing, poll status, download documents
- **Code snippets in 8 languages** - cURL, Python, Node.js, Java (Spring / GSON / inSign API), PHP, C# - generated live from your actual request
- **Tabbed language selector** - switch between languages instantly, toggle inline docs and sample properties
- **Webhook viewer** - watch server-side callbacks in real time via smee.io, ntfy.sh, webhook.site, Val.town, or Deno Deploy
- **Drag-and-drop PDF upload** - use the 12 included test contracts or bring your own document
- **Dark mode** - easy on the eyes during late-night integration sessions

No signup, no API key, no local server. Just open it and start building.

<p align="center">
  <a href="https://tombueng.github.io/insign-getting-started-1/">
    <strong>Open the API Explorer &rarr;</strong>
  </a>
</p>

---

## Additional Resources

### Swagger / OpenAPI

Full API reference with request/response schemas:
[sandbox.test.getinsign.show/docs](https://sandbox.test.getinsign.show/docs/swagger-ui/index.html)

### Postman Collection

Import the pre-built collection for quick API testing:

- [Getting started with inSign API Sandbox](DEV/Getting%20started%20with%20inSign%20API%20Sandbox.postman_collection.json) (collection)
- [inSign Sandbox Environment](DEV/inSign%20environment%20sandbox.postman_environment.json) (environment)

### Java API Library

For Java projects, the `insign-java-api` library provides a typed client with builders and configuration helpers.

```xml
<dependency>
  <groupId>com.getinsign</groupId>
  <artifactId>insign-java-api</artifactId>
</dependency>
```

Add the GitHub Package Registry to your Maven `settings.xml` - see [Working with the Apache Maven registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-apache-maven-registry).

Demo classes:
- **`SimpleDemoTest.java`** - Basic session creation with a single document
- **`MultiExternSimpleDemoTest.java`** - Multi-user external signing with roles

### Test Documents

12 branded test contracts are included in the API Explorer, each with unique company branding, logos, and color schemes. The default contracts use inSign SIG-tags and AcroForm signature fields for seller/buyer role assignment.

You can also drag and drop your own PDF directly into the Explorer.

### Project Structure

```
docs/                        Interactive API Explorer (GitHub Pages)
  index.html                 Main application
  js/                        Application modules + code generator
  codegen-templates/         Code snippet templates (8 languages)
  data/                      Test PDFs, demo data, webhook/relay configs
src/test/java/               Java API demos
DEV/                         Postman collections, logos, assets
generate-readme.mjs          Code sample generator for this README
```

### Regenerating Code Samples

The code samples in this README are generated by `generate-readme.mjs`. To regenerate after changing sandbox credentials, document URLs, or request bodies:

```bash
node generate-readme.mjs
```

The script reads marker comments (`<!-- CODEGEN:...:START/END -->`) and replaces the content between them.

---

<p align="center">
  <a href="https://www.getinsign.com/">
    <strong>inSign GmbH</strong>
  </a>
  &nbsp;-&nbsp;Electronic Signature Solutions
</p>
