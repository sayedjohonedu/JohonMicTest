'use strict';

const { exec } = require('child_process');
const { clipboard } = require('electron');
const robot = require('@hurdlegroup/robotjs');
const { uIOhook } = require('uiohook-napi');
const store = require('../../store/config');
const clipboardMonitor = require('./clipboard-monitor');

// Keep track of the last pasted dictation
let lastPasted = null;

// Track user input activity globally in the background
let lastInputActivity = Date.now();

try {
  uIOhook.on('keydown', () => { lastInputActivity = Date.now(); });
  uIOhook.on('mousedown', () => { lastInputActivity = Date.now(); });
} catch (e) {
  console.warn('[CorrectionDetector] Failed to register uIOhook listeners:', e.message);
}

/**
 * Check if the user is currently idle (not typing or clicking).
 * @param {number} seconds - Number of seconds of inactivity required.
 * @returns {boolean}
 */
function isUserIdle(seconds = 2.5) {
  return (Date.now() - lastInputActivity) > (seconds * 1000);
}

/**
 * Record a dictation event to monitor for corrections.
 * @param {string} text - The text that was pasted.
 */
function recordDictation(text) {
  if (!text || !text.trim()) return;
  
  // Only monitor if the feature is enabled
  const enabled = store.get('autoLearnCorrections') !== false;
  if (!enabled) return;

  lastPasted = {
    text: text.trim(),
    timestamp: Date.now()
  };
  console.log(`[CorrectionDetector] Recorded last dictation: "${lastPasted.text.substring(0, 40)}..."`);
  
  // Start the background self-scheduling check
  scheduleCorrectionCheck(6000);
}

/**
 * Run a background check that waits until the user is idle before executing.
 */
function scheduleCorrectionCheck(delayMs = 6000) {
  setTimeout(async () => {
    try {
      const enabled = store.get('autoLearnCorrections') !== false;
      if (!enabled || !lastPasted) return;

      // If the user is actively typing, wait and check again in 2 seconds
      if (!isUserIdle(2.5)) {
        console.log('[CorrectionDetector] User is active. Rescheduling check in 2 seconds...');
        scheduleCorrectionCheck(2000);
        return;
      }

      console.log('[CorrectionDetector] User is idle. Starting correction check...');
      await checkPendingCorrection(); // Idle! Safe to check
    } catch (e) {
      console.error('[CorrectionDetector] Idle check error:', e);
    }
  }, delayMs);
}

/**
 * Run a shell command and return its stdout.
 */
function runCmd(command) {
  return new Promise((resolve) => {
    exec(command, (error, stdout) => {
      if (error) {
        resolve('');
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Get the text from the currently active/focused element on macOS.
 */
async function getActiveTextMac() {
  const appleScript = `
    tell application "System Events"
      try
        set frontmostProcess to first process whose frontmost is true
        set focusedElement to value of attribute "AXFocusedUIElement" of frontmostProcess
        try
          set val to value of focusedElement
          if val is not missing value and val is not "" then
            return val as string
          end if
        end try
        try
          set val to value of attribute "AXValue" of focusedElement
          if val is not missing value and val is not "" then
            return val as string
          end if
        end try
      on error errMsg
        return "ERROR: " & errMsg
      end try
    end tell
  `;
  // Escape single quotes and run via osascript
  const escapedScript = appleScript.replace(/\n/g, ' ').replace(/'/g, "'\\''");
  return await runCmd(`osascript -e '${escapedScript}'`);
}

/**
 * Get the text from the currently active/focused element on Windows.
 */
async function getActiveTextWindows() {
  const psCommand = `
    Add-Type -AssemblyName UIAutomationClient
    try {
      $el = [System.Windows.Automation.AutomationElement]::FocusedElement
      if ($el) {
        $valPat = $null
        if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valPat)) {
          Write-Output $valPat.Current.Value
          exit
        }
        $txtPat = $null
        if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$txtPat)) {
          Write-Output $txtPat.DocumentRange.GetText(-1)
          exit
        }
        Write-Output $el.Current.Name
      }
    } catch {}
  `;
  const escapedCommand = psCommand.replace(/\n/g, ' ');
  return await runCmd(`powershell -NoProfile -Command "${escapedCommand}"`);
}

/**
 * Retrieve current text in the active text field.
 */
async function getActiveText() {
  let text = '';
  try {
    if (process.platform === 'darwin') {
      text = await getActiveTextMac();
    } else if (process.platform === 'win32') {
      text = await getActiveTextWindows();
    }
  } catch (e) {
    console.warn('[CorrectionDetector] Silent text retrieval failed:', e.message);
  }

  return text;
}

/**
 * Calculate character-level Levenshtein distance.
 */
function getCharEditDistance(a, b) {
  const dp = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1      // insertion
        );
      }
    }
  }
  return dp[a.length][b.length];
}

/**
 * Calculate word-level Levenshtein distance.
 */
function getWordLevenshteinDistance(a, b) {
  const dp = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1,
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1
        );
      }
    }
  }
  return dp[a.length][b.length];
}

/**
 * Slide a window over the current document words to find the segment
 * that best matches the last dictated text. Returns the start index and size.
 */
function findBestMatchingWindowInfo(origWords, currWords) {
  if (currWords.length <= origWords.length + 3) {
    return { start: 0, size: currWords.length };
  }

  let bestStart = 0;
  let bestSize = currWords.length;
  let minDistance = Infinity;
  const len = origWords.length;

  for (let size = Math.max(1, len - 3); size <= len + 3; size++) {
    for (let start = 0; start <= currWords.length - size; start++) {
      const candidate = currWords.slice(start, start + size);
      const dist = getWordLevenshteinDistance(origWords, candidate);
      if (dist < minDistance) {
        minDistance = dist;
        bestStart = start;
        bestSize = size;
      }
    }
  }

  return { start: bestStart, size: bestSize };
}

/**
 * Align two word arrays and extract substitutions.
 */
function getWordCorrections(originalText, currentText) {
  const clean = (t) => t.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const cleanPreserve = (t) => t
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const origWords = clean(originalText);
  const origWordsPreserved = cleanPreserve(originalText);

  const fullCurrWords = clean(currentText);
  const fullCurrWordsPreserved = cleanPreserve(currentText);

  if (origWords.length === 0 || fullCurrWords.length === 0) return [];

  // Find the segment in the current document that best matches the original text
  const winInfo = findBestMatchingWindowInfo(origWords, fullCurrWords);
  const currWords = fullCurrWords.slice(winInfo.start, winInfo.start + winInfo.size);
  const currWordsPreserved = fullCurrWordsPreserved.slice(winInfo.start, winInfo.start + winInfo.size);

  // If the length difference between matched window and original is too large, it is a major rewrite, not a spelling correction
  if (Math.abs(origWords.length - currWords.length) > 3) {
    console.log('[CorrectionDetector] Matched window length difference is too large. Ignoring.');
    return [];
  }

  const dp = Array(origWords.length + 1).fill(null).map(() => Array(currWords.length + 1).fill(0));
  for (let i = 0; i <= origWords.length; i++) dp[i][0] = i;
  for (let j = 0; j <= currWords.length; j++) dp[0][j] = j;

  for (let i = 1; i <= origWords.length; i++) {
    for (let j = 1; j <= currWords.length; j++) {
      if (origWords[i - 1] === currWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1,
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1
        );
      }
    }
  }

  const totalEdits = dp[origWords.length][currWords.length];
  const maxAllowedEdits = Math.max(2, Math.floor(origWords.length * 0.25));
  if (totalEdits > maxAllowedEdits) {
    console.log(`[CorrectionDetector] Too many edits in matched window (${totalEdits}/${origWords.length}). Ignoring.`);
    return [];
  }

  let i = origWords.length;
  let j = currWords.length;
  const corrections = [];

  while (i > 0 && j > 0) {
    if (origWords[i - 1] === currWords[j - 1]) {
      i--;
      j--;
    } else {
      const score = dp[i][j];
      const sub = dp[i - 1][j - 1];
      const del = dp[i - 1][j];

      if (score === sub + 1) {
        const origWord = origWords[i - 1];
        const currWord = currWords[j - 1];
        // Ensure it's a spelling correction (edit distance should be small relative to length)
        const dist = getCharEditDistance(origWord, currWord);
        const maxAllowedDist = Math.max(3, Math.floor(currWord.length / 2));
        
        if (dist <= maxAllowedDist) {
          // Retrieve original casing
          const origPreserved = origWordsPreserved[i - 1];
          const currPreserved = currWordsPreserved[j - 1];
          corrections.push({ say: origPreserved, replace: currPreserved });
        }
        i--;
        j--;
      } else if (score === del + 1) {
        i--;
      } else {
        j--;
      }
    }
  }

  return corrections.reverse();
}

/**
 * Trigger visual spelling saved confirmation on the offline pill.
 */
function triggerUIConfirmation(say, replace) {
  try {
    const whisperApiManager = require('./whisper-api-manager');
    if (whisperApiManager && whisperApiManager._pillWindow && !whisperApiManager._pillWindow.isDestroyed()) {
      const pill = whisperApiManager._pillWindow;
      
      // Update state to 'learned' and pass detail text
      pill.webContents.send('offline-pill-state', {
        state: 'learned',
        detail: `✨ Saved: ${say} → ${replace}`
      });
      
      // Position and show the pill window safely
      const savedPos = store.get('offlinePillPosition');
      if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
        pill.setPosition(savedPos.x, savedPos.y);
      } else {
        const { getActiveDisplay } = require('./screen-helper');
        const display = getActiveDisplay();
        const { x: dx, y: dy, width: dw } = display.workArea;
        const pillWidth = 240;
        const x = dx + Math.round((dw - pillWidth) / 2);
        const y = dy + 60;
        pill.setPosition(x, y);
      }
      
      pill.showInactive();
      
      // Auto-hide the pill after 3.2 seconds
      setTimeout(() => {
        if (!pill.isDestroyed()) {
          pill.hide();
        }
      }, 3200);
    }
  } catch (e) {
    console.error('[CorrectionDetector] Failed to show UI confirmation:', e);
  }
}

/**
 * Save the learned correction to textReplacements and aiPersonalDictionary.
 */
function saveCorrection(say, replace) {
  // 1. Save to textReplacements
  const rules = store.get('textReplacements') || [];
  const existingIndex = rules.findIndex(r => r.say.toLowerCase() === say.toLowerCase());
  
  if (existingIndex >= 0) {
    if (rules[existingIndex].replace.toLowerCase() === replace.toLowerCase()) {
      return; // Already exists
    }
    rules[existingIndex].replace = replace;
  } else {
    rules.push({ say, replace });
  }
  
  store.set('textReplacements', rules);
  console.log(`[CorrectionDetector] Saved replacement rule: "${say}" -> "${replace}"`);

  // 2. Save to aiPersonalDictionary (primes Whisper/LLM system prompts)
  let dict = store.get('aiPersonalDictionary') || '';
  let words = dict.split(',').map(w => w.trim()).filter(Boolean);
  
  if (!words.some(w => w.toLowerCase() === replace.toLowerCase())) {
    words.push(replace);
    store.set('aiPersonalDictionary', words.join(', '));
    console.log(`[CorrectionDetector] Added spelling helper to AI dictionary: "${replace}"`);
  }

  // 3. Trigger premium ease-in/ease-out UI confirmation
  triggerUIConfirmation(say, replace);
}

/**
 * Check if the user corrected the last dictated text.
 * Runs in the background.
 */
async function checkPendingCorrection() {
  if (!lastPasted) return;

  const { text, timestamp } = lastPasted;
  lastPasted = null; // Clear so we only check once

  // Only check if it was dictated in the last 5 minutes
  if (Date.now() - timestamp > 5 * 60 * 1000) return;

  console.log('[CorrectionDetector] Checking for edits to the last dictation...');
  const currentText = await getActiveText();
  if (!currentText || !currentText.trim() || currentText.startsWith('ERROR:')) {
    console.log('[CorrectionDetector] Active text field is empty, contains error, or could not be read.');
    return;
  }

  const corrections = getWordCorrections(text, currentText);
  if (corrections.length > 0) {
    console.log(`[CorrectionDetector] Found ${corrections.length} correction(s).`);
    for (const corr of corrections) {
      saveCorrection(corr.say, corr.replace);
    }
  } else {
    console.log('[CorrectionDetector] No corrections found.');
  }
}

module.exports = {
  recordDictation,
  checkPendingCorrection,
  getWordCorrections,
  getCharEditDistance
};
