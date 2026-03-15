import requests, json, sys

BASE = "{{BASE_URL}}"
auth = ("{{USERNAME}}", "{{PASSWORD}}")

{{#if HAS_BODY}}
payload = {{BODY_BUILD}}
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
# 1) {{METHOD}} {{PATH}}
r = requests.{{METHOD_LOWER}}(f"{BASE}{{PATH}}", auth=auth{{#if HAS_BODY}}, json=payload{{/if}})
print(f"HTTP {r.status_code}")
print(r.text)
if r.status_code != 200:
    sys.exit(f"FAILED: expected HTTP 200, got {r.status_code}")
data = r.json()

# 2) Get status
sid = data.get("sessionid")
if sid:
    r2 = requests.post(f"{BASE}/get/status?sessionid={sid}", auth=auth)
    print(f"\n=== Status (HTTP {r2.status_code}) ===")
    print(r2.text)
    if r2.status_code != 200:
        sys.exit(f"FAILED: get/status returned HTTP {r2.status_code}")
    status = r2.json()

    # 3) Download document (first doc)
    doc_id = (status.get("documentData") or [{}])[0].get("docid", "0")
    r3 = requests.post(f"{BASE}/get/document?sessionid={sid}&docid={doc_id}", auth=auth)
    print(f"\n=== Download (HTTP {r3.status_code}) ===")
    if r3.status_code == 200:
        open("document.pdf", "wb").write(r3.content)
        print(f"Saved document.pdf ({len(r3.content)} bytes)")
    else:
        print(f"Download failed: {r3.text}")
        sys.exit(1)
