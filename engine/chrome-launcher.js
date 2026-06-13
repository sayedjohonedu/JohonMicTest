const puppeteer = require('puppeteer-core');
const path = require('path');
const { app } = require('electron');
const { findBrowser, findAllBrowsers } = require('./browser-finder');

let browser = null;
let page = null;
let isClosing = false;

/** @type {import('./browser-finder').BrowserInfo|null} */
let activeBrowserInfo = null;

function killLeftoverBridgeProcesses() {
  const { execSync } = require('child_process');
  try {
    if (process.platform === 'darwin') {
      execSync('pkill -9 -f "chrome-bridge-data"', { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      const cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \\"CommandLine like \'%chrome-bridge-data%\'\\" | ForEach-Object { $_.Terminate() }"';
      execSync(cmd, { stdio: 'ignore' });
    }
  } catch (e) {
    // Ignore errors (e.g. if no processes were found)
  }
}

// Safe logging to avoid EIO errors on broken pipes
function safeLog(...args) {
  try {
    console.log(...args);
  } catch (e) {
    // Ignore EIO/broken pipe errors
  }
}

async function launchChromeBridge(url, forceVisible = false) {
  isClosing = false;
  
  // Clean up any zombie/leftover bridge processes from prior crashes/runs
  killLeftoverBridgeProcesses();
  
  // Close existing browser if any
  if (browser) {
    try {
      const oldBrowser = browser;
      browser = null; // Important to null it out before closing to avoid events
      await oldBrowser.close();
    } catch (e) {}
  }

  // Read user's preferred browser from shared config (if any)
  let preferredBrowser = 'auto';
  try {
    const store = require('../store/config');
    preferredBrowser = store.get('preferredBrowser', 'auto');
  } catch {}

  const browserInfo = findBrowser(preferredBrowser);
  if (!browserInfo) {
    activeBrowserInfo = null;
    throw new Error('No compatible browser found. Please install Google Chrome, Microsoft Edge, or Brave.');
  }

  activeBrowserInfo = browserInfo;
  safeLog(`[MicTab] Using ${browserInfo.name} (${browserInfo.engineLabel}) at: ${browserInfo.executablePath}`);

  const useHeadless = !forceVisible && !process.env.MICTAB_FORCE_VISIBLE;
  const chromeArgs = [
    '--use-fake-ui-for-media-stream',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-default-apps',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--hide-scrollbars'
  ];

  if (useHeadless) {
    chromeArgs.push('--headless=new');
  } else {
    // PRD recommended off-screen positioning for STT stability
    chromeArgs.push('--window-position=-9999,0');
    chromeArgs.push('--window-size=1,1');
  }

  try {
    browser = await puppeteer.launch({
      executablePath: browserInfo.executablePath,
      headless: useHeadless ? 'new' : false,
      args: chromeArgs,
      userDataDir: (() => {
        const fs = require('fs');
        const dir = path.join(app.getPath('userData'), 'chrome-bridge-data');
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (e) {}
        return dir;
      })()
    });

    page = await browser.newPage();

    // Forward bridge page console output to main process logger
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') console.error(`[Bridge] ${text}`);
      else if (type === 'warning') console.warn(`[Bridge] ${text}`);
      else console.log(`[Bridge] ${text}`);
    });
    
    // Watchdog: auto-restart on disconnect
    browser.on('disconnected', async () => {
      safeLog('Chrome bridge disconnected.');
      if (!isClosing) {
        // Attempt a single restart if it wasn't intentional
        setTimeout(() => {
          if (!isClosing && !browser) {
            launchChromeBridge(url).catch(() => {});
          }
        }, 1500);
      }
      browser = null;
      page = null;
    });

    await page.goto(url);
    return { browser, page };
  } catch (err) {
    if (!isClosing) safeLog('Error launching Chrome bridge:', err);
    throw err;
  }
}

async function closeChromeBridge() {
  isClosing = true;
  if (browser) {
    try {
      // Race browser.close() against a 1.5s timeout — puppeteer can hang otherwise
      await Promise.race([
        browser.close(),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    } catch (err) {
      console.error('Error closing browser:', err);
    }
    browser = null;
    page = null;
  }
}

async function startRecognition(languageCode) {
  if (!page) throw new Error('Chrome bridge not initialized');
  await page.evaluate((lang) => {
    if (window.startRecognition) {
      window.startRecognition(lang);
    }
  }, languageCode);
}

async function stopRecognition() {
  if (!page) {
    console.warn('Chrome bridge not initialized, cannot stop recognition');
    return;
  }
  try {
    await page.evaluate(() => {
      if (window.stopRecognition) {
        window.stopRecognition();
      }
    });
  } catch (err) {
     console.error('Error stopping recognition in page:', err);
  }
}

/**
 * Returns info about the currently active browser engine.
 * @returns {import('./browser-finder').BrowserInfo|null}
 */
function getActiveBrowserInfo() {
  return activeBrowserInfo;
}

module.exports = { launchChromeBridge, closeChromeBridge, startRecognition, stopRecognition, getActiveBrowserInfo };
