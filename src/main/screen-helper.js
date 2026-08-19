'use strict';

const { screen, desktopCapturer } = require('electron');

/**
 * Returns the active Display object nearest to the current mouse cursor position.
 * Falls back to the primary display if cursor position cannot be determined.
 * @returns {Electron.Display}
 */
function getActiveDisplay() {
  try {
    const point = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  } catch (err) {
    console.warn('[ScreenHelper] getActiveDisplay fallback to primary:', err.message);
    return screen.getPrimaryDisplay();
  }
}

/**
 * Matches an Electron Display object to the corresponding DesktopCapturerSource.
 * 6-layer matching engine supporting macOS, Windows (DirectX/GDI), and Linux.
 * @param {Array<Electron.DesktopCapturerSource>} sources
 * @param {Electron.Display} targetDisplay
 * @returns {Electron.DesktopCapturerSource|null}
 */
function matchScreenSource(sources, targetDisplay) {
  if (!sources || !sources.length) return null;
  if (sources.length === 1) return sources[0];

  const targetDisplayId = String(targetDisplay.id);
  const allDisplays = screen.getAllDisplays();
  const displayIndex = allDisplays.findIndex(d => String(d.id) === targetDisplayId);

  // Strategy 1: Match by display_id property (Standard Electron API)
  let matched = sources.find(s => s.display_id && String(s.display_id) === targetDisplayId);
  if (matched) return matched;

  // Strategy 2: Match by source.id containing displayId (e.g. 'screen:2522497645:0' on macOS)
  matched = sources.find(s => {
    if (!s.id) return false;
    const parts = s.id.split(':');
    return parts.length >= 2 && parts[1] === targetDisplayId;
  });
  if (matched) return matched;

  // Strategy 3: Match by source.id index (e.g. 'screen:0:0', 'screen:1:0' on Windows)
  if (displayIndex >= 0) {
    matched = sources.find(s => {
      if (!s.id) return false;
      const parts = s.id.split(':');
      return parts.length >= 2 && (parts[1] === String(displayIndex) || parts[1] === String(displayIndex + 1));
    });
    if (matched) return matched;
  }

  // Strategy 4: Match by source.name ('Screen 1', 'Screen 2', 'Display 1', etc.)
  if (displayIndex >= 0) {
    const nameMatch = sources.find(s => {
      const name = (s.name || '').toLowerCase();
      return name === `screen ${displayIndex + 1}` || 
             name === `display ${displayIndex + 1}` ||
             name === `screen ${displayIndex}` ||
             name === `display ${displayIndex}`;
    });
    if (nameMatch) return nameMatch;
  }

  // Strategy 5: Match by aspect ratio & resolution similarity
  const sf = targetDisplay.scaleFactor || 1;
  const targetPhysW = targetDisplay.bounds.width * sf;
  const targetPhysH = targetDisplay.bounds.height * sf;
  const targetAspect = targetPhysW / (targetPhysH || 1);

  let bestSource = null;
  let bestScore = Infinity;

  for (const s of sources) {
    if (s.thumbnail && !s.thumbnail.isEmpty()) {
      const sz = s.thumbnail.getSize();
      const sourceAspect = sz.width / (sz.height || 1);
      const aspectDiff = Math.abs(sourceAspect - targetAspect);
      const resDiff = Math.abs(sz.width - targetPhysW) + Math.abs(sz.height - targetPhysH);
      const score = aspectDiff * 1000 + resDiff;
      if (score < bestScore) {
        bestScore = score;
        bestSource = s;
      }
    }
  }

  if (bestSource) return bestSource;

  // Strategy 6: Fallback to array index match
  if (displayIndex >= 0 && displayIndex < sources.length) {
    return sources[displayIndex];
  }

  // Fallback to first source
  return sources[0];
}

/**
 * Captures a screenshot of the specified (or active) display.
 * @param {Electron.Display} [targetDisplay]
 * @returns {Promise<{ thumbnail: Electron.NativeImage, display: Electron.Display, source: Electron.DesktopCapturerSource }|null>}
 */
async function captureDisplay(targetDisplay) {
  const display = targetDisplay || getActiveDisplay();
  const sf = display.scaleFactor || 1;
  const width = Math.round(display.bounds.width * sf);
  const height = Math.round(display.bounds.height * sf);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });

  if (!sources.length) return null;

  const source = matchScreenSource(sources, display);
  if (!source) return null;

  return {
    thumbnail: source.thumbnail,
    display,
    source,
  };
}

module.exports = {
  getActiveDisplay,
  matchScreenSource,
  captureDisplay,
};
