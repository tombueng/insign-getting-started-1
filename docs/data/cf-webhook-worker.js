/**
 * Cloudflare Worker - Webhook Relay for inSign API Explorer
 *
 * Deploy this script to Cloudflare Workers (free tier, no credit card).
 * It acts as a webhook relay: inSign POSTs callbacks to it, your browser
 * polls for stored requests via GET.
 *
 * SETUP:
 *   1. Go to https://dash.cloudflare.com → Workers & Pages → Create
 *   2. Click "Create Worker", paste this script, click "Deploy"
 *   3. Copy the worker URL (e.g. https://my-relay.username.workers.dev)
 *   4. In the API Explorer, select "Cloudflare Worker" provider and paste the URL
 *
 * ENDPOINTS:
 *   POST /channel/{id}         - inSign posts callbacks here (the webhook URL)
 *   GET  /channel/{id}/requests - browser polls for stored requests
 *   POST /channel/new          - browser creates a new channel
 *   DELETE /channel/{id}       - cleanup
 *
 * Data is stored in-memory (Workers global scope) and survives for the
 * lifetime of the Worker isolate (~minutes). For longer persistence,
 * bind a KV namespace (see comments below).
 */

// In-memory store (survives across requests within the same isolate)
// For persistence, replace with KV: env.WEBHOOK_KV.put/get/list
const channels = new Map();

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        // POST /channel/new - create a new channel
        if (request.method === 'POST' && path === '/channel/new') {
            const id = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
            channels.set(id, []);
            const channelUrl = url.origin + '/channel/' + id;
            return jsonResponse({ id, url: channelUrl, pollUrl: channelUrl + '/requests' });
        }

        // Match /channel/{id}...
        const match = path.match(/^\/channel\/([a-z0-9]+)(\/.*)?$/i);
        if (!match) {
            return jsonResponse({
                info: 'inSign Webhook Relay Worker',
                usage: 'POST /channel/new to create a channel',
            });
        }

        const channelId = match[1];
        const sub = match[2] || '';

        // POST /channel/{id} - receive a webhook callback from inSign
        if (request.method === 'POST' && !sub) {
            if (!channels.has(channelId)) channels.set(channelId, []);
            const queue = channels.get(channelId);

            let body = '';
            try { body = await request.text(); } catch { /* empty */ }

            const entry = {
                id: crypto.randomUUID(),
                method: request.method,
                timestamp: new Date().toISOString(),
                content_type: request.headers.get('content-type') || '',
                body: body,
                headers: Object.fromEntries(request.headers),
            };

            queue.push(entry);
            // Keep last 200 entries
            if (queue.length > 200) queue.splice(0, queue.length - 200);

            return jsonResponse({ ok: true, requestId: entry.id });
        }

        // GET /channel/{id}/requests - browser polls for stored requests
        if (request.method === 'GET' && sub === '/requests') {
            const since = url.searchParams.get('since'); // ISO timestamp filter
            const queue = channels.get(channelId) || [];

            let data = queue;
            if (since) {
                const sinceTime = new Date(since).getTime();
                data = queue.filter(r => new Date(r.timestamp).getTime() > sinceTime);
            }

            return jsonResponse({ data, total: data.length });
        }

        // DELETE /channel/{id} - cleanup
        if (request.method === 'DELETE' && !sub) {
            channels.delete(channelId);
            return jsonResponse({ ok: true, msg: 'Channel deleted' });
        }

        return jsonResponse({ error: 'Not found' }, 404);
    },
};
