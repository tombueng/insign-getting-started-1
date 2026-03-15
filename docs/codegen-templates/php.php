<?php

$base = '{{BASE_URL}}';
$auth = '{{USERNAME}}:{{PASSWORD}}';

{{#if HAS_BODY}}
$payload = {{BODY_BUILD}};
{{SAMPLES}}

{{FILE_COMMENT}}
{{/if}}
// 1) {{METHOD}} {{PATH}}
$ch = curl_init($base . '{{PATH}}');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => '{{METHOD}}',
    CURLOPT_USERPWD        => $auth,
{{#if HAS_BODY}}
    CURLOPT_HTTPHEADER     => ['Content-Type: {{CONTENT_TYPE}}'],
    CURLOPT_POSTFIELDS     => json_encode($payload),
{{/if}}
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
unset($ch);

echo "HTTP $httpCode\n";
echo "$response\n";
if ($httpCode !== 200) {
    fwrite(STDERR, "FAILED: expected HTTP 200, got $httpCode\n");
    exit(1);
}

$data = json_decode($response, true);

// 2) Get status
$sid = $data['sessionid'] ?? null;
if ($sid) {
    $ch2 = curl_init($base . '/get/status?sessionid=' . urlencode($sid));
    curl_setopt_array($ch2, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_USERPWD        => $auth,
    ]);
    $statusResp = curl_exec($ch2);
    $statusCode = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
    unset($ch2);

    echo "\n=== Status (HTTP $statusCode) ===\n";
    echo "$statusResp\n";
    if ($statusCode !== 200) {
        fwrite(STDERR, "FAILED: get/status returned HTTP $statusCode\n");
        exit(1);
    }
    $status = json_decode($statusResp, true);

    // 3) Download document (first doc)
    $docId = $status['documentData'][0]['docid'] ?? '0';
    $ch3 = curl_init($base . '/get/document?sessionid=' . urlencode($sid) . '&docid=' . urlencode($docId));
    curl_setopt_array($ch3, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_USERPWD        => $auth,
    ]);
    $doc = curl_exec($ch3);
    $docCode = curl_getinfo($ch3, CURLINFO_HTTP_CODE);
    unset($ch3);

    echo "\n=== Download (HTTP $docCode) ===\n";
    if ($docCode === 200) {
        file_put_contents('document.pdf', $doc);
        echo "Saved document.pdf (" . strlen($doc) . " bytes)\n";
    } else {
        fwrite(STDERR, "Download failed: $doc\n");
        exit(1);
    }
}
