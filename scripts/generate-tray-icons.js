const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const iconDir = path.join(__dirname, '../assets/tray-icons');

async function processIcons() {
  console.log('🖼️  Generating OS-specific Tray Icons from SVGs...\n');
  
  if (!fs.existsSync(iconDir)) {
    console.error(`❌ Icon directory not found: ${iconDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(iconDir).filter(f => f.endsWith('.svg'));
  
  if (files.length === 0) {
    console.log('⚠️  No .svg files found to process.');
    return;
  }

  let successCount = 0;

  for (const file of files) {
    const baseName = path.basename(file, '.svg');
    const svgPath = path.join(iconDir, file);
    
    let svgText = fs.readFileSync(svgPath, 'utf8');

    // ─── 1. Black Template Versions (for macOS & Windows Light Mode) ───
    // Force all hex fills/strokes to #000000 (ignoring 'none')
    let blackSvgText = svgText
      .replace(/<svg([^>]+)>/, (match, p1) => p1.includes('fill=') ? match : `<svg fill="#000000"${p1}>`)
      .replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="#000000"')
      .replace(/stroke="#[0-9a-fA-F]{3,8}"/g, 'stroke="#000000"')
      .replace(/fill="black"/gi, 'fill="#000000"')
      .replace(/stroke="black"/gi, 'stroke="#000000"');
      
    // ─── 2. White Versions (for Windows Dark Mode) ───
    // Force all hex fills/strokes to #FFFFFF (ignoring 'none')
    let whiteSvgText = svgText
      .replace(/<svg([^>]+)>/, (match, p1) => p1.includes('fill=') ? match : `<svg fill="#FFFFFF"${p1}>`)
      .replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="#FFFFFF"')
      .replace(/stroke="#[0-9a-fA-F]{3,8}"/g, 'stroke="#FFFFFF"')
      .replace(/fill="black"/gi, 'fill="#FFFFFF"')
      .replace(/stroke="black"/gi, 'stroke="#FFFFFF"');

    console.log(`Processing: ${file} ➔ ${baseName}.png & ${baseName}Template.png`);

    try {
      // Black versions (Template)
      await sharp(Buffer.from(blackSvgText)).resize(16, 16).png().toFile(path.join(iconDir, `${baseName}Template.png`));
      await sharp(Buffer.from(blackSvgText)).resize(32, 32).png().toFile(path.join(iconDir, `${baseName}Template@2x.png`));

      // White versions
      await sharp(Buffer.from(whiteSvgText)).resize(16, 16).png().toFile(path.join(iconDir, `${baseName}.png`));
      await sharp(Buffer.from(whiteSvgText)).resize(32, 32).png().toFile(path.join(iconDir, `${baseName}@2x.png`));
      
      successCount++;
    } catch (err) {
      console.error(`❌ Failed to process ${file}:`, err.message);
    }
  }
  
  console.log(`\n✅ Successfully generated icons for ${successCount}/${files.length} SVGs!`);
}

processIcons().catch(console.error);
