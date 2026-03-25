package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

func main() {
	base := "{{BASE_URL}}"
	username := "{{USERNAME}}"
	password := "{{PASSWORD}}"

{{#if HAS_BODY}}
	body := {{BODY_BUILD}}
{{SAMPLES}}

{{FILE_COMMENT}}
	bodyJSON, _ := json.Marshal(body)

{{/if}}
	// 1) {{METHOD}} {{PATH}}
{{#if HAS_BODY}}
	req, _ := http.NewRequest("{{METHOD}}", base+"{{PATH}}", bytes.NewReader(bodyJSON))
	req.Header.Set("Content-Type", "{{CONTENT_TYPE}}")
{{/if}}
{{#unless HAS_BODY}}
	req, _ := http.NewRequest("{{METHOD}}", base+"{{PATH}}", nil)
{{/unless}}
	req.SetBasicAuth(username, password)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Request failed: %v\n", err)
		os.Exit(1)
	}
	defer res.Body.Close()
	text, _ := io.ReadAll(res.Body)
	fmt.Printf("HTTP %d\n", res.StatusCode)
	fmt.Println(string(text))
	if res.StatusCode != 200 {
		fmt.Fprintf(os.Stderr, "FAILED: expected 200, got %d\n", res.StatusCode)
		os.Exit(1)
	}
	var data map[string]interface{}
	json.Unmarshal(text, &data)

	// 2) Get status
	sid, _ := data["sessionid"].(string)
	if sid != "" {
		req2, _ := http.NewRequest("POST", fmt.Sprintf("%s/get/status?sessionid=%s", base, sid), nil)
		req2.SetBasicAuth(username, password)
		res2, err := http.DefaultClient.Do(req2)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Status request failed: %v\n", err)
			os.Exit(1)
		}
		defer res2.Body.Close()
		text2, _ := io.ReadAll(res2.Body)
		fmt.Printf("\n=== Status (HTTP %d) ===\n", res2.StatusCode)
		fmt.Println(string(text2))
		if res2.StatusCode != 200 {
			fmt.Fprintf(os.Stderr, "FAILED: get/status returned HTTP %d\n", res2.StatusCode)
			os.Exit(1)
		}
		var status map[string]interface{}
		json.Unmarshal(text2, &status)

		// 3) Download document (first doc)
		docID := "0"
		if docs, ok := status["documentData"].([]interface{}); ok && len(docs) > 0 {
			if d, ok := docs[0].(map[string]interface{}); ok {
				if id, ok := d["docid"].(string); ok {
					docID = id
				}
			}
		}
		req3, _ := http.NewRequest("POST", fmt.Sprintf("%s/get/document?sessionid=%s&docid=%s", base, sid, docID), nil)
		req3.SetBasicAuth(username, password)
		res3, err := http.DefaultClient.Do(req3)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Download failed: %v\n", err)
			os.Exit(1)
		}
		defer res3.Body.Close()
		fmt.Printf("\n=== Download (HTTP %d) ===\n", res3.StatusCode)
		if res3.StatusCode == 200 {
			pdf, _ := io.ReadAll(res3.Body)
			os.WriteFile("document.pdf", pdf, 0644)
			fmt.Printf("Saved document.pdf (%d bytes)\n", len(pdf))
		} else {
			errBody, _ := io.ReadAll(res3.Body)
			fmt.Fprintf(os.Stderr, "Download failed: %s\n", string(errBody))
			os.Exit(1)
		}
	}
}
