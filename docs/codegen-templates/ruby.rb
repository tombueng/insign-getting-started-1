require "net/http"
require "json"
require "uri"
require "base64"

BASE = "{{BASE_URL}}"
auth = Base64.strict_encode64("{{USERNAME}}:{{PASSWORD}}")
headers = { "Authorization" => "Basic #{auth}" }

{{#if HAS_BODY}}
payload = {{BODY_BUILD}}
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
# 1) {{METHOD}} {{PATH}}
uri = URI("#{BASE}{{PATH}}")
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = uri.scheme == "https"
req = Net::HTTP::{{METHOD_CAPITALIZED}}.new(uri)
req["Authorization"] = "Basic #{auth}"
{{#if HAS_BODY}}
req["Content-Type"] = "{{CONTENT_TYPE}}"
req.body = JSON.generate(payload)
{{/if}}
res = http.request(req)
puts "HTTP #{res.code}"
puts res.body
abort "FAILED: expected HTTP 200, got #{res.code}" unless res.code == "200"
data = JSON.parse(res.body)

# 2) Get status
sid = data["sessionid"]
if sid
  uri2 = URI("#{BASE}/get/status?sessionid=#{sid}")
  req2 = Net::HTTP::Post.new(uri2)
  req2["Authorization"] = "Basic #{auth}"
  req2.content_type = "application/json"
  res2 = Net::HTTP.start(uri2.host, uri2.port, use_ssl: true) { |h| h.request(req2) }
  puts "\n=== Status (HTTP #{res2.code}) ==="
  puts res2.body
  abort "FAILED: get/status returned HTTP #{res2.code}" unless res2.code == "200"
  status = JSON.parse(res2.body)

  # 3) Download document (first doc)
  doc_data = (status["documentData"] || [{}])[0] || {}
  doc_id = doc_data["docid"] || "0"
  uri3 = URI("#{BASE}/get/document?sessionid=#{sid}&docid=#{doc_id}")
  req3 = Net::HTTP::Post.new(uri3)
  req3["Authorization"] = "Basic #{auth}"
  req3.content_type = "application/json"
  res3 = Net::HTTP.start(uri3.host, uri3.port, use_ssl: true) { |h| h.request(req3) }
  puts "\n=== Download (HTTP #{res3.code}) ==="
  if res3.code == "200"
    File.binwrite("document.pdf", res3.body)
    puts "Saved document.pdf (#{res3.body.bytesize} bytes)"
  else
    warn "Download failed: #{res3.body}"
    exit 1
  end
end
