/**
 * Code Generator Module — Template-based
 *
 * Loads language templates from /codegen-templates/ and renders them with context
 * variables. Complex body-building (Jackson ObjectNode, PHP arrays, Python
 * dicts) is generated programmatically and injected as {{BODY_BUILD}}.
 */
(function () {
  'use strict';

  var LANGUAGES = {
    curl:        { label: 'cURL',            monacoLanguage: 'shell',      template: 'curl.sh' },
    java_spring: { label: 'Java (Spring)',   monacoLanguage: 'java',       template: 'java-spring.java' },
    java_pure:   { label: 'Java (Jackson)',  monacoLanguage: 'java',       template: 'java-jackson.java' },
    java_insign: { label: 'Java (inSign API)', monacoLanguage: 'java',     template: 'java-insign.java' },
    python:      { label: 'Python',          monacoLanguage: 'python',     template: 'python.py' },
    php:         { label: 'PHP',             monacoLanguage: 'php',        template: 'php.php' },
    csharp:      { label: 'C#',              monacoLanguage: 'csharp',     template: 'csharp.cs' },
    nodejs:      { label: 'Node.js',         monacoLanguage: 'javascript', template: 'nodejs.js' }
  };

  // Template cache
  var templateCache = {};

  // ---------------------------------------------------------------------------
  // Property → Java setter mapping for inSign API client
  // ---------------------------------------------------------------------------

  var INSIGN_PROPERTY_MAP = {
    foruser:                        { setter: 'setForuser',                      type: 'String' },
    displayname:                    { setter: 'setDisplayname',                  type: 'String' },
    userEmail:                      { setter: 'setUserEmail',                    type: 'String' },
    userFullName:                   { setter: 'setUserFullName',                 type: 'String' },
    externEnabled:                  { setter: 'setExternEnabled',                type: 'boolean' },
    externEmailBetreff:             { setter: 'setExternEmailBetreff',           type: 'String' },
    externEmailInhalt:              { setter: 'setExternEmailInhalt',            type: 'String' },
    externEditAllowed:              { setter: 'setExternEditAllowed',            type: 'boolean' },
    externCompleteOnFinish:         { setter: 'setExternCompleteOnFinish',       type: 'boolean' },
    externSendDocsOnFinish:         { setter: 'setExternSendDocsOnFinish',       type: 'boolean' },
    externSendDocsOnFinishCustomer: { setter: 'setExternSendDocsOnFinishCustomer', type: 'boolean' },
    externLoginRequired:            { setter: 'setExternLoginRequired',          type: 'boolean' },
    externUploadEnabled:            { setter: 'setExternUploadEnabled',          type: 'boolean' },
    externPhotoUploadEnabled:       { setter: 'setExternPhotoUploadEnabled',     type: 'boolean' },
    serverSidecallbackURL:          { setter: 'setServerSidecallbackURL',        type: 'String' },
    serversideCallbackMethod:       { setter: 'setServersideCallbackMethod',     type: 'String' },
    serversideCallbackContenttype:  { setter: 'setServersideCallbackContenttype',type: 'String' },
    serversideCallbackUsername:     { setter: 'setServersideCallbackUsername',   type: 'String' },
    serversideCallbackPassword:     { setter: 'setServersideCallbackPassword',   type: 'String' },
    callbackURL:                    { setter: 'setCallbackURL',                  type: 'String' },
    alleEmailBetreff:               { setter: 'setAlleEmailBetreff',             type: 'String' },
    alleEmailInhalt:                { setter: 'setAlleEmailInhalt',              type: 'String' },
    senderEmail:                    { setter: 'setSenderEmail',                  type: 'String' },
    replyTo:                        { setter: 'setReplyTo',                      type: 'String' },
    logoExtern:                     { setter: 'setLogoExtern',                   type: 'String' },
    signatureLevel:                 { setter: 'setSignatureLevel',               type: 'String' },
    embedBiometricData:             { setter: 'setEmbedBiometricData',           type: 'boolean' },
    makeFieldsMandatory:            { setter: 'setMakeFieldsMandatory',          type: 'boolean' },
    allSignaturesRequired:          { setter: 'setAllSignaturesRequired',        type: 'boolean' },
    sessionid:                      { setter: 'setSessionid',                    type: 'String' },
    prefix:                         { setter: 'setPrefix',                       type: 'String' },
    template:                       { setter: 'setTemplate',                     type: 'boolean' },
    privateProcess:                 { setter: 'setPrivateProcess',               type: 'boolean' },
    writeAuditReport:               { setter: 'setWriteAuditReport',             type: 'boolean' },
    apitrace:                       { setter: 'setApitrace',                     type: 'boolean' },
    dokumente:                      { setter: null, type: 'documents' },
    documents:                      { setter: null, type: 'documents' }
  };

  // ---------------------------------------------------------------------------
  // Escape helpers
  // ---------------------------------------------------------------------------

  function escapeJava(str) {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  }

  function escapePhp(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function escapeShell(str) {
    return str.replace(/'/g, "'\\''");
  }

  // ---------------------------------------------------------------------------
  // Template engine
  // ---------------------------------------------------------------------------

  /**
   * Render a template string with variables and conditionals.
   *
   * Supports:
   *   {{VAR_NAME}}                    — variable substitution
   *   {{#if VAR_NAME}}...{{/if}}      — conditional block (included if truthy)
   *   {{#unless VAR_NAME}}...{{/unless}} — inverse conditional
   */
  function renderTemplate(template, vars) {
    // Process {{#if VAR}}...{{/if}} blocks
    var result = template.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      function (_, varName, content) {
        return vars[varName] ? content : '';
      }
    );

    // Process {{#unless VAR}}...{{/unless}} blocks
    result = result.replace(
      /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      function (_, varName, content) {
        return vars[varName] ? '' : content;
      }
    );

    // Process {{VAR_NAME}} substitutions
    result = result.replace(/\{\{(\w+)\}\}/g, function (_, varName) {
      return vars[varName] !== undefined ? vars[varName] : '{{' + varName + '}}';
    });

    // Clean up blank lines left by removed conditionals (max 2 consecutive)
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }

  // ---------------------------------------------------------------------------
  // Body builders — generate language-specific code to construct the JSON body
  // ---------------------------------------------------------------------------

  /** Jackson ObjectNode builder for Java */
  function jacksonBuildNode(obj, varName, indent) {
    var pad = new Array(indent + 1).join(' ');
    var lines = [];
    lines.push(pad + 'ObjectNode ' + varName + ' = mapper.createObjectNode();');

    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined) return;

      if (typeof val === 'string') {
        lines.push(pad + varName + '.put("' + escapeJava(key) + '", "' + escapeJava(val) + '");');
      } else if (typeof val === 'boolean' || typeof val === 'number') {
        lines.push(pad + varName + '.put("' + escapeJava(key) + '", ' + val + ');');
      } else if (Array.isArray(val)) {
        var arrVar = key + 'Array';
        lines.push('');
        lines.push(pad + 'ArrayNode ' + arrVar + ' = ' + varName + '.putArray("' + escapeJava(key) + '");');
        val.forEach(function (item, i) {
          if (typeof item === 'object' && item !== null) {
            var itemVar = key + 'Item' + i;
            lines.push(pad + 'ObjectNode ' + itemVar + ' = ' + arrVar + '.addObject();');
            Object.keys(item).forEach(function (ik) {
              var iv = item[ik];
              if (iv === null || iv === undefined) return;
              if (typeof iv === 'string') {
                lines.push(pad + itemVar + '.put("' + escapeJava(ik) + '", "' + escapeJava(iv) + '");');
              } else if (typeof iv === 'boolean' || typeof iv === 'number') {
                lines.push(pad + itemVar + '.put("' + escapeJava(ik) + '", ' + iv + ');');
              } else if (Array.isArray(iv)) {
                var innerArr = ik + 'Arr';
                lines.push(pad + 'ArrayNode ' + innerArr + ' = ' + itemVar + '.putArray("' + escapeJava(ik) + '");');
                iv.forEach(function (sv) {
                  if (typeof sv === 'string') lines.push(pad + innerArr + '.add("' + escapeJava(sv) + '");');
                  else lines.push(pad + innerArr + '.add(' + JSON.stringify(sv) + ');');
                });
              }
            });
          } else if (typeof item === 'string') {
            lines.push(pad + arrVar + '.add("' + escapeJava(item) + '");');
          } else {
            lines.push(pad + arrVar + '.add(' + JSON.stringify(item) + ');');
          }
        });
      } else if (typeof val === 'object') {
        var subVar = key + 'Node';
        lines.push('');
        lines.push(pad + 'ObjectNode ' + subVar + ' = ' + varName + '.putObject("' + escapeJava(key) + '");');
        Object.keys(val).forEach(function (sk) {
          var sv = val[sk];
          if (sv === null || sv === undefined) return;
          if (typeof sv === 'string') lines.push(pad + subVar + '.put("' + escapeJava(sk) + '", "' + escapeJava(sv) + '");');
          else if (typeof sv === 'boolean' || typeof sv === 'number') lines.push(pad + subVar + '.put("' + escapeJava(sk) + '", ' + sv + ');');
        });
      }
    });

    return lines.join('\n');
  }

  /** PHP associative array */
  function phpArray(obj, indent) {
    var pad = new Array(indent + 1).join(' ');
    var innerPad = pad + '    ';

    if (Array.isArray(obj)) {
      var lines = ['['];
      obj.forEach(function (val) {
        if (typeof val === 'string') lines.push(innerPad + "'" + escapePhp(val) + "',");
        else if (typeof val === 'boolean') lines.push(innerPad + val + ',');
        else if (typeof val === 'number') lines.push(innerPad + val + ',');
        else if (typeof val === 'object' && val !== null) lines.push(innerPad + phpArray(val, indent + 4) + ',');
      });
      lines.push(pad + ']');
      return lines.join('\n');
    }

    var lines = ['['];
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined) lines.push(innerPad + "'" + escapePhp(key) + "' => null,");
      else if (typeof val === 'string') lines.push(innerPad + "'" + escapePhp(key) + "' => '" + escapePhp(val) + "',");
      else if (typeof val === 'boolean') lines.push(innerPad + "'" + escapePhp(key) + "' => " + val + ',');
      else if (typeof val === 'number') lines.push(innerPad + "'" + escapePhp(key) + "' => " + val + ',');
      else if (Array.isArray(val) || typeof val === 'object') lines.push(innerPad + "'" + escapePhp(key) + "' => " + phpArray(val, indent + 4) + ',');
    });
    lines.push(pad + ']');
    return lines.join('\n');
  }

  /** Python dict/list literal */
  function pythonDict(obj, indent) {
    var pad = new Array(indent + 1).join(' ');
    var innerPad = pad + '    ';

    if (Array.isArray(obj)) {
      var lines = ['['];
      obj.forEach(function (val) {
        if (typeof val === 'string') lines.push(innerPad + '"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",');
        else if (typeof val === 'boolean') lines.push(innerPad + (val ? 'True' : 'False') + ',');
        else if (typeof val === 'number') lines.push(innerPad + val + ',');
        else if (typeof val === 'object' && val !== null) lines.push(innerPad + pythonDict(val, indent + 4) + ',');
      });
      lines.push(pad + ']');
      return lines.join('\n');
    }

    var lines = ['{'];
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined) lines.push(innerPad + '"' + key + '": None,');
      else if (typeof val === 'string') lines.push(innerPad + '"' + key + '": "' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",');
      else if (typeof val === 'boolean') lines.push(innerPad + '"' + key + '": ' + (val ? 'True' : 'False') + ',');
      else if (typeof val === 'number') lines.push(innerPad + '"' + key + '": ' + val + ',');
      else if (Array.isArray(val) || typeof val === 'object') lines.push(innerPad + '"' + key + '": ' + pythonDict(val, indent + 4) + ',');
    });
    lines.push(pad + '}');
    return lines.join('\n');
  }

  /** C# JsonObject builder */
  function csharpBuildJsonNode(obj, varName, indent) {
    var pad = new Array(indent + 1).join(' ');
    var lines = [];
    lines.push(pad + 'var ' + varName + ' = new JsonObject');
    lines.push(pad + '{');

    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined) return;
      if (typeof val === 'string') lines.push(pad + '    ["' + key + '"] = "' + escapeJava(val) + '",');
      else if (typeof val === 'boolean' || typeof val === 'number') lines.push(pad + '    ["' + key + '"] = ' + val + ',');
      else if (Array.isArray(val)) lines.push(pad + '    ["' + key + '"] = ' + csharpArray(val, indent + 4) + ',');
      else if (typeof val === 'object') lines.push(pad + '    ["' + key + '"] = ' + csharpObject(val, indent + 4) + ',');
    });

    lines.push(pad + '};');
    return lines.join('\n');
  }

  function csharpObject(obj, indent) {
    var pad = new Array(indent + 1).join(' ');
    var lines = ['new JsonObject'];
    lines.push(pad + '{');
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined) return;
      if (typeof val === 'string') lines.push(pad + '    ["' + key + '"] = "' + escapeJava(val) + '",');
      else if (typeof val === 'boolean' || typeof val === 'number') lines.push(pad + '    ["' + key + '"] = ' + val + ',');
      else if (Array.isArray(val)) lines.push(pad + '    ["' + key + '"] = ' + csharpArray(val, indent + 4) + ',');
    });
    lines.push(pad + '}');
    return lines.join('\n');
  }

  function csharpArray(arr, indent) {
    var pad = new Array(indent + 1).join(' ');
    var lines = ['new JsonArray'];
    lines.push(pad + '{');
    arr.forEach(function (val) {
      if (typeof val === 'string') lines.push(pad + '    JsonValue.Create("' + escapeJava(val) + '"),');
      else if (typeof val === 'boolean' || typeof val === 'number') lines.push(pad + '    JsonValue.Create(' + val + '),');
      else if (typeof val === 'object' && val !== null) lines.push(pad + '    ' + csharpObject(val, indent + 4) + ',');
    });
    lines.push(pad + '}');
    return lines.join('\n');
  }

  /** Node.js object literal (indented) */
  function jsObjectLiteral(obj, indent) {
    return JSON.stringify(obj, null, 2).split('\n').map(function (line, i) {
      return i === 0 ? line : new Array(indent + 1).join(' ') + line;
    }).join('\n');
  }

  // ---------------------------------------------------------------------------
  // C# call builder (method-specific)
  // ---------------------------------------------------------------------------

  function csharpCallCode(method, url, hasBody, indent) {
    var pad = new Array(indent + 1).join(' ');
    var m = method.toUpperCase();
    if (m === 'POST') return pad + 'var response = await _client.PostAsync(\n' + pad + '    "' + escapeJava(url) + '", ' + (hasBody ? 'content' : 'null') + ');';
    if (m === 'PUT')  return pad + 'var response = await _client.PutAsync(\n' + pad + '    "' + escapeJava(url) + '", ' + (hasBody ? 'content' : 'null') + ');';
    if (m === 'DELETE') return pad + 'var response = await _client.DeleteAsync(\n' + pad + '    "' + escapeJava(url) + '");';
    return pad + 'var response = await _client.GetAsync(\n' + pad + '    "' + escapeJava(url) + '");';
  }

  // ---------------------------------------------------------------------------
  // inSign API config builder (generates setter calls)
  // ---------------------------------------------------------------------------

  function buildInsignConfig(body) {
    var code = '';
    var docs = null;
    var unmapped = [];

    var docKnownKeys = {
      id: 'setId', displayname: 'setDisplayname', fileURL: 'setFileURL', file: 'setFile',
      mustberead: 'setMustberead', mustbesigned: 'setMustbesigned', mustbereadText: 'setMustbereadText',
      scanSigTags: 'setScanSigTags', allowFormEditing: 'setAllowFormEditing',
      additionalInfo: 'setAdditionalInfo', maybedeletedbyuser: 'setMaybedeletedbyuser',
      disableAppendMode: 'setDisableAppendMode'
    };

    Object.keys(body).forEach(function (key) {
      var val = body[key];
      if (val === null || val === undefined || val === '') return;

      var mapping = INSIGN_PROPERTY_MAP[key];
      if (mapping && mapping.setter) {
        if (mapping.type === 'boolean') code += '        cfg.' + mapping.setter + '(' + val + ');\n';
        else code += '        cfg.' + mapping.setter + '("' + escapeJava(String(val)) + '");\n';
      } else if (mapping && mapping.type === 'documents') {
        docs = val;
      } else {
        unmapped.push(key);
      }
    });

    if (docs && Array.isArray(docs)) {
      code += '\n';
      docs.forEach(function (doc, i) {
        var docVar = 'doc' + (i + 1);
        code += '        // Document ' + (i + 1) + '\n';
        code += '        InSignConfigurationBuilder.DocumentConfiguration ' + docVar +
                ' = InSignConfigurationBuilder.addDokument(cfg);\n';

        Object.keys(doc).forEach(function (dk) {
          var dv = doc[dk];
          if (dv === null || dv === undefined || dv === '') return;
          var setter = docKnownKeys[dk];
          if (setter) {
            if (typeof dv === 'boolean') code += '        ' + docVar + '.' + setter + '(' + dv + ');\n';
            else code += '        ' + docVar + '.' + setter + '("' + escapeJava(String(dv)) + '");\n';
          } else if (dk === 'signatures' && Array.isArray(dv)) {
            dv.forEach(function () {
              code += '        // Signature field: see Javadoc for signature configuration\n';
            });
          }
        });
        code += '\n';
      });
    }

    if (unmapped.length > 0) {
      code += '\n';
      code += '        // Additional fields — consult insign-java-api Javadoc for setters:\n';
      unmapped.forEach(function (key) {
        var val = body[key];
        var setter = 'set' + key.charAt(0).toUpperCase() + key.slice(1);
        if (typeof val === 'boolean') code += '        // cfg.' + setter + '(' + val + ');\n';
        else if (typeof val === 'string') code += '        // cfg.' + setter + '("' + escapeJava(val) + '");\n';
        else code += '        // cfg.' + setter + '(...); // ' + JSON.stringify(val) + '\n';
      });
    }

    return code;
  }

  // ---------------------------------------------------------------------------
  // Build template variables from context
  // ---------------------------------------------------------------------------

  function buildVars(langKey, ctx) {
    var method = (ctx.method || 'GET').toUpperCase();
    var hasBody = ctx.body && method !== 'GET' && method !== 'HEAD';
    var url = ctx.baseUrl + ctx.path;

    var vars = {
      URL:           url,
      BASE_URL:      ctx.baseUrl,
      PATH:          ctx.path,
      METHOD:        method,
      METHOD_LOWER:  method.toLowerCase(),
      USERNAME:      ctx.username || '',
      PASSWORD:      ctx.password || '',
      CONTENT_TYPE:  ctx.contentType || 'application/json',
      HAS_BODY:      hasBody,
      BODY_JSON:     hasBody ? JSON.stringify(ctx.body, null, 2) : '',
      BODY_BUILD:    '',
      CSHARP_CALL:   '',
      INSIGN_CONFIG: ''
    };

    // Generate language-specific body builders
    if (hasBody) {
      switch (langKey) {
        case 'java_pure':
          vars.BODY_BUILD = jacksonBuildNode(ctx.body, 'body', 8);
          break;
        case 'java_spring':
          vars.BODY_BUILD = jacksonBuildNode(ctx.body, 'body', 8);
          break;
        case 'python':
          vars.BODY_BUILD = pythonDict(ctx.body, 4);
          break;
        case 'php':
          vars.BODY_BUILD = phpArray(ctx.body, 0);
          break;
        case 'csharp':
          vars.BODY_BUILD = csharpBuildJsonNode(ctx.body, 'body', 8);
          break;
        case 'nodejs':
          vars.BODY_BUILD = jsObjectLiteral(ctx.body, 2);
          break;
        case 'curl':
          vars.BODY_JSON = escapeShell(JSON.stringify(ctx.body, null, 2));
          break;
      }
    }

    // C# method-specific call
    if (langKey === 'csharp') {
      vars.CSHARP_CALL = csharpCallCode(method, url, hasBody, 12);
    }

    // inSign API config
    if (langKey === 'java_insign') {
      var isSession = ctx.path && ctx.path.replace(/\/+$/, '') === '/configure/session';
      if (!isSession) {
        vars.INSIGN_CONFIG = '        // The inSign Java API is primarily designed for session configuration.\n' +
                             '        // For ' + ctx.path + ', use "Java (Spring)" or "Java (Jackson)" tabs.';
      } else {
        vars.INSIGN_CONFIG = buildInsignConfig(ctx.body || {});
      }
    }

    // Escape values for shell templates
    if (langKey === 'curl') {
      vars.URL = escapeShell(url);
      vars.USERNAME = escapeShell(ctx.username || '');
      vars.PASSWORD = escapeShell(ctx.password || '');
      vars.BASE_URL = escapeShell(ctx.baseUrl);
    }

    return vars;
  }

  // ---------------------------------------------------------------------------
  // Template loading
  // ---------------------------------------------------------------------------

  function loadTemplate(filename) {
    if (templateCache[filename]) {
      return templateCache[filename];
    }

    // Synchronous fetch (acceptable for small template files on same origin)
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'codegen-templates/' + filename, false);
      xhr.send();
      if (xhr.status === 200) {
        templateCache[filename] = xhr.responseText;
        return xhr.responseText;
      }
    } catch (e) {
      // ignore
    }

    return null;
  }

  /** Pre-load all templates asynchronously */
  function preloadTemplates() {
    Object.keys(LANGUAGES).forEach(function (key) {
      var filename = LANGUAGES[key].template;
      if (!templateCache[filename]) {
        try {
          fetch('codegen-templates/' + filename)
            .then(function (r) { return r.ok ? r.text() : null; })
            .then(function (text) { if (text) templateCache[filename] = text; });
        } catch (e) { /* ignore */ }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.CodeGenerator = {
    LANGUAGES: LANGUAGES,
    INSIGN_PROPERTY_MAP: INSIGN_PROPERTY_MAP,

    /** Pre-load templates (call on page init) */
    preload: preloadTemplates,

    /**
     * Generate a code snippet for the given language and request context.
     */
    generate: function (languageKey, context) {
      var lang = LANGUAGES[languageKey];
      if (!lang) return '// Unknown language: ' + languageKey;

      var template = loadTemplate(lang.template);
      if (!template) return '// Template not loaded: ' + lang.template;

      var vars = buildVars(languageKey, context);
      return renderTemplate(template, vars);
    }
  };

  // Auto-preload on script load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preloadTemplates);
  } else {
    preloadTemplates();
  }
})();
