/**
 * UI Smoke Test - loads the application, clicks through visible interactive
 * elements, and watches the browser console for errors.
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

// onclick handlers that call the real API (no backend in test)
const SKIP_ONCLICK_PATTERNS = [
    'sendStep',
    'openInInsign',
    'openAsOwner',
    'refreshSessionStatus',
    'copySessionId',
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
        await page.waitForTimeout(3000);

        // -----------------------------------------------------------------
        // Step 1 - visible on load
        // -----------------------------------------------------------------
        console.log('\n[Step 1] Checking initial page...');
        const step1 = page.locator('#step1');
        const step1Visible = await step1.isVisible();
        console.log(`[Step 1] Visible: ${step1Visible}`);

        // Click safe buttons in step 1 (skip API-calling ones)
        await clickSafeButtons(page, '#step1', results, 1);

        // -----------------------------------------------------------------
        // Navbar interactions
        // -----------------------------------------------------------------
        console.log('\n[*] Testing navbar...');

        // Dark mode toggle
        const darkModeBtn = page.locator('#btn-dark-mode');
        if (await darkModeBtn.isVisible()) {
            await darkModeBtn.click();
            await page.waitForTimeout(300);
            results.clickedButtons.push('[Navbar] Dark mode toggle');

            // Toggle back
            await darkModeBtn.click();
            await page.waitForTimeout(300);
            results.clickedButtons.push('[Navbar] Dark mode toggle back');
        }

        // Dropdown menu
        console.log('[*] Testing dropdown menus...');
        const dropdownToggle = page.locator('.dropdown-toggle').first();
        if (await dropdownToggle.isVisible()) {
            await dropdownToggle.click();
            await page.waitForTimeout(300);

            const dropdownItems = page.locator('.dropdown-menu .dropdown-item');
            const ddCount = await dropdownItems.count();
            console.log(`[*] Found ${ddCount} dropdown items`);

            // Close dropdown without clicking destructive items
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            results.clickedButtons.push('[Dropdown] Opened and closed');
        }

        // -----------------------------------------------------------------
        // Feature showcase (resources section)
        // -----------------------------------------------------------------
        console.log('\n[*] Testing feature showcase...');
        const featureItems = page.locator('.feature-item');
        const featureCount = await featureItems.count();
        console.log(`[*] Found ${featureCount} feature items`);

        for (let i = 0; i < featureCount; i++) {
            try {
                const item = featureItems.nth(i);
                if (await item.isVisible()) {
                    await item.click();
                    await page.waitForTimeout(200);
                    results.clickedButtons.push(`[Feature] Item ${i + 1}`);
                }
            } catch { /* item may not be clickable */ }
        }

        // -----------------------------------------------------------------
        // Use cheat buttons to reveal hidden steps (if they exist)
        // -----------------------------------------------------------------
        console.log('\n[*] Trying cheat buttons to reveal steps...');

        // cheatCreateSession() reveals steps 2-4
        const cheatBtn = page.locator('.cheat-btn').first();
        if (await cheatBtn.count() > 0) {
            try {
                // Cheat buttons are nearly invisible (opacity 0.3), force click
                await cheatBtn.click({ force: true, timeout: 3000 });
                await page.waitForTimeout(1000);
                results.clickedButtons.push('[Cheat] Skipped step 1');
                console.log('[*] Cheat button clicked, steps revealed');
            } catch {
                console.log('[*] Could not click cheat button');
            }
        }

        // Check if step 2 is now visible
        for (const stepNum of [2, 3, 4]) {
            const stepEl = page.locator(`#step${stepNum}`);
            if (await stepEl.isVisible()) {
                console.log(`\n[Step ${stepNum}] Now visible, checking buttons...`);
                await clickSafeButtons(page, `#step${stepNum}`, results, stepNum);
            } else {
                console.log(`\n[Step ${stepNum}] Not visible (skipping)`);
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

// ---------------------------------------------------------------------------
// Click all safe (non-API, non-destructive) buttons within a scope
// ---------------------------------------------------------------------------
async function clickSafeButtons(page, scopeSelector, results, stepLabel) {
    const buttons = page.locator(`${scopeSelector} button`);
    const btnCount = await buttons.count();
    console.log(`[Step ${stepLabel}] Found ${btnCount} buttons`);

    for (let i = 0; i < btnCount; i++) {
        const btn = buttons.nth(i);
        try {
            if (!(await btn.isVisible())) continue;

            // Get button info
            const btnInfo = await btn.evaluate((el, skipSels) => {
                for (const sel of skipSels) {
                    if (el.matches(sel)) return { skip: true, text: el.textContent.trim(), id: el.id };
                }
                return {
                    skip: false,
                    text: el.textContent.trim().substring(0, 60),
                    id: el.id || '',
                    className: el.className.substring(0, 80),
                };
            }, SKIP_BUTTON_SELECTORS);

            if (btnInfo.skip) {
                results.skippedButtons.push(`[Step ${stepLabel}] ${btnInfo.text} (${btnInfo.id})`);
                continue;
            }

            // Skip buttons with API-calling onclick handlers
            const onclick = await btn.getAttribute('onclick') || '';
            const shouldSkip = SKIP_ONCLICK_PATTERNS.some(pat => onclick.includes(pat));
            if (shouldSkip) {
                results.skippedButtons.push(`[Step ${stepLabel}] API: ${btnInfo.text}`);
                continue;
            }

            // Click it
            await btn.click({ timeout: 3000 }).catch(() => null);
            await page.waitForTimeout(150);
            results.clickedButtons.push(`[Step ${stepLabel}] ${btnInfo.text} (${btnInfo.id || btnInfo.className.substring(0, 30)})`);
        } catch (e) {
            results.failedClicks.push(`[Step ${stepLabel}] Button #${i}: ${e.message.substring(0, 100)}`);
        }
    }
}
