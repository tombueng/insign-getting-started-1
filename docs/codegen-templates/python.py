import requests
import json

BASE_URL = "{{BASE_URL}}"
auth = ("{{USERNAME}}", "{{PASSWORD}}")


def main():
    """{{METHOD}} {{PATH}}"""
{{#if HAS_BODY}}
    payload = {{BODY_BUILD}}

{{/if}}
    response = requests.{{METHOD_LOWER}}(
        f"{BASE_URL}{{PATH}}",
        auth=auth,
{{#if HAS_BODY}}
        json=payload,
{{/if}}
    )

    print(f"HTTP Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2))

    session_id = data.get("sessionid")
    if session_id:
        get_status(session_id)
        download_document(session_id)


def get_status(session_id: str):
    """Check session status — prints completion flag and signature counts"""
    response = requests.post(
        f"{BASE_URL}/get/status",
        auth=auth,
        json={"sessionid": session_id},
    )
    status = response.json()
    print("\n=== Session Status ===")
    print(f"Successfully completed: {status.get('successfullycompleted', False)}")
    print(f"Signatures done: {status.get('numberofsignaturesdone', 0)}")
    print(f"Signatures missing: {status.get('numberofsignaturesmissing', 0)}")


def download_document(session_id: str):
    """Download signed document(s) and save to disk"""
    response = requests.post(
        f"{BASE_URL}/get/documents/download",
        auth=auth,
        json={"sessionid": session_id},
        headers={"Accept": "*/*"},
    )

    if response.ok:
        filename = "signed-document.pdf"
        cd = response.headers.get("Content-Disposition", "")
        if "filename=" in cd:
            filename = cd.split("filename=")[1].strip('"').strip()
        with open(filename, "wb") as f:
            f.write(response.content)
        print(f"\nDocument saved to: {filename} ({len(response.content)} bytes)")
    else:
        print(f"Download failed: HTTP {response.status_code}")


if __name__ == "__main__":
    main()
