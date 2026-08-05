const { Tray, Menu, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const { LANGUAGES } = require('./constants');
const store = require('../../store/config');

let tray = null;
let _captureAction     = null;
let _translatorAction  = null;
let _appStoreAction    = null;
let _browserAction     = null;
let _clipboardAction   = null;
let _galleryAction     = null;
let _recordAction      = null;
let _stopRecordAction  = null;
let _screenshotAction  = null;
let _isRecording       = false;
let _aiModeToggleAction = null;
let _whisperAiModeToggleAction = null;

/* ─── Icon helpers ────────────────────────────────────────────────── */
const ICON_DIR = path.join(__dirname, '../../assets/tray-icons');
const _iconCache = {};

/**
 * Load a tray menu icon by base name (e.g. 'capture', 'settings').
 *
 * Dark mode → white icons  (`<name>.png`)
 * Light mode → black icons (`<name>Template.png`)
 *
 * We do NOT use Electron's setTemplateImage() for menu item icons because
 * macOS context menus don't reliably tint them — they render as muted gray.
 * Instead we explicitly pick the right colour variant.
 *
 * @2x variants are picked up automatically by Electron on Retina displays.
 */
function getTrayIcon(baseName) {
  if (_iconCache[baseName]) return _iconCache[baseName];

  // Dark mode → white icons, light mode → black icons
  const isDark = nativeTheme.shouldUseDarkColors;
  const fileName = isDark ? `${baseName}.png` : `${baseName}Template.png`;
  const filePath = path.join(ICON_DIR, fileName);

  let icon = nativeImage.createFromPath(filePath);
  if (icon.isEmpty()) return undefined; // graceful fallback – no icon

  // Resize to 16×16 logical pixels so icons aren't oversized in the menu
  icon = icon.resize({ width: 16, height: 16 });

  _iconCache[baseName] = icon;
  return icon;
}

/** Register the function that should fire when the user clicks "Capture Area" in the tray. */
function setCaptureAction(fn)    { _captureAction    = fn; }

/** Register the function that should fire when the user clicks "Translator" in the tray. */
function setTranslatorAction(fn) { _translatorAction = fn; }

/** Register tray action callbacks for new panels. */
function setAppStoreAction(fn)   { _appStoreAction   = fn; }
function setBrowserAction(fn)    { _browserAction    = fn; }
function setClipboardAction(fn)  { _clipboardAction  = fn; }
function setGalleryAction(fn)    { _galleryAction    = fn; }
function setRecordAction(fn)     { _recordAction     = fn; }
function setStopRecordAction(fn) { _stopRecordAction = fn; }
function setScreenshotAction(fn) { _screenshotAction = fn; }
function setAiModeToggleAction(fn) { _aiModeToggleAction = fn; }
function setWhisperAiModeToggleAction(fn) { _whisperAiModeToggleAction = fn; }

/** Call this when recording state changes, then call updateTrayMenu to rebuild. */
function setRecordingState(isRec) { _isRecording = !!isRec; }

function createTray(toggleListening, showSettings, app, switchTrayLanguage, isListening) {
  const isMac = process.platform === 'darwin';

  const updateTrayIcon = () => {
    let iconPath;
    if (isMac) {
      iconPath = path.join(__dirname, '../../assets', 'iconTemplate.png');
    } else {
      if (nativeTheme.shouldUseDarkColors) {
        iconPath = path.join(__dirname, '../../assets/logo/transparent-white-logo.png');
      } else {
        iconPath = path.join(__dirname, '../../assets/logo/transparent-black-logo.png');
      }
    }

    let icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABRSURBVDiNY/z//z8DJYCJgUJANQMGBgYGJkombIoZGBgYmCixyIRGDRg1YNSAUQNGDaAqAMlnJGUzMo6A0QhGIxiNYDSC0Qj+B/8TAAD//wMAUhUWnwGUAAAAAElFTkSuQmCC');
    }
    if (isMac) icon.setTemplateImage(true);

    if (tray) tray.setImage(icon);
    else tray = new Tray(icon);
  };

  updateTrayIcon();
  nativeTheme.on('updated', () => {
    if (!tray) return;
    updateTrayIcon();
    // Clear cached icons and rebuild the menu so icons reload in the
    // correct colour (white for dark mode, black for light mode).
    Object.keys(_iconCache).forEach(k => delete _iconCache[k]);
    updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
  });
  tray.setToolTip('MicTab');
  
  updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
  
  return tray;
}

function updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening) {
  if (!tray) return;
  const currentLang = store.get('language') || 'en-US';
  const currentWhisperLang = store.get('whisperApiLanguage') || '';
  const whisperEnabled = store.get('whisperApiEnabled') === true;
  const isMac = process.platform === 'darwin';

  const makeItem = (lang) => ({
    label: isMac ? `${lang.flag}  ${lang.name}` : lang.name,
    type: 'radio',
    checked: lang.code === currentLang,
    click: () => switchTrayLanguage(lang.code)
  });

  const filterByPrefix = (prefixes) => LANGUAGES.filter(l => prefixes.some(p => l.code.startsWith(p)));
  const filterByCodes  = (codes)    => LANGUAGES.filter(l => codes.includes(l.code));

  const langSubmenu = [
    { label: 'Western',       submenu: filterByPrefix(['en-','es-','pt-','fr-','de-','nl-','sv-','da-','nb-','is-','it-','cy-','haw-']).map(makeItem) },
    { label: 'European',      submenu: filterByPrefix(['ru-','pl-','cs-','sk-','uk-','hr-','sr-','bg-','sl-','mk-','ro-','ca-','el-','fi-','hu-']).map(makeItem) },
    { label: 'East & SE Asia', submenu: filterByPrefix(['ja-','zh-','ko-','mn-','th-','vi-','id-','ms-','tl-','my-','km-','lo-']).map(makeItem) },
    { label: 'South Asia',    submenu: filterByCodes(['hi-IN','bn-IN','bn-BD','ur-IN','ur-PK','pa-IN','gu-IN','mr-IN','te-IN','kn-IN','ml-IN','ta-IN','or-IN','si-LK','ne-NP','dv-MV']).map(makeItem) },
    { label: 'Middle East & Africa', submenu: filterByPrefix(['ar-','tr-','he-','fa-','sw-','am-','zu-','yo-','ig-','ha-','so-','rw-','mg-','uz-','kk-','ky-']).map(makeItem) },
    { label: 'Pacific & Other', submenu: filterByCodes(['mi-NZ','sm-WS','to-TO','fj-FJ']).map(makeItem) },
  ];

  // --- Whisper Language Submenu Logic ---
  const switchWhisperTrayLanguage = (langCode) => {
    store.set('whisperApiLanguage', langCode);
    try {
      const { getSettingsWindow } = require('./window-manager');
      const settingsWindow = getSettingsWindow();
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('whisper-language-changed', langCode);
      }
    } catch(e) {}
    updateTrayMenu(toggleListening, showSettings, app, switchTrayLanguage, isListening);
  };

  const { WHISPER_LANGUAGES } = require('./whisper-api-engine');
  
  const enrichedWhisperLangs = WHISPER_LANGUAGES.map(wl => {
    if (wl.code === '') return { ...wl, flag: '🌍' };
    const match = LANGUAGES.find(l => l.code.startsWith(wl.code + '-'));
    return { ...wl, flag: match ? match.flag : '🏳️' };
  });

  const filterWhisperByCodes = (codes) => enrichedWhisperLangs.filter(l => codes.includes(l.code));
  
  const whisperWestern = filterWhisperByCodes(['en','es','pt','fr','de','nl','sv','da','no','it']);
  const whisperEuropean = filterWhisperByCodes(['ru','pl','cs','uk','ro','el','fi','hu','bg']);
  const whisperAsia = filterWhisperByCodes(['ja','zh','ko','th','vi','id','ms']);
  const whisperSouthAsia = filterWhisperByCodes(['hi','bn','ur']);
  const whisperMEAfrica = filterWhisperByCodes(['ar','tr','he','fa']);

  const makeWhisperItem = (lang) => ({
    label: isMac ? `${lang.flag}  ${lang.name}` : lang.name,
    type: 'radio',
    checked: lang.code === currentWhisperLang,
    click: () => switchWhisperTrayLanguage(lang.code)
  });

  const whisperLangSubmenu = [
    { label: 'Auto-detect', icon: getTrayIcon('language'), type: 'radio', checked: currentWhisperLang === '', click: () => switchWhisperTrayLanguage('') },
    { type: 'separator' },
    { label: 'Western',       submenu: whisperWestern.map(makeWhisperItem) },
    { label: 'European',      submenu: whisperEuropean.map(makeWhisperItem) },
    { label: 'East & SE Asia', submenu: whisperAsia.map(makeWhisperItem) },
    { label: 'South Asia',    submenu: whisperSouthAsia.map(makeWhisperItem) },
    { label: 'Middle East & Africa', submenu: whisperMEAfrica.map(makeWhisperItem) },
  ];

  const contextMenu = Menu.buildFromTemplate([
    // ── Core: Listening ───────────────────────────────────────────────
    {
      label: isListening ? 'Stop Listening' : 'Start Listening',
      icon: getTrayIcon(isListening ? 'microphone-off' : 'microphone'),
      click: () => toggleListening()
    },
    { type: 'separator' },

    // ── Screen Capture ────────────────────────────────────────────────
    {
      label: 'Screenshot',
      icon: getTrayIcon('screenshot'),
      accelerator: 'Alt+Shift+S',
      click: () => { if (_screenshotAction) _screenshotAction(); }
    },
    // Dynamic: show Stop Recording while recording, Record Screen otherwise
    ...(_isRecording
      ? [{
          label: 'Stop Recording',
          icon: getTrayIcon('screen-record-stop'),
          click: () => { if (_stopRecordAction) _stopRecordAction(); }
        }]
      : [{
          label: 'Record Screen',
          icon: getTrayIcon('screen-record'),
          click: () => { if (_recordAction) _recordAction(); }
        }]
    ),
    {
      label: 'Capture Area',
      icon: getTrayIcon('capture-area'),
      accelerator: 'Alt+Shift+S',
      click: () => { if (_captureAction) _captureAction(); }
    },
    {
      label: 'Gallery',
      icon: getTrayIcon('gallery'),
      click: () => { if (_galleryAction) _galleryAction(); }
    },
    { type: 'separator' },

    // ── Communication Tools ───────────────────────────────────────────
    {
      label: 'Translator',
      icon: getTrayIcon('translator'),
      accelerator: 'Alt+Shift+T',
      click: () => { if (_translatorAction) _translatorAction(); }
    },
    {
      label: 'Clipboard',
      icon: getTrayIcon('clipboard'),
      accelerator: store.get('clipboardHotkey') || 'Alt+V',
      enabled: store.get('clipboardEnabled') !== false,
      click: () => { if (_clipboardAction) _clipboardAction(); }
    },
    { type: 'separator' },

    // ── Panels & Apps ─────────────────────────────────────────────────
    {
      label: 'App Store',
      icon: getTrayIcon('appstore'),
      accelerator: 'Alt+Shift+A',
      click: () => { if (_appStoreAction) _appStoreAction(); }
    },
    {
      label: 'Browser',
      icon: getTrayIcon('browser'),
      accelerator: 'Alt+Shift+B',
      click: () => { if (_browserAction) _browserAction(); }
    },
    { type: 'separator' },

    // ── AI Mode ───────────────────────────────────────────────────────
    {
      label: 'AI Mode',
      icon: getTrayIcon('ai'),
      submenu: [
        {
          label: 'Regular',
          type: 'checkbox',
          checked: store.get('aiModeEnabled') === true,
          click: () => { if (_aiModeToggleAction) _aiModeToggleAction(); }
        },
        {
          label: 'Whisper',
          type: 'checkbox',
          checked: store.get('whisperApiAiEnabled') === true,
          click: () => { if (_whisperAiModeToggleAction) _whisperAiModeToggleAction(); }
        }
      ]
    },
    { type: 'separator' },

    // ── Preferences ───────────────────────────────────────────────────
    { 
      label: 'STT Language', 
      icon: getTrayIcon('language'), 
      submenu: whisperEnabled 
        ? [
            { label: 'Regular', submenu: langSubmenu },
            { label: 'Whisper', submenu: whisperLangSubmenu }
          ]
        : langSubmenu 
    },
    { type: 'separator' },
    { label: 'Settings', icon: getTrayIcon('settings'), click: () => showSettings() },
    { type: 'separator' },
    { label: 'Quit',     icon: getTrayIcon('quit'),     click: () => app.quit() }

  ]);
  tray.setContextMenu(contextMenu);
}

module.exports = {
  createTray, updateTrayMenu,
  setCaptureAction, setTranslatorAction,
  setAppStoreAction, setBrowserAction, setClipboardAction, setGalleryAction,
  setRecordAction, setStopRecordAction, setScreenshotAction,
  setRecordingState, setAiModeToggleAction, setWhisperAiModeToggleAction
};
