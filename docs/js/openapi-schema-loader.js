/* ==========================================================================
   OpenAPI Schema Loader — Fetches /v3/api-docs from the inSign server
   and registers JSON schemas with Monaco Editor for autocomplete.
   ========================================================================== */

window.OpenApiSchemaLoader = class OpenApiSchemaLoader {

    constructor() {
        this.schemas = {};       // camelCase key -> { uri, schema }
        this.loaded = false;
    }

    /**
     * Fetch the OpenAPI spec from the server and extract schemas.
     * @param {string} baseUrl - The inSign server base URL
     * @returns {Promise<boolean>} true if schemas were loaded successfully
     */
    async load(baseUrl, corsProxy) {
        let url = baseUrl.replace(/\/+$/, '') + '/v3/api-docs';
        if (corsProxy) url = corsProxy + encodeURIComponent(url);
        try {
            const resp = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                mode: 'cors'
            });
            if (!resp.ok) return false;

            const spec = await resp.json();
            const rawSchemas = spec?.components?.schemas;
            if (!rawSchemas) return false;

            this.schemas = this._transform(rawSchemas);
            this.loaded = true;
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Transform OpenAPI component schemas into Monaco-compatible format.
     * - Converts $ref from "#/components/schemas/Foo" to "insign://schemas/foo"
     * - Generates camelCase keys from PascalCase schema names
     * - Creates URI identifiers for cross-schema references
     */
    _transform(rawSchemas) {
        const result = {};

        for (const [name, schema] of Object.entries(rawSchemas)) {
            const key = this._toCamelCase(name);
            const uri = 'insign://schemas/' + key;
            const converted = this._convertRefs(structuredClone(schema));
            result[key] = { uri, schema: converted };
        }

        return result;
    }

    /**
     * Recursively convert OpenAPI $ref paths to Monaco schema URIs.
     * "#/components/schemas/FooBar" → "insign://schemas/fooBar"
     */
    _convertRefs(obj) {
        if (obj === null || typeof obj !== 'object') return obj;

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                obj[i] = this._convertRefs(obj[i]);
            }
            return obj;
        }

        if ('$ref' in obj) {
            const ref = obj['$ref'];
            if (ref.startsWith('#/components/schemas/')) {
                const schemaName = ref.substring('#/components/schemas/'.length);
                obj['$ref'] = 'insign://schemas/' + this._toCamelCase(schemaName);
            }
        }

        for (const key of Object.keys(obj)) {
            if (key !== '$ref') {
                obj[key] = this._convertRefs(obj[key]);
            }
        }

        return obj;
    }

    /**
     * Convert PascalCase to camelCase.
     * "ConfigureSession" → "configureSession"
     * "SessionIDInput"   → "sessionIDInput"
     * "QESConfig"        → "qesConfig"
     * "GPSData"          → "gpsData"
     */
    _toCamelCase(name) {
        if (!name) return name;
        // All-uppercase: "GPS" → "gps"
        if (/^[A-Z]+$/.test(name)) return name.toLowerCase();
        // Leading acronym: split before the last uppercase that starts a lowercase-containing word
        // "QESConfig" → "qes" + "Config", "GPSData" → "gps" + "Data"
        // "SessionIDInput" → "s" + "essionIDInput" → falls through to simple case
        const m = name.match(/^([A-Z]+?)([A-Z][a-z].*)$/);
        if (m) {
            return m[1].toLowerCase() + m[2];
        }
        // Simple PascalCase: "ConfigureSession" → "configureSession"
        return name.charAt(0).toLowerCase() + name.slice(1);
    }

    /**
     * Register all loaded schemas with Monaco's JSON language service.
     * Call this after monaco is initialized and schemas are loaded.
     */
    registerWithMonaco(monaco) {
        if (!this.loaded) return;

        const monacoSchemas = [];
        for (const [key, val] of Object.entries(this.schemas)) {
            monacoSchemas.push({
                uri: val.uri,
                fileMatch: [key + '.json'],
                schema: val.schema
            });
        }

        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
            validate: true,
            schemas: monacoSchemas,
            allowComments: false,
            trailingCommas: 'error'
        });
    }

    /**
     * Get a schema by camelCase key.
     */
    get(key) {
        return this.schemas[key] || null;
    }
};
