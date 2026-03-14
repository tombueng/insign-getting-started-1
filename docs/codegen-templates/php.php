<?php

$baseUrl  = '{{BASE_URL}}';
$username = '{{USERNAME}}';
$password = '{{PASSWORD}}';

{{#if HAS_BODY}}
// Build request body as associative array
$payload = {{BODY_BUILD}};

$body = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

{{/if}}
$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL            => $baseUrl . '{{PATH}}',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => '{{METHOD}}',
    CURLOPT_USERPWD        => $username . ':' . $password,
    CURLOPT_HTTPHEADER     => [
{{#if HAS_BODY}}
        'Content-Type: {{CONTENT_TYPE}}',
{{/if}}
    ],
{{#if HAS_BODY}}
    CURLOPT_POSTFIELDS    => $body,
{{/if}}
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error    = curl_error($ch);
curl_close($ch);

if ($error) {
    echo "cURL Error: " . $error . "\n";
    exit(1);
}

echo "HTTP Status: " . $httpCode . "\n";

$decoded = json_decode($response, true);
if (json_last_error() === JSON_ERROR_NONE) {
    print_r($decoded);
} else {
    echo "Response: " . $response . "\n";
}

$sessionId = $decoded['sessionid'] ?? null;
if ($sessionId) {
    getStatus($baseUrl, $username, $password, $sessionId);
    downloadDocument($baseUrl, $username, $password, $sessionId);
}

/**
 * Check session status — prints completion flag and signature counts
 */
function getStatus($baseUrl, $username, $password, $sessionId) {
    $ch = curl_init($baseUrl . '/get/status');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => 'POST',
        CURLOPT_USERPWD        => $username . ':' . $password,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode(['sessionid' => $sessionId]),
    ]);
    $response = curl_exec($ch);
    curl_close($ch);

    $status = json_decode($response, true);
    echo "\n=== Session Status ===\n";
    echo "Successfully completed: " . ($status['successfullycompleted'] ? 'true' : 'false') . "\n";
    echo "Signatures done: " . ($status['numberofsignaturesdone'] ?? 0) . "\n";
    echo "Signatures missing: " . ($status['numberofsignaturesmissing'] ?? 0) . "\n";
}

/**
 * Download signed document(s) and save to disk
 */
function downloadDocument($baseUrl, $username, $password, $sessionId) {
    $ch = curl_init($baseUrl . '/get/documents/download');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => 'POST',
        CURLOPT_USERPWD        => $username . ':' . $password,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: */*'],
        CURLOPT_POSTFIELDS     => json_encode(['sessionid' => $sessionId]),
    ]);
    $data = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        $filename = 'signed-document.pdf';
        file_put_contents($filename, $data);
        echo "\nDocument saved to: " . $filename . " (" . strlen($data) . " bytes)\n";
    } else {
        echo "Download failed: HTTP " . $httpCode . "\n";
    }
}
