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
const AdmZip = require("adm-zip");

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
    title: "Select Web App or Backup",
    filters: [{ name: "Web Apps & Backups", extensions: ["html", "zip", "MicApps"] }],
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
    const iconsDir = path.join(__dirname, "../../assets/icons");
    let svgStr = "";
    if (fs.existsSync(iconsDir)) {
      const files = fs.readdirSync(iconsDir).filter(f => /\.(webp|png|jpe?g)$/i.test(f));
      if (files.length > 0) {
        const randomFile = files[Math.floor(Math.random() * files.length)];
        try {
          const filePath = path.join(iconsDir, randomFile);
          const ext = path.extname(randomFile).toLowerCase().substring(1);
          const mimeType = ext === "jpg" ? "jpeg" : ext;
          const base64 = fs.readFileSync(filePath).toString("base64");
          const dataUri = `data:image/${mimeType};base64,${base64}`;
          const svgId = Math.random().toString(36).substr(2, 9);
          const squirclePath = "M100,68.7182051 C100,69.9139093 100,71.1074395 99.9913043,72.3009696 C99.9847826,73.3075351 99.973913,74.3141006 99.9478261,75.3184921 C99.920129,77.5191265 99.7268293,79.7145543 99.3695652,81.886169 C98.9978261,84.0601765 98.3043478,86.1646159 97.3108696,88.1320927 C95.2972476,92.0852921 92.0834623,95.2992171 88.1304348,97.3129266 C86.1638623,98.305079 84.0602691,98.9982471 81.8891304,99.3695378 C79.7152174,99.7282491 77.5195652,99.9217357 75.3195652,99.9478238 C74.3139596,99.9737988 73.308105,99.9890177 72.3021739,99.993478 C71.1065217,100 69.9130435,100 68.7195652,100 L31.2804348,100 C30.0869565,100 28.8934783,100 27.6978261,99.993478 C26.6919027,99.9897456 25.6860481,99.9752514 24.6804348,99.9499978 C22.4791037,99.9219121 20.2830235,99.7278754 18.1108696,99.3695378 C15.9391304,98.9999565 13.8347826,98.3042741 11.8695652,97.3129266 C7.91695765,95.2996615 4.70324405,92.0865692 2.68913043,88.1342667 C1.69595654,86.1655631 1.00208487,84.0596773 0.630434783,81.886169 C0.273173217,79.7152845 0.079873167,77.5205795 0.052173913,75.3206661 C0.0260869565,74.3141006 0.0130434783,73.3075351 0.00869565217,72.3009696 C0,71.1052654 0,69.9139093 0,68.7182051 L0,31.2817949 C0,30.0860907 0,28.8903865 0.00869565217,27.6946824 C0.0130434783,26.6902909 0.0260869565,25.6837254 0.052173913,24.6793339 C0.0799060567,22.4794222 0.273205889,20.2847196 0.630434783,18.113831 C1.00217391,15.9398235 1.69565217,13.8353841 2.68913043,11.8657333 C4.7027524,7.91253387 7.91653768,4.69860886 11.8695652,2.68489934 C13.8355813,1.69325138 15.9383812,1.00010324 18.1086957,0.628288186 C20.2826087,0.271750946 22.4782609,0.0782642724 24.6782609,0.050002174 C25.6847826,0.0239140832 26.6913043,0.0108700378 27.6956522,0.0065220227 C28.8913043,0 30.0869565,0 31.2782609,0 L68.7173913,0 C69.9130435,0 71.1086957,0 72.3021739,0.0065220227 C73.3080973,0.0102577353 74.3139519,0.0247519479 75.3195652,0.050002174 C77.5195652,0.0782642724 79.7152174,0.271750946 81.8869565,0.628288186 C84.0608696,1.00004348 86.1630435,1.69355189 88.1304348,2.68489934 C92.0844481,4.69799461 95.2990996,7.91202483 97.3130435,11.8657333 C98.305381,13.8338276 98.9985196,15.9389795 99.3695652,18.111657 C99.7268538,20.2832686 99.9201536,22.4786983 99.9478261,24.6793339 C99.973913,25.6858994 99.9869565,26.6924649 99.9913043,27.6968564 C100,28.8925605 100,30.0860907 100,31.2796209 L100,68.7182051 Z";
          svgStr = `<svg width="100%" height="100%" viewBox="0 0 100 100" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
      <path d="${squirclePath}" id="path-${svgId}"></path>
      <clipPath id="clip-${svgId}">
          <use xlink:href="#path-${svgId}"></use>
      </clipPath>
      <mask id="mask-${svgId}" fill="white">
          <use xlink:href="#path-${svgId}"></use>
      </mask>
  </defs>
  <image href="${dataUri}" width="100" height="100" clip-path="url(#clip-${svgId})" preserveAspectRatio="xMidYMid slice" />
  <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
      <path d="${squirclePath}" stroke-opacity="0.25" stroke="#000000" stroke-width="2" mask="url(#mask-${svgId})" stroke-linejoin="round" stroke-miterlimit="1.41" vector-effect="non-scaling-stroke"></path>
  </g>
</svg>`;
        } catch (e) {
          console.error("Failed to load random icon:", e);
        }
      }
    }
    
    if (!svgStr) {
      svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#E3F2FD"/><g transform="translate(16,16) scale(1.333)" fill="none" stroke="#2196F3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></g></svg>`;
    }
    
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
    const iconsDir = path.join(__dirname, "../../assets/icons");
    const result = [];
    
    if (fs.existsSync(iconsDir)) {
      const files = fs.readdirSync(iconsDir);
      
      const squirclePath = "M100,68.7182051 C100,69.9139093 100,71.1074395 99.9913043,72.3009696 C99.9847826,73.3075351 99.973913,74.3141006 99.9478261,75.3184921 C99.920129,77.5191265 99.7268293,79.7145543 99.3695652,81.886169 C98.9978261,84.0601765 98.3043478,86.1646159 97.3108696,88.1320927 C95.2972476,92.0852921 92.0834623,95.2992171 88.1304348,97.3129266 C86.1638623,98.305079 84.0602691,98.9982471 81.8891304,99.3695378 C79.7152174,99.7282491 77.5195652,99.9217357 75.3195652,99.9478238 C74.3139596,99.9737988 73.308105,99.9890177 72.3021739,99.993478 C71.1065217,100 69.9130435,100 68.7195652,100 L31.2804348,100 C30.0869565,100 28.8934783,100 27.6978261,99.993478 C26.6919027,99.9897456 25.6860481,99.9752514 24.6804348,99.9499978 C22.4791037,99.9219121 20.2830235,99.7278754 18.1108696,99.3695378 C15.9391304,98.9999565 13.8347826,98.3042741 11.8695652,97.3129266 C7.91695765,95.2996615 4.70324405,92.0865692 2.68913043,88.1342667 C1.69595654,86.1655631 1.00208487,84.0596773 0.630434783,81.886169 C0.273173217,79.7152845 0.079873167,77.5205795 0.052173913,75.3206661 C0.0260869565,74.3141006 0.0130434783,73.3075351 0.00869565217,72.3009696 C0,71.1052654 0,69.9139093 0,68.7182051 L0,31.2817949 C0,30.0860907 0,28.8903865 0.00869565217,27.6946824 C0.0130434783,26.6902909 0.0260869565,25.6837254 0.052173913,24.6793339 C0.0799060567,22.4794222 0.273205889,20.2847196 0.630434783,18.113831 C1.00217391,15.9398235 1.69565217,13.8353841 2.68913043,11.8657333 C4.7027524,7.91253387 7.91653768,4.69860886 11.8695652,2.68489934 C13.8355813,1.69325138 15.9383812,1.00010324 18.1086957,0.628288186 C20.2826087,0.271750946 22.4782609,0.0782642724 24.6782609,0.050002174 C25.6847826,0.0239140832 26.6913043,0.0108700378 27.6956522,0.0065220227 C28.8913043,0 30.0869565,0 31.2782609,0 L68.7173913,0 C69.9130435,0 71.1086957,0 72.3021739,0.0065220227 C73.3080973,0.0102577353 74.3139519,0.0247519479 75.3195652,0.050002174 C77.5195652,0.0782642724 79.7152174,0.271750946 81.8869565,0.628288186 C84.0608696,1.00004348 86.1630435,1.69355189 88.1304348,2.68489934 C92.0844481,4.69799461 95.2990996,7.91202483 97.3130435,11.8657333 C98.305381,13.8338276 98.9985196,15.9389795 99.3695652,18.111657 C99.7268538,20.2832686 99.9201536,22.4786983 99.9478261,24.6793339 C99.973913,25.6858994 99.9869565,26.6924649 99.9913043,27.6968564 C100,28.8925605 100,30.0860907 100,31.2796209 L100,68.7182051 Z";
      
      for (const file of files) {
        if (!file.match(/\.(webp|png|jpe?g)$/i)) continue;
        
        try {
          const filePath = path.join(iconsDir, file);
          const ext = path.extname(file).toLowerCase().substring(1);
          const mimeType = ext === "jpg" ? "jpeg" : ext;
          const base64 = fs.readFileSync(filePath).toString("base64");
          const dataUri = `data:image/${mimeType};base64,${base64}`;
          
          const svgId = Math.random().toString(36).substr(2, 9);
          
          const svgStr = `<svg width="100%" height="100%" viewBox="0 0 100 100" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
      <path d="${squirclePath}" id="path-${svgId}"></path>
      <clipPath id="clip-${svgId}">
          <use xlink:href="#path-${svgId}"></use>
      </clipPath>
      <mask id="mask-${svgId}" fill="white">
          <use xlink:href="#path-${svgId}"></use>
      </mask>
  </defs>
  <image href="${dataUri}" width="100" height="100" clip-path="url(#clip-${svgId})" preserveAspectRatio="xMidYMid slice" />
  <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
      <path d="${squirclePath}" stroke-opacity="0.25" stroke="#000000" stroke-width="2" mask="url(#mask-${svgId})" stroke-linejoin="round" stroke-miterlimit="1.41" vector-effect="non-scaling-stroke"></path>
  </g>
</svg>`;
          result.push(svgStr);
        } catch (e) {
          console.error("Failed to load icon:", file, e);
        }
      }
    }
    
    // Sort randomly to mix them up
    result.sort(() => Math.random() - 0.5);
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

  // ── Backup & Restore ───────────────────────────────────────
  ipcMain.handle("appstore-export-all", async () => {
    const { filePath } = await dialog.showSaveDialog(
      appStoreWindow || BrowserWindow.getFocusedWindow(),
      {
        title: "Backup App Store",
        defaultPath: path.join(app.getPath("desktop"), "MicTab_Apps_Backup.MicApps"),
        filters: [{ name: "MicTab Apps Backup", extensions: ["MicApps"] }],
      }
    );

    if (!filePath) return { canceled: true };

    try {
      const zip = new AdmZip();
      const dir = getAppsDir();
      
      if (fs.existsSync(dir)) {
        zip.addLocalFolder(dir);
      }

      zip.writeZip(filePath);
      return { success: true, filePath };
    } catch (err) {
      console.error("Backup failed:", err);
      return { error: err.message };
    }
  });

  ipcMain.handle("appstore-import-all", async (_, mode, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { error: "Backup file not found." };
      }

      const zip = new AdmZip(filePath);
      const targetDir = getAppsDir();
      
      ensureAppsDir();

      if (mode === "replace") {
        // Clear existing files except built-ins? Wait, built-ins are managed dynamically.
        // Let's just wipe targetDir and recreate it.
        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.mkdirSync(targetDir, { recursive: true });
        zip.extractAllTo(targetDir, true);
      } else if (mode === "merge") {
        // We need to merge registries and ai sessions, and extract files without overwriting existing?
        // Wait, "marge will marge with existing".
        // Let's extract to a temp folder, read its registry, then copy things over.
        const tempDir = path.join(app.getPath("temp"), "mictab_apps_restore_" + Date.now());
        zip.extractAllTo(tempDir, true);

        // Merge registry
        const currentRegistry = loadRegistry();
        let backupRegistry = [];
        try {
          backupRegistry = JSON.parse(fs.readFileSync(path.join(tempDir, "registry.json"), "utf-8"));
        } catch (e) {}

        const currentIds = new Set(currentRegistry.map(a => a.id));
        for (const appItem of backupRegistry) {
          if (!currentIds.has(appItem.id)) {
            currentRegistry.push(appItem);
            currentIds.add(appItem.id);
            // Copy folder if exists
            const appFolderPath = path.join(tempDir, appItem.id);
            if (fs.existsSync(appFolderPath)) {
              fs.cpSync(appFolderPath, path.join(targetDir, appItem.id), { recursive: true });
            }
          }
        }
        saveRegistry(currentRegistry);

        // Merge AI Sessions
        const currentSessions = loadAiSessions();
        let backupSessions = [];
        try {
          backupSessions = JSON.parse(fs.readFileSync(path.join(tempDir, "ai_sessions.json"), "utf-8"));
        } catch (e) {}

        const currentSessionIds = new Set(currentSessions.map(s => s.id));
        for (const sess of backupSessions) {
          if (!currentSessionIds.has(sess.id)) {
            currentSessions.push(sess);
            currentSessionIds.add(sess.id);
          }
        }
        // Re-sort
        currentSessions.sort((a, b) => b.updatedAt - a.updatedAt);
        saveAiSessions(currentSessions);

        // Clean up temp
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}
      }

      return { success: true };
    } catch (err) {
      console.error("Restore failed:", err);
      return { error: err.message };
    }
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
