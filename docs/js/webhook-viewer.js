/* ==========================================================================
   Webhook Viewer — multi-provider webhook receiver for inSign callbacks

   Supported providers (all no-signup, all shown inline):
     • webhook.site     — free REST API, polls for requests
     • smee.io          — SSE real-time streaming (GitHub's service)
     • postb.in         — Toptal PostBin, REST FIFO poll
     • requestcatcher   — any subdomain, WebSocket real-time
     • ntfy.sh          — pub/sub notification relay via SSE (creative abuse)
     • custom           — user provides own URL (no auto-listen)

   No external pages need to be visited — everything is shown inline.
   ========================================================================== */

window.WebhookViewer = class WebhookViewer {

    constructor(containerEl) {
        this.$container = $(containerEl);
        this.channelUrl = null;       // the URL inSign posts callbacks to
        this.requests = [];
        this.onUrlCreated = null;     // callback(url)
        this.onRequestReceived = null; // callback(request)

        // Shared state
        this._eventSource = null;     // SSE EventSource (smee, ntfy)
        this._webSocket = null;       // WebSocket (requestcatcher)
        this._pollTimer = null;       // poll timer (webhook.site, postbin)
        this._seenIds = new Set();    // de-dupe requests
        this._pollInterval = 4000;

        // Provider-specific
        this._wsToken = null;         // webhook.site token UUID
        this._postbinId = null;       // postb.in bin ID
        this._provider = 'webhook.site';
    }

    /* ------------------------------------------------------------------
       Provider selection
       ------------------------------------------------------------------ */
    setProvider(name) { this.destroy(); this._provider = name; }
    getProvider() { return this._provider; }

    /* ------------------------------------------------------------------
       Create endpoint (dispatches to provider)
       ------------------------------------------------------------------ */
    async createEndpoint() {
        const fn = {
            'webhook.site':    () => this._createWebhookSite(),
            'smee':            () => this._createSmee(),
            'postbin':         () => this._createPostbin(),
            'ntfy':            () => this._createNtfy(),
            'cfworker':        () => this._createCfWorker(),
        }[this._provider];
        if (fn) return fn();
        // custom — no auto-create
        return Promise.resolve(null);
    }

    /* ------------------------------------------------------------------
       Start / stop listening (dispatches to provider)
       ------------------------------------------------------------------ */
    startPolling() {
        const fn = {
            'webhook.site':    () => this._pollWebhookSite(),
            'smee':            () => this._sseSmee(),
            'postbin':         () => this._pollPostbin(),
            'ntfy':            () => this._sseNtfy(),
            'cfworker':        () => this._pollCfWorker(),
        }[this._provider];
        if (fn) fn();
    }

    stopPolling() {
        if (this._eventSource) { this._eventSource.close(); this._eventSource = null; }
        if (this._webSocket) { this._webSocket.close(); this._webSocket = null; }
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    }

    /* ------------------------------------------------------------------
       Public helpers
       ------------------------------------------------------------------ */
    getUrl() { return this.channelUrl; }

    destroy() {
        this.stopPolling();
        this.channelUrl = null;
        this._wsToken = null;
        this._postbinId = null;
        this._seenIds.clear();
        this.requests = [];
    }

    /* ==================================================================
       1. WEBHOOK.SITE — REST poll
       POST /token → uuid, GET /token/{uuid}/requests
       ================================================================== */

    async _createWebhookSite() {
        try {
            const resp = await fetch('https://webhook.site/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ cors: true, default_status: 200, default_content: 'ok', default_content_type: 'text/plain' })
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const token = await resp.json();
            this._wsToken = token.uuid;
            this.channelUrl = 'https://webhook.site/' + token.uuid;
            this._seenIds.clear();
            this._finishCreate();
            return this.channelUrl;
        } catch (err) {
            console.warn('[webhook] webhook.site failed:', err.message);
            this.renderError('webhook.site unavailable: ' + err.message);
            return null;
        }
    }

    _pollWebhookSite() {
        this.stopPolling();
        if (!this._wsToken) return;
        const poll = async () => {
            try {
                const resp = await fetch(
                    'https://webhook.site/token/' + this._wsToken + '/requests?sorting=newest&per_page=50',
                    { headers: { 'Accept': 'application/json' } }
                );
                if (!resp.ok) return;
                const json = await resp.json();
                const items = json.data || [];
                let hasNew = false;
                for (let i = items.length - 1; i >= 0; i--) {
                    const item = items[i];
                    if (this._seenIds.has(item.uuid)) continue;
                    this._seenIds.add(item.uuid);
                    hasNew = true;
                    this._addRequest({
                        id: item.uuid,
                        method: (item.method || 'POST').toUpperCase(),
                        content_type: item.content_type || '',
                        body: this._tryParseJson(item.content),
                        timestamp: item.created_at ? new Date(item.created_at) : new Date(),
                        headers: this._flattenHeaders(item.headers)
                    });
                }
                if (hasNew) this.renderRequests();
            } catch (err) { console.warn('[webhook] poll error:', err.message); }
        };
        poll();
        this._pollTimer = setInterval(poll, this._pollInterval);
    }

    /* ==================================================================
       2. SMEE.IO — SSE real-time
       Random channel, EventSource stream
       ================================================================== */

    _createSmee() {
        const id = this._randomId(16);
        this.channelUrl = 'https://smee.io/insign-' + id;
        this._finishCreate();
        return Promise.resolve(this.channelUrl);
    }

    _sseSmee() {
        this.stopPolling();
        if (!this.channelUrl) return;
        this._eventSource = new EventSource(this.channelUrl);
        this._eventSource.addEventListener('ping', () => {});
        this._eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const skipKeys = new Set(['body', 'timestamp', 'method', 'query', 'host', 'url']);
                const headers = {};
                for (const [k, v] of Object.entries(data)) {
                    if (!skipKeys.has(k) && typeof v === 'string') headers[k] = v;
                }
                this._addRequest({
                    id: data['x-request-id'] || data.timestamp || String(Date.now()),
                    method: data.method || 'POST',
                    content_type: data['content-type'] || '',
                    body: data.body || data,
                    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
                    headers
                });
                this.renderRequests();
            } catch { /* ignore */ }
        };
        this._eventSource.onerror = () => {};
    }

    /* ==================================================================
       3. POSTB.IN (Toptal PostBin) — REST FIFO poll
       POST /api/bin → {binId}, POST to /{binId}, GET /api/bin/{binId}/req/shift
       Bins expire after 30 min.
       ================================================================== */

    async _createPostbin() {
        try {
            const resp = await fetch('https://www.postb.in/api/bin', { method: 'POST' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            this._postbinId = data.binId;
            this.channelUrl = 'https://www.postb.in/' + data.binId;
            this._finishCreate();
            return this.channelUrl;
        } catch (err) {
            console.warn('[webhook] postb.in failed:', err.message);
            this.renderError('postb.in unavailable: ' + err.message);
            return null;
        }
    }

    _pollPostbin() {
        this.stopPolling();
        if (!this._postbinId) return;
        const poll = async () => {
            try {
                // Shift returns one request at a time (FIFO), 404 when empty
                const resp = await fetch('https://www.postb.in/api/bin/' + this._postbinId + '/req/shift');
                if (resp.status === 404) return; // no requests waiting
                if (!resp.ok) return;
                const item = await resp.json();
                this._addRequest({
                    id: item.id || String(Date.now()),
                    method: (item.method || 'POST').toUpperCase(),
                    content_type: (item.headers && item.headers['content-type']) || '',
                    body: this._tryParseJson(item.body),
                    timestamp: item.inserted ? new Date(item.inserted) : new Date(),
                    headers: item.headers || {}
                });
                this.renderRequests();
                // There might be more — poll again immediately
                setTimeout(poll, 200);
            } catch (err) { console.warn('[webhook] postbin poll error:', err.message); }
        };
        poll();
        this._pollTimer = setInterval(poll, this._pollInterval);
    }

    /* ==================================================================
       4. REQUESTCATCHER.COM — WebSocket real-time
       Any subdomain works: {name}.requestcatcher.com
       WebSocket at wss://{name}.requestcatcher.com
       ================================================================== */

    _createRequestCatcher() {
        const name = 'insign-' + this._randomId(10);
        this.channelUrl = 'https://' + name + '.requestcatcher.com/callback';
        this._rcSubdomain = name;
        this._finishCreate();
        return Promise.resolve(this.channelUrl);
    }

    _wsRequestCatcher() {
        this.stopPolling();
        if (!this._rcSubdomain) return;
        try {
            const wsUrl = 'wss://' + this._rcSubdomain + '.requestcatcher.com';
            this._webSocket = new WebSocket(wsUrl);
            this._webSocket.onmessage = (event) => {
                try {
                    // requestcatcher sends HTML fragments — try to extract useful data
                    const raw = event.data;
                    let body = raw;
                    let method = 'POST';

                    // Try JSON parse first
                    const parsed = this._tryParseJson(raw);
                    if (parsed && typeof parsed === 'object') {
                        body = parsed.body || parsed;
                        method = parsed.method || 'POST';
                    }

                    this._addRequest({
                        id: String(Date.now()),
                        method: method,
                        content_type: '',
                        body: typeof body === 'string' ? this._tryParseJson(body) : body,
                        timestamp: new Date(),
                        headers: {}
                    });
                    this.renderRequests();
                } catch { /* ignore unparseable */ }
            };
            this._webSocket.onerror = () => {
                console.warn('[webhook] requestcatcher WS error');
            };
            this._webSocket.onclose = () => {
                // Auto-reconnect after 5s
                if (this._provider === 'requestcatcher' && this._rcSubdomain) {
                    setTimeout(() => this._wsRequestCatcher(), 5000);
                }
            };
        } catch (err) {
            console.warn('[webhook] requestcatcher WS failed:', err.message);
        }
    }

    /* ==================================================================
       5. NTFY.SH — SSE (abusing pub/sub notification service)
       POST body goes to topic, subscribe via SSE at /{topic}/sse
       Note: JSON bodies with Content-Type: application/json may be
       interpreted as ntfy commands — works best with text/plain callbacks.
       ================================================================== */

    _createNtfy() {
        const topic = 'insign-wh-' + this._randomId(12);
        this.channelUrl = 'https://ntfy.sh/' + topic;
        this._ntfyTopic = topic;
        this._finishCreate();
        return Promise.resolve(this.channelUrl);
    }

    _sseNtfy() {
        this.stopPolling();
        if (!this._ntfyTopic) return;
        const url = 'https://ntfy.sh/' + this._ntfyTopic + '/sse';
        this._eventSource = new EventSource(url);
        this._eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event !== 'message') return; // skip keepalive, open

                // ntfy puts the body in "message" field — try to parse it as JSON
                let body = data.message || '';
                body = this._tryParseJson(body) || body;

                // If ntfy interpreted JSON fields, reconstruct from available data
                if (!body && data.title) body = { title: data.title };

                this._addRequest({
                    id: data.id || String(Date.now()),
                    method: 'POST',
                    content_type: '',
                    body: body,
                    timestamp: data.time ? new Date(data.time * 1000) : new Date(),
                    headers: {}
                });
                this.renderRequests();
            } catch { /* ignore */ }
        };
        this._eventSource.onerror = () => {};
    }

    /* ==================================================================
       6. CLOUDFLARE WORKER — self-deployed relay (poll)
       User deploys cf-webhook-worker.js to their CF account.
       POST /channel/new → {id, url, pollUrl}
       POST /channel/{id} ← inSign callbacks
       GET  /channel/{id}/requests → stored requests
       ================================================================== */

    async _createCfWorker() {
        const baseUrl = (this._cfWorkerUrl || '').replace(/\/+$/, '');
        if (!baseUrl) {
            this.renderError('Enter your Cloudflare Worker URL first (deploy cf-webhook-worker.js).');
            return null;
        }
        try {
            const resp = await fetch(baseUrl + '/channel/new', { method: 'POST' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            this._cfChannelId = data.id;
            this._cfBaseUrl = baseUrl;
            this.channelUrl = data.url;
            this._seenIds.clear();
            this._finishCreate();
            return this.channelUrl;
        } catch (err) {
            console.warn('[webhook] CF Worker failed:', err.message);
            this.renderError('CF Worker unavailable: ' + err.message);
            return null;
        }
    }

    _pollCfWorker() {
        this.stopPolling();
        if (!this._cfChannelId || !this._cfBaseUrl) return;
        const poll = async () => {
            try {
                const resp = await fetch(
                    this._cfBaseUrl + '/channel/' + this._cfChannelId + '/requests',
                    { headers: { 'Accept': 'application/json' } }
                );
                if (!resp.ok) return;
                const json = await resp.json();
                const items = json.data || [];
                let hasNew = false;
                for (const item of items) {
                    if (this._seenIds.has(item.id)) continue;
                    this._seenIds.add(item.id);
                    hasNew = true;
                    this._addRequest({
                        id: item.id,
                        method: (item.method || 'POST').toUpperCase(),
                        content_type: item.content_type || '',
                        body: this._tryParseJson(item.body),
                        timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
                        headers: item.headers || {}
                    });
                }
                if (hasNew) this.renderRequests();
            } catch (err) { console.warn('[webhook] CF Worker poll error:', err.message); }
        };
        poll();
        this._pollTimer = setInterval(poll, this._pollInterval);
    }

    /** Set the CF Worker base URL (called from app.js config) */
    setCfWorkerUrl(url) { this._cfWorkerUrl = url; }

    /* ==================================================================
       Shared helpers
       ================================================================== */

    _randomId(len) {
        return Array.from(crypto.getRandomValues(new Uint8Array(len)),
            b => b.toString(36)).join('').substring(0, len);
    }

    _tryParseJson(str) {
        if (typeof str !== 'string') return str;
        try { return JSON.parse(str); } catch { return str; }
    }

    _flattenHeaders(headers) {
        if (!headers || typeof headers !== 'object') return {};
        const flat = {};
        for (const [k, v] of Object.entries(headers)) {
            flat[k] = Array.isArray(v) ? v.join(', ') : String(v);
        }
        return flat;
    }

    _addRequest(req) {
        this.requests.unshift(req);
        if (this.onRequestReceived) this.onRequestReceived(req);
    }

    _finishCreate() {
        this.renderEndpoint();
        if (this.onUrlCreated) this.onUrlCreated(this.channelUrl);
    }

    /* ==================================================================
       Rendering (shared by all providers)
       ================================================================== */

    renderEndpoint() {
        const $urlSection = this.$container.find('.webhook-url-section');
        if ($urlSection.length === 0) return;

        const LABELS = {
            'webhook.site':   { name: 'webhook.site',     mode: 'poll',  cls: 'bg-info' },
            'smee':           { name: 'smee.io',           mode: 'SSE',   cls: 'bg-success' },
            'postbin':        { name: 'postb.in',          mode: 'poll',  cls: 'bg-info' },
            'ntfy':           { name: 'ntfy.sh',           mode: 'SSE',   cls: 'bg-success' },
            'cfworker':       { name: 'CF Worker',         mode: 'poll',  cls: 'bg-warning' },
            'custom':         { name: 'custom',            mode: '',      cls: 'bg-secondary' },
        };
        const info = LABELS[this._provider] || LABELS.custom;
        const badge = info.mode
            ? `<span class="badge ${info.cls}" style="font-size:0.65rem;vertical-align:middle">${info.mode}</span>`
            : '';

        $urlSection.html(`
            <div class="webhook-url-display">
                <i class="bi bi-broadcast text-muted"></i>
                <input type="text" readonly value="${this.escapeHtml(this.channelUrl || '')}" id="webhook-url-input">
                <button class="btn btn-insign btn-insign-sm btn-insign-outline" onclick="window.webhookViewer.copyUrl()" title="Copy URL">
                    <i class="bi bi-clipboard"></i>
                </button>
            </div>
            <div class="text-muted-sm mt-1">
                Use as <code>serverSidecallbackURL</code>. Provider: <strong>${info.name}</strong> ${badge}
            </div>
        `);
    }

    renderRequests() {
        const $list = this.$container.find('.webhook-requests');
        if ($list.length === 0) return;

        if (this.requests.length === 0) {
            $list.html('<div class="text-center text-muted-sm py-4"><i class="bi bi-hourglass-split"></i> Waiting for webhooks...</div>');
            return;
        }

        $list.html(this.requests.map((req, idx) => {
            let bodyDisplay = '';
            if (req.body) {
                if (typeof req.body === 'string') {
                    try { bodyDisplay = JSON.stringify(JSON.parse(req.body), null, 2); }
                    catch { bodyDisplay = req.body; }
                } else {
                    bodyDisplay = JSON.stringify(req.body, null, 2);
                }
            }

            const time = req.timestamp instanceof Date ? req.timestamp.toLocaleTimeString() : new Date().toLocaleTimeString();
            const method = req.method || 'POST';

            const hasHeaders = req.headers && Object.keys(req.headers).length > 0;
            const headersHtml = hasHeaders
                ? Object.entries(req.headers).map(([k, v]) =>
                    `<span class="wh-header-name">${this.escapeHtml(k)}:</span> ${this.escapeHtml(String(v))}`
                ).join('\n')
                : '';

            const detailsId = 'wh-det-' + idx + '-' + Date.now();
            const headersId = 'wh-hdr-' + idx + '-' + Date.now();

            return `
                <div class="webhook-entry">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span>
                            <span class="webhook-method">${method}</span>
                            <span class="webhook-time ms-2">${time}</span>
                        </span>
                        <button class="btn btn-insign btn-insign-sm btn-insign-outline"
                                data-bs-toggle="collapse" data-bs-target="#${detailsId}">
                            <i class="bi bi-chevron-down"></i> Details
                        </button>
                    </div>
                    <div class="collapse" id="${detailsId}">
                        ${hasHeaders ? `
                            <div class="wh-section-toggle text-muted-sm mt-1" data-bs-toggle="collapse" data-bs-target="#${headersId}" style="cursor:pointer;user-select:none">
                                <i class="bi bi-chevron-right wh-chevron"></i> Headers <span class="badge bg-secondary" style="font-size:0.6rem">${Object.keys(req.headers).length}</span>
                            </div>
                            <div class="collapse" id="${headersId}">
                                <pre class="wh-pre wh-headers">${headersHtml}</pre>
                            </div>
                        ` : ''}
                        ${bodyDisplay ? `
                            <div class="text-muted-sm mt-2 mb-1"><i class="bi bi-braces"></i> Body</div>
                            <pre class="wh-pre wh-body">${this.escapeHtml(bodyDisplay)}</pre>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join(''));

        // Rotate chevron on headers collapse toggle
        $list.find('.wh-section-toggle').each(function () {
            const $toggle = $(this);
            const targetId = $toggle.attr('data-bs-target');
            $(targetId).on('show.bs.collapse', () => $toggle.find('.wh-chevron').css('transform', 'rotate(90deg)'));
            $(targetId).on('hide.bs.collapse', () => $toggle.find('.wh-chevron').css('transform', 'rotate(0deg)'));
        });
    }

    renderError(message) {
        const $urlSection = this.$container.find('.webhook-url-section');
        if ($urlSection.length > 0) {
            $urlSection.html(`
                <div class="alert alert-warning alert-insign" role="alert">
                    <i class="bi bi-exclamation-triangle"></i>
                    <div><strong>Webhook service unavailable</strong><br>${message}</div>
                </div>
            `);
        }
    }

    copyUrl() {
        const $input = $('#webhook-url-input');
        if ($input.length > 0) {
            navigator.clipboard.writeText($input.val()).then(() => {
                const $btn = $input.next();
                const origHtml = $btn.html();
                $btn.html('<i class="bi bi-check"></i>');
                setTimeout(() => $btn.html(origHtml), 1500);
            });
        }
    }

    escapeHtml(str) {
        return $('<div>').text(str).html();
    }
};
