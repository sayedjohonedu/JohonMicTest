const fs = require('fs');
const path = require('path');

function findChrome() {
  const platform = process.platform;
  let paths = [];

  if (platform === 'darwin') {
    paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      path.join(process.env.HOME, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
  } else if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.PROGRAMFILES;
    const programFilesX86 = process.env['PROGRAMFILES(X86)'];
    
    paths = [
      path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
      path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
      path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
      path.join(localAppData, 'Google/Chrome SxS/Application/chrome.exe'),
    ];
  }

  if (process.env.CHROME_PATH) {
    paths.unshift(process.env.CHROME_PATH);
  }

  for (const chromePath of paths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  return null;
}

module.exports = { findChrome };
