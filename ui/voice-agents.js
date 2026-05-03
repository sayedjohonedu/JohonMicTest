/* ═══════════════════════════════════════════════════════════════
   Voice Agents — UI Logic
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const api = window.agentAPI;

// ── State ──────────────────────────────────────────────────────
let agents = [];
let selectedAgentId = null;

// ── Drag State ─────────────────────────────────────────────────
const DND = {
  active:      false,
  srcIdx:      null,   // original block index
  dropIdx:     null,   // current prospective drop index
  ghost:       null,   // floating clone element
  offsetX:     0,
  offsetY:     0,
  hoverTimer:  null,   // timer before gap opens
  hoverIdx:    null,   // gap index currently being hovered
  HOVER_DELAY: 350,    // ms before gap animates open
};

// ── DOM refs ───────────────────────────────────────────────────
const $agentList     = document.getElementById('agent-list');
const $homeView      = document.getElementById('home-view');
const $editorView    = document.getElementById('editor-view');
const $homeEmpty     = document.getElementById('home-empty');
const $agentName     = document.getElementById('agent-name');
const $agentTrigger  = document.getElementById('agent-trigger');
const $triggerBadge  = document.getElementById('trigger-badge');
const $agentProfile  = document.getElementById('agent-profile');
const $blockCanvas   = document.getElementById('block-canvas');
const $btnAdd        = document.getElementById('btn-add-agent');
const $btnDelete     = document.getElementById('btn-delete');
const $btnResetJarvis = document.getElementById('btn-reset-jarvis');
const $btnBack       = document.getElementById('btn-back');
const $btnClose      = document.getElementById('btn-close');
const $jarvisToggle  = document.getElementById('jarvis-toggle');
const $jarvisPeek    = document.getElementById('jarvis-peek-btn');
const $jarvisPill    = document.getElementById('jarvis-pill');

// Jarvis is only shown in the list during the current session if user peeked
let _jarvisVisible = false;

const ICONS = {
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
  mic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>',
  clipboard: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1"></path><rect x="5" y="15" width="14" height="7" rx="2"></rect></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
  zap: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
  globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  terminal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  monitor: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
};


// ── Chip definitions ───────────────────────────────────────────
const CHIP_DEFS = {
  'context':        { label: 'Context',       cls: 'chip-context' },
  'clipboard':      { label: 'Clipboard',     cls: 'chip-clipboard',      keywords: ['clipboard','copied','copy','pasted','what i copied'] },
  'selected-text':  { label: 'Selected Text', cls: 'chip-selected-text',  keywords: ['selected text','selection','highlighted','what i selected','my selection'] },
  'datetime':       { label: 'Date / Time',   cls: 'chip-datetime' },
  'http-request':   { label: 'HTTP',          cls: 'chip-http-request' },
  'active-window':  { label: 'Screen',        cls: 'chip-active-window' },
  'shell-command':  { label: 'Shell',         cls: 'chip-shell-command' },
  'file-system':    { label: 'File',          cls: 'chip-file-system' },
  'javascript':     { label: 'JS',            cls: 'chip-javascript' },
};

// Parse a chip token that may contain a mode suffix: "clipboard:auto"
// Returns { baseToken, mode } where mode is 'always' | 'auto'
function parseChipToken(token) {
  if (token.endsWith(':auto'))   return { baseToken: token.slice(0, -5), mode: 'auto' };
  return { baseToken: token, mode: 'always' };
}

// Chip test values — in-memory only (context, clipboard, selected-text)
const TEST_VALUES = {};

// Which block was last focused (for chip insertion)
let lastFocusedBlockId = null;

// Profile cache for per-block model dropdowns
let _profilesCache = [];

// ── Migrate old block format → new composer format ─────────────
function migrateBlocks(blocks) {
  if (!blocks || blocks.length === 0) return defaultBlocks();
  if (blocks[0] && blocks[0].template !== undefined) return blocks; // already new

  const result = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (const block of blocks) {
    if (block.type === 'user-prompt') {
      result.push({
        id: block.id || ('b_' + Date.now() + '_' + Math.random().toString(36).slice(2,5)),
        name: 'Block ' + (letters[result.length] || result.length),
        isSystem: !!block.config?.isSystem,
        modelOverride: '',
        template: block.config?.text || '',
      });
    } else {
      const chipMap = {
        'context':'{{context}}','clipboard':'{{clipboard}}',
        'selected-text':'{{selected-text}}','datetime':'{{datetime}}',
        'http-request':'{{http-request}}','active-window':'{{active-window}}',
        'shell-command':'{{shell-command}}','file-system':'{{file-system}}',
        'javascript':'{{javascript}}',
      };
      const chip = chipMap[block.type];
      if (chip) {
        if (result.length > 0) {
          result[result.length-1].template += (result[result.length-1].template ? ' ' : '') + chip;
        } else {
          result.push({
            id: 'b_' + Date.now(),
            name: 'Block A',
            isSystem: false,
            modelOverride: '',
            template: chip,
          });
        }
      }
    }
  }
  return result.length > 0 ? result : defaultBlocks();
}

function defaultBlocks() {
  return [{ id: 'b_' + Date.now(), name: 'Block A', isSystem: false, modelOverride: '', template: '' }];
}

// ── Template ↔ contenteditable serialization ───────────────────
function makeChipHTML(token, agent) {
  if (token.startsWith('block:')) {
    const refId = token.slice(6);
    const refBlock = (agent?.blocks || []).find(b => b.id === refId);
    const label = refBlock ? esc(refBlock.name) + ' ↓' : 'Block ↓';
    return `<span class="chip chip-block-ref" contenteditable="false" data-token="${esc(token)}">${label}</span>`;
  }
  const { baseToken, mode } = parseChipToken(token);
  const def = CHIP_DEFS[baseToken];
  if (!def) return `{{${esc(token)}}}`;
  const modeSupported = !!def.keywords;
  const badge = (modeSupported && mode === 'auto')
    ? ` <span class="chip-mode-badge">auto</span>`
    : (modeSupported && mode === 'always' ? ` <span class="chip-mode-badge chip-mode-always">always</span>` : '');
  return `<span class="chip ${def.cls}" contenteditable="false" data-token="${esc(token)}">${def.label}${badge}</span>`;
}

function renderTemplate(template, agent) {
  if (!template) return '';
  // Split on {{...}} tokens preserving text between them
  const parts = template.split(/(\{\{[^}]+\}\})/g);
  return parts.map(part => {
    const m = part.match(/^\{\{([^}]+)\}\}$/);
    if (m) return makeChipHTML(m[1], agent);
    // Escape text
    return part.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }).join('');
}

function serializeComposer(div) {
  let t = '';
  for (const node of div.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      t += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains('chip')) {
        t += `{{${node.dataset.token}}}`;
      } else if (node.tagName === 'BR') {
        t += '\n';
      } else {
        t += node.textContent;
      }
    }
  }
  return t;
}

// ── Insert chip at cursor in the focused block ─────────────────
function insertChipAtCursor(token, agent) {
  // Find the focused editor
  let editor = null;
  if (lastFocusedBlockId) {
    const card = $blockCanvas.querySelector(`.composer-card[data-id="${lastFocusedBlockId}"]`);
    if (card) editor = card.querySelector('.composer-editor');
  }
  if (!editor) {
    editor = $blockCanvas.querySelector('.composer-editor');
  }
  if (!editor) return;

  editor.focus();
  const chipHTML = makeChipHTML(token, agent);
  const chip = document.createElement('span');
  chip.innerHTML = chipHTML;
  const chipEl = chip.firstChild;

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(chipEl);
    range.setStartAfter(chipEl);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editor.appendChild(chipEl);
  }

  // Save
  const blockId = editor.closest('.composer-card')?.dataset.id;
  const blockIdx = parseInt(editor.closest('.composer-card')?.dataset.idx ?? '-1');
  if (blockIdx >= 0) {
    const updated = [...(agent.blocks || [])];
    if (updated[blockIdx]) {
      updated[blockIdx].template = serializeComposer(editor);
      saveBlocks(updated, false);
    }
  }
}

// ── Chip double-click popup ────────────────────────────────────
function openChipPopup(chip, blockId) {
  const token = chip.dataset.token;
  if (!token || token === 'datetime' || token.startsWith('block:')) return;

  const old = document.getElementById('chip-popup');
  if (old) old.remove();

  const { baseToken, mode } = parseChipToken(token);
  const def = CHIP_DEFS[baseToken];
  const modeSupported = !!(def && def.keywords); // only clipboard / selected-text

  const isTestable = ['context','clipboard','selected-text'].includes(baseToken);
  if (!isTestable) return;

  const key = blockId + ':' + baseToken;
  const cur = TEST_VALUES[key] || '';

  const popup = document.createElement('div');
  popup.id = 'chip-popup';
  popup.className = 'chip-popup block-picker-anim';
  popup.style.cssText = 'position:fixed;z-index:1000;width:320px;';
  popup.innerHTML = `
    <div class="chip-popup-header">
      <span class="chip-popup-title">${def?.label || baseToken} chip</span>
      <span class="chip-popup-note">Double-click to configure</span>
    </div>
    ${modeSupported ? `
    <div class="chip-mode-row">
      <span class="chip-mode-label">Injection mode</span>
      <div class="chip-mode-toggle-group">
        <button class="chip-mode-btn ${mode === 'always' ? 'active' : ''}" data-mode="always">Always</button>
        <button class="chip-mode-btn ${mode === 'auto' ? 'active' : ''}" data-mode="auto">
          Auto-detect
          <span class="chip-mode-hint">only when speech contains keywords</span>
        </button>
      </div>
    </div>
    ${mode === 'auto' ? `<div class="chip-keywords-hint">Keywords: ${def.keywords.map(k => `<code>${k}</code>`).join(', ')}</div>` : ''}
    ` : ''}
    <div class="chip-popup-section-label">Test value <span class="chip-popup-note">(temporary, real data used in production)</span></div>
    <textarea class="chip-popup-textarea" placeholder="Enter a test value for this run...">${esc(cur)}</textarea>
    <div class="chip-popup-actions">
      <button class="chip-popup-cancel">Cancel</button>
      <button class="chip-popup-save">Save</button>
    </div>
  `;

  const rect = chip.getBoundingClientRect();
  popup.style.top  = (rect.bottom + 8) + 'px';
  popup.style.left = Math.max(8, Math.min(rect.left - 20, window.innerWidth - 340)) + 'px';
  document.body.appendChild(popup);

  const ta = popup.querySelector('.chip-popup-textarea');
  ta.focus();

  let selectedMode = mode;

  // Mode button handling
  popup.querySelectorAll('.chip-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMode = btn.dataset.mode;
      popup.querySelectorAll('.chip-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === selectedMode));
      // Show/hide keywords hint
      const hintEl = popup.querySelector('.chip-keywords-hint');
      if (hintEl) hintEl.style.display = selectedMode === 'auto' ? '' : 'none';
    });
  });

  popup.querySelector('.chip-popup-save').addEventListener('click', () => {
    TEST_VALUES[key] = ta.value;
    // Update the chip token in-place
    const newToken = modeSupported
      ? (selectedMode === 'auto' ? baseToken + ':auto' : baseToken)
      : token;
    if (newToken !== token) {
      chip.dataset.token = newToken;
      // Re-render the chip label (update badge)
      const agent = agents.find(a => a.id === selectedAgentId);
      chip.innerHTML = '';
      const tmp = document.createElement('div');
      tmp.innerHTML = makeChipHTML(newToken, agent);
      const newChip = tmp.firstChild;
      chip.className = newChip.className;
      chip.innerHTML = newChip.innerHTML;
      // Save to the block template
      const card = chip.closest('.composer-card');
      if (card) {
        const idx = parseInt(card.dataset.idx);
        const editorEl = card.querySelector('.composer-editor');
        if (editorEl && idx >= 0) {
          const updated = [...(agent?.blocks || [])];
          if (updated[idx]) {
            updated[idx].template = serializeComposer(editorEl);
            saveBlocks(updated, false);
          }
        }
      }
    }
    popup.remove();
  });
  popup.querySelector('.chip-popup-cancel').addEventListener('click', () => popup.remove());

  setTimeout(() => {
    const close = (e) => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('mousedown', close); } };
    document.addEventListener('mousedown', close);
  }, 50);
}

// ── Test Final Output — real execution ────────────────────────
function runTestOutput(agent) {
  const old = document.getElementById('agent-test-overlay');
  if (old) old.remove();

  const blocks = agent.blocks || [];

  // ── Derive spoken input from already-configured test values ──
  // Look for the first context chip that has a test value set.
  // This is what the user configured by double-clicking the chip.
  let autoContextText = '';
  let autoContextKey  = '';
  for (const block of blocks) {
    if (block.enabled === false) continue;
    const tpl = block.template || '';
    const tokens = [...tpl.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
    for (const tok of tokens) {
      const base = tok.replace(/:auto$/, '').replace(/:always$/, '');
      if (base === 'context') {
        const key = block.id + ':context';
        if (TEST_VALUES[key]) {
          autoContextText = TEST_VALUES[key];
          autoContextKey  = key;
          break;
        }
      }
    }
    if (autoContextText) break;
  }

  // If there is no context chip at all, fall back to trigger text
  if (!autoContextText) {
    autoContextText = agent.triggerText || '';
  }

  // -- Build the modal --
  const overlay = document.createElement('div');
  overlay.id = 'agent-test-overlay';
  overlay.className = 'test-output-overlay';

  overlay.innerHTML = `
    <div class="test-output-modal test-run-modal">
      <div class="test-run-header">
        <div class="test-run-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Run Agent Test
        </div>
        <button class="test-run-close-btn" id="test-run-close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Loading state — visible until LLM responds -->
      <div id="test-run-loading" class="test-run-loading">
        <div class="test-run-loading-ring"></div>
        <div class="test-run-loading-text">
          Running agent
          <span class="test-run-loading-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
        <div class="test-run-loading-sub">Calling LLM — this may take a moment</div>
      </div>

      <div id="test-run-result-area" class="test-run-result-area" style="display:none"></div>

      <details class="test-run-prompt-details" id="test-run-prompt-details" style="display:none">
        <summary>View assembled prompt</summary>
        <div class="test-run-prompt-body" id="test-run-prompt-body"></div>
      </details>

      <details class="test-run-input-details" id="test-run-input-details">
        <summary>Change test input &amp; re-run</summary>
        <div class="test-run-input-inner">
          <div class="test-run-section-label" style="margin-top:10px">Spoken input <span class="test-run-note">(what the user "said" — used as {{context}})</span></div>
          <textarea id="test-run-input" class="test-run-textarea" spellcheck="false">${esc(autoContextText)}</textarea>
          <div class="test-run-chip-hints" id="test-run-chip-hints"></div>
          <div class="test-run-actions" style="margin-top:10px">
            <button id="test-run-btn" class="test-run-execute-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Run Again
            </button>
            <span class="test-run-profile-hint" id="test-run-profile-hint"></span>
          </div>
        </div>
      </details>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  overlay.querySelector('#test-run-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  // Populate chip inputs for non-context chips (clipboard / selected-text)
  const hintArea = overlay.querySelector('#test-run-chip-hints');
  const otherChips = [];
  blocks.forEach(block => {
    const tpl = block.template || '';
    const tokens = [...tpl.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
    tokens.forEach(tok => {
      const base = tok.replace(/:auto$/, '').replace(/:always$/, '');
      if (['clipboard', 'selected-text'].includes(base)) {
        const key = block.id + ':' + base;
        const val = TEST_VALUES[key] || '';
        if (!otherChips.find(c => c.key === key)) {
          otherChips.push({ key, base, blockName: block.name, val });
        }
      }
    });
  });

  if (otherChips.length > 0) {
    hintArea.innerHTML = `
      <div class="test-run-section-label" style="margin-top:12px">
        Other chip values
        <span class="test-run-note">(double-click chips on blocks to set these)</span>
      </div>
      ${otherChips.map(c => `
        <div class="test-run-chip-row">
          <span class="test-run-chip-label">${esc(c.blockName)} · ${esc(c.base)}</span>
          <input class="test-run-chip-input" data-key="${esc(c.key)}"
                 placeholder="(empty — double-click chip to set)"
                 value="${esc(c.val)}" spellcheck="false">
        </div>
      `).join('')}
    `;
    hintArea.querySelectorAll('.test-run-chip-input').forEach(inp => {
      inp.addEventListener('input', () => { TEST_VALUES[inp.dataset.key] = inp.value; });
    });
  }

  // Shared run logic
  const inputEl       = overlay.querySelector('#test-run-input');
  const runBtn        = overlay.querySelector('#test-run-btn');
  const loadingEl     = overlay.querySelector('#test-run-loading');
  const resultArea    = overlay.querySelector('#test-run-result-area');
  const promptDetails = overlay.querySelector('#test-run-prompt-details');
  const promptBody    = overlay.querySelector('#test-run-prompt-body');
  const profileHint   = overlay.querySelector('#test-run-profile-hint');

  async function doRun() {
    const testInput = inputEl.value.trim();

    // Sync context chip in TEST_VALUES with whatever is in the textarea
    if (autoContextKey) TEST_VALUES[autoContextKey] = testInput;

    // Sync other chip inputs
    overlay.querySelectorAll('.test-run-chip-input').forEach(inp => {
      TEST_VALUES[inp.dataset.key] = inp.value;
    });

    const tvPayload = { ...TEST_VALUES };

    // Loading state — show loading panel, hide everything else
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="test-run-spinner"></span> Running…`;
    loadingEl.style.display = '';
    loadingEl.classList.remove('test-run-loading-out');
    resultArea.style.display = 'none';
    promptDetails.style.display = 'none';
    profileHint.textContent = '';

    const result = await api.runAgentTest(agent.id, testInput, tvPayload);

    // Restore button
    runBtn.disabled = false;
    runBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Run Again`;

    // Hide loading, reveal result
    loadingEl.classList.add('test-run-loading-out');
    setTimeout(() => { loadingEl.style.display = 'none'; }, 300);
    resultArea.style.display = '';

    if (result.ok) {
      profileHint.textContent = `via ${result.profileName}`;
      resultArea.className = 'test-run-result-area test-run-result-success';
      resultArea.innerHTML = `
        <div class="test-run-result-label">AI Response</div>
        <div class="test-run-result-text">${esc(result.output)}</div>
        <div class="test-run-result-actions">
          <button class="test-run-copy-btn" id="test-run-copy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
          </button>
        </div>
      `;
      resultArea.querySelector('#test-run-copy').addEventListener('click', (e) => {
        navigator.clipboard.writeText(result.output).catch(() => {});
        e.currentTarget.textContent = 'Copied!';
        setTimeout(() => {
          if (e.currentTarget) e.currentTarget.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy`;
        }, 1500);
      });
    } else {
      resultArea.className = 'test-run-result-area test-run-result-error';
      resultArea.innerHTML = `
        <div class="test-run-result-label">Error</div>
        <div class="test-run-error-text">${esc(result.error || 'Unknown error')}</div>
      `;
    }

    if (result.pipeline) {
      promptDetails.style.display = '';
      promptBody.innerHTML = `
        ${result.pipeline.systemPrompt ? `
          <div class="test-run-prompt-section-label">System Prompt</div>
          <pre class="test-run-prompt-pre">${esc(result.pipeline.systemPrompt)}</pre>
        ` : ''}
        ${result.pipeline.userMessage ? `
          <div class="test-run-prompt-section-label">User Message</div>
          <pre class="test-run-prompt-pre">${esc(result.pipeline.userMessage)}</pre>
        ` : ''}
      `;
    }
  }

  // Wire up Re-run button
  runBtn.addEventListener('click', doRun);

  // Allow Enter in textarea to re-run (Shift+Enter = newline)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doRun(); }
  });

  // AUTO-RUN immediately — no user action required
  doRun();
}

// ═══════════════════════════════════════════════════════════════

//  renderBlocks — new composer system
// ═══════════════════════════════════════════════════════════════
function renderBlocks(agent) {
  $blockCanvas.innerHTML = '';

  // Migrate old format if needed
  const rawBlocks = agent.blocks || [];
  const blocks = migrateBlocks(rawBlocks);
  if (JSON.stringify(blocks) !== JSON.stringify(rawBlocks)) {
    agent.blocks = blocks;
    debouncedSave({ blocks });
  }

  // Reset DND
  DND.active = false; DND.srcIdx = null; DND.dropIdx = null; DND.hoverIdx = null;
  clearTimeout(DND.hoverTimer);
  if (DND.ghost) { DND.ghost.remove(); DND.ghost = null; }

  blocks.forEach((block, idx) => {
    if (idx > 0) {
      const conn = document.createElement('div');
      conn.className = 'block-connector';
      conn.dataset.connIdx = idx;
      conn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
      $blockCanvas.appendChild(conn);
    }

    const profileOptsHtml = '<option value="">Default</option>' +
      _profilesCache.map(p =>
        `<option value="${esc(p.id)}" ${block.modelOverride === p.id ? 'selected' : ''}>${esc(p.name)}</option>`
      ).join('');

    const isHidden = block.enabled === false;
    const card = document.createElement('div');
    card.className = 'composer-card' + (block.isSystem ? ' composer-system' : '') + (isHidden ? ' composer-hidden' : '');
    card.dataset.idx = idx;
    card.dataset.id = block.id;

    card.innerHTML = `
      <div class="composer-drag-handle" title="Drag to reorder">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
          <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
        </svg>
      </div>
      <div class="composer-body">
        <div class="composer-header">
          <span class="composer-block-name" contenteditable="true" spellcheck="false" data-block-id="${block.id}">${esc(block.name || 'Block')}</span>
          <label class="composer-system-toggle" title="Mark as System Prompt">
            <input type="checkbox" class="composer-system-check" ${block.isSystem ? 'checked' : ''}>
            <span class="composer-system-label">System</span>
          </label>
          <select class="composer-model-select" title="Model for this block">${profileOptsHtml}</select>
          <button class="composer-hide" title="${isHidden ? 'Show block' : 'Hide block (skip in pipeline)'}">
            ${isHidden
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'}
          </button>
          <button class="composer-remove" title="Remove block">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="composer-editor" contenteditable="true"
             data-placeholder="Type your prompt… click sidebar items to insert variable chips"
             spellcheck="false"></div>
      </div>
    `;

    // Render template into contenteditable
    const editor = card.querySelector('.composer-editor');
    editor.innerHTML = renderTemplate(block.template || '', agent);

    // Track focus for chip insertion
    editor.addEventListener('focus', () => { lastFocusedBlockId = block.id; });

    // Auto-save on input
    editor.addEventListener('input', () => {
      const updated = [...(agent.blocks || [])];
      if (updated[idx]) {
        updated[idx].template = serializeComposer(editor);
        saveBlocks(updated, false);
      }
    });

    // Prevent newline from adding <div> instead of <br>
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });

    // Double-click chip → popup
    editor.addEventListener('dblclick', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) { e.preventDefault(); openChipPopup(chip, block.id); }
    });

    // Block name inline editing
    const nameEl = card.querySelector('.composer-block-name');
    nameEl.addEventListener('input', () => {
      const updated = [...(agent.blocks || [])];
      if (updated[idx]) {
        updated[idx].name = nameEl.textContent.trim() || 'Block';
        saveBlocks(updated, false);
        updateExistingBlocksPalette(agent);
      }
    });
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    });
    nameEl.addEventListener('blur', () => {
      if (!nameEl.textContent.trim()) nameEl.textContent = 'Block';
      validateBlockRefs(agent);
    });

    // System toggle
    card.querySelector('.composer-system-check').addEventListener('change', (e) => {
      const updated = [...(agent.blocks || [])];
      if (updated[idx]) { updated[idx].isSystem = e.target.checked; saveBlocks(updated, true); }
    });

    // Model select
    card.querySelector('.composer-model-select').addEventListener('change', (e) => {
      const updated = [...(agent.blocks || [])];
      if (updated[idx]) { updated[idx].modelOverride = e.target.value; saveBlocks(updated, false); }
    });

    // Hide toggle
    card.querySelector('.composer-hide').addEventListener('click', () => {
      const updated = [...(agent.blocks || [])];
      if (updated[idx]) {
        updated[idx].enabled = updated[idx].enabled === false ? true : false;
        saveBlocks(updated, true);
      }
    });

    // Remove
    card.querySelector('.composer-remove').addEventListener('click', () => {
      const updated = [...(agent.blocks || [])];
      updated.splice(idx, 1);
      saveBlocks(updated, true);
    });

    // Drag handle — available for all agents
    const handle = card.querySelector('.composer-drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', (e) => startBlockDrag(e, agent, idx, card));
    }


    $blockCanvas.appendChild(card);
  });

  // Final Output button
  const finalDiv = document.createElement('div');
  finalDiv.className = 'final-output-btn';
  finalDiv.innerHTML = `<button class="final-output-trigger">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    Run Agent Test
  </button>`;
  finalDiv.querySelector('button').addEventListener('click', () => runTestOutput(agent));
  $blockCanvas.appendChild(finalDiv);

  // Add Block button
  // Add Block button — available for all agents
  const addBtn = document.createElement('button');
  addBtn.className = 'add-block-btn';
  addBtn.id = 'add-block-btn';
  addBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> Add Composer Block';
  addBtn.addEventListener('click', () => addComposerBlock(agent));
  $blockCanvas.appendChild(addBtn);

  // Update sidebar "Existing Blocks" section
  updateExistingBlocksPalette(agent);

  // Validate forward-references after every render
  setTimeout(() => validateBlockRefs(agent), 0);
}

// ── Add a new composer block ────────────────────────────────────
function addComposerBlock(agent) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const blocks = agent.blocks || [];
  const newBlock = {
    id: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
    name: 'Block ' + (letters[blocks.length] || blocks.length + 1),
    isSystem: false,
    modelOverride: '',
    template: '',
  };
  const updated = [...blocks, newBlock];
  saveBlocks(updated, true);
  setTimeout(() => {
    const vp = document.getElementById('canvas-viewport');
    if (vp) vp.scrollTo({ top: vp.scrollHeight, behavior: 'smooth' });
    // Focus the new editor
    const cards = $blockCanvas.querySelectorAll('.composer-card');
    const last = cards[cards.length - 1];
    if (last) {
      const ed = last.querySelector('.composer-editor');
      if (ed) { ed.focus(); last.classList.add('block-anim-enter'); }
    }
  }, 30);
}

// ── Forward-reference validation ───────────────────────────────
/**
 * Scans each block for {{block:ID}} chips that point to blocks
 * coming AFTER the current block (forward references) and marks
 * the card with `.composer-card-invalid`. Returns an array of
 * violation objects for the Test Output warning.
 */
function validateBlockRefs(agent) {
  const blocks = agent.blocks || [];
  const violations = [];

  const cards = $blockCanvas.querySelectorAll('.composer-card');
  cards.forEach((card) => {
    const idx = parseInt(card.dataset.idx);
    const block = blocks[idx];
    if (!block) return;

    card.classList.remove('composer-card-invalid');
    card.querySelectorAll('.block-ref-warning').forEach(el => el.remove());

    const template = block.template || '';
    const forwardRefs = [];

    // Find all block: tokens in the template
    const matches = template.matchAll(/\{\{block:([^}]+)\}\}/g);
    for (const m of matches) {
      const refId = m[1];
      const refIdx = blocks.findIndex(b => b.id === refId);
      if (refIdx >= idx) {
        // Forward reference (same index = self-reference, also invalid)
        const refName = blocks[refIdx]?.name || refId;
        forwardRefs.push(refName);
      }
    }

    if (forwardRefs.length > 0) {
      card.classList.add('composer-card-invalid');
      const warn = document.createElement('div');
      warn.className = 'block-ref-warning';
      warn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Can't use ${forwardRefs.map(n => `<strong>${esc(n)}</strong>`).join(', ')} — pipeline flows top to bottom`;
      card.querySelector('.composer-body').appendChild(warn);
      violations.push({ blockName: block.name, forwardRefs });
    }
  });

  return violations;
}

// ── Update "Existing Blocks" section in palette ─────────────────
function updateExistingBlocksPalette(agent) {
  const palette = document.querySelector('.palette');
  if (!palette) return;

  // Remove old existing-blocks section
  palette.querySelectorAll('.existing-block-item, .palette-section-title').forEach(el => el.remove());

  const blocks = agent.blocks || [];
  if (blocks.length < 2) return;

  const title = document.createElement('div');
  title.className = 'palette-section-title';
  title.textContent = 'Existing Blocks';
  palette.appendChild(title);

  blocks.forEach(block => {
    const item = document.createElement('div');
    item.className = 'palette-item existing-block-item';
    item.dataset.blockRef = block.id;
    item.title = `Insert reference to ${block.name}`;
    item.innerHTML = `
      <div class="p-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </div>
      ${esc(block.name)} ↓
    `;
    item.addEventListener('click', () => {
      const a = agents.find(a => a.id === selectedAgentId);
      if (a) insertChipAtCursor('block:' + block.id, a);
    });
    palette.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════════════
//  Save helpers
// ═══════════════════════════════════════════════════════════════
let saveTimer = null;

function saveBlocks(blocks, rerender) {
  const agent = agents.find(a => a.id === selectedAgentId);
  if (!agent) return;
  agent.blocks = blocks;
  debouncedSave({ blocks });
  if (rerender) renderBlocks(agent);
}

function debouncedSave(updates) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await api.updateAgent(selectedAgentId, updates);
    agents = await api.getAgents();
  }, 400);
}


// ═══════════════════════════════════════════════════════════════
//  Initialisation
// ═══════════════════════════════════════════════════════════════
async function init() {
  await initTheme();
  agents = await api.getAgents();
  await loadProfileDropdown();
  initJarvisPill();
  showHome(); // Always start on homepage
}

async function initTheme() {
  if (api.getConfig) {
    const config = await api.getConfig();
    if (config && config.theme) {
      document.documentElement.setAttribute('data-theme', config.theme);
    }
    api.onConfigUpdate((newConfig) => {
      if (newConfig && newConfig.theme) {
        document.documentElement.setAttribute('data-theme', newConfig.theme);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  Jarvis header pill
// ═══════════════════════════════════════════════════════════════
function initJarvisPill() {
  const jarvis = agents.find(a => a.isBuiltIn);
  if (!jarvis) { $jarvisPill.style.display = 'none'; return; }

  $jarvisToggle.checked = !!jarvis.enabled;
  $jarvisToggle.addEventListener('change', async () => {
    await api.updateAgent(jarvis.id, { enabled: $jarvisToggle.checked });
    agents = await api.getAgents();
  });

  $jarvisPeek.addEventListener('click', () => {
    _jarvisVisible = true;
    selectAgent(jarvis.id);
  });
}

// ═══════════════════════════════════════════════════════════════
//  View switching
// ═══════════════════════════════════════════════════════════════
function showHome() {
  selectedAgentId = null;
  $homeView.style.display = 'flex';
  $editorView.style.display = 'none';
  renderHome();
}

function showEditor(id) {
  selectedAgentId = id;
  $homeView.style.display = 'none';
  $editorView.style.display = 'flex';
  renderEditor();
}

// ═══════════════════════════════════════════════════════════════
//  Home grid
// ═══════════════════════════════════════════════════════════════
function renderHome() {
  $agentList.innerHTML = '';
  // Show only custom agents (skip built-in), unless _jarvisVisible
  const visible = agents.filter(a => !a.isBuiltIn || _jarvisVisible);

  $homeEmpty.style.display = visible.filter(a => !a.isBuiltIn).length === 0 ? 'flex' : 'none';

  visible.forEach(agent => {
    const card = document.createElement('div');
    card.className = 'home-card' + (agent.isBuiltIn ? ' home-card-builtin' : '');
    card.dataset.id = agent.id;

    const triggers = agent.triggerWord
      ? agent.triggerWord.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const triggerHTML = triggers.length
      ? triggers.map(t => `<span class="home-chip">${esc(t)}</span>`).join('')
      : '<span class="home-chip home-chip-none">no trigger</span>';

    const blockCount = (agent.blocks || []).filter(b => b.enabled !== false).length;

    card.innerHTML = `
      <div class="home-card-top">
        <div class="home-card-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        </div>
        <div class="home-card-actions">
          <label class="mini-toggle" title="${agent.enabled ? 'Enabled' : 'Disabled'}">
            <input type="checkbox" class="home-toggle" ${agent.enabled ? 'checked' : ''}>
            <span class="track"></span>
          </label>
          ${agent.isBuiltIn ? '' : `<button class="home-delete-btn" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>`}
        </div>
      </div>
      <div class="home-card-name">${esc(agent.name)}</div>
      <div class="home-card-triggers">${triggerHTML}</div>
      <div class="home-card-meta">${blockCount} block${blockCount !== 1 ? 's' : ''}</div>
    `;

    // Click to open editor
    card.addEventListener('click', (e) => {
      if (e.target.closest('.mini-toggle') || e.target.closest('.home-delete-btn')) return;
      showEditor(agent.id);
    });

    // Toggle
    const toggle = card.querySelector('.home-toggle');
    toggle.addEventListener('change', async (e) => {
      e.stopPropagation();
      await api.updateAgent(agent.id, { enabled: toggle.checked });
      agents = await api.getAgents();
      // Update just the Jarvis pill if needed
      if (agent.isBuiltIn) $jarvisToggle.checked = toggle.checked;
    });

    // Delete
    const delBtn = card.querySelector('.home-delete-btn');
    if (delBtn) {
      // Prevent mousedown from starting any card interaction
      delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      delBtn.addEventListener('click', async (e) => {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        if (!confirm(`Delete "${agent.name}"?`)) return;
        const ok = await api.deleteAgent(agent.id);
        if (ok === false) {
          console.warn('[VoiceAgents] deleteAgent returned false for', agent.id);
        }
        agents = await api.getAgents();
        renderHome();
      });
    }

    $agentList.appendChild(card);
  });
}

function selectAgent(id) {
  showEditor(id);
}

// ═══════════════════════════════════════════════════════════════
//  Editor
// ═══════════════════════════════════════════════════════════════
function renderEditor() {
  const agent = agents.find(a => a.id === selectedAgentId);
  if (!agent) { showHome(); return; }

  $agentName.value      = agent.name;
  $agentName.disabled   = false;   // Jarvis is now editable
  $agentTrigger.value   = agent.triggerWord || '';
  $agentTrigger.disabled = false;
  $triggerBadge.textContent = formatTriggerBadge(agent.triggerWord);
  $agentProfile.value   = agent.llmProfileId || '';
  $agentProfile.disabled = false;

  // Built-in: show Reset; custom: show Delete
  $btnDelete.style.display      = agent.isBuiltIn ? 'none' : '';
  $btnResetJarvis.style.display = agent.isBuiltIn ? ''     : 'none';

  renderBlocks(agent);
}

// ═══════════════════════════════════════════════════════════════
//  Pointer-Events Drag Engine
//  — Works across the entire viewport, not just over other blocks
//  — Ghost element follows cursor with offset
//  — Gap animates open after HOVER_DELAY ms then contracts on leave
//  — Blocks animate with CSS transitions, no jitter
// ═══════════════════════════════════════════════════════════════

function startBlockDrag(e, agent, srcIdx, card) {
  e.preventDefault();
  e.stopPropagation();

  DND.active  = true;
  DND.srcIdx  = srcIdx;
  DND.dropIdx = srcIdx;
  DND.hoverIdx = null;
  clearTimeout(DND.hoverTimer);

  // Create ghost (visual clone following the cursor)
  const rect = card.getBoundingClientRect();
  DND.offsetX = e.clientX - rect.left;
  DND.offsetY = e.clientY - rect.top;

  const ghost = card.cloneNode(true);
  ghost.id = 'dnd-ghost';
  ghost.style.cssText = `
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    width: ${rect.width}px;
    opacity: 0.85;
    box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 0 0 2px var(--accent);
    border-radius: 6px;
    transition: none;
    left: ${e.clientX - DND.offsetX}px;
    top: ${e.clientY - DND.offsetY}px;
    transform: scale(1.03) rotate(-0.8deg);
  `;
  document.body.appendChild(ghost);
  DND.ghost = ghost;

  // Mark source card as placeholder
  card.classList.add('dnd-source');
  $blockCanvas.classList.add('dnd-active');
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';

  // Global move + up handlers
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e) {
  if (!DND.active || !DND.ghost) return;

  // Move ghost
  DND.ghost.style.left = (e.clientX - DND.offsetX) + 'px';
  DND.ghost.style.top  = (e.clientY - DND.offsetY) + 'px';

  // Compute which gap index we're nearest to
  const newDropIdx = computeDropIndex(e.clientX, e.clientY);

  if (newDropIdx !== DND.hoverIdx) {
    // Reset hover timer if we moved to a new gap
    clearTimeout(DND.hoverTimer);
    DND.hoverIdx = newDropIdx;

    // Immediately collapse all gaps then open the new one after delay
    collapseAllGaps();

    DND.hoverTimer = setTimeout(() => {
      if (!DND.active) return;
      DND.dropIdx = DND.hoverIdx;
      openGapAt(DND.dropIdx);
    }, DND.HOVER_DELAY);
  }
}

function onDragEnd(e) {
  if (!DND.active) return;

  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);

  clearTimeout(DND.hoverTimer);

  // Remove ghost with a quick fade
  if (DND.ghost) {
    DND.ghost.style.transition = 'opacity 0.15s, transform 0.15s';
    DND.ghost.style.opacity = '0';
    DND.ghost.style.transform = 'scale(0.95)';
    setTimeout(() => { if (DND.ghost) { DND.ghost.remove(); DND.ghost = null; } }, 160);
  }

  const agent = agents.find(a => a.id === selectedAgentId);
  if (!agent) { resetDragState(); return; }

  let finalIdx = DND.dropIdx;

  // Compute final drop if still in hover window (commit immediately on release)
  if (finalIdx === null || finalIdx === undefined) {
    finalIdx = computeDropIndex(e.clientX, e.clientY);
  }

  const srcIdx = DND.srcIdx;
  resetDragState();

  if (finalIdx !== null && finalIdx !== srcIdx && finalIdx !== srcIdx + 1) {
    const updated = [...(agent.blocks || [])];
    const [moved] = updated.splice(srcIdx, 1);
    // Adjust target after removal
    let insertAt = finalIdx;
    if (srcIdx < finalIdx) insertAt--;
    insertAt = Math.max(0, Math.min(insertAt, updated.length));
    updated.splice(insertAt, 0, moved);
    saveBlocks(updated, true);
  } else {
    // No move — just re-render to remove placeholder styles
    renderBlocks(agent);
  }
}

/**
 * Compute the best drop gap index based on cursor position.
 * Returns an integer 0..N where N is blocks.length (after the last block).
 * This works even in whitespace / connectors / outside blocks.
 */
function computeDropIndex(cx, cy) {
  const agent = agents.find(a => a.id === selectedAgentId);
  if (!agent) return null;
  const blocks = agent.blocks || [];
  const cards = Array.from($blockCanvas.querySelectorAll('.composer-card:not(#dnd-ghost)'));

  if (cards.length === 0) return 0;

  // Get midpoints of each card
  const mids = cards.map(c => {
    const r = c.getBoundingClientRect();
    return r.top + r.height / 2;
  });

  // Cursor is above the first card
  if (cy < mids[0]) return 0;

  // Cursor is below the last card
  if (cy >= mids[mids.length - 1]) return blocks.length;

  // Find which gap the cursor is in
  for (let i = 0; i < mids.length - 1; i++) {
    if (cy >= mids[i] && cy < mids[i + 1]) {
      return i + 1;
    }
  }

  return blocks.length;
}

/**
 * Visually open a gap before index dropIdx by adding margin-top to the
 * block at that position (or padding-bottom on the previous one).
 */
function openGapAt(dropIdx) {
  if (dropIdx === null || !DND.active) return;
  const cards = Array.from($blockCanvas.querySelectorAll('.composer-card'));

  cards.forEach((c, i) => {
    c.style.transition = 'margin-top 0.22s cubic-bezier(0.34,1.56,0.64,1)';
    if (i === dropIdx) {
      c.style.marginTop = '44px';
    } else {
      c.style.marginTop = '';
    }
  });

  if (dropIdx === 0 && cards.length > 0) {
    cards[0].style.marginTop = '44px';
  }
}

function collapseAllGaps() {
  const cards = Array.from($blockCanvas.querySelectorAll('.composer-card'));
  cards.forEach(c => {
    c.style.transition = 'margin-top 0.18s ease';
    c.style.marginTop = '';
  });
}

function resetDragState() {
  DND.active   = false;
  DND.srcIdx   = null;
  DND.dropIdx  = null;
  DND.hoverIdx = null;
  clearTimeout(DND.hoverTimer);
  $blockCanvas.classList.remove('dnd-active');
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  // Clean up any leftover placeholder classes
  document.querySelectorAll('.dnd-source').forEach(el => el.classList.remove('dnd-source'));
  collapseAllGaps();
}

// ═══════════════════════════════════════════════════════════════
//  Palette click → insert chip into focused block
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.palette-item[data-type]').forEach(el => {
  el.addEventListener('click', () => {
    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent || agent.isBuiltIn) return;
    const token = el.dataset.type;
    // 'user-prompt' sidebar item adds a new composer block instead of a chip
    if (token === 'user-prompt') {
      addComposerBlock(agent);
    } else {
      insertChipAtCursor(token, agent);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  Editor top bar listeners
// ═══════════════════════════════════════════════════════════════
$agentName.addEventListener('input', () => {
  debouncedSave({ name: $agentName.value });
  const agent = agents.find(a => a.id === selectedAgentId);
  if (agent) agent.name = $agentName.value;
});

$agentTrigger.addEventListener('input', () => {
  const val = $agentTrigger.value;
  $triggerBadge.textContent = formatTriggerBadge(val);
  debouncedSave({ triggerWord: val });
  const agent = agents.find(a => a.id === selectedAgentId);
  if (agent) agent.triggerWord = val;
});

$agentProfile.addEventListener('change', () => debouncedSave({ llmProfileId: $agentProfile.value }));

// Back → home
$btnBack.addEventListener('click', () => {
  // If it was a Jarvis peek, hide Jarvis from list again
  const agent = agents.find(a => a.id === selectedAgentId);
  if (agent && agent.isBuiltIn) _jarvisVisible = false;
  showHome();
});

// ═══════════════════════════════════════════════════════════════
//  Add / Delete agent
// ═══════════════════════════════════════════════════════════════
$btnAdd.addEventListener('click', async () => {
  const result = await api.addAgent({
    name: 'New Agent',
    description: '',
    enabled: true,
    triggerWord: '',
    llmProfileId: '',
    temperature: null,
    blocks: [
      { id: 'b_' + Date.now() + '_1', name: 'Block A', isSystem: true,  modelOverride: '', template: 'You are a helpful AI assistant.' },
      { id: 'b_' + Date.now() + '_2', name: 'Block B', isSystem: false, modelOverride: '', template: '{{context}}' },
    ],
  });
  if (result.ok) {
    agents = await api.getAgents();
    showEditor(result.agent.id);
    setTimeout(() => $agentName.select(), 100);
  }
});

$btnDelete.addEventListener('click', async () => {
  const agent = agents.find(a => a.id === selectedAgentId);
  if (!agent || agent.isBuiltIn) return;
  if (!confirm(`Delete agent "${agent.name}"?`)) return;
  await api.deleteAgent(agent.id);
  agents = await api.getAgents();
  showHome();
});

$btnResetJarvis.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!confirm('Reset Jarvis to factory defaults? Your edits to Jarvis will be lost.')) return;
  await api.resetJarvis();
  agents = await api.getAgents();
  renderEditor();
});

// ═══════════════════════════════════════════════════════════════
//  Profile dropdown
// ═══════════════════════════════════════════════════════════════
async function loadProfileDropdown() {
  try {
    const profiles = await api.vaultGetLlmProfiles();
    _profilesCache = profiles || [];
    // Still populate the hidden global selector (for compat)
    $agentProfile.innerHTML = '<option value="">Vault Default</option>';
    profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.provider}/${p.model})`;
      $agentProfile.appendChild(opt);
    });
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════
//  Close
// ═══════════════════════════════════════════════════════════════
$btnClose.addEventListener('click', () => api.closeWindow());

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/**
 * Format trigger badge text for multi-trigger display.
 * "Jarvis, Jarvas" → 'triggers: "Jarvis", "Jarvas"'
 * More than 2 → 'triggers: "Jarvis" +2 more'
 */
function formatTriggerBadge(raw) {
  if (!raw || !raw.trim()) return 'trigger: —';
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return 'trigger: —';
  if (parts.length === 1) return `trigger: "${parts[0]}"`;
  if (parts.length === 2) return `triggers: "${parts[0]}", "${parts[1]}"`;
  return `triggers: "${parts[0]}" +${parts.length - 1} more`;
}

/**
 * Format sidebar trigger text — compact version.
 * "Jarvis" → '"Jarvis"'
 * "Jarvis, Jarvas" → '"Jarvis" +1'
 */
function formatSidebarTrigger(raw) {
  if (!raw || !raw.trim()) return '"—"';
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return '"—"';
  if (parts.length === 1) return `"${esc(parts[0])}"`;
  return `"${esc(parts[0])}" <span style="opacity:0.5;font-size:9px;">+${parts.length - 1}</span>`;
}

// ═══════════════════════════════════════════════════════════════
//  Boot
// ═══════════════════════════════════════════════════════════════
init();

