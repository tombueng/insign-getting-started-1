{{FILE_COMMENT}}# 1) {{METHOD}} {{PATH}}
RESPONSE=$(curl -s -w "\n%{http_code}" -X {{METHOD}} \
  '{{URL}}' \
  -u '{{USERNAME}}:{{PASSWORD}}' \
{{#if HAS_BODY}}
  -H 'Content-Type: {{CONTENT_TYPE}}' \
  -d '{{BODY_JSON}}')
{{/if}}
{{#unless HAS_BODY}}
)
{{/unless}}
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)
echo "HTTP $HTTP_CODE"
echo "$BODY"
[ "$HTTP_CODE" -eq 200 ] || { echo "FAILED: expected 200, got $HTTP_CODE" >&2; exit 1; }
{{SAMPLES}}

# 2) Check session status (replace $SESSION_ID with actual ID from response)
curl -sf -X POST '{{BASE_URL}}/get/status?sessionid=$SESSION_ID' \
  -u '{{USERNAME}}:{{PASSWORD}}'

# 3) Download document (replace $SESSION_ID and $DOC_ID)
curl -sf -X POST '{{BASE_URL}}/get/document?sessionid=$SESSION_ID&docid=$DOC_ID' \
  -u '{{USERNAME}}:{{PASSWORD}}' \
  -o document.pdf
