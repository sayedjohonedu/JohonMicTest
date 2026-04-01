const puppeteer = require('puppeteer-core');
const path = require('path');
const { app } = require('electron');
const { findChrome } = require('./chrome-finder');

let browser = null;
let page = null;
let isClosing = false;

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
  
  // Close existing browser if any
  if (browser) {
    try {
      const oldBrowser = browser;
      browser = null; // Important to null it out before closing to avoid events
      await oldBrowser.close();
    } catch (e) {}
  }

  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error('Chrome not found. Please install Google Chrome.');
  }

  const useHeadless = !forceVisible && !process.env.JUNO_FORCE_VISIBLE;
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
      executablePath: chromePath,
      headless: useHeadless ? 'new' : false,
      args: chromeArgs,
      userDataDir: path.join(app.getPath('userData'), 'chrome-bridge-data')
    });

    page = await browser.newPage();
    
    // Watchdog: auto-restart on disconnect
    browser.on('disconnected', async () => {
      safeLog('Chrome bridge disconnected.');
      if (!isClosing) {
        // Attempt a single restart if it wasn't intentional
        setTimeout(() => {
          if (!isClosing && !browser) {
            launchChromeBridge(url).catch(() => {});
          }
        }, 3000);
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
      await browser.close();
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

module.exports = { launchChromeBridge, closeChromeBridge, startRecognition, stopRecognition };
