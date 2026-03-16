/* ==========================================================================
   inSign API Explorer - Main Application
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
        selectedDoc: 'acme',
        fileDelivery: 'base64',       // 'base64' | 'upload' | 'url'
        customFileData: null,         // { name, base64, blob } when user picks own file
        discoveredRoles: null,        // ['seller','buyer'] from /get/documents/full
        discoveredFields: null,       // [{role, name, required, signed}]
        pdfViewer: null,              // PdfViewer instance
        lastRequest: null,            // { method, path, body } for code generation
        schemaLoader: new window.OpenApiSchemaLoader(),
        monacoReady: false,
        _editorSyncLock: false,        // prevent infinite loops during bidirectional sync
        webhookProvider: 'smee', // current webhook provider
        authMode: 'basic'       // 'basic' or 'oauth2'
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
    function faviconUrl(domain) {
        return 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=32';
    }

    const WEBHOOK_PROVIDERS = {
        'webhook.site': {
            label: 'webhook.site', icon: 'bi-inbox', tag: 'Poll',
            favicon: faviconUrl('webhook.site'),
            desc: 'Free, no signup. Auto-creates a unique endpoint and polls for incoming requests every 4 seconds.',
            hint: 'Polling every 4s. GET & POST supported.',
            url: 'https://webhook.site', postOnly: false
        },
        smee: {
            label: 'smee.io', icon: 'bi-broadcast', tag: 'SSE',
            favicon: faviconUrl('smee.io'),
            desc: 'GitHub-hosted real-time event proxy. Streams webhook payloads to your browser via Server-Sent Events.',
            hint: 'Real-time via SSE. POST callbacks only.',
            url: 'https://smee.io', postOnly: true
        },
        postbin: {
            label: 'postb.in', icon: 'bi-collection', tag: 'Poll',
            favicon: faviconUrl('postb.in'),
            desc: 'Toptal-hosted request bin. Collects POSTs into a FIFO queue with 30-minute lifetime per bin.',
            hint: 'FIFO queue, 30min bin lifetime.',
            url: 'https://www.toptal.com/developers/postbin', postOnly: false
        },
        ntfy: {
            label: 'ntfy.sh', icon: 'bi-bell', tag: 'SSE',
            favicon: faviconUrl('ntfy.sh'),
            desc: 'Open-source notification service repurposed as a webhook relay. Real-time SSE, but large JSON bodies may be truncated.',
            hint: 'SSE real-time. Large payloads may be truncated.',
            url: 'https://ntfy.sh', postOnly: false
        },
        // cfworker disabled - CF Workers free tier has no reliable shared state across isolates
        // cfworker: {
        //     label: 'CF Worker', icon: 'bi-cloud-arrow-up', tag: 'Poll',
        //     favicon: faviconUrl('workers.cloudflare.com'),
        //     desc: 'Deploy cf-webhook-worker.js to your Cloudflare account.',
        //     hint: 'Self-hosted on Cloudflare Workers. Enter your worker URL below.',
        //     url: 'https://workers.cloudflare.com', postOnly: false, needsCustomUrl: true
        // },
        custom: {
            label: 'Custom URL', icon: 'bi-link-45deg', tag: 'Custom',
            desc: 'Point to any HTTP endpoint you control. No automatic polling or SSE - just injects the URL into the session JSON.',
            hint: 'Enter your own webhook endpoint URL below.',
            postOnly: false, needsCustomUrl: true
        }
    };

    // =====================================================================
    // Document catalog & URL helpers
    // =====================================================================

    /** Available test documents with metadata */
    const DOCUMENTS = {
        // --- Branded contracts (generated from docs/img/doc-headers + docs/data/branded-contracts.json) ---
        acme: {
            label: 'ACME - Software License', local: 'data/acme-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['licensor', 'licensee', 'compliance'],
            desc: '2 pages • 3 SIG-tags • roles: licensor, licensee, compliance',
            brand: 'acme', brandName: 'ACME Corporation', logo: 'img/sample-logos/acme-icon.svg', fileSize: 79924
        },
        greenleaf: {
            label: 'GreenLeaf - Carbon Offset', local: 'data/greenleaf-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['supplier', 'buyer', 'auditor'],
            desc: '2 pages • 3 SIG-tags • roles: supplier, buyer, auditor',
            brand: 'greenleaf', brandName: 'GreenLeaf Sustainability', logo: 'img/sample-logos/greenleaf-icon.svg', fileSize: 103802
        },
        nova: {
            label: 'NOVA - Portfolio Management', local: 'data/nova-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['manager', 'client', 'advisor'],
            desc: '2 pages • 3 SIG-tags • roles: manager, client, advisor',
            brand: 'nova', brandName: 'NOVA Finance', logo: 'img/sample-logos/nova-icon.svg', fileSize: 92687
        },
        blueprint: {
            label: 'BluePrint - Architecture', local: 'data/blueprint-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['architect', 'developer', 'engineer'],
            desc: '2 pages • 3 SIG-tags • roles: architect, developer, engineer',
            brand: 'blueprint', brandName: 'BluePrint Design Studio', logo: 'img/sample-logos/blueprint-icon.svg', fileSize: 72434
        },
        solis: {
            label: 'SOLIS - Solar Installation', local: 'data/solis-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['installer', 'owner', 'inspector'],
            desc: '2 pages • 3 SIG-tags • roles: installer, owner, inspector',
            brand: 'solis', brandName: 'SOLIS Technology', logo: 'img/sample-logos/solis-icon.svg', fileSize: 77091
        },
        sentinel: {
            label: 'Sentinel - Property Insurance', local: 'data/sentinel-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['insurer', 'policyholder', 'broker'],
            desc: '2 pages • 3 SIG-tags • roles: insurer, policyholder, broker',
            brand: 'sentinel', brandName: 'Sentinel Insurance', logo: 'img/sample-logos/sentinel-icon.svg', fileSize: 98660
        },
        aegis: {
            label: 'Aegis - Group Life Insurance', local: 'data/aegis-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['insurer', 'employer', 'trustee'],
            desc: '2 pages • 3 SIG-tags • roles: insurer, employer, trustee',
            brand: 'aegis', brandName: 'Aegis Life', logo: 'img/sample-logos/aegis-icon.svg', fileSize: 84349
        },
        harbor: {
            label: 'Harbor - Reinsurance Treaty', local: 'data/harbor-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['reinsurer', 'cedent', 'actuary'],
            desc: '2 pages • 3 SIG-tags • roles: reinsurer, cedent, actuary',
            brand: 'harbor', brandName: 'Harbor Re', logo: 'img/sample-logos/harbor-icon.svg', fileSize: 79431
        },
        apex: {
            label: 'Apex - Prof. Liability', local: 'data/apex-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['underwriter', 'insured', 'witness'],
            desc: '2 pages • 3 SIG-tags • roles: underwriter, insured, witness',
            brand: 'apex', brandName: 'Apex Assurance', logo: 'img/sample-logos/apex-icon.svg', fileSize: 75051
        },
        prism: {
            label: 'Prism - Creative Retainer', local: 'data/prism-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['agency', 'client', 'director'],
            desc: '2 pages • 3 SIG-tags • roles: agency, client, director',
            brand: 'prism', brandName: 'Prism Digital', logo: 'img/sample-logos/prism-icon.svg', fileSize: 72695
        },
        mosaic: {
            label: 'Mosaic - Research Agreement', local: 'data/mosaic-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['lab', 'partner', 'ethics'],
            desc: '2 pages • 3 SIG-tags • roles: lab, partner, ethics',
            brand: 'mosaic', brandName: 'Mosaic Labs', logo: 'img/sample-logos/mosaic-icon.svg', fileSize: 75881
        },
        nexus: {
            label: 'Nexus - Term Sheet', local: 'data/nexus-contract.pdf', scanSigTags: true,
            pages: 2, sigFields: 0, sigTags: 3, required: 3, optional: 0, roles: ['investor', 'founder', 'counsel'],
            desc: '2 pages • 3 SIG-tags • roles: investor, founder, counsel',
            brand: 'nexus', brandName: 'Nexus Group', logo: 'img/sample-logos/nexus-icon.svg', fileSize: 117514
        },
        custom: {
            label: 'Your Own File', local: null, scanSigTags: false,
            pages: null, sigFields: null, sigTags: null, required: null, optional: null, roles: [],
            desc: 'Upload a PDF from your disk'
        }
    };

    function getSelectedDocument() {
        return DOCUMENTS[state.selectedDoc] || DOCUMENTS.acme;
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

    /** GitHub raw URL for the selected document (for code snippets) */
    function getDocumentGithubRawUrl() {
        const doc = getSelectedDocument();
        if (!doc.local) return getDocumentAbsoluteUrl();
        // user.github.io/repo → raw.githubusercontent.com/user/repo/main/docs/...
        const m = location.hostname.match(/^(.+)\.github\.io$/);
        if (m) {
            const repo = location.pathname.split('/')[1] || '';
            return 'https://raw.githubusercontent.com/' + m[1] + '/' + repo + '/main/docs/' + doc.local;
        }
        // Fallback: absolute URL (works for local dev)
        return getDocumentAbsoluteUrl();
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
    // Feature configurator - visual toggles for session properties
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
        } catch { /* feature data is optional - graceful fallback */ }
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
            lastForuser: state.lastForuser || '',
            accessURL: state.accessURL,
            webhookProvider: state.webhookProvider,
            webhookCustomUrl: $('#cfg-webhook-custom-url').val() || '',
            webhookChannelId: state.webhookViewer && state.webhookViewer._cfChannelId || '',
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
            saveCredentials,
            brandColors: {
                primary: $('#brand-color-primary').val() || '',
                accent: $('#brand-color-accent').val() || '',
                dark: $('#brand-color-dark').val() || '',
                error: $('#brand-color-error').val() || ''
            },
            brandColorScheme: document.querySelector('.color-scheme-btn.active')
                ? [...document.querySelectorAll('.color-scheme-btn')].indexOf(document.querySelector('.color-scheme-btn.active'))
                : -1,
            brandLogoSet: document.querySelector('.logo-set-card.active')
                ? [...document.querySelectorAll('.logo-set-card')].indexOf(document.querySelector('.logo-set-card.active'))
                : 0,
            brandLogos: {
                icon: $('#brand-app-icon').val() || '',
                mail: $('#brand-mail-header-image').val() || '',
                login: $('#brand-logo-extern').val() || ''
            }
        };
        if (saveCredentials) {
            data.baseUrl = $('#cfg-base-url').val() || '';
            data.username = $('#cfg-username').val() || '';
            data.password = $('#cfg-password').val() || '';
            // Persist OAuth2 token if active
            data.authMode = state.authMode || 'basic';
            if (state.apiClient && state.apiClient.oauth2Token) {
                data.oauth2Token = state.apiClient.oauth2Token;
                data.oauth2ExpiresAt = state.apiClient.oauth2ExpiresAt;
            }
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
            $('#cors-proxy-security-warning').css('display', '');
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

        // Restore webhook provider (fall back to default if saved provider no longer exists)
        if (saved.webhookProvider && WEBHOOK_PROVIDERS[saved.webhookProvider]) {
            state.webhookProvider = saved.webhookProvider;
            var whInfo = WEBHOOK_PROVIDERS[saved.webhookProvider];
            if (whInfo) {
                $('#wh-dd-label').text(whInfo.label);
                $('#wh-dd-badge').text(whInfo.tag);
                $('#wh-dd-toggle .wh-dd-icon').attr('class', 'bi ' + whInfo.icon + ' wh-dd-icon');
                $('#wh-dd-menu .wh-dd-item').each(function () {
                    $(this).toggleClass('wh-dd-item-selected', $(this).data('wh') === saved.webhookProvider);
                });
                if (whInfo.needsCustomUrl) {
                    $('#webhook-custom-url-group').css('display', '');
                }
            }
        }
        if (saved.webhookCustomUrl) {
            $('#cfg-webhook-custom-url').val(saved.webhookCustomUrl);
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
            var opt = FD_OPTIONS[saved.fileDelivery];
            if (opt) {
                $('#fd-dd-label').text(opt.label);
                $('#fd-dd-toggle .fd-dd-icon').attr('class', 'bi ' + opt.icon + ' fd-dd-icon');
                $('#fd-dd-menu .fd-dd-item').each(function () {
                    $(this).toggleClass('fd-dd-item-selected', $(this).data('fd') === saved.fileDelivery);
                });
            }
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

        // Restore foruser and session (last so UI elements are ready)
        if (saved.lastForuser) state.lastForuser = saved.lastForuser;
        if (saved.sessionId) {
            // Defer so editors are initialized first
            setTimeout(() => setSessionId(saved.sessionId, saved.accessURL || null), 100);
        }

        // Restore webhook URL for session JSON
        if (saved.webhookUrl) {
            state.webhookUrl = saved.webhookUrl;
        }

        // Restore auth mode and OAuth2 token
        if (saved.authMode) {
            state.authMode = saved.authMode;
        }
        if (saved.oauth2Token && saved.oauth2ExpiresAt && Date.now() < saved.oauth2ExpiresAt) {
            // Defer until apiClient is created
            state._pendingOAuth2 = { token: saved.oauth2Token, expiresAt: saved.oauth2ExpiresAt };
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
                } else if (f.path === 'signConfig') {
                    if (!body.signConfig) body.signConfig = {};
                    body.signConfig[f.key] = val;
                } else if (f.path === 'deliveryConfig') {
                    if (!body.deliveryConfig) body.deliveryConfig = {};
                    body.deliveryConfig[f.key] = val;
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
                    } else if (path === 'deliveryConfig' && body.deliveryConfig) {
                        delete body.deliveryConfig[key];
                        if (Object.keys(body.deliveryConfig).length === 0) delete body.deliveryConfig;
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
        } else if (path === 'deliveryConfig') {
            if (!body.deliveryConfig) body.deliveryConfig = {};
            body.deliveryConfig[key] = value;
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
                } else if (f.path === 'signConfig') {
                    jsonVal = body.signConfig ? body.signConfig[f.key] : undefined;
                } else if (f.path === 'deliveryConfig') {
                    jsonVal = body.deliveryConfig ? body.deliveryConfig[f.key] : undefined;
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
        // 'upload' mode: no file reference in create body - uploaded separately

        const body = {
            displayname: getSessionDisplayName(),
            foruser: owner.foruser,
            userFullName: owner.userFullName,
            documents: [doc],
            callbackURL: getCallbackUrl()
        };

        if (owner.userEmail) {
            body.userEmail = owner.userEmail;
        }

        // Include webhook URL if available
        if (state.webhookUrl) {
            body.serverSidecallbackURL = state.webhookUrl;
            body.serversideCallbackMethod = 'POST';
            body.serversideCallbackContenttype = 'json';
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
            seller: { email: seller.email, name: seller.name, phone: seller.phone },
            buyer: { email: buyer.email, name: buyer.name, phone: buyer.phone },
            broker: { email: broker.email, name: broker.name, phone: broker.phone },
            customer: { email: customer.email, name: customer.name, phone: customer.phone },
            agency: { email: agency.email, name: agency.name, phone: agency.phone },
            role_one: { email: seller.email, name: seller.name, phone: seller.phone },
            role_two: { email: buyer.email, name: buyer.name, phone: buyer.phone }
        };

        let savedOpts = { sendEmails: false, sendSMS: false, singleSignOnEnabled: true, inOrder: false };
        try {
            const stored = JSON.parse(localStorage.getItem('insign-extern-options'));
            if (stored) savedOpts = { ...savedOpts, ...stored };
        } catch { /* ignore */ }

        const externUsers = roles.map(role => {
            const data = roleData[role] || {};
            const user = {
                recipient: data.email || `${role}@nowhere.invalid`,
                realName: data.name || role,
                roles: [role],
                sendEmails: savedOpts.sendEmails,
                sendSMS: savedOpts.sendSMS,
                singleSignOnEnabled: savedOpts.singleSignOnEnabled
            };
            // Include phone number for SMS delivery when available
            if (data.phone) user.mobileNumber = data.phone.replace(/\s/g, '');
            return user;
        });

        return {
            sessionid: state.sessionId || '<session-id>',
            externUsers,
            inOrder: savedOpts.inOrder
        };
    }

    function getSessionIdBody() {
        return { sessionid: state.sessionId || '<session-id>' };
    }

    function getSSOBody() {
        const foruser = state.lastForuser || state.userId || '';
        return {
            id: foruser,
            fullName: $('#cfg-userfullname').val() || '',
            email: $('#cfg-userEmail').val() || ''
        };
    }

    // =====================================================================
    // Operation definitions
    // =====================================================================

    function getDocumentSingleBody() {
        const includeB = document.getElementById('includeBiodata');
        return {
            sessionid: state.sessionId || '<session-id>',
            docid: 'contract-1',
            includeBiodata: includeB ? includeB.checked : true
        };
    }

    function toggleIncludeBiodata(checked) {
        const editor = state.editors['op-document-single'];
        if (!editor) return;
        try {
            const val = JSON.parse(editor.getValue());
            val.includeBiodata = checked;
            editor.setValue(JSON.stringify(val, null, 2));
        } catch (e) { /* ignore parse errors */ }
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
        'send-reminder': {
            method: 'POST', path: '/load/sendManualReminder',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'extern-info': {
            method: 'POST', path: '/get/externInfos',
            getBody: getSessionIdBody,
            schemaKey: 'sessionIDInput'
        },
        'sso': {
            method: 'POST', path: '/configure/createSSOForApiuser',
            getBody: getSSOBody,
            schemaKey: null,
            accept: 'text/plain'
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
        initFileDeliveryDropdown();
        buildWebhookProviderDropdown();
        buildFeatureToggles();
        buildColorSchemePresets();
        buildLogoSets();
        restoreBranding();
        // Apply branding matching the selected document if no saved branding
        var saved = loadAppState();
        if (!saved || saved.brandColorScheme == null) {
            var doc = getSelectedDocument();
            if (doc.brand) {
                var idx = LOGO_SETS.findIndex(function(s) { return s.prefix === doc.brand; });
                if (idx >= 0) { selectColorScheme(idx); selectLogoSet(idx); }
            }
        }
        updateBrandColor();

        // Derive GitHub repo link from Pages URL (user.github.io/repo → github.com/user/repo)
        const ghLink = document.getElementById('github-repo-link');
        if (ghLink) {
            const m = location.hostname.match(/^(.+)\.github\.io$/);
            if (m) {
                const repo = location.pathname.split('/')[1] || '';
                ghLink.href = 'https://github.com/' + m[1] + (repo ? '/' + repo : '');
            } else {
                ghLink.style.display = 'none';
            }
        }

        // Init API client
        updateApiClient();

        // Sync OAuth2 credentials from sidebar and initialize auth mode
        syncOAuth2Credentials();
        updateAuthHeaders();
        if (state.authMode === 'oauth2') {
            setAuthMode('oauth2');
        }

        // Update trust indicator with target URL
        const $trustUrl = $('#trust-target-url');
        if ($trustUrl.length) $trustUrl.text('\u2192 ' + $('#cfg-base-url').val());

        // Bind sidebar events
        $('#cfg-base-url').on('change', () => { updateApiClient(); saveAppState(); updateCorsVisibility(); });
        $('#cfg-username').on('change', () => { updateApiClient(); syncOAuth2Credentials(); saveAppState(); });
        $('#cfg-password').on('change', () => { updateApiClient(); syncOAuth2Credentials(); saveAppState(); });

        $('#btn-use-sandbox').on('click', () => {
            $('#cfg-base-url').val('https://sandbox.test.getinsign.show');
            $('#cfg-username').val('controller');
            $('#cfg-password').val('pwd.insign.sandbox.4561');
            updateApiClient();
            syncOAuth2Credentials();
            saveAppState();
            updateCorsVisibility();
        });

        // ---- CORS: probe directly first, only offer proxy if needed ----
        const SANDBOX_URL = 'sandbox.test.getinsign.show';
        let directProbeAbort = null;

        function isSandboxUrl(url) {
            return (url || '').toLowerCase().includes(SANDBOX_URL);
        }

        function setCorsNeeded(needed) {
            const $toggle = $('#cors-proxy-toggle-wrap');
            const $hint = $('#cors-hint-banner');
            const $corsToggle = $('#cfg-cors-proxy');
            if (needed) {
                $toggle.removeClass('d-none');
                if (!$corsToggle.is(':checked')) {
                    $hint.removeClass('d-none');
                } else {
                    $hint.addClass('d-none');
                }
            } else {
                $corsToggle.prop('checked', false).trigger('change');
                $toggle.addClass('d-none');
                $hint.addClass('d-none');
            }
        }

        function updateCorsVisibility() {
            const baseUrl = ($('#cfg-base-url').val() || '').replace(/\/+$/, '');

            // Abort any in-flight direct probe and clear version
            if (directProbeAbort) { directProbeAbort.abort(); directProbeAbort = null; }
            $('#cors-direct-version').text('').addClass('d-none');

            if (!baseUrl) { setCorsNeeded(false); return; }

            // Sandbox has relaxed CORS - no probe needed
            if (isSandboxUrl(baseUrl)) { setCorsNeeded(false); return; }

            // Probe the URL directly (no proxy) to see if CORS is an issue
            directProbeAbort = new AbortController();
            fetch(baseUrl + '/version', {
                method: 'GET', mode: 'cors', cache: 'no-store',
                signal: directProbeAbort.signal
            })
                .then(r => {
                    if (r.ok) {
                        // Server responds with CORS headers - no proxy needed
                        setCorsNeeded(false);
                        r.text().then(t => {
                            const v = t.trim();
                            if (v) $('#cors-direct-version').text('inSign ' + v).removeClass('d-none');
                        });
                    } else {
                        // Server reachable but returned error - still no CORS issue
                        setCorsNeeded(false);
                    }
                })
                .catch(err => {
                    if (err.name === 'AbortError') return;
                    // Network/CORS error - proxy is needed
                    setCorsNeeded(true);
                });
        }

        // ---- CORS proxy with local probe ----
        let probeInterval = null;
        let probeStatus = null; // 'ok' | 'fail' | null

        function probeLocalProxy() {
            // Probe the proxy by requesting the inSign base URL through it.
            // This confirms the full chain: proxy running + can reach the target.
            const proxyUrl = $('#cfg-cors-proxy-url').val() || 'http://localhost:9009/?';
            const baseUrl = ($('#cfg-base-url').val() || '').replace(/\/+$/, '');
            const $dot = $('#proxy-probe-dot');
            if (!$dot.length) return;
            $dot.attr('class', 'proxy-probe-dot probe-pending');
            if (!baseUrl) { applyProbeResult(false, null); return; }
            const url = proxyUrl + encodeURIComponent(baseUrl + '/version');
            fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(4000) })
                .then(r => {
                    if (r.ok) return r.text().then(t => applyProbeResult(true, t.trim()));
                    applyProbeResult(false, null);
                })
                .catch(() => applyProbeResult(false, null));
        }

        function applyProbeResult(ok, version) {
            const prev = probeStatus;
            probeStatus = ok ? 'ok' : 'fail';
            const $dot = $('#proxy-probe-dot');
            const $label = $('#proxy-probe-label');
            $dot.attr('class', 'proxy-probe-dot probe-' + probeStatus);
            if (ok) {
                const vText = version ? 'Connected - inSign ' + version : 'Connected';
                $label.text(vText).attr('class', 'proxy-probe-label probe-label-ok');
            } else {
                $label.text('Not reachable').attr('class', 'proxy-probe-label probe-label-fail');
            }
            // Toast on status change (skip first probe)
            if (prev !== null && prev !== probeStatus) {
                showProxyToast(ok, version);
            }
        }

        function startProbePolling() {
            stopProbePolling();
            probeLocalProxy();
            probeInterval = setInterval(() => {
                if ($('#cors-proxy-url-group').css('display') !== 'none') {
                    probeLocalProxy();
                }
            }, 1000);
        }

        function stopProbePolling() {
            if (probeInterval) {
                clearInterval(probeInterval);
                probeInterval = null;
            }
            probeStatus = null;
        }

        function showProxyToast(ok, version) {
            $('.proxy-toast').remove();
            const icon = ok ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-x-circle-fill"></i>';
            const msg = ok ? ('Connected to inSign' + (version ? ' ' + version : '')) : 'Proxy - inSign not reachable';
            const cls = ok ? 'toast-ok' : 'toast-fail';
            const $toast = $('<div class="proxy-toast ' + cls + '">' + icon + ' ' + msg + '</div>');
            $('body').append($toast);
            setTimeout(() => $toast.fadeOut(300, () => $toast.remove()), 3500);
        }

        const $corsToggle = $('#cfg-cors-proxy');
        $corsToggle.on('change', () => {
            const on = $corsToggle.is(':checked');
            $('#cors-proxy-url-group').css('display', on ? '' : 'none');
            $('#cors-proxy-security-warning').css('display', on ? '' : 'none');
            // Hide hint when proxy is enabled (user acted on the warning)
            if (on) {
                $('#cors-hint-banner').addClass('d-none');
            } else if (!isSandboxUrl($('#cfg-base-url').val())) {
                $('#cors-hint-banner').removeClass('d-none');
            }
            updateApiClient();
            saveAppState();
            if (on) {
                startProbePolling();
            } else {
                stopProbePolling();
            }
        });

        $('#cfg-cors-proxy-url').on('change', () => { updateApiClient(); saveAppState(); });

        // Show actual origin in CORS config hint
        $('#cors-origin-hint').text(window.location.origin);

        // Set initial CORS visibility based on URL
        updateCorsVisibility();

        // If CORS proxy is already enabled on load, start probing
        if ($corsToggle.is(':checked')) {
            setTimeout(() => startProbePolling(), 500);
        }

        // "Save in browser" checkbox with security warning
        const $saveCredsCheckbox = $('#cfg-save-credentials');
        if ($saveCredsCheckbox.length) {
            $saveCredsCheckbox.on('change', function () {
                $('#save-credentials-warning').toggleClass('d-none', !$saveCredsCheckbox.is(':checked'));
                saveAppState();
            });
            // Show warning if already checked on load
            if ($saveCredsCheckbox.is(':checked')) {
                $('#save-credentials-warning').removeClass('d-none');
            }
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
        // Restore CF Worker config so createEndpoint reuses the existing channel
        if (state.webhookProvider === 'cfworker') {
            const workerUrl = ($('#cfg-webhook-custom-url').val() || '').trim();
            if (workerUrl) state.webhookViewer.setCfWorkerUrl(workerUrl);
            var saved = loadAppState() || {};
            if (saved.webhookChannelId) state.webhookViewer.setCfWorkerChannelId(saved.webhookChannelId);
        }
        window.webhookViewer = state.webhookViewer; // for inline onclick handlers

        state.webhookViewer.onUrlCreated = (url) => {
            state.webhookUrl = url;
            // Update the create-session editor to include the webhook URL
            if (state.editors['create-session']) {
                const currentBody = getEditorValue('create-session');
                if (typeof currentBody === 'object' && !currentBody.serverSidecallbackURL) {
                    currentBody.serverSidecallbackURL = url;
                    currentBody.serversideCallbackMethod = 'POST';
                    currentBody.serversideCallbackContenttype = 'json';
                    setEditorValue('create-session', currentBody);
                }
            }
        };

        // Create webhook endpoint and start listening
        state.webhookViewer.createEndpoint().then(url => {
            if (url) state.webhookViewer.startPolling();
        });

        // Webhooks toggle in step 1 - sync with sidebar toggle and session JSON
        const $webhooksToggle = $('#cfg-webhooks');
        if ($webhooksToggle.length) {
            $webhooksToggle.on('change', () => {
                const checked = $webhooksToggle.is(':checked');
                const $providerGroup = $('#webhook-provider-group');
                if ($providerGroup.length) $providerGroup.css('display', checked ? '' : 'none');
                $('#webhook-relay-warning').toggleClass('d-none', !checked);

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
                            body.serversideCallbackContenttype = 'json';
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
            // Show warning if already enabled on load
            if ($webhooksToggle.is(':checked')) {
                $('#webhook-relay-warning').removeClass('d-none');
            }
        }

        // Init Monaco
        initMonaco();

        // Update headers display
        updateHeadersDisplay();

        // file:// hint: local docs can't be fetched via fetch()
        if (window.location.protocol === 'file:') {
            const $hintEl = $('#file-delivery-hint');
            if ($hintEl.length) $hintEl.html('<i class="bi bi-exclamation-triangle"></i> ' +
                'Running from <code>file://</code> - base64/upload requires serving via HTTP ' +
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
            if (state.currentStep === 3) {
                const target = $(this).data('bs-target'); // e.g. #op-status
                const subTab = target ? target.replace('#op-', '') : '';
                if (subTab) history.replaceState(null, '', '#step3/' + subTab);
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
            if (step >= 1 && step <= 4) {
                if (step !== state.currentStep) {
                    goToStep(step, true);
                }
                // Activate sub-tab on step 3 (operations)
                if (step === 3 && subTab) {
                    const $tab = $(`#operation-tabs button[data-bs-target="#op-${subTab}"]`);
                    if ($tab.length) {
                        const tab = new bootstrap.Tab($tab[0]);
                        tab.show();
                    }
                }
                // Focus session ID input if navigating to step 3 with no session
                if (step === 3 && !state.sessionId) {
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
        hookTrace();

        // Install pre-call hook for auto-refreshing OAuth2 tokens
        state.apiClient._beforeCall = async (method, path) => {
            // Skip for the token endpoint itself to avoid recursion
            if (path === '/oauth2/token') return;
            await ensureOAuth2Token();
        };

        // Restore auth mode
        state.apiClient.authMode = state.authMode || 'basic';

        // Restore pending OAuth2 token
        if (state._pendingOAuth2) {
            state.apiClient.oauth2Token = state._pendingOAuth2.token;
            state.apiClient.oauth2ExpiresAt = state._pendingOAuth2.expiresAt;
            delete state._pendingOAuth2;
            startOAuth2TokenCountdown();
            updateOAuth2TokenStatus();
        }

        const corsProxy = $('#cfg-cors-proxy').is(':checked');
        state.apiClient.useCorsProxy = corsProxy;
        state.apiClient.corsProxyUrl = $('#cfg-cors-proxy-url').val() || 'http://localhost:9009/?';

        // Auto-enable CORS proxy on first CORS error: update UI toggle and notify user
        state.apiClient._onCorsAutoEnabled = () => {
            $('#cfg-cors-proxy').prop('checked', true);
            $('#cors-proxy-url-group').css('display', '');
            $('#cors-proxy-security-warning').css('display', '');
            showToast('CORS error detected - automatically enabled CORS proxy.', 'info');
            saveAppState();
        };

        // Update trust indicator
        const $trustUrl = $('#trust-target-url');
        if ($trustUrl.length) $trustUrl.text('\u2192 ' + baseUrl);

        updateHeadersDisplay();

        // Load OpenAPI schemas from the server (non-blocking)
        if (baseUrl && !state.schemaLoader.loaded) {
            const proxy = corsProxy ? (state.apiClient.corsProxyUrl || 'https://corsproxy.io/?') : null;
            state.schemaLoader.load(baseUrl, proxy).then(ok => {
                if (ok) {
                    state.schemaLoader.enrichGuiProperties(FEATURE_GROUPS);
                    if (state.monacoReady) {
                        state.schemaLoader.registerWithMonaco(monaco);
                    }
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
    // OAuth2 Authentication
    // =====================================================================

    function setAuthMode(mode) {
        state.authMode = mode;

        // Toggle button styles
        $('#auth-mode-toggle button').each(function () {
            const $btn = $(this);
            if ($btn.data('mode') === mode) {
                $btn.removeClass('btn-insign-outline').addClass('active');
            } else {
                $btn.addClass('btn-insign-outline').removeClass('active');
            }
        });

        // Show/hide panels
        $('#auth-basic-panel').css('display', mode === 'basic' ? '' : 'none');
        $('#auth-oauth2-panel').css('display', mode === 'oauth2' ? '' : 'none');

        // Update API client auth mode
        if (state.apiClient) {
            state.apiClient.authMode = mode;
            updateHeadersDisplay();
            updateAuthHeaders();
        }

        saveAppState();
    }

    function syncOAuth2Credentials() {
        // Sync client_id/client_secret from sidebar username/password
        const username = $('#cfg-username').val() || '';
        const password = $('#cfg-password').val() || '';
        $('#oauth2-client-id').val(username);
        $('#oauth2-client-secret').val(password);
    }

    function updateAuthHeaders() {
        if (!state.apiClient) return;

        // Basic auth panel headers
        const basicHeaders = [
            { name: 'Authorization', value: 'Basic ' + btoa((state.apiClient.username || '') + ':' + (state.apiClient.password || '')) }
        ];
        $('#auth-basic-headers').html(basicHeaders.map(h =>
            `<div><span class="header-name">${h.name}:</span> <span class="header-value">${h.value}</span></div>`
        ).join(''));
    }

    async function executeOAuth2Token() {
        if (!state.apiClient) return;

        const clientId = $('#oauth2-client-id').val() || '';
        const clientSecret = $('#oauth2-client-secret').val() || '';

        const formBody = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        }).toString();

        const url = state.apiClient.buildUrl('/oauth2/token');

        const $statusEl = $(`.response-status[data-op="oauth2-token"]`);
        $statusEl.css('display', '').attr('class', 'response-status').html(
            '<span class="spinner-insign spinner-dark me-2"></span> Requesting token...'
        );

        const startTime = performance.now();
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formBody,
                mode: 'cors'
            });
            const duration = Math.round(performance.now() - startTime);
            const rawText = await response.text();
            let body;
            try { body = JSON.parse(rawText); } catch { body = rawText; }

            const respHeaders = {};
            response.headers.forEach((v, k) => { respHeaders[k] = v; });

            $statusEl.attr('class', 'response-status ' + (response.ok ? 'success' : 'error'));
            $statusEl.html(`
                <strong>${response.status}</strong> ${response.statusText}
                <span class="ms-auto text-muted-sm">${duration}ms</span>
            `);

            // Show response in editor
            showResponseEditor('op-oauth2-token', body);

            // Trace the OAuth2 call
            if (state.apiClient) {
                state.apiClient._trace({
                    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                    timestamp: new Date().toISOString(),
                    method: 'POST',
                    path: '/oauth2/token',
                    url,
                    requestHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    requestBody: formBody,
                    status: response.status,
                    statusText: response.statusText,
                    ok: response.ok,
                    responseHeaders: respHeaders,
                    responseBody: body,
                    duration
                });
            }

            if (response.ok && body && body.access_token) {
                // Apply token to API client
                state.apiClient.setOAuth2Token(body);
                state.authMode = 'oauth2';
                updateOAuth2TokenStatus();
                updateHeadersDisplay();
                startOAuth2TokenCountdown();
                saveAppState();
            }
        } catch (err) {
            const duration = Math.round(performance.now() - startTime);
            $statusEl.attr('class', 'response-status error');
            $statusEl.html(`
                <strong>0</strong> Network/CORS Error
                <span class="ms-auto text-muted-sm">${duration}ms</span>
            `);
            const errBody = {
                error: 'CORS_OR_NETWORK_ERROR',
                message: err.message,
                hint: 'Enable the CORS proxy toggle in the Connection settings if you cannot reach the API directly.'
            };
            showResponseEditor('op-oauth2-token', errBody);

            // Trace the failed OAuth2 call
            if (state.apiClient) {
                state.apiClient._trace({
                    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                    timestamp: new Date().toISOString(),
                    method: 'POST',
                    path: '/oauth2/token',
                    url,
                    requestHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    requestBody: formBody,
                    status: 0,
                    statusText: 'Network/CORS Error',
                    ok: false,
                    responseHeaders: {},
                    responseBody: errBody,
                    duration
                });
            }
        }
    }

    /**
     * Auto-request an OAuth2 token if auth mode is oauth2 but no valid token exists.
     * Populates the token response UI on the Connection tab just like a manual request.
     */
    let _tokenRefreshPromise = null;
    async function ensureOAuth2Token() {
        if (!state.apiClient) return;
        if (state.apiClient.authMode !== 'oauth2') return;
        if (state.apiClient.isOAuth2TokenValid()) return;
        if (!state.apiClient.username && !state.apiClient.password) return;

        // Deduplicate concurrent callers
        if (_tokenRefreshPromise) return _tokenRefreshPromise;

        _tokenRefreshPromise = (async () => {
            try {
                // Ensure OAuth2 form fields are synced from credentials
                updateHeadersDisplay();
                await executeOAuth2Token();
            } finally {
                _tokenRefreshPromise = null;
            }
        })();

        return _tokenRefreshPromise;
    }

    function updateOAuth2TokenStatus() {
        const $status = $('#oauth2-token-status');
        if (!state.apiClient || !state.apiClient.oauth2Token) {
            $status.css('display', 'none');
            return;
        }
        $status.css('display', '');

        const ttl = state.apiClient.getOAuth2TokenTTL();
        const valid = ttl > 0;
        const $badge = $('#oauth2-status-badge');
        const $ttl = $('#oauth2-token-ttl');
        const $header = $('#oauth2-active-header');

        $badge.attr('class', 'badge ' + (valid ? 'bg-success' : 'bg-danger'))
              .html(valid ? '<i class="bi bi-check-circle"></i> Valid' : '<i class="bi bi-x-circle"></i> Expired');

        const mins = Math.floor(ttl / 60);
        const secs = ttl % 60;
        $ttl.text(valid ? `Expires in ${mins}m ${secs}s` : 'Token expired - requests fall back to Basic Auth');

        // Show truncated auth header
        const authVal = state.apiClient.getAuthHeader();
        let displayVal = authVal;
        if (displayVal.length > 80) {
            displayVal = displayVal.substring(0, 50) + '...' + displayVal.substring(displayVal.length - 15);
        }
        $header.html(`<div><span class="header-name">Authorization:</span> <span class="header-value">${displayVal}</span></div>`);
    }

    let _oauth2CountdownInterval = null;
    function startOAuth2TokenCountdown() {
        if (_oauth2CountdownInterval) clearInterval(_oauth2CountdownInterval);
        _oauth2CountdownInterval = setInterval(() => {
            updateOAuth2TokenStatus();
            if (!state.apiClient || !state.apiClient.isOAuth2TokenValid()) {
                clearInterval(_oauth2CountdownInterval);
                _oauth2CountdownInterval = null;
                updateHeadersDisplay();
            }
        }, 1000);
    }

    function clearOAuth2Token() {
        if (state.apiClient) {
            state.apiClient.clearOAuth2Token();
        }
        if (_oauth2CountdownInterval) {
            clearInterval(_oauth2CountdownInterval);
            _oauth2CountdownInterval = null;
        }
        $('#oauth2-token-status').css('display', 'none');
        updateHeadersDisplay();
        saveAppState();
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
                state.schemaLoader.enrichGuiProperties(FEATURE_GROUPS);
                state.schemaLoader.registerWithMonaco(monaco);
            }

            // Create Step 1 editor
            createEditor('create-session', getDefaultCreateSessionBody(), 'configureSession', { uncapped: true });

            // Apply saved feature toggle settings to the editor
            applyFeatureSettingsToEditor();

            // Apply branding (colors + logos) to the newly created editor
            applyBrandingCSS();
            applyBrandingLogos();

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

            // Free request editor with default sessionid body
            createEditor('op-free', getSessionIdBody(), null);

            // Sync extern option buttons when user edits the extern JSON
            if (state.editors['op-extern']) {
                state.editors['op-extern'].onDidChangeModelContent(() => {
                    if (state._editorSyncLock) return;
                    syncExternOptionsFromJson();
                });
            }

            // Code snippet editor (read-only)
            createReadOnlyEditor('code-snippet', '// Select a language tab above to see code snippets', 'javascript', { uncapped: true });

            // Init code language tabs
            initCodeTabs();
        });
    }

    /** Auto-resize a Monaco editor to fit its content (clamped to container max-height) */
    function autoResizeEditor(editor, container, uncapped) {
        const MAX_HEIGHT = uncapped ? Infinity : 600;
        const MIN_HEIGHT = 60;
        const PADDING = 10; // extra pixels to avoid scrollbar appearing

        if (uncapped) $(container).addClass('no-max-height');

        function resize() {
            const contentHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, editor.getContentHeight() + PADDING));
            $(container).css('height', contentHeight + 'px');
            editor.layout();
        }

        editor.onDidContentSizeChange(resize);
        // Initial sizing
        resize();
    }

    function createEditor(id, defaultValue, schemaKey, opts) {
        const container = $('#editor-' + id)[0];
        if (!container) return null;
        const uncapped = opts && opts.uncapped;

        // URI must be unique per editor, but the filename part must match the schema's fileMatch
        const filename = schemaKey ? schemaKey + '.json' : id + '.json';
        const modelUri = monaco.Uri.parse('insign://models/' + id + '/' + filename);

        const model = monaco.editor.createModel(
            JSON.stringify(defaultValue, null, 2),
            'json',
            modelUri
        );

        const editorOpts = {
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
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
            suggest: {
                showInlineDetails: true,
                detailsVisible: true
            }
        };

        // For uncapped editors, disable internal scrolling - the page scrolls instead
        if (uncapped) {
            editorOpts.scrollbar.vertical = 'hidden';
            editorOpts.scrollbar.handleMouseWheel = false;
        }

        const editor = monaco.editor.create(container, editorOpts);

        autoResizeEditor(editor, container, uncapped);
        state.editors[id] = editor;
        return editor;
    }

    function createReadOnlyEditor(id, content, language, opts) {
        const container = $('#editor-' + id)[0];
        if (!container) return null;
        const uncapped = opts && opts.uncapped;

        const editorOpts = {
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
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
            suggest: {
                showInlineDetails: true,
                detailsVisible: true
            }
        };

        if (uncapped) {
            editorOpts.scrollbar.vertical = 'hidden';
            editorOpts.scrollbar.handleMouseWheel = false;
        }

        const editor = monaco.editor.create(container, editorOpts);

        autoResizeEditor(editor, container, uncapped);
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
            if (step === 3) {
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

        // Show/hide main panels (4 steps now)
        $('#step-1-panel').toggleClass('d-none', step !== 1);
        $('#step-2-panel').toggleClass('d-none', step !== 2);
        $('#step-3-panel').toggleClass('d-none', step !== 3);
        $('#step-4-panel').toggleClass('d-none', step !== 4);

        // Shine animation on feature configurator when entering step 2
        if (step === 2) {
            const $box = $('#step-2-panel .feature-configurator-box').first();
            $box.removeClass('shine');
            // Force reflow so re-adding the class restarts the animation
            void $box[0]?.offsetWidth;
            $box.addClass('shine');
        }

        // Show webhook/polling sections in right sidebar for step 3+
        const showMonitor = step >= 3;
        $('#section-webhooks').toggleClass('d-none', !showMonitor);
        $('#section-polling').toggleClass('d-none', !showMonitor);
        if (step === 3) {
            // Auto-open sidebar on "Operate and trace" tab (unless user collapsed it)
            if (!state.sidebarCollapsed) {
                $('#trace-column').removeClass('d-none');
                $('#expand-right-sidebar').addClass('d-none');
            }
            updateSidebarMode();
        } else {
            // Auto-hide sidebar on other steps, but keep expand button visible so user can open it
            $('#trace-column').addClass('d-none');
            $('#expand-right-sidebar').removeClass('d-none');
        }

        updateMainColumnWidth();
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

        // Show buttons whenever a session ID exists (tokens are renewed on click via /persistence/loadsession)
        const hasSession = !!sessionId;
        $('#btn-open-insign').toggleClass('d-none', !hasSession).attr('title', accessURL || '');
        $('#navbar-btn-open').toggleClass('d-none', !hasSession).attr('title', accessURL || '');
        $('#btn-open-session-manager').toggleClass('d-none', !hasSession)
            .attr('title', state.accessURLProcessManagement || '');
        $('#btn-goto-step2').removeClass('d-none');

        // Reset histories and create new webhook URL for new sessions
        // But skip regeneration when coming from createSession - the URL was already sent
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

    async function createSessionAndOpen() {
        await createSession(true);
    }

    async function createSession(andOpen) {
        const $btn = $('#btn-create-session');
        const $floatBtns = $('#floating-actions-step2 .btn-floating');
        $btn.prop('disabled', true);
        $floatBtns.prop('disabled', true);
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
        state.lastForuser = body.foruser || '';
        saveAppState();
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

                // "Send & Open" - immediately open inSign in new tab
                if (andOpen && respBody.accessURL) {
                    window.open(respBody.accessURL, '_blank');
                }

                // Auto-navigate to step 3 after 3s countdown
                const $step2Btn = $('#btn-goto-step2');
                if ($step2Btn.length && !$step2Btn.hasClass('d-none')) {
                    let countdown = 3;
                    $step2Btn.html('<i class="bi bi-arrow-right"></i> Operate &amp; Trace (' + countdown + ')');
                    const timer = setInterval(() => {
                        countdown--;
                        if (countdown <= 0) {
                            clearInterval(timer);
                            $step2Btn.html('<i class="bi bi-arrow-right"></i> Operate &amp; Trace');
                            goToStep(3);
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
        $floatBtns.prop('disabled', false);
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

    /** Get a SSO JWT for the current foruser via /configure/createSSOForApiuser */
    async function getSSOJwt() {
        const foruser = state.lastForuser;
        if (!foruser) return '';
        // Endpoint returns text/plain - must set Accept header accordingly
        const result = await state.apiClient.call('POST', '/configure/createSSOForApiuser', {
            body: { id: foruser },
            accept: 'text/plain'
        });
        if (result.ok && result.body) {
            return typeof result.body === 'string' ? result.body : '';
        }
        return '';
    }

    function postToNewTab(url, params) {
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.target = '_blank';
        Object.keys(params).forEach(function (key) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = params[key];
            form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    }

    async function openInSign() {
        if (!state.sessionId) return;
        const baseUrl = state.apiClient.baseUrl || $('#cfg-base-url').val();
        try {
            const jwt = await getSSOJwt();
            if (jwt) {
                postToNewTab(baseUrl + '/index', { jwt: jwt, sessionid: state.sessionId });
                return;
            }
        } catch (e) { /* fallback to stored accessURL */ }
        if (state.accessURL) window.open(state.accessURL, '_blank');
    }

    async function openSessionManager() {
        if (!state.sessionId) return;
        const baseUrl = state.apiClient.baseUrl || $('#cfg-base-url').val();
        try {
            const jwt = await getSSOJwt();
            if (jwt) {
                postToNewTab(baseUrl + '/load', { jwt: jwt });
                return;
            }
        } catch (e) { /* fallback to stored URL */ }
        if (state.accessURLProcessManagement) window.open(state.accessURLProcessManagement, '_blank');
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
                $('#btn-open-insign').removeClass('d-none').attr('title', resp.accessURL);
                $('#navbar-btn-open').removeClass('d-none').attr('title', resp.accessURL);
            }
            if (resp.accessURLProcessManagement) {
                state.accessURLProcessManagement = resp.accessURLProcessManagement;
                $('#btn-open-session-manager').removeClass('d-none').attr('title', resp.accessURLProcessManagement);
            }
        }

        // Update code snippets
        updateCodeSnippets();
    }

    // =====================================================================
    // Free Request
    // =====================================================================

    async function executeFreeRequest() {
        const method = $('#free-method').val() || 'POST';
        const endpoint = $('#free-endpoint').val() || '/';
        const contentType = $('#free-content-type').val() || 'application/json';
        const accept = $('#free-accept').val() || 'application/json';

        let body = null;
        if (method !== 'GET' && state.editors['op-free']) {
            body = getEditorValue('op-free');
        }

        const result = await state.apiClient.call(method, endpoint, {
            body,
            contentType,
            accept
        });

        state.lastRequest = { method, path: endpoint, body };

        const $responseDiv = $(`.op-response[data-op="free"]`);
        if ($responseDiv.length) $responseDiv.removeClass('d-none');

        const $statusEl = $(`.response-status[data-op="free"]`);
        if ($statusEl.length) {
            $statusEl.attr('class', 'response-status ' + (result.ok ? 'success' : 'error'));
            $statusEl.html(`
                <strong>${result.status}</strong> ${result.statusText}
                <span class="ms-auto text-muted-sm">${result.duration}ms</span>
            `);
        }

        const $responseEditorContainer = $('#editor-op-free-response');
        if ($responseEditorContainer.length) {
            showResponseEditor('op-free', result.body);
        }

        updateCodeSnippets();
    }

    // =====================================================================
    // External Signing - Smart Flow
    // =====================================================================

    /** Discover document fields & roles, then pre-populate the extern body */
    async function discoverFieldsAndRoles() {
        if (!state.sessionId) {
            alert('Create a session first (Step 1) or enter a session ID.');
            return;
        }

        const result = await state.apiClient.post('/get/status', { sessionid: state.sessionId });
        if (!result.ok) {
            const $info = $('#extern-fields-info');
            if ($info.length) {
                $info.css('display', '');
                $info.css('background', 'rgba(220,53,69,0.08)');
                $('#extern-fields-summary').html(
                    '<span style="color:var(--insign-danger)">Failed to query status: ' + result.status + ' ' + result.statusText + '</span>');
            }
            return;
        }

        // Parse signature fields from /get/status response (signaturFieldsStatusList)
        const body = result.body;
        const roles = new Set();
        const fields = [];
        const sigFields = body.signaturFieldsStatusList || [];

        for (const sig of sigFields) {
            const role = sig.role || sig.quickInfoParsedRole || sig.fieldID || '';
            const name = sig.displayname || sig.quickinfo || sig.fieldID || role;
            const required = sig.mandatory !== false;
            const signed = !!sig.signed;
            if (role) roles.add(role);
            fields.push({ role, name, required, signed });
        }

        // Only keep roles that have at least one unsigned field
        const unsignedRoles = new Set();
        for (const f of fields) {
            if (!f.signed && f.role) unsignedRoles.add(f.role);
        }
        state.discoveredRoles = Array.from(unsignedRoles);
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
                const optCount = fields.length - reqCount;
                const fieldBadges = fields.map(f => {
                    const cls = f.signed ? 'bg-success' : (f.required ? 'bg-primary' : 'bg-secondary');
                    return `<span class="badge ${cls} me-1">${f.name}</span>`;
                }).join('');
                const parts = [`${fields.length} signature field(s)`, `${reqCount} required`, `${optCount} optional`];
                if (signedCount > 0) parts.push(`${signedCount} signed`);
                $summary.html(parts.join(' &bull; ') + '<br>' + fieldBadges);
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
        if (typeof body !== 'object') return;

        if (key === 'inOrder') {
            // inOrder is a top-level field, not per-user
            body.inOrder = value;
        } else if (Array.isArray(body.externUsers)) {
            for (const user of body.externUsers) {
                user[key] = value;
            }
        }
        setEditorValue('op-extern', body);
    }

    function saveExternOptions() {
        const opts = {};
        for (const key of ['sendEmails', 'singleSignOnEnabled', 'sendSMS', 'inOrder']) {
            const val = getExternOption(key);
            if (val !== null) opts[key] = val;
        }
        try { localStorage.setItem('insign-extern-options', JSON.stringify(opts)); } catch { /* ignore */ }
    }

    function restoreExternOptions() {
        try {
            const stored = JSON.parse(localStorage.getItem('insign-extern-options'));
            if (!stored) return;
            for (const key of ['sendEmails', 'singleSignOnEnabled', 'sendSMS', 'inOrder']) {
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
        if (typeof body !== 'object') return;

        // Per-user options
        if (Array.isArray(body.externUsers) && body.externUsers.length > 0) {
            for (const key of ['sendEmails', 'singleSignOnEnabled', 'sendSMS']) {
                const $group = $('#extern-opt-' + key);
                if (!$group.length) continue;

                const values = body.externUsers.map(u => u[key]);
                const allSame = values.every(v => v === values[0]);

                $group.find('button').removeClass('active mixed');
                if (allSame) {
                    $group.find(`button[data-val="${values[0]}"]`).addClass('active');
                } else {
                    $group.find('button').addClass('mixed');
                }
            }
        }

        // Top-level inOrder option
        const $inOrder = $('#extern-opt-inOrder');
        if ($inOrder.length && body.inOrder !== undefined) {
            $inOrder.find('button').removeClass('active mixed');
            $inOrder.find(`button[data-val="${body.inOrder}"]`).addClass('active');
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
            seller: { email: seller.email, name: seller.name, phone: seller.phone },
            buyer: { email: buyer.email, name: buyer.name, phone: buyer.phone },
            broker: { email: broker.email, name: broker.name, phone: broker.phone },
            customer: { email: customer.email, name: customer.name, phone: customer.phone },
            agency: { email: agency.email, name: agency.name, phone: agency.phone },
            role_one: { email: seller.email, name: seller.name, phone: seller.phone },
            role_two: { email: buyer.email, name: buyer.name, phone: buyer.phone }
        };

        for (const role of roles) {
            const data = roleData[role] || {};
            const user = {
                recipient: data.email || `${role}@nowhere.invalid`,
                realName: data.name || role,
                roles: [role],
                sendEmails,
                sendSMS,
                singleSignOnEnabled
            };
            if (data.phone) user.mobileNumber = data.phone.replace(/\s/g, '');
            externUsers.push(user);
        }

        if (externUsers.length === 0) {
            const mkUser = (data, fallbackEmail, role) => {
                const u = { recipient: data.email || fallbackEmail, realName: data.name, roles: [role], sendEmails, sendSMS, singleSignOnEnabled };
                if (data.phone) u.mobileNumber = data.phone.replace(/\s/g, '');
                return u;
            };
            externUsers.push(
                mkUser(seller, 'seller@nowhere.invalid', 'seller'),
                mkUser(buyer, 'buyer@nowhere.invalid', 'buyer')
            );
        }

        const inOrder = getExternOption('inOrder') === true;
        const body = {
            sessionid: state.sessionId || '<session-id>',
            externUsers,
            inOrder
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
            // Merge request body data (name, phone, flags) with response (links)
            let reqUsers = [];
            try { reqUsers = (typeof body === 'string' ? JSON.parse(body) : body).externUsers || []; } catch (e) { /* ignore */ }

            if (users.length > 0 && users.some(u => u.externAccessLink)) {
                $linksDiv.css('display', '');
                $linksDiv.html('<div class="section-title">Signing Links</div>' +
                    '<div class="alert alert-insign mb-3" style="background:rgba(1,101,188,0.06);border:1px solid rgba(1,101,188,0.15);border-radius:8px;padding:8px 12px">' +
                    '<i class="bi bi-info-circle me-1" style="color:var(--insign-blue)"></i> ' +
                    '<span class="text-muted-sm">Each recipient has a unique link. Use <strong>separate browser profiles</strong> or <strong>private/incognito windows</strong> to avoid cookie conflicts between signers.</span></div>' +
                    users.map((u, idx) => {
                        const link = u.externAccessLink || '';
                        // Merge: response fields take priority, fall back to request body
                        const req = reqUsers[idx] || {};
                        const name = u.realName || req.realName || '';
                        const email = u.recipient || req.recipient || '';
                        const phone = u.mobileNumber || req.mobileNumber || '';
                        const roles = u.roles || req.roles || [];
                        const sendEmails = u.sendEmails != null ? u.sendEmails : req.sendEmails;
                        const sendSMS = u.sendSMS != null ? u.sendSMS : req.sendSMS;
                        const sso = u.singleSignOnEnabled != null ? u.singleSignOnEnabled : req.singleSignOnEnabled;
                        if (!link) return '';

                        // Build info chips
                        const chips = [];
                        if (email) chips.push(`<i class="bi bi-envelope"></i> ${escapeHtml(email)}`);
                        if (phone) chips.push(`<i class="bi bi-phone"></i> ${escapeHtml(phone)}`);
                        if (sendEmails === true) chips.push('<i class="bi bi-envelope-check"></i> Email notify');
                        if (sendSMS === true) chips.push('<i class="bi bi-chat-dots"></i> SMS notify');
                        if (sso === true) chips.push('<i class="bi bi-shield-check"></i> SSO');
                        if (sso === false) chips.push('<i class="bi bi-shield-x"></i> No SSO');

                        return `
                            <div class="signing-link-card mb-2 p-3" style="background:rgba(1,101,188,0.04);border-radius:8px;border:1px solid rgba(1,101,188,0.12)">
                                <div class="d-flex align-items-center gap-2 flex-wrap">
                                    <i class="bi bi-person-circle" style="color:var(--insign-blue);font-size:1.4rem"></i>
                                    <div>
                                        <strong>${escapeHtml(name || email)}</strong>
                                        ${roles.length ? roles.map(r => `<span class="badge bg-primary ms-1" style="font-size:0.65rem;vertical-align:middle">${escapeHtml(r)}</span>`).join('') : ''}
                                    </div>
                                    <div class="ms-auto d-flex gap-1">
                                        <a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="btn btn-insign btn-insign-sm btn-insign-cta">
                                            <i class="bi bi-box-arrow-up-right"></i> Open
                                        </a>
                                        <button class="btn btn-insign btn-insign-sm btn-insign-outline" onclick="navigator.clipboard.writeText('${escapeHtml(link)}')">
                                            <i class="bi bi-clipboard"></i> Copy
                                        </button>
                                    </div>
                                </div>
                                ${chips.length ? `<div class="d-flex flex-wrap gap-2 mt-2" style="font-size:0.75rem;color:var(--insign-dark)">${chips.map(c => `<span style="background:rgba(1,101,188,0.08);padding:2px 8px;border-radius:12px;white-space:nowrap">${c}</span>`).join('')}</div>` : ''}
                                <div class="text-mono text-muted-sm mt-2" style="font-size:0.7rem;word-break:break-all;opacity:0.7">${escapeHtml(link)}</div>
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

        // Docs / Additional toggles - regenerate snippet when toggled
        $('#code-docs-toggle').on('change', () => updateCodeSnippets());
        $('#code-samples-toggle').on('change', () => updateCodeSnippets());

        // Copy to clipboard
        $('#code-copy-btn').on('click', function () {
            const code = getEditorValue('code-snippet');
            if (!code) return;
            navigator.clipboard.writeText(code).then(() => {
                const $btn = $(this);
                $btn.html('<i class="bi bi-check2"></i> Copied');
                setTimeout(() => $btn.html('<i class="bi bi-clipboard"></i> Copy'), 1500);
            });
        });
    }

    function showCodeSnippet(langKey) {
        if (!window.CodeGenerator || !state.apiClient) return;

        // Code snippets always show the create-session flow (templates are a multi-step
        // walkthrough: create → status → download).  Use lastRequest body only if it was
        // a /configure/session call; otherwise fall back to the current editor body.
        let snippetBody;
        if (state.lastRequest && state.lastRequest.path === '/configure/session') {
            snippetBody = state.lastRequest.body;
        } else {
            try { snippetBody = getEditorValue('create-session'); } catch (e) { /* ignore */ }
            snippetBody = snippetBody || getDefaultCreateSessionBody();
        }
        const req = { method: 'POST', path: '/configure/session', body: snippetBody };

        const context = state.apiClient.getCodeContext(req.method, req.path, req.body);

        // Provide document info for <filedata> handling in code snippets
        context.documentUrl = getDocumentGithubRawUrl();
        context.documentFilename = getDocumentFilename();
        context.includeDocs = $('#code-docs-toggle').is(':checked');
        context.includeSamples = $('#code-samples-toggle').is(':checked');

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

    // --- PDF Thumbnail lazy-loader (uses pdf.js already loaded by PdfViewer) ---
    const _thumbCache = {};
    async function renderPdfThumbnail(pdfUrl, canvas, maxHeight = 80) {
        if (!canvas) return;
        const cached = _thumbCache[pdfUrl];
        if (cached) { _drawThumbFromCache(cached, canvas, maxHeight); return; }

        try {
            // Reuse pdf.js lib from PdfViewer if loaded, otherwise import
            let pdfjsLib = state.pdfViewer?.lib;
            if (!pdfjsLib) {
                pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.min.mjs');
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs';
            }
            const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 1 });
            const scale = maxHeight / vp.height;
            const viewport = page.getViewport({ scale });

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            _thumbCache[pdfUrl] = { w: viewport.width, h: viewport.height, data: canvas.toDataURL() };
        } catch (e) {
            // Show a placeholder icon on failure
            canvas.width = 56; canvas.height = maxHeight;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, 56, maxHeight);
            ctx.fillStyle = '#bbb'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('PDF', 28, maxHeight / 2 + 7);
        }
    }
    function _drawThumbFromCache(cached, canvas, maxHeight) {
        const img = new Image();
        img.onload = () => {
            canvas.width = cached.w; canvas.height = cached.h;
            canvas.getContext('2d').drawImage(img, 0, 0);
        };
        img.src = cached.data;
    }

    function _formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function buildDocumentSelector() {
        const $container = $('#doc-selector');
        if (!$container.length) return;

        const brandKeys = ['acme','greenleaf','nova','blueprint','solis','sentinel','aegis','harbor','apex','prism','mosaic','nexus'];
        const isBranded = (key) => brandKeys.includes(key);
        const selectedKey = state.selectedDoc;
        const selectedDoc = DOCUMENTS[selectedKey];

        // --- Build the dropdown button showing current selection ---
        let btnContent;
        if (selectedKey === 'custom') {
            btnContent = `<i class="bi bi-folder2-open"></i> <span>${DOCUMENTS.custom.label}</span>`;
        } else if (selectedDoc) {
            const logoHtml = selectedDoc.logo
                ? `<img src="${selectedDoc.logo}" class="doc-dd-btn-logo" alt="">`
                : `<i class="bi bi-file-earmark-pdf"></i>`;
            btnContent = `${logoHtml} <span>${selectedDoc.label}</span>`;
        }

        let html = `
            <div class="doc-dropdown" id="doc-dropdown">
                <button class="doc-dd-btn" type="button" id="doc-dd-toggle">
                    ${btnContent}
                    <i class="bi bi-chevron-down doc-dd-chevron"></i>
                </button>
                <div class="doc-dd-menu" id="doc-dd-menu">`;

        // --- Branded contracts ---
        html += `<div class="doc-dd-group-label">Branded Contracts <span class="doc-dd-count">${brandKeys.length}</span></div>`;
        for (const key of brandKeys) {
            const doc = DOCUMENTS[key];
            if (!doc) continue;
            const sel = key === selectedKey ? ' doc-dd-item-selected' : '';
            const sizeStr = _formatFileSize(doc.fileSize);
            html += `
                <div class="doc-dd-item${sel}" data-doc="${key}" onclick="window.app.selectDocument('${key}')">
                    <canvas class="doc-dd-thumb" data-pdf="${doc.local}" width="60" height="80"></canvas>
                    <div class="doc-dd-info">
                        <div class="doc-dd-title">
                            ${doc.logo ? `<img src="${doc.logo}" class="doc-dd-logo" alt="">` : ''}
                            ${doc.label}
                        </div>
                        <div class="doc-dd-meta">
                            <span>${doc.pages} pages</span>
                            <span class="doc-dd-sep"></span>
                            <span>3 SIG-tags</span>
                            ${sizeStr ? `<span class="doc-dd-sep"></span><span>${sizeStr}</span>` : ''}
                        </div>
                        <div class="doc-dd-roles">${doc.roles.map(r => `<span class="doc-dd-role">${r}</span>`).join('')}</div>
                    </div>
                </div>`;
        }

        // --- Custom upload ---
        const csel = 'custom' === selectedKey ? ' doc-dd-item-selected' : '';
        html += `
                <div class="doc-dd-divider"></div>
                <div class="doc-dd-item${csel}" data-doc="custom" onclick="window.app.selectDocument('custom')">
                    <div class="doc-dd-thumb doc-dd-thumb-icon"><i class="bi bi-folder2-open"></i></div>
                    <div class="doc-dd-info">
                        <div class="doc-dd-title">Your Own File</div>
                        <div class="doc-dd-meta"><span>Upload a PDF from your disk</span></div>
                    </div>
                </div>`;

        html += `</div></div>`;
        $container.html(html);

        // --- Toggle dropdown ---
        const $menu = $('#doc-dd-menu');
        const $toggle = $('#doc-dd-toggle');
        $toggle.on('click', (e) => {
            e.stopPropagation();
            const wasOpen = $menu.hasClass('open');
            $menu.toggleClass('open');
            $toggle.toggleClass('open');
            if (!wasOpen) {
                // Decide open direction: up or down based on available space
                const btnRect = $toggle[0].getBoundingClientRect();
                const spaceBelow = window.innerHeight - btnRect.bottom;
                const spaceAbove = btnRect.top;
                if (spaceAbove > spaceBelow) {
                    $menu.addClass('open-up');
                } else {
                    $menu.removeClass('open-up');
                }
                _lazyLoadVisibleThumbs();
            }
        });
        // Close on outside click
        $(document).on('click.docdd', (e) => {
            if (!$(e.target).closest('#doc-dropdown').length) {
                $menu.removeClass('open open-up');
                $toggle.removeClass('open');
            }
        });
    }

    /** Lazy-load PDF thumbnails for items currently visible in the dropdown */
    function _lazyLoadVisibleThumbs() {
        $('#doc-dd-menu canvas.doc-dd-thumb[data-pdf]').each(function() {
            const canvas = this;
            if (canvas.dataset.loaded) return;
            canvas.dataset.loaded = '1';
            // Use IntersectionObserver for true lazy load
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        renderPdfThumbnail(canvas.dataset.pdf, canvas, 80);
                        observer.unobserve(canvas);
                    }
                });
            }, { root: canvas.closest('.doc-dd-menu'), threshold: 0.1 });
            observer.observe(canvas);
        });
    }

    function selectDocument(type) {
        state.selectedDoc = type;

        // Close dropdown and rebuild it to reflect new selection
        $('#doc-dd-menu').removeClass('open open-up');
        $('#doc-dd-toggle').removeClass('open');
        buildDocumentSelector();

        // Legacy support for old-style .doc-option elements
        $('.doc-option').each(function () {
            const $el = $(this);
            $el.toggleClass('selected', $el.data('doc') === type);
        });

        // Show/hide custom file input
        const $customGroup = $('#custom-file-group');
        if ($customGroup.length) $customGroup.css('display', type === 'custom' ? '' : 'none');

        // Update displayname input to match selected document
        const selDoc = getSelectedDocument();
        const $dnInput = $('#cfg-displayname');
        if ($dnInput.length) {
            $dnInput.val(type === 'custom'
                ? (state.customFileData ? state.customFileData.name : '')
                : (selDoc.label || ''));
        }

        // Update editor first, then apply branding on top
        if (state.editors['create-session']) {
            setEditorValue('create-session', getDefaultCreateSessionBody());
            applyFeatureSettingsToEditor();
        }

        // Switch branding to match document (must come after editor reset)
        if (selDoc.brand) {
            const brandIndex = LOGO_SETS.findIndex(s => s.prefix === selDoc.brand);
            if (brandIndex >= 0) {
                selectColorScheme(brandIndex);
                selectLogoSet(brandIndex);
            }
        }
        saveAppState();
    }

    function initFileDeliveryDropdown() {
        var $menu = $('#fd-dd-menu');
        var $toggle = $('#fd-dd-toggle');
        if (!$toggle.length) return;
        $toggle.on('click', function (e) {
            e.stopPropagation();
            $menu.toggleClass('open');
            $toggle.toggleClass('open');
        });
        $(document).on('click.fddd', function (e) {
            if (!$(e.target).closest('#fd-dropdown').length) {
                $menu.removeClass('open');
                $toggle.removeClass('open');
            }
        });
    }

    const FD_OPTIONS = {
        base64: { label: 'Base64 embed', icon: 'bi-file-earmark-binary' },
        upload: { label: 'Upload after create', icon: 'bi-cloud-arrow-up' },
        url:    { label: 'URL reference', icon: 'bi-link-45deg' }
    };

    function setFileDelivery(mode) {
        state.fileDelivery = mode;

        // Update dropdown UI
        var opt = FD_OPTIONS[mode] || FD_OPTIONS.base64;
        $('#fd-dd-label').text(opt.label);
        $('#fd-dd-toggle .fd-dd-icon').attr('class', 'bi ' + opt.icon + ' fd-dd-icon');
        $('#fd-dd-menu .fd-dd-item').each(function () {
            $(this).toggleClass('fd-dd-item-selected', $(this).data('fd') === mode);
        });
        $('#fd-dd-menu').removeClass('open');
        $('#fd-dd-toggle').removeClass('open');

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
        // Default to dark mode; respect saved preference if set
        let dark = true;
        try {
            const saved = localStorage.getItem('insign-dark-mode');
            if (saved !== null) dark = saved === 'true';
        } catch { /* ignore */ }
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

        // Switch Monaco theme (global - applies to all editor instances)
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

    function buildWebhookProviderDropdown() {
        var $menu = $('#wh-dd-menu');
        if (!$menu.length) return;
        var html = '';
        Object.keys(WEBHOOK_PROVIDERS).forEach(function (key) {
            var p = WEBHOOK_PROVIDERS[key];
            var sel = key === state.webhookProvider ? ' wh-dd-item-selected' : '';
            html += '<div class="wh-dd-item' + sel + '" data-wh="' + key + '" onclick="window.app.setWebhookProvider(\'' + key + '\')">'
                + buildWhItemHtml(key, p)
                + '</div>';
        });
        $menu.html(html);

        // Update button and detail panel
        updateWhDetailPanel();

        // Probe all providers once in background
        var customUrl = ($('#cfg-webhook-custom-url').val() || '').trim();
        Object.keys(WEBHOOK_PROVIDERS).forEach(function (key) {
            var p = WEBHOOK_PROVIDERS[key];
            if (p.needsCustomUrl) {
                // For cfworker/custom, probe the user-entered URL instead of the static one
                if (customUrl) probeWebhookProvider(key, customUrl);
            } else if (p.url) {
                probeWebhookProvider(key, p.url);
            }
        });

        // Toggle
        var $toggle = $('#wh-dd-toggle');
        $toggle.off('click.whdd').on('click.whdd', function (e) {
            e.stopPropagation();
            $menu.toggleClass('open');
            $toggle.toggleClass('open');
        });
        $(document).off('click.whdd').on('click.whdd', function (e) {
            if (!$(e.target).closest('#wh-dropdown').length) {
                $menu.removeClass('open');
                $toggle.removeClass('open');
            }
        });
    }

    function probeWebhookProvider(key, url) {
        var $dots = $('[data-wh-probe="' + key + '"]');
        $dots.attr('class', 'wh-probe-dot wh-probe-pending');
        fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) })
            .then(function () {
                $('[data-wh-probe="' + key + '"]').attr('class', 'wh-probe-dot wh-probe-ok').attr('title', 'Reachable');
            })
            .catch(function () {
                $('[data-wh-probe="' + key + '"]').attr('class', 'wh-probe-dot wh-probe-fail').attr('title', 'Unreachable');
            });
    }

    /** Build the rich selected-item HTML (same layout as dropdown items) */
    function buildWhItemHtml(key, p, extra) {
        var iconHtml = p.favicon
            ? '<img src="' + p.favicon + '" width="16" height="16" alt="" style="image-rendering:auto">'
            : '<i class="bi ' + p.icon + '"></i>';
        var isSelfHosted = (key === 'custom' || key === 'cfworker');
        var secBadge = isSelfHosted
            ? '<span class="wh-dd-sec wh-dd-sec-safe"><i class="bi bi-shield-check"></i> your control</span>'
            : '<span class="wh-dd-sec wh-dd-sec-pub"><i class="bi bi-globe2"></i> public 3rd party</span>';
        var linkHtml = p.url ? '<a class="wh-dd-item-link" href="' + p.url + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="bi bi-box-arrow-up-right"></i> ' + p.url.replace('https://', '') + '</a>' : '';
        return '<div class="wh-dd-item-icon-wrap">' + iconHtml + '</div>'
            + '<div class="wh-dd-item-body">'
            + '<div class="wh-dd-item-title">' + p.label + ' <span class="wh-dd-tag wh-dd-tag-' + p.tag.toLowerCase() + '">' + p.tag + '</span>'
            + ' <span class="wh-probe-dot" data-wh-probe="' + key + '"></span></div>'
            + '<div class="wh-dd-item-desc">' + p.desc + '</div>'
            + '<div class="wh-dd-item-footer">' + secBadge + linkHtml + '</div>'
            + '</div>'
            + (extra || '');
    }

    function updateWhDetailPanel() {
        var key = state.webhookProvider;
        var cur = WEBHOOK_PROVIDERS[key] || WEBHOOK_PROVIDERS.smee;

        // Render the selected item as a rich card in the toggle area
        var chevron = '<i class="bi bi-chevron-down wh-dd-chevron"></i>';
        $('#wh-dd-toggle').html(buildWhItemHtml(key, cur, chevron));

        // Re-sync probe dot from menu (if already probed)
        var $menuDot = $('#wh-dd-menu [data-wh-probe="' + key + '"]');
        if ($menuDot.length && $menuDot.attr('class')) {
            $('#wh-dd-toggle [data-wh-probe="' + key + '"]').attr('class', $menuDot.attr('class'));
        }
    }

    function setWebhookProvider(provider) {
        state.webhookProvider = provider;
        const info = WEBHOOK_PROVIDERS[provider] || WEBHOOK_PROVIDERS['webhook.site'];

        // Update dropdown selection and detail panel
        $('#wh-dd-menu .wh-dd-item').each(function () {
            $(this).toggleClass('wh-dd-item-selected', $(this).data('wh') === provider);
        });
        $('#wh-dd-menu').removeClass('open');
        $('#wh-dd-toggle').removeClass('open');
        updateWhDetailPanel();

        // Show/hide custom URL input
        const $customGroup = $('#webhook-custom-url-group');
        if ($customGroup.length) $customGroup.css('display', info.needsCustomUrl ? '' : 'none');

        if (info.needsCustomUrl) {
            // Custom provider: just update session JSON with whatever URL user entered
            if (state.webhookViewer) state.webhookViewer.stopPolling();
            const customUrl = ($('#cfg-webhook-custom-url').val() || '').trim();
            if (state.editors['create-session'] && customUrl) {
                const body = getEditorValue('create-session');
                if (typeof body === 'object') {
                    body.serverSidecallbackURL = customUrl;
                    body.serversideCallbackMethod = 'POST';
                    body.serversideCallbackContenttype = 'json';
                    setEditorValue('create-session', body);
                }
            }
        } else {
            // Auto-managed providers - reinit with new provider
            reinitWebhook();
        }

        saveAppState();
    }

    function onWebhookCustomUrlChange() {
        var customUrl = ($('#cfg-webhook-custom-url').val() || '').trim();
        // Probe the user-entered URL
        if (customUrl) {
            var key = state.webhookProvider;
            probeWebhookProvider(key, customUrl);
        }
        // Re-apply current provider with the new URL
        setWebhookProvider(state.webhookProvider);
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
                    body.serversideCallbackContenttype = 'json';
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
        _pollInterval = setInterval(pollNow, 15000);
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
            const pct = Math.max(0, 100 - (elapsed / 15000) * 100);
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

            // First poll: show full status; subsequent polls: show diffs
            if (_lastPollBody === null && typeof body === 'object') {
                addPollFullCard(body);
            } else if (_lastPollBody !== null && typeof body === 'object') {
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

    function addPollFullCard(body) {
        const $container = $('#polling-changes');
        if (!$container.length) return;
        $container.find('.text-center').remove();

        const time = new Date().toLocaleTimeString();
        const json = JSON.stringify(body, null, 2);

        const $card = $('<div>');
        $card.addClass('webhook-entry');
        $card.html(`
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span>
                    <span class="webhook-method">STATUS</span>
                    <span class="webhook-time ms-2">${time}</span>
                </span>
                <span class="badge bg-info" style="font-size:0.65rem">initial</span>
            </div>
            <pre style="font-size:0.7rem;margin:0;max-height:300px;overflow:auto;background:rgba(0,0,0,0.2);padding:6px;border-radius:4px;white-space:pre-wrap;word-break:break-all">${escapeHtml(json)}</pre>
        `);
        $container.prepend($card);
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

            return `<div style="font-size:0.73rem;margin-bottom:2px;line-height:1.4;padding:2px 6px;border-radius:3px;background:${bgColor};word-break:break-all;font-family:monospace">` +
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

    function expandAllGroups() {
        $('#feature-toggles .feature-group .collapse').each(function () {
            if (!this.classList.contains('show')) {
                new bootstrap.Collapse(this, { toggle: true });
            }
        });
    }

    function collapseAllGroups() {
        $('#feature-toggles .feature-group .collapse.show').each(function () {
            new bootstrap.Collapse(this, { toggle: true });
        });
    }

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
            // No query - show everything, restore collapsed state
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
        { name: 'ACME Corp',       colors: { primary: '#0D47A1', accent: '#42A5F5', dark: '#1B2838', error: '#C62828', success: '#0A8765', surface: '#F0F3F6', text: '#3E3F42' } },
        { name: 'GreenLeaf',       colors: { primary: '#1B5E20', accent: '#66BB6A', dark: '#1B2F1B', error: '#C62828', success: '#2E7D32', surface: '#F1F5F1', text: '#2E3830' } },
        { name: 'NOVA Finance',    colors: { primary: '#B71C1C', accent: '#EF5350', dark: '#212121', error: '#B71C1C', success: '#0A8765', surface: '#F5F3F3', text: '#3E3F42' } },
        { name: 'BluePrint',       colors: { primary: '#37474F', accent: '#26A69A', dark: '#263238', error: '#C62828', success: '#00897B', surface: '#ECEFF1', text: '#37474F' } },
        { name: 'SOLIS Tech',      colors: { primary: '#E65100', accent: '#1565C0', dark: '#1A1A2E', error: '#BF360C', success: '#0A8765', surface: '#F3F1EF', text: '#3B3340' } },
        { name: 'Sentinel Ins.',   colors: { primary: '#1A237E', accent: '#FFD600', dark: '#0D1457', error: '#C62828', success: '#0A8765', surface: '#EDEDF5', text: '#2C2C52' } },
        { name: 'Aegis Life',      colors: { primary: '#00695C', accent: '#80CBC4', dark: '#004D40', error: '#D32F2F', success: '#00897B', surface: '#EDF5F3', text: '#2C4640' } },
        { name: 'Harbor Re',       colors: { primary: '#880E4F', accent: '#F48FB1', dark: '#6A0039', error: '#C62828', success: '#0A8765', surface: '#F5EEF2', text: '#4A2040' } },
        { name: 'Apex Assurance',  colors: { primary: '#4A148C', accent: '#CE93D8', dark: '#311B92', error: '#C62828', success: '#0A8765', surface: '#F0ECF5', text: '#382050' } },
        { name: 'Prism Digital',   colors: { primary: '#2979FF', accent: '#FF9100', dark: '#1A1A2E', error: '#FF1744', success: '#00C853', surface: '#F0F2F8', text: '#333348' } },
        { name: 'Mosaic Labs',     colors: { primary: '#1976D2', accent: '#F57C00', dark: '#212121', error: '#C62828', success: '#0A8765', surface: '#F0F3F6', text: '#3E3F42' } },
        { name: 'Nexus Group',     colors: { primary: '#1B3A5C', accent: '#C9963A', dark: '#0F2440', error: '#C75B4A', success: '#0A8765', surface: '#F0F1F3', text: '#2E3A48' } },
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
    function desaturate(hex, amount) { const [h,s,l] = hexToHSL(hex); return hslToHex(h, Math.max(0, s - amount), l); }
    function mixColors(hex1, hex2, ratio) {
        const r1 = parseInt(hex1.slice(1,3),16), g1 = parseInt(hex1.slice(3,5),16), b1 = parseInt(hex1.slice(5,7),16);
        const r2 = parseInt(hex2.slice(1,3),16), g2 = parseInt(hex2.slice(3,5),16), b2 = parseInt(hex2.slice(5,7),16);
        const r = Math.round(r1 + (r2-r1)*ratio), g = Math.round(g1 + (g2-g1)*ratio), b = Math.round(b1 + (b2-b1)*ratio);
        return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
    }

    /** Auto-derive success, surface, text from 4 base colors */
    function autoDerive(primary, dark) {
        const surface = desaturate(lighten(dark, 78), 60);
        const text = darken(desaturate(dark, 30), 5);
        return { success: '#0A8765', surface, text };
    }

    /** Generate CSS override using color-mix() — only base vars, the default farbpalette's var() cascade handles the rest */
    function generateBrandCSS(primary, accent, dark, error, success, surface, text) {
        return `:root {
  /* ─── Primary / Blue Palette ─── */
  --insignBlue: ${primary};
  --800: color-mix(in srgb, var(--insignBlue), white 30%);
  --insignNavy: color-mix(in srgb, var(--insignBlue), black 20%);
  --insignModernBlue: color-mix(in srgb, var(--insignBlue), white 30%);
  --insignMediumBlue: color-mix(in srgb, var(--insignBlue), white 25%);
  --insignLightBlue2: color-mix(in srgb, var(--insignBlue), white 40%);
  --insignLighterBlue: color-mix(in srgb, var(--insignBlue), white 50%);
  --insignUltraLightBlue: color-mix(in srgb, var(--insignBlue), white 85%);
  --insignLightestBlue: color-mix(in srgb, var(--insignBlue), white 75%);
  --insignHighlightBlue: color-mix(in srgb, var(--insignBlue), white 80%);
  --insignHigherLightBlue: color-mix(in srgb, var(--insignBlue), white 90%);

  /* ─── Accent Colors ─── */
  --insignOrange: ${accent};
  --insignBlueInverted: color-mix(in srgb, var(--insignOrange), white 25%);
  --insignLightOrange: color-mix(in srgb, var(--insignOrange), white 25%);
  --insignYellow: color-mix(in srgb, var(--insignOrange), white 40%);
  --insignAlternativeYellow: var(--insignOrange);

  /* ─── Grey Palette (surface-derived) ─── */
  --insignLigtherGrey: ${surface};
  --insignLightestGrey: color-mix(in srgb, var(--insignLigtherGrey), white 30%);
  --insignLightestGrey2: color-mix(in srgb, var(--insignLigtherGrey), white 50%);
  --insignLightGrey: color-mix(in srgb, var(--insignLigtherGrey), black 5%);
  --insignGrey: color-mix(in srgb, var(--insignLigtherGrey), black 8%);
  --insignGrey2: color-mix(in srgb, var(--insignLigtherGrey), white 15%);
  --insignGrey3: color-mix(in srgb, var(--insignLigtherGrey), var(--insignBlue) 3%);
  --insignGrey4: color-mix(in srgb, var(--insignLigtherGrey), black 18%);
  --insignGrey5: color-mix(in srgb, var(--insignLigtherGrey), black 12%);
  --insignMiddleGrey: color-mix(in srgb, var(--insignLigtherGrey), black 25%);
  --insignMediumGrey: color-mix(in srgb, var(--insignLigtherGrey), black 40%);
  --insignMediumGrey2: color-mix(in srgb, var(--insignLigtherGrey), black 55%);
  --insignDarkGrey: color-mix(in srgb, var(--insignLigtherGrey), black 40%);
  --insignDarkerGrey: color-mix(in srgb, var(--insignLigtherGrey), black 50%);
  --insignDarkestGrey: color-mix(in srgb, var(--insignLigtherGrey), black 55%);

  /* ─── Text / Dark Tones ─── */
  --insignDarkBlack: ${dark};
  --insignBlack: ${text};
  --insignLightBlack: color-mix(in srgb, var(--insignBlack), white 25%);
  --insignAlternativeBlack: var(--insignBlack);
  --insignLightDarkBlack: color-mix(in srgb, var(--insignBlack), black 10%);

  /* ─── Error / Success ─── */
  --insignRed: ${error};
  --insignLightRed: color-mix(in srgb, var(--insignRed), white 30%);
  --insignLightestRed: color-mix(in srgb, var(--insignRed), white 75%);
  --insignLighterRed: color-mix(in srgb, var(--insignRed), white 55%);
  --insignGreen: color-mix(in srgb, ${success}, white 25%);
  --insignLightGreen: color-mix(in srgb, ${success}, white 50%);
  --insignMiddleGreen: ${success};
  --insignDarkGreen: color-mix(in srgb, ${success}, black 15%);

}`;
    }

    /** Render CSS with syntax highlighting, inline color swatches, and resolved var() references */
    function _renderRichCSS(css) {
        const el = document.getElementById('brand-css-rich');
        if (!el) return;

        const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // First pass: build variable → resolved-color lookup (follow var chains + color-mix)
        const varMap = {};
        for (const line of css.split('\n')) {
            const dm = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
            if (dm) varMap[dm[1]] = dm[2];
        }
        // Resolve var() chains and color-mix() up to 5 levels deep
        function resolveColor(val) {
            let v = val, depth = 0;
            while (v && depth++ < 5) {
                const hex = v.match(/^#[0-9a-fA-F]{6,8}$/);
                if (hex) return v;
                const ref = v.match(/^var\((--[\w-]+)\)$/);
                if (ref && varMap[ref[1]]) { v = varMap[ref[1]]; continue; }
                // Try resolving color-mix() to approximate swatch
                const cmMatch = v.match(/^color-mix\(in srgb,\s*(.+?),\s*(white|black|#[0-9a-fA-F]{6})\s+(\d+)%\)$/);
                if (cmMatch) {
                    const base = resolveColor(cmMatch[1].trim());
                    if (base) {
                        const target = cmMatch[2] === 'white' ? '#ffffff' : cmMatch[2] === 'black' ? '#000000' : cmMatch[2];
                        const pct = parseInt(cmMatch[3]) / 100;
                        const r1 = parseInt(base.slice(1,3),16), g1 = parseInt(base.slice(3,5),16), b1 = parseInt(base.slice(5,7),16);
                        const r2 = parseInt(target.slice(1,3),16), g2 = parseInt(target.slice(3,5),16), b2 = parseInt(target.slice(5,7),16);
                        const r = Math.round(r1 + (r2-r1)*pct), g = Math.round(g1 + (g2-g1)*pct), b = Math.round(b1 + (b2-b1)*pct);
                        return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
                    }
                }
                break;
            }
            return null;
        }

        const lines = css.split('\n');
        const htmlLines = lines.map(line => {
            // Comment lines
            if (line.trim().startsWith('/*')) {
                return `<span class="css-comment">${esc(line)}</span>`;
            }
            // Selector lines (e.g. ":root {")
            if (line.trim().startsWith(':') || line.trim() === '}') {
                return `<span class="css-selector">${esc(line)}</span>`;
            }
            // Property: value lines
            const m = line.match(/^(\s*)(--[\w-]+)(\s*:\s*)(.+?)(;?\s*)$/);
            if (m) {
                const [, indent, prop, colon, val, semi] = m;
                let valHtml;
                // Direct hex color
                const hexMatch = val.match(/^(#[0-9a-fA-F]{6,8})$/);
                if (hexMatch) {
                    valHtml = `<span class="css-color-swatch" style="background:${hexMatch[1]}"></span><span class="css-prop-val">${esc(val)}</span>`;
                }
                // var() or color-mix() reference — resolve and show swatch if it's a color
                else if (val.includes('var(') || val.includes('color-mix(')) {
                    const resolved = resolveColor(val);
                    const swatch = resolved ? `<span class="css-color-swatch" style="background:${resolved}"></span>` : '';
                    valHtml = swatch + esc(val).replace(/var\((--[\w-]+)\)/g, m =>
                        `<span class="css-var-ref">${m}</span>`
                    );
                }
                else {
                    // Could be a hex with alpha suffix (e.g. #0D47A17A) — try swatch
                    const partialHex = val.match(/(#[0-9a-fA-F]{6,8})/);
                    if (partialHex) {
                        valHtml = `<span class="css-color-swatch" style="background:${partialHex[1]}"></span><span class="css-prop-val">${esc(val)}</span>`;
                    } else {
                        valHtml = `<span class="css-prop-val">${esc(val)}</span>`;
                    }
                }
                return `${esc(indent)}<span class="css-prop-name">${esc(prop)}</span><span class="css-punct">${esc(colon)}</span>${valHtml}<span class="css-punct">${esc(semi)}</span>`;
            }
            return esc(line);
        });
        el.innerHTML = htmlLines.join('\n');

        // Expand on click, collapse when focus leaves
        if (!el._bound) {
            el._bound = true;
            el.addEventListener('click', () => el.classList.add('expanded'));
            el.setAttribute('tabindex', '0');
            el.addEventListener('blur', () => el.classList.remove('expanded'));
            // Also collapse when clicking outside
            document.addEventListener('mousedown', e => {
                if (!el.contains(e.target)) el.classList.remove('expanded');
            });
        }
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
                <span class="color-scheme-dot" style="background:${scheme.colors.surface};border:1px solid #ccc"></span>
                <span style="font-size:0.7rem">${scheme.name}</span>
            </div>
        `).join('');
    }

    function selectColorScheme(index) {
        const scheme = COLOR_SCHEMES[index];
        if (!scheme) return;
        const ids = ['primary','accent','dark','error','success','surface','text'];
        ids.forEach(id => {
            const v = scheme.colors[id];
            const el = document.getElementById('brand-color-' + id);
            const hex = document.getElementById('brand-color-' + id + '-hex');
            if (el) el.value = v;
            if (hex) hex.value = v;
            // Unlock advanced pickers when selecting a scheme
            const lock = document.getElementById('brand-color-' + id + '-lock');
            if (lock) lock.checked = false;
        });

        // Highlight active
        document.querySelectorAll('.color-scheme-btn').forEach((btn, j) => btn.classList.toggle('active', j === index));

        updateBrandColor();
    }

    function updateBrandColor() {
        const primary = document.getElementById('brand-color-primary').value;
        const accent = document.getElementById('brand-color-accent').value;
        const dark = document.getElementById('brand-color-dark').value;
        const error = document.getElementById('brand-color-error').value;

        // Sync hex text fields for base 4
        document.getElementById('brand-color-primary-hex').value = primary;
        document.getElementById('brand-color-accent-hex').value = accent;
        document.getElementById('brand-color-dark-hex').value = dark;
        document.getElementById('brand-color-error-hex').value = error;

        // Auto-derive advanced colors
        const derived = autoDerive(primary, dark);

        const css = generateBrandCSS(primary, accent, dark, error, derived.success, derived.surface, derived.text);
        const preview = document.getElementById('brand-css-preview');
        if (preview) preview.value = css;
        _renderRichCSS(css);
        // Auto-apply to JSON body
        applyBrandingCSS();
        saveAppState();
    }

    function applyBrandingCSS() {
        const css = document.getElementById('brand-css-preview')?.value;
        if (!css || !state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;

        // Collapse to single line - the API field expects no linebreaks
        body.externalPropertiesURL = css.replace(/\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
        setEditorValue('create-session', body);
    }

    function applyBrandingLogos() {
        if (!state.editors['create-session']) return;
        var iconUrl = document.getElementById('brand-app-icon')?.value;
        var mailUrl = document.getElementById('brand-mail-header-image')?.value;
        var loginUrl = document.getElementById('brand-logo-extern')?.value;
        if (!iconUrl && !mailUrl && !loginUrl) return;
        var body = getEditorValue('create-session');
        if (typeof body !== 'object') return;
        if (!body.guiProperties) body.guiProperties = {};
        if (iconUrl) body.guiProperties['message.start.logo.url.editor.desktop'] = iconUrl;
        if (mailUrl) body.guiProperties['message.mt.header.image'] = mailUrl;
        if (loginUrl) body.logoExtern = loginUrl;
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
        // Already a data URL - pass through
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
        { name: 'ACME Corp', prefix: 'acme' },
        { name: 'GreenLeaf', prefix: 'greenleaf' },
        { name: 'NOVA Finance', prefix: 'nova' },
        { name: 'BluePrint', prefix: 'blueprint' },
        { name: 'SOLIS Tech', prefix: 'solis' },
        { name: 'Sentinel Ins.', prefix: 'sentinel' },
        { name: 'Aegis Life', prefix: 'aegis' },
        { name: 'Harbor Re', prefix: 'harbor' },
        { name: 'Apex Assurance', prefix: 'apex' },
        { name: 'Prism Digital', prefix: 'prism' },
        { name: 'Mosaic Labs', prefix: 'mosaic' },
        { name: 'Nexus Group', prefix: 'nexus' },
    ];

    function getLogoSrc(set, variant) {
        return `img/sample-logos/${set.prefix}-${variant}.svg`;
    }

    function buildLogoSets() {
        const container = document.getElementById('logo-sets');
        if (!container) return;
        // "Default" card first - removes all logos from JSON
        let html = `
            <div class="logo-set-card active" onclick="window.app.resetLogos()" title="Remove all custom logos - use server defaults">
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

        const iconUrl = buildAbsoluteUrl(getLogoSrc(set, 'icon'));
        const mailUrl = buildAbsoluteUrl(getLogoSrc(set, 'mail'));
        const loginUrl = buildAbsoluteUrl(getLogoSrc(set, 'login'));

        // Apply to JSON body
        if (!state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;
        if (!body.guiProperties) body.guiProperties = {};

        // App icon - via message ID for editor desktop logo
        body.guiProperties['message.start.logo.url.editor.desktop'] = iconUrl;
        // Mail header - right-side logo
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
        saveAppState();
    }

    function restoreBranding() {
        const saved = loadAppState();
        if (!saved) return;

        if (saved.brandColors) {
            const c = saved.brandColors;
            if (c.primary) { $('#brand-color-primary').val(c.primary); $('#brand-color-primary-hex').val(c.primary); }
            if (c.accent)  { $('#brand-color-accent').val(c.accent);   $('#brand-color-accent-hex').val(c.accent); }
            if (c.dark)    { $('#brand-color-dark').val(c.dark);        $('#brand-color-dark-hex').val(c.dark); }
            if (c.error)   { $('#brand-color-error').val(c.error);      $('#brand-color-error-hex').val(c.error); }
        }
        if (saved.brandColorScheme >= 0) {
            document.querySelectorAll('.color-scheme-btn').forEach((btn, j) =>
                btn.classList.toggle('active', j === saved.brandColorScheme));
        }
        if (saved.brandLogoSet >= 0) {
            document.querySelectorAll('.logo-set-card').forEach((c, j) =>
                c.classList.toggle('active', j === saved.brandLogoSet));
        }
        if (saved.brandLogos) {
            const l = saved.brandLogos;
            if (l.icon)  { $('#brand-app-icon').val(l.icon);           showPreview('brand-app-icon-preview', l.icon); }
            if (l.mail)  { $('#brand-mail-header-image').val(l.mail);   showPreview('brand-mail-header-preview', l.mail); }
            if (l.login) { $('#brand-logo-extern').val(l.login);        showPreview('brand-logo-extern-preview', l.login); }
        }
    }

    /** Remove all custom logos from JSON - revert to server defaults */
    function resetLogos() {
        // Highlight Default card (first one)
        document.querySelectorAll('.logo-set-card').forEach((c, j) => c.classList.toggle('active', j === 0));

        if (!state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;

        // Remove logo keys
        if (body.guiProperties) {
            delete body.guiProperties['message.start.logo.url.editor.desktop'];
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
        saveAppState();
    }

    /** Update a single logo slot: icon | mail | login */
    async function updateBrandLogo(slot, url) {
        if (!state.editors['create-session']) return;
        const body = getEditorValue('create-session');
        if (typeof body !== 'object') return;
        if (!body.guiProperties) body.guiProperties = {};

        const dataUrl = url ? await toBase64DataUrl(url) : null;
        const config = {
            icon:  { key: 'message.start.logo.url.editor.desktop', path: 'guiProperties', input: 'brand-app-icon', preview: 'brand-app-icon-preview' },
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
        saveAppState();
    }

    function uploadBrandLogo(input, slot) {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => updateBrandLogo(slot, reader.result);
        reader.readAsDataURL(file);
    }

    // =====================================================================
    // API Trace sidebar
    // =====================================================================

    /** Recalculate main column width based on sidebar visibility */
    function updateMainColumnWidth() {
        const $main = $('#main-column');
        const rightVisible = !$('#trace-column').hasClass('d-none');

        $main.removeClass('col-lg-6 col-lg-9 col-md-4 col-md-8');
        if (rightVisible) {
            $main.addClass('col-lg-9 col-md-8');
        }
    }

    /** Show the right sidebar (first call, or if not manually collapsed) */
    function showTraceColumn() {
        if (state.sidebarCollapsed) return; // respect manual collapse
        const $col = $('#trace-column');
        if ($col.hasClass('d-none')) {
            $col.removeClass('d-none');
            $('#expand-right-sidebar').addClass('d-none');
            updateMainColumnWidth();
        }
    }

    /** Render a single trace entry and prepend it to the list */
    function renderTraceEntry(entry) {
        showTraceColumn();

        const $container = $('#trace-entries');
        $('#trace-empty').remove();

        const methodCls = 'trace-method-' + entry.method.toLowerCase();
        const statusCls = entry.ok ? 'trace-status-ok' : 'trace-status-err';
        const entryCls = entry.ok ? 'trace-ok' : 'trace-err';
        const time = new Date(entry.timestamp).toLocaleTimeString();

        // Format headers for display
        const fmtHeaders = (hdrs) => {
            if (!hdrs || !Object.keys(hdrs).length) return '<span style="opacity:0.5">none</span>';
            return Object.entries(hdrs).map(([k, v]) => {
                let display = v;
                // Truncate long auth values
                if (k.toLowerCase() === 'authorization' && display.length > 60) {
                    display = display.substring(0, 40) + '...' + display.substring(display.length - 10);
                }
                return `<div><span class="th-name">${escapeHtml(k)}:</span> ${escapeHtml(display)}</div>`;
            }).join('');
        };

        // Format body for display
        const fmtBody = (body) => {
            if (body === null || body === undefined) return '<span style="opacity:0.5">empty</span>';
            if (typeof body === 'object') {
                try { return escapeHtml(JSON.stringify(body, null, 2)); } catch { return escapeHtml(String(body)); }
            }
            return escapeHtml(String(body));
        };

        // Look up endpoint description from OpenAPI spec
        const pathInfo = state.schemaLoader ? state.schemaLoader.getPathInfo(entry.path, entry.method) : null;
        const descHtml = pathInfo && (pathInfo.summary || pathInfo.description)
            ? `<div class="trace-desc">${escapeHtml(pathInfo.summary || pathInfo.description)}</div>`
            : '';

        // Decode proxy URLs for display: "http://localhost:9009/?https%3A%2F%2F..." -> actual URL + proxy hint
        let displayUrl = entry.url;
        let proxyHint = '';
        if (state.apiClient && state.apiClient.useCorsProxy && state.apiClient.corsProxyUrl) {
            const proxyPrefix = state.apiClient.corsProxyUrl;
            if (entry.url.startsWith(proxyPrefix)) {
                const encoded = entry.url.substring(proxyPrefix.length);
                try { displayUrl = decodeURIComponent(encoded); } catch (_) { displayUrl = encoded; }
                proxyHint = '<span class="trace-proxy-badge" title="Routed through CORS proxy: ' + escapeHtml(proxyPrefix) + '"><i class="bi bi-shuffle"></i> proxy</span>';
            }
        }

        const html = `
            <div class="trace-entry ${entryCls}" data-trace-id="${entry.id}">
                <div class="trace-summary" onclick="this.parentElement.classList.toggle('open')">
                    <span class="trace-method ${methodCls}">${entry.method}</span>
                    <span class="trace-path" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</span>
                    ${proxyHint}
                    <span class="trace-status ${statusCls}">${entry.status}</span>
                    <span class="trace-duration">${entry.duration}ms</span>
                </div>
                <div class="trace-detail">
                    ${descHtml}
                    <div class="trace-time">${time}</div>
                    <div class="trace-url">${escapeHtml(displayUrl)}</div>

                    <div class="trace-section-label">Request Headers</div>
                    <div class="trace-headers">${fmtHeaders(entry.requestHeaders)}</div>

                    <div class="trace-section-label">Request Body</div>
                    <div class="trace-body-preview">${fmtBody(entry.requestBody)}</div>

                    <div class="trace-section-label">Response Headers</div>
                    <div class="trace-headers">${fmtHeaders(entry.responseHeaders)}</div>

                    <div class="trace-section-label">Response Body</div>
                    <div class="trace-body-preview">${fmtBody(entry.responseBody)}</div>
                </div>
            </div>`;

        $container.prepend(html);
        const count = state.apiClient ? state.apiClient.getTraceLog().length : 0;
        $('#trace-count').text(count);
        $('#expand-trace-count').text(count).toggleClass('has-count', count > 0);
    }

    /** Clear all trace entries */
    function clearTrace() {
        if (state.apiClient) state.apiClient.clearTraceLog();
        $('#trace-entries').html('<div class="text-center text-muted-sm py-3" id="trace-empty"><i class="bi bi-hourglass-split"></i> No API calls yet</div>');
        $('#trace-count').text('0');
        $('#expand-trace-count').text('').removeClass('has-count');
    }

    /** Hook the apiClient trace listener (called after apiClient is created) */
    function hookTrace() {
        if (state.apiClient) {
            state.apiClient.onTrace(renderTraceEntry);
        }
    }

    /** Collapse the sidebar and show an expand tab on the edge */
    function collapseSidebar() {
        state.sidebarCollapsed = true;
        $('#trace-column').addClass('d-none');
        $('#expand-right-sidebar').removeClass('d-none');
        updateMainColumnWidth();
    }

    /** Expand the sidebar */
    function expandSidebar() {
        state.sidebarCollapsed = false;
        $('#trace-column').removeClass('d-none');
        $('#expand-right-sidebar').addClass('d-none');
        updateMainColumnWidth();
    }

    /** Toggle a sidebar section collapsed/expanded */
    function toggleSection(name) {
        $('#section-' + name).toggleClass('collapsed');
    }

    window.app = {
        createSession,
        createSessionAndOpen,
        openInSign,
        openSessionManager,
        executeOperation,
        executeFreeRequest,
        executeExtern,
        executeDownload,
        executeDocumentSingle,
        toggleIncludeBiodata,
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
        onWebhookCustomUrlChange,
        pollNow,
        togglePolling,
        toggleWebhookSection,
        togglePollingSection,
        // Authentication
        setAuthMode,
        executeOAuth2Token,
        clearOAuth2Token,
        // Branding
        selectColorScheme,
        updateBrandColor,
        applyBrandingCSS,
        resetBranding,
        selectLogoSet,
        resetLogos,
        updateBrandLogo,
        uploadBrandLogo,
        expandAllGroups,
        collapseAllGroups,
        // Trace
        clearTrace,
        // Sidebar
        collapseSidebar,
        expandSidebar,
        toggleSection
    };

    // =====================================================================
    // Boot
    // =====================================================================

    $(init);

})();
