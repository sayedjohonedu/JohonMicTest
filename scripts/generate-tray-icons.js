#!/usr/bin/env node
/**
 * Generate 16×16 and 32×32 (@2x) PNG tray menu icons from inline SVGs using sharp.
 *
 * macOS convention: files named *Template.png are auto-tinted by the OS.
 * We produce black-on-transparent icons so macOS template rendering works perfectly.
 * On Windows, we swap to white-on-transparent at runtime via nativeImage.
 *
 * Run:  node scripts/generate-tray-icons.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'tray-icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// SVG icons – black stroke/fill on transparent, designed for 16×16 viewBox
const ICONS = {
  // Microphone (Start Listening)
  microphone: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="5" y="1" width="6" height="8" rx="3" stroke="black" stroke-width="1.3" fill="none"/>
    <path d="M3 8a5 5 0 0 0 10 0" stroke="black" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <line x1="8" y1="13" x2="8" y2="15" stroke="black" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="5.5" y1="15" x2="10.5" y2="15" stroke="black" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`,

  // Microphone Off (Stop Listening)
  'microphone-off': `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="5" y="1" width="6" height="8" rx="3" stroke="black" stroke-width="1.3" fill="none"/>
    <path d="M3 8a5 5 0 0 0 10 0" stroke="black" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <line x1="8" y1="13" x2="8" y2="15" stroke="black" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="5.5" y1="15" x2="10.5" y2="15" stroke="black" stroke-width="1.3" stroke-linecap="round"/>
    <line x1="2" y1="2" x2="14" y2="14" stroke="black" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // Camera/Capture
  capture: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M5.5 3.5L6.5 1.5h3l1 2" stroke="black" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="1.5" y="3.5" width="13" height="10" rx="1.5" stroke="black" stroke-width="1.2" fill="none"/>
    <circle cx="8" cy="8.5" r="2.8" stroke="black" stroke-width="1.2" fill="none"/>
  </svg>`,

  // Translator (speech bubbles with A/文)
  translator: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="0.8" y="0.8" width="9.5" height="7" rx="1.5" stroke="black" stroke-width="1.1" fill="none"/>
    <text x="3.2" y="6.5" font-family="Arial,sans-serif" font-weight="bold" font-size="5.5" fill="black">A</text>
    <rect x="5.7" y="8.2" width="9.5" height="7" rx="1.5" stroke="black" stroke-width="1.1" fill="none"/>
    <text x="8" y="13.8" font-family="Arial,sans-serif" font-weight="bold" font-size="5" fill="black">文</text>
  </svg>`,

  // Globe (Language)
  language: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.3" stroke="black" stroke-width="1.2" fill="none"/>
    <ellipse cx="8" cy="8" rx="3" ry="6.3" stroke="black" stroke-width="1.0" fill="none"/>
    <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="black" stroke-width="1.0"/>
    <line x1="1.7" y1="5" x2="14.3" y2="5" stroke="black" stroke-width="0.7"/>
    <line x1="1.7" y1="11" x2="14.3" y2="11" stroke="black" stroke-width="0.7"/>
  </svg>`,

  // Gear (Settings)
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 1.5l1 1.3.7-.3.5-1.3h.3l1.2.7-.2.3-.2 1.4.6.4 1.3-.5.2.2.3 1.3-.3.2-1.3.6-.1.7 1.2.5v.3l-.7 1.2-.3-.1-1.4-.3-.4.6.5 1.3-.2.2-1.3.3-.2-.3-.6-1.3-.7.1-.5 1.2h-.3L5.7 14l.1-.3.3-1.4-.6-.4-1.3.5-.2-.2L3.7 11l.3-.2 1.3-.6.1-.7-1.2-.5V8.7l.7-1.2.3.1 1.4.3.4-.6-.5-1.3.2-.2L8 5.5" stroke="black" stroke-width="1.0" fill="none" stroke-linejoin="round"/>
    <circle cx="8" cy="8" r="2.2" stroke="black" stroke-width="1.2" fill="none"/>
  </svg>`,

  // Power (Quit)
  quit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4.5 4a5.5 5.5 0 1 0 7 0" stroke="black" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <line x1="8" y1="1.5" x2="8" y2="7" stroke="black" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
};

async function generateIcons() {
  for (const [name, svg] of Object.entries(ICONS)) {
    const svgBuf = Buffer.from(svg);
    
    // 1x (16×16)  – named *Template.png for macOS template image support
    await sharp(svgBuf)
      .resize(16, 16)
      .png()
      .toFile(path.join(OUT_DIR, `${name}Template.png`));

    // 2x (32×32) for Retina
    await sharp(svgBuf)
      .resize(32, 32)
      .png()
      .toFile(path.join(OUT_DIR, `${name}Template@2x.png`));

    console.log(`✓ ${name}Template.png + @2x`);
  }
  console.log('\nAll tray icons generated in:', OUT_DIR);
}

generateIcons().catch(console.error);
