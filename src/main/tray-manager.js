const { Tray, Menu, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const { LANGUAGES } = require('./constants');
const store = require('../../store/config');

let tray = null;

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
  nativeTheme.on('updated', () => { if (tray) updateTrayIcon(); });
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
    { label: isListening ? 'Stop Listening' : 'Start Listening', click: () => toggleListening() },
    { type: 'separator' },
    { label: 'Language', submenu: langSubmenu },
    { type: 'separator' },
    { label: 'Settings', click: () => showSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
}

module.exports = { createTray, updateTrayMenu };
