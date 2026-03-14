# 1) {{METHOD}} {{PATH}}
curl -X {{METHOD}} \
  '{{URL}}' \
  -u '{{USERNAME}}:{{PASSWORD}}' \
{{#if HAS_BODY}}
  -H 'Content-Type: {{CONTENT_TYPE}}' \
  -d '{{BODY_JSON}}'
{{/if}}
{{#unless HAS_BODY}}
{{/unless}}

# 2) Check session status (replace $SESSION_ID with actual ID from response)
curl -X POST \
  '{{BASE_URL}}/get/status' \
  -u '{{USERNAME}}:{{PASSWORD}}' \
  -H 'Content-Type: application/json' \
  -d '{"sessionid": "$SESSION_ID"}'

# 3) Download signed document to file
curl -X POST \
  '{{BASE_URL}}/get/documents/download' \
  -u '{{USERNAME}}:{{PASSWORD}}' \
  -H 'Content-Type: application/json' \
  -H 'Accept: */*' \
  -d '{"sessionid": "$SESSION_ID"}' \
  -o signed-documents.zip
