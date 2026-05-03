'use strict';

/**
 * agent-pipeline-engine.js — Core execution engine for Voice Agents.
 *
 * Each Agent is a named pipeline of Blocks that processes spoken text.
 * When the user speaks, the engine:
 *   1. Checks each agent's trigger word against the transcript
 *   2. First matching agent wins (priority = list order)
 *   3. Executes the agent's blocks to assemble LLM messages
 *   4. Returns { systemPrompt, userMessage, profileId, temperature }
 *
 * If no agent matches → caller falls back to built-in clean prompt.
 *
 * Block types:
 *   - user-prompt     : Instruction text. One can be marked isSystem.
 *   - context         : The user's spoken text (trigger word auto-stripped).
 *   - clipboard       : Injects clipboard content when keywords detected.
 *   - selected-text   : Reads currently selected text via Cmd+C (clipboard suppressed).
 *   - datetime        : Injects current date/time.
 *   - http-request    : Fetches any URL and injects the response.
 *   - active-window   : Screenshots the screen and OCR-reads the text.
 *   - shell-command   : Runs a shell command, injects stdout.
 *   - file-system     : Reads a local file (text or image).
 *   - javascript      : Sandboxed Node vm transform (guarded by jsEnabled flag).
 *
 * === In-Context Variable Substitution ===
 * When clipboard or selected-text keywords are matched in the transcript,
 * the matched keyword phrase is replaced with a token (e.g. [clipboard] or
 * [selected text]) directly in the user's sentence. The actual value is
 * then appended at the end as:
 *
 *   [clipboard] = "Hello World..."
 *
 * This makes it trivially clear to any LLM what the user was referring to.
 */

const store = require('../../store/config');
const clipboardHistoryStore = require('./clipboard-history-store');
const { clipboard } = require('electron');
const clipboardMonitor = require('./clipboard-monitor');

// ── Language names for prompt building ────────────────────────────────────
const LANG_NAMES = {
  'en': 'English', 'bn': 'Bengali', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
  'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean',
  'zh': 'Chinese', 'ar': 'Arabic', 'hi': 'Hindi', 'tr': 'Turkish', 'pl': 'Polish',
  'nl': 'Dutch', 'sv': 'Swedish', 'da': 'Danish', 'fi': 'Finnish', 'no': 'Norwegian',
  'uk': 'Ukrainian', 'vi': 'Vietnamese', 'th': 'Thai', 'id': 'Indonesian',
  'ms': 'Malay', 'fa': 'Persian', 'ur': 'Urdu', 'he': 'Hebrew',
  'ro': 'Romanian', 'hu': 'Hungarian', 'cs': 'Czech', 'el': 'Greek', 'bg': 'Bulgarian',
};

// ── Default Jarvis command prompt ────────────────────────────────────────
const JARVIS_COMMAND_PROMPT = `You are a voice command assistant. The user activated you with a trigger word.
Execute the user's instruction based on what they said.
If a [clipboard] or [selected text] value is provided, use it as context for the command.
"scratch that" = delete preceding. "start over" = clear all.
Return ONLY the result. No explanations, no chat.`;

// ── Jarvis trigger words — tight phonetic variants only ──────────────────
const JARVIS_TRIGGER_WORDS = [
  'Jarvis',    // correct spelling
  'Jarvas',    // common STT mishear
  'Jarbas',    // phonetic variant
  'Jarbis',    // phonetic variant
  'ZARBHAAS',  // user's specific variant
  'Zarbas',    // similar to ZARBHAAS
  'Zarvas',    // similar
  'Zervis',    // similar
  'Zarvis',    // similar to Zervis/Zarvas
  'Jarbhas',   // similar to Jarbas/ZARBHAAS
].join(', ');


// ── Factory for Jarvis default blocks — uses new composer format ──────────
// Clipboard and selected-text chips are :auto (keyword-gated, like the old
// Jarvis block behaviour), NOT :always — so they only inject when the user
// says "clipboard", "selected text", etc. in their command.
function JARVIS_DEFAULT_BLOCKS() {
  return [
    {
      id: 'j-b1',
      name: 'System Prompt',
      isSystem: true,
      modelOverride: '',
      template: JARVIS_COMMAND_PROMPT,
    },
    {
      id: 'j-b2',
      name: 'Command',
      isSystem: false,
      modelOverride: '',
      // context = what user said (trigger stripped)
      // clipboard:auto = only injected when user says "clipboard"/"copied"/etc.
      // selected-text:auto = only injected when user says "selected text"/"highlighted"/etc.
      template: '{{context}} {{clipboard:auto}} {{selected-text:auto}}',
    },
  ];
}


// ══════════════════════════════════════════════════════════════════════════
class AgentPipelineEngine {
  constructor() {
    this._seeded = false;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Seed & Read
  // ═══════════════════════════════════════════════════════════════

  /**
   * Ensure the default Jarvis agent exists. Safe to call multiple times.
   */
  seedDefaults() {
    if (this._seeded) return;
    this._seeded = true;

    const agents = store.get('voiceAgents') || [];
    const existing = agents.find(a => a.id === 'jarvis-default');

    if (existing) {
      // ── Migrate existing Jarvis agent if needed ──
      let dirty = false;

      // 1. Add selected-text block if missing
      if (!existing.blocks.some(b => b.type === 'selected-text')) {
        existing.blocks.push({
          id: 'j-b4',
          type: 'selected-text',
          config: { keywords: ['selected text', 'selection', 'highlighted', 'what i selected', 'what i have selected', 'my selection'] },
        });
        dirty = true;
      }

      // 2. Remove 'selected text' from clipboard keywords if present
      const cbBlock = existing.blocks.find(b => b.type === 'clipboard');
      if (cbBlock?.config?.keywords?.includes('selected text')) {
        cbBlock.config.keywords = cbBlock.config.keywords.filter(k => k !== 'selected text');
        dirty = true;
      }

      if (dirty) {
        store.set('voiceAgents', agents);
        console.log('[AgentEngine] Migrated Jarvis agent (added selected-text block)');
      }
      return;
    }

    agents.unshift({
      id: 'jarvis-default',
      name: 'Jarvis',
      description: 'Voice command assistant — say "Jarvis" to activate',
      enabled: true,
      isBuiltIn: true,
      triggerWord: JARVIS_TRIGGER_WORDS,
      llmProfileId: '',   // empty = use vault default
      temperature: null,  // null = use feature default
      blocks: JARVIS_DEFAULT_BLOCKS(),
    });
    store.set('voiceAgents', agents);
    console.log('[AgentEngine] Seeded default Jarvis agent');
  }

  /** Reset Jarvis to factory defaults, preserving enabled state and position. */
  resetJarvis() {
    const agents = store.get('voiceAgents') || [];
    const idx = agents.findIndex(a => a.id === 'jarvis-default');
    const enabled = idx >= 0 ? !!agents[idx].enabled : true;
    const jarvis = {
      id: 'jarvis-default',
      name: 'Jarvis',
      description: 'Voice command assistant — say "Jarvis" to activate',
      enabled,
      isBuiltIn: true,
      triggerWord: JARVIS_TRIGGER_WORDS,
      llmProfileId: '',
      temperature: null,
      blocks: JARVIS_DEFAULT_BLOCKS(),
    };
    if (idx >= 0) {
      agents[idx] = jarvis;
    } else {
      agents.unshift(jarvis);
    }
    store.set('voiceAgents', agents);
    console.log('[AgentEngine] Jarvis reset to factory defaults');
  }

  /** Get all voice agents (seeds defaults if first call). */
  getAgents() {
    this.seedDefaults();
    return store.get('voiceAgents') || [];
  }

  // ═══════════════════════════════════════════════════════════════
  //  Matching
  // ═══════════════════════════════════════════════════════════════

  /**
   * Find the first enabled agent whose trigger word matches the transcript.
   * Supports comma-separated trigger variants (e.g. "Jarvis, Jarvas, Jarbas").
   * Returns the matched agent object with `_matchedTrigger` set, or null.
   */
  findMatchingAgent(transcript) {
    if (!transcript || !transcript.trim()) return null;

    const agents = this.getAgents();
    for (const agent of agents) {
      if (!agent.enabled) continue;
      const raw = (agent.triggerWord || '').trim();
      if (!raw) continue;

      // Split comma-separated trigger variants
      const variants = raw.split(',').map(s => s.trim()).filter(Boolean);

      for (const variant of variants) {
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(transcript)) {
          console.log(`[AgentEngine] Matched agent "${agent.name}" (trigger: "${variant}")`);
          // Attach which variant matched — used for stripping in buildPipeline
          return { ...agent, _matchedTrigger: variant };
        }
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Pipeline Execution
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute an agent's block pipeline against the raw transcript.
   *
   * Uses a two-pass approach:
   *   Pass 1 — resolve clipboard/selected-text substitutions first:
   *     - Detect which keyword phrase matched in the transcript
   *     - Fetch the actual content
   *     - Replace the keyword phrase with a token (e.g. [clipboard])
   *   Pass 2 — build the prompt:
   *     - Assemble all other blocks normally (using the modified transcript)
   *     - Append value definitions at the end: [clipboard] = "..."
   *
   * @param {object} agent   — the matched agent
   * @param {string} rawText — the raw spoken text
   * @param {object} options — { language, personalDictionary }
   * @returns {{ systemPrompt, userMessage, profileId, temperature }}
   */
  async buildPipeline(agent, rawText, options = {}) {
    const { language, personalDictionary } = options;
    // Use the specific matched trigger variant for stripping (set by findMatchingAgent)
    const triggerWord = (agent._matchedTrigger || agent.triggerWord || '').trim();

    // ── Strip trigger word from transcript ──
    let transcript = rawText;
    if (triggerWord) {
      const escaped = triggerWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      transcript = transcript.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim();
    }

    // ── Pass 1: resolve clipboard / selected-text substitutions FIRST ──
    // Each substitution: { token, matchedPhrase, value }
    const substitutions = [];

    // Default keywords (used by auto-detect chips in composer blocks)
    const DEFAULT_CLIPBOARD_KEYWORDS    = ['clipboard','copied','copy','pasted','what i copied'];
    const DEFAULT_SELECTED_TEXT_KEYWORDS = ['selected text','selection','highlighted','what i selected','my selection'];

    for (const block of (agent.blocks || []).filter(b => b.enabled !== false)) {
      // Legacy block-type format
      if (block.type === 'clipboard') {
        const result = this._fetchClipboardWithMatch(transcript, block.config);
        if (result) substitutions.push(result);
      } else if (block.type === 'selected-text') {
        const result = await this._fetchSelectedTextWithMatch(transcript, block.config);
        if (result) substitutions.push(result);
      }

      // New composer template format — scan for :auto chips
      if (block.template) {
        const tokens = [...block.template.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
        for (const tok of tokens) {
          if (tok === 'clipboard:auto') {
            const result = this._fetchClipboardWithMatch(transcript, { keywords: DEFAULT_CLIPBOARD_KEYWORDS });
            if (result && !substitutions.find(s => s.token === '[clipboard]')) {
              substitutions.push(result);
            }
          } else if (tok === 'selected-text:auto') {
            const result = await this._fetchSelectedTextWithMatch(transcript, { keywords: DEFAULT_SELECTED_TEXT_KEYWORDS });
            if (result && !substitutions.find(s => s.token === '[selected text]')) {
              substitutions.push(result);
            }
          }
        }
      }
    }

    // ── Replace matched keyword phrases in transcript with tokens ──
    // Sort longest-first to prevent partial-match clobbering
    let modifiedTranscript = transcript;
    const substitutionsSorted = [...substitutions].sort((a, b) => b.matchedPhrase.length - a.matchedPhrase.length);
    for (const sub of substitutionsSorted) {
      const escaped = sub.matchedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      modifiedTranscript = modifiedTranscript.replace(new RegExp(escaped, 'gi'), sub.token);
    }

    // ── Build variables map for {{variable}} resolution ──
    const now = new Date();
    const variables = {
      context: modifiedTranscript,
      clipboard: substitutions.find(s => s.token === '[clipboard]')?.value || '',
      selectedText: substitutions.find(s => s.token === '[selected text]')?.value || '',
      datetime: now.toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      }),
      language: language || store.get('language') || 'en-US',
      trigger: triggerWord,
      activeWindow: '', // populated lazily if an active-window chip is encountered
    };

    // ── Pass 2: build prompt parts from all other blocks ──
    const systemParts = [];
    const userParts = [];

    for (const block of (agent.blocks || []).filter(b => b.enabled !== false)) {
      // clipboard / selected-text handled in Pass 1 — skip here
      if (block.type === 'clipboard' || block.type === 'selected-text') continue;
      await this._executeBlock(block, { transcript: modifiedTranscript, variables, systemParts, userParts });
    }

    // ── Append value definitions (e.g. [clipboard] = "...") ──
    for (const sub of substitutions) {
      userParts.push(`${sub.token} = "${sub.value}"`);
    }

    // ── Resolve {{variables}} in all parts ──
    const resolvedSystem = systemParts.map(p => this._resolveVariables(p, variables));
    const resolvedUser   = userParts.map(p => this._resolveVariables(p, variables));

    let systemPrompt = resolvedSystem.join('\n\n');
    const userMessage = resolvedUser.join('\n\n');

    // ── Language hint for non-English ──
    const lang = language || store.get('language') || 'en-US';
    if (lang && !lang.startsWith('en')) {
      const shortCode = lang.split('-')[0];
      const langName = LANG_NAMES[shortCode] || lang;
      systemPrompt += `\nIMPORTANT: Input is in ${langName}. Output MUST be in ${langName}.`;
    }

    // ── Personal dictionary ──
    if (personalDictionary) {
      const words = typeof personalDictionary === 'string'
        ? personalDictionary.split(',').map(w => w.trim()).filter(Boolean)
        : personalDictionary;
      if (words.length > 0) {
        systemPrompt += `\nAlways spell these correctly: ${words.join(', ')}`;
      }
    }

    return {
      systemPrompt,
      userMessage,
      profileId: agent.llmProfileId || '',
      temperature: agent.temperature,
      // true when the selected-text block actually fired and grabbed content
      usedSelectedText: substitutions.some(s => s.token === '[selected text]'),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Block Executors
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute a single block, mutating the pipeline state.
   * clipboard and selected-text are skipped here (handled in Pass 1).
   */
  async _executeBlock(block, state) {
    const { transcript, variables, systemParts, userParts } = state;

    // ── New composer format (has `template` field) ──────────────
    if (block.template !== undefined) {
      let text = (block.template || '').trim();
      if (!text) return;

      // Resolve all {{tokens}} in the template
      text = text.replace(/\{\{([^}]+)\}\}/g, (_, token) => {
        if (token === 'context')                return transcript || '';
        if (token === 'clipboard')              return variables.clipboard || (clipboard.readText() || '');
        if (token === 'clipboard:auto')         return variables.clipboard || '';  // only if keyword matched in Pass 1
        if (token === 'selected-text')          return variables.selectedText || '';
        if (token === 'selected-text:auto')     return variables.selectedText || '';  // only if keyword matched in Pass 1
        if (token === 'datetime')               return variables.datetime || new Date().toLocaleString();
        if (token === 'active-window')          return variables.activeWindow || '';
        if (token.startsWith('block:'))         return ''; // cross-block refs resolved separately
        return `[${token}]`;
      }).trim();

      if (!text) return;
      if (block.isSystem) {
        systemParts.push(text);
      } else {
        userParts.push(text);
      }
      return;
    }

    switch (block.type) {
      case 'user-prompt': {
        const text = (block.config?.text || '').trim();

        if (!text) break;
        if (block.config?.isSystem) {
          systemParts.push(text);
        } else {
          userParts.push(text);
        }
        break;
      }

      case 'context': {
        if (transcript) {
          userParts.push(transcript);
        }
        break;
      }

      case 'clipboard':
      case 'selected-text':
        // Handled in Pass 1 of buildPipeline — skip here
        break;

      case 'active-window': {
        // Optional keyword gating — if keywords configured, only fire when one is in transcript
        const awKeywords = block.config?.keywords || [];
        if (awKeywords.length > 0) {
          const lower = transcript.toLowerCase();
          const matched = awKeywords.some(kw => lower.includes(kw.toLowerCase()));
          if (!matched) break;
        }

        try {
          const { desktopCapturer, screen } = require('electron');
          const Tesseract = require('tesseract.js');

          const display = screen.getPrimaryDisplay();
          const { width, height } = display.size;
          const sf = display.scaleFactor || 1;

          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: Math.round(width * sf), height: Math.round(height * sf) },
          });

          if (!sources.length) {
            console.warn('[AgentEngine] Active Window: no screen source available');
            break;
          }

          const dataUrl = sources[0].thumbnail.toDataURL();
          const ocrWorker = await Tesseract.createWorker('eng');
          const { data: { text } } = await ocrWorker.recognize(dataUrl);
          await ocrWorker.terminate();

          if (text && text.trim()) {
            const maxChars = Number(block.config?.maxChars) || 3000;
            const clipped = text.length > maxChars
              ? text.slice(0, maxChars) + '\n[...truncated]'
              : text;
            userParts.push(`Active screen content (OCR):\n${clipped}`);
            console.log(`[AgentEngine] Active Window: OCR extracted ${text.length} chars`);
          }
        } catch (err) {
          console.error('[AgentEngine] Active Window OCR failed:', err.message);
        }
        break;
      }

      case 'datetime': {
        userParts.push(`Current date/time: ${variables.datetime}`);
        break;
      }

      case 'http-request': {
        const rawUrl = this._resolveVariables(block.config?.url || '', variables);
        if (!rawUrl) {
          console.warn('[AgentEngine] HTTP Request block: no URL configured');
          break;
        }

        let parsedUrl;
        try { parsedUrl = new URL(rawUrl); } catch {
          console.warn('[AgentEngine] HTTP Request block: invalid URL:', rawUrl);
          break;
        }

        const method    = (block.config?.method || 'GET').toUpperCase();
        const timeout   = Number(block.config?.timeout) || 8000;
        const maxChars  = Number(block.config?.maxChars) || 4000;
        const injectAs  = block.config?.injectAs || 'user';

        let headers = { 'User-Agent': 'MicTab/1.0', 'Accept': 'application/json, text/plain, */*' };
        try {
          const h = block.config?.headers?.trim();
          if (h) Object.assign(headers, JSON.parse(h));
        } catch { /* ignore malformed headers */ }

        const rawBody = block.config?.body?.trim()
          ? this._resolveVariables(block.config.body, variables)
          : null;

        if (rawBody) {
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          headers['Content-Length'] = Buffer.byteLength(rawBody);
        }

        const lib = parsedUrl.protocol === 'https:' ? require('https') : require('http');

        const responseText = await new Promise((resolve) => {
          const options = {
            hostname: parsedUrl.hostname,
            port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path:     parsedUrl.pathname + parsedUrl.search,
            method,
            headers,
          };

          const req = lib.request(options, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
          });

          req.setTimeout(timeout, () => {
            req.destroy();
            resolve(`[HTTP timeout after ${timeout}ms]`);
          });

          req.on('error', (err) => resolve(`[HTTP error: ${err.message}]`));

          if (rawBody && method !== 'GET' && method !== 'HEAD') req.write(rawBody);
          req.end();
        });

        const clipped = responseText.length > maxChars
          ? responseText.slice(0, maxChars) + '\n[...truncated]'
          : responseText;

        const target = injectAs === 'system' ? systemParts : userParts;
        target.push(`HTTP Response (${method} ${rawUrl}):\n${clipped}`);
        console.log(`[AgentEngine] HTTP Request: ${method} ${rawUrl} → ${responseText.length} chars`);
        break;
      }

      case 'shell-command': {
        const rawCmd = this._resolveVariables(block.config?.command || '', variables);
        if (!rawCmd.trim()) {
          console.warn('[AgentEngine] Shell Command block: no command configured');
          break;
        }

        const shellTimeout = Number(block.config?.timeout) || 10000;
        const shellMaxChars = Number(block.config?.maxChars) || 4000;
        const runMode = block.config?.runMode || 'inject-result';
        const shellInjectAs = block.config?.injectAs || 'user';

        // Platform-adaptive shell selection
        const shellPref = block.config?.shell || 'auto';
        const shellOpts = {};
        if (shellPref === 'powershell') {
          shellOpts.shell = 'powershell.exe';
        } else if (shellPref === 'bash') {
          shellOpts.shell = '/bin/bash';
        }
        // 'auto' leaves shell unset → OS default (cmd.exe on Windows, /bin/sh on mac/linux)

        if (runMode === 'fire-and-forget') {
          const { exec } = require('child_process');
          exec(rawCmd, shellOpts);
          console.log(`[AgentEngine] Shell (fire-and-forget): ${rawCmd}`);
          break;
        }

        const { exec } = require('child_process');
        const shellOutput = await new Promise((resolve) => {
          exec(rawCmd, { timeout: shellTimeout, ...shellOpts }, (err, stdout, stderr) => {
            if (err) {
              resolve(`[Shell Error]: ${stderr || err.message}`);
            } else {
              resolve(stdout || '');
            }
          });
        });

        const shellClipped = shellOutput.length > shellMaxChars
          ? shellOutput.slice(0, shellMaxChars) + '\n[...truncated]'
          : shellOutput;

        const shellTarget = shellInjectAs === 'system' ? systemParts : userParts;
        shellTarget.push(`Shell output (${rawCmd.slice(0, 60)}${rawCmd.length > 60 ? '...' : ''}):\n${shellClipped}`);
        console.log(`[AgentEngine] Shell: "${rawCmd}" → ${shellOutput.length} chars`);
        break;
      }

      case 'file-system': {
        const fs = require('fs');
        const path = require('path');

        const rawPath = this._resolveVariables(block.config?.path || '', variables);
        if (!rawPath.trim()) {
          console.warn('[AgentEngine] File block: no path configured');
          break;
        }

        const normalizedPath = path.normalize(rawPath.trim());

        if (!fs.existsSync(normalizedPath)) {
          userParts.push(`[File not found: ${normalizedPath}]`);
          console.warn(`[AgentEngine] File block: not found: ${normalizedPath}`);
          break;
        }

        const fileMode = block.config?.mode || 'text';
        const fileMaxChars = Number(block.config?.maxChars) || 8000;
        const fileInjectAs = block.config?.injectAs || 'user';
        const fileTarget = fileInjectAs === 'system' ? systemParts : userParts;

        if (fileMode === 'image-base64') {
          try {
            const buffer = fs.readFileSync(normalizedPath);
            const ext = path.extname(normalizedPath).slice(1).toLowerCase();
            const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
            const mime = mimeMap[ext] || 'image/png';
            const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
            fileTarget.push(`File image (${path.basename(normalizedPath)}): ${dataUrl}`);
            console.log(`[AgentEngine] File: read image ${normalizedPath} (${buffer.length} bytes)`);
          } catch (err) {
            fileTarget.push(`[File read error: ${err.message}]`);
          }
        } else {
          try {
            const content = fs.readFileSync(normalizedPath, 'utf8');
            const clipped = content.length > fileMaxChars
              ? content.slice(0, fileMaxChars) + '\n[...truncated]'
              : content;
            fileTarget.push(`File: ${path.basename(normalizedPath)}\n\`\`\`\n${clipped}\n\`\`\``);
            console.log(`[AgentEngine] File: read ${normalizedPath} (${content.length} chars)`);
          } catch (err) {
            fileTarget.push(`[File read error: ${err.message}]`);
          }
        }
        break;
      }

      case 'javascript': {
        const jsEnabled = (store.get('voiceAgentsConfig') || {}).jsEnabled || false;
        if (!jsEnabled) {
          console.warn('[AgentEngine] JS block skipped — not enabled by user');
          break;
        }
        const code = (block.config?.code || '').trim();
        if (!code) break;

        const vm = require('vm');
        const sandbox = {
          text:      transcript,
          variables: { ...variables },
          result:    '',
          console:   { log: (...a) => console.log('[JS Block]', ...a) },
        };
        vm.createContext(sandbox);

        try {
          vm.runInContext(code, sandbox, { timeout: 2000 });
          if (sandbox.result) {
            const injectAs = block.config?.injectAs || 'user';
            const target = injectAs === 'system' ? systemParts : userParts;
            target.push(String(sandbox.result));
          }
        } catch (err) {
          console.error('[AgentEngine] JS block error:', err.message);
          userParts.push(`[JS Error: ${err.message}]`);
        }
        break;
      }

      default:
        console.warn(`[AgentEngine] Unknown block type: "${block.type}"`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  CRUD (for IPC / future UI)
  // ═══════════════════════════════════════════════════════════════

  addAgent(data) {
    const agents = this.getAgents();
    const agent = {
      ...data,
      id: data.id || 'agent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      isBuiltIn: false,
    };
    agents.push(agent);
    store.set('voiceAgents', agents);
    return agent;
  }

  updateAgent(id, updates) {
    const agents = this.getAgents();
    const idx = agents.findIndex(a => a.id === id);
    if (idx === -1) return null;
    // Preserve immutable fields
    agents[idx] = { ...agents[idx], ...updates, id, isBuiltIn: agents[idx].isBuiltIn };
    store.set('voiceAgents', agents);
    return agents[idx];
  }

  deleteAgent(id) {
    const agents = this.getAgents();
    if (agents.find(a => a.id === id)?.isBuiltIn) return false;
    store.set('voiceAgents', agents.filter(a => a.id !== id));
    return true;
  }

  reorderAgents(orderedIds) {
    const agents = this.getAgents();
    const reordered = [];
    for (const id of orderedIds) {
      const a = agents.find(ag => ag.id === id);
      if (a) reordered.push(a);
    }
    // Safety: add any missing agents at the end
    for (const a of agents) {
      if (!reordered.find(r => r.id === a.id)) reordered.push(a);
    }
    store.set('voiceAgents', reordered);
    return reordered;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /** Resolve {{variable}} placeholders in text. */
  _resolveVariables(text, variables) {
    if (!text) return text;
    return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  /**
   * Detect a keyword match in the transcript and return clipboard content.
   * Returns { token, matchedPhrase, value } or null.
   *
   * The matched keyword phrase will be replaced in the transcript with [clipboard].
   */
  _fetchClipboardWithMatch(transcript, config = {}) {
    const lower = transcript.toLowerCase();
    const keywords = config.keywords || ['clipboard', 'copied', 'copy', 'pasted', 'what i copied'];

    // Find the longest matching keyword phrase
    const matchedPhrase = keywords
      .filter(kw => lower.includes(kw.toLowerCase()))
      .sort((a, b) => b.length - a.length)[0];

    if (!matchedPhrase) return null;

    try {
      const result = clipboardHistoryStore.query({ section: 'all', page: 0 });
      const latest = result.entries.find(e => e.type === 'text' && e.text);
      if (latest && latest.text.trim()) {
        const maxChars = config.maxChars || 4000;
        const text = latest.text.length > maxChars
          ? latest.text.slice(0, maxChars) + '\n[...truncated]'
          : latest.text;
        console.log(`[AgentEngine] Clipboard matched via "${matchedPhrase}" (${text.length} chars)`);
        return { token: '[clipboard]', matchedPhrase, value: text };
      }
    } catch (e) {
      console.warn('[AgentEngine] Failed to read clipboard:', e.message);
    }
    return null;
  }

  /**
   * Detect a keyword match and return the currently selected text.
   * Returns { token, matchedPhrase, value } or null.
   *
   * Uses Cmd+C simulation. Both the selection and the clipboard restore
   * are suppressed from clipboard history via clipboardMonitor.suppressNext().
   *
   * The matched keyword phrase will be replaced in the transcript with [selected text].
   */
  async _fetchSelectedTextWithMatch(transcript, config = {}) {
    const lower = transcript.toLowerCase();
    const keywords = config.keywords || [
      'selected text', 'selection', 'highlighted', 'what i selected',
      'what i have selected', 'my selection', 'select',
    ];

    // Find the longest matching keyword phrase first
    const matchedPhrase = keywords
      .filter(kw => lower.includes(kw.toLowerCase()))
      .sort((a, b) => b.length - a.length)[0];

    if (!matchedPhrase) return null;

    try {
      // 1. Save original clipboard
      const original = clipboard.readText();

      // 2. Simulate copy — puts the user's selection into clipboard
      const robot = require('@hurdlegroup/robotjs');
      if (process.platform === 'darwin') {
        robot.keyTap('c', 'command');
      } else {
        robot.keyTap('c', 'control');
      }

      // 3. Wait for OS clipboard to settle (~150ms)
      await new Promise(r => setTimeout(r, 150));

      const selected = clipboard.readText();

      // 4. Suppress BOTH texts so clipboard history never sees them
      if (selected && selected !== original) {
        clipboardMonitor.suppressNext(selected);
      }
      clipboardMonitor.suppressNext(original || '');

      // 5. Restore original
      clipboard.writeText(original || '');

      // 6. If clipboard didn't change, nothing was selected
      if (!selected || selected === original) {
        console.log('[AgentEngine] selected-text: nothing selected or same as clipboard');
        return null;
      }

      const maxChars = config.maxChars || 4000;
      const text = selected.length > maxChars
        ? selected.slice(0, maxChars) + '\n[...truncated]'
        : selected;

      console.log(`[AgentEngine] Selected text matched via "${matchedPhrase}" (${text.length} chars)`);
      return { token: '[selected text]', matchedPhrase, value: text };
    } catch (e) {
      console.warn('[AgentEngine] Failed to read selected text:', e.message);
      return null;
    }
  }
}

module.exports = new AgentPipelineEngine();
