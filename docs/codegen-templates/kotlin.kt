// Kotlin — run as script: kotlinc -script insign.kts
//          or compile:    kotlinc insign.kt -include-runtime -d insign.jar && java -jar insign.jar
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.util.Base64
import com.google.gson.JsonObject
import com.google.gson.JsonArray
import com.google.gson.JsonParser

val base = "{{BASE_URL}}"
val auth = "Basic " + Base64.getEncoder().encodeToString("{{USERNAME}}:{{PASSWORD}}".toByteArray())
val client = HttpClient.newHttpClient()

{{#if HAS_BODY}}
// Build request body
{{BODY_BUILD}}
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
// 1) {{METHOD}} {{PATH}}
val req = HttpRequest.newBuilder()
    .uri(URI.create("$base{{PATH}}"))
    .header("Authorization", auth)
{{#if HAS_BODY}}
    .header("Content-Type", "{{CONTENT_TYPE}}")
    .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
{{/if}}
{{#unless HAS_BODY}}
    .method("{{METHOD}}", HttpRequest.BodyPublishers.noBody())
{{/unless}}
    .build()
val res = client.send(req, HttpResponse.BodyHandlers.ofString())
println("HTTP ${res.statusCode()}")
println(res.body())
check(res.statusCode() == 200) { "FAILED: expected 200, got ${res.statusCode()}" }
val data = JsonParser.parseString(res.body()).asJsonObject

// 2) Get status
val sid = data.get("sessionid")?.asString
if (sid != null) {
    val req2 = HttpRequest.newBuilder()
        .uri(URI.create("$base/get/status?sessionid=$sid"))
        .header("Authorization", auth)
        .POST(HttpRequest.BodyPublishers.noBody())
        .build()
    val res2 = client.send(req2, HttpResponse.BodyHandlers.ofString())
    println("\n=== Status (HTTP ${res2.statusCode()}) ===")
    println(res2.body())
    check(res2.statusCode() == 200) { "FAILED: get/status returned HTTP ${res2.statusCode()}" }
    val status = JsonParser.parseString(res2.body()).asJsonObject

    // 3) Download document (first doc)
    val docId = status.getAsJsonArray("documentData")
        ?.get(0)?.asJsonObject
        ?.get("docid")?.asString ?: "0"
    val req3 = HttpRequest.newBuilder()
        .uri(URI.create("$base/get/document?sessionid=$sid&docid=$docId"))
        .header("Authorization", auth)
        .POST(HttpRequest.BodyPublishers.noBody())
        .build()
    val res3 = client.send(req3, HttpResponse.BodyHandlers.ofByteArray())
    println("\n=== Download (HTTP ${res3.statusCode()}) ===")
    if (res3.statusCode() == 200) {
        Files.write(Path.of("document.pdf"), res3.body())
        println("Saved document.pdf (${res3.body().size} bytes)")
    } else {
        System.err.println("Download failed: ${String(res3.body())}")
        kotlin.system.exitProcess(1)
    }
}
