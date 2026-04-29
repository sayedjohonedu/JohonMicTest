const { app } = require('electron');
const path = require('path');
const fs = require('fs');

async function test() {
  const store = require('./store/config');
  const AdmZip = require('adm-zip');

  const zipUrl = 'https://github.com/he-is-talha/html-css-javascript-games/archive/refs/heads/main.zip';
  const zipResp = await fetch(zipUrl);
  if (!zipResp.ok) {
    console.log('Failed to download');
    process.exit(1);
  }
  
  const zipBuffer = Buffer.from(await zipResp.arrayBuffer());
  const tempZipPath = path.join(__dirname, 'temp-games.zip');
  fs.writeFileSync(tempZipPath, zipBuffer);
  
  const extractDir = path.join(__dirname, 'temp-games-extract');
  const zip = new AdmZip(tempZipPath);
  zip.extractAllTo(extractDir, true);
  
  const entries = fs.readdirSync(extractDir);
  let rootFolder = extractDir;
  if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
    rootFolder = path.join(extractDir, entries[0]);
  }
  
  const items = fs.readdirSync(rootFolder);
  let dirs = 0;
  for (const item of items) {
    const itemPath = path.join(rootFolder, item);
    if (fs.statSync(itemPath).isDirectory()) {
      dirs++;
      const gameName = item.replace(/^\d+-/, '').replace(/-/g, ' ');
      console.log('Game found:', gameName);
    }
  }
  
  console.log('Total games:', dirs);
  fs.rmSync(tempZipPath, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });
  process.exit(0);
}

test();
