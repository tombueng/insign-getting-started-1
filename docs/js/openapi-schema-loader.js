/* ==========================================================================
   OpenAPI Schema Loader - Fetches /v3/api-docs from the inSign server
   and registers JSON schemas with Monaco Editor for autocomplete.
   ========================================================================== */

window.OpenApiSchemaLoader = class OpenApiSchemaLoader {

    constructor() {
        this.schemas = {};       // camelCase key -> { uri, schema }
        this.paths = {};         // path -> { method -> { summary, description } }
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
            this._extractPaths(spec.paths);
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
            this._addMarkdownDescriptions(converted);
            result[key] = { uri, schema: converted };
        }

        return result;
    }

    /**
     * Recursively add markdownDescription to every node that has a description.
     * Monaco renders markdownDescription in the suggest details panel with
     * rich formatting. Also adds the property name as a bold header and
     * formats enum values for better readability.
     */
    _addMarkdownDescriptions(obj, propertyName) {
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return;

        if (obj.description && !obj.markdownDescription) {
            let desc = obj.description;

            // Shorten Java FQCN: de.is2.sign.service.rest.json.JSONSignConfig → signConfig
            desc = desc.replace(/de\.is2\.sign\.service\.rest\.json\.JSONSignConfig/g, 'signConfig');

            // Extract "replacement: ..." and "since: ..." metadata from description
            let replacement = null;
            let since = null;

            desc = desc.replace(/[,;.]?\s*replacement:\s*(\S+)/gi, (_, val) => {
                replacement = val.replace(/de\.is2\.sign\.service\.rest\.json\.JSONSignConfig\./g, 'signConfig.');
                return '';
            });
            desc = desc.replace(/[,;.]?\s*since:\s*(\S+)/gi, (_, val) => {
                since = val;
                return '';
            });

            desc = desc.trim();

            const parts = [];
            if (propertyName) parts.push(`**${propertyName}**`);
            if (obj.type) parts.push(`\`${obj.type}\``);
            if (obj.enum) parts.push('- enum: ' + obj.enum.map(v => `\`${v}\``).join(', '));
            if (replacement) parts.push(' \u26a0\ufe0f **Deprecated**');
            if (since) parts.push(`- since: \`${since}\``);
            if (parts.length) parts.push('\n\n');
            if (replacement) parts.push(`> \u26a0\ufe0f Replacement: \`${replacement}\`\n\n`);
            parts.push(desc);

            obj.markdownDescription = parts.join(' ');
            obj.description = desc;
        }

        // Recurse into properties
        if (obj.properties) {
            for (const [key, prop] of Object.entries(obj.properties)) {
                this._addMarkdownDescriptions(prop, key);
            }
        }

        // Recurse into items (arrays)
        if (obj.items) {
            this._addMarkdownDescriptions(obj.items);
        }

        // Recurse into combiners
        for (const combiner of ['allOf', 'oneOf', 'anyOf']) {
            if (Array.isArray(obj[combiner])) {
                for (const sub of obj[combiner]) {
                    this._addMarkdownDescriptions(sub);
                }
            }
        }

        // Recurse into additionalProperties
        if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
            this._addMarkdownDescriptions(obj.additionalProperties);
        }
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
     * Enrich the guiProperties schema inside configureSession (and any schema
     * that references it) with per-property definitions parsed from the
     * feature-descriptions data.  This replaces the server's opaque
     * Map<String,Object> / freeform-string description with a proper typed
     * object so Monaco can offer autocomplete and hover tooltips for every
     * guiProperties key.
     *
     * @param {Array} featureGroups - The featureGroups array from feature-descriptions.json
     */
    enrichGuiProperties(featureGroups) {
        if (!this.loaded || !featureGroups?.length || this._guiPropsEnriched) return;
        this._guiPropsEnriched = true;

        // Build a JSON-Schema "properties" map from the feature groups
        const props = {};
        for (const group of featureGroups) {
            for (const f of group.features) {
                if (f.path !== 'guiProperties') continue;

                const propSchema = {};

                if (f.type === 'bool') {
                    propSchema.type = 'boolean';
                } else if (f.type === 'select' && f.options) {
                    propSchema.enum = f.options;
                } else {
                    propSchema.type = 'string';
                }

                // Build a rich description: label + global property + description
                const parts = [];
                if (f.label) parts.push(`**${f.label}**`);
                if (f.globalProperty) parts.push(`\`${f.globalProperty}\``);
                if (f.desc) parts.push('\n\n' + f.desc);
                propSchema.markdownDescription = parts.join(' - ');
                // Plain description fallback for validators that don't support markdown
                propSchema.description = f.desc || f.label || f.key;

                props[f.key] = propSchema;
            }
        }

        if (!Object.keys(props).length) return;

        const guiSchema = {
            type: 'object',
            description: 'UI behavior properties - toggle features like exit buttons, signing devices, form editing, navigation and more.',
            markdownDescription: 'UI behavior properties - toggle features like exit buttons, signing devices, form editing, navigation and more.\n\nType a property name to see autocomplete suggestions.',
            properties: props,
            additionalProperties: true  // allow unknown keys the spec doesn't list
        };

        // Patch every schema that has a "guiProperties" property
        for (const entry of Object.values(this.schemas)) {
            this._patchGuiProperties(entry.schema, guiSchema);
        }
    }

    /**
     * Recursively find and replace guiProperties definitions in a schema.
     */
    _patchGuiProperties(schema, replacement) {
        if (!schema || typeof schema !== 'object') return;

        if (schema.properties && 'guiProperties' in schema.properties) {
            schema.properties.guiProperties = replacement;
        }

        // Recurse into allOf / oneOf / anyOf
        for (const combiner of ['allOf', 'oneOf', 'anyOf']) {
            if (Array.isArray(schema[combiner])) {
                for (const sub of schema[combiner]) {
                    this._patchGuiProperties(sub, replacement);
                }
            }
        }
    }

    /**
     * Get a schema by camelCase key.
     */
    get(key) {
        return this.schemas[key] || null;
    }

    /**
     * Extract path summaries/descriptions from the OpenAPI spec.
     */
    _extractPaths(paths) {
        if (!paths) return;
        for (const [path, methods] of Object.entries(paths)) {
            this.paths[path] = {};
            for (const [method, info] of Object.entries(methods)) {
                if (typeof info === 'object' && info !== null) {
                    this.paths[path][method.toLowerCase()] = {
                        summary: info.summary || '',
                        description: info.description || ''
                    };
                }
            }
        }
    }

    /**
     * Look up a description for a given API path and method.
     * Returns { summary, description } or null.
     * Handles paths with query strings by stripping them for lookup.
     */
    getPathInfo(path, method) {
        const cleanPath = path.split('?')[0];
        const entry = this.paths[cleanPath];
        if (!entry) return null;
        const m = (method || 'post').toLowerCase();
        return entry[m] || Object.values(entry)[0] || null;
    }
};
