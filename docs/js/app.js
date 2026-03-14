/* ==========================================================================
   inSign API Explorer — Main Application
   Orchestrates Monaco editors, API calls, UI state, code generation
   ========================================================================== */

(function () {
    'use strict';

    // =====================================================================
    // State
    // =====================================================================

    const state = {
        sessionId: null,
        accessURL: null,
        accessURLProcessManagement: null,
        currentStep: 1,
        editors: {},
        apiClient: null,
        webhookViewer: null,
        webhookUrl: null,             // resolved webhook URL (set once endpoint is created)
        demoData: null,
        userId: getOrCreateUserId(),  // persistent UUID for foruser
        selectedDoc: 'sigtags',
        fileDelivery: 'base64',       // 'base64' | 'upload' | 'url'
        customFileData: null,         // { name, base64, blob } when user picks own file
        discoveredRoles: null,        // ['seller','buyer'] from /get/documents/full
        discoveredFields: null,       // [{role, name, required, signed}]
        pdfViewer: null,              // PdfViewer instance
        lastRequest: null,            // { method, path, body } for code generation
        schemaLoader: new window.OpenApiSchemaLoader(),
        monacoReady: false,
        _editorSyncLock: false,        // prevent infinite loops during bidirectional sync
        webhookProvider: 'webhook.site' // current webhook provider
    };

    /** Generate a stable human-readable user ID stored in localStorage */
    function getOrCreateUserId() {
        const key = 'insign-explorer-userid';
        let id = null;
        try { id = localStorage.getItem(key); } catch { /* ignore */ }
        // Regenerate if old-style UUID
        if (id && id.length > 20) id = null;
        if (!id) {
            const names = [
                'alex', 'chris', 'dana', 'emma', 'finn', 'greta', 'hanna', 'ivan',
                'julia', 'karl', 'lena', 'max', 'nina', 'oscar', 'petra', 'robin',
                'sara', 'tom', 'vera', 'willi', 'yara', 'zoe', 'ben', 'clara',
                'david', 'elena', 'felix', 'gina', 'hugo', 'ida', 'jan', 'lea'
            ];
            const name = names[Math.floor(Math.random() * names.length)];
            const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)),
                b => b.toString(16).padStart(2, '0')).join('');
            id = name + '-' + hex;
            try { localStorage.setItem(key, id); } catch { /* ignore */ }
        }
        return id;
    }

    /** Build the callbackURL pointing back to this page at #step2 */
    function getCallbackUrl() {
        const loc = window.location;
        return loc.origin + loc.pathname + '#step2';
    }

    /** Webhook provider configuration */
    const WEBHOOK_PROVIDERS = {
        'webhook.site':   { label: 'webhook.site',       hint: 'Free, no signup. Auto-creates endpoint, polls for requests every 4s.', postOnly: false },
        smee:             { label: 'smee.io',             hint: 'Real-time SSE stream. POST callbacks only. GitHub service.', postOnly: true },
        postbin:          { label: 'postb.in (Toptal)',   hint: 'Free, no signup. FIFO request queue, 30min bin lifetime.', postOnly: false },
        ntfy:             { label: 'ntfy.sh (abuse!)',    hint: 'Notification pub/sub abused as webhook relay. SSE real-time. JSON body may be truncated.', postOnly: false },
        cfworker:         { label: 'CF Worker (self-deploy)', hint: 'Deploy cf-webhook-worker.js to your Cloudflare account. Free, your own relay.', postOnly: false, needsCustomUrl: true },
        custom:           { label: 'Custom URL',          hint: 'Enter your own webhook endpoint URL.', postOnly: false, needsCustomUrl: true }
    };

    // =====================================================================
    // Document catalog & URL helpers
    // =====================================================================

    /** Available test documents with metadata */
    const DOCUMENTS = {
        sigtags: {
            label: 'Car Contract (SIG-Tags)', local: 'data/contract-sigtags.pdf', scanSigTags: true,
            pages: 1, sigFields: 0, sigTags: 2, required: 2, optional: 0, roles: ['seller', 'buyer'],
            desc: '1 page \u2022 2 SIG-tags \u2022 2 required \u2022 roles: seller, buyer'
        },
        sigfields: {
            label: 'Car Contract (AcroForm)', local: 'data/contract-sigfields.pdf', scanSigTags: false,
            pages: 1, sigFields: 2, sigTags: 0, required: 0, optional: 2, roles: ['seller', 'buyer'],
            desc: '1 page \u2022 2 signature fields \u2022 roles: seller, buyer'
        },
        street_sigtags: {
            label: 'Street Work Contract (SIG-Tags)', local: 'data/street-work-sigtags.pdf', scanSigTags: true,
            pages: 1, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['broker', 'customer', 'agency'],
            desc: '1 page \u2022 3 SIG-tags \u2022 3 required \u2022 roles: broker, customer, agency'
        },
        street_sigfields: {
            label: 'Street Work Contract (AcroForm)', local: 'data/street-work-sigfields.pdf', scanSigTags: false,
            pages: 1, sigFields: 3, sigTags: 0, required: 0, optional: 3, roles: ['broker', 'customer', 'agency'],
            desc: '1 page \u2022 3 signature fields \u2022 roles: broker, customer, agency'
        },
        custom: {
            label: 'Your Own File', local: null, scanSigTags: false,
            pages: null, sigFields: null, sigTags: null, required: null, optional: null, roles: [],
            desc: 'Upload a PDF from your disk'
        }
    };

    function getSelectedDocument() {
        return DOCUMENTS[state.selectedDoc] || DOCUMENTS.sigtags;
    }

    /** URL the inSign server can fetch (for URL delivery mode) */
    function getDocumentAbsoluteUrl() {
        const doc = getSelectedDocument();
        if (doc.local) {
            const loc = window.location;
            return loc.href.replace(/\/[^/]*$/, '/') + doc.local;
        }
        return '';
    }

    /** Relative path for browser fetch (base64/upload modes) */
    function getDocumentRelativeUrl() {
        const doc = getSelectedDocument();
        if (doc.local) return doc.local;
        return '';
    }

    function getDocumentFilename() {
        if (state.selectedDoc === 'custom' && state.customFileData) return state.customFileData.name;
        const doc = getSelectedDocument();
        const path = doc.local || '';
        return path.split('/').pop() || 'document.pdf';
    }

    /** Fetch a PDF and return as { base64, blob } */
    async function fetchDocumentAsBase64(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to fetch document: ' + resp.status);
        const blob = await resp.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve({ base64, blob });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /** Load the selected document as base64 (demo, repo, or custom) */
    async function loadDocumentData() {
        if (state.selectedDoc === 'custom') {
            if (!state.customFileData) throw new Error('No custom file selected');
            return { base64: state.customFileData.base64, blob: state.customFileData.blob };
        }
        return fetchDocumentAsBase64(getDocumentRelativeUrl());
    }

    /** Preview the currently selected document in the PDF viewer */
    async function previewDocument() {
        if (!state.pdfViewer) return;
        const doc = getSelectedDocument();
        if (state.selectedDoc === 'custom' && state.customFileData) {
            state.pdfViewer.show(state.customFileData.blob, { title: state.customFileData.name, fileSize: state.customFileData.blob.size });
        } else {
            const url = getDocumentRelativeUrl();
            state.pdfViewer.show(url, { title: doc.label });
        }
    }

    /** Preview a blob (e.g. downloaded document) */
    function previewBlob(blob, title) {
        if (!state.pdfViewer) return;
        state.pdfViewer.show(blob, { title: title || 'Downloaded Document', fileSize: blob.size });
    }

    // =====================================================================
    // Feature configurator — visual toggles for session properties
    // =====================================================================

    // Feature groups & descriptions loaded from external JSON
    let featureDescriptions = {}; // key -> { globalProperty, description }
    let FEATURE_GROUPS = [];

    async function loadFeatureData() {
        try {
            const resp = await fetch('data/feature-descriptions.json');
            if (resp.ok) {
                const data = await resp.json();
                // Load feature groups
                if (data.featureGroups) {
                    FEATURE_GROUPS = data.featureGroups;
                }
                // Load descriptions (from the array or from per-group features)
                const descArr = data.featureDescriptions || [];
                for (const item of descArr) {
                    featureDescriptions[item.key] = item;
                }
            }
        } catch { /* feature data is optional — graceful fallback */ }
    }

    function getFeatureDesc(key, fallback) {
        const entry = featureDescriptions[key];
        return entry ? entry.description : fallback;
    }

    function getGlobalProperty(key) {
        const entry = featureDescriptions[key];
        return entry ? entry.globalProperty : null;
    }

    const FEATURE_STORE_KEY = 'insign-feature-settings';
    const STATE_STORE_KEY = 'insign-explorer-state';

    function loadFeatureSettings() {
        try {
            const raw = localStorage.getItem(FEATURE_STORE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    function saveFeatureSettings(settings) {
        try { localStorage.setItem(FEATURE_STORE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
    }

    // =====================================================================
    // Persistent app state (survives reload / browser restart)
    // =====================================================================

    function saveAppState() {
        const saveCredentials = $('#cfg-save-credentials').is(':checked');
        const data = {
            sessionId: state.sessionId,
            accessURL: state.accessURL,
            webhookProvider: state.webhookProvider,
            webhookUrl: state.webhookUrl,
            selectedDoc: state.selectedDoc,
            fileDelivery: state.fileDelivery,
            corsProxy: $('#cfg-cors-proxy').is(':checked'),
            corsProxyUrl: $('#cfg-cors-proxy-url').val() || '',
            webhooksEnabled: $('#cfg-webhooks').length ? $('#cfg-webhooks').is(':checked') : true,
            displayname: $('#cfg-displayname').val() || '',
            userfullname: $('#cfg-userfullname').val() || '',
            userEmail: $('#cfg-userEmail').val() || '',
            pollingEnabled: $('#sidebar-polling-toggle').is(':checked'),
            saveCredentials
        };
        if (saveCredentials) {
            data.baseUrl = $('#cfg-base-url').val() || '';
            data.username = $('#cfg-username').val() || '';
            data.password = $('#cfg-password').val() || '';
        }
        try { localStorage.setItem(STATE_STORE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    }

    function loadAppState() {
        try {
            const raw = localStorage.getItem(STATE_STORE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function restoreAppState() {
        const saved = loadAppState();
        if (!saved) return;

        // Restore "remember credentials" checkbox and connection settings
        const $saveCreds = $('#cfg-save-credentials');
        if ($saveCreds.length && saved.saveCredentials) {
            $saveCreds.prop('checked', true);
            if (saved.baseUrl) {
                $('#cfg-base-url').val(saved.baseUrl);
            }
            if (saved.username) {
                $('#cfg-username').val(saved.username);
            }
            if (saved.password) {
                $('#cfg-password').val(saved.password);
            }
        }

        // Restore CORS proxy
        const $corsToggle = $('#cfg-cors-proxy');
        if ($corsToggle.length && saved.corsProxy) {
            $corsToggle.prop('checked', true);
            $('#cors-proxy-url-group').css('display', '');
        }
        if (saved.corsProxyUrl) {
            $('#cfg-cors-proxy-url').val(saved.corsProxyUrl);
        }

        // Restore webhooks toggle
        const $whToggle = $('#cfg-webhooks');
        if ($whToggle.length) {
            $whToggle.prop('checked', saved.webhooksEnabled !== false);
            const $providerGroup = $('#webhook-provider-group');
            if ($providerGroup.length) $providerGroup.css('display', $whToggle.is(':checked') ? '' : 'none');
        }

        // Restore webhook provider
        if (saved.webhookProvider) {
            state.webhookProvider = saved.webhookProvider;
            $('#cfg-webhook-provider').val(saved.webhookProvider);
        }

        // Restore owner fields
        if (saved.displayname) {
            $('#cfg-displayname').val(saved.displayname);
        }
        if (saved.userfullname) {
            $('#cfg-userfullname').val(saved.userfullname);
        }
        if (saved.userEmail) {
            $('#cfg-userEmail').val(saved.userEmail);
        }

        // Restore file delivery
        if (saved.fileDelivery) {
            state.fileDelivery = saved.fileDelivery;
            $('#fd-' + saved.fileDelivery).prop('checked', true);
        }

        // Restore selected document
        if (saved.selectedDoc) {
            state.selectedDoc = saved.selectedDoc;
        }

        // Restore polling toggle
        const $pollToggle = $('#sidebar-polling-toggle');
        if ($pollToggle.length && saved.pollingEnabled) {
            $pollToggle.prop('checked', true);
        }

        // Restore session (last so UI elements are ready)
        if (saved.sessionId) {
            // Defer so editors are initialized first
            setTimeout(() => setSessionId(saved.sessionId, saved.accessURL || null), 100);
        }

        // Restore webhook URL for session JSON
        if (saved.webhookUrl) {
            state.webhookUrl = saved.webhookUrl;
        }
    }

    async function buildFeatureToggles() {
        const $container = $('#feature-toggles');
        if (!$container.length) return;

        // Load rich descriptions from external JSON (non-blocking, graceful fallback)
        await loadFeatureData();

        const saved = loadFeatureSettings();
        let html = '';
        for (const group of FEATURE_GROUPS) {
            const gid = group.title.replace(/\W/g, '');
            html += `
                <div class="feature-group mb-2">
                    <div class="feature-group-header" data-bs-toggle="collapse" data-bs-target="#fg-${gid}" style="cursor:pointer">
                        <i class="bi ${group.icon}" style="color:var(--insign-blue)"></i>
                        <strong style="font-size:0.85rem">${group.title}</strong>
                        <i class="bi bi-chevron-down ms-auto" style="font-size:0.7rem"></i>
                    </div>
                    <div class="collapse" id="fg-${gid}">`;

            for (const f of group.features) {
                const savedVal = saved[f.key]; // undefined = default
                const richDesc = getFeatureDesc(f.key, f.desc);
                const globalProp = getGlobalProperty(f.key);
                const propInline = globalProp ? `<span class="feature-prop-inline">${globalProp}</span>` : '';
                const descId = `fdesc-${f.key}`;
                const infoId = `finfo-${f.key}`;

                // Searchable text for filtering (label + key + globalProperty + description)
                const searchText = [f.label, f.key, globalProp || '', richDesc].join(' ').toLowerCase().replace(/"/g, '&quot;');

                // Info button (click to pin/unpin) + description row (shown on hover, pinned on click)
                const infoBtn = `<i id="${infoId}" class="bi bi-info-circle feature-info-btn" onclick="window.app.toggleDescPin('${descId}','${infoId}')" title="Click to pin description"></i>`;
                const descRow = `<div id="${descId}" class="feature-desc">${richDesc}</div>`;

                if (f.type === 'bool') {
                    // Three-state: default / on / off
                    const st = savedVal === true ? 'on' : savedVal === false ? 'off' : 'default';
                    html += `
                        <div class="feature-toggle" data-search="${searchText}">
                            <div class="tri-state">
                                <input type="radio" name="ft-${f.key}" id="ft-${f.key}-default" value="default" ${st === 'default' ? 'checked' : ''}
                                       onchange="window.app.updateFeature('${f.key}', 'default', '${f.path}')">
                                <label for="ft-${f.key}-default">Default</label>
                                <input type="radio" name="ft-${f.key}" id="ft-${f.key}-on" value="on" ${st === 'on' ? 'checked' : ''}
                                       onchange="window.app.updateFeature('${f.key}', true, '${f.path}')">
                                <label for="ft-${f.key}-on">On</label>
                                <input type="radio" name="ft-${f.key}" id="ft-${f.key}-off" value="off" ${st === 'off' ? 'checked' : ''}
                                       onchange="window.app.updateFeature('${f.key}', false, '${f.path}')">
                                <label for="ft-${f.key}-off">Off</label>
                            </div>
                            ${infoBtn}
                            <span class="feature-label">${f.label} <span class="feature-key">${f.key}</span>${propInline}</span>
                            ${descRow}
                        </div>`;
                } else if (f.type === 'select') {
                    const curVal = savedVal !== undefined ? savedVal : '';
                    html += `
                        <div class="feature-toggle" data-search="${searchText}">
                            <select class="form-select form-select-sm" id="ft-${f.key}"
                                    onchange="window.app.updateFeature('${f.key}', this.value || 'default', '${f.path}')"
                                    style="max-width:110px;flex-shrink:0">
                                <option value="" ${curVal === '' ? 'selected' : ''}>Default</option>
                                ${f.options.map(o => `<option value="${o}" ${o === curVal ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                            ${infoBtn}
                            <span class="feature-label">${f.label} <span class="feature-key">${f.key}</span>${propInline}</span>
                            ${descRow}
                        </div>`;
                } else if (f.type === 'text') {
                    const curVal = savedVal !== undefined ? savedVal : '';
                    html += `
                        <div class="feature-toggle" data-search="${searchText}">
                            <input type="text" class="form-control form-control-sm feature-input" id="ft-${f.key}"
                                   value="${curVal ? curVal.replace(/"/g, '&quot;') : ''}"
                                   placeholder="Default"
                                   onchange="window.app.updateFeature('${f.key}', this.value || 'default', '${f.path}')"
                                   style="max-width:160px;flex-shrink:0">
                            ${infoBtn}
                            <span class="feature-label">${f.label} <span class="feature-key">${f.key}</span>${propInline}</span>
                            ${descRow}
                        </div>`;
                }
            }

            html += `</div></div>`;
        }
        $container.html(html);

        // Apply saved non-default values to the JSON editor
        applyFeatureSettingsToEditor();
    }

    /** Apply all non-default feature settings to the JSON editor */
    function applyFeatureSettingsToEditor() {
        const saved = loadFeatureSettings();
        if (!state.editors['create-session'] || Object.keys(saved).length === 0) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;

        let changed = false;
        for (const group of FEATURE_GROUPS) {
            for (const f of group.features) {
                const val = saved[f.key];
                if (val === undefined) continue; // "default" = not in saved
                changed = true;
                if (f.path === 'guiProperties') {
                    if (!body.guiProperties) body.guiProperties = {};
                    body.guiProperties[f.key] = val;
                } else if (f.path === 'doc') {
                    if (body.documents && body.documents[0]) body.documents[0][f.key] = val;
                } else {
                    body[f.key] = val;
                }
            }
        }
        if (changed) setEditorValue('create-session', body);
    }

    /** Update a feature value in the current session JSON editor */
    function updateFeature(key, value, path) {
        const saved = loadFeatureSettings();

        // "default" means remove from JSON and from saved settings
        if (value === 'default') {
            delete saved[key];
            saveFeatureSettings(saved);
            // Remove from the JSON body
            if (state.editors['create-session']) {
                const body = getEditorValue('create-session');
                if (typeof body === 'object') {
                    if (path === 'guiProperties' && body.guiProperties) {
                        delete body.guiProperties[key];
                        if (Object.keys(body.guiProperties).length === 0) delete body.guiProperties;
                    } else if (path === 'signConfig' && body.signConfig) {
                        delete body.signConfig[key];
                        if (Object.keys(body.signConfig).length === 0) delete body.signConfig;
                    } else if (path === 'doc' && body.documents && body.documents[0]) {
                        delete body.documents[0][key];
                    } else {
                        delete body[key];
                    }
                    setEditorValue('create-session', body);
                }
            }
            return;
        }

        // Save to localStorage
        saved[key] = value;
        saveFeatureSettings(saved);

        // Update JSON editor
        if (!state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;

        if (path === 'guiProperties') {
            if (!body.guiProperties) body.guiProperties = {};
            body.guiProperties[key] = value;
        } else if (path === 'signConfig') {
            if (!body.signConfig) body.signConfig = {};
            body.signConfig[key] = value;
        } else if (path === 'doc') {
            if (body.documents && body.documents[0]) {
                body.documents[0][key] = value;
            }
        } else {
            body[key] = value;
        }

        setEditorValue('create-session', body);
    }

    // =====================================================================
    // Bidirectional sync: JSON editor → UI controls
    // =====================================================================

    let _syncDebounce = null;

    function syncEditorToUI() {
        clearTimeout(_syncDebounce);
        _syncDebounce = setTimeout(_doSyncEditorToUI, 300);
    }

    function _doSyncEditorToUI() {
        if (!state.editors['create-session']) return;
        let body;
        try { body = JSON.parse(state.editors['create-session'].getValue()); } catch { return; }
        if (typeof body !== 'object') return;

        // Sync owner fields
        _syncInputFromJson('cfg-displayname', body.displayname);
        _syncInputFromJson('cfg-foruser', body.foruser);
        _syncInputFromJson('cfg-userfullname', body.userFullName);
        _syncInputFromJson('cfg-userEmail', body.userEmail);

        // Sync feature toggles
        const saved = loadFeatureSettings();
        let settingsChanged = false;

        for (const group of FEATURE_GROUPS) {
            for (const f of group.features) {
                let jsonVal;
                if (f.path === 'guiProperties') {
                    jsonVal = body.guiProperties ? body.guiProperties[f.key] : undefined;
                } else if (f.path === 'doc') {
                    jsonVal = (body.documents && body.documents[0]) ? body.documents[0][f.key] : undefined;
                } else {
                    jsonVal = body[f.key];
                }

                // Skip fields that are handled as owner inputs
                if (['displayname', 'userFullName'].includes(f.key) && f.path === 'root') continue;

                if (f.type === 'bool') {
                    const uiState = jsonVal === true ? 'on' : jsonVal === false ? 'off' : 'default';
                    const $radio = $(`#ft-${f.key}-${uiState === 'on' ? 'on' : uiState === 'off' ? 'off' : 'default'}`);
                    if ($radio.length && !$radio.is(':checked')) $radio.prop('checked', true);
                    // Update saved settings
                    if (jsonVal === undefined) { if (saved[f.key] !== undefined) { delete saved[f.key]; settingsChanged = true; } }
                    else { if (saved[f.key] !== jsonVal) { saved[f.key] = jsonVal; settingsChanged = true; } }
                } else if (f.type === 'select' || f.type === 'text') {
                    const $el = $(`#ft-${f.key}`);
                    if ($el.length && jsonVal !== undefined && $el.val() !== String(jsonVal)) $el.val(String(jsonVal));
                    else if ($el.length && jsonVal === undefined && $el.val() !== '') $el.val('');
                    if (jsonVal === undefined) { if (saved[f.key] !== undefined) { delete saved[f.key]; settingsChanged = true; } }
                    else { if (saved[f.key] !== jsonVal) { saved[f.key] = jsonVal; settingsChanged = true; } }
                }
            }
        }
        if (settingsChanged) saveFeatureSettings(saved);
    }

    function _syncInputFromJson(inputId, jsonVal) {
        const $el = $('#' + inputId);
        if (!$el.length) return;
        const strVal = jsonVal !== undefined && jsonVal !== null ? String(jsonVal) : '';
        if ($el.val() !== strVal) $el.val(strVal);
    }

    // =====================================================================
    // Default request bodies
    // =====================================================================

    /** Get display name for the session based on selected document */
    function getSessionDisplayName() {
        const $input = $('#cfg-displayname');
        if ($input.length && $input.val().trim()) return $input.val().trim();
        const selDoc = getSelectedDocument();
        if (state.selectedDoc === 'custom') return state.customFileData ? state.customFileData.name : 'Your Document';
        return selDoc.label || 'Signing Session';
    }

    /** Read owner fields from sidebar inputs */
    function getOwnerFields() {
        return {
            foruser: ($('#cfg-foruser').val() || '').trim() || state.userId,
            userFullName: ($('#cfg-userfullname').val() || '').trim() || 'Demo User',
            userEmail: ($('#cfg-userEmail').val() || '').trim() || ''
        };
    }

    function getDefaultCreateSessionBody() {
        const selDoc = getSelectedDocument();
        const owner = getOwnerFields();

        const doc = {
            id: 'contract-1',
            displayname: state.selectedDoc === 'custom'
                ? (state.customFileData ? state.customFileData.name : 'Your Document')
                : (selDoc.label || 'Test Document'),
            scanSigTags: selDoc.scanSigTags,
            allowFormEditing: true
        };

        if (state.fileDelivery === 'url') {
            doc.fileURL = getDocumentAbsoluteUrl();
        } else if (state.fileDelivery === 'base64') {
            doc.file = '<filedata>';
        }
        // 'upload' mode: no file reference in create body — uploaded separately

        const body = {
            displayname: getSessionDisplayName(),
            foruser: owner.foruser,
            userFullName: owner.userFullName,
            documents: [doc],
            callbackURL: getCallbackUrl(),
            externEmailBetreff: '',
            externEmailInhalt: ''
        };

        if (owner.userEmail) {
            body.userEmail = owner.userEmail;
        }

        // Include webhook URL if available
        if (state.webhookUrl) {
            body.serverSidecallbackURL = state.webhookUrl;
            body.serversideCallbackMethod = 'POST';
            body.serversideCallbackContenttype = 'JSON';
        }

        return body;
    }

    function getDefaultExternBody() {
        const d = state.demoData || {};
        const seller = d.seller || {};
        const buyer = d.buyer || {};
        const sw = d.streetWorkContract || {};
        const broker = sw.broker || {};
        const customer = sw.customer || {};
        const agency = sw.agency || {};
        // Use discovered roles if available, else use document catalog, else demo defaults
        const roles = state.discoveredRoles || getSelectedDocument().roles || ['seller', 'buyer'];
        const roleData = {
            seller: { email: seller.email, name: seller.name },
            buyer: { email: buyer.email, name: buyer.name },
            broker: { email: broker.email, name: broker.name },
            customer: { email: customer.email, name: customer.name },
            agency: { email: agency.email, name: agency.name },
            role_one: { email: seller.email, name: seller.name },
            role_two: { email: buyer.email, name: buyer.name }
        };

        let savedOpts = { sendEmails: false, sendSMS: false, singleSignOnEnabled: true };
        try {
            const stored = JSON.parse(localStorage.getItem('insign-extern-options'));
            if (stored) savedOpts = { ...savedOpts, ...stored };
        } catch { /* ignore */ }

        const externUsers = roles.map(role => {
            const data = roleData[role] || {};
            return {
                recipient: data.email || `${role}@example.com`,
                realName: data.name || role,
                roles: [role],
                sendEmails: savedOpts.sendEmails,
                sendSMS: savedOpts.sendSMS,
                singleSignOnEnabled: savedOpts.singleSignOnEnabled
            };
        });

        return {
            sessionid: state.sessionId || '<session-id>',
            externUsers,
            inOrder: false
        };
    }

    function getSessionIdBody() {
        return { sessionid: state.sessionId || '<session-id>' };
    }

    // =====================================================================
    // Operation definitions
    // =====================================================================

    function getDocumentSingleBody() {
        return {
            sessionid: state.sessionId || '<session-id>',
            docid: 'contract-1'
        };
    }

    const OPERATIONS = {
        'status': {
            method: 'POST', path: '/get/status',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'load': {
            method: 'POST', path: '/persistence/loadsession',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'documents': {
            method: 'POST', path: '/get/documents/full?includeAnnotations=true',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'document-single': {
            method: 'POST', path: '/get/document',
            getBody: getDocumentSingleBody,
            schemaKey: null,
            formParams: true,
            accept: '*/*'
        },
        'download': {
            method: 'POST', path: '/get/documents/download',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput',
            accept: '*/*'
        },
        'extern': {
            method: 'POST', path: '/extern/beginmulti',
            getBody: getDefaultExternBody,
            schemaKey: 'startExternMultiuser'
        },
        'abort-extern': {
            method: 'POST', path: '/extern/abort',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'finish': {
            method: 'POST', path: '/configure/fertig',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'restart': {
            method: 'POST', path: '/configure/restartsession',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput',
            formParams: true,
            accept: '*/*'
        },
        'delete': {
            method: 'POST', path: '/configure/ablehnen',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'delete-session': {
            method: 'POST', path: '/configure/deletesession',
            accept: '*/*',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput',
            formParams: true
        },
        'audit': {
            method: 'POST', path: '/get/audit',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'extern-users': {
            method: 'POST', path: '/extern/users',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'version': {
            method: 'GET', path: '/version', accept: '*/*',
            getBody: null,
            schemaKey: null
        }
    };

    // =====================================================================
    // Initialization
    // =====================================================================

    async function init() {
        // Restore saved state before populating defaults
        restoreAppState();

        // Load demo data
        try {
            const resp = await fetch('data/demo-data.json');
            if (resp.ok) state.demoData = await resp.json();
        } catch { /* ok, use defaults */ }

        // Populate owner fields from demo data (only if not restored from saved state)
        if (state.demoData) {
            const seller = state.demoData.seller || {};
            const $dnInput = $('#cfg-displayname');
            const $fnInput = $('#cfg-userfullname');
            const $emInput = $('#cfg-userEmail');
            const $fuInput = $('#cfg-foruser');
            if ($fnInput.length && !$fnInput.val()) $fnInput.val(seller.name || '');
            if ($emInput.length && !$emInput.val()) $emInput.val(seller.email || '');
            if ($fuInput.length && !$fuInput.val()) $fuInput.val(state.userId);
            if ($dnInput.length && !$dnInput.val()) {
                const selDoc = getSelectedDocument();
                $dnInput.val(selDoc.label || '');
            }
        }

        // Build document selector, feature toggles, and branding presets
        buildDocumentSelector();
        buildFeatureToggles();
        buildColorSchemePresets();
        updateBrandColor();
        buildLogoSets();

        // Init API client
        updateApiClient();

        // Update trust indicator with target URL
        const $trustUrl = $('#trust-target-url');
        if ($trustUrl.length) $trustUrl.text('\u2192 ' + $('#cfg-base-url').val());

        // Bind sidebar events
        $('#cfg-base-url').on('change', () => { updateApiClient(); saveAppState(); });
        $('#cfg-username').on('change', () => { updateApiClient(); saveAppState(); });
        $('#cfg-password').on('change', () => { updateApiClient(); saveAppState(); });

        const $corsToggle = $('#cfg-cors-proxy');
        $corsToggle.on('change', () => {
            $('#cors-proxy-url-group').css('display', $corsToggle.is(':checked') ? '' : 'none');
            updateApiClient();
            saveAppState();
        });
        $('#cfg-cors-proxy-url').on('change', () => { updateApiClient(); saveAppState(); });

        // "Remember credentials" checkbox
        const $saveCredsCheckbox = $('#cfg-save-credentials');
        if ($saveCredsCheckbox.length) {
            $saveCredsCheckbox.on('change', saveAppState);
        }

        // Bind owner field inputs → update JSON editor when changed
        const ownerRefresh = () => {
            if (state.editors['create-session']) {
                const body = getEditorValue('create-session');
                if (typeof body === 'object') {
                    const owner = getOwnerFields();
                    body.foruser = owner.foruser;
                    body.userFullName = owner.userFullName;
                    if (owner.userEmail) body.userEmail = owner.userEmail;
                    else delete body.userEmail;
                    setEditorValue('create-session', body);
                }
            }
        };
        const displaynameRefresh = () => {
            if (state.editors['create-session']) {
                const body = getEditorValue('create-session');
                if (typeof body === 'object') {
                    body.displayname = getSessionDisplayName();
                    body.externEmailBetreff = '';
                    setEditorValue('create-session', body);
                }
            }
        };
        ['cfg-foruser', 'cfg-userfullname', 'cfg-userEmail'].forEach(id => {
            const $el = $('#' + id);
            if ($el.length) $el.on('input', () => { ownerRefresh(); saveAppState(); });
        });
        const $dnEl = $('#cfg-displayname');
        if ($dnEl.length) $dnEl.on('input', () => { displaynameRefresh(); saveAppState(); });

        // Bind session ID input
        const $sessionInput = $('#manual-session-id');
        if ($sessionInput.length) {
            $sessionInput.on('keydown', e => {
                if (e.key === 'Enter') applyManualSessionId();
            });
        }

        // Init webhook viewer in sidebar (before Monaco so URL is available for default JSON body)
        state.webhookViewer = new window.WebhookViewer('#sidebar-webhook-container');
        state.webhookViewer.setProvider(state.webhookProvider);
        window.webhookViewer = state.webhookViewer; // for inline onclick handlers

        state.webhookViewer.onUrlCreated = (url) => {
            state.webhookUrl = url;
            // Update the create-session editor to include the webhook URL
            if (state.editors['create-session']) {
                const currentBody = getEditorValue('create-session');
                if (typeof currentBody === 'object' && !currentBody.serverSidecallbackURL) {
                    currentBody.serverSidecallbackURL = url;
                    setEditorValue('create-session', currentBody);
                }
            }
        };

        // Create webhook endpoint and start listening
        state.webhookViewer.createEndpoint().then(url => {
            if (url) state.webhookViewer.startPolling();
        });

        // Webhooks toggle in step 1 — sync with sidebar toggle and session JSON
        const $webhooksToggle = $('#cfg-webhooks');
        if ($webhooksToggle.length) {
            $webhooksToggle.on('change', () => {
                const $providerGroup = $('#webhook-provider-group');
                if ($providerGroup.length) $providerGroup.css('display', $webhooksToggle.is(':checked') ? '' : 'none');

                // Sync sidebar-step2 webhook toggle
                const $sidebarWhToggle = $('#sidebar-webhooks-toggle');
                if ($sidebarWhToggle.length) $sidebarWhToggle.prop('checked', $webhooksToggle.is(':checked'));

                // Update session JSON: add/remove serverSidecallbackURL
                if (state.editors['create-session']) {
                    const body = getEditorValue('create-session');
                    if (typeof body === 'object') {
                        if ($webhooksToggle.is(':checked') && state.webhookUrl) {
                            body.serverSidecallbackURL = state.webhookUrl;
                            body.serversideCallbackMethod = 'POST';
                            body.serversideCallbackContenttype = 'JSON';
                        } else {
                            delete body.serverSidecallbackURL;
                            delete body.serversideCallbackMethod;
                            delete body.serversideCallbackContenttype;
                        }
                        setEditorValue('create-session', body);
                    }
                }

                // Toggle webhook section in sidebar
                toggleWebhookSection($webhooksToggle.is(':checked'));
            });
        }

        // Init Monaco
        initMonaco();

        // Update headers display
        updateHeadersDisplay();

        // file:// hint: local docs can't be fetched via fetch()
        if (window.location.protocol === 'file:') {
            const $hintEl = $('#file-delivery-hint');
            if ($hintEl.length) $hintEl.html('<i class="bi bi-exclamation-triangle"></i> ' +
                'Running from <code>file://</code> — base64/upload requires serving via HTTP ' +
                '(<code>npx serve docs</code>). Use your own file or URL mode instead.');
        }

        // Init PDF viewer
        if (window.PdfViewer) {
            state.pdfViewer = new window.PdfViewer();
        }

        // Restore extern options from localStorage
        restoreExternOptions();

        // Handle hash navigation
        handleHashNavigation();
        $(window).on('hashchange', handleHashNavigation);

        // Track operation sub-tab switches
        $('#operation-tabs').on('shown.bs.tab', 'button[data-bs-toggle="tab"]', function () {
            if (state.currentStep === 2) {
                const target = $(this).data('bs-target'); // e.g. #op-status
                const subTab = target ? target.replace('#op-', '') : '';
                if (subTab) history.replaceState(null, '', '#step2/' + subTab);
            }
        });

        // Dark mode
        initDarkMode();
    }

    function handleHashNavigation() {
        const hash = window.location.hash;
        const match = hash.match(/^#step(\d)(?:\/(.+))?$/);
        if (match) {
            const step = parseInt(match[1]);
            const subTab = match[2];
            if (step >= 1 && step <= 3) {
                if (step !== state.currentStep) {
                    goToStep(step, true);
                }
                // Activate sub-tab on step 2
                if (step === 2 && subTab) {
                    const $tab = $(`#operation-tabs button[data-bs-target="#op-${subTab}"]`);
                    if ($tab.length) {
                        const tab = new bootstrap.Tab($tab[0]);
                        tab.show();
                    }
                }
                // Focus session ID input if navigating to step 2 with no session
                if (step === 2 && !state.sessionId) {
                    const $input = $('#manual-session-id');
                    if ($input.length) setTimeout(() => $input.focus(), 300);
                }
            }
        }
    }

    function updateApiClient() {
        const baseUrl = $('#cfg-base-url').val();
        const username = $('#cfg-username').val();
        const password = $('#cfg-password').val();

        state.apiClient = new window.InsignApiClient(baseUrl, username, password);

        const corsProxy = $('#cfg-cors-proxy').is(':checked');
        state.apiClient.useCorsProxy = corsProxy;
        if (corsProxy) {
            state.apiClient.corsProxyUrl = $('#cfg-cors-proxy-url').val();
        }

        // Update trust indicator
        const $trustUrl = $('#trust-target-url');
        if ($trustUrl.length) $trustUrl.text('\u2192 ' + baseUrl);

        updateHeadersDisplay();

        // Load OpenAPI schemas from the server (non-blocking)
        if (baseUrl && !state.schemaLoader.loaded) {
            const proxy = corsProxy ? (state.apiClient.corsProxyUrl || 'https://corsproxy.io/?') : null;
            state.schemaLoader.load(baseUrl, proxy).then(ok => {
                if (ok && state.monacoReady) {
                    state.schemaLoader.registerWithMonaco(monaco);
                }
            });
        }
    }

    function updateHeadersDisplay() {
        if (!state.apiClient) return;
        const defaultHeaders = state.apiClient.getHeadersDisplay();
        const defaultHtml = defaultHeaders.map(h =>
            `<div><span class="header-name">${h.name}:</span> <span class="header-value">${h.value}</span></div>`
        ).join('');

        // Step 1 headers
        $('#step1-headers').html(defaultHtml);

        // Per-operation headers (respect accept/formParams overrides)
        $('.op-headers').each(function () {
            const opKey = $(this).data('op');
            const opDef = OPERATIONS[opKey];
            if (opDef && (opDef.accept || opDef.formParams)) {
                const headers = state.apiClient.getHeadersDisplay();
                const h = headers
                    .filter(h => !(h.name === 'Content-Type' && opDef.formParams))
                    .map(h => {
                        let val = h.value;
                        if (h.name === 'Accept' && opDef.accept) val = opDef.accept;
                        return `<div><span class="header-name">${h.name}:</span> <span class="header-value">${val}</span></div>`;
                    }).join('');
                $(this).html(h);
            } else {
                $(this).html(defaultHtml);
            }
        });
    }

    // =====================================================================
    // Monaco Editor
    // =====================================================================

    function initMonaco() {
        require.config({
            paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.48.0/min/vs' }
        });

        require(['vs/editor/editor.main'], function () {
            state.monacoReady = true;

            // Register JSON schemas from OpenAPI spec (loaded dynamically)
            if (state.schemaLoader && state.schemaLoader.loaded) {
                state.schemaLoader.registerWithMonaco(monaco);
            }

            // Create Step 1 editor
            createEditor('create-session', getDefaultCreateSessionBody(), 'configureSession');

            // Apply saved feature toggle settings to the editor
            applyFeatureSettingsToEditor();

            // Bidirectional sync: editor changes → sidebar inputs & feature toggles
            if (state.editors['create-session']) {
                state.editors['create-session'].onDidChangeModelContent(() => {
                    if (state._editorSyncLock) return;
                    syncEditorToUI();
                });
            }

            // Create operation editors
            for (const [opKey, opDef] of Object.entries(OPERATIONS)) {
                if (opDef.getBody) {
                    createEditor('op-' + opKey, opDef.getBody(), opDef.schemaKey);
                }
            }

            // Sync extern option buttons when user edits the extern JSON
            if (state.editors['op-extern']) {
                state.editors['op-extern'].onDidChangeModelContent(() => {
                    if (state._editorSyncLock) return;
                    syncExternOptionsFromJson();
                });
            }

            // Code snippet editor (read-only)
            createReadOnlyEditor('code-snippet', '// Select a language tab above to see code snippets', 'javascript');

            // Init code language tabs
            initCodeTabs();
        });
    }

    /** Auto-resize a Monaco editor to fit its content (clamped to container max-height) */
    function autoResizeEditor(editor, container) {
        const MAX_HEIGHT = 600;
        const MIN_HEIGHT = 60;
        const PADDING = 10; // extra pixels to avoid scrollbar appearing

        function resize() {
            const contentHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, editor.getContentHeight() + PADDING));
            $(container).css('height', contentHeight + 'px');
            editor.layout();
        }

        editor.onDidContentSizeChange(resize);
        // Initial sizing
        resize();
    }

    function createEditor(id, defaultValue, schemaKey) {
        const container = $('#editor-' + id)[0];
        if (!container) return null;

        // URI must be unique per editor, but the filename part must match the schema's fileMatch
        const filename = schemaKey ? schemaKey + '.json' : id + '.json';
        const modelUri = monaco.Uri.parse('insign://models/' + id + '/' + filename);

        const model = monaco.editor.createModel(
            JSON.stringify(defaultValue, null, 2),
            'json',
            modelUri
        );

        const editor = monaco.editor.create(container, {
            model,
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs',
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            formatOnPaste: true,
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false }
        });

        autoResizeEditor(editor, container);
        state.editors[id] = editor;
        return editor;
    }

    function createReadOnlyEditor(id, content, language) {
        const container = $('#editor-' + id)[0];
        if (!container) return null;

        const editor = monaco.editor.create(container, {
            value: content,
            language: language || 'json',
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'vs',
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            readOnly: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false }
        });

        autoResizeEditor(editor, container);
        state.editors[id] = editor;
        return editor;
    }

    function setEditorValue(id, value, language) {
        const editor = state.editors[id];
        if (!editor) return;

        // Prevent bidirectional sync loop when we programmatically set the editor
        if (id === 'create-session') state._editorSyncLock = true;

        if (language) {
            const model = editor.getModel();
            if (model) monaco.editor.setModelLanguage(model, language);
        }

        const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        editor.setValue(content);

        if (id === 'create-session') setTimeout(() => { state._editorSyncLock = false; }, 50);
    }

    function getEditorValue(id) {
        const editor = state.editors[id];
        if (!editor) return null;
        try {
            return JSON.parse(editor.getValue());
        } catch {
            return editor.getValue();
        }
    }

    function showResponseEditor(id, response) {
        // Create response editor if not exists
        const editorId = id + '-response';
        const container = $('#editor-' + editorId)[0];
        if (!container) return;

        if (!state.editors[editorId]) {
            createReadOnlyEditor(editorId, '', 'json');
        }

        const content = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
        setEditorValue(editorId, content);
    }

    // =====================================================================
    // Step navigation
    // =====================================================================

    function goToStep(step, skipHash) {
        state.currentStep = step;

        // Update URL hash without triggering hashchange
        if (!skipHash) {
            let newHash = '#step' + step;
            if (step === 2) {
                const $active = $('#operation-tabs button.nav-link.active');
                const target = $active.data('bs-target');
                if (target) newHash += '/' + target.replace('#op-', '');
            }
            if (window.location.hash !== newHash) {
                history.replaceState(null, '', newHash);
            }
        }

        // Update step indicators
        $('.step-indicator .step').each(function () {
            const $el = $(this);
            const s = parseInt($el.data('step'));
            $el.removeClass('active completed');
            if (s === step) $el.addClass('active');
            else if (s < step) $el.addClass('completed');
        });

        // Show/hide main panels
        $('#step-1-panel').toggleClass('d-none', step !== 1);
        $('#step-2-panel').toggleClass('d-none', step !== 2);
        $('#step-3-panel').toggleClass('d-none', step !== 3);

        // Switch sidebar: step 1 = connection settings, step 2+ = webhook/polling
        const $sidebar1 = $('#sidebar-step1');
        const $sidebar2 = $('#sidebar-step2');
        if ($sidebar1.length && $sidebar2.length) {
            $sidebar1.toggleClass('d-none', step >= 2);
            $sidebar2.toggleClass('d-none', step < 2);

            // When entering step 2, start webhook or polling
            if (step >= 2) {
                updateSidebarMode();
            }
        }
    }

    /** Activate sidebar-step2: start whichever sections are enabled */
    function updateSidebarMode() {
        const $whToggle = $('#sidebar-webhooks-toggle');
        const $pollToggle = $('#sidebar-polling-toggle');
        if ($whToggle.is(':checked')) toggleWebhookSection(true);
        if ($pollToggle.is(':checked')) togglePollingSection(true);
    }

    /** Enable/disable the webhook section independently */
    function toggleWebhookSection(enabled) {
        const $content = $('#sidebar-webhook-content');
        const $badge = $('#webhook-live-badge');
        if ($content.length) $content.css('display', enabled ? '' : 'none');

        if (enabled) {
            if (state.webhookViewer && !state.webhookViewer.eventSource) {
                state.webhookViewer.startPolling();
            }
            if ($badge.length) $badge.css('display', '');
        } else {
            if (state.webhookViewer) state.webhookViewer.stopPolling();
            if ($badge.length) $badge.css('display', 'none');
        }
        saveAppState();
    }

    /** Enable/disable the polling section independently */
    function togglePollingSection(enabled) {
        const $content = $('#sidebar-polling-content');
        if ($content.length) $content.css('display', enabled ? '' : 'none');

        if (enabled) {
            startStatusPolling();
        } else {
            stopStatusPolling();
        }
        saveAppState();
    }

    /** Apply a session ID from the manual input field */
    function applyManualSessionId() {
        const $input = $('#manual-session-id');
        if (!$input.length) return;
        const id = $input.val().trim();
        if (!id) return;
        setSessionId(id, null);
    }

    /** Set the active session (from create response or manual input) */
    function setSessionId(sessionId, accessURL, fromCreateSession, accessURLProcessManagement) {
        const isNewSession = sessionId && sessionId !== state.sessionId;
        state.sessionId = sessionId;
        state.accessURL = accessURL;
        if (accessURLProcessManagement) state.accessURLProcessManagement = accessURLProcessManagement;

        // Update session ID displays
        $('#active-session-id').text(sessionId);
        $('#manual-session-id').val(sessionId);

        // Update navbar session bar
        $('#navbar-session').removeClass('d-none').addClass('d-flex');
        $('#navbar-session-id').val(sessionId);
        $('#navbar-btn-open').toggleClass('d-none', !accessURL);

        // Show/hide buttons
        $('#btn-open-insign').toggleClass('d-none', !accessURL);
        $('#btn-open-session-manager').toggleClass('d-none', !state.accessURLProcessManagement);
        $('#btn-goto-step2').removeClass('d-none');

        // Reset histories and create new webhook URL for new sessions
        // But skip regeneration when coming from createSession — the URL was already sent
        if (isNewSession) {
            resetSessionHistories();
            if (!fromCreateSession) {
                regenerateWebhookForSession();
            }
        }

        // Update operation editors
        updateOperationEditors();
        updateCodeSnippets();

        // Persist
        saveAppState();
    }

    /** Clear polling and webhook histories when session changes */
    function resetSessionHistories() {
        // Reset polling
        _lastPollBody = null;
        $('#polling-changes').html(
            '<div class="text-center text-muted-sm py-3"><i class="bi bi-hourglass-split"></i> Waiting for status changes...</div>'
        );

        // Reset webhook requests
        if (state.webhookViewer) {
            state.webhookViewer.requests = [];
            state.webhookViewer.renderRequests();
        }
    }

    /** Create a new webhook endpoint and inject it into the session JSON */
    function regenerateWebhookForSession() {
        if (!state.webhookViewer) return;
        if (!$('#cfg-webhooks').is(':checked')) return;

        reinitWebhook();
        showToast('New webhook URL generated for this session.', 'info');
    }

    /** Show a brief toast notification */
    function showToast(message, type) {
        type = type || 'info';
        const colors = { info: 'var(--insign-blue)', success: 'var(--insign-success)', warning: '#e4a11b' };
        const icons = { info: 'bi-info-circle', success: 'bi-check-circle', warning: 'bi-exclamation-triangle' };
        const $toast = $('<div>')
            .css({
                position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999,
                background: 'var(--insign-card-bg, #23272b)', color: 'var(--insign-text, #fff)', padding: '10px 16px',
                borderRadius: '8px', fontSize: '0.85rem', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                borderLeft: '4px solid ' + (colors[type] || colors.info),
                opacity: 0, transition: 'opacity 0.3s'
            })
            .html('<i class="bi ' + (icons[type] || icons.info) + ' me-2"></i>' + message)
            .appendTo('body');

        requestAnimationFrame(() => $toast.css('opacity', 1));
        setTimeout(() => $toast.css('opacity', 0), 3500);
        setTimeout(() => $toast.remove(), 4000);
    }

    /** Apply session ID from navbar input */
    function applyNavbarSessionId() {
        const $input = $('#navbar-session-id');
        if (!$input.length) return;
        const id = $input.val().trim();
        if (!id) return;
        setSessionId(id, null);
    }

    // =====================================================================
    // Step 1: Create Session
    // =====================================================================

    async function createSession() {
        const $btn = $('#btn-create-session');
        $btn.prop('disabled', true);
        $btn.html('<span class="spinner-insign"></span> Sending...');

        const body = getEditorValue('create-session');

        // Handle file delivery: resolve <filedata> placeholder
        let fileDataForUpload = null;
        if (typeof body === 'object' && body.documents) {
            for (const doc of body.documents) {
                if (doc.file === '<filedata>') {
                    // Base64 mode: fetch file and embed
                    try {
                        $btn.html('<span class="spinner-insign"></span> Loading file...');
                        const fileData = await loadDocumentData();
                        doc.file = fileData.base64;
                        delete doc.fileURL;
                    } catch (err) {
                        showCreateSessionError('Failed to load document: ' + err.message);
                        $btn.prop('disabled', false);
                        $btn.html('<i class="bi bi-send"></i> Send Request');
                        return;
                    }
                }
            }

            // Upload mode: strip file refs, we'll upload after session creation
            if (state.fileDelivery === 'upload') {
                try {
                    $btn.html('<span class="spinner-insign"></span> Loading file...');
                    const fileData = await loadDocumentData();
                    fileDataForUpload = { base64: fileData.base64, blob: fileData.blob, name: getDocumentFilename() };
                } catch (err) {
                    showCreateSessionError('Failed to load document: ' + err.message);
                    $btn.prop('disabled', false);
                    $btn.html('<i class="bi bi-send"></i> Send Request');
                    return;
                }
            }
        }

        $btn.html('<span class="spinner-insign"></span> Sending...');
        const result = await state.apiClient.post('/configure/session', body);

        // Store last request for code generation (show placeholder, not raw base64)
        const bodyForSnippet = JSON.parse(JSON.stringify(body));
        if (typeof bodyForSnippet === 'object' && bodyForSnippet.documents) {
            for (const doc of bodyForSnippet.documents) {
                if (doc.file && doc.file.length > 100) {
                    doc.file = '<filedata>';
                }
            }
        }
        state.lastRequest = { method: 'POST', path: '/configure/session', body: bodyForSnippet };

        // Show response
        const $responsePanel = $('#step1-response');
        $responsePanel.removeClass('d-none');

        const $statusEl = $('#step1-response-status');
        $statusEl.attr('class', 'response-status ' + (result.ok ? 'success' : 'error'));
        $statusEl.html(`
            <strong>${result.status}</strong> ${result.statusText}
            <span class="ms-auto text-muted-sm">${result.duration}ms</span>
        `);

        showResponseEditor('create-session', result.body);

        if (result.ok && result.body) {
            const respBody = typeof result.body === 'object' ? result.body : {};

            // Upload mode: now upload the file to the session
            if (respBody.sessionid && fileDataForUpload && state.fileDelivery === 'upload') {
                $btn.html('<span class="spinner-insign"></span> Uploading file...');
                const docId = (body.documents && body.documents[0] && body.documents[0].id) || 'contract-1';
                const uploadBlob = fileDataForUpload.blob || new Blob([Uint8Array.from(atob(fileDataForUpload.base64), c => c.charCodeAt(0))], { type: 'application/pdf' });
                const file = new File([uploadBlob], fileDataForUpload.name, { type: 'application/pdf' });
                const uploadResult = await state.apiClient.upload('/configure/uploaddocument', file, {
                    sessionid: respBody.sessionid,
                    docid: docId,
                    filename: fileDataForUpload.name
                });

                if (!uploadResult.ok) {
                    showResponseEditor('create-session', {
                        _note: 'Session created, but file upload failed',
                        sessionResponse: result.body,
                        uploadError: { status: uploadResult.status, body: uploadResult.body }
                    });
                }
            }

            if (respBody.sessionid) {
                setSessionId(respBody.sessionid, respBody.accessURL, true, respBody.accessURLProcessManagement);

                // Auto-navigate to step 2 after 3s countdown
                const $step2Btn = $('#btn-goto-step2');
                if ($step2Btn.length && !$step2Btn.hasClass('d-none')) {
                    let countdown = 3;
                    $step2Btn.html('<i class="bi bi-arrow-right"></i> Operate &amp; Trace (' + countdown + ')');
                    const timer = setInterval(() => {
                        countdown--;
                        if (countdown <= 0) {
                            clearInterval(timer);
                            $step2Btn.html('<i class="bi bi-arrow-right"></i> Operate &amp; Trace');
                            goToStep(2);
                        } else {
                            $step2Btn.html('<i class="bi bi-arrow-right"></i> Operate &amp; Trace (' + countdown + ')');
                        }
                    }, 1000);
                    // Cancel countdown if user clicks something else
                    $step2Btn.one('click', () => clearInterval(timer));
                }
            }
        }

        $btn.prop('disabled', false);
        $btn.html('<i class="bi bi-send"></i> Send Request');
    }

    function showCreateSessionError(message) {
        const $responsePanel = $('#step1-response');
        $responsePanel.removeClass('d-none');
        const $statusEl = $('#step1-response-status');
        $statusEl.attr('class', 'response-status error');
        $statusEl.html(`<strong>Error</strong> ${message}`);
        showResponseEditor('create-session', { error: message });
    }

    function openInSign() {
        if (state.accessURL) {
            window.open(state.accessURL, '_blank');
        }
    }

    function openSessionManager() {
        if (state.accessURLProcessManagement) {
            window.open(state.accessURLProcessManagement, '_blank');
        }
    }

    // =====================================================================
    // Step 2: Operations
    // =====================================================================

    async function executeOperation(opKey) {
        const opDef = OPERATIONS[opKey];
        if (!opDef) return;

        const editorId = 'op-' + opKey;
        let body = null;

        if (opDef.getBody) {
            body = getEditorValue(editorId);
        }

        // Show loading
        const $responseDiv = $(`.op-response[data-op="${opKey}"]`);

        let result;
        const callOpts = {};
        if (opDef.accept) callOpts.accept = opDef.accept;

        if (opDef.method === 'GET') {
            result = await state.apiClient.call('GET', opDef.path, callOpts);
        } else if (opDef.queryParams && body && typeof body === 'object') {
            const qs = new URLSearchParams(body).toString();
            const url = opDef.path + (opDef.path.includes('?') ? '&' : '?') + qs;
            result = await state.apiClient.call(opDef.method, url, callOpts);
        } else if (opDef.formParams && body) {
            const obj = typeof body === 'string' ? JSON.parse(body) : body;
            const qs = new URLSearchParams(obj).toString();
            const url = opDef.path + (opDef.path.includes('?') ? '&' : '?') + qs;
            result = await state.apiClient.call(opDef.method, url, callOpts);
        } else {
            result = await state.apiClient.call(opDef.method, opDef.path, { body, ...callOpts });
        }

        // Store last request
        state.lastRequest = { method: opDef.method, path: opDef.path, body };

        // Show response
        if ($responseDiv.length) {
            $responseDiv.removeClass('d-none');
        }

        const $statusEl = $(`.response-status[data-op="${opKey}"]`);
        if ($statusEl.length) {
            $statusEl.attr('class', 'response-status ' + (result.ok ? 'success' : 'error'));
            $statusEl.html(`
                <strong>${result.status}</strong> ${result.statusText}
                <span class="ms-auto text-muted-sm">${result.duration}ms</span>
            `);
        }

        // Try response editor first, fall back to pre
        const $responseEditorContainer = $('#editor-' + editorId + '-response');
        const $responsePre = $(`pre.response-body[data-op="${opKey}"]`);

        if ($responseEditorContainer.length) {
            showResponseEditor(editorId, result.body);
        } else if ($responsePre.length) {
            const content = typeof result.body === 'object' ? JSON.stringify(result.body, null, 2) : result.raw;
            $responsePre.text(content);
        }

        // If load returned an accessURL, update state so "Open in inSign" works
        if (opKey === 'load' && result.ok && result.body) {
            const resp = typeof result.body === 'object' ? result.body : {};
            if (resp.accessURL) {
                state.accessURL = resp.accessURL;
                $('#btn-open-insign').removeClass('d-none');
            }
            if (resp.accessURLProcessManagement) {
                state.accessURLProcessManagement = resp.accessURLProcessManagement;
                $('#btn-open-session-manager').removeClass('d-none');
            }
        }

        // Update code snippets
        updateCodeSnippets();
    }

    // =====================================================================
    // External Signing — Smart Flow
    // =====================================================================

    /** Discover document fields & roles, then pre-populate the extern body */
    async function discoverFieldsAndRoles() {
        if (!state.sessionId) {
            alert('Create a session first (Step 1) or enter a session ID.');
            return;
        }

        const result = await state.apiClient.post('/get/documents/full?includeAnnotations=true', { sessionid: state.sessionId });
        if (!result.ok) {
            const $info = $('#extern-fields-info');
            if ($info.length) {
                $info.css('display', '');
                $info.css('background', 'rgba(220,53,69,0.08)');
                $('#extern-fields-summary').html(
                    '<span style="color:var(--insign-danger)">Failed to query documents: ' + result.status + ' ' + result.statusText + '</span>');
            }
            return;
        }

        // Parse fields and roles from response
        const docs = result.body;
        const roles = new Set();
        const fields = [];
        const docList = Array.isArray(docs) ? docs : (docs.documents || [docs]);

        for (const doc of docList) {
            // Check signatures array, signatureFields, and annotations (type=signature_marker)
            const sigs = doc.signatures || doc.signatureFields || [];
            const annotations = (doc.annotations || []).filter(a => a.type === 'signature_marker');
            const allSigs = sigs.length > 0 ? sigs : annotations;
            for (const sig of allSigs) {
                const role = sig.role || sig.fieldName || sig.name || sig.id || '';
                const name = sig.displayname || sig.quickinfo || sig.fieldName || sig.name || role;
                const required = sig.required !== false;
                const signed = !!sig.signed;
                const level = sig.signatureLevel || '';
                if (role) roles.add(role);
                fields.push({ role, name, required, signed, level });
            }
        }

        state.discoveredRoles = Array.from(roles);
        state.discoveredFields = fields;

        // Show summary
        const $info = $('#extern-fields-info');
        if ($info.length) {
            $info.css('display', '');
            $info.css('background', 'rgba(248,169,9,0.08)');
            const $summary = $('#extern-fields-summary');
            if (fields.length === 0) {
                $summary.html('No signature fields found in the document. The document may use SIG-tags (detected at signing time).');
                // Fall back to document catalog info
                const selDoc = getSelectedDocument();
                if (selDoc.roles && selDoc.roles.length > 0) {
                    $summary.html($summary.html() + '<br>Document catalog roles: <strong>' + selDoc.roles.join(', ') + '</strong>');
                    state.discoveredRoles = selDoc.roles;
                }
            } else {
                const signedCount = fields.filter(f => f.signed).length;
                const reqCount = fields.filter(f => f.required).length;
                const fieldBadges = fields.map(f => {
                    const lvl = f.level ? ` <span style="opacity:0.7">(${f.level})</span>` : '';
                    const cls = f.signed ? 'bg-success' : (f.required ? 'bg-primary' : 'bg-secondary');
                    return `<span class="badge ${cls} me-1">${f.name}${lvl}</span>`;
                }).join('');
                $summary.html(
                    `${fields.length} signature field(s) &bull; ${reqCount} required &bull; ${signedCount} signed<br>` +
                    fieldBadges);
            }
        }

        // Build extern body from discovered roles
        buildExternBodyFromRoles();
    }

    /** Read current extern option from the button group */
    function getExternOption(key) {
        const $group = $('#extern-opt-' + key);
        const $active = $group.find('.active');
        if ($active.length === 0 || $active.hasClass('mixed')) return null;
        return $active.data('val') === true || $active.data('val') === 'true';
    }

    /** Set extern option: update buttons and sync to all externUsers in JSON */
    function setExternOption(key, value) {
        // Update button group
        const $group = $('#extern-opt-' + key);
        $group.find('button').removeClass('active mixed');
        $group.find(`button[data-val="${value}"]`).addClass('active');

        // Save to localStorage
        saveExternOptions();

        // Sync to JSON editor
        if (!state.editors['op-extern']) return;
        const body = getEditorValue('op-extern');
        if (typeof body !== 'object' || !Array.isArray(body.externUsers)) return;
        for (const user of body.externUsers) {
            user[key] = value;
        }
        setEditorValue('op-extern', body);
    }

    function saveExternOptions() {
        const opts = {};
        for (const key of ['sendEmails', 'singleSignOnEnabled', 'sendSMS']) {
            const val = getExternOption(key);
            if (val !== null) opts[key] = val;
        }
        try { localStorage.setItem('insign-extern-options', JSON.stringify(opts)); } catch { /* ignore */ }
    }

    function restoreExternOptions() {
        try {
            const stored = JSON.parse(localStorage.getItem('insign-extern-options'));
            if (!stored) return;
            for (const key of ['sendEmails', 'singleSignOnEnabled', 'sendSMS']) {
                if (key in stored) {
                    const $group = $('#extern-opt-' + key);
                    $group.find('button').removeClass('active mixed');
                    $group.find(`button[data-val="${stored[key]}"]`).addClass('active');
                }
            }
        } catch { /* ignore */ }
    }

    /** Sync extern option buttons from current JSON editor state */
    function syncExternOptionsFromJson() {
        if (!state.editors['op-extern']) return;
        const body = getEditorValue('op-extern');
        if (typeof body !== 'object' || !Array.isArray(body.externUsers) || body.externUsers.length === 0) return;

        for (const key of ['sendEmails', 'singleSignOnEnabled', 'sendSMS']) {
            const $group = $('#extern-opt-' + key);
            if (!$group.length) continue;

            const values = body.externUsers.map(u => u[key]);
            const allSame = values.every(v => v === values[0]);

            $group.find('button').removeClass('active mixed');
            if (allSame) {
                $group.find(`button[data-val="${values[0]}"]`).addClass('active');
            } else {
                // Mixed state — gray out all buttons
                $group.find('button').addClass('mixed');
            }
        }
    }

    /** Build extern/beginmulti body using discovered or catalog roles */
    function buildExternBodyFromRoles() {
        const d = state.demoData || {};
        const seller = d.seller || {};
        const buyer = d.buyer || {};
        const sw = d.streetWorkContract || {};
        const broker = sw.broker || {};
        const customer = sw.customer || {};
        const agency = sw.agency || {};
        const roles = state.discoveredRoles || [];

        const sendEmails = getExternOption('sendEmails') !== false;
        const sendSMS = getExternOption('sendSMS') === true;
        const singleSignOnEnabled = getExternOption('singleSignOnEnabled') !== false;

        const externUsers = [];
        const roleData = {
            seller: { email: seller.email, name: seller.name },
            buyer: { email: buyer.email, name: buyer.name },
            broker: { email: broker.email, name: broker.name },
            customer: { email: customer.email, name: customer.name },
            agency: { email: agency.email, name: agency.name },
            role_one: { email: seller.email, name: seller.name },
            role_two: { email: buyer.email, name: buyer.name }
        };

        for (const role of roles) {
            const data = roleData[role] || {};
            externUsers.push({
                recipient: data.email || `${role}@example.com`,
                realName: data.name || role,
                roles: [role],
                sendEmails,
                sendSMS,
                singleSignOnEnabled
            });
        }

        if (externUsers.length === 0) {
            externUsers.push(
                { recipient: seller.email || 'seller@example.com', realName: seller.name, roles: ['seller'], sendEmails, sendSMS, singleSignOnEnabled },
                { recipient: buyer.email || 'buyer@example.com', realName: buyer.name, roles: ['buyer'], sendEmails, sendSMS, singleSignOnEnabled }
            );
        }

        const body = {
            sessionid: state.sessionId || '<session-id>',
            externUsers,
            inOrder: false
        };

        if (state.editors['op-extern']) {
            setEditorValue('op-extern', body);
        }
        syncExternOptionsFromJson();
    }

    /** Execute extern/beginmulti and render signing links */
    async function executeExtern() {
        const body = getEditorValue('op-extern');

        const result = await state.apiClient.post('/extern/beginmulti', body);
        state.lastRequest = { method: 'POST', path: '/extern/beginmulti', body };

        const $responseDiv = $('.op-response[data-op="extern"]');
        if ($responseDiv.length) $responseDiv.removeClass('d-none');

        const $statusEl = $('.response-status[data-op="extern"]');
        if ($statusEl.length) {
            $statusEl.attr('class', 'response-status ' + (result.ok ? 'success' : 'error'));
            $statusEl.html(`
                <strong>${result.status}</strong> ${result.statusText}
                <span class="ms-auto text-muted-sm">${result.duration}ms</span>
            `);
        }

        showResponseEditor('op-extern', result.body);

        // Render signing links if present
        const $linksDiv = $('#extern-signing-links');
        if ($linksDiv.length && result.ok && result.body) {
            const resp = result.body;
            const users = resp.externUsers || [];
            if (users.length > 0 && users.some(u => u.externAccessLink)) {
                $linksDiv.css('display', '');
                $linksDiv.html('<div class="section-title">Signing Links</div>' +
                    '<p class="text-muted-sm">Each recipient has a unique link. Use separate browser profiles or private/incognito windows to avoid cookie conflicts between signers.</p>' +
                    users.map(u => {
                        const link = u.externAccessLink || '';
                        const roles = (u.roles || []).join(', ');
                        const name = u.recipient || u.realName || '';
                        if (!link) return '';
                        return `
                            <div class="signing-link-card mb-2 p-2" style="background:rgba(1,101,188,0.04);border-radius:8px;border:1px solid rgba(1,101,188,0.12)">
                                <div class="d-flex align-items-center gap-2 flex-wrap">
                                    <i class="bi bi-person-circle" style="color:var(--insign-blue);font-size:1.2rem"></i>
                                    <strong>${escapeHtml(name)}</strong>
                                    ${roles ? `<span class="badge bg-primary" style="font-size:0.7rem">${escapeHtml(roles)}</span>` : ''}
                                    <div class="ms-auto d-flex gap-1">
                                        <a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="btn btn-insign btn-insign-sm btn-insign-cta">
                                            <i class="bi bi-box-arrow-up-right"></i> Open
                                        </a>
                                        <button class="btn btn-insign btn-insign-sm btn-insign-outline" onclick="navigator.clipboard.writeText('${escapeHtml(link)}')">
                                            <i class="bi bi-clipboard"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="text-mono text-muted-sm mt-1" style="font-size:0.72rem;word-break:break-all">${escapeHtml(link)}</div>
                            </div>`;
                    }).join(''));
            } else {
                $linksDiv.css('display', 'none');
            }
        }

        updateCodeSnippets();
    }

    function escapeHtml(str) {
        return $('<div>').text(str).html();
    }

    async function executeDownload() {
        const body = getEditorValue('op-download');
        const result = await state.apiClient.call('POST', '/get/documents/download', { body, blobResponse: true, accept: '*/*' });

        state.lastRequest = { method: 'POST', path: '/get/documents/download', body };

        const $responseDiv = $('.op-response[data-op="download"]');
        if ($responseDiv.length) $responseDiv.removeClass('d-none');

        const $statusEl = $('.response-status[data-op="download"]');
        if ($statusEl.length) {
            $statusEl.attr('class', 'response-status ' + (result.ok ? 'success' : 'error'));
            $statusEl.html(`
                <strong>${result.status}</strong> ${result.statusText}
                <span class="ms-auto text-muted-sm">${result.duration}ms</span>
            `);
        }

        const $responsePre = $('pre.response-body[data-op="download"]');

        if (result.ok && result.blob) {
            // Trigger download
            const url = URL.createObjectURL(result.blob);
            const $a = $('<a>');
            const isPdf = result.blob.type === 'application/pdf';
            $a.attr('href', url);
            $a.attr('download', isPdf ? 'document.pdf' : 'documents.zip');
            $a[0].click();
            URL.revokeObjectURL(url);

            const sizeStr = result.blob.size < 1024 ? result.blob.size + ' B' :
                (result.blob.size / 1024).toFixed(1) + ' KB';
            if ($responsePre.length) {
                $responsePre.html(`Downloaded ${sizeStr} (${result.blob.type})` +
                    (isPdf && state.pdfViewer ? ` &mdash; <a href="#" onclick="window.app.previewLastDownload();return false" style="color:var(--insign-blue)">Preview</a>` : ''));
            }

            // Auto-preview PDFs
            if (isPdf && state.pdfViewer) {
                state._lastDownloadBlob = result.blob;
                previewBlob(result.blob, 'Signed Document');
            }
        } else {
            if ($responsePre.length) {
                const content = typeof result.body === 'object' ? JSON.stringify(result.body, null, 2) : result.raw;
                $responsePre.text(content);
            }
        }
    }

    async function executeDocumentSingle() {
        const body = getEditorValue('op-document-single');
        const obj = typeof body === 'string' ? JSON.parse(body) : body;
        const qs = new URLSearchParams(obj).toString();
        const url = '/get/document?' + qs;
        const result = await state.apiClient.call('POST', url, { blobResponse: true, accept: '*/*' });

        state.lastRequest = { method: 'POST', path: '/get/document', body };

        const $responseDiv = $('.op-response[data-op="document-single"]');
        if ($responseDiv.length) $responseDiv.removeClass('d-none');

        const $statusEl = $('.response-status[data-op="document-single"]');
        if ($statusEl.length) {
            $statusEl.attr('class', 'response-status ' + (result.ok ? 'success' : 'error'));
            $statusEl.html(`
                <strong>${result.status}</strong> ${result.statusText}
                <span class="ms-auto text-muted-sm">${result.duration}ms</span>
            `);
        }

        const $responsePre = $('pre.response-body[data-op="document-single"]');

        if (result.ok && result.blob) {
            const url = URL.createObjectURL(result.blob);
            const $a = $('<a>');
            $a.attr('href', url);
            $a.attr('download', (body.docid || 'document') + '.pdf');
            $a[0].click();
            URL.revokeObjectURL(url);

            const sizeStr = result.blob.size < 1024 ? result.blob.size + ' B' :
                (result.blob.size / 1024).toFixed(1) + ' KB';
            if ($responsePre.length) {
                $responsePre.html(`Downloaded ${sizeStr} (${result.blob.type})` +
                    (state.pdfViewer ? ` &mdash; <a href="#" onclick="window.app.previewLastDownload();return false" style="color:var(--insign-blue)">Preview</a>` : ''));
            }
            if (state.pdfViewer) {
                state._lastDownloadBlob = result.blob;
                previewBlob(result.blob, 'Document: ' + (body.docid || ''));
            }
        } else {
            if ($responsePre.length) {
                const content = typeof result.body === 'object' ? JSON.stringify(result.body, null, 2) : result.raw;
                $responsePre.text(content);
            }
        }
        updateCodeSnippets();
    }

    async function uploadDocument() {
        const $fileInput = $('#upload-file');
        const docId = $('#upload-docid').val();

        if (!$fileInput[0].files.length) {
            alert('Please select a PDF file');
            return;
        }

        const result = await state.apiClient.upload('/configure/uploaddocument', $fileInput[0].files[0], {
            sessionid: state.sessionId,
            docid: docId,
            filename: $fileInput[0].files[0].name
        });

        const $responseDiv = $('.op-response[data-op="upload"]');
        if ($responseDiv.length) $responseDiv.removeClass('d-none');

        const $statusEl = $('.response-status[data-op="upload"]');
        if ($statusEl.length) {
            $statusEl.attr('class', 'response-status ' + (result.ok ? 'success' : 'error'));
            $statusEl.html(`<strong>${result.status}</strong> ${result.statusText}`);
        }

        const $responsePre = $('pre.response-body[data-op="upload"]');
        if ($responsePre.length) {
            const content = typeof result.body === 'object' ? JSON.stringify(result.body, null, 2) : result.raw;
            $responsePre.text(content);
        }
    }

    function updateOperationEditors() {
        for (const [opKey, opDef] of Object.entries(OPERATIONS)) {
            if (opDef.getBody) {
                const editorId = 'op-' + opKey;
                if (state.editors[editorId]) {
                    setEditorValue(editorId, opDef.getBody());
                }
            }
        }
    }

    function copySessionId() {
        if (state.sessionId) {
            navigator.clipboard.writeText(state.sessionId);
        }
    }

    // =====================================================================
    // Code Snippets
    // =====================================================================

    function initCodeTabs() {
        if (!window.CodeGenerator) return;

        const $tabsEl = $('#code-lang-tabs');
        if (!$tabsEl.length) return;

        const languages = window.CodeGenerator.LANGUAGES;
        let first = true;

        for (const [key, lang] of Object.entries(languages)) {
            const $li = $('<li>');
            $li.addClass('nav-item');
            $li.attr('role', 'presentation');

            const $btn = $('<button>');
            $btn.addClass('nav-link' + (first ? ' active' : ''));
            $btn.text(lang.label);
            $btn.data('lang', key);
            $btn.on('click', () => {
                // Update active tab
                $tabsEl.find('.nav-link').removeClass('active');
                $btn.addClass('active');
                // Generate code
                showCodeSnippet(key);
            });

            $li.append($btn);
            $tabsEl.append($li);
            first = false;
        }
    }

    function showCodeSnippet(langKey) {
        if (!window.CodeGenerator || !state.apiClient) return;

        const req = state.lastRequest || { method: 'POST', path: '/configure/session', body: getDefaultCreateSessionBody() };

        const context = state.apiClient.getCodeContext(req.method, req.path, req.body);
        const code = window.CodeGenerator.generate(langKey, context);
        const lang = window.CodeGenerator.LANGUAGES[langKey];

        setEditorValue('code-snippet', code, lang.monacoLanguage);
    }

    function updateCodeSnippets() {
        // Refresh current language tab
        const $activeTab = $('#code-lang-tabs .nav-link.active');
        if ($activeTab.length) {
            showCodeSnippet($activeTab.data('lang'));
        }
    }

    // =====================================================================
    // Document selector
    // =====================================================================

    function buildDocumentSelector() {
        const $container = $('#doc-selector');
        if (!$container.length) return;

        let html = '';
        for (const [key, doc] of Object.entries(DOCUMENTS)) {
            const isSelected = key === state.selectedDoc;
            const icon = key === 'custom' ? '<i class="bi bi-folder2-open"></i> ' : '';
            const badge = doc.local ? ' <span class="badge bg-info" style="font-size:0.6rem;vertical-align:middle;font-weight:400">local</span>' : '';
            html += `
                <div class="doc-option${isSelected ? ' selected' : ''}" data-doc="${key}" onclick="window.app.selectDocument('${key}')">
                    <div class="doc-title">${icon}${doc.label}${badge}</div>
                    <div class="doc-desc">${doc.desc}</div>
                </div>`;
        }
        $container.html(html);
    }

    function selectDocument(type) {
        state.selectedDoc = type;

        $('.doc-option').each(function () {
            const $el = $(this);
            $el.toggleClass('selected', $el.data('doc') === type);
        });

        // Show/hide custom file input
        const $customGroup = $('#custom-file-group');
        if ($customGroup.length) $customGroup.css('display', type === 'custom' ? '' : 'none');

        // Update displayname input to match selected document
        const $dnInput = $('#cfg-displayname');
        if ($dnInput.length) {
            const selDoc = getSelectedDocument();
            $dnInput.val(type === 'custom'
                ? (state.customFileData ? state.customFileData.name : '')
                : (selDoc.label || ''));
        }

        // Update editor if exists
        if (state.editors['create-session']) {
            setEditorValue('create-session', getDefaultCreateSessionBody());
            applyFeatureSettingsToEditor();
        }
        saveAppState();
    }

    function setFileDelivery(mode) {
        state.fileDelivery = mode;

        const hints = {
            base64: 'File is fetched in your browser and sent as base64 inside the JSON request.',
            upload: 'Session is created first (no file), then the file is uploaded via /configure/uploaddocument.',
            url: 'The inSign server fetches the file from the URL. Works only if the URL is publicly accessible.'
        };
        const $hintEl = $('#file-delivery-hint');
        if ($hintEl.length) $hintEl.html('<i class="bi bi-info-circle"></i> ' + hints[mode]);

        // Update editor
        if (state.editors['create-session']) {
            setEditorValue('create-session', getDefaultCreateSessionBody());
        }
        saveAppState();
    }

    function onCustomFileSelected(input) {
        const file = input.files[0];
        const $infoEl = $('#custom-file-info');
        if (!file) {
            state.customFileData = null;
            if ($infoEl.length) $infoEl.text('');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            state.customFileData = {
                name: file.name,
                base64: base64,
                blob: file
            };
            if ($infoEl.length) $infoEl.text(file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)');

            // Update editor
            if (state.editors['create-session']) {
                setEditorValue('create-session', getDefaultCreateSessionBody());
            }
        };
        reader.readAsDataURL(file);
    }

    // =====================================================================
    // Reset
    // =====================================================================

    function resetRequestBody(editorId) {
        if (editorId === 'create-session') {
            setEditorValue('create-session', getDefaultCreateSessionBody());
        }
    }

    // =====================================================================
    // Dark mode
    // =====================================================================

    function initDarkMode() {
        // Check saved preference, then system preference
        let dark = false;
        try { dark = localStorage.getItem('insign-dark-mode') === 'true'; } catch { /* ignore */ }
        if (localStorage.getItem('insign-dark-mode') === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            dark = true;
        }
        applyDarkMode(dark);
    }

    function toggleDarkMode() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        applyDarkMode(!isDark);
        try { localStorage.setItem('insign-dark-mode', String(!isDark)); } catch { /* ignore */ }
    }

    function applyDarkMode(dark) {
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

        // Update button icon
        const $btn = $('#btn-dark-mode');
        if ($btn.length) $btn.html(dark ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon"></i>');

        // Switch Monaco theme (global — applies to all editor instances)
        if (state.monacoReady && window.monaco) {
            monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
        }
    }

    // =====================================================================
    // Public API (for inline onclick handlers)
    // =====================================================================

    /** Toggle pin state on a feature description panel */
    function toggleDescPin(descId, infoId) {
        const $desc = $('#' + descId);
        const $icon = $('#' + infoId);
        if (!$desc.length) return;
        $desc.toggleClass('pinned');
        if ($icon.length) $icon.toggleClass('pinned');
    }

    // =====================================================================
    // Webhook Provider Management
    // =====================================================================

    function setWebhookProvider(provider) {
        state.webhookProvider = provider;
        const info = WEBHOOK_PROVIDERS[provider] || WEBHOOK_PROVIDERS['webhook.site'];

        // Update hint text
        const $hint = $('#webhook-provider-hint');
        if ($hint.length) $hint.html(`<i class="bi bi-info-circle"></i> ${info.hint}`);

        // Show/hide custom URL input
        const $customGroup = $('#webhook-custom-url-group');
        if ($customGroup.length) $customGroup.css('display', info.needsCustomUrl ? '' : 'none');

        if (provider === 'cfworker') {
            // Cloudflare Worker: set base URL, then auto-create channel
            const workerUrl = ($('#cfg-webhook-custom-url').val() || '').trim();
            if (workerUrl && state.webhookViewer) {
                state.webhookViewer.setCfWorkerUrl(workerUrl);
            }
            reinitWebhook();
        } else if (info.needsCustomUrl) {
            // Custom provider: just update session JSON with whatever URL user entered
            if (state.webhookViewer) state.webhookViewer.stopPolling();
            const customUrl = ($('#cfg-webhook-custom-url').val() || '').trim();
            if (state.editors['create-session'] && customUrl) {
                const body = getEditorValue('create-session');
                if (typeof body === 'object') {
                    body.serverSidecallbackURL = customUrl;
                    body.serversideCallbackMethod = 'POST';
                    body.serversideCallbackContenttype = 'JSON';
                    setEditorValue('create-session', body);
                }
            }
        } else {
            // Auto-managed providers — reinit with new provider
            reinitWebhook();
        }

        saveAppState();
    }

    function reinitWebhook() {
        if (state.webhookViewer) {
            state.webhookViewer.destroy();
        }
        state.webhookViewer = new window.WebhookViewer('#sidebar-webhook-container');
        state.webhookViewer.setProvider(state.webhookProvider);
        if (state.webhookProvider === 'cfworker') {
            const workerUrl = ($('#cfg-webhook-custom-url').val() || '').trim();
            if (workerUrl) state.webhookViewer.setCfWorkerUrl(workerUrl);
        }
        window.webhookViewer = state.webhookViewer;
        state.webhookViewer.onUrlCreated = (url) => {
            state.webhookUrl = url;
            if (state.editors['create-session']) {
                const body = getEditorValue('create-session');
                if (typeof body === 'object') {
                    body.serverSidecallbackURL = url;
                    body.serversideCallbackMethod = 'POST';
                    body.serversideCallbackContenttype = 'JSON';
                    setEditorValue('create-session', body);
                }
            }
        };
        state.webhookViewer.createEndpoint().then(url => {
            if (url) state.webhookViewer.startPolling();
        });
    }

    // Keep old name as alias for any remaining references
    function reinitSmeeWebhook() { reinitWebhook(); }

    // =====================================================================
    // Status Polling (fallback when webhooks disabled)
    // =====================================================================

    let _pollInterval = null;
    let _pollCountdownStart = null;
    let _pollCountdownRAF = null;
    let _lastPollBody = null; // parsed object for deep diff

    function startStatusPolling() {
        stopStatusPolling();
        pollNow();
        _pollInterval = setInterval(pollNow, 5000);
        startCountdownAnimation();
        updatePollingToggleButton(true);
    }

    function stopStatusPolling() {
        if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
        if (_pollCountdownRAF) { cancelAnimationFrame(_pollCountdownRAF); _pollCountdownRAF = null; }
        updatePollingToggleButton(false);
    }

    function togglePolling() {
        if (_pollInterval) {
            stopStatusPolling();
            const $statusText = $('#polling-status-text');
            if ($statusText.length) $statusText.text('Paused');
        } else {
            startStatusPolling();
        }
    }

    function updatePollingToggleButton(running) {
        const $btn = $('#btn-polling-toggle');
        if (!$btn.length) return;
        $btn.html(running
            ? '<i class="bi bi-pause-fill"></i> Pause'
            : '<i class="bi bi-play-fill"></i> Start');
    }

    function startCountdownAnimation() {
        _pollCountdownStart = Date.now();
        const $bar = $('#polling-countdown-bar');
        if (!$bar.length) return;

        function animate() {
            const elapsed = Date.now() - _pollCountdownStart;
            const pct = Math.max(0, 100 - (elapsed / 5000) * 100);
            $bar.css('transition', 'none');
            $bar.css('width', pct + '%');
            if (pct > 0 && _pollInterval) {
                _pollCountdownRAF = requestAnimationFrame(animate);
            }
        }
        animate();
    }

    async function pollNow() {
        if (!state.sessionId || !state.apiClient) return;

        const $statusText = $('#polling-status-text');
        if ($statusText.length) $statusText.text('Polling...');

        // Reset countdown
        _pollCountdownStart = Date.now();
        startCountdownAnimation();

        try {
            const result = await state.apiClient.post('/get/status', { sessionid: state.sessionId });
            if (!result.ok) {
                if ($statusText.length) $statusText.text(`Error ${result.status}: ${result.statusText}`);
                return;
            }
            const body = result.body;

            if ($statusText.length) $statusText.text('Last poll: ' + new Date().toLocaleTimeString());

            // Detect and display changes
            if (_lastPollBody !== null && typeof body === 'object') {
                const diffs = jsonDiff(_lastPollBody, body);
                if (diffs.length > 0) {
                    addPollChangeCard(diffs);
                }
            }
            _lastPollBody = typeof body === 'object' ? JSON.parse(JSON.stringify(body)) : body;
        } catch (err) {
            if ($statusText.length) $statusText.text('Error: ' + (err.message || err));
        }
    }

    /**
     * Deep-diff two JSON objects. Returns array of { path, oldVal, newVal, type }.
     * type: 'changed' | 'added' | 'removed'
     */
    function jsonDiff(oldObj, newObj, prefix) {
        prefix = prefix || '';
        const diffs = [];

        // Diff arrays element-by-element
        if (Array.isArray(oldObj) && Array.isArray(newObj)) {
            const maxLen = Math.max(oldObj.length, newObj.length);
            for (let i = 0; i < maxLen; i++) {
                const path = prefix + '[' + i + ']';
                if (i >= oldObj.length) {
                    diffs.push({ path, oldVal: undefined, newVal: newObj[i], type: 'added' });
                } else if (i >= newObj.length) {
                    diffs.push({ path, oldVal: oldObj[i], newVal: undefined, type: 'removed' });
                } else if (typeof oldObj[i] === 'object' && oldObj[i] !== null && typeof newObj[i] === 'object' && newObj[i] !== null) {
                    diffs.push(...jsonDiff(oldObj[i], newObj[i], path));
                } else if (JSON.stringify(oldObj[i]) !== JSON.stringify(newObj[i])) {
                    diffs.push({ path, oldVal: oldObj[i], newVal: newObj[i], type: 'changed' });
                }
            }
            return diffs;
        }

        const allKeys = new Set([
            ...(oldObj && typeof oldObj === 'object' ? Object.keys(oldObj) : []),
            ...(newObj && typeof newObj === 'object' ? Object.keys(newObj) : [])
        ]);

        for (const key of allKeys) {
            const path = prefix ? prefix + '.' + key : key;
            const oldVal = oldObj?.[key];
            const newVal = newObj?.[key];

            if (oldVal === undefined && newVal !== undefined) {
                diffs.push({ path, oldVal: undefined, newVal, type: 'added' });
            } else if (oldVal !== undefined && newVal === undefined) {
                diffs.push({ path, oldVal, newVal: undefined, type: 'removed' });
            } else if (typeof oldVal === 'object' && oldVal !== null && typeof newVal === 'object' && newVal !== null) {
                // Recurse into nested objects AND arrays
                diffs.push(...jsonDiff(oldVal, newVal, path));
            } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                diffs.push({ path, oldVal, newVal, type: 'changed' });
            }
        }
        return diffs;
    }

    function formatDiffValue(val) {
        if (val === undefined) return '(absent)';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    }

    function addPollChangeCard(diffs) {
        const $container = $('#polling-changes');
        if (!$container.length) return;

        // Remove "waiting" placeholder
        $container.find('.text-center').remove();

        const time = new Date().toLocaleTimeString();

        const diffRows = diffs.map(d => {
            let bgColor, label, textColor;
            if (d.type === 'added') { bgColor = '#22863a'; label = '+'; textColor = '#aaffaa'; }
            else if (d.type === 'removed') { bgColor = '#b31d28'; label = '\u2212'; textColor = '#ffaaaa'; }
            else { bgColor = '#1b3a4b'; label = '~'; textColor = '#7ec8e3'; }

            let valueHtml = '';
            if (d.type === 'changed') {
                valueHtml = `<span style="color:#ff9999;text-decoration:line-through">${escapeHtml(formatDiffValue(d.oldVal))}</span> <span style="color:#888">\u2192</span> <span style="color:#99ff99;font-weight:600">${escapeHtml(formatDiffValue(d.newVal))}</span>`;
            } else if (d.type === 'added') {
                valueHtml = `<span style="color:#99ff99;font-weight:600">${escapeHtml(formatDiffValue(d.newVal))}</span>`;
            } else {
                valueHtml = `<span style="color:#ff9999;text-decoration:line-through">${escapeHtml(formatDiffValue(d.oldVal))}</span>`;
            }

            return `<div style="font-size:0.73rem;margin-bottom:2px;line-height:1.4;padding:2px 6px;border-radius:3px;background:${bgColor};white-space:nowrap;font-family:monospace">` +
                `<span style="display:inline-block;min-width:14px;text-align:center;font-weight:700;color:${textColor}">${label}</span> ` +
                `<span style="color:#79b8ff">${escapeHtml(d.path)}</span> ` +
                valueHtml +
                `</div>`;
        }).join('');

        const $card = $('<div>');
        $card.addClass('webhook-entry');
        $card.html(`
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span>
                    <span class="webhook-method">STATUS</span>
                    <span class="webhook-time ms-2">${time}</span>
                </span>
                <span class="badge bg-warning" style="font-size:0.65rem">${diffs.length} change${diffs.length !== 1 ? 's' : ''}</span>
            </div>
            ${diffRows}
        `);
        $container.prepend($card);
    }

    // =====================================================================
    // Feature Search / Filter
    // =====================================================================

    function filterFeatures(query) {
        const q = query.trim().toLowerCase();
        const clearBtn = document.getElementById('feature-search-clear');
        const countEl = document.getElementById('feature-search-count');
        if (clearBtn) clearBtn.style.display = q ? '' : 'none';

        const toggles = document.querySelectorAll('#feature-toggles .feature-toggle');
        const groups = document.querySelectorAll('#feature-toggles .feature-group');
        let matchCount = 0;
        let totalCount = toggles.length;

        if (!q) {
            // No query — show everything, restore collapsed state
            toggles.forEach(t => t.style.display = '');
            groups.forEach(g => {
                g.style.display = '';
                const collapse = g.querySelector('.collapse');
                if (collapse && collapse.classList.contains('show')) {
                    // leave open groups open
                } // collapsed groups stay collapsed
            });
            if (countEl) countEl.style.display = 'none';
            return;
        }

        const terms = q.split(/\s+/);

        toggles.forEach(t => {
            const searchData = t.getAttribute('data-search') || '';
            const match = terms.every(term => searchData.includes(term));
            t.style.display = match ? '' : 'none';
            if (match) matchCount++;
        });

        // Show/hide groups based on whether they have visible toggles; force-open matching groups
        groups.forEach(g => {
            const visible = g.querySelectorAll('.feature-toggle:not([style*="display: none"])');
            if (visible.length > 0) {
                g.style.display = '';
                const collapse = g.querySelector('.collapse');
                if (collapse && !collapse.classList.contains('show')) {
                    collapse.classList.add('show'); // expand groups with matches
                }
            } else {
                g.style.display = 'none';
            }
        });

        if (countEl) {
            countEl.style.display = '';
            countEl.textContent = `${matchCount} of ${totalCount} features match`;
        }
    }

    // =====================================================================
    // Branding & CSS Customizer
    // =====================================================================

    const COLOR_SCHEMES = [
        { name: 'inSign Default', colors: { primary: '#0165BC', accent: '#E48803', dark: '#2C2C2C', error: '#BD2318' } },
        { name: 'Ocean Blue', colors: { primary: '#1565C0', accent: '#00ACC1', dark: '#1B2838', error: '#C62828' } },
        { name: 'Forest', colors: { primary: '#2E7D32', accent: '#F9A825', dark: '#1B2F1B', error: '#C62828' } },
        { name: 'Corporate Red', colors: { primary: '#B71C1C', accent: '#FF8F00', dark: '#212121', error: '#B71C1C' } },
        { name: 'Royal Purple', colors: { primary: '#6A1B9A', accent: '#00ACC1', dark: '#1A1A2E', error: '#C62828' } },
        { name: 'Teal Mint', colors: { primary: '#00796B', accent: '#FF6F00', dark: '#263238', error: '#D32F2F' } },
        { name: 'Sunset Orange', colors: { primary: '#E65100', accent: '#1565C0', dark: '#3E2723', error: '#B71C1C' } },
        { name: 'Slate Gray', colors: { primary: '#455A64', accent: '#FFA000', dark: '#263238', error: '#C62828' } },
    ];

    /** Derive lighter/darker variants from a hex color */
    function hexToHSL(hex) {
        let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
        const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
        let h = 0, s = 0, l = (max+min)/2;
        if (d) { s = l > 0.5 ? d/(2-max-min) : d/(max+min); h = max===r ? ((g-b)/d+(g<b?6:0))/6 : max===g ? ((b-r)/d+2)/6 : ((r-g)/d+4)/6; }
        return [h*360, s*100, l*100];
    }

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1-l);
        const f = n => { const k = (n + h/30) % 12; return l - a * Math.max(Math.min(k-3, 9-k, 1), -1); };
        return '#' + [f(0),f(8),f(4)].map(x => Math.round(x*255).toString(16).padStart(2,'0')).join('');
    }

    function lighten(hex, amount) { const [h,s,l] = hexToHSL(hex); return hslToHex(h, s, Math.min(100, l + amount)); }
    function darken(hex, amount) { const [h,s,l] = hexToHSL(hex); return hslToHex(h, s, Math.max(0, l - amount)); }
    function transparentize(hex, alpha) { return hex + Math.round(alpha*255).toString(16).padStart(2,'0'); }

    /** Generate the full CSS override from base colors, following the farbpalette variable structure */
    function generateBrandCSS(primary, accent, dark, error) {
        const lightPrimary = lighten(primary, 15);
        const lighterPrimary = lighten(primary, 25);
        const lightestPrimary = lighten(primary, 40);
        const ultraLightPrimary = lighten(primary, 48);
        const darkPrimary = darken(primary, 10);

        const lightAccent = lighten(accent, 15);
        const darkAccent = darken(accent, 10);

        const lightDark = lighten(dark, 20);
        const lighterDark = lighten(dark, 40);
        const lightestDark = lighten(dark, 55);

        const lightError = lighten(error, 15);
        const lightestError = lighten(error, 40);

        return `:root {
  /* Base palette — derived from chosen colors */
  --insignBlue: ${primary};
  --insignModernBlue: ${lightPrimary};
  --insignMediumBlue: ${lightPrimary};
  --insignLightBlue: ${lightPrimary};
  --insignLightBlue2: ${lighterPrimary};
  --insignLighterBlue: ${lighterPrimary};
  --insignUltraLightBlue: ${ultraLightPrimary};
  --insignLightestBlue: ${lightestPrimary};
  --insignHighlightBlue: ${ultraLightPrimary};
  --insignNavy: ${darkPrimary};

  /* Accent colors */
  --insignOrange: ${accent};
  --insignBlueInverted: ${lightAccent};
  --insignLightOrange: ${lightAccent};
  --insignYellow: ${lighten(accent, 20)};
  --insignAlternativeYellow: ${accent};

  /* Dark tones */
  --insignDarkBlack: ${dark};
  --insignBlack: ${lightDark};
  --insignLightBlack: ${lighterDark};
  --insignAlternativeBlack: ${lightDark};

  /* Error / Success */
  --insignRed: ${error};
  --insignLightRed: ${lightError};
  --insignLightestRed: ${lightestError};

  /* General derived */
  --insignMain: var(--insignBlue);
  --insignLightMain: var(--insignLightBlue);
  --insignButtonPrimaryBackground: var(--insignMain);
  --insignButtonPrimaryBorder: var(--insignMain);
  --insignButtonPrimaryHoverBackground: var(--insignLightMain);
  --insignButtonPrimaryHoverBorder: var(--insignLightMain);
  --insignLinkColor: var(--insignMain);
  --insignDialogHeaderColor: var(--insignMain);
  --insignNavBackground: ${dark};
  --insignNavNextActionBackground: var(--insignMain);
  --insignMailHeadingBorderColor: var(--insignMain);
  --insignMailButtonPrimaryBackground: var(--insignMain);
  --insignGalleryFocusColor: var(--insignBlue);
  --insignQuickTipBackgroundColor: var(--insignBlue);
  --insignErrorColor: var(--insignRed);
  --insignWarnColor: ${accent};
}`;
    }

    /** Build color scheme preset buttons */
    function buildColorSchemePresets() {
        const container = document.getElementById('color-scheme-presets');
        if (!container) return;
        container.innerHTML = COLOR_SCHEMES.map((scheme, i) => `
            <div class="color-scheme-btn" onclick="window.app.selectColorScheme(${i})" title="${scheme.name}">
                <span class="color-scheme-dot" style="background:${scheme.colors.primary}"></span>
                <span class="color-scheme-dot" style="background:${scheme.colors.accent}"></span>
                <span class="color-scheme-dot" style="background:${scheme.colors.dark}"></span>
                <span style="font-size:0.7rem">${scheme.name}</span>
            </div>
        `).join('');
    }

    function selectColorScheme(index) {
        const scheme = COLOR_SCHEMES[index];
        if (!scheme) return;
        document.getElementById('brand-color-primary').value = scheme.colors.primary;
        document.getElementById('brand-color-primary-hex').value = scheme.colors.primary;
        document.getElementById('brand-color-accent').value = scheme.colors.accent;
        document.getElementById('brand-color-accent-hex').value = scheme.colors.accent;
        document.getElementById('brand-color-dark').value = scheme.colors.dark;
        document.getElementById('brand-color-dark-hex').value = scheme.colors.dark;
        document.getElementById('brand-color-error').value = scheme.colors.error;
        document.getElementById('brand-color-error-hex').value = scheme.colors.error;

        // Highlight active
        document.querySelectorAll('.color-scheme-btn').forEach((btn, j) => btn.classList.toggle('active', j === index));

        updateBrandColor();
    }

    function updateBrandColor() {
        const primary = document.getElementById('brand-color-primary').value;
        const accent = document.getElementById('brand-color-accent').value;
        const dark = document.getElementById('brand-color-dark').value;
        const error = document.getElementById('brand-color-error').value;

        // Sync hex text fields
        document.getElementById('brand-color-primary-hex').value = primary;
        document.getElementById('brand-color-accent-hex').value = accent;
        document.getElementById('brand-color-dark-hex').value = dark;
        document.getElementById('brand-color-error-hex').value = error;

        const css = generateBrandCSS(primary, accent, dark, error);
        const preview = document.getElementById('brand-css-preview');
        if (preview) preview.value = css;
    }

    function applyBrandingCSS() {
        const css = document.getElementById('brand-css-preview')?.value;
        if (!css || !state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;

        // Collapse to single line — the API field expects no linebreaks
        body.externalPropertiesURL = css.replace(/\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
        setEditorValue('create-session', body);
    }

    function resetBranding() {
        selectColorScheme(0); // reset to inSign default

        // Remove externalPropertiesURL from JSON
        if (state.editors['create-session']) {
            const body = getEditorValue('create-session');
            if (typeof body === 'object') {
                delete body.externalPropertiesURL;
                setEditorValue('create-session', body);
            }
        }
    }

    /** Convert an image URL to a base64 data URL via canvas (or fetch for SVG) */
    async function toBase64DataUrl(src) {
        // Already a data URL — pass through
        if (src.startsWith('data:')) return src;

        // SVG: fetch text and encode directly
        if (src.endsWith('.svg') || src.includes('image/svg')) {
            const resp = await fetch(src);
            const text = await resp.text();
            return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
        }

        // Raster image: draw to canvas and export as PNG data URL
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth || img.width;
                c.height = img.naturalHeight || img.height;
                c.getContext('2d').drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
            };
            img.onerror = () => reject(new Error('Failed to load image: ' + src));
            img.src = src;
        });
    }

    /** Show a preview thumbnail */
    function showPreview(elementId, dataUrl) {
        const el = document.getElementById(elementId);
        if (el) el.innerHTML = `<img src="${dataUrl.replace(/"/g, '&quot;')}" alt="Preview">`;
    }

    // Logo sets: each set has icon (30x30), mail (120x60), login (314x100)
    const LOGO_SETS = [
        { name: 'inSign Default', prefix: null,
          icon: 'https://app.getinsign.de/resstart/img/insign_logo_editor_desktop.png',
          mail: 'https://app.getinsign.de/resstart/img/logo-insign.svg',
          login: 'https://app.getinsign.de/resstart/img/logo-insign.svg' },
        { name: 'ACME Corp', prefix: 'acme' },
        { name: 'GreenLeaf', prefix: 'greenleaf' },
        { name: 'NOVA Finance', prefix: 'nova' },
        { name: 'BluePrint', prefix: 'blueprint' },
        { name: 'SOLIS Tech', prefix: 'solis' },
    ];

    function getLogoSrc(set, variant) {
        if (set.prefix === null) return set[variant]; // inSign default uses direct URLs
        return `img/sample-logos/${set.prefix}-${variant}.svg`;
    }

    function buildLogoSets() {
        const container = document.getElementById('logo-sets');
        if (!container) return;
        // "Default" card first — removes all logos from JSON
        let html = `
            <div class="logo-set-card active" onclick="window.app.resetLogos()" title="Remove all custom logos — use server defaults">
                <div class="logo-set-row" style="height:28px;align-items:center;justify-content:center">
                    <i class="bi bi-x-circle" style="font-size:1.2rem;color:var(--insign-text-muted)"></i>
                </div>
                <div style="height:22px;display:flex;align-items:center;justify-content:center">
                    <span style="font-size:0.62rem;color:var(--insign-text-muted)">no custom logos</span>
                </div>
                <div class="logo-set-name">Default</div>
            </div>`;
        html += LOGO_SETS.map((set, i) => `
            <div class="logo-set-card" onclick="window.app.selectLogoSet(${i})" title="${set.name}">
                <div class="logo-set-row">
                    <img class="logo-set-icon" src="${getLogoSrc(set, 'icon')}" alt="icon">
                    <img class="logo-set-mail" src="${getLogoSrc(set, 'mail')}" alt="mail">
                </div>
                <img class="logo-set-login" src="${getLogoSrc(set, 'login')}" alt="login">
                <div class="logo-set-name">${set.name}</div>
            </div>
        `).join('');
        container.innerHTML = html;
    }

    /** Build an absolute URL from a relative path based on current page location */
    function buildAbsoluteUrl(relativePath) {
        const base = window.location.href.replace(/[^/]*$/, ''); // strip filename
        return new URL(relativePath, base).href;
    }

    /** Apply a logo set: uses absolute URLs for SVG icons (works when served over HTTPS) */
    function selectLogoSet(index) {
        const set = LOGO_SETS[index];
        if (!set) return;

        // Highlight active card (index+1 because first card is Default)
        document.querySelectorAll('.logo-set-card').forEach((c, j) => c.classList.toggle('active', j === index + 1));

        const iconUrl = set.prefix === null ? set.icon : buildAbsoluteUrl(getLogoSrc(set, 'icon'));
        const mailUrl = set.prefix === null ? set.mail : buildAbsoluteUrl(getLogoSrc(set, 'mail'));
        const loginUrl = set.prefix === null ? set.login : buildAbsoluteUrl(getLogoSrc(set, 'login'));

        // Apply to JSON body
        if (!state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;
        if (!body.guiProperties) body.guiProperties = {};

        // App icon — via message ID for editor desktop logo
        body.guiProperties['start.logo.url.editor.desktop'] = iconUrl;
        // Mail header — right-side logo
        body.guiProperties['message.mt.header.image'] = mailUrl;
        // Login logo
        body.logoExtern = loginUrl;

        setEditorValue('create-session', body);

        // Update individual override fields + previews
        document.getElementById('brand-app-icon').value = iconUrl;
        document.getElementById('brand-mail-header-image').value = mailUrl;
        document.getElementById('brand-logo-extern').value = loginUrl;
        showPreview('brand-app-icon-preview', iconUrl);
        showPreview('brand-mail-header-preview', mailUrl);
        showPreview('brand-logo-extern-preview', loginUrl);
    }

    /** Remove all custom logos from JSON — revert to server defaults */
    function resetLogos() {
        // Highlight Default card (first one)
        document.querySelectorAll('.logo-set-card').forEach((c, j) => c.classList.toggle('active', j === 0));

        if (!state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;

        // Remove logo keys
        if (body.guiProperties) {
            delete body.guiProperties['start.logo.url.editor.desktop'];
            delete body.guiProperties['message.mt.header.image'];
            delete body.guiProperties['message.mt.header.image.left'];
            if (Object.keys(body.guiProperties).length === 0) delete body.guiProperties;
        }
        delete body.logoExtern;

        setEditorValue('create-session', body);

        // Clear individual fields + previews
        document.getElementById('brand-app-icon').value = '';
        document.getElementById('brand-mail-header-image').value = '';
        document.getElementById('brand-logo-extern').value = '';
        document.getElementById('brand-app-icon-preview').innerHTML = '';
        document.getElementById('brand-mail-header-preview').innerHTML = '';
        document.getElementById('brand-logo-extern-preview').innerHTML = '';
    }

    /** Update a single logo slot: icon | mail | login */
    async function updateBrandLogo(slot, url) {
        if (!state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;
        if (!body.guiProperties) body.guiProperties = {};

        const dataUrl = url ? await toBase64DataUrl(url) : null;
        const config = {
            icon:  { key: 'start.logo.url.editor.desktop', path: 'guiProperties', input: 'brand-app-icon', preview: 'brand-app-icon-preview' },
            mail:  { key: 'message.mt.header.image',       path: 'guiProperties', input: 'brand-mail-header-image', preview: 'brand-mail-header-preview' },
            login: { key: 'logoExtern',                    path: 'root',          input: 'brand-logo-extern', preview: 'brand-logo-extern-preview' }
        }[slot];
        if (!config) return;

        if (dataUrl) {
            if (config.path === 'guiProperties') body.guiProperties[config.key] = dataUrl;
            else body[config.key] = dataUrl;
            document.getElementById(config.input).value = dataUrl;
            showPreview(config.preview, dataUrl);
        } else {
            if (config.path === 'guiProperties') delete body.guiProperties[config.key];
            else delete body[config.key];
        }
        setEditorValue('create-session', body);
    }

    function uploadBrandLogo(input, slot) {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => updateBrandLogo(slot, reader.result);
        reader.readAsDataURL(file);
    }

    window.app = {
        createSession,
        openInSign,
        openSessionManager,
        executeOperation,
        executeExtern,
        executeDownload,
        executeDocumentSingle,
        uploadDocument,
        discoverFieldsAndRoles,
        setExternOption,
        updateFeature,
        toggleDescPin,
        filterFeatures,
        previewDocument,
        previewBlob,
        previewLastDownload: () => { if (state._lastDownloadBlob) previewBlob(state._lastDownloadBlob, 'Downloaded Document'); },
        copySessionId,
        goToStep,
        selectDocument,
        setFileDelivery,
        onCustomFileSelected,
        applyManualSessionId,
        applyNavbarSessionId,
        resetRequestBody,
        toggleDarkMode,
        setWebhookProvider,
        pollNow,
        togglePolling,
        toggleWebhookSection,
        togglePollingSection,
        // Branding
        selectColorScheme,
        updateBrandColor,
        applyBrandingCSS,
        resetBranding,
        selectLogoSet,
        resetLogos,
        updateBrandLogo,
        uploadBrandLogo
    };

    // =====================================================================
    // Boot
    // =====================================================================

    $(init);

})();
