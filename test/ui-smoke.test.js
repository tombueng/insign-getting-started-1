/**
 * UI Smoke Test - clicks through all visible buttons in the application
 * and watches the browser console for errors.
 *
 * Usage:  node test/ui-smoke.test.js [--headed]
 *
 * Requires: npx playwright install chromium
 * The script starts a local static server (npx serve) automatically.
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = 9877;
const BASE_URL = `http://localhost:${PORT}`;
const HEADED = process.argv.includes('--headed');
const SLOW_MO = HEADED ? 80 : 0;
// Buttons that trigger destructive/external actions we want to skip
const SKIP_BUTTON_SELECTORS = [
    '#btn-clear-all-storage',        // wipes localStorage
    '[onclick*="deleteSession"]',    // destructive
    'a[target="_blank"]',            // external links
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the local server to respond */
async function waitForServer(url, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(url, res => { res.resume(); resolve(); });
                req.on('error', reject);
                req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
            });
            return;
        } catch {
            await new Promise(r => setTimeout(r, 300));
        }
    }
    throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

/** Classify a console message */
function isConsoleError(msg) {
    return msg.type() === 'error';
}

/** Check if a button matches any skip selector */
function shouldSkip(selectors, btn) {
    // We'll check this via page.evaluate instead
    return false;
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------
(async () => {
    const results = {
        consoleErrors: [],
        uncaughtExceptions: [],
        clickedButtons: [],
        skippedButtons: [],
        failedClicks: [],
    };

    // --- Start static file server ---
    console.log('[*] Starting static server on port', PORT);
    const server = spawn('npx', ['serve', 'docs', '-l', String(PORT), '--no-clipboard'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', d => { /* silent */ });
    server.stderr.on('data', d => { /* silent */ });

    try {
        await waitForServer(BASE_URL);
        console.log('[*] Server ready at', BASE_URL);

        // --- Launch browser ---
        const browser = await chromium.launch({
            headless: !HEADED,
            slowMo: SLOW_MO,
        });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            ignoreHTTPSErrors: true,
        });
        const page = await context.newPage();

        // --- Capture console errors ---
        page.on('console', msg => {
            if (isConsoleError(msg)) {
                const text = msg.text();
                // Ignore known noise (favicon, font loading, etc.)
                if (text.includes('favicon') || text.includes('ERR_CONNECTION_REFUSED')) return;
                results.consoleErrors.push({
                    text,
                    location: msg.location(),
                    timestamp: new Date().toISOString(),
                });
            }
        });

        // --- Capture uncaught exceptions ---
        page.on('pageerror', error => {
            // Ignore clipboard permission errors (expected in headless mode)
            if (error.message.includes('Clipboard') || error.message.includes('clipboard')) return;
            results.uncaughtExceptions.push({
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString(),
            });
        });

        // --- Navigate to the app ---
        console.log('[*] Loading application...');
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('[*] Page loaded:', await page.title());

        // Give the app time to initialize (Monaco editors, etc.)
        await page.waitForTimeout(2000);

        // --- Walk through each step ---
        const steps = [1, 2, 3, 4];

        for (const step of steps) {
            console.log(`\n[Step ${step}] Navigating...`);

            // Click the step indicator in the navbar
            const stepNav = page.locator(`.step-indicator .step[data-step="${step}"]`);
            if (await stepNav.count() > 0) {
                await stepNav.click();
                await page.waitForTimeout(800);
            }

            // Expand any collapsed sections on this step (click collapsible headers)
            const collapseToggles = page.locator(`#step-${step}-panel [data-bs-toggle="collapse"]`);
            const toggleCount = await collapseToggles.count();
            for (let i = 0; i < toggleCount; i++) {
                try {
                    const toggle = collapseToggles.nth(i);
                    if (await toggle.isVisible()) {
                        await toggle.click();
                        await page.waitForTimeout(300);
                    }
                } catch { /* some toggles may not be interactive */ }
            }

            // --- Click through operation tabs on step 3 ---
            if (step === 3) {
                const opTabs = page.locator('#operation-tabs .nav-link');
                const tabCount = await opTabs.count();
                console.log(`[Step 3] Found ${tabCount} operation tabs`);
                for (let i = 0; i < tabCount; i++) {
                    try {
                        const tab = opTabs.nth(i);
                        if (await tab.isVisible()) {
                            const tabText = (await tab.textContent()).trim();
                            await tab.click();
                            await page.waitForTimeout(300);
                            console.log(`  [Tab] Clicked: ${tabText}`);
                        }
                    } catch (e) {
                        // tab may have become detached
                    }
                }
                // Go back to the first tab
                const firstTab = opTabs.first();
                if (await firstTab.count() > 0) await firstTab.click();
            }

            // --- Collect and click all buttons in the current step panel ---
            // Also handle buttons that are in the general page (navbar, etc.) on step 1
            const scopeSelector = step === 1
                ? `#step-${step}-panel button, .navbar button:not([data-bs-toggle="dropdown"])`
                : `#step-${step}-panel button`;
            const buttons = page.locator(scopeSelector);
            const btnCount = await buttons.count();
            console.log(`[Step ${step}] Found ${btnCount} buttons`);

            for (let i = 0; i < btnCount; i++) {
                const btn = buttons.nth(i);
                try {
                    if (!(await btn.isVisible())) {
                        continue;
                    }

                    // Get button info for logging
                    const btnInfo = await btn.evaluate((el, skipSels) => {
                        // Check skip selectors
                        for (const sel of skipSels) {
                            if (el.matches(sel)) return { skip: true, text: el.textContent.trim(), id: el.id };
                        }
                        return {
                            skip: false,
                            text: el.textContent.trim().substring(0, 60),
                            id: el.id || '',
                            className: el.className.substring(0, 80),
                            tag: el.tagName,
                        };
                    }, SKIP_BUTTON_SELECTORS);

                    if (btnInfo.skip) {
                        results.skippedButtons.push(`[Step ${step}] ${btnInfo.text} (${btnInfo.id})`);
                        continue;
                    }

                    // Skip buttons that would send API requests (we have no backend)
                    const onclick = await btn.getAttribute('onclick') || '';
                    if (onclick.includes('createSession') ||
                        onclick.includes('executeOperation') ||
                        onclick.includes('executeOAuth2') ||
                        onclick.includes('openInSign') ||
                        onclick.includes('openSessionManager') ||
                        onclick.includes('copySessionId') ||
                        onclick.includes('applyNavbarSessionId')) {
                        results.skippedButtons.push(`[Step ${step}] API/External: ${btnInfo.text}`);
                        continue;
                    }

                    // Click it
                    await btn.click({ timeout: 3000 }).catch(() => null);
                    await page.waitForTimeout(150);

                    results.clickedButtons.push(`[Step ${step}] ${btnInfo.text} (${btnInfo.id || btnInfo.className.substring(0, 30)})`);
                } catch (e) {
                    results.failedClicks.push(`[Step ${step}] Button #${i}: ${e.message.substring(0, 100)}`);
                }
            }
        }

        // --- Also click dropdown items and toggle buttons ---
        console.log('\n[*] Testing dropdown menus...');
        const dropdownToggle = page.locator('.dropdown-toggle').first();
        if (await dropdownToggle.isVisible()) {
            await dropdownToggle.click();
            await page.waitForTimeout(300);
            // Click non-link dropdown items
            const dropdownBtns = page.locator('.dropdown-menu button.dropdown-item');
            const ddCount = await dropdownBtns.count();
            for (let i = 0; i < ddCount; i++) {
                try {
                    const item = dropdownBtns.nth(i);
                    if (await item.isVisible()) {
                        const text = (await item.textContent()).trim();
                        await item.click();
                        await page.waitForTimeout(200);
                        results.clickedButtons.push(`[Dropdown] ${text}`);
                    }
                } catch { /* dropdown may close */ }
            }
        }

        // --- Test auth mode toggle ---
        console.log('[*] Testing auth mode toggles...');
        for (const mode of ['oauth2', 'basic']) {
            const authBtn = page.locator(`[data-mode="${mode}"]`);
            if (await authBtn.count() > 0 && await authBtn.isVisible()) {
                await authBtn.click();
                await page.waitForTimeout(300);
                results.clickedButtons.push(`[Auth] Switched to ${mode}`);
            }
        }

        // --- Test file delivery options ---
        console.log('[*] Testing file delivery dropdown...');
        // Navigate to step 2 for this
        await page.locator('.step-indicator .step[data-step="2"]').click();
        await page.waitForTimeout(500);
        const fdToggle = page.locator('#fd-dd-toggle');
        if (await fdToggle.isVisible()) {
            await fdToggle.click();
            await page.waitForTimeout(200);
            for (const fd of ['upload', 'url', 'base64']) {
                const fdItem = page.locator(`[data-fd="${fd}"]`);
                if (await fdItem.isVisible()) {
                    await fdItem.click();
                    await page.waitForTimeout(200);
                    results.clickedButtons.push(`[FileDelivery] ${fd}`);
                    // Re-open dropdown for next option
                    if (fd !== 'base64') {
                        await fdToggle.click();
                        await page.waitForTimeout(200);
                    }
                }
            }
        }

        // --- Final wait for any delayed errors ---
        await page.waitForTimeout(1000);

        // --- Close browser ---
        await browser.close();

        // -----------------------------------------------------------------------
        // Report
        // -----------------------------------------------------------------------
        console.log('\n' + '='.repeat(70));
        console.log('  UI SMOKE TEST REPORT');
        console.log('='.repeat(70));

        console.log(`\n  Buttons clicked:   ${results.clickedButtons.length}`);
        console.log(`  Buttons skipped:   ${results.skippedButtons.length} (API/destructive/external)`);
        console.log(`  Click failures:    ${results.failedClicks.length}`);
        console.log(`  Console errors:    ${results.consoleErrors.length}`);
        console.log(`  Uncaught exceptions: ${results.uncaughtExceptions.length}`);

        if (results.consoleErrors.length > 0) {
            console.log('\n--- CONSOLE ERRORS ---');
            for (const err of results.consoleErrors) {
                console.log(`  [${err.timestamp}] ${err.text}`);
                if (err.location && err.location.url) {
                    console.log(`    at ${err.location.url}:${err.location.lineNumber}`);
                }
            }
        }

        if (results.uncaughtExceptions.length > 0) {
            console.log('\n--- UNCAUGHT EXCEPTIONS ---');
            for (const err of results.uncaughtExceptions) {
                console.log(`  ${err.message}`);
                if (err.stack) {
                    const lines = err.stack.split('\n').slice(0, 3);
                    lines.forEach(l => console.log(`    ${l}`));
                }
            }
        }

        if (results.failedClicks.length > 0) {
            console.log('\n--- FAILED CLICKS ---');
            results.failedClicks.forEach(f => console.log(`  ${f}`));
        }

        if (HEADED) {
            console.log('\n--- CLICKED BUTTONS ---');
            results.clickedButtons.forEach(b => console.log(`  ${b}`));
        }

        console.log('\n' + '='.repeat(70));

        const hasErrors = results.consoleErrors.length > 0 || results.uncaughtExceptions.length > 0;
        if (hasErrors) {
            console.log('  RESULT: FAIL - browser errors detected');
            console.log('='.repeat(70));
            process.exitCode = 1;
        } else {
            console.log('  RESULT: PASS - no browser errors');
            console.log('='.repeat(70));
        }

    } finally {
        // Kill the server
        server.kill('SIGTERM');
        // Also kill any child processes (npx spawns a subprocess)
        try { process.kill(-server.pid, 'SIGTERM'); } catch { /* ignore */ }
    }
})();
