#!/usr/bin/env node
/**
 * build-explorer.js - Assembles docs/explorer.html from partial HTML files.
 *
 * The partials live in docs/partials/explorer/ and contain self-contained
 * sections of the page. This script concatenates them in order to produce
 * the final explorer.html.
 *
 * Content partials (what you edit):
 *   _head.html             - DOCTYPE, <head>, stylesheets
 *   _navbar.html            - Top navigation bar
 *   _step1-connection.html  - Step 1: Connection & Authentication
 *   _step2-session.html     - Step 2: Create Session
 *   _step3-operations.html  - Step 3: Session Operations (all tabs)
 *   _step4-snippets.html    - Step 4: Live Code Snippets
 *   _sidebar.html           - Right sidebar (webhooks, polling, trace)
 *   _templates.html         - <template> elements cloned by JS
 *   _footer.html            - Footer links, app script tags, </body>
 *
 * Glue partials (structural wrappers - rarely edited):
 *   _glue-main-open.html    - Opens container, row, main column
 *   _glue-step2.html        - Section comment before step 2
 *   _glue-step3.html        - Section comment before step 3
 *   _glue-step4.html        - Section comment before step 4
 *   _glue-sidebar.html      - Closes main column, opens sidebar section
 *   _glue-scripts.html      - Closes layout, vendor scripts, overlays
 *   _glue-footer.html       - Blank line between templates and footer
 *
 * Usage:  node scripts/build-explorer.js
 */

const fs = require('fs');
const path = require('path');

const DOCS = path.resolve(__dirname, '..', 'docs');
const PARTIALS = path.join(DOCS, 'partials', 'explorer');
const OUTPUT = path.join(DOCS, 'explorer.html');

// Assembly order - every line of the original is covered
const manifest = [
    '_head.html',               // lines 1-26
    '_navbar.html',             // lines 27-91
    '_glue-main-open.html',     // lines 92-106
    '_step1-connection.html',   // lines 107-501
    '_glue-step2.html',         // lines 502-505
    '_step2-session.html',      // lines 506-925
    '_glue-step3.html',         // lines 926-929
    '_step3-operations.html',   // lines 930-1821
    '_glue-step4.html',         // lines 1822-1825
    '_step4-snippets.html',     // lines 1826-1866
    '_glue-sidebar.html',       // lines 1867-1872
    '_sidebar.html',            // lines 1873-1982
    '_glue-scripts.html',       // lines 1983-2021
    '_templates.html',          // lines 2022-2270
    '_glue-footer.html',        // line 2271
    '_footer.html',             // lines 2272-2299
];

const html = manifest
    .map(name => fs.readFileSync(path.join(PARTIALS, name), 'utf8'))
    .join('');

fs.writeFileSync(OUTPUT, html, 'utf8');

const lines = html.split('\n').length;
console.log(`Built ${OUTPUT} (${lines} lines, ${(html.length / 1024).toFixed(1)} KB)`);
