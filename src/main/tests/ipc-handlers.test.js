jest.mock('electron', () => ({
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
    removeListener: jest.fn(),
  },
  dialog: { showSaveDialog: jest.fn(), showOpenDialog: jest.fn() },
  BrowserWindow: { fromWebContents: jest.fn(), getAllWindows: jest.fn(() => []) },
  shell: { openExternal: jest.fn() },
  clipboard: {},
  app: { getVersion: jest.fn(() => '1.0.0'), setLoginItemSettings: jest.fn(), getPath: jest.fn(() => '/mock/path') },
  globalShortcut: { unregisterAll: jest.fn() },
  screen: { getCursorScreenPoint: jest.fn() }
}));

jest.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdates: jest.fn(),
    downloadUpdate: jest.fn(),
    quitAndInstall: jest.fn()
  }
}));

jest.mock('../../../store/config', () => ({
  get: jest.fn(),
  set: jest.fn(),
  store: {},
  clear: jest.fn()
}));

jest.mock('../licensing', () => ({
  verifyLicense: jest.fn(),
  checkAiTrialExpiry: jest.fn(() => ({ expired: false })),
  checkWhisperApiTrialExpiry: jest.fn(() => ({ expired: false }))
}));

jest.mock('../window-manager', () => ({
  applyOverlaySize: jest.fn(),
  getOverlayWindow: jest.fn(),
  getSettingsWindow: jest.fn(),
  OV: {},
  closeLicensePopup: jest.fn(),
  closeWordLimitPopup: jest.fn(),
  closeTranslatorLockedPopup: jest.fn(),
  closeAiTrialPopup: jest.fn(),
  showAiTrialExpiredPopup: jest.fn(),
  showWhisperApiLockedPopup: jest.fn(),
  closeWhisperApiLockedPopup: jest.fn(),
  showLicenseCelebration: jest.fn(),
  closeLicenseCelebration: jest.fn(),
  closeScreenRecorderLockedPopup: jest.fn(),
  closeLensLockedPopup: jest.fn(),
  showVoiceAgents: jest.fn(),
  closeVoiceAgents: jest.fn(),
  closeUpdateReminderPopup: jest.fn()
}));

jest.mock('uiohook-napi', () => ({
  uIOhook: {
    removeAllListeners: jest.fn()
  }
}));

jest.mock('../floating-browser-manager', () => ({
  setupFloatingBrowserIpc: jest.fn()
}));

jest.mock('../llm-client', () => ({
  callLlmRaw: jest.fn(),
  httpPost: jest.fn(),
  httpGet: jest.fn()
}));

jest.mock('../ai-dictation-manager', () => ({
  AiDictationManager: class {
    isProcessing = jest.fn();
    getBufferedText = jest.fn(() => '');
    resetSession = jest.fn();
  },
  checkOllamaStatus: jest.fn()
}));

const { setupIpcHandlers } = require('../ipc-handlers');
const { ipcMain } = require('electron');

describe('setupIpcHandlers', () => {
  let handlersOn = {};
  let handlersHandle = {};

  let mockDeps = {};

  beforeEach(() => {
    jest.clearAllMocks();
    handlersOn = {};
    handlersHandle = {};

    // Capture registered handlers
    ipcMain.on.mockImplementation((channel, handler) => {
      handlersOn[channel] = handler;
    });
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlersHandle[channel] = handler;
    });

    mockDeps = {
      toggleListening: jest.fn(),
      registerHotkeys: jest.fn(),
      getWsClient: jest.fn(),
      resetSilenceTimer: jest.fn(),
      showSettings: jest.fn(),
      robustKeyTap: jest.fn(),
      injectCharDirect: jest.fn(),
      injectText: jest.fn(),
      switchTrayLanguage: jest.fn(),
      resetModifiers: jest.fn(),
      _resetSilenceTimerForBrowser: jest.fn(),
      translatorCtx: {
        openTranslator: jest.fn(),
        closeTranslatorAndRestoreOverlay: jest.fn(),
        toggleListening: jest.fn()
      }
    };

    setupIpcHandlers(
      mockDeps.toggleListening,
      mockDeps.registerHotkeys,
      mockDeps.getWsClient,
      mockDeps.resetSilenceTimer,
      mockDeps.showSettings,
      mockDeps.robustKeyTap,
      mockDeps.injectCharDirect,
      mockDeps.injectText,
      mockDeps.switchTrayLanguage,
      mockDeps.resetModifiers,
      mockDeps._resetSilenceTimerForBrowser,
      mockDeps.translatorCtx
    );
  });

  it('should register fundamental ipcMain handlers', () => {
    expect(ipcMain.on).toHaveBeenCalled();
    expect(ipcMain.handle).toHaveBeenCalled();

    expect(handlersOn['save-config']).toBeDefined();
    expect(handlersOn['overlay-stop']).toBeDefined();
    expect(handlersOn['ai-send-now']).toBeDefined();
    expect(handlersOn['open-settings']).toBeDefined();

    expect(handlersHandle['get-config']).toBeDefined();
    expect(handlersHandle['get-stats']).toBeDefined();
    expect(handlersHandle['get-license-info']).toBeDefined();
  });

  describe('Configuration & State Handlers', () => {
    it('should save configuration and trigger updates', () => {
      const storeConfigMock = require('../../../store/config');
      const mockWebContents = { send: jest.fn() };
      const mockWindow = { isDestroyed: () => false, webContents: mockWebContents };
      const { BrowserWindow, app } = require('electron');

      BrowserWindow.getAllWindows.mockReturnValue([mockWindow]);

      const testConfig = { autoLaunch: true, micSensitivity: 1.5, otherKey: 'test' };
      const mockWsClient = { send: jest.fn() };
      mockDeps.getWsClient.mockReturnValue(mockWsClient);

      handlersOn['save-config']({}, testConfig);

      expect(storeConfigMock.set).toHaveBeenCalledWith(testConfig);
      expect(mockDeps.registerHotkeys).toHaveBeenCalledWith(mockDeps.toggleListening);
      expect(app.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        path: '/mock/path'
      });
      expect(mockWsClient.send).toHaveBeenCalledWith(
        JSON.stringify({ command: 'set-mic-sensitivity', sensitivity: 1.5 })
      );
      expect(mockWebContents.send).toHaveBeenCalledWith('config-updated', testConfig);
    });

    it('should retrieve store config', () => {
      const storeConfigMock = require('../../../store/config');
      storeConfigMock.store = { test: 'value' };

      const config = handlersHandle['get-config']();
      expect(config).toEqual({ test: 'value' });
    });

    it('should retrieve stats with defaults', () => {
      const storeConfigMock = require('../../../store/config');
      storeConfigMock.get.mockImplementation(key => undefined);

      const stats = handlersHandle['get-stats']();
      expect(stats).toEqual({
        totalWords: 0,
        totalSessions: 0,
        langUsage: {},
        firstDate: 0,
        freeDailyWords: 0
      });

      storeConfigMock.get.mockImplementation(key => {
        if (key === 'statsWords') return 100;
        if (key === 'statsSessions') return 5;
        return undefined;
      });

      const stats2 = handlersHandle['get-stats']();
      expect(stats2.totalWords).toBe(100);
      expect(stats2.totalSessions).toBe(5);
    });

    it('should retrieve license info', () => {
      const storeConfigMock = require('../../../store/config');
      storeConfigMock.get.mockImplementation(key => {
        if (key === 'licenseStatus') return 'active';
        if (key === 'licenseActivatedDate') return 12345;
        return undefined;
      });

      const licenseInfo = handlersHandle['get-license-info']();
      expect(licenseInfo).toEqual({
        status: 'active',
        licenseActivatedDate: 12345,
        freeDailyWords: 0,
        freeDailyReset: 0,
        licensePurchase: {}
      });
    });
  });

  describe('User Action & Injection Handlers', () => {
    it('should stop overlay and discard AI buffer', () => {
      const storeConfigMock = require('../../../store/config');
      storeConfigMock.get.mockReturnValue(true); // mock aiModeEnabled = true

      handlersOn['overlay-stop']();
      // toggleListening(null, false, false, aiActive)
      expect(mockDeps.toggleListening).toHaveBeenCalledWith(null, false, false, true);
    });

    it('should send AI command immediately', () => {
      const storeConfigMock = require('../../../store/config');
      storeConfigMock.get.mockReturnValue(true); // mock aiModeEnabled = true

      handlersOn['ai-send-now']();
      // toggleListening(null, false, false, false) -> process buffer
      expect(mockDeps.toggleListening).toHaveBeenCalledWith(null, false, false, false);
    });

    it('should open settings and focus window', () => {
      const mockSettingsWindow = { show: jest.fn(), focus: jest.fn() };
      mockDeps.showSettings.mockReturnValue(mockSettingsWindow);

      handlersOn['open-settings']();

      expect(mockDeps.resetSilenceTimer).toHaveBeenCalled();
      expect(mockDeps.showSettings).toHaveBeenCalled();
      expect(mockSettingsWindow.show).toHaveBeenCalled();
      expect(mockSettingsWindow.focus).toHaveBeenCalled();
    });

    it('should handle direct text injection', () => {
      handlersOn['inject-punct']({}, '!');
      expect(mockDeps.resetSilenceTimer).toHaveBeenCalled();
      expect(mockDeps.injectCharDirect).toHaveBeenCalledWith('!');
    });

    it('should handle robust key taps like enter and backspace', () => {
      handlersOn['inject-enter']();
      expect(mockDeps.resetSilenceTimer).toHaveBeenCalled();
      expect(mockDeps.robustKeyTap).toHaveBeenCalledWith('enter');

      mockDeps.resetSilenceTimer.mockClear();
      mockDeps.robustKeyTap.mockClear();

      handlersOn['inject-backspace']();
      expect(mockDeps.resetSilenceTimer).toHaveBeenCalled();
      expect(mockDeps.robustKeyTap).toHaveBeenCalledWith('backspace');
    });

    it('should reset silence timer explicitly', () => {
      handlersOn['reset-silence']();
      expect(mockDeps.resetSilenceTimer).toHaveBeenCalled();
    });
  });
});
