using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

class Program
{
    private static readonly string BaseUrl = "{{BASE_URL}}";
    private static HttpClient _client;

    static async Task Main(string[] args)
    {
        _client = new HttpClient();

        var credentials = Convert.ToBase64String(
            Encoding.UTF8.GetBytes("{{USERNAME}}:{{PASSWORD}}"));
        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Basic", credentials);

{{#if HAS_BODY}}
        // Build request body
{{BODY_BUILD}}

        var content = new StringContent(
            body.ToJsonString(new JsonSerializerOptions { WriteIndented = true }),
            Encoding.UTF8,
            "{{CONTENT_TYPE}}");

{{/if}}
        try
        {
{{CSHARP_CALL}}

            var responseBody = await response.Content.ReadAsStringAsync();
            Console.WriteLine($"HTTP Status: {(int)response.StatusCode}");
            Console.WriteLine(responseBody);

            var json = JsonNode.Parse(responseBody);
            var sessionId = json?["sessionid"]?.ToString();
            if (sessionId != null)
            {
                await GetStatus(sessionId);
                await DownloadDocument(sessionId);
            }
        }
        catch (HttpRequestException ex)
        {
            Console.WriteLine($"Request error: {ex.Message}");
        }
    }

    /// <summary>Check session status — prints completion flag and signature counts</summary>
    static async Task GetStatus(string sessionId)
    {
        var body = new JsonObject { ["sessionid"] = sessionId };
        var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
        var response = await _client.PostAsync(BaseUrl + "/get/status", content);
        var text = await response.Content.ReadAsStringAsync();
        var status = JsonNode.Parse(text);

        Console.WriteLine("\n=== Session Status ===");
        Console.WriteLine($"Successfully completed: {status?["successfullycompleted"]}");
        Console.WriteLine($"Signatures done: {status?["numberofsignaturesdone"]}");
        Console.WriteLine($"Signatures missing: {status?["numberofsignaturesmissing"]}");
    }

    /// <summary>Download signed document(s) and save to disk</summary>
    static async Task DownloadDocument(string sessionId)
    {
        var body = new JsonObject { ["sessionid"] = sessionId };
        var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "/get/documents/download");
        request.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));

        var response = await _client.SendAsync(request);
        if (response.IsSuccessStatusCode)
        {
            var bytes = await response.Content.ReadAsByteArrayAsync();
            var fileName = "signed-document.pdf";
            await File.WriteAllBytesAsync(fileName, bytes);
            Console.WriteLine($"\nDocument saved to: {fileName} ({bytes.Length} bytes)");
        }
        else
        {
            Console.WriteLine($"Download failed: HTTP {(int)response.StatusCode}");
        }
    }
}
