/* ==========================================================================
   inSign API Client — Browser-based fetch() wrapper with Basic Auth
   ========================================================================== */

window.InsignApiClient = class InsignApiClient {

    constructor(baseUrl, username, password) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.username = username;
        this.password = password;
        this.useCorsProxy = false;
        this.corsProxyUrl = 'https://corsproxy.io/?';
    }

    /**
     * Get the Authorization header value
     */
    getAuthHeader() {
        return 'Basic ' + btoa(this.username + ':' + this.password);
    }

    /**
     * Build the full URL, optionally through a CORS proxy
     */
    buildUrl(path, queryParams) {
        let url = this.baseUrl + (path.startsWith('/') ? path : '/' + path);
        if (queryParams && Object.keys(queryParams).length > 0) {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(queryParams)) {
                if (value !== undefined && value !== null && value !== '') {
                    params.append(key, value);
                }
            }
            const qs = params.toString();
            if (qs) url += '?' + qs;
        }
        if (this.useCorsProxy) {
            url = this.corsProxyUrl + encodeURIComponent(url);
        }
        return url;
    }

    /**
     * Make an API call
     * @param {string} method - HTTP method (GET, POST, DELETE, PUT)
     * @param {string} path - API path (e.g. '/configure/session')
     * @param {Object} [options] - Optional settings
     * @param {Object} [options.body] - Request body (will be JSON.stringify'd)
     * @param {Object} [options.queryParams] - URL query parameters
     * @param {string} [options.contentType] - Content-Type header (default: application/json)
     * @param {FormData} [options.formData] - FormData for multipart uploads (overrides body)
     * @param {boolean} [options.blobResponse] - If true, returns response as Blob
     * @returns {Promise<ApiResponse>}
     */
    async call(method, path, options = {}) {
        const {
            body = null,
            queryParams = null,
            contentType = 'application/json',
            accept = 'application/json',
            formData = null,
            blobResponse = false
        } = options;

        const url = this.buildUrl(path, queryParams);

        const headers = {
            'Authorization': this.getAuthHeader(),
            'Accept': accept
        };

        const fetchOptions = {
            method: method.toUpperCase(),
            headers,
            mode: 'cors'
        };

        if (formData) {
            // For multipart/form-data, let the browser set Content-Type with boundary
            fetchOptions.body = formData;
        } else if (body !== null && method.toUpperCase() !== 'GET') {
            headers['Content-Type'] = contentType;
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const startTime = performance.now();

        try {
            const response = await fetch(url, fetchOptions);
            const duration = Math.round(performance.now() - startTime);

            const responseHeaders = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            let responseBody;
            let rawText = '';

            if (blobResponse && response.ok) {
                responseBody = await response.blob();
                rawText = `[Binary data: ${responseBody.size} bytes, type: ${responseBody.type}]`;
            } else {
                rawText = await response.text();
                try {
                    responseBody = JSON.parse(rawText);
                } catch {
                    responseBody = rawText;
                }
            }

            return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseBody,
                raw: rawText,
                duration,
                blob: blobResponse && response.ok ? responseBody : null
            };

        } catch (err) {
            const duration = Math.round(performance.now() - startTime);

            // Detect CORS errors
            if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('NetworkError'))) {
                return {
                    ok: false,
                    status: 0,
                    statusText: 'CORS / Network Error',
                    headers: {},
                    body: {
                        error: 'CORS_OR_NETWORK_ERROR',
                        message: 'Could not reach the API server. This is most likely a CORS (Cross-Origin Resource Sharing) issue — your browser blocks requests from this page to the inSign server because the server has not allowed this origin.',
                        fixes: [
                            '1. Quick fix: Enable the "CORS proxy" toggle in the sidebar (routes requests through a proxy)',
                            '2. Server fix: Set the inSign property cors.allowed-origins=* (or your specific origin) in the inSign server configuration',
                            '3. Browser fix: Install a CORS browser extension (e.g. "CORS Unblock" for Chrome/Firefox)',
                            '4. If running locally: serve this page via HTTP (npx serve docs) instead of file://'
                        ],
                        originalError: err.message
                    },
                    raw: err.message,
                    duration,
                    blob: null
                };
            }

            return {
                ok: false,
                status: 0,
                statusText: 'Error',
                headers: {},
                body: { error: err.name, message: err.message },
                raw: err.toString(),
                duration,
                blob: null
            };
        }
    }

    /**
     * Convenience: POST with JSON body
     */
    async post(path, body, queryParams) {
        return this.call('POST', path, { body, queryParams });
    }

    /**
     * Convenience: GET request
     */
    async get(path, queryParams, options) {
        return this.call('GET', path, { queryParams, ...options });
    }

    /**
     * Convenience: Download as blob
     */
    async download(path, body, queryParams) {
        return this.call('POST', path, { body, queryParams, blobResponse: true });
    }

    /**
     * Convenience: Upload file via multipart/form-data
     */
    async upload(path, file, queryFields = {}) {
        const formData = new FormData();
        formData.append('file', file);
        return this.call('POST', path, { formData, queryParams: queryFields });
    }

    /**
     * Get a display-friendly representation of current headers
     */
    getHeadersDisplay(contentType = 'application/json') {
        return [
            { name: 'Authorization', value: 'Basic ' + btoa(this.username + ':' + this.password) },
            { name: 'Content-Type', value: contentType },
            { name: 'Accept', value: 'application/json' }
        ];
    }

    /**
     * Get context object for code generation
     */
    getCodeContext(method, path, body) {
        return {
            method,
            baseUrl: this.baseUrl,
            path,
            url: this.baseUrl + path,
            username: this.username,
            password: this.password,
            body,
            contentType: 'application/json'
        };
    }
};
