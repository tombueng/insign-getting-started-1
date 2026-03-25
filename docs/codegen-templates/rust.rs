// Rust — add to Cargo.toml: reqwest = { version = "0.12", features = ["blocking", "json"] }
//                            serde_json = "1"
use std::fs;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = "{{BASE_URL}}";
    let client = reqwest::blocking::Client::new();
    let auth = ("{{USERNAME}}", "{{PASSWORD}}");

{{#if HAS_BODY}}
    let body: serde_json::Value = serde_json::json!({{BODY_BUILD}});
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
    // 1) {{METHOD}} {{PATH}}
    let res = client
        .{{METHOD_LOWER}}(format!("{base}{{PATH}}"))
        .basic_auth(auth.0, Some(auth.1))
{{#if HAS_BODY}}
        .header("Content-Type", "{{CONTENT_TYPE}}")
        .json(&body)
{{/if}}
        .send()?;
    let status_code = res.status().as_u16();
    let text = res.text()?;
    println!("HTTP {status_code}");
    println!("{text}");
    if status_code != 200 {
        eprintln!("FAILED: expected 200, got {status_code}");
        std::process::exit(1);
    }
    let data: serde_json::Value = serde_json::from_str(&text)?;

    // 2) Get status
    if let Some(sid) = data["sessionid"].as_str() {
        let res2 = client
            .post(format!("{base}/get/status?sessionid={sid}"))
            .basic_auth(auth.0, Some(auth.1))
            .send()?;
        let code2 = res2.status().as_u16();
        let text2 = res2.text()?;
        println!("\n=== Status (HTTP {code2}) ===");
        println!("{text2}");
        if code2 != 200 {
            eprintln!("FAILED: get/status returned HTTP {code2}");
            std::process::exit(1);
        }
        let status: serde_json::Value = serde_json::from_str(&text2)?;

        // 3) Download document (first doc)
        let doc_id = status["documentData"][0]["docid"]
            .as_str()
            .unwrap_or("0");
        let res3 = client
            .post(format!("{base}/get/document?sessionid={sid}&docid={doc_id}"))
            .basic_auth(auth.0, Some(auth.1))
            .send()?;
        let code3 = res3.status().as_u16();
        println!("\n=== Download (HTTP {code3}) ===");
        if code3 == 200 {
            let pdf = res3.bytes()?;
            fs::write("document.pdf", &pdf)?;
            println!("Saved document.pdf ({} bytes)", pdf.len());
        } else {
            eprintln!("Download failed: {}", res3.text()?);
            std::process::exit(1);
        }
    }
    Ok(())
}
