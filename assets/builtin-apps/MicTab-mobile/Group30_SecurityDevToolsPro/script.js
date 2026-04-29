/* ============================================================
   MicTab - Security & Dev Tools  |  JavaScript
   All logic wrapped in DOMContentLoaded for clean scoping.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ===========================================================
     TAB STRIP NAVIGATION
     =========================================================== */
  const tabItems = document.querySelectorAll('.tab-item');
  const panels   = document.querySelectorAll('.tool-panel');

  tabItems.forEach(item => {
    item.addEventListener('click', () => {
      tabItems.forEach(i => i.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const toolId = item.getAttribute('data-tool');
      const panel  = document.getElementById('panel-' + toolId);
      if (panel) panel.classList.add('active');
    });
  });

  /* ===========================================================
     UTILITY: Copy text to clipboard
     =========================================================== */
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function flashCopyButton(btn, originalText) {
    const prev = originalText || btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.color = '#34C759';
    setTimeout(() => {
      btn.textContent = prev;
      btn.style.color = '';
    }, 1200);
  }

  function flashIconButton(btn) {
    const svg = btn.querySelector('svg');
    if (!svg) return;
    const original = svg.innerHTML;
    svg.innerHTML = '<polyline points="20 6 9 17 4 12" stroke="#34C759" fill="none" stroke-width="2"/>';
    setTimeout(() => { svg.innerHTML = original; }, 1200);
  }

  /* ===========================================================
     1. PASSWORD GENERATOR (with Passphrase mode)
     =========================================================== */
  const pwdOutput       = document.getElementById('pwd-output');
  const pwdCopyBtn      = document.getElementById('pwd-copy-btn');
  const pwdRegenBtn     = document.getElementById('pwd-regen-btn');
  const pwdGenerateBtn  = document.getElementById('pwd-generate-btn');
  const pwdLength       = document.getElementById('pwd-length');
  const pwdLengthVal    = document.getElementById('pwd-length-val');
  const pwdUpper        = document.getElementById('pwd-upper');
  const pwdLower        = document.getElementById('pwd-lower');
  const pwdNumbers      = document.getElementById('pwd-numbers');
  const pwdSymbols      = document.getElementById('pwd-symbols');
  const pwdExcludeAmb   = document.getElementById('pwd-exclude-ambiguous');
  const pwdStrengthBar  = document.getElementById('pwd-strength-bar');
  const pwdStrengthLbl  = document.getElementById('pwd-strength-label');
  const pwdEntropyLbl   = document.getElementById('pwd-entropy-label');
  const modePasswordBtn = document.getElementById('mode-password');
  const modePassphraseBtn = document.getElementById('mode-passphrase');
  const passwordOptions = document.getElementById('password-options');
  const passphraseOptions = document.getElementById('passphrase-options');
  const ppWordCount     = document.getElementById('pp-word-count');
  const ppWordCountVal  = document.getElementById('pp-word-count-val');
  const ppSeparator     = document.getElementById('pp-separator');
  const ppCapitalize    = document.getElementById('pp-capitalize');

  const AMBIGUOUS = '0OolI1';

  const CHAR_SETS = {
    upper:   'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower:   'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?/~`'
  };

  // EFF short word list for passphrase generation
  const WORD_LIST = [
    'apple','april','arrow','badge','baker','beach','bench','blade','blank','blaze',
    'bloom','board','brave','brick','bride','brook','brush','cabin','candy','cargo',
    'cedar','chain','chalk','charm','chase','chess','chief','choir','civic','clash',
    'clean','cliff','clock','cloud','coach','coast','coral','craft','crane','crisp',
    'crown','crush','curve','daisy','dance','delta','depth','diary','dolphin','draft',
    'dream','drift','dwarf','eagle','earth','ember','evolve','fable','faith','feast',
    'fence','fiber','field','flame','flash','float','flock','forge','frame','fresh',
    'front','frost','ghost','glade','globe','grace','grain','grape','grasp','green',
    'grove','guard','habit','harbor','heart','honey','honor','horse','house','ivory',
    'jewel','joker','karma','knack','kneel','lance','laser','latch','layer','lemon',
    'light','limit','lotus','lunar','magic','maple','march','marsh','medal','mercy',
    'metal','mirth','model','motor','mount','noble','north','nurse','ocean','olive',
    'orbit','organ','oasis','paint','panel','patch','pearl','phase','phone','piano',
    'pilot','pixel','place','plaid','plume','polar','power','prism','proof','pulse',
    'quest','quick','quiet','radar','range','rapid','raven','realm','reign','rider',
    'ridge','river','robin','royal','rural','saint','scale','scene','scout','shade',
    'shelf','shell','shift','shine','shore','signal','silk','slate','solar','solid',
    'south','space','spark','spine','spoke','spore','spray','stack','staff','stage',
    'stake','stand','stark','steam','steel','stern','stone','storm','stove','stream',
    'strip','summit','surge','swamp','swarm','swift','sword','table','tango','tempo',
    'thorn','tiger','toast','torch','tower','trace','trade','trail','trend','tribe',
    'trick','troop','trout','trust','tulip','tuner','ultra','unity','urban','value',
    'valve','vault','venue','verse','vigor','viper','vivid','vocal','voter','wafer',
    'watch','water','whale','wheat','wheel','whole','wield','witch','world','wrist',
    'yacht','yield','young','zebra','angel','basic','blank','bound','camel','cream',
    'delta','equal','flame','graph','haste','input','jelly','kayak','lemon','maple'
  ];

  let isPassphraseMode = false;

  modePasswordBtn.addEventListener('click', () => {
    isPassphraseMode = false;
    modePasswordBtn.classList.add('active');
    modePassphraseBtn.classList.remove('active');
    passwordOptions.style.display = '';
    passphraseOptions.style.display = 'none';
    generatePassword();
  });

  modePassphraseBtn.addEventListener('click', () => {
    isPassphraseMode = true;
    modePassphraseBtn.classList.add('active');
    modePasswordBtn.classList.remove('active');
    passwordOptions.style.display = 'none';
    passphraseOptions.style.display = '';
    generatePassphrase();
  });

  pwdLength.addEventListener('input', () => {
    pwdLengthVal.textContent = pwdLength.value;
  });

  ppWordCount.addEventListener('input', () => {
    ppWordCountVal.textContent = ppWordCount.value;
  });

  function excludeAmbiguous(str) {
    let result = '';
    for (const ch of str) {
      if (!AMBIGUOUS.includes(ch)) result += ch;
    }
    return result;
  }

  function generatePassword() {
    const length = parseInt(pwdLength.value, 10);
    let pool = '';
    if (pwdUpper.checked)   pool += CHAR_SETS.upper;
    if (pwdLower.checked)   pool += CHAR_SETS.lower;
    if (pwdNumbers.checked) pool += CHAR_SETS.numbers;
    if (pwdSymbols.checked) pool += CHAR_SETS.symbols;

    if (pwdExcludeAmb.checked) {
      pool = excludeAmbiguous(pool);
    }

    if (!pool) {
      pwdOutput.value = '';
      updateStrength('', 0);
      return;
    }

    let password = '';
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(length);
      crypto.getRandomValues(arr);
      for (let i = 0; i < length; i++) {
        password += pool[arr[i] % pool.length];
      }
    } else {
      for (let i = 0; i < length; i++) {
        password += pool[Math.floor(Math.random() * pool.length)];
      }
    }

    pwdOutput.value = password;
    updateStrength(password, pool.length);
  }

  function generatePassphrase() {
    const count = parseInt(ppWordCount.value, 10);
    const sep = ppSeparator.value;
    const cap = ppCapitalize.checked;

    let words = [];
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(count);
      crypto.getRandomValues(arr);
      for (let i = 0; i < count; i++) {
        let word = WORD_LIST[arr[i] % WORD_LIST.length];
        if (cap) word = word.charAt(0).toUpperCase() + word.slice(1);
        words.push(word);
      }
    } else {
      for (let i = 0; i < count; i++) {
        let word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
        if (cap) word = word.charAt(0).toUpperCase() + word.slice(1);
        words.push(word);
      }
    }

    const passphrase = words.join(sep);
    pwdOutput.value = passphrase;

    // Entropy for passphrase: count * log2(wordListSize)
    const entropy = count * Math.log2(WORD_LIST.length);
    const roundedEntropy = Math.round(entropy * 10) / 10;

    let label, color, pct;
    if (entropy < 40) {
      label = 'Weak'; color = '#FF3B30'; pct = 20;
    } else if (entropy < 60) {
      label = 'Fair'; color = '#FF9500'; pct = 40;
    } else if (entropy < 100) {
      label = 'Strong'; color = '#FFCC00'; pct = 70;
    } else {
      label = 'Very Strong'; color = '#34C759'; pct = 100;
    }

    pwdStrengthBar.style.width      = pct + '%';
    pwdStrengthBar.style.background = color;
    pwdStrengthLbl.textContent      = label;
    pwdStrengthLbl.style.color      = color;
    pwdEntropyLbl.textContent       = 'Entropy: ' + roundedEntropy + ' bits';
  }

  function updateStrength(password, poolSize) {
    if (!password || poolSize === 0) {
      pwdStrengthBar.style.width = '0%';
      pwdStrengthBar.style.background = 'var(--border)';
      pwdStrengthLbl.textContent = '-';
      pwdStrengthLbl.style.color = '';
      pwdEntropyLbl.textContent  = 'Entropy: 0 bits';
      return;
    }

    const entropy = password.length * Math.log2(poolSize);
    const roundedEntropy = Math.round(entropy * 10) / 10;

    let label, color, pct;
    if (entropy < 40) {
      label = 'Weak'; color = '#FF3B30'; pct = 20;
    } else if (entropy < 60) {
      label = 'Fair'; color = '#FF9500'; pct = 40;
    } else if (entropy < 100) {
      label = 'Strong'; color = '#FFCC00'; pct = 70;
    } else {
      label = 'Very Strong'; color = '#34C759'; pct = 100;
    }

    pwdStrengthBar.style.width      = pct + '%';
    pwdStrengthBar.style.background = color;
    pwdStrengthLbl.textContent      = label;
    pwdStrengthLbl.style.color      = color;
    pwdEntropyLbl.textContent       = 'Entropy: ' + roundedEntropy + ' bits';
  }

  pwdGenerateBtn.addEventListener('click', () => {
    if (isPassphraseMode) {
      generatePassphrase();
    } else {
      generatePassword();
    }
  });

  pwdCopyBtn.addEventListener('click', () => {
    if (pwdOutput.value) {
      copyToClipboard(pwdOutput.value);
      flashIconButton(pwdCopyBtn);
    }
  });

  pwdRegenBtn.addEventListener('click', () => {
    if (isPassphraseMode) {
      generatePassphrase();
    } else {
      generatePassword();
    }
  });

  // Generate an initial password on load
  generatePassword();

  /* ===========================================================
     2. JSON FORMATTER / VALIDATOR (with Minify + Tree View)
     =========================================================== */
  const jsonInput       = document.getElementById('json-input');
  const jsonFormatBtn   = document.getElementById('json-format-btn');
  const jsonMinifyBtn   = document.getElementById('json-minify-btn');
  const jsonTreeBtn     = document.getElementById('json-tree-btn');
  const jsonCopyBtn     = document.getElementById('json-copy-btn');
  const jsonDownloadBtn = document.getElementById('json-download-btn');
  const jsonError       = document.getElementById('json-error');
  const jsonOutput      = document.getElementById('json-output');
  const jsonTreeView    = document.getElementById('json-tree-view');

  let lastFormattedJson = '';
  let lastParsedObj     = null;
  let isTreeViewVisible = false;

  function syntaxHighlightJSON(jsonStr) {
    let escaped = jsonStr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    escaped = escaped.replace(
      /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g,
      (match) => {
        let cls = 'json-string';
        if (match.endsWith(':')) {
          cls = 'json-key';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      }
    );

    escaped = escaped.replace(
      /\b(-?\d+(\.\d+)?([eE][+-]?\d+)?)\b/g,
      '<span class="json-number">$1</span>'
    );

    escaped = escaped.replace(
      /\b(true|false|null)\b/g,
      '<span class="json-bool">$1</span>'
    );

    escaped = escaped.replace(
      /([{}\[\]])/g,
      '<span class="json-bracket">$1</span>'
    );

    return escaped;
  }

  function buildTreeView(obj, key) {
    const div = document.createElement('div');

    if (obj === null) {
      const span = document.createElement('span');
      if (key !== undefined) {
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = '"' + key + '": ';
        span.appendChild(keySpan);
      }
      const valSpan = document.createElement('span');
      valSpan.className = 'tree-null';
      valSpan.textContent = 'null';
      span.appendChild(valSpan);
      return span;
    }

    const isObj = typeof obj === 'object' && obj !== null;
    const isArray = Array.isArray(obj);

    if (isObj) {
      const keys = Object.keys(obj);
      const wrapper = document.createElement('div');

      if (keys.length > 0) {
        wrapper.className = 'tree-collapsible';

        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        let label = '';
        if (key !== undefined) {
          label += '<span class="tree-key">"' + key + '"</span>: ';
        }
        label += (isArray ? 'Array[' + keys.length + ']' : 'Object{' + keys.length + '}');
        toggle.innerHTML = label;

        const children = document.createElement('div');
        children.className = 'tree-children';

        keys.forEach(k => {
          children.appendChild(buildTreeView(obj[k], isArray ? undefined : k));
        });

        toggle.addEventListener('click', () => {
          wrapper.classList.toggle('tree-collapsed');
        });

        wrapper.appendChild(toggle);
        wrapper.appendChild(children);
      } else {
        const span = document.createElement('span');
        let label = '';
        if (key !== undefined) {
          label += '<span class="tree-key">"' + key + '"</span>: ';
        }
        label += isArray ? '[]' : '{}';
        span.innerHTML = label;
        wrapper.appendChild(span);
      }

      return wrapper;
    } else {
      const span = document.createElement('span');
      if (key !== undefined) {
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = '"' + key + '": ';
        span.appendChild(keySpan);
      }

      const valSpan = document.createElement('span');
      if (typeof obj === 'string') {
        valSpan.className = 'tree-string';
        valSpan.textContent = '"' + obj + '"';
      } else if (typeof obj === 'number') {
        valSpan.className = 'tree-number';
        valSpan.textContent = obj;
      } else if (typeof obj === 'boolean') {
        valSpan.className = 'tree-bool';
        valSpan.textContent = obj;
      }
      span.appendChild(valSpan);
      return span;
    }
  }

  function parseAndFormat(action) {
    jsonError.style.display = 'none';
    jsonOutput.innerHTML    = '';
    jsonTreeView.innerHTML  = '';
    lastFormattedJson       = '';
    lastParsedObj           = null;

    const raw = jsonInput.value.trim();
    if (!raw) {
      jsonError.textContent  = 'Please enter some JSON.';
      jsonError.style.display = 'block';
      return;
    }

    try {
      const obj = JSON.parse(raw);
      lastParsedObj = obj;

      if (action === 'minify') {
        const minified = JSON.stringify(obj);
        lastFormattedJson = minified;
        jsonOutput.innerHTML = syntaxHighlightJSON(minified);
      } else {
        const formatted = JSON.stringify(obj, null, 2);
        lastFormattedJson = formatted;
        jsonOutput.innerHTML = syntaxHighlightJSON(formatted);
      }
    } catch (e) {
      let msg = e.message || 'Invalid JSON';
      jsonError.textContent  = 'Error: ' + msg;
      jsonError.style.display = 'block';
    }
  }

  jsonFormatBtn.addEventListener('click', () => parseAndFormat('format'));
  jsonMinifyBtn.addEventListener('click', () => parseAndFormat('minify'));

  jsonTreeBtn.addEventListener('click', () => {
    if (!lastParsedObj) {
      // Try to parse first
      const raw = jsonInput.value.trim();
      if (!raw) return;
      try {
        lastParsedObj = JSON.parse(raw);
      } catch (e) {
        jsonError.textContent  = 'Error: ' + (e.message || 'Invalid JSON');
        jsonError.style.display = 'block';
        return;
      }
    }

    isTreeViewVisible = !isTreeViewVisible;

    if (isTreeViewVisible) {
      jsonOutput.style.display = 'none';
      jsonTreeView.style.display = '';
      jsonTreeView.innerHTML = '';
      jsonTreeView.appendChild(buildTreeView(lastParsedObj));
      jsonTreeBtn.textContent = 'Code View';
    } else {
      jsonOutput.style.display = '';
      jsonTreeView.style.display = 'none';
      jsonTreeBtn.textContent = 'Tree View';
    }
  });

  jsonCopyBtn.addEventListener('click', () => {
    if (lastFormattedJson) {
      copyToClipboard(lastFormattedJson);
      flashCopyButton(jsonCopyBtn);
    }
  });

  jsonDownloadBtn.addEventListener('click', () => {
    if (!lastFormattedJson) return;
    const blob = new Blob([lastFormattedJson], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'formatted.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  /* ===========================================================
     3. HTML TO MARKDOWN CONVERTER
     =========================================================== */
  const htmlInput      = document.getElementById('html-input');
  const htmlConvertBtn = document.getElementById('html-convert-btn');
  const htmlCopyBtn    = document.getElementById('html-copy-btn');
  const htmlOutput     = document.getElementById('html-output');

  function htmlToMarkdown(html) {
    let md = html;

    // Remove <!DOCTYPE> and structural tags
    md = md.replace(/<!DOCTYPE[^>]*>/gi, '');
    md = md.replace(/<\/?(html|head|body|title|meta|link|style|script)[^>]*>/gi, '');

    // Headings h1-h6
    md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (m, c) => '# ' + c.trim() + '\n\n');
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (m, c) => '## ' + c.trim() + '\n\n');
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (m, c) => '### ' + c.trim() + '\n\n');
    md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (m, c) => '#### ' + c.trim() + '\n\n');
    md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (m, c) => '##### ' + c.trim() + '\n\n');
    md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (m, c) => '###### ' + c.trim() + '\n\n');

    // Horizontal rule
    md = md.replace(/<hr\s*\/?>/gi, '\n---\n\n');

    // Bold / strong
    md = md.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');

    // Italic / em
    md = md.replace(/<(i|em)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');

    // Strikethrough
    md = md.replace(/<(s|strike|del)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~');

    // Images (before links)
    md = md.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![$1]($2)');
    md = md.replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)');
    md = md.replace(/<img[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![]($1)');

    // Links
    md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // Pre/code blocks (triple backtick)
    md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n\n');
    md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n\n');

    // Inline code
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // Blockquote
    md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
      const lines = content.replace(/<[^>]+>/g, '').trim().split('\n');
      return lines.map(l => '> ' + l.trim()).join('\n') + '\n\n';
    });

    // Tables
    md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match, content) => {
      let result = '\n';
      // Extract headers
      const headMatch = content.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
      const bodyMatch = content.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
      
      const headerRow = content.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
      if (headerRow) {
        const cells = [...headerRow[1].matchAll(/<t[hH][^>]*>([\s\S]*?)<\/t[hH]>/g)];
        if (cells.length > 0) {
          const headers = cells.map(c => c[1].replace(/<[^>]+>/g, '').trim());
          result += '| ' + headers.join(' | ') + ' |\n';
          result += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
        }
      }

      // Extract body rows
      const rows = [...content.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      rows.forEach((rowMatch, idx) => {
        if (idx === 0 && headerRow) return; // skip first if it was header
        const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
        if (cells.length > 0) {
          const vals = cells.map(c => c[1].replace(/<[^>]+>/g, '').trim());
          result += '| ' + vals.join(' | ') + ' |\n';
        }
      });

      return result + '\n';
    });

    // Unordered lists
    md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
      let items = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
      return '\n' + items + '\n';
    });

    // Ordered lists
    md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
      let idx = 1;
      let items = content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (liMatch, liContent) => {
        return idx++ + '. ' + liContent + '\n';
      });
      return '\n' + items + '\n';
    });

    // Paragraphs
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');

    // Line breaks
    md = md.replace(/<br\s*\/?>/gi, '\n');

    // Remove remaining tags
    md = md.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    md = md.replace(/&amp;/g, '&');
    md = md.replace(/&lt;/g, '<');
    md = md.replace(/&gt;/g, '>');
    md = md.replace(/&quot;/g, '"');
    md = md.replace(/&#39;/g, "'");
    md = md.replace(/&nbsp;/g, ' ');

    // Clean up excessive newlines (max 2 consecutive)
    md = md.replace(/\n{3,}/g, '\n\n');

    return md.trim();
  }

  htmlConvertBtn.addEventListener('click', () => {
    const raw = htmlInput.value;
    if (!raw.trim()) {
      htmlOutput.value = '';
      return;
    }
    htmlOutput.value = htmlToMarkdown(raw);
  });

  htmlCopyBtn.addEventListener('click', () => {
    if (htmlOutput.value) {
      copyToClipboard(htmlOutput.value);
      flashCopyButton(htmlCopyBtn);
    }
  });

  /* ===========================================================
     4. BULK CREDIT CARD VALIDATOR (Luhn Algorithm + Brand Detection)
     =========================================================== */
  const ccInput       = document.getElementById('cc-input');
  const ccValidateBtn = document.getElementById('cc-validate-btn');
  const ccResults     = document.getElementById('cc-results');

  function luhnCheck(num) {
    const clean = num.replace(/\D/g, '');
    if (!clean || clean.length < 2) return false;

    let sum = 0;
    let shouldDouble = false;

    for (let i = clean.length - 1; i >= 0; i--) {
      let digit = parseInt(clean[i], 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  function maskCardNumber(num) {
    const clean = num.replace(/\D/g, '');
    if (clean.length <= 10) return clean;
    const first6 = clean.substring(0, 6);
    const last4  = clean.substring(clean.length - 4);
    const middle = '\u2022'.repeat(clean.length - 10);
    return first6 + middle + last4;
  }

  function getCardBrand(num) {
    const clean = num.replace(/\D/g, '');
    if (/^4/.test(clean))                          return { name: 'Visa',       cls: 'visa' };
    if (/^5[1-5]/.test(clean))                     return { name: 'Mastercard', cls: 'mastercard' };
    if (/^2[2-7]/.test(clean))                     return { name: 'Mastercard', cls: 'mastercard' };
    if (/^3[47]/.test(clean))                      return { name: 'Amex',       cls: 'amex' };
    if (/^6011/.test(clean))                       return { name: 'Discover',   cls: 'discover' };
    if (/^65/.test(clean))                         return { name: 'Discover',   cls: 'discover' };
    if (/^64[4-9]/.test(clean))                    return { name: 'Discover',   cls: 'discover' };
    if (/^3(?:0[0-5]|[68])/.test(clean))           return { name: 'Diners',     cls: 'diners' };
    if (/^35/.test(clean))                         return { name: 'JCB',        cls: 'jcb' };
    if (/^62/.test(clean))                         return { name: 'UnionPay',   cls: 'unionpay' };
    return { name: 'Unknown', cls: 'unknown' };
  }

  ccValidateBtn.addEventListener('click', () => {
    ccResults.innerHTML = '';
    const lines = ccInput.value.split('\n').filter(l => l.trim());

    if (!lines.length) {
      ccResults.innerHTML = '<div class="cc-card"><span style="color:var(--text-sec)">Enter card numbers above (one per line).</span></div>';
      return;
    }

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const isValid = luhnCheck(trimmed);
      const masked  = maskCardNumber(trimmed);
      const brand   = getCardBrand(trimmed);

      const card = document.createElement('div');
      card.className = 'cc-card';
      card.innerHTML =
        '<span class="cc-number">' + masked + '</span>' +
        '<span class="cc-badge ' + brand.cls + '">' + brand.name + '</span>' +
        '<span class="cc-status ' + (isValid ? 'valid' : 'invalid') + '">' +
        (isValid ? 'Valid' : 'Invalid') + '</span>';

      ccResults.appendChild(card);
    });
  });

  /* ===========================================================
     5. IBAN VALIDATOR
     =========================================================== */
  const ibanInput       = document.getElementById('iban-input');
  const ibanValidateBtn = document.getElementById('iban-validate-btn');
  const ibanResult      = document.getElementById('iban-result');

  function validateIBAN(raw) {
    const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (cleaned.length < 5) {
      return { valid: false, error: 'IBAN too short', cleaned };
    }

    const countryCode = cleaned.substring(0, 2);
    const checkDigits = cleaned.substring(2, 4);
    const bban        = cleaned.substring(4);

    const rearranged = bban + cleaned.substring(0, 4);

    let numericString = '';
    for (let i = 0; i < rearranged.length; i++) {
      const ch = rearranged[i];
      if (/[A-Z]/.test(ch)) {
        numericString += (ch.charCodeAt(0) - 55);
      } else {
        numericString += ch;
      }
    }

    let remainder = 0;
    for (let i = 0; i < numericString.length; i++) {
      remainder = (remainder * 10 + parseInt(numericString[i], 10)) % 97;
    }

    const isValid = remainder === 1;

    return {
      valid: isValid,
      cleaned,
      countryCode,
      checkDigits,
      bban,
      rearranged,
      numericString,
      remainder
    };
  }

  ibanValidateBtn.addEventListener('click', () => {
    ibanResult.innerHTML = '';

    const raw = ibanInput.value.trim();
    if (!raw) {
      ibanResult.innerHTML = '<div class="iban-steps" style="color:var(--text-sec)">Enter an IBAN to validate.</div>';
      return;
    }

    const result = validateIBAN(raw);

    let html = '<div class="iban-summary">';

    if (result.error) {
      html += '<span class="iban-status invalid">' + result.error + '</span>';
      html += '</div>';
      ibanResult.innerHTML = html;
      return;
    }

    html += '<span class="iban-status ' + (result.valid ? 'valid' : 'invalid') + '">' +
            (result.valid ? 'Valid IBAN' : 'Invalid IBAN') + '</span>';
    html += '<span class="iban-field">Country: <strong>' + result.countryCode + '</strong></span>';
    html += '<span class="iban-field">Check: <strong>' + result.checkDigits + '</strong></span>';
    html += '<span class="iban-field">BBAN: <strong>' + result.bban + '</strong></span>';
    html += '</div>';

    html += '<div class="iban-steps">';
    html += '<div class="step-row"><span class="step-label">Step 1:</span> Remove spaces &rarr; <span class="step-value">' + result.cleaned + '</span></div>';
    html += '<div class="step-row"><span class="step-label">Step 2:</span> Move first 4 chars to end &rarr; <span class="step-value">' + result.rearranged + '</span></div>';
    html += '<div class="step-row"><span class="step-label">Step 3:</span> Convert letters to numbers &rarr; <span class="step-value">' + result.numericString + '</span></div>';
    html += '<div class="step-row"><span class="step-label">Step 4:</span> Calculate mod 97 &rarr; <span class="step-value">' + result.remainder + '</span></div>';
    html += '<div class="step-row"><span class="step-label">Step 5:</span> Result is ' + result.remainder + ' &rarr; <span class="step-value">' +
            (result.valid ? '1 = Valid!' : result.remainder + ' &ne; 1 = Invalid') + '</span></div>';
    html += '</div>';

    ibanResult.innerHTML = html;
  });

  /* ===========================================================
     6. BIN GENERATOR (FIXED: quantity input, pipe format, 2027-2030)
     =========================================================== */
  const binInput       = document.getElementById('bin-input');
  const binQuantity    = document.getElementById('bin-quantity');
  const binGenerateBtn = document.getElementById('bin-generate-btn');
  const binCopyBtn     = document.getElementById('bin-copy-btn');
  const binResults     = document.getElementById('bin-results');

  let generatedCards = [];

  /**
   * Generate a Luhn-valid 16-digit card number from a 6-digit BIN prefix.
   */
  function generateLuhnCard(bin6) {
    let partial = bin6;
    for (let i = 0; i < 9; i++) {
      partial += Math.floor(Math.random() * 10).toString();
    }

    let sum = 0;
    for (let i = 0; i < 15; i++) {
      const posFromRight = 15 - i;
      let digit = parseInt(partial[i], 10);
      if (posFromRight % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return partial + checkDigit.toString();
  }

  /**
   * Generate a random expiry: month (01-12), year (2027-2030)
   */
  function randomExpiry() {
    const month = (Math.floor(Math.random() * 12) + 1).toString().padStart(2, '0');
    const year  = 2027 + Math.floor(Math.random() * 4); // 2027-2030
    return { month, year };
  }

  /**
   * Generate a random 3-digit CVV.
   */
  function randomCVV() {
    return Math.floor(Math.random() * 900 + 100).toString();
  }

  binGenerateBtn.addEventListener('click', () => {
    binResults.innerHTML  = '';
    generatedCards        = [];

    const bin = binInput.value.trim();
    const qty = Math.min(Math.max(parseInt(binQuantity.value, 10) || 10, 1), 100);
    binQuantity.value = qty;

    if (!/^\d{6}$/.test(bin)) {
      binResults.innerHTML = '<div class="bin-row" style="color:var(--red);justify-content:center;">Please enter exactly 6 digits for the BIN prefix.</div>';
      return;
    }

    for (let i = 0; i < qty; i++) {
      const cardNum = generateLuhnCard(bin);
      const { month, year } = randomExpiry();
      const cvv     = randomCVV();

      const card = { number: cardNum, month, year, cvv };
      generatedCards.push(card);

      const row = document.createElement('div');
      row.className = 'bin-row';
      row.innerHTML =
        '<span class="bin-number">' + cardNum + '</span>' +
        '<span class="pipe-sep">|</span>' +
        '<span class="bin-month">' + month + '</span>' +
        '<span class="pipe-sep">|</span>' +
        '<span class="bin-year">' + year + '</span>' +
        '<span class="pipe-sep">|</span>' +
        '<span class="bin-cvv">' + cvv + '</span>' +
        '<button class="copy-single" title="Copy this line">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
        '</button>';

      // Copy single line
      const copyBtn = row.querySelector('.copy-single');
      const lineText = cardNum + '|' + month + '|' + year + '|' + cvv;
      copyBtn.addEventListener('click', () => {
        copyToClipboard(lineText);
        flashIconButton(copyBtn);
      });

      binResults.appendChild(row);
    }
  });

  binCopyBtn.addEventListener('click', () => {
    if (!generatedCards.length) return;

    const text = generatedCards.map(c =>
      c.number + '|' + c.month + '|' + c.year + '|' + c.cvv
    ).join('\n');

    copyToClipboard(text);
    flashCopyButton(binCopyBtn);
  });

}); // end DOMContentLoaded
