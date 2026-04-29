const { Tray, Menu, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const { LANGUAGES } = require('./constants');
const store = require('../../store/config');

let tray = null;
let _captureAction = null;
let _translatorAction = null;

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

/** Register the function that should fire when the user clicks "Capture" in the tray. */
function setCaptureAction(fn) { _captureAction = fn; }

/** Register the function that should fire when the user clicks "Translator" in the tray. */
function setTranslatorAction(fn) { _translatorAction = fn; }

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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isListening ? 'Stop Listening' : 'Start Listening',
      icon: getTrayIcon(isListening ? 'microphone-off' : 'microphone'),
      click: () => toggleListening()
    },
    { type: 'separator' },
    {
      label: 'Capture',
      icon: getTrayIcon('capture'),
      accelerator: 'Alt+Shift+S',
      click: () => { if (_captureAction) _captureAction(); }
    },
    {
      label: 'Translator',
      icon: getTrayIcon('translator'),
      accelerator: 'Alt+Shift+T',
      click: () => { if (_translatorAction) _translatorAction(); }
    },
    { type: 'separator' },
    { label: 'Language', icon: getTrayIcon('language'), submenu: langSubmenu },
    { type: 'separator' },
    { label: 'Settings', icon: getTrayIcon('settings'), click: () => showSettings() },
    { type: 'separator' },
    { label: 'Quit', icon: getTrayIcon('quit'), click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
}

module.exports = { createTray, updateTrayMenu, setCaptureAction, setTranslatorAction };
