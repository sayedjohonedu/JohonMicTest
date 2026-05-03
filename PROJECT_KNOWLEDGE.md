# MicTab - Project Knowledge Base

This document serves as a comprehensive, deep-dive summary of the MicTab project, built from recent conversation history and development sessions. It is intended to give any new assistant or developer full context on the architecture, features, and recent problem-solving context.

## 1. Project Overview & Tech Stack
**MicTab** is an Electron-based desktop application focused on advanced voice dictation (Whisper), AI-powered voice agents, and screen annotation (Lens). 
- **Framework:** Electron (HTML/CSS/JS frontend, Node.js backend).
- **Core Integrations:** LLMs (via custom API clients), Whisper Engine (Speech-to-Text), and native OS interactions (e.g., RobotJS for simulated keystrokes).
- **Platforms:** Designed for cross-platform functionality, specifically macOS and Windows.

---

## 2. Core Architecture & Features

### A. Voice Agents & Pipeline Engine (`AgentPipelineEngine` & `LLMClient`)
MicTab features a highly customizable, node-based (n8n-style) Voice Agent system where users can build complex AI workflows.
*   **Pipeline Execution:** Uses `buildPipeline` with a two-pass execution model. First pass resolves variable data and keyword matches; second pass generates the final prompt. Fixed critical `async`/`await` corruptions to ensure proper sequential execution.
*   **In-Context Variables:** Supports dynamic variable substitution. Detected keyword phrases in the user's transcript are replaced with semantic tokens (e.g., `[clipboard]`, `[selected-text]`), and the actual data definitions are appended at the end of the prompt for AI context.
*   **Jarvis (Built-in Agent):** A foundational agent configured to process text, clipboard data, and selected-text blocks. Defaults to "auto-detect" for context blocks.
*   **Safe Text Insertion:** To prevent data loss, the `ClipboardManager` detects when a selection-based agent is active. It forces the system to deselect the highlighted text and prepends newlines before pasting AI output, preventing accidental overwriting of user content.
*   **Agent Test Execution (`agents-run-test`):** Features an automated test pipeline. The UI includes an auto-executing modal that picks up pre-configured test context, runs the pipeline via IPC handler, and displays live AI output alongside a collapsible prompt inspector.
*   **Builder UI:** Features a custom drag-and-drop block builder. Uses professional SVG icons instead of emojis. Includes an animated "Block Picker" popup. Built-in agents have a "Read-Only" UI lockdown to prevent structural edits, but users can modify names/triggers and use a "Reset" button to restore factory configs.

### B. Whisper Engine (Dictation & STT)
A real-time speech-to-text pipeline integrating advanced Whisper models.
*   **WhisperApiManager:** The core manager handling dictation states.
*   **Profile Vault & Synchronization:** Consolidated Whisper profile management into a single source of truth within the Whisper Engine panel (removing legacy vault code). Handles profile mirroring, fallback chains, and ensures saved profiles are visible and selectable. Fixes active profile selection bugs for real-time dictation.
*   **Cross-Platform Pasting (`robotjs`):** Dictation automatically pastes into the active OS window. Required significant troubleshooting on Windows to resolve synchronization/permission failures during clipboard/paste mechanisms that otherwise worked flawlessly on macOS.
*   **Neutralized Branding:** Removed specific vendor references (like "Google Chrome" or "Google STT") in favor of professional, generic "default mode" terminology.

### C. Lens Editor (Screen Annotation)
A robust on-screen drawing and annotation overlay.
*   **Core UI:** `ui/lens-editor.html` and `ui/lens-capture.html`.
*   **Path-Based Hit Detection:** Replaced basic bounding-box hit detection with precise path-based hit testing for tools like `arrow`, `line`, `freehand`, and `highlighter`. Implemented an 8-10 pixel tolerance buffer to easily select thin elements without interfering with overlapping shapes.
*   **Border-Only Selection:** Implemented border-only selection for hollow shapes (`rect`, `circle`). This allows users to click and interact with content *inside* the shapes without accidentally dragging the bounding box.

### D. Settings & Application Shell
*   **MiniApp Shell:** Runs under `ui/miniapp-shell.html` with specific preload scripts (`miniapp-preload.js`, `voice-agents-preload.js`).
*   **Clipboard Manager:** Integrated seamlessly into the general settings, relying heavily on the default keyboard shortcut (`Alt + V` on Windows, `⌥ + V` on macOS).

---

## 3. Infrastructure & DevOps (CI/CD)
*   **Dual-Repository Release Pipeline:** The source code resides in a private GitHub repository, while release artifacts are published to a public GitHub repository.
*   **GitHub Actions:** Configured with cross-account environment secrets, customized Git remotes, and specific permission resolutions to ensure a seamless build-and-publish pipeline.
*   **Skills & Tooling:** The workspace utilizes specialized agent skills, such as `ui-ux-pro-max`, located in `.agent/skills/ui-ux-pro-max/SKILL.md`, which contains extensive design intelligence (palettes, fonts, styles) for UI work.

---
*Last updated: Based on conversations up to May 2026. This file is intended to act as a permanent Knowledge Item (KI) context layer for all future AI assistant interactions.*
