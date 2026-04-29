"use strict";

// ── Category → icon mapping ───────────────────────────────
const CATEGORY_ICONS = {
  tools: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  games: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`,
  imported: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  "ai-built": `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.04Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.04Z"/></svg>`,
};

const ICON_CLASSES = {
  tools: "icon-tools",
  games: "icon-games",
  imported: "icon-imported",
  "ai-built": "icon-ai",
};
const BADGE_CLASSES = {
  tools: "built-in",
  games: "built-in",
  imported: "imported",
  "ai-built": "ai",
};
const BADGE_LABELS = {
  tools: "Built-in",
  games: "Built-in",
  imported: "Imported",
  "ai-built": "AI",
};

const isWin = navigator.userAgent.includes("Windows");
let currentTab = "all";
let apps = [];
let isEditMode = false;

// ── Global Edit Mode Exit ────────────────────────────────
document.addEventListener("click", (e) => {
  if (isEditMode && !e.target.closest(".app-card")) {
    isEditMode = false;
    document.querySelectorAll(".app-card").forEach((card) => {
      card.classList.remove("jiggle");
      card.draggable = false;
    });
  }
});

// ── Theme ──────────────────────────────────────────────────
function applyTheme(themeVal) {
  let t = themeVal || "system";
  if (t === "system")
    t = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  document.documentElement.setAttribute("data-theme", t);
}
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    window.appStoreAPI.getConfig().then((cfg) => {
      if ((cfg.theme || "system") === "system") applyTheme("system");
    });
  });
window.appStoreAPI.getConfig().then((cfg) => applyTheme(cfg.theme));
window.appStoreAPI.onConfigUpdate((cfg) => {
  if (cfg.theme) applyTheme(cfg.theme);
});

// ── Titlebar ───────────────────────────────────────────────
document
  .getElementById("dot-close")
  .addEventListener("click", () => window.appStoreAPI.close());
document
  .getElementById("dot-min")
  .addEventListener("click", () => window.appStoreAPI.minimize());
document
  .getElementById("dot-max")
  .addEventListener("click", () => window.appStoreAPI.maximize());

if (isWin) {
  const drag = document.getElementById("tb-drag");
  drag.addEventListener("mousedown", (e) => {
    if (e.target.closest(".dot")) return;
    window.appStoreAPI.drag();
  });
  drag.addEventListener("mouseup", () => window.appStoreAPI.stopDrag());
}

// ── Tab Switching ──────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    renderApps();

    if (currentTab === "games") {
      const origHtml = btn.innerHTML;
      btn.innerHTML = `<span class="spinner" style="width:12px; height:12px; border-width:2px; display:inline-block; margin-right:6px;"></span> Syncing...`;
      isSyncingGames = true;
      renderApps(); // Update UI to show loading if no games are loaded yet
      
      try {
        const result = await window.appStoreAPI.syncGames();
        if (result && result.updated) {
          await loadApps();
        }
      } catch (err) {
        console.error("Failed to sync games", err);
      } finally {
        isSyncingGames = false;
        renderApps(); // Re-render to clear loading state if it was shown
        btn.innerHTML = origHtml;
      }
    }
  });
});

let isSyncingGames = false;

// ── Render Apps ────────────────────────────────────────────
function renderApps() {
  const grid = document.getElementById("app-grid");
  const empty = document.getElementById("empty-state");
  grid.innerHTML = "";

  let filtered = apps;
  if (currentTab !== "all") {
    filtered = apps.filter((a) => a.category === currentTab);
  } else {
    // Hide imported games from "All Apps"
    filtered = apps.filter((a) => a.category !== "games");
  }

  // Only show top level items in main grid
  const topLevelItems = filtered.filter((a) => !a.folderId);

  if (topLevelItems.length === 0) {
    if (currentTab === "games" && isSyncingGames) {
      empty.style.display = "none";
      grid.innerHTML = `
        <div style="grid-column: 1/-1; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height: 300px; color: var(--text);">
          <span class="spinner" style="width: 32px; height: 32px; border-width: 3px; margin-bottom: 16px;"></span>
          <h3 style="margin:0; font-size:16px; font-weight:500;">Downloading Games...</h3>
          <p style="margin-top:8px; font-size:13px; max-width:300px; text-align:center; color:var(--muted);">Checking for new games and downloading from the repository. This may take a moment depending on your connection.</p>
        </div>
      `;
      return;
    }
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";

  topLevelItems.forEach((app) => {
    const card = document.createElement("div");
    card.className = "app-card";
    card.title = `Open ${app.name}`;
    if (app.isFolder) card.classList.add("is-folder");

    let iconHtml = "";

    if (app.isFolder) {
      const children = apps.filter((a) => a.folderId === app.id).slice(0, 9);
      let gridHtml = "";
      for (let child of children) {
        if (child.iconBase64) {
          gridHtml += `<img src="${child.iconBase64}" class="folder-mini-icon">`;
        } else {
          const cSvg = CATEGORY_ICONS[child.category] || CATEGORY_ICONS.tools;
          gridHtml += `<div class="folder-mini-icon">${cSvg}</div>`;
        }
      }
      iconHtml = `<div class="folder-grid">${gridHtml}</div>`;
    } else {
      const iconClass = ICON_CLASSES[app.category] || "icon-tools";
      const iconSvg = CATEGORY_ICONS[app.category] || CATEGORY_ICONS.tools;

      iconHtml = `<div class="app-icon ${iconClass}">${iconSvg}</div>`;
      if (app.iconBase64) {
        iconHtml = `<div class="app-icon" style="background:transparent; padding:0; overflow:hidden;"><img src="${app.iconBase64}" style="width:100%; height:100%; object-fit:cover;" alt="icon"></div>`;
      }
    }

    card.dataset.id = app.id;
    card.innerHTML = `
      ${iconHtml}
      <div class="app-name">${escHtml(app.name)}</div>
    `;

    // Launch on click
    card.addEventListener("click", (e) => {
      if (isEditMode) {
        e.preventDefault();
        return;
      }
      if (app.isFolder) {
        openFolderModal(app);
      } else {
        window.appStoreAPI.launch(app.id);
      }
    });

    // Context menu
    card.addEventListener("contextmenu", (e) => {
      if (isEditMode) return;
      e.preventDefault();
      window.appStoreAPI.showContextMenu(app.id);
    });

    // Long press to enter edit mode
    let pressTimer;
    let isDragging = false;

    card.addEventListener("mousedown", (e) => {
      if (isEditMode || e.button !== 0) return; // Only left click
      isDragging = false;
      pressTimer = setTimeout(() => {
        isEditMode = true;
        document.querySelectorAll(".app-card").forEach((c) => {
          c.classList.add("jiggle");
          c.style.animationDelay = `-${Math.random() * 0.3}s`;
          c.draggable = true;
        });
      }, 1000);
    });

    card.addEventListener("mousemove", () => {
      isDragging = true;
    });

    card.addEventListener("mouseup", () => {
      clearTimeout(pressTimer);
    });

    card.addEventListener("mouseleave", () => {
      clearTimeout(pressTimer);
    });

    // Drag and Drop
    card.draggable = isEditMode;
    if (isEditMode) {
      card.classList.add("jiggle");
    }

    card.addEventListener("dragstart", (e) => {
      if (!isEditMode) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", app.id);
      card.classList.add("dragging");
      window._currentDropIsCenter = false;
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      document
        .querySelectorAll(".app-card")
        .forEach((c) => c.classList.remove("drag-over"));
      window._currentDropIsCenter = false;
    });

    card.addEventListener("dragover", (e) => {
      if (!isEditMode) return;
      e.preventDefault();

      const draggedCard = document.querySelector(".app-card.dragging");
      if (!draggedCard || draggedCard === card) return;

      const rect = card.getBoundingClientRect();
      const relX = e.clientX - rect.left;

      // Determine if we are hovering exactly in the middle 40% (for folder creation)
      const isCenter = relX > rect.width * 0.3 && relX < rect.width * 0.7;
      window._currentDropIsCenter = isCenter;

      if (isCenter) {
        card.classList.add("drag-over");
      } else {
        card.classList.remove("drag-over");
        const isLeft = relX < rect.width / 2;
        if (isLeft) {
          grid.insertBefore(draggedCard, card);
        } else {
          grid.insertBefore(draggedCard, card.nextSibling);
        }
      }
    });

    card.addEventListener("dragleave", () => {
      if (!isEditMode) return;
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", async (e) => {
      if (!isEditMode) return;
      e.preventDefault();

      const wasCenter = window._currentDropIsCenter;
      window._currentDropIsCenter = false;
      card.classList.remove("drag-over");

      const draggedId = e.dataTransfer.getData("text/plain");
      if (draggedId === app.id) return;

      if (wasCenter) {
        if (app.isFolder) {
          // move into folder
          await window.appStoreAPI.moveToFolder(draggedId, app.id);
          await loadApps();
          return;
        } else {
          // create new folder
          const draggedApp = apps.find((a) => a.id === draggedId);
          if (draggedApp && draggedApp.isFolder) {
            // Cannot drop folder into app
            // We use a simple custom prompt as an alert too
            await showPrompt(
              "Cannot drop a folder into an app. Press OK to dismiss.",
              "",
            );
            return;
          }
          const folderName = await showPrompt(
            "Enter folder name:",
            "New Folder",
          );
          if (folderName && folderName.trim()) {
            await window.appStoreAPI.createFolder(
              folderName.trim(),
              draggedId,
              app.id,
            );
            await loadApps();
          }
          return;
        }
      }

      // We will read the DOM to update the array order because the DOM was moved during dragover
      const newOrder = Array.from(grid.querySelectorAll(".app-card")).map(
        (c) => c.dataset.id,
      );

      // Update apps array locally to match new DOM order
      apps.sort((a, b) => {
        let ia = newOrder.indexOf(a.id);
        let ib = newOrder.indexOf(b.id);
        if (ia === -1) ia = 999999;
        if (ib === -1) ib = 999999;
        return ia - ib;
      });

      await window.appStoreAPI.reorderApps(newOrder);
    });

    grid.appendChild(card);
  });
}

// ── Context Menu Callbacks ─────────────────────────────────
window.appStoreAPI.onRename(async (appId) => {
  const newName = await showPrompt("Enter new name for the app/folder:", "");
  if (newName && newName.trim()) {
    await window.appStoreAPI.doRename(appId, newName.trim());
    await loadApps();
  }
});

window.appStoreAPI.onChangeIcon((appId) => {
  openIconModal(async (base64) => {
    if (base64) {
      const success = await window.appStoreAPI.saveIconBase64(appId, base64);
      if (success) await loadApps();
    }
  });
});

window.appStoreAPI.onConfirmDelete(async (appId) => {
  const app = apps.find((a) => a.id === appId);
  if (!app) return;
  const okName = await showPrompt(`Type "yes" to uninstall "${app.name}".`, "");
  if (okName !== "yes") return;
  await window.appStoreAPI.uninstall(appId);
  await loadApps();
});

window.appStoreAPI.onConfirmDeleteFolder(async (appId) => {
  const folder = apps.find((a) => a.id === appId);
  if (!folder) return;

  const choice = await showDeleteFolderPrompt(`Delete "${folder.name}"?`);
  if (choice === "keep") {
    await window.appStoreAPI.deleteFolder(folder.id, false);
    await loadApps();
  } else if (choice === "delete") {
    await window.appStoreAPI.deleteFolder(folder.id, true);
    await loadApps();
  }
});

window.appStoreAPI.onRemoveFromFolder(async (appId) => {
  await window.appStoreAPI.removeFromFolder(appId);
  await loadApps();

  // If folder modal is open, we should re-render it or close it if empty
  if (currentFolderId) {
    const fApp = apps.find((a) => a.id === currentFolderId);
    if (fApp) {
      renderFolderApps(fApp);
    }
  }
});

let currentFolderId = null;

function openFolderModal(folderApp) {
  currentFolderId = folderApp.id;
  const modal = document.getElementById("folder-modal");
  document.getElementById("folder-modal-title").textContent = folderApp.name;
  renderFolderApps(folderApp);
  modal.style.display = "flex";
}

document.getElementById("folder-modal-close").addEventListener("click", () => {
  document.getElementById("folder-modal").style.display = "none";
  currentFolderId = null;
});

document.getElementById("folder-modal").addEventListener("click", (e) => {
  if (e.target.id === "folder-modal") {
    document.getElementById("folder-modal").style.display = "none";
    currentFolderId = null;
  }
});

function renderFolderApps(folderApp) {
  const fGrid = document.getElementById("folder-grid");
  fGrid.innerHTML = "";

  const children = apps.filter((a) => a.folderId === folderApp.id);

  if (children.length === 0) {
    fGrid.innerHTML =
      '<div style="grid-column: 1/-1; text-align:center; opacity:0.5; padding: 20px;">Folder is empty</div>';
    return;
  }

  children.forEach((app) => {
    const card = document.createElement("div");
    card.className = "app-card";
    card.title = `Open ${app.name}`;
    if (isEditMode) card.classList.add("jiggle");

    const iconClass = ICON_CLASSES[app.category] || "icon-tools";
    const iconSvg = CATEGORY_ICONS[app.category] || CATEGORY_ICONS.tools;

    let iconHtml = `<div class="app-icon ${iconClass}">${iconSvg}</div>`;
    if (app.iconBase64) {
      iconHtml = `<div class="app-icon" style="background:transparent; padding:0; overflow:hidden;"><img src="${app.iconBase64}" style="width:100%; height:100%; object-fit:cover;" alt="icon"></div>`;
    }

    card.dataset.id = app.id;
    card.innerHTML = `
      ${iconHtml}
      <div class="app-name">${escHtml(app.name)}</div>
    `;

    card.addEventListener("click", (e) => {
      if (isEditMode) {
        e.preventDefault();
        return;
      }
      window.appStoreAPI.launch(app.id);
    });

    card.addEventListener("contextmenu", (e) => {
      if (isEditMode) return;
      e.preventDefault();
      window.appStoreAPI.showContextMenu(app.id);
    });

    // Implement drag drop out of folder
    card.draggable = isEditMode;
    card.addEventListener("dragstart", (e) => {
      if (!isEditMode) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", app.id);
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });

    fGrid.appendChild(card);
  });
}

// Drag out of folder to all apps
document
  .getElementById("app-grid-container")
  .addEventListener("dragover", (e) => {
    if (!isEditMode || !currentFolderId) return;
    e.preventDefault();
  });

document
  .getElementById("app-grid-container")
  .addEventListener("drop", async (e) => {
    if (!isEditMode || !currentFolderId) return;

    // if drop target is NOT inside the folder modal, then move it out of the folder
    if (!e.target.closest("#folder-modal")) {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      if (draggedId) {
        const draggedApp = apps.find((a) => a.id === draggedId);
        if (draggedApp && draggedApp.folderId === currentFolderId) {
          await window.appStoreAPI.removeFromFolder(draggedId);
          await loadApps();
          // keep folder modal open and re-render
          const fApp = apps.find((a) => a.id === currentFolderId);
          if (fApp) renderFolderApps(fApp);
        }
      }
    }
  });

if (window.appStoreAPI.onChangeCategory) {
  window.appStoreAPI.onChangeCategory(async ({ appId, category }) => {
    await window.appStoreAPI.changeCategory(appId, category);
    await loadApps();
  });
}

// ── Load Apps ──────────────────────────────────────────────
async function loadApps() {
  apps = await window.appStoreAPI.getApps();
  renderApps();
}

// ── Import Dropdown ────────────────────────────────────────
const importWrap = document.getElementById("import-dropdown-wrap");
const importBtn = document.getElementById("btn-import");
const backupWrap = document.getElementById("backup-dropdown-wrap");
const backupBtn = document.getElementById("btn-backup-restore");

importBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  importWrap.classList.toggle("open");
  if (backupWrap) backupWrap.classList.remove("open");
});

if (backupBtn && backupWrap) {
  backupBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    backupWrap.classList.toggle("open");
    importWrap.classList.remove("open");
  });
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!importWrap.contains(e.target)) importWrap.classList.remove("open");
  if (backupWrap && !backupWrap.contains(e.target)) backupWrap.classList.remove("open");
  if (devModeWrap && !devModeWrap.contains(e.target))
    devModeWrap.classList.remove("open");
});

// ── Backup & Restore Actions ───────────────────────────────
document.getElementById("opt-backup").addEventListener("click", async () => {
  if (backupWrap) backupWrap.classList.remove("open");
  await window.appStoreAPI.exportAllApps();
});

let pendingRestoreFile = null;
const restoreModeModal = document.getElementById("restore-mode-modal");

document.getElementById("opt-restore").addEventListener("click", async () => {
  if (backupWrap) backupWrap.classList.remove("open");
  // First, pick the .MicApps file
  const filePath = await window.appStoreAPI.pickFile();
  if (filePath && filePath.endsWith(".MicApps")) {
    pendingRestoreFile = filePath;
    restoreModeModal.style.display = "flex";
  } else if (filePath) {
    alert("Please select a valid .MicApps file.");
  }
});

document.getElementById("restore-mode-merge").addEventListener("click", async () => {
  if (!pendingRestoreFile) return;
  restoreModeModal.style.display = "none";
  const result = await window.appStoreAPI.importAllApps("merge", pendingRestoreFile);
  if (result && result.error) {
    alert("Restore failed: " + result.error);
  } else {
    await loadApps();
  }
  pendingRestoreFile = null;
});

document.getElementById("restore-mode-replace").addEventListener("click", async () => {
  if (!pendingRestoreFile) return;
  restoreModeModal.style.display = "none";
  const ok = confirm("Are you sure you want to completely wipe all current apps and replace them with the backup?");
  if (ok) {
    const result = await window.appStoreAPI.importAllApps("replace", pendingRestoreFile);
    if (result && result.error) {
      alert("Restore failed: " + result.error);
    } else {
      await loadApps();
    }
  }
  pendingRestoreFile = null;
});

document.getElementById("restore-mode-cancel").addEventListener("click", () => {
  restoreModeModal.style.display = "none";
  pendingRestoreFile = null;
});

// ── Developer Mode / Web Security ──────────────────────────
const devModeWrap = document.getElementById("dev-mode-wrap");
const btnDevMode = document.getElementById("btn-dev-mode");
const devModeText = document.getElementById("dev-mode-text");
const btnApplyDevMode = document.getElementById("btn-apply-dev-mode");
const devModeDuration = document.getElementById("dev-mode-duration");

if (btnDevMode) {
  btnDevMode.addEventListener("click", (e) => {
    e.stopPropagation();
    devModeWrap.classList.toggle("open");
  });

  btnApplyDevMode.addEventListener("click", async () => {
    const val = devModeDuration.value;
    const ms = val === "Infinity" ? Infinity : parseInt(val, 10);

    if (ms > 0) {
      const ok = confirm(
        "WARNING: Disabling web security exposes Mini Apps to external networks without browser protection. Only enable this if you trust the apps you are running. Continue?",
      );
      if (!ok) return;
    }

    await window.appStoreAPI.setWebSecurity(ms);
    devModeWrap.classList.remove("open");
    updateDevModeUI();
  });
}

let devModeInterval = null;

async function updateDevModeUI() {
  const remaining = await window.appStoreAPI.getWebSecurity();
  if (remaining > 0) {
    if (remaining === Infinity) {
      devModeText.textContent = "Security: OFF";
      btnDevMode.style.color = "var(--danger, #ff4d4f)";
    } else {
      const mins = Math.ceil(remaining / 60000);
      devModeText.textContent = `Security: OFF (${mins}m)`;
      btnDevMode.style.color = "var(--danger, #ff4d4f)";

      if (!devModeInterval) {
        devModeInterval = setInterval(updateDevModeUI, 60000);
      }
    }
  } else {
    devModeText.textContent = "Security: ON";
    btnDevMode.style.color = "";
    if (devModeInterval) {
      clearInterval(devModeInterval);
      devModeInterval = null;
    }
  }
}

// Initial check and event listener for expiration
if (window.appStoreAPI.onWebSecurityExpired) {
  window.appStoreAPI.onWebSecurityExpired(() => {
    updateDevModeUI();
  });
}
updateDevModeUI();

// ── Import Details Modal ───────────────────────────────────
const importModal = document.getElementById("import-modal");
const importName = document.getElementById("import-name");
const importIconBtn = document.getElementById("import-icon-btn");
const importStatus = document.getElementById("import-status");
const importSubmit = document.getElementById("import-submit");

let currentImportQueue = [];
let currentImportIcon = null;

function processImportQueue() {
  if (currentImportQueue.length === 0) {
    importModal.style.display = "none";
    return;
  }
  const file = currentImportQueue[0];
  importModal.style.display = "flex";
  importName.value = file.name ? file.name.replace(/\.[^/.]+$/, "") : "My App";
  currentImportIcon = null;
  importIconBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Select Custom Icon (Optional)`;
  importStatus.textContent = "";
  importStatus.className = "ai-status";
}

document.getElementById("import-modal-close").addEventListener("click", () => {
  currentImportQueue.shift(); // skip current
  processImportQueue();
});

let iconModalCallback = null;
const iconModal = document.getElementById("icon-modal");
const iconGrid = document.getElementById("icon-grid");
const iconUploadCustomBtn = document.getElementById("icon-upload-custom-btn");
const iconModalClose = document.getElementById("icon-modal-close");

async function openIconModal(callback) {
  iconModalCallback = callback;
  iconGrid.innerHTML =
    '<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 20px;">Generating icons...</div>';
  iconModal.style.display = "flex";

  const icons = await window.appStoreAPI.getIcons();
  iconGrid.innerHTML = "";

  icons.forEach((svgStr) => {
    const div = document.createElement("div");
    div.className = "icon-grid-item";
    div.innerHTML = svgStr;
    div.addEventListener("click", () => {
      const b64 =
        "data:image/svg+xml;base64," +
        btoa(unescape(encodeURIComponent(svgStr)));
      if (iconModalCallback) iconModalCallback(b64);
      iconModal.style.display = "none";
    });
    iconGrid.appendChild(div);
  });
}

iconModalClose.addEventListener(
  "click",
  () => (iconModal.style.display = "none"),
);
iconModal.addEventListener("click", (e) => {
  if (e.target === iconModal) iconModal.style.display = "none";
});

iconUploadCustomBtn.addEventListener("click", async () => {
  const iconPath = await window.appStoreAPI.pickIcon();
  if (iconPath) {
    const base64 = await window.appStoreAPI.readFileBase64(iconPath);
    if (base64) {
      openCropModal(base64, (croppedBase64) => {
        if (iconModalCallback) iconModalCallback(croppedBase64);
        iconModal.style.display = "none";
      });
    }
  }
});

importIconBtn.addEventListener("click", () => {
  openIconModal((base64) => {
    currentImportIcon = base64;
    importIconBtn.innerHTML = `✓ Icon Selected`;
  });
});

importSubmit.addEventListener("click", async () => {
  if (currentImportQueue.length === 0) return;
  const file = currentImportQueue[0];
  const name = importName.value.trim() || null;

  importSubmit.disabled = true;
  importStatus.className = "ai-status loading";
  importStatus.innerHTML = '<span class="spinner"></span> Installing…';

  try {
    const result = await window.appStoreAPI.installFromPath(
      file.path,
      name,
      currentImportIcon,
    );
    if (result && result.error) {
      importStatus.className = "ai-status error";
      importStatus.textContent = result.error;
      importSubmit.disabled = false;
      return;
    }
    await loadApps();
    importSubmit.disabled = false;
    currentImportQueue.shift();
    processImportQueue();
  } catch (e) {
    importStatus.className = "ai-status error";
    importStatus.textContent = e.message || "Install failed";
    importSubmit.disabled = false;
  }
});

// Browse file / folder
document.getElementById("opt-browse").addEventListener("click", async () => {
  importWrap.classList.remove("open");
  const path = await window.appStoreAPI.pickFile();
  if (path) {
    // extract filename from path for the default name
    const parts = path.split(/[/\\]/);
    const filename = parts[parts.length - 1];
    currentImportQueue.push({ path, name: filename });
    if (currentImportQueue.length === 1) processImportQueue();
  }
});

// Open paste modal
document.getElementById("opt-paste").addEventListener("click", () => {
  importWrap.classList.remove("open");
  openPasteModal();
});

// ── Paste HTML Modal ───────────────────────────────────────
const pasteModal = document.getElementById("paste-modal");
const pasteCode = document.getElementById("paste-code");
const pasteCodeHtml = document.getElementById("paste-code-html");
const pasteCodeCss = document.getElementById("paste-code-css");
const pasteCodeJs = document.getElementById("paste-code-js");
const pasteSingleMode = document.getElementById("paste-single-mode");
const pasteSeparateMode = document.getElementById("paste-separate-mode");
const pasteName = document.getElementById("paste-name");
const pasteStatus = document.getElementById("paste-status");
const pasteSubmit = document.getElementById("paste-submit");
const pasteIconBtn = document.getElementById("paste-icon-btn");

let currentPasteIcon = null;

function getPasteMode() {
  return document.querySelector('input[name="paste-mode"]:checked').value;
}

document.querySelectorAll('input[name="paste-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'single') {
      pasteSingleMode.style.display = 'block';
      pasteSeparateMode.style.display = 'none';
    } else {
      pasteSingleMode.style.display = 'none';
      pasteSeparateMode.style.display = 'flex';
    }
  });
});

function openPasteModal() {
  pasteModal.style.display = "flex";
  pasteCode.value = "";
  pasteCodeHtml.value = "";
  pasteCodeCss.value = "";
  pasteCodeJs.value = "";
  pasteName.value = "";
  pasteStatus.textContent = "";
  pasteStatus.className = "ai-status";
  currentPasteIcon = null;
  pasteIconBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Icon`;
  setTimeout(() => {
    if (getPasteMode() === 'single') {
      pasteCode.focus();
    } else {
      pasteCodeHtml.focus();
    }
  }, 100);
}

pasteIconBtn.addEventListener("click", () => {
  openIconModal((base64) => {
    currentPasteIcon = base64;
    pasteIconBtn.innerHTML = `✓ Icon Selected`;
  });
});

document.getElementById("paste-modal-close").addEventListener("click", () => {
  pasteModal.style.display = "none";
});
pasteModal.addEventListener("click", (e) => {
  if (e.target === pasteModal) pasteModal.style.display = "none";
});

// Allow tab key in the code editor
function allowTab(textarea) {
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value =
        textarea.value.substring(0, start) +
        "  " +
        textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    }
  });
}
allowTab(pasteCode);
allowTab(pasteCodeHtml);
allowTab(pasteCodeCss);
allowTab(pasteCodeJs);

pasteSubmit.addEventListener("click", async () => {
  const mode = getPasteMode();
  let code = "";
  let payload = null;

  if (mode === 'single') {
    code = pasteCode.value.trim();
    if (!code) {
      pasteCode.focus();
      return;
    }
    // Basic validation
    if (!code.includes("<") || !code.includes(">")) {
      pasteStatus.className = "ai-status error";
      pasteStatus.textContent = "This doesn't look like HTML. Paste a complete HTML file.";
      return;
    }
    payload = code;
  } else {
    const html = pasteCodeHtml.value.trim();
    const css = pasteCodeCss.value.trim();
    const js = pasteCodeJs.value.trim();
    
    if (!html && !css && !js) {
      pasteCodeHtml.focus();
      return;
    }
    // For separate mode, construct a full HTML if payload needs to be a string, or pass an object.
    // The current installFromHtml handles a string. Let's pass an object if we want it to save multiple files.
    // Wait, the user said they want it to save as separate files: index.html, style.css, script.js.
    // So we need to pass an object.
    payload = { html, css, js, type: "separate" };
  }

  pasteSubmit.disabled = true;
  pasteStatus.className = "ai-status loading";
  pasteStatus.innerHTML = '<span class="spinner"></span> Installing…';

  try {
    const isAiApp =
      (aiChatHistory && aiChatHistory.length > 0) || currentAiHtml;
    const category = isAiApp ? "ai-built" : "imported";
    const result = await window.appStoreAPI.installFromHtml(
      payload,
      pasteName.value.trim() || null,
      currentPasteIcon,
      category,
    );
    if (result && result.error) {
      pasteStatus.className = "ai-status error";
      pasteStatus.textContent = result.error;
      pasteSubmit.disabled = false;
      return;
    }

    if (aiChatHistory && aiChatHistory.length > 0) {
      editingAppId = result.id;
      saveCurrentAiSession();
      await window.appStoreAPI.saveAiChat(result.id, aiChatHistory);
      aiChatHistory = [];
    }

    pasteStatus.className = "ai-status success";
    pasteStatus.textContent = `✓ "${result.name}" installed!`;
    pasteSubmit.disabled = false;
    await loadApps();
    setTimeout(() => {
      pasteModal.style.display = "none";
    }, 1000);
  } catch (e) {
    pasteStatus.className = "ai-status error";
    pasteStatus.textContent = e.message || "Install failed";
    pasteSubmit.disabled = false;
  }
});

// ── AI Builder Modal ───────────────────────────────────────
const aiModal = document.getElementById("ai-modal");
const aiPrompt = document.getElementById("ai-prompt");
const aiStatus = document.getElementById("ai-status");
const aiSubmit = document.getElementById("ai-submit");
const aiTestBtn = document.getElementById("ai-test-btn");
const aiSaveBtn = document.getElementById("ai-save-btn");
const aiChatContainer = document.getElementById("ai-chat-container");

let currentAiHtml = null;
let isAiTesting = false;
let aiChatHistory = [];
let editingAppId = null;
let currentAiSessionId = null;

function generateId() {
  return "sess_" + Math.random().toString(36).substr(2, 9);
}

async function loadAiHistoryList() {
  const list = document.getElementById("ai-history-list");
  const sessions = await window.appStoreAPI.getAiSessions();
  list.innerHTML = "";

  if (sessions.length === 0) {
    list.innerHTML =
      '<div style="padding: 12px; font-size: 11px; color: var(--text-muted); text-align: center;">No history yet.</div>';
    return;
  }

  sessions.forEach((sess) => {
    const item = document.createElement("div");
    item.className =
      "ai-history-item" + (sess.id === currentAiSessionId ? " active" : "");

    let titleText =
      sess.name ||
      (sess.messages && sess.messages.length > 0
        ? sess.messages[0].content
        : "New App");

    const title = document.createElement("div");
    title.className = "ai-history-item-title";
    title.textContent = titleText;

    const date = document.createElement("div");
    date.className = "ai-history-item-date";
    date.textContent = new Date(sess.updatedAt).toLocaleString();

    const delBtn = document.createElement("button");
    delBtn.className = "ai-history-delete";
    delBtn.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      await window.appStoreAPI.deleteAiSession(sess.id);
      if (sess.id === currentAiSessionId) {
        resetAiBuilder();
      } else {
        loadAiHistoryList();
      }
    };

    item.onclick = () => loadAiSession(sess);
    item.appendChild(title);
    item.appendChild(date);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
}

function loadAiSession(sess) {
  currentAiSessionId = sess.id;
  editingAppId = sess.appId || null;
  aiChatHistory = sess.messages || [];
  currentAiHtml = sess.html || null;

  const headerTitle = document.getElementById("ai-current-title");
  if (headerTitle) {
    headerTitle.textContent =
      sess.name || (editingAppId ? "Modifying App" : "AI App Builder");
  }

  renderChat();
  loadAiHistoryList();

  aiStatus.textContent = "";
  aiStatus.className = "ai-status";
  aiPrompt.value = "";
  isAiTesting = false;

  if (currentAiHtml) {
    aiTestBtn.style.display = "block";
    aiSaveBtn.style.display = "block";
    aiSubmit.querySelector("span").textContent = "Modify App";
  } else {
    aiTestBtn.style.display = "none";
    aiSaveBtn.style.display = "none";
    aiSubmit.querySelector("span").textContent = "Generate";
  }
}

async function saveCurrentAiSession() {
  if (!currentAiSessionId) {
    currentAiSessionId = generateId();
  }

  const title = editingAppId
    ? "Modifying App"
    : aiChatHistory.length > 0
      ? aiChatHistory[0].content
      : "New App";

  await window.appStoreAPI.saveAiSession({
    id: currentAiSessionId,
    appId: editingAppId,
    name: title,
    messages: aiChatHistory,
    html: currentAiHtml,
  });
  loadAiHistoryList();
}

function renderChat() {
  aiChatContainer.innerHTML = "";
  aiChatHistory.forEach((msg, index) => {
    if (msg.role === "system") return;
    const div = document.createElement("div");
    div.className = `ai-msg ai-msg-${msg.role}`;
    div.textContent =
      msg.role === "assistant"
        ? "✓ " +
          (msg.content.includes("<<<<")
            ? "Modifications applied."
            : "App generated.")
        : msg.content;

    if (msg.role === "assistant") {
      const restoreBtn = document.createElement("div");
      restoreBtn.className = "ai-msg-restore";
      restoreBtn.title = "Restore to this state";
      restoreBtn.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
      restoreBtn.onclick = async () => {
        aiChatHistory = aiChatHistory.slice(0, index + 1);
        currentAiHtml = msg.html;
        renderChat();
        saveCurrentAiSession();
        aiStatus.className = "ai-status success";
        aiStatus.textContent = "Restored to previous state.";
        if (isAiTesting) {
          await window.appStoreAPI.testAiApp(currentAiHtml);
        }
      };
      div.appendChild(restoreBtn);
    }
    aiChatContainer.appendChild(div);
  });
  aiChatContainer.scrollTop = aiChatContainer.scrollHeight;
}

window.appStoreAPI.onChatAI(async (appId) => {
  aiModal.style.display = "flex";

  // Populate profiles
  const profilesSelect = document.getElementById("ai-builder-profile");
  if (profilesSelect) {
    const profiles = await window.appStoreAPI.getLlmProfiles();
    profilesSelect.innerHTML = '<option value="default">Default AI Profile</option>';
    if (profiles) {
      profiles.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name + " (" + p.provider + ")";
        profilesSelect.appendChild(opt);
      });
    }
  }

  const sessions = await window.appStoreAPI.getAiSessions();
  const appSessions = sessions.filter((s) => s.appId === appId);
  const currentHtml = await window.appStoreAPI.readAppHtml(appId);

  let targetSession = null;
  if (appSessions.length > 0) {
    targetSession = appSessions[0];
    targetSession.html = currentHtml; // Update to reflect any non-AI manual edits
  } else {
    // Try legacy history or new
    let legacyHistory = await window.appStoreAPI.loadAiChat(appId);
    if (!legacyHistory || legacyHistory.length === 0) {
      legacyHistory = [];
    }

    targetSession = {
      id: generateId(),
      appId: appId,
      name: `Editing ${appId.replace("builtin_", "")}`,
      messages: legacyHistory,
      html: currentHtml,
    };
    await window.appStoreAPI.saveAiSession(targetSession);
  }

  loadAiSession(targetSession);
});

function resetAiBuilder() {
  aiPrompt.value = "";
  aiStatus.textContent = "";
  aiStatus.className = "ai-status";
  currentAiHtml = null;
  isAiTesting = false;
  editingAppId = null;
  currentAiSessionId = null;
  aiChatHistory = [];
  renderChat();

  const headerTitle = document.getElementById("ai-current-title");
  if (headerTitle) headerTitle.textContent = "AI App Builder";

  aiTestBtn.style.display = "none";
  aiSaveBtn.style.display = "none";
  aiSubmit.querySelector("span").textContent = "Generate";
  loadAiHistoryList();
  setTimeout(() => aiPrompt.focus(), 100);
}

document.getElementById("btn-ai-build").addEventListener("click", async () => {
  aiModal.style.display = "flex";
  
  // Populate profiles
  const profilesSelect = document.getElementById("ai-builder-profile");
  if (profilesSelect) {
    const profiles = await window.appStoreAPI.getLlmProfiles();
    profilesSelect.innerHTML = '<option value="default">Default AI Profile</option>';
    if (profiles) {
      profiles.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name + " (" + p.provider + ")";
        profilesSelect.appendChild(opt);
      });
    }
  }

  loadAiHistoryList();
  if (aiChatHistory.length === 0 && !currentAiHtml) {
    resetAiBuilder();
  } else {
    setTimeout(() => aiPrompt.focus(), 100);
  }
});

document.getElementById("ai-new-chat-btn").addEventListener("click", () => {
  resetAiBuilder();
});

document.getElementById("ai-modal-close").addEventListener("click", () => {
  aiModal.style.display = "none";
});

aiSubmit.addEventListener("click", async () => {
  const prompt = aiPrompt.value.trim();
  if (!prompt) {
    aiPrompt.focus();
    return;
  }

  aiSubmit.disabled = true;
  aiStatus.className = "ai-status loading";
  aiStatus.innerHTML =
    '<span class="spinner"></span> ' +
    (currentAiHtml ? "Modifying app…" : "Building your app…");

  if (isAiTesting) {
    await window.appStoreAPI.closeAiTest();
  }

  aiChatHistory.push({ role: "user", content: prompt });
  renderChat();

  try {
    const profileId = document.getElementById("ai-builder-profile")?.value || "default";
    const result = await window.appStoreAPI.buildWithAI(
      aiChatHistory.map((m) => ({ role: m.role, content: m.content })),
      currentAiHtml,
      profileId
    );
    if (result.error) {
      aiStatus.className = "ai-status error";
      aiStatus.textContent = result.error;
      aiSubmit.disabled = false;
      aiChatHistory.pop(); // remove user prompt on error
      renderChat();
      return;
    }

    currentAiHtml = result.html;
    aiChatHistory.push({
      role: "assistant",
      content: result.text,
      html: currentAiHtml,
    });
    renderChat();
    saveCurrentAiSession();

    aiStatus.className = "ai-status success";
    aiStatus.textContent = `✓ App ready! Test or save it.`;
    aiSubmit.disabled = false;
    aiPrompt.value = "";

    aiTestBtn.style.display = "block";
    aiSaveBtn.style.display = "block";
    aiSubmit.querySelector("span").textContent = "Modify App";

    if (isAiTesting) {
      await window.appStoreAPI.testAiApp(currentAiHtml);
    }
  } catch (e) {
    aiStatus.className = "ai-status error";
    aiStatus.textContent = e.message || "Build failed";
    aiSubmit.disabled = false;
    aiChatHistory.pop();
    renderChat();
  }
});

aiTestBtn.addEventListener("click", async () => {
  if (!currentAiHtml) return;
  isAiTesting = true;
  await window.appStoreAPI.testAiApp(currentAiHtml);
});

aiSaveBtn.addEventListener("click", async () => {
  if (!currentAiHtml) return;
  aiModal.style.display = "none";

  const isMultiFile = typeof currentAiHtml === "object" && currentAiHtml !== null;

  if (editingAppId) {
    // We are editing an existing app, save it directly!
    const res = await window.appStoreAPI.updateAppHtml(
      editingAppId,
      currentAiHtml,
    );
    if (res && res.error) {
      alert("Failed to update app: " + res.error);
    } else {
      if (aiChatHistory && aiChatHistory.length > 0) {
        await window.appStoreAPI.saveAiChat(editingAppId, aiChatHistory);
      }
      await loadApps();
    }
  } else {
    // New app flow — open paste modal pre-filled with AI output
    openPasteModal();

    if (isMultiFile) {
      // ── Separate tab ──
      const separateRadio = document.querySelector('input[name="paste-mode"][value="separate"]');
      if (separateRadio) {
        separateRadio.checked = true;
        separateRadio.dispatchEvent(new Event("change"));
      }
      pasteCodeHtml.value = currentAiHtml.html || "";
      pasteCodeCss.value  = currentAiHtml.css  || "";
      pasteCodeJs.value   = currentAiHtml.js   || "";

      // ── Single tab — build a merged version automatically ──
      let merged = currentAiHtml.html || "";
      if (currentAiHtml.css) {
        const styleTag = `\n<style>\n${currentAiHtml.css}\n</style>`;
        if (merged.includes("</head>")) {
          merged = merged.replace("</head>", styleTag + "\n</head>");
        } else {
          merged = styleTag + "\n" + merged;
        }
      }
      if (currentAiHtml.js) {
        const scriptTag = `\n<script>\n${currentAiHtml.js}\n<\/script>`;
        if (merged.includes("</body>")) {
          merged = merged.replace("</body>", scriptTag + "\n</body>");
        } else {
          merged = merged + "\n" + scriptTag;
        }
      }
      pasteCode.value = merged;

      // Title from html portion
      const titleMatch = (currentAiHtml.html || "").match(/<title>(.*?)<\/title>/i);
      if (titleMatch) pasteName.value = titleMatch[1];

    } else {
      // Single-file string — original behaviour
      const singleRadio = document.querySelector('input[name="paste-mode"][value="single"]');
      if (singleRadio) {
        singleRadio.checked = true;
        singleRadio.dispatchEvent(new Event("change"));
      }
      pasteCode.value = currentAiHtml;
      const titleMatch = currentAiHtml.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) pasteName.value = titleMatch[1];
    }
    // Chat history will be saved inside pasteSubmit
  }
});

// ── Enter key in AI prompt ─────────────────────────────────
aiPrompt.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    aiSubmit.click();
  }
});

// ── Escape to close any modal ──────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (aiModal.style.display === "flex") aiModal.style.display = "none";
    if (pasteModal.style.display === "flex") pasteModal.style.display = "none";
    if (importModal.style.display === "flex")
      importModal.style.display = "none";
    importWrap.classList.remove("open");
  }
});

// ── Drag & Drop ────────────────────────────────────────────
const dropOverlay = document.getElementById("drop-overlay");
let dragCounter = 0;

document.addEventListener("dragenter", (e) => {
  if (isEditMode || !e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  e.stopPropagation();
  dragCounter++;
  if (dragCounter === 1) dropOverlay.style.display = "flex";
});

document.addEventListener("dragleave", (e) => {
  if (isEditMode || !e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  e.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.style.display = "none";
  }
});

document.addEventListener("dragover", (e) => {
  if (isEditMode || !e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener("drop", async (e) => {
  if (isEditMode || !e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  e.stopPropagation();
  dragCounter = 0;
  dropOverlay.style.display = "none";

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  const wasEmpty = currentImportQueue.length === 0;
  for (const file of files) {
    if (file.path) {
      currentImportQueue.push({ path: file.path, name: file.name });
    }
  }

  if (wasEmpty && currentImportQueue.length > 0) {
    processImportQueue();
  }
});

// ── Helpers ────────────────────────────────────────────────
function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ── Cropper Modal ──────────────────────────────────────────
let currentCropper = null;
const cropModal = document.getElementById("crop-modal");
const cropImage = document.getElementById("crop-image");
let cropSubmitBtn = document.getElementById("crop-submit");

function openCropModal(base64Image, onSave) {
  cropModal.style.display = "flex";
  cropImage.src = base64Image;
  if (currentCropper) {
    currentCropper.destroy();
  }
  currentCropper = new Cropper(cropImage, {
    aspectRatio: 1,
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 1,
    restore: false,
    guides: false,
    center: false,
    highlight: false,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
  });

  const saveHandler = () => {
    const canvas = currentCropper.getCroppedCanvas({
      width: 256,
      height: 256,
    });
    const croppedBase64 = canvas.toDataURL("image/png");
    closeCropModal();
    onSave(croppedBase64);
  };

  const newBtn = cropSubmitBtn.cloneNode(true);
  cropSubmitBtn.parentNode.replaceChild(newBtn, cropSubmitBtn);
  cropSubmitBtn = newBtn;
  cropSubmitBtn.addEventListener("click", saveHandler);
}

function closeCropModal() {
  cropModal.style.display = "none";
  if (currentCropper) {
    currentCropper.destroy();
    currentCropper = null;
  }
}

document
  .getElementById("crop-modal-close")
  .addEventListener("click", closeCropModal);

// ── Init ───────────────────────────────────────────────────
loadApps();

// Custom Prompt Implementation
function showPrompt(title, defaultText = "") {
  return new Promise((resolve) => {
    const modal = document.getElementById("prompt-modal");
    const titleEl = document.getElementById("prompt-modal-title");
    const inputEl = document.getElementById("prompt-modal-input");
    const cancelBtn = document.getElementById("prompt-modal-cancel");
    const submitBtn = document.getElementById("prompt-modal-submit");

    titleEl.textContent = title;
    inputEl.value = defaultText;
    modal.style.display = "flex";
    inputEl.focus();
    inputEl.select();

    const cleanup = () => {
      cancelBtn.removeEventListener("click", onCancel);
      submitBtn.removeEventListener("click", onSubmit);
      inputEl.removeEventListener("keydown", onKeyDown);
      modal.style.display = "none";
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onSubmit = () => {
      cleanup();
      resolve(inputEl.value);
    };

    const onKeyDown = (e) => {
      if (e.key === "Enter") onSubmit();
      if (e.key === "Escape") onCancel();
    };

    cancelBtn.addEventListener("click", onCancel);
    submitBtn.addEventListener("click", onSubmit);
    inputEl.addEventListener("keydown", onKeyDown);
  });
}

// Delete Folder Prompt Implementation
function showDeleteFolderPrompt(title) {
  return new Promise((resolve) => {
    const modal = document.getElementById("delete-folder-modal");
    const titleEl = document.getElementById("delete-folder-modal-title");
    const keepBtn = document.getElementById("delete-folder-keep");
    const allBtn = document.getElementById("delete-folder-all");
    const cancelBtn = document.getElementById("delete-folder-cancel");

    titleEl.textContent = title;
    modal.style.display = "flex";

    const cleanup = () => {
      keepBtn.removeEventListener("click", onKeep);
      allBtn.removeEventListener("click", onAll);
      cancelBtn.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onEscape);
      modal.style.display = "none";
    };

    const onKeep = () => {
      cleanup();
      resolve("keep");
    };
    const onAll = () => {
      cleanup();
      resolve("delete");
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onEscape = (e) => {
      if (e.key === "Escape") onCancel();
    };

    keepBtn.addEventListener("click", onKeep);
    allBtn.addEventListener("click", onAll);
    cancelBtn.addEventListener("click", onCancel);
    document.addEventListener("keydown", onEscape);
  });
}
