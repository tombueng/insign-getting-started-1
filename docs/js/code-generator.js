/**
 * Code Generator Module - Template-based
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

  // Known InSignGUIConstants enum values (from InSignGUIConstants.java source)
  var INSIGN_GUI_CONSTANTS = [
    'changeSessionNameOnFirstUpload', 'guiActionFinishIgnoresignstatus',
    'vorgangsverwaltungPrivateProcess', 'vorgangsverwaltungPrivateProcessGroup',
    'guiAllowChangeSmsEmail', 'guiOnnextopentosign', 'guiUpdateThumbSignHint',
    'guiAfterSignOpenNextSignatureField', 'guiDisableMonitorChoice',
    'guiSignatureQualityscaleDouble', 'guiHintAllsigned', 'guiHintAllsignedSkipSaveDialog',
    'signAvailable', 'addformfieldAvailable', 'addformfieldFoto', 'addFormFavDefault',
    'dualscreenFavDefault', 'dualscreenGuiAvailable',
    'addformfieldAllowAes', 'addformfieldAllowAesSms', 'addformfieldAllowSes',
    'addformfieldAllowQes', 'addformfieldAllowEveryOption',
    'formfieldSizeSes', 'formfieldSizeAessms', 'formfieldSizeAes',
    'formfieldSizeQes', 'formfieldSizeQesIdnow',
    'zoomAvailable', 'pageOverlayAvailable', 'externPageOverlayAvailable',
    'addMarkAvailable', 'nextMarkAvailable', 'nextSignAvailable',
    'deleteSignAvailable', 'deleteSignFavDefault', 'vorgangDialogAvailable',
    'zoomFavDefault', 'pageOverlayFavDefault', 'addMarkFavDefault',
    'nextMarkFavDefault', 'nextSignFavDefault', 'externDelegateAvailable',
    'externAvailable', 'navtoolbarAvailable', 'externMultiAvailable',
    'externMultiShowOtherSignaturefields', 'externMultiOrderDefault',
    'saveDocAvailable', 'aushaendigenMustbereadAvailable', 'aushaendigenAvailable',
    'aushaendigenFile', 'aushaendigenPaper', 'aushaendigenMail', 'aushaendigenSms',
    'aushaendigenDialogEditable', 'finishAvailable', 'finishFile', 'finishPaper', 'finishMail',
    'externFavDefault', 'externExitEnabled', 'addDocFavDefault', 'addFotoFavDefault',
    'saveDocFavDefault', 'aushaendigenFavDefault', 'aushaendigenMustbereadFavDefault',
    'aushaendigenMustbereadIgnoreSignature', 'finishFavDefault',
    'burgerAvailable', 'settingsAvailable', 'aboutAvailable', 'helpAvailable',
    'saveAsTemplateAvailable', 'exitAvailable', 'exitResetSignature',
    'searchAvailable', 'settingsFavDefault', 'aboutFavDefault', 'helpFavDefault',
    'saveAsTemplateFavDefault', 'exitFavDefault', 'searchFavDefault',
    'guiLeavepagewarning', 'guiVorgangsverwaltungenabled', 'pdfSaveAlert',
    'vorgangsverwaltungDownloadBiometricDocsAvailable', 'vorgangsverwaltungDeleteAvailable',
    'guiAutoRetrieveProcess', 'guiFertigbuttonSkipModalDialog',
    'guiFertigbuttonSkipModalDialogExtern', 'guiNoGPS',
    'guiProgressEnabled', 'guiProgressOptional',
    'guiSessionDisplaynameAndCustomerEditable', 'guiEmbeddedHotspotdisabled',
    'customerFocusSigField', 'externSaveDocAvailable',
    'vorgangsverwaltungActionAvailable', 'vorgangsverwaltungActionFavDefault',
    'helpUrl', 'settingsFirmAvailable', 'settingsNameAvailable',
    'settingsLogoUploadAvailable', 'externRejectAvailable',
    'settingsExternMultiShowOtherSignaturefieldsAvailable',
    'settingsOtpActivationAvailable', 'settingsCompanystampUploadAvailable',
    'settingsSignaturestampUploadAvailable', 'settingsForcedSigfieldsAvailable',
    'settingsTrustlinkAvailable', 'settingsTimestampAvailable',
    'settingsRealnameAvailable', 'settingsRealLocationAvailable',
    'settingsForcecolorAvailable', 'settingsSaveForAutocompleteAvailable',
    'settingsAuditreportAvailable', 'settingsOwnMailasSenderAvailable',
    'settingsPrivacyLinkAvailable', 'settingsImprintLinkAvailable',
    'guiTemplateWeblinkAvailable', 'settingsMaskAuditreportAvailable',
    'keepmessagetokens', 'settingsSubstituteAvailable',
    'settingsExaminerMailCommentAvailable',
    'restarchiveSettingsAvailable', 'restarchiveSettingsFavDefault',
    'serialProcessAvailable', 'serialProcessFavDefault',
    'hideApisessionsInVvw', 'archivePagesize', 'vorgangsverwaltungPagesize',
    'vorgangsverwaltungExternDelayReminderAvailable',
    'guiFertigbuttonModalDialogExternSkipSendMail',
    'changeOrderDocumentAvailable', 'batchSignatureAvailable',
    'settingsQuicktipsResetAvailable', 'quicktipsEnabled',
    'rejectAvailable', 'rejectFavDefault', 'offlineButtonAvailable',
    'faviconIco', 'faviconPng', 'faviconSvg',
    'quicktipsTutorialEnabled', 'externUseDomain', 'externShowAssigned'
  ];
  var INSIGN_GUI_CONSTANTS_SET = {};
  INSIGN_GUI_CONSTANTS.forEach(function (c) { INSIGN_GUI_CONSTANTS_SET[c] = true; });

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
    documents:                      { setter: null, type: 'documents' },
    guiProperties:                  { setter: null, type: 'guiProperties' },
    signConfig:                     { setter: null, type: 'signConfig' }
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
   *   {{VAR_NAME}}                    - variable substitution
   *   {{#if VAR_NAME}}...{{/if}}      - conditional block (included if truthy)
   *   {{#unless VAR_NAME}}...{{/unless}} - inverse conditional
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
  // Body builders - generate language-specific code to construct the JSON body
  // ---------------------------------------------------------------------------

  /** Jackson ObjectNode builder for Java */
  function jacksonBuildNode(obj, varName, indent, docs, langKey) {
    var pad = new Array(indent + 1).join(' ');
    var lines = [];
    lines.push(pad + 'ObjectNode ' + varName + ' = mapper.createObjectNode();');

    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined) return;

      if (docs) {
        var dc = getDocComment(key, langKey || 'java_pure');
        if (dc) lines.push(pad + dc);
      }

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
              if (docs) { var dc2 = getDocComment(ik, langKey || 'java_pure'); if (dc2) lines.push(pad + dc2); }
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
          if (docs) { var dc3 = getDocComment(sk, langKey || 'java_pure'); if (dc3) lines.push(pad + dc3); }
          if (typeof sv === 'string') lines.push(pad + subVar + '.put("' + escapeJava(sk) + '", "' + escapeJava(sv) + '");');
          else if (typeof sv === 'boolean' || typeof sv === 'number') lines.push(pad + subVar + '.put("' + escapeJava(sk) + '", ' + sv + ');');
        });
      }
    });

    return lines.join('\n');
  }

  /** PHP associative array */
  function phpArray(obj, indent, docs) {
    var pad = new Array(indent + 1).join(' ');
    var innerPad = pad + '    ';

    if (Array.isArray(obj)) {
      var lines = ['['];
      obj.forEach(function (val) {
        if (typeof val === 'string') lines.push(innerPad + "'" + escapePhp(val) + "',");
        else if (typeof val === 'boolean') lines.push(innerPad + val + ',');
        else if (typeof val === 'number') lines.push(innerPad + val + ',');
        else if (typeof val === 'object' && val !== null) lines.push(innerPad + phpArray(val, indent + 4, docs) + ',');
      });
      lines.push(pad + ']');
      return lines.join('\n');
    }

    var lines = ['['];
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (docs) { var dc = getDocComment(key, 'php'); if (dc) lines.push(innerPad + dc); }
      if (val === null || val === undefined) lines.push(innerPad + "'" + escapePhp(key) + "' => null,");
      else if (typeof val === 'string') lines.push(innerPad + "'" + escapePhp(key) + "' => '" + escapePhp(val) + "',");
      else if (typeof val === 'boolean') lines.push(innerPad + "'" + escapePhp(key) + "' => " + val + ',');
      else if (typeof val === 'number') lines.push(innerPad + "'" + escapePhp(key) + "' => " + val + ',');
      else if (Array.isArray(val) || typeof val === 'object') lines.push(innerPad + "'" + escapePhp(key) + "' => " + phpArray(val, indent + 4, docs) + ',');
    });
    lines.push(pad + ']');
    return lines.join('\n');
  }

  /** Python dict/list literal */
  function pythonDict(obj, indent, docs) {
    var pad = new Array(indent + 1).join(' ');
    var innerPad = pad + '    ';

    if (Array.isArray(obj)) {
      var lines = ['['];
      obj.forEach(function (val) {
        if (typeof val === 'string') lines.push(innerPad + '"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",');
        else if (typeof val === 'boolean') lines.push(innerPad + (val ? 'True' : 'False') + ',');
        else if (typeof val === 'number') lines.push(innerPad + val + ',');
        else if (typeof val === 'object' && val !== null) lines.push(innerPad + pythonDict(val, indent + 4, docs) + ',');
      });
      lines.push(pad + ']');
      return lines.join('\n');
    }

    var lines = ['{'];
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (docs) { var dc = getDocComment(key, 'python'); if (dc) lines.push(innerPad + dc); }
      if (val === null || val === undefined) lines.push(innerPad + '"' + key + '": None,');
      else if (typeof val === 'string') lines.push(innerPad + '"' + key + '": "' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",');
      else if (typeof val === 'boolean') lines.push(innerPad + '"' + key + '": ' + (val ? 'True' : 'False') + ',');
      else if (typeof val === 'number') lines.push(innerPad + '"' + key + '": ' + val + ',');
      else if (Array.isArray(val) || typeof val === 'object') lines.push(innerPad + '"' + key + '": ' + pythonDict(val, indent + 4, docs) + ',');
    });
    lines.push(pad + '}');
    return lines.join('\n');
  }

  /** C# JsonObject builder */
  function csharpBuildJsonNode(obj, varName, indent, docs) {
    var pad = new Array(indent + 1).join(' ');
    var lines = [];
    lines.push(pad + 'var ' + varName + ' = new JsonObject');
    lines.push(pad + '{');

    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined) return;
      if (docs) { var dc = getDocComment(key, 'csharp'); if (dc) lines.push(pad + '    ' + dc); }
      if (typeof val === 'string') lines.push(pad + '    ["' + key + '"] = "' + escapeJava(val) + '",');
      else if (typeof val === 'boolean' || typeof val === 'number') lines.push(pad + '    ["' + key + '"] = ' + val + ',');
      else if (Array.isArray(val)) lines.push(pad + '    ["' + key + '"] = ' + csharpArray(val, indent + 4, docs) + ',');
      else if (typeof val === 'object') lines.push(pad + '    ["' + key + '"] = ' + csharpObject(val, indent + 4, docs) + ',');
    });

    lines.push(pad + '};');
    return lines.join('\n');
  }

  function csharpObject(obj, indent, docs) {
    var pad = new Array(indent + 1).join(' ');
    var lines = ['new JsonObject'];
    lines.push(pad + '{');
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined) return;
      if (docs) { var dc = getDocComment(key, 'csharp'); if (dc) lines.push(pad + '    ' + dc); }
      if (typeof val === 'string') lines.push(pad + '    ["' + key + '"] = "' + escapeJava(val) + '",');
      else if (typeof val === 'boolean' || typeof val === 'number') lines.push(pad + '    ["' + key + '"] = ' + val + ',');
      else if (Array.isArray(val)) lines.push(pad + '    ["' + key + '"] = ' + csharpArray(val, indent + 4, docs) + ',');
    });
    lines.push(pad + '}');
    return lines.join('\n');
  }

  function csharpArray(arr, indent, docs) {
    var pad = new Array(indent + 1).join(' ');
    var lines = ['new JsonArray'];
    lines.push(pad + '{');
    arr.forEach(function (val) {
      if (typeof val === 'string') lines.push(pad + '    JsonValue.Create("' + escapeJava(val) + '"),');
      else if (typeof val === 'boolean' || typeof val === 'number') lines.push(pad + '    JsonValue.Create(' + val + '),');
      else if (typeof val === 'object' && val !== null) lines.push(pad + '    ' + csharpObject(val, indent + 4, docs) + ',');
    });
    lines.push(pad + '}');
    return lines.join('\n');
  }

  /** Node.js object literal (indented) */
  function jsObjectLiteral(obj, indent, docs) {
    var json = JSON.stringify(obj, null, 2);
    if (!docs) {
      return json.split('\n').map(function (line, i) {
        return i === 0 ? line : new Array(indent + 1).join(' ') + line;
      }).join('\n');
    }
    // With docs: insert comment lines before each top-level key
    var pad = new Array(indent + 1).join(' ');
    var result = [];
    json.split('\n').forEach(function (line, i) {
      var keyMatch = line.match(/^\s+"(\w+)":/);
      if (keyMatch) {
        var dc = getDocComment(keyMatch[1], 'nodejs');
        if (dc) result.push(pad + dc);
      }
      result.push(i === 0 ? line : pad + line);
    });
    return result.join('\n');
  }

  // ---------------------------------------------------------------------------
  // C# call builder (method-specific)
  // ---------------------------------------------------------------------------

  function csharpCallCode(method, url, hasBody, indent) {
    var pad = new Array(indent + 1).join(' ');
    var m = method.toUpperCase();
    if (m === 'POST') return pad + 'var response = await http.PostAsync(\n' + pad + '    "' + escapeJava(url) + '", ' + (hasBody ? 'content' : 'null') + ');';
    if (m === 'PUT')  return pad + 'var response = await http.PutAsync(\n' + pad + '    "' + escapeJava(url) + '", ' + (hasBody ? 'content' : 'null') + ');';
    if (m === 'DELETE') return pad + 'var response = await http.DeleteAsync(\n' + pad + '    "' + escapeJava(url) + '");';
    return pad + 'var response = await http.GetAsync(\n' + pad + '    "' + escapeJava(url) + '");';
  }

  // ---------------------------------------------------------------------------
  // inSign API config builder (generates setter calls)
  // ---------------------------------------------------------------------------

  /** Generate setter name from a camelCase property key: exitAvailable → setExitAvailable */
  function setterName(key) {
    return 'set' + key.charAt(0).toUpperCase() + key.slice(1);
  }

  /** Generate signConfig setter calls (JSONSignConfig has typed setters) */
  function buildSignConfigSetters(obj, indent, includeDocs, langKey) {
    var pad = new Array(indent + 1).join(' ');
    var code = '';
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined || val === '') return;
      if (includeDocs) { var dc = getDocComment(key, langKey); if (dc) code += pad + dc + '\n'; }
      var setter = setterName(key);
      if (typeof val === 'boolean') {
        code += pad + 'signConfig.' + setter + '(' + val + ');\n';
      } else if (typeof val === 'number') {
        code += pad + 'signConfig.' + setter + '(' + val + ');\n';
      } else if (typeof val === 'string') {
        code += pad + 'signConfig.' + setter + '("' + escapeJava(val) + '");\n';
      }
    });
    return code;
  }

  /** Generate addGUIProperty calls (guiProperties is a HashMap<String, Object>) */
  function buildGuiPropertyCalls(obj, indent, includeDocs, langKey) {
    var pad = new Array(indent + 1).join(' ');
    var code = '';
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val === null || val === undefined || val === '') return;
      if (includeDocs) { var dc = getDocComment(key, langKey); if (dc) code += pad + dc + '\n'; }
      if (typeof val === 'boolean') {
        var keyArg = INSIGN_GUI_CONSTANTS_SET[key]
          ? 'InSignGUIConstants.' + key
          : '"' + escapeJava(key) + '"';
        code += pad + 'InSignConfigurationBuilder.addGUIProperty(configData, ' + keyArg + ', ' + val + ');\n';
      } else if (typeof val === 'string') {
        // String-valued GUI properties (messages, logos) - put directly into the map
        code += pad + 'guiProps.put("' + escapeJava(key) + '", "' + escapeJava(val) + '");\n';
      }
    });
    return code;
  }

  function buildInsignConfig(body, includeDocs, langKey) {
    var code = '';
    var needsSession = false;
    var needsSignConfig = false;
    var needsGuiProps = false;
    var docsList = null;
    var guiProps = null;
    var signCfg = null;
    var unmapped = [];

    var docKnownKeys = {
      id: 'setId', displayname: 'setDisplayname', fileURL: 'setFileURL', file: 'setFile',
      mustberead: 'setMustberead', mustbesigned: 'setMustbesigned', mustbereadText: 'setMustbereadText',
      scanSigTags: 'setScanSigTags', allowFormEditing: 'setAllowFormEditing',
      additionalInfo: 'setAdditionalInfo', maybedeletedbyuser: 'setMaybedeletedbyuser',
      disableAppendMode: 'setDisableAppendMode'
    };

    // Classify properties
    var rootLines = [];
    Object.keys(body).forEach(function (key) {
      var val = body[key];
      if (val === null || val === undefined || val === '') return;

      var mapping = INSIGN_PROPERTY_MAP[key];
      if (mapping && mapping.setter) {
        needsSession = true;
        if (includeDocs) {
          var dc = getDocComment(key, langKey);
          if (dc) rootLines.push('        ' + dc);
        }
        if (mapping.type === 'boolean') rootLines.push('        session.' + mapping.setter + '(' + val + ');');
        else rootLines.push('        session.' + mapping.setter + '("' + escapeJava(String(val)) + '");');
      } else if (mapping && mapping.type === 'documents') {
        docsList = val;
      } else if (mapping && mapping.type === 'guiProperties') {
        guiProps = val;
      } else if (mapping && mapping.type === 'signConfig') {
        signCfg = val;
      } else {
        unmapped.push(key);
      }
    });

    if (signCfg && typeof signCfg === 'object') needsSignConfig = true;
    if (guiProps && typeof guiProps === 'object') {
      // Check if any string-valued props need direct map access
      Object.keys(guiProps).forEach(function (k) {
        if (typeof guiProps[k] === 'string') needsGuiProps = true;
      });
    }

    // Emit local variable declarations
    if (needsSession || needsSignConfig || needsGuiProps || unmapped.length > 0) {
      code += '        var session = configData.getConfigureSession();\n';
    }
    if (needsSignConfig) {
      code += '        var signConfig = session.getSignConfig();\n';
    }
    if (needsGuiProps) {
      code += '        var guiProps = session.getGuiProperties();\n';
    }
    if (needsSession || needsSignConfig || needsGuiProps) code += '\n';

    // Root-level session properties
    if (rootLines.length > 0) {
      code += rootLines.join('\n') + '\n';
    }

    // guiProperties → InSignConfigurationBuilder.addGUIProperty / guiProps.put
    if (guiProps && typeof guiProps === 'object') {
      code += '\n        // GUI properties\n';
      code += buildGuiPropertyCalls(guiProps, 8, includeDocs, langKey);
    }

    // signConfig → signConfig.setXxx(...)
    if (signCfg && typeof signCfg === 'object') {
      code += '\n        // Sign configuration (delivery channels, pairing, etc.)\n';
      code += buildSignConfigSetters(signCfg, 8, includeDocs, langKey);
    }

    if (docsList && Array.isArray(docsList)) {
      code += '\n';
      docsList.forEach(function (doc, i) {
        var docVar = 'doc' + (i + 1);
        var hasFileURL = doc.fileURL && doc.fileURL !== '';
        code += '        // Document ' + (i + 1) + '\n';

        if (hasFileURL) {
          code += '        var ' + docVar + ' = InSignConfigurationBuilder.addDokument(configData, "' +
                  escapeJava(doc.id || 'doc' + (i + 1)) + '", "' + escapeJava(doc.fileURL) + '");\n';
        } else {
          code += '        var ' + docVar + ' = InSignConfigurationBuilder.addDokumentInline(configData, "' +
                  escapeJava(doc.id || 'doc' + (i + 1)) + '", docBytes' + (i + 1) + ');\n';
        }

        Object.keys(doc).forEach(function (dk) {
          if (dk === 'id' || dk === 'fileURL' || dk === 'file') return;
          var dv = doc[dk];
          if (dv === null || dv === undefined || dv === '') return;
          var setter = docKnownKeys[dk];
          if (setter) {
            if (typeof dv === 'boolean') code += '        ' + docVar + '.' + setter + '(' + dv + ');\n';
            else code += '        ' + docVar + '.' + setter + '("' + escapeJava(String(dv)) + '");\n';
          } else if (dk === 'signatures' && Array.isArray(dv)) {
            dv.forEach(function () {
              code += '        // Signature field: see InSignConfigurationBuilder.addSignature()\n';
            });
          }
        });
        code += '\n';
      });
    }

    if (unmapped.length > 0) {
      code += '\n';
      code += '        // Additional fields - consult insign-java-api Javadoc for setters:\n';
      unmapped.forEach(function (key) {
        var val = body[key];
        var setter = setterName(key);
        if (typeof val === 'boolean') code += '        // session.' + setter + '(' + val + ');\n';
        else if (typeof val === 'string') code += '        // session.' + setter + '("' + escapeJava(val) + '");\n';
        else code += '        // session.' + setter + '(...); // ' + JSON.stringify(val) + '\n';
      });
    }

    return code;
  }

  // ---------------------------------------------------------------------------
  // Build template variables from context
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // <filedata> handling - replaces placeholder with fileURL (active code) and
  // generates a commented alternative showing base64 file-from-disk approach
  // ---------------------------------------------------------------------------

  /**
   * Check if body contains any <filedata> placeholder in documents[].file,
   * and return a copy with file replaced by fileURL, plus the comment block.
   */
  function resolveFiledata(body, ctx) {
    if (!body || !body.documents || !Array.isArray(body.documents)) return { body: body, hasFiledata: false };

    var found = false;
    var resolved = JSON.parse(JSON.stringify(body));
    for (var i = 0; i < resolved.documents.length; i++) {
      if (resolved.documents[i].file === '<filedata>') {
        found = true;
        delete resolved.documents[i].file;
        resolved.documents[i].fileURL = ctx.documentUrl || 'https://nowhere.invalid/document.pdf';
      }
    }
    return { body: resolved, hasFiledata: found };
  }

  /** Generate language-specific commented code for reading a file from disk and base64-encoding it */
  function filedataComment(langKey, filename) {
    var fn = filename || 'document.pdf';
    switch (langKey) {
      case 'curl':
        return '# --- Alternative: embed file as base64 instead of fileURL ---\n' +
               '# Replace "fileURL" with "file" in the JSON and set its value to base64:\n' +
               '# FILE_B64=$(base64 -w 0 "' + fn + '")\n' +
               '# Then use:  "file": "\'$FILE_B64\'"  instead of "fileURL"\n';
      case 'python':
        return '    # --- Alternative: embed file as base64 instead of fileURL ---\n' +
               '    # import base64\n' +
               '    # with open("' + fn + '", "rb") as f:\n' +
               '    #     file_b64 = base64.b64encode(f.read()).decode()\n' +
               '    # Then replace "fileURL" with: "file": file_b64\n';
      case 'nodejs':
        return '  // --- Alternative: embed file as base64 instead of fileURL ---\n' +
               '  // const fileB64 = require("fs").readFileSync("' + fn + '").toString("base64");\n' +
               '  // Then replace "fileURL" with: "file": fileB64\n';
      case 'php':
        return '// --- Alternative: embed file as base64 instead of fileURL ---\n' +
               '// $fileB64 = base64_encode(file_get_contents("' + fn + '"));\n' +
               '// Then replace "fileURL" with: "file" => $fileB64\n';
      case 'csharp':
        return '// --- Alternative: embed file as base64 instead of fileURL ---\n' +
               '// var fileB64 = Convert.ToBase64String(File.ReadAllBytes("' + fn + '"));\n' +
               '// Then replace "fileURL" with: ["file"] = fileB64\n';
      case 'java_pure':
      case 'java_spring':
        return '        // --- Alternative: embed file as base64 instead of fileURL ---\n' +
               '        // byte[] fileBytes = java.nio.file.Files.readAllBytes(java.nio.file.Path.of("' + fn + '"));\n' +
               '        // String fileB64 = java.util.Base64.getEncoder().encodeToString(fileBytes);\n' +
               '        // Then replace "fileURL" with: .put("file", fileB64)\n';
      case 'java_insign':
        return '        // --- Alternative: load file from disk instead of fileURL ---\n' +
               '        // doc.setFile(java.nio.file.Files.newInputStream(java.nio.file.Path.of("' + fn + '")));\n';
      default:
        return '';
    }
  }

  function buildVars(langKey, ctx) {
    var method = (ctx.method || 'GET').toUpperCase();
    var hasBody = ctx.body && method !== 'GET' && method !== 'HEAD';
    var url = ctx.baseUrl + ctx.path;
    var includeDocs = ctx.includeDocs || false;
    var includeSamples = ctx.includeSamples || false;
    if (includeDocs || includeSamples) getPropertyCatalog(); // ensure docs are loaded

    // Resolve <filedata> placeholders: replace with fileURL for runnable code
    var filedataResult = hasBody ? resolveFiledata(ctx.body, ctx) : { body: ctx.body, hasFiledata: false };
    var bodyForBuild = filedataResult.body;

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
      BODY_JSON:     hasBody ? JSON.stringify(bodyForBuild, null, 2) : '',
      BODY_BUILD:    '',
      CSHARP_CALL:   '',
      INSIGN_CONFIG: '',
      FILE_COMMENT:  filedataResult.hasFiledata ? filedataComment(langKey, ctx.documentFilename) : ''
    };

    // Generate language-specific body builders
    if (hasBody) {
      switch (langKey) {
        case 'java_pure':
          vars.BODY_BUILD = jacksonBuildNode(bodyForBuild, 'body', 8, includeDocs, langKey);
          break;
        case 'java_spring':
          vars.BODY_BUILD = jacksonBuildNode(bodyForBuild, 'body', 8, includeDocs, langKey);
          break;
        case 'python':
          vars.BODY_BUILD = pythonDict(bodyForBuild, 4, includeDocs);
          break;
        case 'php':
          vars.BODY_BUILD = phpArray(bodyForBuild, 0, includeDocs);
          break;
        case 'csharp':
          vars.BODY_BUILD = csharpBuildJsonNode(bodyForBuild, 'body', 0, includeDocs);
          break;
        case 'nodejs':
          vars.BODY_BUILD = jsObjectLiteral(bodyForBuild, 2, includeDocs);
          break;
        case 'curl':
          vars.BODY_JSON = escapeShell(JSON.stringify(bodyForBuild, null, 2));
          if (includeDocs) vars.BODY_JSON = addJsonDocComments(bodyForBuild, langKey) + '\n' + vars.BODY_JSON;
          break;
      }
    }

    // C# method-specific call
    if (langKey === 'csharp') {
      vars.CSHARP_CALL = csharpCallCode(method, url, hasBody, 0);
    }

    // inSign API config
    if (langKey === 'java_insign') {
      var isSession = ctx.path && ctx.path.replace(/\/+$/, '') === '/configure/session';
      if (!isSession) {
        vars.INSIGN_CONFIG = '        // The inSign Java API is primarily designed for session configuration.\n' +
                             '        // For ' + ctx.path + ', use "Java (Spring)" or "Java (Jackson)" tabs.';
      } else {
        vars.INSIGN_CONFIG = buildInsignConfig(bodyForBuild || {}, includeDocs, langKey);
      }
    }

    // Escape values for shell templates
    if (langKey === 'curl') {
      vars.URL = escapeShell(url);
      vars.USERNAME = escapeShell(ctx.username || '');
      vars.PASSWORD = escapeShell(ctx.password || '');
      vars.BASE_URL = escapeShell(ctx.baseUrl);
    }

    // Generate commented-out sample properties for missing flags
    if (hasBody && includeSamples) {
      var samples = generateSamples(langKey, bodyForBuild);
      if (langKey === 'java_insign') {
        if (samples) vars.INSIGN_CONFIG += '\n' + samples;
      } else {
        vars.SAMPLES = samples;
      }
    }
    if (!vars.SAMPLES) vars.SAMPLES = '';

    return vars;
  }

  // ---------------------------------------------------------------------------
  // Property catalog & sample generation
  // ---------------------------------------------------------------------------

  var propertyCatalog = null;
  var propertyDocs = {};  // key → { label, desc, path }

  /** Load the property catalog from feature-descriptions.json */
  function getPropertyCatalog() {
    if (propertyCatalog) return propertyCatalog;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/feature-descriptions.json', false);
      xhr.send();
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        propertyCatalog = { root: [], guiProperties: [], signConfig: [] };
        data.featureGroups.forEach(function (group) {
          group.features.forEach(function (f) {
            var section = f.path || 'root';
            if (section === 'doc') return;
            if (!propertyCatalog[section]) propertyCatalog[section] = [];
            propertyCatalog[section].push({ key: f.key, type: f.type, label: f.label });
            propertyDocs[f.key] = { label: f.label, desc: f.desc || '', path: section };
          });
        });
        // Also read featureDescriptions array (uses 'description' field instead of 'desc')
        if (data.featureDescriptions) {
          data.featureDescriptions.forEach(function (f) {
            if (!propertyDocs[f.key]) {
              propertyDocs[f.key] = { label: f.key, desc: f.description || '', path: 'root' };
            } else if (!propertyDocs[f.key].desc && f.description) {
              propertyDocs[f.key].desc = f.description;
            }
          });
        }
      }
    } catch (e) { /* ignore - samples will simply be omitted */ }
    return propertyCatalog;
  }

  /** Get a doc comment for a property key, or empty string if unknown */
  function getDocComment(key, langKey) {
    var info = propertyDocs[key];
    if (!info) return '';
    var cmt = (langKey === 'python' || langKey === 'curl') ? '# ' : '// ';
    return cmt + info.label + ': ' + info.desc;
  }

  /** Generate a shell comment block documenting all body keys (for curl, since JSON has no comments) */
  function addJsonDocComments(body) {
    var lines = [];
    lines.push('# --- Property reference ---');
    Object.keys(body).forEach(function (key) {
      var val = body[key];
      var dc = getDocComment(key, 'curl');
      if (dc) lines.push(dc);
      // Include nested object keys (guiProperties, signConfig, etc.)
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.keys(val).forEach(function (sk) {
          var sdc = getDocComment(sk, 'curl');
          if (sdc) lines.push(sdc);
        });
      }
      // Include keys from array items (documents)
      if (Array.isArray(val)) {
        var seen = {};
        val.forEach(function (item) {
          if (item && typeof item === 'object') {
            Object.keys(item).forEach(function (ik) {
              if (!seen[ik]) { seen[ik] = true; var idc = getDocComment(ik, 'curl'); if (idc) lines.push(idc); }
            });
          }
        });
      }
    });
    return lines.join('\n');
  }

  /** Format a sample value literal for a given language */
  function sampleLiteral(langKey, type) {
    if (type === 'bool') return langKey === 'python' ? 'True' : 'true';
    if (langKey === 'php') return "'...'";
    return '"..."';
  }

  /** Generate commented-out sample lines for properties not in the current body */
  function generateSamples(langKey, body) {
    var catalog = getPropertyCatalog();
    if (!catalog || !body) return '';

    var existingRoot = {};
    var existingGui = {};
    var existingSign = {};
    Object.keys(body).forEach(function (k) { existingRoot[k] = true; });
    if (body.guiProperties) Object.keys(body.guiProperties).forEach(function (k) { existingGui[k] = true; });
    if (body.signConfig) Object.keys(body.signConfig).forEach(function (k) { existingSign[k] = true; });

    var sections = [
      { title: 'Additional session options', items: catalog.root, existing: existingRoot, path: 'root' },
      { title: 'GUI properties', items: catalog.guiProperties || [], existing: existingGui, path: 'guiProperties' },
      { title: 'Sign configuration', items: catalog.signConfig || [], existing: existingSign, path: 'signConfig' }
    ];

    var lines = [];

    sections.forEach(function (sec) {
      var missing = sec.items.filter(function (p) { return !sec.existing[p.key]; });
      if (missing.length === 0) return;

      var cmt = langKey === 'python' || langKey === 'curl' ? '# ' : '// ';
      var pad = '';
      if (langKey === 'java_pure' || langKey === 'java_spring' || langKey === 'java_insign') pad = '        ';

      lines.push('');
      lines.push(pad + cmt + '--- ' + sec.title + ' (uncomment as needed) ---');

      // If the nested section doesn't exist in body yet, show how to create it
      if (sec.path !== 'root' && !body[sec.path]) {
        switch (langKey) {
          case 'python':
            lines.push(cmt + 'payload["' + sec.path + '"] = {}'); break;
          case 'php':
            lines.push(cmt + "$payload['" + sec.path + "'] = [];"); break;
          case 'nodejs':
            lines.push(cmt + 'body.' + sec.path + ' = {};'); break;
          case 'csharp':
            lines.push(cmt + 'body["' + sec.path + '"] = new JsonObject();'); break;
          case 'java_pure': case 'java_spring':
            lines.push(pad + cmt + 'ObjectNode ' + sec.path + 'Node = body.putObject("' + sec.path + '");'); break;
        }
      }

      missing.forEach(function (p) {
        // Add doc comment for this property
        var dc = getDocComment(p.key, langKey);
        if (dc) lines.push(pad + dc);

        var val = sampleLiteral(langKey, p.type);
        var line;
        switch (langKey) {
          case 'python': {
            var pre = sec.path === 'root' ? 'payload' : 'payload["' + sec.path + '"]';
            line = cmt + pre + '["' + p.key + '"] = ' + val;
            break;
          }
          case 'php': {
            var pre = sec.path === 'root' ? "$payload" : "$payload['" + sec.path + "']";
            line = cmt + pre + "['" + p.key + "'] = " + val + ';';
            break;
          }
          case 'nodejs': {
            var pre = sec.path === 'root' ? 'body' : 'body.' + sec.path;
            line = cmt + pre + '["' + p.key + '"] = ' + val + ';';
            break;
          }
          case 'csharp': {
            var pre = sec.path === 'root' ? 'body' : '((JsonObject)body["' + sec.path + '"])';
            line = cmt + pre + '["' + p.key + '"] = ' + val + ';';
            break;
          }
          case 'java_pure': case 'java_spring': {
            var vn = sec.path === 'root' ? 'body' : sec.path + 'Node';
            line = pad + cmt + vn + '.put("' + p.key + '", ' + val + ');';
            break;
          }
          case 'java_insign': {
            if (sec.path === 'root') {
              line = pad + cmt + 'session.' + setterName(p.key) + '(' + val + ');';
            } else if (sec.path === 'guiProperties') {
              var keyArg = INSIGN_GUI_CONSTANTS_SET[p.key]
                ? 'InSignGUIConstants.' + p.key
                : '"' + p.key + '"';
              line = pad + cmt + 'InSignConfigurationBuilder.addGUIProperty(configData, ' + keyArg + ', ' + val + ');';
            } else {
              line = pad + cmt + 'signConfig.' + setterName(p.key) + '(' + val + ');';
            }
            break;
          }
          case 'curl': {
            line = cmt + '"' + p.key + '": ' + val;
            break;
          }
        }
        if (line) lines.push(line);
      });
    });

    return lines.join('\n');
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
