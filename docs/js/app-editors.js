'use strict';

/* ==========================================================================
   Monaco Editor Utilities, Step Navigation, Session Management
   ========================================================================== */


/** Add word-wrap toggle hint (bottom-right) + Alt+Z keybinding to a Monaco editor */
function setupEditorWrapToggle(editor, container) {
    const hint = document.createElement('span');
    hint.className = 'editor-wrap-hint';
    hint.title = 'Toggle word wrap (Alt+Z)';
    container.style.position = 'relative';
    container.appendChild(hint);

    function updateHint() {
        const on = editor.getOption(monaco.editor.EditorOption.wordWrap) !== 'off';
        hint.textContent = on ? 'wrap: on (Alt+Z)' : 'wrap: off (Alt+Z)';
        hint.classList.toggle('wrap-off', !on);
    }
    updateHint();

    function toggleWrap() {
        const on = editor.getOption(monaco.editor.EditorOption.wordWrap) !== 'off';
        editor.updateOptions({ wordWrap: on ? 'off' : 'on' });
        updateHint();
    }

    hint.addEventListener('click', toggleWrap);

    editor.addAction({
        id: 'toggle-word-wrap',
        label: 'Toggle Word Wrap',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
        run: toggleWrap
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
    const schemaKey = opts && opts.schemaKey;

    // If a schemaKey is provided and language is json, create a model with
    // a URI whose filename matches the schema's fileMatch pattern so Monaco
    // picks up validation, autocomplete & hover descriptions automatically.
    let model = null;
    if (schemaKey && (!language || language === 'json')) {
        const filename = schemaKey + '.json';
        const modelUri = monaco.Uri.parse('insign://models/' + id + '/' + filename);
        model = monaco.editor.createModel(content || '', 'json', modelUri);
    }

    const editorOpts = {
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

    if (model) {
        editorOpts.model = model;
    } else {
        editorOpts.value = content;
    }

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

function showResponseEditor(id, response, schemaKey) {
    // Create response editor if not exists
    const editorId = id + '-response';
    const container = $('#editor-' + editorId)[0];
    if (!container) return;

    if (!state.editors[editorId]) {
        createReadOnlyEditor(editorId, '', 'json', { schemaKey: schemaKey || null });
    } else if (schemaKey) {
        // If the editor already exists but didn't have a schema, re-associate
        // its model with the schema by updating the model URI
        const editor = state.editors[editorId];
        const model = editor.getModel();
        const expectedFilename = schemaKey + '.json';
        if (model && !model.uri.path.endsWith('/' + expectedFilename)) {
            // Dispose old model and create a new one with the correct URI
            const content = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
            const modelUri = monaco.Uri.parse('insign://models/' + editorId + '/' + expectedFilename);
            const newModel = monaco.editor.createModel(content, 'json', modelUri);
            editor.setModel(newModel);
            model.dispose();
            return; // Content already set via new model
        }
    }

    const content = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
    setEditorValue(editorId, content);
}

// =====================================================================
// Step navigation
// =====================================================================

function goToStep(step, skipHash) {
    state.currentStep = step;

    // Remove early-init CSS override (injected in <head> to prevent flash)
    const earlyCss = document.getElementById('early-step-css');
    if (earlyCss) earlyCss.remove();

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

    // Show polling section in right sidebar for step 3+
    $('#section-polling').toggleClass('d-none', step < 3);
    // Reconcile webhook sidebar + CORS hint state
    reconcileWebhookCorsState();
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

    // Update session bar
    $('#navbar-session-id').val(sessionId);
    // Show foruser in the bar
    const foruserVal = ($('#cfg-foruser').val() || '').trim() || state.userId || '';
    $('#navbar-foruser-id').val(foruserVal);

    // Open in inSign requires a session ID; Session Manager only needs a foruser
    const hasSession = !!sessionId;
    $('#navbar-btn-open').toggleClass('d-none', !hasSession).attr('title', accessURL || '');
    const hasForuser = !!(state.lastForuser || ($('#cfg-foruser').val() || '').trim() || state.userId);
    $('#navbar-btn-session-mgr').toggleClass('d-none', !(hasSession || hasForuser))
        .attr('title', state.accessURLProcessManagement || '');
    $('#btn-goto-step2, #btn-floating-goto-step2').removeClass('d-none');

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

/** Apply foruser from navbar input - syncs back to cfg-foruser and state */
function applyNavbarForuser() {
    const val = ($('#navbar-foruser-id').val() || '').trim();
    if (!val) return;
    $('#cfg-foruser').val(val);
    state.lastForuser = val;
    state.userId = val;
    saveAppState();
}
