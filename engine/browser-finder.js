const fs = require('fs');
const path = require('path');

/**
 * Browser detection result.
 * @typedef {Object} BrowserInfo
 * @property {string} executablePath - Full path to the browser executable
 * @property {string} name          - Human-readable name (e.g. 'Google Chrome')
 * @property {string} engine        - STT backend identifier: 'google' | 'azure' | 'apple'
 * @property {string} engineLabel   - Display label: 'Google STT' | 'Azure STT' | 'Apple STT'
 */

/**
 * Browser candidate definition.
 * @typedef {Object} BrowserCandidate
 * @property {string}   name        - Human-readable name
 * @property {string}   engine      - STT backend identifier
 * @property {string}   engineLabel - Display label for the overlay pill
 * @property {string[]} darwin      - macOS executable paths
 * @property {function} win32       - Function returning Windows executable paths
 */

/** @type {BrowserCandidate[]} */
const CANDIDATES = [
  {
    name: 'Google Chrome',
    engine: 'google',
    engineLabel: 'Google STT',
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ],
    win32: () => {
      const la = process.env.LOCALAPPDATA || '';
      const pf = process.env.PROGRAMFILES || '';
      const pf86 = process.env['PROGRAMFILES(X86)'] || '';
      return [
        path.join(pf, 'Google/Chrome/Application/chrome.exe'),
        path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
        path.join(la, 'Google/Chrome/Application/chrome.exe'),
        path.join(la, 'Google/Chrome SxS/Application/chrome.exe'),
      ];
    },
  },
  {
    name: 'Microsoft Edge',
    engine: 'azure',
    engineLabel: 'Azure STT',
    darwin: [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    win32: () => {
      const pf = process.env.PROGRAMFILES || '';
      const pf86 = process.env['PROGRAMFILES(X86)'] || '';
      return [
        path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
      ];
    },
  },
  {
    name: 'Brave',
    engine: 'google',
    engineLabel: 'Google STT',
    darwin: [
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ],
    win32: () => {
      const la = process.env.LOCALAPPDATA || '';
      return [
        path.join(la, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
      ];
    },
  },
];

/**
 * Resolve candidate paths for a given candidate on the current platform.
 * @param {BrowserCandidate} candidate
 * @returns {string[]}
 */
function resolvePaths(candidate) {
  const platform = process.platform;
  let paths = [];
  if (platform === 'darwin') {
    paths = [...(candidate.darwin || [])];
    // Also check user-local ~/Applications
    for (const p of candidate.darwin || []) {
      if (p.startsWith('/Applications/')) {
        const userLocal = path.join(process.env.HOME || '', 'Applications', p.replace('/Applications/', ''));
        if (!paths.includes(userLocal)) paths.push(userLocal);
      }
    }
  } else if (platform === 'win32' && typeof candidate.win32 === 'function') {
    paths = candidate.win32();
  }
  return paths;
}

/**
 * Find the first available executable path for a candidate.
 * @param {BrowserCandidate} candidate
 * @returns {string|null}
 */
function findCandidatePath(candidate) {
  for (const p of resolvePaths(candidate)) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

/**
 * Find the first available Chromium-based browser on the system.
 * If `preferredName` is supplied and that browser is installed, it is returned first.
 * Otherwise falls back to the default cascade: Chrome → Edge → Brave.
 *
 * Also respects the `CHROME_PATH` env variable as the highest-priority override
 * (so existing users who set it don't break).
 *
 * @param {string} [preferredName] - Optional preferred browser name (e.g. 'Microsoft Edge')
 * @returns {BrowserInfo|null} Info about the found browser, or null if none found.
 */
function findBrowser(preferredName) {
  // Priority override: CHROME_PATH env variable (backwards-compatible)
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    const envPath = process.env.CHROME_PATH.toLowerCase();
    let engine = 'google';
    let engineLabel = 'Google STT';
    let name = 'Google Chrome';
    if (envPath.includes('edge') || envPath.includes('msedge')) {
      engine = 'azure'; engineLabel = 'Azure STT'; name = 'Microsoft Edge';
    } else if (envPath.includes('brave')) {
      name = 'Brave';
    }
    return { executablePath: process.env.CHROME_PATH, name, engine, engineLabel };
  }

  // If user has a preference, try it first
  if (preferredName && preferredName !== 'auto') {
    const preferred = CANDIDATES.find(c => c.name === preferredName);
    if (preferred) {
      const p = findCandidatePath(preferred);
      if (p) return { executablePath: p, name: preferred.name, engine: preferred.engine, engineLabel: preferred.engineLabel };
    }
    // Preferred browser not found — fall through to auto-detect cascade
  }

  // Default cascade: Chrome → Edge → Brave
  for (const candidate of CANDIDATES) {
    const p = findCandidatePath(candidate);
    if (p) return { executablePath: p, name: candidate.name, engine: candidate.engine, engineLabel: candidate.engineLabel };
  }

  return null;
}

/**
 * Return all browsers that are currently installed on the system.
 * Used by the Settings UI to populate the browser dropdown.
 *
 * @returns {BrowserInfo[]}
 */
function findAllBrowsers() {
  const installed = [];
  for (const candidate of CANDIDATES) {
    const p = findCandidatePath(candidate);
    if (p) {
      installed.push({
        executablePath: p,
        name: candidate.name,
        engine: candidate.engine,
        engineLabel: candidate.engineLabel,
      });
    }
  }
  return installed;
}

/**
 * Backwards-compatible wrapper: returns just the executable path string.
 * @returns {string|null}
 */
function findChrome() {
  const info = findBrowser();
  return info ? info.executablePath : null;
}

module.exports = { findBrowser, findAllBrowsers, findChrome, CANDIDATES };
