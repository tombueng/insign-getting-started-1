#!/usr/bin/env node
/**
 * Screenshot generator for inSign API Explorer documentation.
 *
 * Usage:
 *   npx playwright install chromium   # one-time setup
 *   node docs/screenshots/take-screenshots.mjs
 *
 * Requires: playwright (npm install playwright)
 * Starts a temporary local HTTP server to serve docs/ so that
 * all dynamic JS (feature toggles, branding, etc.) loads correctly.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '..');
const OUT = __dirname;

// ---------------------------------------------------------------------------
// Minimal static file server for docs/
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
};

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(DOCS, p);
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(fp);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      console.log(`Static server on http://127.0.0.1:${port}`);
      resolve({ srv, port });
    });
  });
}

// ---------------------------------------------------------------------------
// Screenshot helpers
// ---------------------------------------------------------------------------
async function main() {
  const { srv, port } = await startServer();
  const BASE = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  /** Screenshot a single element. Temporarily resizes viewport if `height` is given. */
  async function shot(name, selector, { height } = {}) {
    if (height) await page.setViewportSize({ width: 1440, height });
    await page.waitForTimeout(300);
    const el = await page.$(selector);
    if (!el) { console.warn(`  SKIP  ${name}  (selector not found: ${selector})`); return; }
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await el.screenshot({ path: `${OUT}/${name}.png` });
    if (height) await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    console.log(`  OK    ${name}`);
  }

  /** Full viewport screenshot. Temporarily resizes viewport if `height` is given. */
  async function fullShot(name, { height } = {}) {
    if (height) await page.setViewportSize({ width: 1440, height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    if (height) await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    console.log(`  OK    ${name}`);
  }

  // =========================================================================
  // Load app - force dark mode
  // =========================================================================
  console.log('\nLoading app...');
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('insign-dark-mode', 'true');
  });
  await page.waitForTimeout(300);

  // =========================================================================
  // STEP 1 - Connection & Authentication
  // =========================================================================
  console.log('\n--- Step 1: Connection ---');
  await fullShot('01-overview');
  await shot('02-connection-settings', '#step-1-panel .card-insign:first-child');
  await shot('03-auth-basic', '#step-1-panel .card-insign:nth-child(2)');

  // OAuth2
  await page.click('[data-mode="oauth2"]');
  await page.waitForTimeout(400);
  await shot('04-auth-oauth2', '#step-1-panel .card-insign:nth-child(2)');
  await page.click('[data-mode="basic"]');
  await page.waitForTimeout(200);

  // CORS proxy info (enable proxy, expand info panel, tall viewport)
  await page.evaluate(() => {
    const wrap = document.getElementById('cors-proxy-toggle-wrap');
    if (wrap) wrap.classList.remove('d-none');
    const cb = document.getElementById('cfg-cors-proxy');
    if (cb && !cb.checked) cb.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const info = document.getElementById('cors-proxy-info');
    if (info) info.classList.add('show');
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const el = document.getElementById('cors-proxy-url-group');
    if (el) el.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(300);
  await fullShot('15-cors-proxy-info', { height: 2000 });

  // =========================================================================
  // STEP 2 - Create Session
  // =========================================================================
  console.log('\n--- Step 2: Create Session ---');
  await page.click('[data-step="2"]');
  await page.waitForTimeout(1000);
  await fullShot('05-create-session');

  // Feature configurator - open, expand all groups, tall capture
  await page.click('[data-bs-target="#feature-configurator"]');
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    if (window.app && window.app.expandAllGroups) window.app.expandAllGroups();
  });
  await page.waitForTimeout(600);
  await shot('06-feature-configurator', '#feature-configurator', { height: 8000 });

  // Close features, open branding
  await page.click('[data-bs-target="#feature-configurator"]');
  await page.waitForTimeout(300);
  await page.click('[data-bs-target="#branding-configurator"]');
  await page.waitForTimeout(600);
  await shot('07-branding-css', '#branding-configurator', { height: 4000 });

  // Document selector
  await shot('08-document-selector', '#doc-selector');

  // Request body editor
  await page.evaluate(() => {
    const sections = [...document.querySelectorAll('.section-title')];
    const rb = sections.find(s => s.textContent.includes('Request Body'));
    if (rb) rb.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(500);
  await fullShot('09-request-editor');

  // =========================================================================
  // STEP 3 - Operate & Trace
  // =========================================================================
  console.log('\n--- Step 3: Operate & Trace ---');
  await page.click('[data-step="3"]');
  await page.waitForTimeout(800);
  await fullShot('10-operate-trace');

  // Webhook sidebar
  await shot('16-webhook-sidebar', '#trace-sidebar');

  // =========================================================================
  // STEP 4 - Code Snippets
  // =========================================================================
  console.log('\n--- Step 4: Code Snippets ---');
  await page.click('[data-step="4"]');
  await page.waitForTimeout(800);

  // Click "Java (inSign API)" tab
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.snippet-tab, [data-lang]');
    for (const tab of tabs) {
      if (tab.textContent.includes('inSign API') || tab.textContent.includes('insign')) {
        tab.click();
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  // Enable the "Docs" toggle
  await page.evaluate(() => {
    const toggles = document.querySelectorAll('input[type="checkbox"]');
    for (const t of toggles) {
      const label = t.closest('label') || t.parentElement;
      if (label && label.textContent.includes('Docs') && !t.checked) {
        t.click();
        break;
      }
    }
  });
  await page.waitForTimeout(500);
  await fullShot('12-code-snippets', { height: 2000 });

  // =========================================================================
  // Done
  // =========================================================================
  await browser.close();
  srv.close();

  console.log(`\nAll screenshots saved to ${OUT}/`);
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort();
  console.log(`  ${files.length} files: ${files.join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
