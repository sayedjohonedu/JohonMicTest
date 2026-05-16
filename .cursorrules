# Git and GitHub Instructions

1. **Version Bumping**: BEFORE pushing ANY changes to GitHub, you MUST bump the `version` field in `package.json`.
2. **Tagging**: When pushing, create a git tag that exactly matches the new version in `package.json` (e.g., `v1.3.11`) and push the tags along with the commit. This triggers the necessary GitHub Actions for releasing the application.

# Build & Release
- Always ensure `npm run build:mac` or `build:win` can succeed if changing main process code.
- If pushing to `main` branch, the `build-and-release.yml` will automatically build the Electron app.

# Microphone & Lifecycle Rules
- `isListening` tracks Chrome STT state. `offlineRecorder.isRecording` tracks Whisper STT state.
- Both engines are strictly mutually exclusive via a software mutex. DO NOT allow them to run concurrently.
- When tearing down media, `track.stop()` must always be called on the streams, even if `wsClient.terminate()` or `app.exit()` is being called immediately after.
