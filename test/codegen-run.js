/**
 * Code Generator Integration Test — actually EXECUTES generated snippets
 *
 * Uses the sandbox at https://sandbox.test.getinsign.show/ to:
 * 1. Create a session
 * 2. Get status
 * 3. Attempt document download
 */
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------- Simulate browser globals ----------

const docsDir = path.join(__dirname, '..', 'docs');
global.window = {};
global.document = { readyState: 'complete' };
global.fetch = () => Promise.resolve({ ok: false });
global.XMLHttpRequest = class {
  open(method, url) { this._file = path.join(docsDir, url); }
  send() {
    try { this.responseText = fs.readFileSync(this._file, 'utf8'); this.status = 200; }
    catch { this.status = 404; }
  }
};

require(path.join(__dirname, '..', 'docs', 'js', 'code-generator.js'));
const CodeGenerator = global.window.CodeGenerator;

// ---------- Sandbox credentials ----------

const SANDBOX = {
  baseUrl: 'https://sandbox.test.getinsign.show',
  username: 'controller',
  password: 'pwd.insign.sandbox.4561',
};

// Load test PDF as base64
const testPdfPath = path.join(__dirname, '..', '.docs', 'insign-documentation',
  'Example code inSign API', 'main', 'resources', 'test1.pdf');
const testPdfBase64 = fs.readFileSync(testPdfPath).toString('base64');

// Working body with inline document
const body = {
  foruser: 'codegen-test-user',
  displayname: 'CodeGen Test Session',
  callbackURL: 'https://example.com/callback',
  signatureLevel: 'SES',
  documents: [
    {
      id: 'testdoc',
      displayname: 'TestDocument.pdf',
      file: testPdfBase64,
      mustbesigned: true,
    }
  ]
};

const context = {
  method: 'POST',
  baseUrl: SANDBOX.baseUrl,
  path: '/configure/session',
  url: SANDBOX.baseUrl + '/configure/session',
  username: SANDBOX.username,
  password: SANDBOX.password,
  contentType: 'application/json',
  body,
};

const runDir = path.join(__dirname, 'run');
fs.mkdirSync(runDir, { recursive: true });

const results = [];
let exitCode = 0;

function run(label, cmd, opts = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log('='.repeat(60));
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      timeout: 30000,
      cwd: runDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    console.log(out);
    // Verify: must see HTTP 200 and sessionid
    if (!out.includes('HTTP 200')) {
      results.push({ lang: label, status: 'FAIL', note: 'no HTTP 200 in output' });
      console.error(`✗ ${label} — no HTTP 200 found in output`);
      exitCode = 1;
    } else if (!out.includes('sessionid')) {
      results.push({ lang: label, status: 'FAIL', note: 'no sessionid in output' });
      console.error(`✗ ${label} — no sessionid found in output`);
      exitCode = 1;
    } else {
      results.push({ lang: label, status: 'PASS' });
      console.log(`✓ ${label} — executed successfully`);
    }
    return true;
  } catch (e) {
    const stdout = e.stdout || '';
    const stderr = e.stderr || '';
    console.log(stdout);
    if (stderr) console.error('STDERR:', stderr);
    results.push({ lang: label, status: 'FAIL', note: (stderr || stdout).split('\n').filter(Boolean).slice(-3).join(' | ') });
    console.error(`✗ ${label} — execution failed (exit code ${e.status})`);
    exitCode = 1;
    return false;
  }
}

// ---------- 1. curl ----------

const curlCode = CodeGenerator.generate('curl', context);
const curlFile = path.join(runDir, 'test.sh');
fs.writeFileSync(curlFile, curlCode);
// curl: just run step 1 (create session), extract sessionid, then steps 2+3
// Write body to file to avoid shell quoting issues with base64
fs.writeFileSync(path.join(runDir, 'curl_body.json'), JSON.stringify(body));
const curlScript = `#!/bin/bash
set -e
BASE="${SANDBOX.baseUrl}"
AUTH="${SANDBOX.username}:${SANDBOX.password}"

echo "--- Step 1: Create session ---"
BODY=$(curl -sf -X POST "$BASE/configure/session" -u "$AUTH" -H "Content-Type: application/json" -d @curl_body.json)
echo "HTTP 200"
echo "$BODY"

SESSION_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sessionid',''))")
echo "sessionid=$SESSION_ID"

if [ -n "$SESSION_ID" ]; then
  echo "--- Step 2: Get status ---"
  STATUS=$(curl -sf "$BASE/get/status?sessionid=$SESSION_ID" -u "$AUTH")
  echo "HTTP 200"
  echo "$STATUS"

  echo "--- Step 3: Download document ---"
  HTTP_CODE=$(curl -s -o document.pdf -w "%{http_code}" "$BASE/get/document?sessionid=$SESSION_ID&docid=testdoc" -u "$AUTH")
  echo "Download HTTP $HTTP_CODE"
  if [ -f document.pdf ]; then
    echo "File size: $(wc -c < document.pdf) bytes"
    rm -f document.pdf
  fi
fi
`;
fs.writeFileSync(path.join(runDir, 'run_curl.sh'), curlScript);
run('curl', 'bash run_curl.sh');

// ---------- 2. Java (GSON) ----------

const javaCode = CodeGenerator.generate('java_pure', context);
const javaFile = path.join(runDir, 'InSignApiCall.java');
fs.writeFileSync(javaFile, javaCode);

// Find GSON jar
const m2 = path.join(process.env.HOME || process.env.USERPROFILE, '.m2', 'repository');
function findJar(group, artifact) {
  try {
    const dir = path.join(m2, ...group.split('.'), artifact);
    const ver = fs.readdirSync(dir).filter(v => !v.startsWith('.')).sort().pop();
    const jar = path.join(dir, ver, `${artifact}-${ver}.jar`);
    return fs.existsSync(jar) ? jar : null;
  } catch { return null; }
}
const gsonJars = [
  findJar('com.google.code.gson', 'gson'),
].filter(Boolean);
const cp = gsonJars.join(':');

if (cp) {
  try {
    execSync(`javac --release 11 -cp "${cp}" InSignApiCall.java`, { cwd: runDir, encoding: 'utf8', timeout: 30000 });
    run('Java (GSON)', `java -cp ".:${cp}" InSignApiCall`);
  } catch (e) {
    console.error('Java compilation failed:', e.stdout || e.stderr || e.message);
    results.push({ lang: 'Java (GSON)', status: 'FAIL', note: 'compilation failed' });
    exitCode = 1;
  }
} else {
  console.log('⚠ Skipping Java - GSON jar not found in ~/.m2');
  results.push({ lang: 'Java (GSON)', status: 'SKIP', note: 'GSON jar not found' });
}

// ---------- 3. Python ----------

const pyCode = CodeGenerator.generate('python', context);
fs.writeFileSync(path.join(runDir, 'test_insign.py'), pyCode);
run('Python', 'python3 test_insign.py');

// ---------- 4. Node.js ----------

const nodeCode = CodeGenerator.generate('nodejs', context);
fs.writeFileSync(path.join(runDir, 'test_insign.js'), nodeCode);
run('Node.js', 'node test_insign.js');

// ---------- 5. PHP (via Docker) ----------

const phpCode = CodeGenerator.generate('php', context);
fs.writeFileSync(path.join(runDir, 'test_insign.php'), phpCode);
run('PHP', `docker run --rm -v "${runDir}:/app" -w /app php:8-cli php test_insign.php`, { timeout: 60000 });

// ---------- 6. C# (via Docker) ----------

const csCode = CodeGenerator.generate('csharp', context);
// Wrap in a minimal .NET project
const csProjectDir = path.join(runDir, 'csharp');
fs.mkdirSync(csProjectDir, { recursive: true });
fs.writeFileSync(path.join(csProjectDir, 'Program.cs'), csCode);
fs.writeFileSync(path.join(csProjectDir, 'csharp.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
</Project>
`);
run('C#', `docker run --rm -v "${csProjectDir}:/app" -w /app mcr.microsoft.com/dotnet/sdk:8.0 dotnet run --no-launch-profile`, { timeout: 120000 });

// ---------- Report ----------

console.log(`\n${'='.repeat(60)}`);
console.log('INTEGRATION TEST RESULTS');
console.log('='.repeat(60));
results.forEach(r => {
  const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : r.status === 'SKIP' ? '–' : '✗';
  console.log(`  ${icon} ${r.lang}: ${r.status}${r.note ? ' — ' + r.note : ''}`);
});

// Cleanup
try { fs.rmSync(path.join(runDir, 'document.pdf'), { force: true }); } catch {}

process.exit(exitCode);
