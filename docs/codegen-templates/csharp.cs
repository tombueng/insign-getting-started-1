using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes("{{USERNAME}}:{{PASSWORD}}"));
var http = new HttpClient { BaseAddress = new Uri("{{BASE_URL}}") };
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", credentials);

{{#if HAS_BODY}}
// Build request body
{{BODY_BUILD}}
{{SAMPLES}}

var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "{{CONTENT_TYPE}}");

{{FILE_COMMENT}}
{{/if}}
// 1) {{METHOD}} {{PATH}}
{{CSHARP_CALL}}
var text = await response.Content.ReadAsStringAsync();
Console.WriteLine($"HTTP {(int)response.StatusCode}");
Console.WriteLine(text);
if (!response.IsSuccessStatusCode)
{
    Console.Error.WriteLine($"FAILED: expected HTTP 200, got {(int)response.StatusCode}");
    return;
}

// 2) Get status
var sessionId = JsonNode.Parse(text)?["sessionid"]?.ToString();
if (sessionId != null)
{
    var r2 = await http.PostAsync($"/get/status?sessionid={sessionId}", null);
    var statusText = await r2.Content.ReadAsStringAsync();
    Console.WriteLine($"\n=== Status (HTTP {(int)r2.StatusCode}) ===");
    Console.WriteLine(statusText);
    if (!r2.IsSuccessStatusCode)
    {
        Console.Error.WriteLine($"FAILED: get/status returned HTTP {(int)r2.StatusCode}");
        return;
    }
    var status = JsonNode.Parse(statusText);

    // 3) Download document (first doc)
    var docId = status?["documentData"]?[0]?["docid"]?.ToString() ?? "0";
    var r3 = await http.PostAsync($"/get/document?sessionid={sessionId}&docid={docId}", null);
    Console.WriteLine($"\n=== Download (HTTP {(int)r3.StatusCode}) ===");
    if (r3.IsSuccessStatusCode)
    {
        var doc = await r3.Content.ReadAsByteArrayAsync();
        await File.WriteAllBytesAsync("document.pdf", doc);
        Console.WriteLine($"Saved document.pdf ({doc.Length} bytes)");
    }
    else
    {
        var err = await r3.Content.ReadAsStringAsync();
        Console.Error.WriteLine($"Download failed: {err}");
    }
}
