/**
 * ============================================
 * MicTab Code Generators — Main Script
 * Group 8: QR Generator, QR Scanner, Barcode Generator
 * iOS Cream Edition
 * ============================================
 */

document.addEventListener('DOMContentLoaded', () => {

  // ──────────────────────────────────────────
  // UTILITY: Toast Notification System
  // ──────────────────────────────────────────

  const toastContainer = document.getElementById('toast-container');

  /**
   * Show a toast notification.
   * @param {string} message - Text to display.
   * @param {'success'|'error'|'info'} type - Toast type.
   * @param {number} duration - Auto-dismiss in ms.
   */
  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('out');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }

  // ──────────────────────────────────────────
  // UTILITY: Download from Data URL
  // ──────────────────────────────────────────

  /**
   * Trigger a file download from a data URL.
   * @param {string} dataURL - The data URL string.
   * @param {string} filename - The desired file name.
   */
  function downloadDataURL(dataURL, filename) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ──────────────────────────────────────────
  // TAB SWITCHING
  // ──────────────────────────────────────────

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // ──────────────────────────────────────────
  // QR MODE SWITCHING
  // ──────────────────────────────────────────

  const modeTabs = document.querySelectorAll('.mode-tab');
  const modePanels = document.querySelectorAll('.mode-panel');
  let currentQRMode = 'text';

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      modePanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      currentQRMode = tab.getAttribute('data-mode');
      const targetPanel = document.getElementById('mode-' + currentQRMode);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // ──────────────────────────────────────────
  // 1. QR CODE GENERATOR
  // ──────────────────────────────────────────

  const qrInput        = document.getElementById('qr-input');
  const wifiSsid       = document.getElementById('wifi-ssid');
  const wifiPassword   = document.getElementById('wifi-password');
  const wifiEncryption = document.getElementById('wifi-encryption');
  const vcardName      = document.getElementById('vcard-name');
  const vcardPhone     = document.getElementById('vcard-phone');
  const vcardEmail     = document.getElementById('vcard-email');
  const vcardOrg       = document.getElementById('vcard-org');
  const vcardUrl       = document.getElementById('vcard-url');
  const qrSizeSelect   = document.getElementById('qr-size');
  const qrFgColor      = document.getElementById('qr-fg-color');
  const qrBgColor      = document.getElementById('qr-bg-color');
  const qrFgLabel      = document.getElementById('qr-fg-label');
  const qrBgLabel      = document.getElementById('qr-bg-label');
  const qrGenBtn       = document.getElementById('qr-generate-btn');
  const qrPreview      = document.getElementById('qr-preview');
  const qrDlBtn        = document.getElementById('qr-download-btn');
  const urlShortDisplay = document.getElementById('url-short-display');
  const urlShortValue   = document.getElementById('url-short-value');

  let qrInstance = null;
  let selectedECLevel = QRCode.CorrectLevel.H;

  // Live color label updates
  qrFgColor.addEventListener('input', () => {
    qrFgLabel.textContent = qrFgColor.value.toUpperCase();
  });
  qrBgColor.addEventListener('input', () => {
    qrBgLabel.textContent = qrBgColor.value.toUpperCase();
  });

  // Error correction level selector
  const ecOptions = document.querySelectorAll('.ec-option');
  ecOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      ecOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const level = opt.getAttribute('data-level');
      selectedECLevel = QRCode.CorrectLevel[level];
    });
  });

  /**
   * Build WiFi QR string.
   * Format: WIFI:T:WPA;S:mynetwork;P:mypassphrase;;
   */
  function buildWifiString() {
    const ssid = wifiSsid.value.trim();
    const pass = wifiPassword.value.trim();
    const enc  = wifiEncryption.value;

    if (!ssid) return null;

    // Escape special characters in SSID and password per WiFi QR spec
    const escape = (str) => str.replace(/([\\;,:"'])/g, '\\$1');

    return `WIFI:T:${enc};S:${escape(ssid)};P:${escape(pass)};;`;
  }

  /**
   * Build vCard string (v3.0 format).
   */
  function buildVcardString() {
    const name  = vcardName.value.trim();
    const phone = vcardPhone.value.trim();
    const email = vcardEmail.value.trim();
    const org   = vcardOrg.value.trim();
    const url   = vcardUrl.value.trim();

    if (!name) return null;

    let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
    vcard += `FN:${name}\n`;

    // Split name into parts for N field
    const nameParts = name.split(/\s+/);
    const lastName = nameParts.length > 1 ? nameParts.slice(-1).join('') : '';
    const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : name;
    vcard += `N:${lastName};${firstName};;;\n`;

    if (phone) vcard += `TEL;TYPE=CELL:${phone}\n`;
    if (email) vcard += `EMAIL;TYPE=INTERNET:${email}\n`;
    if (org)   vcard += `ORG:${org}\n`;
    if (url)   vcard += `URL:${url}\n`;

    vcard += 'END:VCARD';
    return vcard;
  }

  /**
   * Get the QR text content based on the current mode.
   */
  function getQRText() {
    switch (currentQRMode) {
      case 'text': {
        const text = qrInput.value.trim();
        return text || null;
      }
      case 'wifi': {
        return buildWifiString();
      }
      case 'vcard': {
        return buildVcardString();
      }
      default:
        return null;
    }
  }

  /**
   * Get a display-friendly summary of the encoded content for the URL shortener display.
   */
  function getContentSummary(text, mode) {
    if (mode === 'wifi') {
      const ssid = wifiSsid.value.trim();
      return `WiFi: ${ssid}`;
    }
    if (mode === 'vcard') {
      const name = vcardName.value.trim();
      return `Contact: ${name}`;
    }
    // For text/URL, show truncated content
    if (text.length > 80) {
      return text.substring(0, 80) + '...';
    }
    return text;
  }

  /**
   * Generate a QR code from the current input values.
   */
  qrGenBtn.addEventListener('click', () => {
    const text = getQRText();

    if (!text) {
      const modeMessages = {
        text: 'Please enter text or a URL to generate a QR code.',
        wifi: 'Please enter a network name (SSID) for the WiFi QR code.',
        vcard: 'Please enter a name for the vCard QR code.'
      };
      showToast(modeMessages[currentQRMode] || 'Please fill in the required fields.', 'error');
      return;
    }

    const size = parseInt(qrSizeSelect.value, 10);
    const fg   = qrFgColor.value;
    const bg   = qrBgColor.value;

    // Clear previous QR code
    qrPreview.innerHTML = '';

    try {
      qrInstance = new QRCode(qrPreview, {
        text: text,
        width: size,
        height: size,
        colorDark: fg,
        colorLight: bg,
        correctLevel: selectedECLevel
      });

      qrDlBtn.disabled = false;

      // Show content summary
      const summary = getContentSummary(text, currentQRMode);
      urlShortValue.textContent = summary;
      urlShortDisplay.classList.add('visible');

      showToast('QR code generated successfully!', 'success');
    } catch (err) {
      qrPreview.innerHTML = '<div class="placeholder-text">Error generating QR code</div>';
      qrDlBtn.disabled = true;
      urlShortDisplay.classList.remove('visible');
      showToast('Failed to generate QR code: ' + err.message, 'error');
    }
  });

  /**
   * Download QR code as PNG.
   */
  qrDlBtn.addEventListener('click', () => {
    const canvas = qrPreview.querySelector('canvas');
    if (!canvas) {
      showToast('No QR code found. Generate one first.', 'error');
      return;
    }

    try {
      const dataURL = canvas.toDataURL('image/png');
      downloadDataURL(dataURL, 'mictab-qrcode.png');
      showToast('QR code downloaded!', 'success');
    } catch (err) {
      showToast('Download failed: ' + err.message, 'error');
    }
  });

  // ──────────────────────────────────────────
  // 2. QR CODE SCANNER
  // ──────────────────────────────────────────

  const qrFileInput       = document.getElementById('qr-file-input');
  const qrPasteBtn        = document.getElementById('qr-paste-btn');
  const qrPasteHint       = document.getElementById('qr-paste-hint');
  const scannerImgWrap    = document.getElementById('scanner-image-preview-wrap');
  const scannerImgPreview = document.getElementById('scanner-image-preview');
  const scannerResultArea = document.getElementById('scanner-result-area');
  const scannerResult     = document.getElementById('scanner-result');
  const scannerCopyBtn    = document.getElementById('scanner-copy-btn');
  const scannerPlaceholder = document.getElementById('scanner-placeholder');

  let pasteModeActive = false;

  /**
   * Scan a File/Blob using html5-qrcode.
   * @param {File} file - The image file to scan.
   */
  function scanImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please provide a valid image file.', 'error');
      return;
    }

    // Show image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      scannerImgPreview.src = e.target.result;
      scannerImgWrap.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    // Ensure a hidden element exists for html5-qrcode
    const TEMP_ID = 'mictab-qr-scanner-temp';
    let tempEl = document.getElementById(TEMP_ID);
    if (!tempEl) {
      tempEl = document.createElement('div');
      tempEl.id = TEMP_ID;
      Object.assign(tempEl.style, {
        position: 'absolute',
        left: '-9999px',
        top: '-9999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden'
      });
      document.body.appendChild(tempEl);
    }

    const html5QrCode = new Html5Qrcode(TEMP_ID);

    html5QrCode.scanFile(file, false)
      .then(decodedText => {
        scannerResult.value = decodedText;
        scannerResultArea.classList.remove('hidden');
        scannerPlaceholder.classList.add('hidden');
        showToast('QR code decoded successfully!', 'success');
      })
      .catch(() => {
        scannerResultArea.classList.add('hidden');
        scannerPlaceholder.classList.remove('hidden');
        showToast('No QR code found in the image. Try a clearer image.', 'error');
      });
  }

  // File upload handler
  qrFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      scanImageFile(file);
    }
    qrFileInput.value = '';
  });

  // Paste from clipboard button
  qrPasteBtn.addEventListener('click', () => {
    pasteModeActive = !pasteModeActive;
    if (pasteModeActive) {
      qrPasteHint.classList.remove('hidden');
      qrPasteBtn.textContent = 'Cancel Paste';
    } else {
      qrPasteHint.classList.add('hidden');
      qrPasteBtn.textContent = 'Paste from Clipboard';
    }
  });

  // Global paste event listener
  document.addEventListener('paste', (e) => {
    if (!pasteModeActive) return;

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          scanImageFile(file);
          pasteModeActive = false;
          qrPasteHint.classList.add('hidden');
          qrPasteBtn.textContent = 'Paste from Clipboard';
        }
        return;
      }
    }

    showToast('No image found in clipboard. Copy an image first.', 'error');
  });

  // Copy decoded result
  scannerCopyBtn.addEventListener('click', () => {
    const text = scannerResult.value;
    if (!text) {
      showToast('Nothing to copy.', 'error');
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() => showToast('Copied to clipboard!', 'success'))
      .catch(() => {
        scannerResult.select();
        showToast('Press Ctrl+C to copy.', 'info');
      });
  });

  // ──────────────────────────────────────────
  // 3. BARCODE GENERATOR
  // ──────────────────────────────────────────

  const barcodeInput      = document.getElementById('barcode-input');
  const barcodeFormat     = document.getElementById('barcode-format');
  const barcodeHint       = document.getElementById('barcode-hint');
  const barcodeGenBtn     = document.getElementById('barcode-generate-btn');
  const barcodePreview    = document.getElementById('barcode-preview');
  const barcodeCanvas     = document.getElementById('barcode-canvas');
  const barcodeDlBtn      = document.getElementById('barcode-download-btn');
  const barcodeShowLabel  = document.getElementById('barcode-show-label');
  const barcodeLabelText  = document.getElementById('barcode-label-text');
  const barcodeLabelGroup = document.getElementById('barcode-label-group');

  // Toggle label text field visibility
  barcodeShowLabel.addEventListener('change', () => {
    barcodeLabelGroup.style.display = barcodeShowLabel.checked ? 'block' : 'none';
  });

  // Format-specific hints
  const formatHints = {
    CODE128:   'CODE128 supports any ASCII text — the most versatile format.',
    EAN13:     'EAN-13 requires 12 or 13 digits. If you enter 12, a check digit is calculated.',
    EAN8:      'EAN-8 requires 7 or 8 digits. If you enter 7, a check digit is calculated.',
    UPC:       'UPC (UPC-A) requires 11 or 12 digits. If you enter 11, a check digit is calculated.',
    CODE39:    'CODE39 supports uppercase letters A–Z, digits 0–9, and symbols: - . $ / + % SPACE.',
    ITF14:     'ITF-14 requires 13 or 14 digits. If you enter 13, a check digit is calculated.',
    pharmacode:'Pharmacode encodes a single number between 3 and 131070.',
    codabar:   'Codabar supports digits 0–9 and characters: - $ : / . +. Must start/end with A, B, C, or D.'
  };

  // Update hint when format changes
  barcodeFormat.addEventListener('change', () => {
    const fmt = barcodeFormat.value;
    barcodeHint.textContent = formatHints[fmt] || '';
  });

  /**
   * Validate input against barcode format requirements.
   * Returns { valid: boolean, message: string }
   */
  function validateBarcodeInput(value, format) {
    if (!value) {
      return { valid: false, message: 'Please enter a value for the barcode.' };
    }

    switch (format) {
      case 'EAN13': {
        if (!/^\d{12,13}$/.test(value)) {
          return { valid: false, message: 'EAN-13 requires exactly 12 or 13 digits.' };
        }
        break;
      }
      case 'EAN8': {
        if (!/^\d{7,8}$/.test(value)) {
          return { valid: false, message: 'EAN-8 requires exactly 7 or 8 digits.' };
        }
        break;
      }
      case 'UPC': {
        if (!/^\d{11,12}$/.test(value)) {
          return { valid: false, message: 'UPC requires exactly 11 or 12 digits.' };
        }
        break;
      }
      case 'CODE39': {
        if (!/^[A-Z0-9\-. $/+% ]+$/.test(value)) {
          return { valid: false, message: 'CODE39 only allows uppercase A-Z, 0-9, and - . $ / + % SPACE.' };
        }
        break;
      }
      case 'ITF14': {
        if (!/^\d{13,14}$/.test(value)) {
          return { valid: false, message: 'ITF-14 requires exactly 13 or 14 digits.' };
        }
        break;
      }
      case 'pharmacode': {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 3 || num > 131070) {
          return { valid: false, message: 'Pharmacode value must be between 3 and 131070.' };
        }
        break;
      }
      case 'codabar': {
        if (!/^[A-Da-d][\d\-$:/.+]+[A-Da-d]$/.test(value)) {
          return { valid: false, message: 'Codabar must start and end with A, B, C, or D and contain digits and - $ : / . +' };
        }
        break;
      }
      // CODE128 has no strict validation beyond non-empty
    }

    return { valid: true, message: '' };
  }

  /**
   * Generate the barcode.
   */
  barcodeGenBtn.addEventListener('click', () => {
    const value  = barcodeInput.value.trim();
    const format = barcodeFormat.value;
    const showLabel = barcodeShowLabel.checked;
    const labelText = barcodeLabelText.value.trim();

    // Validate
    const validation = validateBarcodeInput(value, format);
    if (!validation.valid) {
      showToast(validation.message, 'error');
      return;
    }

    // Clear previous barcode
    barcodePreview.innerHTML = '';

    // Create SVG element for display
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.id = 'barcode-svg';
    barcodePreview.appendChild(svgEl);

    // Build JsBarcode options
    const barcodeOptions = {
      format: format,
      lineColor: '#000000',
      background: '#ffffff',
      width: 2,
      height: 80,
      displayValue: showLabel,
      font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", Segoe UI, Roboto, sans-serif',
      fontSize: 14,
      margin: 10
    };

    // If custom label text is provided and label display is on, use it
    if (showLabel && labelText) {
      barcodeOptions.text = labelText;
    }

    try {
      // Render to SVG (display)
      JsBarcode(svgEl, value, barcodeOptions);

      // Render to hidden Canvas (for download)
      const canvasOptions = { ...barcodeOptions };
      JsBarcode(barcodeCanvas, value, canvasOptions);

      barcodeDlBtn.disabled = false;
      showToast('Barcode generated successfully!', 'success');
    } catch (err) {
      barcodePreview.innerHTML = '<div class="placeholder-text">Error generating barcode</div>';
      barcodeDlBtn.disabled = true;
      showToast('Failed to generate barcode: ' + err.message, 'error');
    }
  });

  /**
   * Download barcode as PNG from the hidden canvas.
   */
  barcodeDlBtn.addEventListener('click', () => {
    try {
      const dataURL = barcodeCanvas.toDataURL('image/png');
      downloadDataURL(dataURL, 'mictab-barcode.png');
      showToast('Barcode downloaded!', 'success');
    } catch (err) {
      showToast('Download failed: ' + err.message, 'error');
    }
  });

  // ──────────────────────────────────────────
  // END
  // ──────────────────────────────────────────

});
