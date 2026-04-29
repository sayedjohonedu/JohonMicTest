'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const store = require('../../store/config');

let translatorWindow = null;
let silenceAutoTimer = null;

// Silence auto-close is intentionally disabled for the translator.
// The user closes it manually via the close button.

function getTranslatorWindow() {
  return translatorWindow;
}

function resetTranslatorSilenceTimer() {
  // No-op: silence auto-close is disabled for the translator.
  // Clear any residual timer from a previous session, but do NOT set a new one.
  clearTimeout(silenceAutoTimer);
  silenceAutoTimer = null;
}

function createTranslatorWindow() {
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    translatorWindow.show();
    translatorWindow.focus();
    return translatorWindow;
  }

  const savedPos = store.get('translatorWindowPosition') || {};

  translatorWindow = new BrowserWindow({
    width: 850,
    height: 480,
    minWidth: 700,
    minHeight: 400,
    x: savedPos.x,
    y: savedPos.y,
    show: false,
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    hasShadow: true,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../../ui/translator-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  translatorWindow.loadFile(path.join(__dirname, '../../ui/translator.html'));

  translatorWindow.once('ready-to-show', () => {
    translatorWindow.show();
    translatorWindow.webContents.send('translator-auto-start');
    resetTranslatorSilenceTimer();
  });

  translatorWindow.on('moved', () => {
    if (translatorWindow && !translatorWindow.isDestroyed()) {
      const [x, y] = translatorWindow.getPosition();
      store.set('translatorWindowPosition', { x, y });
    }
  });

  translatorWindow.on('closed', () => {
    clearTimeout(silenceAutoTimer);
    translatorWindow = null;
  });

  return translatorWindow;
}

function showTranslator() {
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    translatorWindow.show();
    translatorWindow.focus();
    translatorWindow.webContents.send('translator-auto-start');
    resetTranslatorSilenceTimer();
  } else {
    createTranslatorWindow();
  }
}

function hideTranslator() {
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    translatorWindow.hide();
  }
}

function closeTranslator() {
  clearTimeout(silenceAutoTimer);
  if (translatorWindow && !translatorWindow.isDestroyed()) {
    translatorWindow.close();
    translatorWindow = null;
  }
}

function isTranslatorVisible() {
  return translatorWindow && !translatorWindow.isDestroyed() && translatorWindow.isVisible();
}

module.exports = {
  getTranslatorWindow,
  createTranslatorWindow,
  showTranslator,
  hideTranslator,
  closeTranslator,
  isTranslatorVisible,
  resetTranslatorSilenceTimer,
};
