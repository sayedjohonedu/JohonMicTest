"use strict";

const {
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  app,
  Menu,
} = require("electron");
const path = require("path");
const fs = require("fs");
const store = require("../../store/config");

let appStoreWindow = null;

// ── Paths (lazy — must be called after app.whenReady) ─────
let _appsDir = null;
let _manifestFile = null;
function getAppsDir() {
  if (!_appsDir) _appsDir = path.join(app.getPath("userData"), "miniapps");
  return _appsDir;
}
function getManifestFile() {
  if (!_manifestFile) _manifestFile = path.join(getAppsDir(), "registry.json");
  return _manifestFile;
}

function ensureAppsDir() {
  const dir = getAppsDir();
  const mf = getManifestFile();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(mf)) fs.writeFileSync(mf, "[]", "utf-8");
}

// ── Registry helpers ───────────────────────────────────────
function loadRegistry() {
  ensureAppsDir();
  try {
    const list = JSON.parse(fs.readFileSync(getManifestFile(), "utf-8"));
    // Inject base64 icon data
    for (const app of list) {
      if (app.icon) {
        let iconPath;
        if (app.builtIn) {
          // The dir is assets/builtin-apps/something. The ID is builtin_something
          const folderName = app.id.replace("builtin_", "");
          iconPath = path.join(
            __dirname,
            "../../assets/builtin-apps",
            folderName,
            app.icon,
          );
        } else {
          iconPath = path.join(getAppsDir(), app.id, app.icon);
        }

        if (fs.existsSync(iconPath)) {
          const ext = path.extname(iconPath).toLowerCase();
          const mime =
            ext === ".svg"
              ? "image/svg+xml"
              : ext === ".png"
                ? "image/png"
                : ext === ".webp"
                  ? "image/webp"
                  : "image/jpeg";
          const data = fs.readFileSync(iconPath, "base64");
          app.iconBase64 = `data:${mime};base64,${data}`;
        }
      }
    }
    return list;
  } catch {
    return [];
  }
}

function saveRegistry(list) {
  ensureAppsDir();
  fs.writeFileSync(getManifestFile(), JSON.stringify(list, null, 2), "utf-8");
}

// ── AI Sessions Registry ───────────────────────────────────
let _aiSessionsFile = null;
function getAiSessionsFile() {
  if (!_aiSessionsFile)
    _aiSessionsFile = path.join(getAppsDir(), "ai_sessions.json");
  return _aiSessionsFile;
}

function loadAiSessions() {
  ensureAppsDir();
  const file = getAiSessionsFile();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveAiSessions(sessions) {
  ensureAppsDir();
  fs.writeFileSync(
    getAiSessionsFile(),
    JSON.stringify(sessions, null, 2),
    "utf-8",
  );
}

// ── App Store Window ───────────────────────────────────────
function getAppStoreWindow() {
  return appStoreWindow;
}

function createAppStoreWindow() {
  if (appStoreWindow && !appStoreWindow.isDestroyed()) {
    appStoreWindow.show();
    appStoreWindow.focus();
    return appStoreWindow;
  }

  const savedPos = store.get("appStoreWindowPosition") || {};

  appStoreWindow = new BrowserWindow({
    width: 960,
    height: 620,
    minWidth: 780,
    minHeight: 500,
    x: savedPos.x,
    y: savedPos.y,
    show: false,
    frame: false,
    transparent: true,
    vibrancy: "under-window",
    visualEffectState: "active",
    hasShadow: true,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, "../../ui/appstore-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  appStoreWindow.loadFile(path.join(__dirname, "../../ui/appstore.html"));

  appStoreWindow.once("ready-to-show", () => {
    appStoreWindow.show();
  });

  appStoreWindow.on("moved", () => {
    if (appStoreWindow && !appStoreWindow.isDestroyed()) {
      const [x, y] = appStoreWindow.getPosition();
      store.set("appStoreWindowPosition", { x, y });
    }
  });

  appStoreWindow.on("closed", () => {
    appStoreWindow = null;
  });

  return appStoreWindow;
}

function showAppStore() {
  if (appStoreWindow && !appStoreWindow.isDestroyed()) {
    appStoreWindow.show();
    appStoreWindow.focus();
  } else {
    createAppStoreWindow();
  }
}

function closeAppStore() {
  if (appStoreWindow && !appStoreWindow.isDestroyed()) {
    appStoreWindow.close();
    appStoreWindow = null;
  }
}

function isAppStoreVisible() {
  return (
    appStoreWindow &&
    !appStoreWindow.isDestroyed() &&
    appStoreWindow.isVisible()
  );
}

// ── Sandbox runner ─────────────────────────────────────────
const sandboxWindows = new Map(); // appId → BrowserWindow

let webSecurityTimeout = null;
let webSecurityDisabledUntil = 0; // timestamp
let webSecurityDisabledForever = false;

function isWebSecurityDisabled() {
  if (webSecurityDisabledForever) return true;
  return Date.now() < webSecurityDisabledUntil;
}

function launchMiniApp(appId) {
  const registry = loadRegistry();
  const appEntry = registry.find((a) => a.id === appId);
  if (!appEntry) return;

  // If already open, focus it
  const existing = sandboxWindows.get(appId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }

  const entryFile = path.join(
    getAppsDir(),
    appId,
    appEntry.entry || "index.html",
  );
  if (!fs.existsSync(entryFile)) return;

  const win = new BrowserWindow({
    width: appEntry.width || 900,
    height: appEntry.height || 750,
    useContentSize: true,
    minWidth: 320,
    minHeight: 240,
    frame: true,
    title: appEntry.name || "Mini App",
    webPreferences: {
      // ─── SANDBOX: No Node, full context isolation ───
      partition: "persist:app_" + appId,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isWebSecurityDisabled(),
      // Expose a tiny safe bridge for file picker & download
      preload: path.join(__dirname, "../../ui/miniapp-preload.js"),
    },
  });

  win.loadFile(entryFile);
  sandboxWindows.set(appId, win);

  win.on("closed", () => {
    sandboxWindows.delete(appId);
  });
}

// ── Pick file for import (returns path without installing) ──
async function pickFileForImport() {
  const result = await dialog.showOpenDialog({
    title: "Select Web App",
    filters: [{ name: "Web Apps", extensions: ["html", "zip"] }],
    properties: ["openFile", "openDirectory"],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}

// ── Pick icon image ────────────────────────────────────────
async function pickIcon() {
  const result = await dialog.showOpenDialog({
    title: "Select App Icon",
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}

// ── Install from file / zip / folder (dialog fallback) ─────
async function installFromFile() {
  const p = await pickFileForImport();
  if (!p) return null;
  return installFromPath(p);
}

// ── Install from a filesystem path (file, zip, or folder) ──
function installFromPath(srcPath, appName, customIconPath, forcedCategory) {
  try {
    const stat = fs.statSync(srcPath);

    // Determine target folder name
    const finalName = appName || path.basename(srcPath, path.extname(srcPath));
    let sanitizedName = finalName.replace(/[^a-z0-9_-]/gi, "_");
    if (!sanitizedName) sanitizedName = "app";

    let id = sanitizedName;
    let appDir = path.join(getAppsDir(), id);
    let counter = 1;
    while (fs.existsSync(appDir)) {
      id = `${sanitizedName}_${counter}`;
      appDir = path.join(getAppsDir(), id);
      counter++;
    }

    fs.mkdirSync(appDir, { recursive: true });

    if (stat.isDirectory()) {
      // ── Folder import: deep-copy entire tree ──
      copyDirRecursive(srcPath, appDir);
    } else {
      const ext = path.extname(srcPath).toLowerCase();
      if (ext === ".zip") {
        // Extract ZIP
        try {
          const AdmZip = require("adm-zip");
          const zip = new AdmZip(srcPath);
          zip.extractAllTo(appDir, true);
        } catch {
          const { execSync } = require("child_process");
          try {
            execSync(`unzip -o "${srcPath}" -d "${appDir}"`);
          } catch {
            fs.rmSync(appDir, { recursive: true, force: true });
            return { error: "Failed to extract ZIP file" };
          }
        }
      } else {
        // Single file (HTML, etc.)
        fs.copyFileSync(srcPath, path.join(appDir, path.basename(srcPath)));
      }
    }

    // Process custom icon if provided
    if (customIconPath) {
      if (customIconPath.startsWith("data:image")) {
        const match = customIconPath.match(/^data:image\/([^;]+);base64,/);
        const ext = match && match[1] === "svg+xml" ? ".svg" : ".png";
        const b64 = customIconPath.replace(/^data:image\/[^;]+;base64,/, "");
        fs.writeFileSync(path.join(appDir, "appicon" + ext), b64, "base64");
      } else if (fs.existsSync(customIconPath)) {
        const ext = path.extname(customIconPath);
        fs.copyFileSync(customIconPath, path.join(appDir, "appicon" + ext));
      }
    }

    return _finalizeInstall(id, appDir, finalName, forcedCategory);
  } catch (e) {
    return { error: e.message || "Import failed" };
  }
}

// ── Install from pasted HTML code ──────────────────────────
function installFromHtml(payload, name, customIconPath, category) {
  try {
    let mainHtml = typeof payload === "string" ? payload : (payload.html || "");
    const titleMatch = mainHtml.match(/<title>(.*?)<\/title>/i);
    const finalName = name || (titleMatch ? titleMatch[1] : "Pasted App");

    let sanitizedName = finalName.replace(/[^a-z0-9_-]/gi, "_");
    if (!sanitizedName) sanitizedName = "app";

    let id = sanitizedName;
    let appDir = path.join(getAppsDir(), id);
    let counter = 1;
    while (fs.existsSync(appDir)) {
      id = `${sanitizedName}_${counter}`;
      appDir = path.join(getAppsDir(), id);
      counter++;
    }

    fs.mkdirSync(appDir, { recursive: true });

    if (typeof payload === "string") {
      fs.writeFileSync(path.join(appDir, "index.html"), payload, "utf-8");
    } else {
      let htmlContent = payload.html;
      // Ensure separate files are linked
      if (!htmlContent.includes("style.css") && payload.css) {
        htmlContent = htmlContent.replace(/<\/head>/i, '  <link rel="stylesheet" href="style.css">\n</head>');
        if (!htmlContent.includes("</head>")) htmlContent = `<link rel="stylesheet" href="style.css">\n` + htmlContent;
      }
      if (!htmlContent.includes("script.js") && payload.js) {
        htmlContent = htmlContent.replace(/<\/body>/i, '  <script src="script.js"></script>\n</body>');
        if (!htmlContent.includes("</body>")) htmlContent += `\n<script src="script.js"></script>`;
      }
      fs.writeFileSync(path.join(appDir, "index.html"), htmlContent, "utf-8");
      if (payload.css) fs.writeFileSync(path.join(appDir, "style.css"), payload.css, "utf-8");
      if (payload.js) fs.writeFileSync(path.join(appDir, "script.js"), payload.js, "utf-8");
    }

    if (customIconPath) {
      if (customIconPath.startsWith("data:image")) {
        const match = customIconPath.match(/^data:image\/([^;]+);base64,/);
        const ext = match && match[1] === "svg+xml" ? ".svg" : ".png";
        const b64 = customIconPath.replace(/^data:image\/[^;]+;base64,/, "");
        fs.writeFileSync(path.join(appDir, "appicon" + ext), b64, "base64");
      } else if (fs.existsSync(customIconPath)) {
        const ext = path.extname(customIconPath);
        fs.copyFileSync(customIconPath, path.join(appDir, "appicon" + ext));
      }
    }

    return _finalizeInstall(id, appDir, finalName, category);
  } catch (e) {
    return { error: e.message || "Paste install failed" };
  }
}

// ── Finalize install: detect entry point + manifest ────────
function _finalizeInstall(id, appDir, fallbackName, forcedCategory) {
  // Check if ZIP extracted into a single subfolder (common pattern)
  const entries = fs.readdirSync(appDir);
  if (entries.length === 1) {
    const single = path.join(appDir, entries[0]);
    try {
      if (fs.statSync(single).isDirectory()) {
        // Move contents up one level
        for (const f of fs.readdirSync(single)) {
          fs.renameSync(path.join(single, f), path.join(appDir, f));
        }
        fs.rmdirSync(single);
      }
    } catch {}
  }

  // Detect app icon (appicon.*)
  let appIcon = null;
  try {
    const currentFiles = fs.readdirSync(appDir);
    const iconFiles = currentFiles.filter((f) =>
      /^appicon\.(png|jpe?g|webp|gif|svg)$/i.test(f),
    );
    if (iconFiles.length > 0) {
      // Grab the latest one
      iconFiles.sort(
        (a, b) =>
          fs.statSync(path.join(appDir, b)).mtimeMs -
          fs.statSync(path.join(appDir, a)).mtimeMs,
      );
      appIcon = iconFiles[0];
    }
  } catch {}

  // Determine entry point
  let entry = "index.html";
  if (!fs.existsSync(path.join(appDir, "index.html"))) {
    const htmlFiles = findHtmlFiles(appDir);
    if (htmlFiles.length > 0) entry = htmlFiles[0];
  }

  // Read manifest.json if present
  let manifest = {};
  const manifestPath = path.join(appDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {}
  }

  // Provide a random icon if none exists
  if (!appIcon && !manifest.icon) {
    const ICONS = [
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
      '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
      '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
      '<path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A2 2 0 0 1 6.6 1h10.8a2 2 0 0 1 1.89 1.16l2.44 7.51 1.22 3.78a.84.84 0 0 1-.3.94z"/>',
      '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
      '<circle cx="12" cy="12" r="10"/><path d="M16 12l-8 5V7z"/>',
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
      '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
      '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2-2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><rect x="7" y="7" width="3" height="9"/><rect x="14" y="7" width="3" height="5"/>',
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
      '<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="6.5"/>',
      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    ];
    const COLORS = [
      { bg: "#FCE4EC", fg: "#E91E63" },
      { bg: "#F3E5F5", fg: "#9C27B0" },
      { bg: "#E8EAF6", fg: "#3F51B5" },
      { bg: "#E3F2FD", fg: "#2196F3" },
      { bg: "#E0F7FA", fg: "#00BCD4" },
      { bg: "#E0F2F1", fg: "#009688" },
      { bg: "#E8F5E9", fg: "#4CAF50" },
      { bg: "#F9FBE7", fg: "#8BC34A" },
      { bg: "#FFF8E1", fg: "#FFC107" },
      { bg: "#FFF3E0", fg: "#FF9800" },
      { bg: "#FBE9E7", fg: "#FF5722" },
      { bg: "#EFEBE9", fg: "#795548" },
      { bg: "#ECEFF1", fg: "#607D8B" },
      { bg: "#EDE7F6", fg: "#673AB7" },
      { bg: "#E1F5FE", fg: "#03A9F4" },
    ];
    const iconStr = ICONS[Math.floor(Math.random() * ICONS.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${color.bg}"/><g transform="translate(16,16) scale(1.333)" fill="none" stroke="${color.fg}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconStr}</g></svg>`;
    const b64 = Buffer.from(svgStr).toString("base64");
    fs.writeFileSync(path.join(appDir, "appicon.svg"), svgStr, "utf-8");
    appIcon = "appicon.svg";
  }

  const appEntry = {
    id,
    name: manifest.name || fallbackName || "Imported App",
    description: manifest.description || "Imported mini app",
    icon: appIcon || manifest.icon || null,
    entry,
    width: manifest.width || 600,
    height: manifest.height || 500,
    category: forcedCategory || manifest.category || "imported",
    installedAt: Date.now(),
    builtIn: false,
  };

  const registry = loadRegistry();
  registry.push(appEntry);
  saveRegistry(registry);
  return appEntry;
}

// ── Recursive folder copy ──────────────────────────────────
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, item.name);
    const d = path.join(dest, item.name);
    if (item.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── Recursive .html file finder ────────────────────────────
function findHtmlFiles(dir) {
  const results = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory())
      results.push(
        ...findHtmlFiles(path.join(dir, item.name)).map((f) =>
          path.join(item.name, f),
        ),
      );
    else if (item.name.endsWith(".html")) results.push(item.name);
  }
  return results;
}

function uninstallApp(appId) {
  const registry = loadRegistry();
  const idx = registry.findIndex((a) => a.id === appId);
  if (idx === -1) return false;
  const app = registry[idx];

  if (app.builtIn) {
    const deleted = store.get("deletedBuiltins") || [];
    if (!deleted.includes(appId)) {
      deleted.push(appId);
      store.set("deletedBuiltins", deleted);
    }
  }

  // Close if running
  const win = sandboxWindows.get(appId);
  if (win && !win.isDestroyed()) win.close();

  // Clear data
  const { session } = require("electron");
  session.fromPartition("persist:app_" + appId).clearStorageData().catch(() => {});

  // Remove files
  const appDir = path.join(getAppsDir(), appId);
  if (fs.existsSync(appDir))
    fs.rmSync(appDir, { recursive: true, force: true });

  registry.splice(idx, 1);
  saveRegistry(registry);
  return true;
}

// ── AI Builder ─────────────────────────────────────────────
async function buildAppWithAI(messages, currentFiles, profileId) {
  const apiVault = require("./api-vault");
  const { callLlmRaw } = require("./llm-client");

  let profile = null;
  if (profileId && profileId !== "default") {
    const profiles = apiVault.getLlmProfiles();
    profile = profiles.find(p => p.id === profileId);
  }

  // Get the best available LLM profile (use vault fallback chain)
  if (!profile) {
    profile =
      apiVault.getDefaultForFeature("translator") ||
      apiVault.getDefaultForFeature("ai-dictation");
  }
  if (!profile)
    return {
      error:
        "No AI API profile configured. Go to Settings → API Vault to add one.",
    };

  const systemPrompt = `You are an expert web app builder AI. The user will ask you to create or modify a web app.
The app MUST be built using three separate files: index.html, style.css, and script.js.
Do NOT use external dependencies or CDN links. Use modern, beautiful CSS (dark theme, vibrant colors).

If you are generating a NEW app from scratch, or doing a major rewrite, output the FULL code for all three files wrapped in their respective markdown blocks:
\`\`\`html
...
\`\`\`
\`\`\`css
...
\`\`\`
\`\`\`javascript
...
\`\`\`

If you are MODIFYING an existing app, do NOT output the full code. Instead, use EXACT SEARCH/REPLACE blocks.
Format:
FILE: index.html (or style.css or script.js)
<<<<
[exact lines to replace, matching indentation]
====
[new lines to insert]
>>>>

You can output multiple blocks for different files. Be precise. If you must rewrite an entire file, use the markdown wrapper for that file.`;

  const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];

  const result = await callLlmRaw({
    messages: fullMessages,
    profile,
    temperature: 0.5,
  });

  if (result.error) return { error: result.error };

  let responseText = result.text || "";
  const matchHtml = responseText.match(/```html\s+([\s\S]*?)```/i);
  const matchCss = responseText.match(/```css\s+([\s\S]*?)```/i);
  const matchJs = responseText.match(/```(?:javascript|js)\s+([\s\S]*?)```/i);

  let hasSeparateAssets = !!(matchCss || matchJs);
  let isMultiFile = (typeof currentFiles === "object" && currentFiles !== null) || hasSeparateAssets;
  let newFiles = (typeof currentFiles === "object" && currentFiles !== null) 
    ? { ...currentFiles } 
    : { html: currentFiles || "", css: "", js: "" };

  if (matchHtml) newFiles.html = matchHtml[1].trim();
  if (matchCss) newFiles.css = matchCss[1].trim();
  if (matchJs) newFiles.js = matchJs[1].trim();

  // Try to apply SEARCH/REPLACE blocks
  const blockRegex = /(?:FILE:\s*([^\n]+)\n)?<<<<\n?([\s\S]*?)\n?====\n?([\s\S]*?)\n?>>>>/gi;
  let match;
  let modified = false;
  while ((match = blockRegex.exec(responseText)) !== null) {
    let file = (match[1] || "index.html").trim().toLowerCase();
    let search = match[2];
    let replace = match[3];

    let targetKey = "html";
    if (file.includes("style.css")) targetKey = "css";
    else if (file.includes("script.js")) targetKey = "js";

    if (targetKey === "css" || targetKey === "js") {
      isMultiFile = true;
    }

    if (newFiles[targetKey].includes(search)) {
      newFiles[targetKey] = newFiles[targetKey].replace(search, replace);
      modified = true;
    } else if (newFiles[targetKey].includes(search.trim())) {
      newFiles[targetKey] = newFiles[targetKey].replace(search.trim(), replace.trim());
      modified = true;
    }
  }

  // If no blocks and looks like full HTML string (backward compatibility)
  if (!modified && !matchHtml && !responseText.includes("<<<<") && (responseText.includes("<html") || responseText.includes("<!DOCTYPE"))) {
    let code = responseText.trim();
    if (code.startsWith("```html")) code = code.replace(/^```html/i, "");
    if (code.endsWith("```")) code = code.replace(/```$/, "");
    newFiles.html = code.trim();
  }

  // Always return the object if it's a multi-file project, otherwise return the string
  return { 
    html: isMultiFile ? newFiles : newFiles.html, 
    text: responseText 
  };
}

let aiTestWindow = null;

async function testAiApp(payload) {
  if (aiTestWindow && !aiTestWindow.isDestroyed()) {
    aiTestWindow.close();
  }

  const tempDir = path.join(app.getPath("temp"), "mictab_ai_test");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  let mainHtml = typeof payload === "string" ? payload : (payload.html || "");
  const entryFile = path.join(tempDir, "index.html");

  if (typeof payload === "string") {
    fs.writeFileSync(entryFile, mainHtml, "utf-8");
  } else {
    let htmlContent = payload.html;
    if (!htmlContent.includes("style.css") && payload.css) {
      htmlContent = htmlContent.replace(/<\/head>/i, '  <link rel="stylesheet" href="style.css">\n</head>');
      if (!htmlContent.includes("</head>")) htmlContent = `<link rel="stylesheet" href="style.css">\n` + htmlContent;
    }
    if (!htmlContent.includes("script.js") && payload.js) {
      htmlContent = htmlContent.replace(/<\/body>/i, '  <script src="script.js"></script>\n</body>');
      if (!htmlContent.includes("</body>")) htmlContent += `\n<script src="script.js"></script>`;
    }
    fs.writeFileSync(entryFile, htmlContent, "utf-8");
    if (payload.css) fs.writeFileSync(path.join(tempDir, "style.css"), payload.css, "utf-8");
    if (payload.js) fs.writeFileSync(path.join(tempDir, "script.js"), payload.js, "utf-8");
  }

  aiTestWindow = new BrowserWindow({
    width: 700,
    height: 550,
    minWidth: 320,
    minHeight: 240,
    frame: true,
    title: "AI App Test",
    webPreferences: {
      partition: "test_ai_app",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isWebSecurityDisabled(),
      preload: path.join(__dirname, "../../ui/miniapp-preload.js"),
    },
  });

  aiTestWindow.loadFile(entryFile);

  aiTestWindow.on("closed", () => {
    aiTestWindow = null;
  });

  return true;
}

async function closeAiTest() {
  if (aiTestWindow && !aiTestWindow.isDestroyed()) {
    aiTestWindow.close();
  }
  return true;
}

// ── Built-in apps installer ────────────────────────────────
function installBuiltInApps() {
  const registry = loadRegistry();
  const builtInDir = path.join(__dirname, "../../assets/builtin-apps");
  if (!fs.existsSync(builtInDir)) return;

  const dirs = fs
    .readdirSync(builtInDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());
  const deleted = store.get("deletedBuiltins") || [];
  for (const dir of dirs) {
    const appId = `builtin_${dir.name}`;
    if (registry.find((a) => a.id === appId)) continue;
    if (deleted.includes(appId)) continue;

    const srcDir = path.join(builtInDir, dir.name);
    const destDir = path.join(getAppsDir(), `builtin_${dir.name}`);
    fs.mkdirSync(destDir, { recursive: true });

    // Copy all files
    for (const file of fs.readdirSync(srcDir)) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }

    // Read manifest
    let manifest = {};
    const manifestPath = path.join(destDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      } catch {}
    }

    // Detect app icon (appicon.*)
    let appIcon = manifest.icon || null;
    try {
      const currentFiles = fs.readdirSync(destDir);
      const iconFiles = currentFiles.filter((f) =>
        /^appicon\.(png|jpe?g|webp|gif|svg)$/i.test(f),
      );
      if (iconFiles.length > 0) {
        iconFiles.sort(
          (a, b) =>
            fs.statSync(path.join(destDir, b)).mtimeMs -
            fs.statSync(path.join(destDir, a)).mtimeMs,
        );
        appIcon = iconFiles[0];
      }
    } catch {}

    registry.push({
      id: `builtin_${dir.name}`,
      name: manifest.name || dir.name,
      description: manifest.description || "",
      icon: appIcon,
      entry: manifest.entry || "index.html",
      width: manifest.width || 600,
      height: manifest.height || 500,
      category: manifest.category || "tools",
      installedAt: Date.now(),
      builtIn: true,
    });
  }
  saveRegistry(registry);
}

// ── IPC Setup ──────────────────────────────────────────────
function setupAppStoreIpc() {
  ipcMain.on("miniapp-resize", (event, size) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed() && size.width && size.height) {
        win.setContentSize(Math.ceil(size.width), Math.ceil(size.height), true);
      }
    } catch (e) {
      console.error("Failed to resize miniapp:", e);
    }
  });

  ipcMain.handle("appstore-get-apps", () => loadRegistry());
  ipcMain.handle("appstore-pick-file", () => pickFileForImport());
  ipcMain.handle("appstore-pick-icon", () => pickIcon());
  ipcMain.handle("appstore-install-file", () => installFromFile());
  ipcMain.handle("appstore-install-path", (_, p, name, icon) =>
    installFromPath(p, name, icon),
  );
  ipcMain.handle("appstore-install-html", (_, payload, name, icon, category) =>
    installFromHtml(payload, name, icon, category),
  );

  ipcMain.handle("appstore-update-app-html", (_, appId, payload) => {
    try {
      const appDir = path.join(getAppsDir(), appId);
      if (fs.existsSync(appDir)) {
        if (typeof payload === "string") {
          fs.writeFileSync(path.join(appDir, "index.html"), payload, "utf-8");
        } else {
          let htmlContent = payload.html;
          if (!htmlContent.includes("style.css") && payload.css) {
            htmlContent = htmlContent.replace(/<\/head>/i, '  <link rel="stylesheet" href="style.css">\n</head>');
            if (!htmlContent.includes("</head>")) htmlContent = `<link rel="stylesheet" href="style.css">\n` + htmlContent;
          }
          if (!htmlContent.includes("script.js") && payload.js) {
            htmlContent = htmlContent.replace(/<\/body>/i, '  <script src="script.js"></script>\n</body>');
            if (!htmlContent.includes("</body>")) htmlContent += `\n<script src="script.js"></script>`;
          }
          fs.writeFileSync(path.join(appDir, "index.html"), htmlContent, "utf-8");
          if (payload.css !== undefined) fs.writeFileSync(path.join(appDir, "style.css"), payload.css, "utf-8");
          if (payload.js !== undefined) fs.writeFileSync(path.join(appDir, "script.js"), payload.js, "utf-8");
        }
        return { success: true };
      }
      return { error: "App not found" };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("appstore-read-app-html", (_, appId) => {
    try {
      const appDir = path.join(getAppsDir(), appId);
      const indexPath = path.join(appDir, "index.html");
      const cssPath = path.join(appDir, "style.css");
      const jsPath = path.join(appDir, "script.js");
      
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, "utf-8");
        if (fs.existsSync(cssPath) || fs.existsSync(jsPath)) {
          return {
            html,
            css: fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf-8") : "",
            js: fs.existsSync(jsPath) ? fs.readFileSync(jsPath, "utf-8") : ""
          };
        }
        return html;
      }
      return null;
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle("appstore-get-icons", async () => {
    const ICONS = [
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
      '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
      '<path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A2 2 0 0 1 6.6 1h10.8a2 2 0 0 1 1.89 1.16l2.44 7.51 1.22 3.78a.84.84 0 0 1-.3.94z"/>',
      '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
      '<circle cx="12" cy="12" r="10"/><path d="M16 12l-8 5V7z"/>',
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
      '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
      '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><rect x="7" y="7" width="3" height="9"/><rect x="14" y="7" width="3" height="5"/>',
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
      '<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="6.5"/>',
      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
      '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
      '<path d="M12 20.94c5.17 0 9.38-4.21 9.38-9.38C21.38 6.39 17.17 2.18 12 2.18S2.62 6.39 2.62 11.56c0 5.17 4.21 9.38 9.38 9.38z"/><path d="M12 6.87v9.38"/><path d="M7.31 11.56h9.38"/>',
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
      '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
      '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
      '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      '<path d="M2 12h4l2-9 4 18 2-9h4"/><line x1="12" y1="3" x2="12" y2="3.01"/><line x1="12" y1="21" x2="12" y2="21.01"/>',
      '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
      '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
      '<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2"/>',
      '<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>',
    ];
    const COLORS = [
      { bg: "#FCE4EC", fg: "#E91E63" },
      { bg: "#F3E5F5", fg: "#9C27B0" },
      { bg: "#E8EAF6", fg: "#3F51B5" },
      { bg: "#E3F2FD", fg: "#2196F3" },
      { bg: "#E0F7FA", fg: "#00BCD4" },
      { bg: "#E0F2F1", fg: "#009688" },
      { bg: "#E8F5E9", fg: "#4CAF50" },
      { bg: "#F9FBE7", fg: "#8BC34A" },
      { bg: "#FFF8E1", fg: "#FFC107" },
      { bg: "#FFF3E0", fg: "#FF9800" },
      { bg: "#FBE9E7", fg: "#FF5722" },
      { bg: "#EFEBE9", fg: "#795548" },
      { bg: "#ECEFF1", fg: "#607D8B" },
      { bg: "#EDE7F6", fg: "#673AB7" },
      { bg: "#E1F5FE", fg: "#03A9F4" },
    ];
    const result = [];
    for (let i = 0; i < 40; i++) {
      const iconStr = ICONS[i % ICONS.length];
      const color = COLORS[i % COLORS.length];
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${color.bg}"/><g transform="translate(16,16) scale(1.333)" fill="none" stroke="${color.fg}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconStr}</g></svg>`;
      result.push(svgStr);
    }
    return result;
  });

  ipcMain.handle("appstore-uninstall", (_, appId) => uninstallApp(appId));
  ipcMain.handle("appstore-build-ai", (_, messages, currentHtml, profileId) =>
    buildAppWithAI(messages, currentHtml, profileId),
  );
  ipcMain.handle("appstore-test-ai-app", (_, html) => testAiApp(html));
  ipcMain.handle("appstore-close-ai-test", () => closeAiTest());
  ipcMain.on("appstore-launch", (_, appId) => launchMiniApp(appId));
  ipcMain.on("appstore-close", () => closeAppStore());
  ipcMain.on("appstore-minimize", () => {
    if (appStoreWindow) appStoreWindow.minimize();
  });
  ipcMain.on("appstore-maximize", () => {
    if (appStoreWindow) {
      appStoreWindow.isMaximized()
        ? appStoreWindow.unmaximize()
        : appStoreWindow.maximize();
    }
  });

  ipcMain.handle("appstore-sync-games", async () => {
    try {
      let latestSha = null;
      try {
        const resp = await fetch(
          "https://api.github.com/repos/he-is-talha/html-css-javascript-games/commits/main",
        );
        if (resp.ok) {
          const data = await resp.json();
          latestSha = data.sha;
        }
      } catch (err) {
        console.error("Failed to fetch commit sha:", err);
      }

      const registry = loadRegistry();
      const games = registry.filter((a) => a.category === "games");

      if (latestSha) {
        const savedSha = store.get("gamesRepoCommit");
        if (savedSha === latestSha && games.length > 0) {
          return { updated: false };
        }
      } else {
        // If we couldn't fetch SHA (e.g. rate limit) but we already have games, skip to prevent spam
        if (games.length > 0) return { updated: false };
      }

      const zipUrl =
        "https://github.com/he-is-talha/html-css-javascript-games/archive/refs/heads/main.zip";
      const zipResp = await fetch(zipUrl);
      if (!zipResp.ok) return { error: "Failed to download games" };

      const zipBuffer = Buffer.from(await zipResp.arrayBuffer());
      const tempZipPath = path.join(app.getPath("temp"), "games.zip");
      fs.writeFileSync(tempZipPath, zipBuffer);

      const extractDir = path.join(
        app.getPath("temp"),
        "games_extract_" + Date.now(),
      );

      const AdmZip = require("adm-zip");
      const zip = new AdmZip(tempZipPath);
      zip.extractAllTo(extractDir, true);

      const entries = fs.readdirSync(extractDir);
      let rootFolder = extractDir;
      if (
        entries.length === 1 &&
        fs.statSync(path.join(extractDir, entries[0])).isDirectory()
      ) {
        rootFolder = path.join(extractDir, entries[0]);
      }

      const items = fs.readdirSync(rootFolder);
      for (const item of items) {
        const itemPath = path.join(rootFolder, item);
        if (fs.statSync(itemPath).isDirectory()) {
          const gameName = item.replace(/^\d+-/, "").replace(/-/g, " ");
          installFromPath(itemPath, gameName, null, "games");
        }
      }

      if (latestSha) {
        store.set("gamesRepoCommit", latestSha);
      }
      fs.rmSync(tempZipPath, { force: true });
      fs.rmSync(extractDir, { recursive: true, force: true });

      return { updated: true };
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle("appstore-get-config", () => {
    return {
      theme: store.get("theme") || "system",
    };
  });
  ipcMain.handle("appstore-vault-summary", () => {
    const apiVault = require("./api-vault");
    return apiVault.getSummary();
  });
  ipcMain.handle("appstore-get-llm-profiles", () => {
    const apiVault = require("./api-vault");
    return apiVault.getLlmProfiles();
  });

  // Context Menu and Edit Options
  ipcMain.on("appstore-context-menu", (event, appId) => {
    const registry = loadRegistry();
    const appEntry = registry.find((a) => a.id === appId);
    if (!appEntry) return;

    const isFolder = appEntry.isFolder;

    let menuTemplate = [];

    if (isFolder) {
      menuTemplate = [
        {
          label: "Rename Folder",
          click: () => event.sender.send("appstore-rename", appId),
        },
        { type: "separator" },
        {
          label: "Delete Folder",
          click: () =>
            event.sender.send("appstore-confirm-delete-folder", appId),
        },
      ];
    } else {
      menuTemplate = [
        { label: "Open", click: () => launchMiniApp(appId) },
        {
          label: "Open Folder",
          click: () => shell.showItemInFolder(path.join(getAppsDir(), appId)),
        },
        { type: "separator" },
        {
          label: "Chat with AI",
          click: () => event.sender.send("appstore-chat-ai", appId),
        },
        {
          label: "Rename",
          click: () => event.sender.send("appstore-rename", appId),
        },
        {
          label: "Change Icon",
          click: () => event.sender.send("appstore-change-icon", appId),
        },
        {
          label: "Reset App Data",
          click: () => {
            const { session } = require("electron");
            const sess = session.fromPartition("persist:app_" + appId);
            sess.clearStorageData().then(() => {
              if (sandboxWindows.has(appId)) {
                sandboxWindows.get(appId).reload();
              }
            });
          },
        },
        { type: "separator" },
        {
          label: "Move to Category",
          submenu: [
            {
              label: "Tools",
              click: () =>
                event.sender.send("appstore-change-category", {
                  appId,
                  category: "tools",
                }),
            },
            {
              label: "Games",
              click: () =>
                event.sender.send("appstore-change-category", {
                  appId,
                  category: "games",
                }),
            },
            {
              label: "Imported",
              click: () =>
                event.sender.send("appstore-change-category", {
                  appId,
                  category: "imported",
                }),
            },
            {
              label: "AI Built",
              click: () =>
                event.sender.send("appstore-change-category", {
                  appId,
                  category: "ai-built",
                }),
            },
          ],
        },
      ];

      if (appEntry.folderId) {
        menuTemplate.push({
          label: "Remove from Folder",
          click: () => event.sender.send("appstore-remove-from-folder", appId),
        });
      }

      menuTemplate.push(
        { type: "separator" },
        {
          label: "Delete",
          click: () => event.sender.send("appstore-confirm-delete", appId),
        },
      );
    }
    Menu.buildFromTemplate(menuTemplate).popup();
  });

  ipcMain.handle("appstore-do-rename", (_, appId, newName) => {
    const registry = loadRegistry();
    const appEntry = registry.find((a) => a.id === appId);
    if (appEntry) {
      appEntry.name = newName;
      saveRegistry(registry);
    }
  });

  ipcMain.handle("appstore-change-category", (_, appId, category) => {
    const registry = loadRegistry();
    const appEntry = registry.find((a) => a.id === appId);
    if (appEntry) {
      appEntry.category = category;
      saveRegistry(registry);
    }
  });

  ipcMain.handle("appstore-reorder-apps", (_, appIds) => {
    const registry = loadRegistry();
    // Sort registry to match appIds order where applicable
    registry.sort((a, b) => {
      let indexA = appIds.indexOf(a.id);
      let indexB = appIds.indexOf(b.id);
      if (indexA === -1) indexA = 999999;
      if (indexB === -1) indexB = 999999;
      return indexA - indexB;
    });
    saveRegistry(registry);
  });

  ipcMain.handle("appstore-create-folder", (_, folderName, appId1, appId2) => {
    const registry = loadRegistry();
    const folderId = "folder_" + Date.now();
    const app1 = registry.find((a) => a.id === appId1);
    const app2 = registry.find((a) => a.id === appId2);

    if (app1 && app2) {
      registry.push({
        id: folderId,
        isFolder: true,
        name: folderName,
        category: app1.category, // default to same category
      });
      app1.folderId = folderId;
      app2.folderId = folderId;
      saveRegistry(registry);
    }
    return folderId;
  });

  ipcMain.handle("appstore-move-to-folder", (_, appId, folderId) => {
    const registry = loadRegistry();
    const app = registry.find((a) => a.id === appId);
    if (app) {
      app.folderId = folderId;
      saveRegistry(registry);
    }
  });

  ipcMain.handle("appstore-remove-from-folder", (_, appId) => {
    const registry = loadRegistry();
    const app = registry.find((a) => a.id === appId);
    if (app) {
      delete app.folderId;
      saveRegistry(registry);
    }
  });

  ipcMain.handle("appstore-delete-folder", (_, folderId, deleteApps) => {
    const registry = loadRegistry();
    if (deleteApps) {
      // Find and uninstall apps
      const appsToDelete = registry.filter((a) => a.folderId === folderId);
      for (const app of appsToDelete) {
        uninstallApp(app.id);
      }
    } else {
      // Remove folderId from apps
      registry.forEach((a) => {
        if (a.folderId === folderId) {
          delete a.folderId;
        }
      });
    }
    // Delete folder entry
    const finalRegistry = loadRegistry(); // reload in case uninstall modified it
    const index = finalRegistry.findIndex((a) => a.id === folderId);
    if (index !== -1) {
      finalRegistry.splice(index, 1);
      saveRegistry(finalRegistry);
    }
  });

  ipcMain.handle("appstore-set-web-security", (_, durationMs) => {
    if (durationMs <= 0) {
      webSecurityDisabledUntil = 0;
      webSecurityDisabledForever = false;
      if (webSecurityTimeout) clearTimeout(webSecurityTimeout);
      return false;
    }

    if (durationMs === Infinity) {
      webSecurityDisabledForever = true;
      webSecurityDisabledUntil = 0;
      if (webSecurityTimeout) clearTimeout(webSecurityTimeout);
      return true;
    }

    webSecurityDisabledForever = false;
    webSecurityDisabledUntil = Date.now() + durationMs;
    if (webSecurityTimeout) clearTimeout(webSecurityTimeout);
    webSecurityTimeout = setTimeout(() => {
      webSecurityDisabledUntil = 0;
      if (appStoreWindow && !appStoreWindow.isDestroyed()) {
        appStoreWindow.webContents.send("appstore-web-security-expired");
      }
    }, durationMs);
    return true;
  });

  ipcMain.handle("appstore-get-web-security", () => {
    if (webSecurityDisabledForever) return Infinity;
    if (Date.now() < webSecurityDisabledUntil) {
      return webSecurityDisabledUntil - Date.now();
    }
    return 0;
  });

  ipcMain.handle("appstore-do-change-icon", async (_, appId) => {
    const iconPath = await pickIcon();
    if (!iconPath) return false;
    return iconPath; // Return the path so the UI can process it
  });

  ipcMain.handle("appstore-read-file-base64", (_, p) => {
    try {
      const data = fs.readFileSync(p, "base64");
      const ext = path.extname(p).toLowerCase();
      const mime =
        ext === ".svg"
          ? "image/svg+xml"
          : ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "image/jpeg";
      return `data:${mime};base64,${data}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle("appstore-do-change-icon-base64", (_, appId, base64Data) => {
    const registry = loadRegistry();
    const appEntry = registry.find((a) => a.id === appId);
    if (!appEntry) return false;

    let appDir;
    if (appEntry.builtIn) {
      const folderName = appEntry.id.replace("builtin_", "");
      appDir = path.join(__dirname, "../../assets/builtin-apps", folderName);
    } else {
      appDir = path.join(getAppsDir(), appId);
    }

    const match = base64Data.match(/^data:image\/([^;]+);base64,/);
    const ext = match && match[1] === "svg+xml" ? ".svg" : ".png";
    const targetIcon = path.join(appDir, "appicon" + ext);
    const b64 = base64Data.replace(/^data:image\/[^;]+;base64,/, "");
    fs.writeFileSync(targetIcon, b64, "base64");

    // Update registry so UI refresh sees it
    appEntry.icon = "appicon" + ext;
    saveRegistry(registry);
    return true;
  });

  ipcMain.handle("appstore-save-ai-chat", async (e, appId, messages) => {
    try {
      const appDir = path.join(getAppsDir(), appId);
      if (fs.existsSync(appDir)) {
        fs.writeFileSync(
          path.join(appDir, "history.json"),
          JSON.stringify(messages, null, 2),
        );
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle("appstore-load-ai-chat", async (e, appId) => {
    try {
      const appDir = path.join(getAppsDir(), appId);
      const histPath = path.join(appDir, "history.json");
      if (fs.existsSync(histPath)) {
        const data = fs.readFileSync(histPath, "utf-8");
        return JSON.parse(data);
      }
      return [];
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle("appstore-get-ai-sessions", () => loadAiSessions());

  ipcMain.handle("appstore-save-ai-session", (_, sessionObj) => {
    const sessions = loadAiSessions();
    const existingIdx = sessions.findIndex((s) => s.id === sessionObj.id);
    if (existingIdx !== -1) {
      sessions[existingIdx] = {
        ...sessions[existingIdx],
        ...sessionObj,
        updatedAt: Date.now(),
      };
    } else {
      sessions.push({ ...sessionObj, updatedAt: Date.now() });
    }
    // Sort by latest first
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    saveAiSessions(sessions);
    return true;
  });

  ipcMain.handle("appstore-delete-ai-session", (_, sessionId) => {
    const sessions = loadAiSessions();
    const newSessions = sessions.filter((s) => s.id !== sessionId);
    saveAiSessions(newSessions);
    return true;
  });

  // Install built-in apps on first run
  installBuiltInApps();
}

module.exports = {
  getAppStoreWindow,
  showAppStore,
  closeAppStore,
  isAppStoreVisible,
  setupAppStoreIpc,
};
