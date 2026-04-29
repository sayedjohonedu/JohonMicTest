/* ============================================
   MicTab Text Utilities — script.js
   All 9 sub-applications in vanilla ES6
   Enhanced iOS Cream Theme Edition
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Show a toast notification (iOS-style, replaces alert/prompt/confirm)
   * @param {string} message - Text to display
   */
  function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    // Auto-remove after animation
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2600);
  }

  /**
   * Shorthand for document.getElementById
   */
  const $ = (id) => document.getElementById(id);

  /**
   * Copy text to clipboard with toast feedback
   * @param {string} text - Text to copy
   */
  function copyToClipboard(text) {
    if (!text || text.startsWith('Your converted') || text.startsWith('Result will') || text.startsWith('Number in') || text.startsWith('Morse trans') || text.startsWith('Converted') || text.startsWith('Fancy text') || text.startsWith('Rendered') || text.startsWith('Enter some')) {
      showToast('Nothing to copy');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy');
    });
  }

  // ============================================
  // TAB BAR NAVIGATION (horizontal scrollable)
  // ============================================

  const tabBar = $('tabBar');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const toolPanels = document.querySelectorAll('.tool-panel');

  /**
   * Switch active tool panel and highlight tab button
   */
  function switchTool(toolId) {
    // Update tab buttons
    tabBtns.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[data-tool="${toolId}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      // Scroll the active tab into view
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    // Update panels
    toolPanels.forEach(panel => panel.classList.remove('active'));
    const targetPanel = $(`tool-${toolId}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
  }

  // Tab button click handlers
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTool(btn.dataset.tool);
    });
  });


  // ============================================
  // 1. WORD & CHARACTER COUNTER (ENHANCED)
  // ============================================

  const wcInput = $('wc-input');
  const wcWords = $('wc-words');
  const wcChars = $('wc-chars');
  const wcCharsNoSpace = $('wc-chars-no-space');
  const wcSentences = $('wc-sentences');
  const wcParagraphs = $('wc-paragraphs');
  const wcReadingTime = $('wc-reading-time');
  const wcAvgWordLen = $('wc-avg-word-len');
  const wcLongestWord = $('wc-longest-word');
  const wcMostFrequent = $('wc-most-frequent');

  /**
   * Count text statistics and update the display
   * Enhanced with: average word length, longest word, most frequent word
   */
  function updateWordCount() {
    const text = wcInput.value;
    const trimmed = text.trim();

    // Characters
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;

    // Words (split on whitespace, filter empty)
    const wordList = trimmed === '' ? [] : trimmed.split(/\s+/);
    const words = wordList.length;

    // Sentences (split on . ! ? followed by space or end)
    const sentences = trimmed === '' ? 0 : (trimmed.match(/[.!?]+(\s|$)/g) || []).length || (trimmed.length > 0 ? 1 : 0);

    // Paragraphs (split on double newline or single newline with content)
    const paragraphs = trimmed === '' ? 0 : trimmed.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || (trimmed.length > 0 ? 1 : 0);

    // Reading time (avg 200 wpm)
    const readingTimeMin = words / 200;
    let readingTimeStr;
    if (readingTimeMin < 1) {
      readingTimeStr = `${Math.max(1, Math.ceil(readingTimeMin * 60))}s`;
    } else {
      readingTimeStr = `${Math.ceil(readingTimeMin)}min`;
    }

    // NEW: Average word length
    let avgWordLen = 0;
    if (words > 0) {
      const totalLetters = wordList.reduce((sum, w) => sum + w.replace(/[^a-zA-Z0-9]/g, '').length, 0);
      avgWordLen = (totalLetters / words).toFixed(1);
    }

    // NEW: Longest word
    let longestWord = '—';
    if (words > 0) {
      const cleaned = wordList.map(w => w.replace(/[^a-zA-Z0-9'-]/g, '')).filter(Boolean);
      if (cleaned.length > 0) {
        longestWord = cleaned.reduce((a, b) => a.length >= b.length ? a : b, '');
      }
    }

    // NEW: Most frequent word
    let mostFrequent = '—';
    if (words > 0) {
      const freq = {};
      wordList.forEach(w => {
        const key = w.toLowerCase().replace(/[^a-z0-9'-]/g, '');
        if (key) {
          freq[key] = (freq[key] || 0) + 1;
        }
      });
      const entries = Object.entries(freq);
      if (entries.length > 0) {
        const top = entries.reduce((a, b) => a[1] >= b[1] ? a : b, entries[0]);
        mostFrequent = top[1] > 1 ? `"${top[0]}" (${top[1]}×)` : `"${top[0]}" (1×)`;
      }
    }

    // Update DOM
    wcWords.textContent = words;
    wcChars.textContent = chars;
    wcCharsNoSpace.textContent = charsNoSpace;
    wcSentences.textContent = sentences;
    wcParagraphs.textContent = paragraphs;
    wcReadingTime.textContent = words === 0 ? '0s' : readingTimeStr;
    wcAvgWordLen.textContent = avgWordLen;
    wcLongestWord.textContent = longestWord;
    wcMostFrequent.textContent = mostFrequent;
  }

  wcInput.addEventListener('keyup', updateWordCount);
  wcInput.addEventListener('input', updateWordCount);


  // ============================================
  // 2. CASE CONVERTER (ENHANCED)
  // ============================================

  const caseInput = $('case-input');
  const caseOutput = $('case-output');

  /**
   * Convert text to a specified case style
   * Enhanced with: alternating case, sentence case, reverse text
   * @param {string} text - Input text
   * @param {string} caseType - One of: upper, lower, title, camel, snake, alternating, sentence, reverse
   * @returns {string} Converted text
   */
  function convertCase(text, caseType) {
    switch (caseType) {
      case 'upper':
        return text.toUpperCase();

      case 'lower':
        return text.toLowerCase();

      case 'title':
        return text.replace(/\w\S*/g, (word) =>
          word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()
        );

      case 'camel': {
        const parts = text.split(/[\s_\-]+/).filter(Boolean);
        if (parts.length === 0) return '';
        return parts[0].toLowerCase() + parts.slice(1).map(p =>
          p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
        ).join('');
      }

      case 'snake':
        return text
          .replace(/([a-z])([A-Z])/g, '$1_$2')
          .replace(/[\s\-]+/g, '_')
          .replace(/_+/g, '_')
          .toLowerCase();

      case 'alternating': {
        // aLtErNaTiNg CaSe
        let idx = 0;
        return [...text].map(ch => {
          if (/[a-zA-Z]/.test(ch)) {
            const result = idx % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase();
            idx++;
            return result;
          }
          return ch;
        }).join('');
      }

      case 'sentence': {
        // Sentence case: capitalize first letter after . ! ? or start
        return text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (match) =>
          match.toUpperCase()
        );
      }

      case 'reverse':
        return [...text].reverse().join('');

      default:
        return text;
    }
  }

  // Case converter button handlers
  document.querySelectorAll('[data-case]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = caseInput.value;
      if (!text) {
        caseOutput.textContent = 'Please enter some text first...';
        return;
      }
      caseOutput.textContent = convertCase(text, btn.dataset.case);
    });
  });

  // Copy button for case converter
  const caseCopyBtn = $('case-copy-btn');
  if (caseCopyBtn) {
    caseCopyBtn.addEventListener('click', () => {
      copyToClipboard(caseOutput.textContent);
    });
  }


  // ============================================
  // 3. FIND & REPLACE (ENHANCED)
  // ============================================

  const frInput = $('fr-input');
  const frFind = $('fr-find');
  const frReplaceInput = $('fr-replace');
  const frOutput = $('fr-output');
  const frReplaceBtn = $('fr-replace-btn');
  const frReplaceAllBtn = $('fr-replace-all-btn');
  const frCaseSensitive = $('fr-case-sensitive');
  const frRegex = $('fr-regex');
  const frMatchCount = $('fr-match-count');

  /** Track current index for incremental replace */
  let frLastIndex = -1;

  /**
   * Build a RegExp from find input considering case-sensitive and regex toggles
   * @returns {RegExp|null}
   */
  function buildFindRegex() {
    const findVal = frFind.value;
    if (!findVal) return null;

    try {
      if (frRegex.checked) {
        // Use raw regex input
        return new RegExp(findVal, frCaseSensitive.checked ? 'g' : 'gi');
      } else {
        // Escape special regex chars
        const escaped = findVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped, frCaseSensitive.checked ? 'g' : 'gi');
      }
    } catch (e) {
      // Invalid regex
      return null;
    }
  }

  /**
   * Count matches in the text
   * @returns {number}
   */
  function countMatches() {
    const text = frInput.value;
    const findVal = frFind.value;
    if (!text || !findVal) return 0;

    const regex = buildFindRegex();
    if (!regex) return 0;

    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Update the find & replace display with highlighted matches and count
   */
  function updateFindReplace() {
    const text = frInput.value;
    const findVal = frFind.value;

    if (!text) {
      frOutput.textContent = 'Enter some text to search in...';
      frMatchCount.textContent = '0 matches';
      frMatchCount.className = 'match-count zero';
      return;
    }
    if (!findVal) {
      frOutput.textContent = text;
      frMatchCount.textContent = '0 matches';
      frMatchCount.className = 'match-count zero';
      return;
    }

    const regex = buildFindRegex();
    if (!regex) {
      frOutput.textContent = text;
      frMatchCount.textContent = '⚠ Invalid regex';
      frMatchCount.className = 'match-count zero';
      return;
    }

    // Count matches
    const count = countMatches();
    frMatchCount.textContent = `${count} match${count !== 1 ? 'es' : ''}`;
    frMatchCount.className = count === 0 ? 'match-count zero' : 'match-count';

    // Highlight all matches in the output
    const highlighted = text.replace(regex, (match) =>
      `\u3010${match}\u3011`
    );
    frOutput.textContent = highlighted;
  }

  frInput.addEventListener('keyup', updateFindReplace);
  frInput.addEventListener('input', updateFindReplace);
  frFind.addEventListener('keyup', updateFindReplace);
  frFind.addEventListener('input', updateFindReplace);
  frReplaceInput.addEventListener('keyup', updateFindReplace);
  frCaseSensitive.addEventListener('change', updateFindReplace);
  frRegex.addEventListener('change', updateFindReplace);

  // Replace (next occurrence)
  frReplaceBtn.addEventListener('click', () => {
    const text = frInput.value;
    const findVal = frFind.value;
    const replaceVal = frReplaceInput.value;

    if (!findVal) {
      showToast('Enter a search term first');
      return;
    }

    const regex = buildFindRegex();
    if (!regex) {
      showToast('Invalid regex pattern');
      return;
    }

    // For incremental replace, we need to find the next match after frLastIndex
    const caseSensitive = frCaseSensitive.checked;
    let searchStr = caseSensitive ? text : text.toLowerCase();
    let findStr = caseSensitive ? findVal : findVal.toLowerCase();

    if (frRegex.checked) {
      // For regex, use exec to find next match
      const flags = caseSensitive ? 'g' : 'gi';
      const re = new RegExp(findVal, flags);
      re.lastIndex = frLastIndex + 1;
      const match = re.exec(text);
      if (match) {
        const before = text.substring(0, match.index);
        const after = text.substring(match.index + match[0].length);
        frInput.value = before + replaceVal + after;
        frLastIndex = match.index + replaceVal.length - 1;
        updateFindReplace();
        showToast('Replaced 1 occurrence');
        return;
      }
      // Wrap around
      re.lastIndex = 0;
      const wrapMatch = re.exec(text);
      if (wrapMatch) {
        const before = text.substring(0, wrapMatch.index);
        const after = text.substring(wrapMatch.index + wrapMatch[0].length);
        frInput.value = before + replaceVal + after;
        frLastIndex = wrapMatch.index + replaceVal.length - 1;
        updateFindReplace();
        showToast('Replaced 1 occurrence (wrapped)');
        return;
      }
      showToast('No matches found');
      return;
    }

    // Non-regex: simple string search
    const idx = searchStr.indexOf(findStr, frLastIndex + 1);
    if (idx === -1) {
      // Wrap around
      frLastIndex = -1;
      const wrapIdx = searchStr.indexOf(findStr);
      if (wrapIdx === -1) {
        showToast('No matches found');
        return;
      }
      frInput.value = text.substring(0, wrapIdx) + replaceVal + text.substring(wrapIdx + findStr.length);
      frLastIndex = wrapIdx + replaceVal.length - 1;
    } else {
      frInput.value = text.substring(0, idx) + replaceVal + text.substring(idx + findStr.length);
      frLastIndex = idx + replaceVal.length - 1;
    }
    updateFindReplace();
    showToast('Replaced 1 occurrence');
  });

  // Replace All
  frReplaceAllBtn.addEventListener('click', () => {
    const text = frInput.value;
    const findVal = frFind.value;
    const replaceVal = frReplaceInput.value;

    if (!findVal) {
      showToast('Enter a search term first');
      return;
    }

    const regex = buildFindRegex();
    if (!regex) {
      showToast('Invalid regex pattern');
      return;
    }

    const count = countMatches();

    if (count === 0) {
      showToast('No matches found');
      return;
    }

    frInput.value = text.replace(regex, replaceVal);
    frLastIndex = -1;
    updateFindReplace();
    showToast(`Replaced ${count} occurrence${count > 1 ? 's' : ''}`);
  });


  // ============================================
  // 4. REMOVE LINE BREAKS
  // ============================================

  const rlbInput = $('rlb-input');
  const rlbToggle = $('rlb-toggle');
  const rlbCollapse = $('rlb-collapse');
  const rlbOutput = $('rlb-output');

  /**
   * Process line break removal based on toggle states
   */
  function updateRemoveLineBreaks() {
    let text = rlbInput.value;

    if (!text) {
      rlbOutput.textContent = 'Result will appear here...';
      return;
    }

    if (rlbToggle.checked) {
      text = text.replace(/\r?\n/g, ' ');
    }

    if (rlbCollapse.checked) {
      text = text.replace(/ {2,}/g, ' ');
    }

    rlbOutput.textContent = text;
  }

  rlbInput.addEventListener('keyup', updateRemoveLineBreaks);
  rlbInput.addEventListener('input', updateRemoveLineBreaks);
  rlbToggle.addEventListener('change', updateRemoveLineBreaks);
  rlbCollapse.addEventListener('change', updateRemoveLineBreaks);

  // Copy button
  const rlbCopyBtn = $('rlb-copy-btn');
  if (rlbCopyBtn) {
    rlbCopyBtn.addEventListener('click', () => {
      copyToClipboard(rlbOutput.textContent);
    });
  }


  // ============================================
  // 5. TEXT TO BINARY / HEX
  // ============================================

  const bhInput = $('bh-input');
  const bhOutput = $('bh-output');
  let bhMode = 'text-to-binary';

  // Mode switching
  document.querySelectorAll('[data-bh-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-bh-mode]').forEach(b => b.classList.remove('active-mode'));
      btn.classList.add('active-mode');
      bhMode = btn.dataset.bhMode;
      updateBinaryHex();
    });
  });

  /**
   * Convert between text, binary, and hex based on current mode
   */
  function updateBinaryHex() {
    const text = bhInput.value.trim();

    if (!text) {
      bhOutput.textContent = 'Converted output will appear here...';
      return;
    }

    let result = '';

    switch (bhMode) {
      case 'text-to-binary':
        result = [...text].map(ch => ch.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
        break;

      case 'binary-to-text': {
        const parts = text.split(/\s+/).filter(Boolean);
        try {
          result = parts.map(bin => {
            const code = parseInt(bin, 2);
            if (isNaN(code)) throw new Error('Invalid binary');
            return String.fromCharCode(code);
          }).join('');
        } catch (e) {
          result = '⚠ Invalid binary input. Use space-separated 8-bit groups (e.g., 01001000 01101001).';
        }
        break;
      }

      case 'text-to-hex':
        result = [...text].map(ch => ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(' ');
        break;

      case 'hex-to-text': {
        const hexParts = text.split(/\s+/).filter(Boolean);
        try {
          result = hexParts.map(hex => {
            const code = parseInt(hex, 16);
            if (isNaN(code)) throw new Error('Invalid hex');
            return String.fromCharCode(code);
          }).join('');
        } catch (e) {
          result = '⚠ Invalid hex input. Use space-separated hex bytes (e.g., 48 65 6C 6C 6F).';
        }
        break;
      }
    }

    bhOutput.textContent = result;
  }

  bhInput.addEventListener('keyup', updateBinaryHex);
  bhInput.addEventListener('input', updateBinaryHex);

  // Copy button
  const bhCopyBtn = $('bh-copy-btn');
  if (bhCopyBtn) {
    bhCopyBtn.addEventListener('click', () => {
      copyToClipboard(bhOutput.textContent);
    });
  }


  // ============================================
  // 6. MARKDOWN TO HTML (ENHANCED)
  // ============================================

  const mdInput = $('md-input');
  const mdOutput = $('md-output');

  /**
   * Enhanced Markdown to HTML parser
   * Supports: headings, bold, italic, strikethrough, links, code blocks,
   * inline code, blockquotes, horizontal rules, unordered/ordered lists,
   * task lists, tables, paragraphs
   * @param {string} md - Raw markdown text
   * @returns {string} HTML string
   */
  function parseMarkdown(md) {
    // Store code blocks to protect from further processing
    const codeBlocks = [];
    const inlineCodes = [];

    // Extract fenced code blocks (```...```)
    md = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      const langClass = lang ? ` class="language-${lang}"` : '';
      const highlighted = syntaxHighlight(code.trimEnd(), lang);
      codeBlocks.push(`<pre><code${langClass}>${highlighted}</code></pre>`);
      return `%%CODEBLOCK${idx}%%`;
    });

    // Extract inline code (`...`)
    md = md.replace(/`([^`\n]+?)`/g, (_, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
      return `%%INLINECODE${idx}%%`;
    });

    // Split into lines for block-level processing
    const lines = md.split('\n');
    const html = [];
    let inList = false;
    let listType = ''; // 'ul' or 'ol'
    let inParagraph = false;
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code block placeholder — output as-is
      if (/^%%CODEBLOCK\d+%%$/.test(line.trim())) {
        closeListAndParagraphAndTable();
        html.push(line.replace(/%%CODEBLOCK(\d+)%%/, (_, idx) => codeBlocks[parseInt(idx)]));
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
        closeListAndParagraphAndTable();
        html.push('<hr>');
        continue;
      }

      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        closeListAndParagraphAndTable();
        const level = headingMatch[1].length;
        const content = applyInline(headingMatch[2]);
        html.push(`<h${level}>${content}</h${level}>`);
        continue;
      }

      // Table row
      if (/^\|(.+)\|$/.test(line.trim())) {
        closeListAndParagraph();
        const cellLine = line.trim();
        // Check if separator row (|---|---|)
        if (/^\|[\s\-:]+\|$/.test(cellLine)) {
          // Skip separator, it's processed as part of table structure
          continue;
        }
        const cells = cellLine.split('|').filter((c, idx, arr) => idx > 0 && idx < arr.length);
        if (!inTable) {
          inTable = true;
          tableRows = [];
          // Header row
          tableRows.push(cells.map(c => `<th>${applyInline(c.trim())}</th>`).join(''));
        } else {
          tableRows.push(cells.map(c => `<td>${applyInline(c.trim())}</td>`).join(''));
        }
        continue;
      } else if (inTable) {
        // End of table
        closeTable();
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        closeListAndParagraphAndTable();
        const quoteContent = applyInline(line.replace(/^>\s?/, ''));
        html.push(`<blockquote><p>${quoteContent}</p></blockquote>`);
        continue;
      }

      // Task list item: - [ ] or - [x]
      const taskMatch = line.match(/^[\-\*]\s+\[([ xX])\]\s+(.+)$/);
      if (taskMatch) {
        closeParagraph();
        if (!inList || listType !== 'ul') {
          closeList();
          html.push('<ul class="task-list">');
          inList = true;
          listType = 'ul';
        }
        const checked = taskMatch[1] !== ' ';
        const text = applyInline(taskMatch[2]);
        html.push(`<li class="task-item"><span class="task-checkbox${checked ? ' checked' : ''}"></span><span class="task-text${checked ? ' done' : ''}">${text}</span></li>`);
        continue;
      }

      // Unordered list item
      const ulMatch = line.match(/^[\-\*]\s+(.+)$/);
      if (ulMatch) {
        closeParagraph();
        if (!inList || listType !== 'ul') {
          closeList();
          html.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        html.push(`<li>${applyInline(ulMatch[1])}</li>`);
        continue;
      }

      // Ordered list item
      const olMatch = line.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        closeParagraph();
        if (!inList || listType !== 'ol') {
          closeList();
          html.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        html.push(`<li>${applyInline(olMatch[1])}</li>`);
        continue;
      }

      // Code block placeholder (may have surrounding text)
      if (/%%CODEBLOCK\d+%%/.test(line)) {
        closeListAndParagraphAndTable();
        html.push(line.replace(/%%CODEBLOCK(\d+)%%/g, (_, idx) => codeBlocks[parseInt(idx)]));
        continue;
      }

      // Empty line — close list/paragraph
      if (line.trim() === '') {
        closeListAndParagraphAndTable();
        continue;
      }

      // Regular text — paragraph
      closeList();
      closeTable();
      if (!inParagraph) {
        html.push('<p>');
        inParagraph = true;
      } else {
        html.push('<br>');
      }
      html.push(applyInline(line));
    }

    closeListAndParagraphAndTable();

    // Restore inline code placeholders
    let result = html.join('\n');
    result = result.replace(/%%INLINECODE(\d+)%%/g, (_, idx) => inlineCodes[parseInt(idx)]);

    return result;

    // Helper: close open list
    function closeList() {
      if (inList) {
        html.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
        listType = '';
      }
    }

    // Helper: close open paragraph
    function closeParagraph() {
      if (inParagraph) {
        html.push('</p>');
        inParagraph = false;
      }
    }

    // Helper: close table
    function closeTable() {
      if (inTable) {
        const thead = tableRows.length > 0 ? `<thead><tr>${tableRows[0]}</tr></thead>` : '';
        const tbodyRows = tableRows.slice(1);
        const tbody = tbodyRows.length > 0 ? `<tbody>${tbodyRows.map(r => `<tr>${r}</tr>`).join('')}</tbody>` : '';
        html.push(`<table>${thead}${tbody}</table>`);
        inTable = false;
        tableRows = [];
      }
    }

    // Helper: close both
    function closeListAndParagraph() {
      closeList();
      closeParagraph();
    }

    function closeListAndParagraphAndTable() {
      closeList();
      closeParagraph();
      closeTable();
    }
  }

  /**
   * Apply inline Markdown formatting
   * Enhanced with: strikethrough (~~text~~)
   * @param {string} text - Text with inline markdown
   * @returns {string} HTML with inline tags
   */
  function applyInline(text) {
    // Strikethrough: ~~text~~ (must come before bold/italic)
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Bold: **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Image: ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;">');
    return text;
  }

  /**
   * Basic syntax highlighting for code blocks
   * Adds color classes for common tokens
   * @param {string} code - Raw code string
   * @param {string} lang - Language identifier
   * @returns {string} HTML with syntax spans
   */
  function syntaxHighlight(code, lang) {
    let escaped = escapeHtml(code);

    // Keywords (JS, Python, etc.)
    const keywords = ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'def', 'print', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null', 'undefined', 'None', 'True', 'False'];
    const keywordPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    escaped = escaped.replace(keywordPattern, '<span style="color:#C678DD;font-weight:600;">$1</span>');

    // Strings (single and double quotes)
    escaped = escaped.replace(/(&#039;[^&#]*?&#039;|&quot;[^&]*?&quot;)/g, '<span style="color:#98C379;">$1</span>');

    // Numbers
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#D19A66;">$1</span>');

    // Comments (// ...)
    escaped = escaped.replace(/(\/\/.*)/g, '<span style="color:#7F848E;font-style:italic;">$1</span>');

    return escaped;
  }

  /**
   * Escape HTML special characters
   * @param {string} str - Raw string
   * @returns {string} Escaped string
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Live Markdown rendering
  mdInput.addEventListener('keyup', () => {
    const md = mdInput.value;
    if (!md.trim()) {
      mdOutput.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">Rendered HTML will appear here...</p>';
      return;
    }
    mdOutput.innerHTML = parseMarkdown(md);
  });

  mdInput.addEventListener('input', () => {
    const md = mdInput.value;
    if (!md.trim()) {
      mdOutput.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">Rendered HTML will appear here...</p>';
      return;
    }
    mdOutput.innerHTML = parseMarkdown(md);
  });


  // ============================================
  // 7. FANCY UNICODE TEXT
  // ============================================

  const fuInput = $('fu-input');
  const fuOutput = $('fu-output');

  // Helper: build a mapping from a base codepoint for A-Z and a-z
  function buildMapping(upperStart, lowerStart) {
    const upper = [];
    const lower = [];
    for (let i = 0; i < 26; i++) {
      upper.push(String.fromCodePoint(upperStart + i));
      lower.push(String.fromCodePoint(lowerStart + i));
    }
    return { upper, lower };
  }

  // --- Unicode style definitions ---
  const unicodeStyles = [
    {
      name: 'Bold Sans',
      ...buildMapping(0x1D5D4, 0x1D5EE)
    },
    {
      name: 'Italic Sans',
      ...buildMapping(0x1D608, 0x1D622)
    },
    {
      name: 'Bold Italic Sans',
      ...buildMapping(0x1D63C, 0x1D656)
    },
    {
      name: 'Monospace',
      ...buildMapping(0x1D670, 0x1D68A)
    },
    {
      name: 'Double-Struck',
      upper: [...'𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ'],
      lower: [...'𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫']
    },
    {
      name: 'Fraktur',
      upper: [...'𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ'],
      lower: [...'𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷']
    },
    {
      name: 'Bold Fraktur',
      ...buildMapping(0x1D56C, 0x1D586)
    },
    {
      name: 'Script',
      upper: [...'𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵'],
      lower: [...'𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏']
    },
    {
      name: 'Bold Script',
      ...buildMapping(0x1D4D0, 0x1D4EA)
    },
    {
      name: 'Small Caps',
      upper: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
      lower: [...'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ']
    },
    {
      name: 'Circled',
      ...(() => {
        const upper = [];
        const lower = [];
        for (let i = 0; i < 26; i++) {
          upper.push(String.fromCodePoint(0x24B6 + i));
          lower.push(String.fromCodePoint(0x24D0 + i));
        }
        return { upper, lower };
      })()
    }
  ];

  /**
   * Convert a string using a given Unicode style mapping
   */
  function applyUnicodeStyle(text, style) {
    return [...text].map(ch => {
      const code = ch.codePointAt(0);
      if (code >= 65 && code <= 90) {
        return style.upper[code - 65];
      }
      if (code >= 97 && code <= 122) {
        return style.lower[code - 97];
      }
      return ch;
    }).join('');
  }

  /**
   * Render all fancy unicode variations for the input text
   */
  function updateFancyUnicode() {
    const text = fuInput.value;

    if (!text.trim()) {
      fuOutput.innerHTML = '<p class="placeholder-text">Fancy text variations will appear here...</p>';
      return;
    }

    const items = unicodeStyles.map(style => {
      const converted = applyUnicodeStyle(text, style);
      return `
        <div class="fancy-item">
          <span class="fancy-item-label">${escapeHtml(style.name)}</span>
          <span class="fancy-item-value">${converted}</span>
          <button class="fancy-item-copy" data-copy="${escapeAttr(converted)}">Copy</button>
        </div>
      `;
    }).join('');

    fuOutput.innerHTML = items;

    // Attach copy handlers
    fuOutput.querySelectorAll('.fancy-item-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const copyText = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(copyText).then(() => {
          showToast('Copied to clipboard!');
        }).catch(() => {
          showToast('Failed to copy');
        });
      });
    });
  }

  /**
   * Escape a string for use as an HTML attribute value
   */
  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  fuInput.addEventListener('keyup', updateFancyUnicode);
  fuInput.addEventListener('input', updateFancyUnicode);


  // ============================================
  // 8. MORSE CODE TRANSLATOR
  // ============================================

  const mcInput = $('mc-input');
  const mcOutput = $('mc-output');
  let mcMode = 'text-to-morse';

  // Mode switching
  document.querySelectorAll('[data-mc-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mc-mode]').forEach(b => b.classList.remove('active-mode'));
      btn.classList.add('active-mode');
      mcMode = btn.dataset.mcMode;
      updateMorseCode();
    });
  });

  /**
   * International Morse code mapping
   */
  const morseMap = {
    'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',   'E': '.',
    'F': '..-.',  'G': '--.',   'H': '....',  'I': '..',    'J': '.---',
    'K': '-.-',   'L': '.-..',  'M': '--',    'N': '-.',    'O': '---',
    'P': '.--.',  'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
    'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',  'Y': '-.--',
    'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
    '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
    '&': '.-...',  ':': '---...', ';': '-.-.-.', '=': '-...-',
    '+': '.-.-.',  '-': '-....-', '_': '..--.-', '"': '.-..-.',
    '$': '...-..-','@': '.--.-.'
  };

  // Reverse mapping for Morse-to-text
  const reverseMorseMap = {};
  for (const [char, morse] of Object.entries(morseMap)) {
    reverseMorseMap[morse] = char;
  }

  /**
   * Translate text to Morse code or vice versa
   */
  function updateMorseCode() {
    const input = mcInput.value.trim();

    if (!input) {
      mcOutput.textContent = 'Morse translation will appear here...';
      return;
    }

    let result = '';

    if (mcMode === 'text-to-morse') {
      const chars = [...input.toUpperCase()];
      const morseParts = chars.map(ch => {
        if (ch === ' ') return '/';
        if (morseMap[ch]) return morseMap[ch];
        return ch;
      });
      result = morseParts.join(' ');
    } else {
      const parts = input.split(/\s+/);
      const textParts = parts.map(part => {
        if (part === '/') return ' ';
        if (reverseMorseMap[part]) return reverseMorseMap[part];
        return part;
      });
      result = textParts.join('');
    }

    mcOutput.textContent = result;
  }

  mcInput.addEventListener('keyup', updateMorseCode);
  mcInput.addEventListener('input', updateMorseCode);

  // Copy button
  const mcCopyBtn = $('mc-copy-btn');
  if (mcCopyBtn) {
    mcCopyBtn.addEventListener('click', () => {
      copyToClipboard(mcOutput.textContent);
    });
  }


  // ============================================
  // 9. NUMBER TO WORDS (ENHANCED)
  // ============================================

  const nwInput = $('nw-input');
  const nwOutput = $('nw-output');
  const nwCurrency = $('nw-currency');
  const nwCurrencyOutput = $('nw-currency-output');
  const nwCopyBtn = $('nw-copy-btn');

  /**
   * Convert a number to its English word representation
   * Enhanced: Supports integers up to 999,999,999,999 (billions),
   * negative numbers, decimals, and currency formatting
   * @param {string|number} input - The number to convert
   * @returns {string} English word representation
   */
  function numberToWords(input) {
    const str = String(input).trim();

    if (!str) return '';

    let isNegative = false;
    let numStr = str;
    if (numStr.startsWith('-')) {
      isNegative = true;
      numStr = numStr.substring(1);
    }

    let integerPart = numStr;
    let decimalPart = '';
    if (numStr.includes('.')) {
      const parts = numStr.split('.');
      integerPart = parts[0];
      decimalPart = parts[1] || '';
    }

    if (!/^\d+$/.test(integerPart)) {
      return '⚠ Invalid number';
    }

    // Handle very large numbers by using BigInt
    let intVal;
    try {
      intVal = BigInt(integerPart);
    } catch (e) {
      return '⚠ Number too large';
    }

    if (intVal === 0n && !isNegative) {
      let result = 'Zero';
      if (decimalPart) {
        result += ' Point ' + [...decimalPart].map(d => digitWord(d)).join(' ');
      }
      return result;
    }

    let result = '';
    if (isNegative) result += 'Minus ';

    result += convertBigInteger(intVal);

    if (decimalPart && /^\d+$/.test(decimalPart)) {
      result += ' Point ' + [...decimalPart].map(d => digitWord(d)).join(' ');
    }

    return result;
  }

  /**
   * Convert a BigInt integer to words (supports up to billions and beyond)
   */
  function convertBigInteger(num) {
    if (num === 0n) return 'Zero';

    const scales = [
      { value: BigInt(1000000000), name: 'Billion' },
      { value: BigInt(1000000), name: 'Million' },
      { value: BigInt(1000), name: 'Thousand' },
      { value: BigInt(100), name: 'Hundred' }
    ];

    let result = '';
    let remaining = num;

    for (const scale of scales) {
      if (remaining >= scale.value) {
        const count = Number(remaining / scale.value);
        if (scale.value >= BigInt(100)) {
          result += convertUnderThousand(count) + ' ' + scale.name + ' ';
        } else {
          result += digitWord(String(count)) + ' ' + scale.name + ' ';
        }
        remaining = remaining % scale.value;
      }
    }

    if (remaining > 0n) {
      result += convertUnderThousand(Number(remaining));
    }

    return result.trim();
  }

  /**
   * Convert a number under 1000 to words
   */
  function convertUnderThousand(num) {
    if (num === 0) return '';
    if (num < 20) return underTwenty(num);
    if (num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      return tensWord(tens) + (ones > 0 ? ' ' + underTwenty(ones) : '');
    }
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    let result = underTwenty(hundreds) + ' Hundred';
    if (remainder > 0) {
      result += ' ' + convertUnderThousand(remainder);
    }
    return result;
  }

  /** Number words for 1–19 */
  function underTwenty(n) {
    const words = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
      'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    return words[n] || '';
  }

  /** Tens place words (20, 30, ... 90) */
  function tensWord(n) {
    const words = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    return words[n] || '';
  }

  /** Single digit word */
  function digitWord(d) {
    const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    return words[parseInt(d, 10)] || '';
  }

  /**
   * Format a number as currency (US Dollars)
   * @param {string} input - The number string
   * @returns {string} Currency formatted words
   */
  function numberToCurrency(input) {
    const str = String(input).trim();
    if (!str) return '';

    let isNegative = false;
    let numStr = str;
    if (numStr.startsWith('-')) {
      isNegative = true;
      numStr = numStr.substring(1);
    }

    let integerPart = numStr;
    let decimalPart = '';
    if (numStr.includes('.')) {
      const parts = numStr.split('.');
      integerPart = parts[0];
      decimalPart = (parts[1] || '').padEnd(2, '0').substring(0, 2);
    } else {
      decimalPart = '00';
    }

    if (!/^\d+$/.test(integerPart)) {
      return '⚠ Invalid number for currency';
    }

    let intVal;
    try {
      intVal = BigInt(integerPart);
    } catch (e) {
      return '⚠ Number too large';
    }

    let result = '';
    if (isNegative) result += 'Minus ';

    if (intVal === 0n && decimalPart === '00') {
      return 'Zero Dollars';
    }

    if (intVal > 0n) {
      result += convertBigInteger(intVal);
      result += intVal === 1n ? ' Dollar' : ' Dollars';
    }

    const cents = parseInt(decimalPart, 10);
    if (cents > 0) {
      if (intVal > 0n) result += ' and ';
      result += convertUnderThousand(cents);
      result += cents === 1 ? ' Cent' : ' Cents';
    }

    return result;
  }

  /**
   * Process number to words conversion on input
   * Enhanced with currency formatting
   */
  function updateNumberToWords() {
    const input = nwInput.value.trim();

    if (!input) {
      nwOutput.textContent = 'Number in words will appear here...';
      nwCurrencyOutput.style.display = 'none';
      return;
    }

    // Support multiple numbers (one per line)
    const lines = input.split('\n');
    const results = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      return numberToWords(trimmed);
    });

    nwOutput.textContent = results.join('\n');

    // Currency format
    if (nwCurrency.checked) {
      const currencyResults = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        return numberToCurrency(trimmed);
      });
      nwCurrencyOutput.textContent = currencyResults.join('\n');
      nwCurrencyOutput.style.display = 'block';
    } else {
      nwCurrencyOutput.style.display = 'none';
    }
  }

  nwInput.addEventListener('keyup', updateNumberToWords);
  nwInput.addEventListener('input', updateNumberToWords);
  nwCurrency.addEventListener('change', updateNumberToWords);

  // Copy button
  if (nwCopyBtn) {
    nwCopyBtn.addEventListener('click', () => {
      const text = nwCurrency.checked && nwCurrencyOutput.textContent
        ? nwOutput.textContent + '\n' + nwCurrencyOutput.textContent
        : nwOutput.textContent;
      copyToClipboard(text);
    });
  }


  // ============================================
  // INITIALIZATION COMPLETE
  // ============================================

  console.log('MicTab Text Utilities — All 9 tools loaded (iOS Cream Theme Edition)');

}); // end DOMContentLoaded
