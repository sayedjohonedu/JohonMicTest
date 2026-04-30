"use strict";
const { contextBridge, ipcRenderer } = require("electron");

function on(channel, cb) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_, data) => cb(data));
}

contextBridge.exposeInMainWorld("appStoreAPI", {
  // Window controls
  close: () => ipcRenderer.send("appstore-close"),
  minimize: () => ipcRenderer.send("appstore-minimize"),
  maximize: () => ipcRenderer.send("appstore-maximize"),
  drag: () => ipcRenderer.send("window-drag"),
  stopDrag: () => ipcRenderer.send("window-drag-stop"),

  // App management
  getApps: () => ipcRenderer.invoke("appstore-get-apps"),
  pickFile: () => ipcRenderer.invoke("appstore-pick-file"),
  pickIcon: () => ipcRenderer.invoke("appstore-pick-icon"),
  installFile: () => ipcRenderer.invoke("appstore-install-file"),
  installFromPath: (p, name, icon) =>
    ipcRenderer.invoke("appstore-install-path", p, name, icon),
  installFromHtml: (html, name, icon, category) =>
    ipcRenderer.invoke("appstore-install-html", html, name, icon, category),
  uninstall: (id) => ipcRenderer.invoke("appstore-uninstall", id),
  launch: (id) => ipcRenderer.send("appstore-launch", id),
  getIcons: () => ipcRenderer.invoke("appstore-get-icons"),
  // Collections
  getCollections: () => ipcRenderer.invoke("appstore-get-collections"),
  downloadCollection: (id) => ipcRenderer.invoke("appstore-download-collection", id),
  reloadCollection: (id) => ipcRenderer.invoke("appstore-reload-collection", id),
  deleteCollection: (id) => ipcRenderer.invoke("appstore-delete-collection", id),

  setWebSecurity: (durationMs) =>
    ipcRenderer.invoke("appstore-set-web-security", durationMs),
  getWebSecurity: () => ipcRenderer.invoke("appstore-get-web-security"),
  onWebSecurityExpired: (cb) => on("appstore-web-security-expired", cb),
  showContextMenu: (id) => ipcRenderer.send("appstore-context-menu", id),
  doRename: (id, newName) =>
    ipcRenderer.invoke("appstore-do-rename", id, newName),
  doChangeIcon: (id) => ipcRenderer.invoke("appstore-do-change-icon", id),
  readFileBase64: (path) =>
    ipcRenderer.invoke("appstore-read-file-base64", path),
  saveIconBase64: (id, b64) =>
    ipcRenderer.invoke("appstore-do-change-icon-base64", id, b64),
  changeCategory: (id, category) =>
    ipcRenderer.invoke("appstore-change-category", id, category),
  reorderApps: (ids) => ipcRenderer.invoke("appstore-reorder-apps", ids),

  createFolder: (name, app1, app2) =>
    ipcRenderer.invoke("appstore-create-folder", name, app1, app2),
  moveToFolder: (appId, folderId) =>
    ipcRenderer.invoke("appstore-move-to-folder", appId, folderId),
  removeFromFolder: (appId) =>
    ipcRenderer.invoke("appstore-remove-from-folder", appId),
  deleteFolder: (folderId, deleteApps) =>
    ipcRenderer.invoke("appstore-delete-folder", folderId, deleteApps),

  // Context Menu callbacks
  onRename: (cb) => on("appstore-rename", cb),
  onChangeIcon: (cb) => on("appstore-change-icon", cb),
  onConfirmDelete: (cb) => on("appstore-confirm-delete", cb),
  onConfirmDeleteFolder: (cb) => on("appstore-confirm-delete-folder", cb),
  onRemoveFromFolder: (cb) => on("appstore-remove-from-folder", cb),
  onChatAI: (cb) => on("appstore-chat-ai", cb),
  onChangeCategory: (cb) => on("appstore-change-category", cb),

  // AI Builder
  buildWithAI: (messages, previousHtml, profileId) =>
    ipcRenderer.invoke("appstore-build-ai", messages, previousHtml, profileId),
  testAiApp: (html) => ipcRenderer.invoke("appstore-test-ai-app", html),
  closeAiTest: () => ipcRenderer.invoke("appstore-close-ai-test"),
  saveAiChat: (appId, messages) =>
    ipcRenderer.invoke("appstore-save-ai-chat", appId, messages),
  loadAiChat: (appId) => ipcRenderer.invoke("appstore-load-ai-chat", appId),
  updateAppHtml: (appId, newHtml) =>
    ipcRenderer.invoke("appstore-update-app-html", appId, newHtml),
  readAppHtml: (appId) => ipcRenderer.invoke("appstore-read-app-html", appId),

  // Global AI Sessions
  getAiSessions: () => ipcRenderer.invoke("appstore-get-ai-sessions"),
  saveAiSession: (sessionObj) =>
    ipcRenderer.invoke("appstore-save-ai-session", sessionObj),
  deleteAiSession: (sessionId) =>
    ipcRenderer.invoke("appstore-delete-ai-session", sessionId),

  // Config
  getConfig: () => ipcRenderer.invoke("appstore-get-config"),
  onConfigUpdate: (cb) => on("config-updated", cb),

  // Vault check (to show AI builder availability)
  getVaultSummary: () => ipcRenderer.invoke("appstore-vault-summary"),
  getLlmProfiles: () => ipcRenderer.invoke("appstore-get-llm-profiles"),

  // Backup & Restore
  exportAllApps: () => ipcRenderer.invoke("appstore-export-all"),
  importAllApps: (mode, filePath) => ipcRenderer.invoke("appstore-import-all", mode, filePath),
});
