const sharp = require('sharp');
const path = require('path');
async function build() {
  const svgPath = path.join(__dirname, 'assets', 'icon-option1.svg');
  // standard tray icon
  await sharp(svgPath).resize(22, 22).toFile(path.join(__dirname, 'assets', 'iconTemplate.png'));
  // retina tray icon
  await sharp(svgPath).resize(44, 44).toFile(path.join(__dirname, 'assets', 'iconTemplate@2x.png'));
  // retina super tray icon
  await sharp(svgPath).resize(66, 66).toFile(path.join(__dirname, 'assets', 'iconTemplate@3x.png'));
  // main app icon (large)
  await sharp(svgPath).resize(1024, 1024).toFile(path.join(__dirname, 'assets', 'icon.png'));
}
build().catch(console.error);
