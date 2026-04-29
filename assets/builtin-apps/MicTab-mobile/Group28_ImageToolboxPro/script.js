/* ============================================================
   MicTab Image Toolbox — script.js
   All 8 image tools: Resizer, Cropper, Converter, Compressor,
   Favicon Generator, Meme Generator, Color Palette, EXIF Viewer
   iOS Cream Theme Edition
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ========================
  // UTILITY HELPERS
  // ========================

  /**
   * Format bytes into a human-readable string
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Show a toast notification
   */
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  /**
   * Read a File object as a data URL using FileReader
   */
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Load an image from a src string (data URL or object URL)
   */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Download a blob with a given filename
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Set up drag-and-drop on an upload zone
   */
  function setupDropZone(zoneId, fileInputId) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(fileInputId);
    if (!zone || !input) return;

    ['dragenter', 'dragover'].forEach(evt => {
      zone.addEventListener(evt, e => {
        e.preventDefault();
        zone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      zone.addEventListener(evt, e => {
        e.preventDefault();
        zone.classList.remove('dragover');
      });
    });

    zone.addEventListener('drop', e => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        input.files = files;
        input.dispatchEvent(new Event('change'));
      }
    });
  }

  // ========================
  // TAB / HORIZONTAL STRIP NAVIGATION
  // ========================

  const tabItems = document.querySelectorAll('.tab-item');
  const panels = document.querySelectorAll('.tool-panel');
  const tabStrip = document.getElementById('tabStrip');

  /**
   * Switch active tool panel and scroll tab into view
   */
  function switchTool(toolName) {
    tabItems.forEach(item => {
      item.classList.toggle('active', item.dataset.tool === toolName);
    });
    panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === 'panel-' + toolName);
    });

    // Scroll the active tab into view
    const activeTab = document.querySelector('.tab-item.active');
    if (activeTab && tabStrip) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  tabItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTool(item.dataset.tool);
    });
  });

  // ========================
  // TOOL 1: IMAGE RESIZER (with social media presets)
  // ========================

  (() => {
    const fileInput = document.getElementById('resizer-file');
    const controls = document.getElementById('resizer-controls');
    const preview = document.getElementById('resizer-preview');
    const originalInfo = document.getElementById('resizer-original-info');
    const widthInput = document.getElementById('resizer-width');
    const heightInput = document.getElementById('resizer-height');
    const lockCheckbox = document.getElementById('resizer-lock');
    const resizeBtn = document.getElementById('resizer-resize-btn');
    const comparison = document.getElementById('resizer-comparison');
    const origSizeEl = document.getElementById('resizer-orig-size');
    const newSizeEl = document.getElementById('resizer-new-size');
    const downloadBtn = document.getElementById('resizer-download');
    const canvas = document.getElementById('resizer-canvas');
    const presetChips = document.querySelectorAll('#resizer-presets .preset-chip');

    let currentFile = null;
    let originalWidth = 0;
    let originalHeight = 0;
    let aspectRatio = 1;
    let resizedBlob = null;

    setupDropZone('resizer-drop', 'resizer-file');

    // Social media preset chips
    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const w = parseInt(chip.dataset.w, 10);
        const h = parseInt(chip.dataset.h, 10);

        // Toggle active state
        presetChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        // Unlock aspect ratio for presets since they set specific dimensions
        lockCheckbox.checked = false;
        widthInput.value = w;
        heightInput.value = h;
      });
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      currentFile = file;

      const dataURL = await readFileAsDataURL(file);
      const img = await loadImage(dataURL);

      originalWidth = img.naturalWidth;
      originalHeight = img.naturalHeight;
      aspectRatio = originalWidth / originalHeight;

      preview.src = dataURL;
      originalInfo.textContent = `Original: ${originalWidth} × ${originalHeight} — ${formatBytes(file.size)}`;

      widthInput.value = originalWidth;
      heightInput.value = originalHeight;

      controls.style.display = 'flex';
      comparison.style.display = 'none';
      downloadBtn.style.display = 'none';
      resizedBlob = null;

      // Reset preset selection
      presetChips.forEach(c => c.classList.remove('active'));
    });

    // Aspect ratio locked width/height sync
    widthInput.addEventListener('input', () => {
      if (lockCheckbox.checked && aspectRatio > 0) {
        const w = parseInt(widthInput.value, 10);
        if (!isNaN(w) && w > 0) {
          heightInput.value = Math.round(w / aspectRatio);
        }
      }
      // Deselect presets on manual input
      presetChips.forEach(c => c.classList.remove('active'));
    });

    heightInput.addEventListener('input', () => {
      if (lockCheckbox.checked && aspectRatio > 0) {
        const h = parseInt(heightInput.value, 10);
        if (!isNaN(h) && h > 0) {
          widthInput.value = Math.round(h * aspectRatio);
        }
      }
      presetChips.forEach(c => c.classList.remove('active'));
    });

    resizeBtn.addEventListener('click', async () => {
      const newW = parseInt(widthInput.value, 10);
      const newH = parseInt(heightInput.value, 10);
      if (isNaN(newW) || isNaN(newH) || newW < 1 || newH < 1) {
        showToast('Please enter valid width and height.', 'error');
        return;
      }

      const dataURL = await readFileAsDataURL(currentFile);
      const img = await loadImage(dataURL);

      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, newW, newH);

      canvas.toBlob(blob => {
        resizedBlob = blob;
        origSizeEl.textContent = formatBytes(currentFile.size);
        newSizeEl.textContent = formatBytes(blob.size);
        comparison.style.display = 'flex';
        downloadBtn.style.display = 'inline-flex';
        showToast('Image resized successfully!');
      }, 'image/png');
    });

    downloadBtn.addEventListener('click', () => {
      if (!resizedBlob) return;
      downloadBlob(resizedBlob, 'resized-image.png');
    });
  })();

  // ========================
  // TOOL 2: IMAGE CROPPER (with aspect ratio presets)
  // ========================

  (() => {
    const fileInput = document.getElementById('cropper-file');
    const container = document.getElementById('cropper-container');
    const image = document.getElementById('cropper-image');
    const controls = document.getElementById('cropper-controls');
    const cropBtn = document.getElementById('cropper-crop-btn');
    const canvas = document.getElementById('cropper-canvas');
    const ratioRow = document.getElementById('cropper-ratio-row');
    const ratioChips = document.querySelectorAll('#cropper-ratio-presets .preset-chip');

    let cropperInstance = null;
    let currentFileName = 'cropped-image.png';
    let currentRatio = NaN; // NaN = free

    setupDropZone('cropper-drop', 'cropper-file');

    // Aspect ratio presets
    ratioChips.forEach(chip => {
      chip.addEventListener('click', () => {
        ratioChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const ratioVal = parseFloat(chip.dataset.ratio);
        if (ratioVal === 0) {
          currentRatio = NaN;
        } else {
          currentRatio = ratioVal;
        }

        if (cropperInstance) {
          cropperInstance.setAspectRatio(currentRatio);
        }
      });
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      // Destroy previous cropper instance if any
      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }

      currentFileName = file.name.replace(/\.[^/.]+$/, '') + '-cropped.png';

      const dataURL = await readFileAsDataURL(file);
      image.src = dataURL;
      container.style.display = 'block';
      controls.style.display = 'flex';
      ratioRow.style.display = 'flex';

      // Wait for image to load before initializing Cropper.js
      image.onload = () => {
        cropperInstance = new Cropper(image, {
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.8,
          responsive: true,
          background: true,
          modal: true,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: true,
          cropBoxResizable: true,
          aspectRatio: currentRatio,
        });
      };
    });

    cropBtn.addEventListener('click', () => {
      if (!cropperInstance) {
        showToast('Please upload an image first.', 'error');
        return;
      }

      const croppedCanvas = cropperInstance.getCroppedCanvas({
        maxWidth: 4096,
        maxHeight: 4096,
      });

      if (!croppedCanvas) {
        showToast('Failed to crop. Try adjusting the crop area.', 'error');
        return;
      }

      croppedCanvas.toBlob(blob => {
        downloadBlob(blob, currentFileName);
        showToast('Cropped image downloaded!');
      }, 'image/png');
    });
  })();

  // ========================
  // TOOL 3: FORMAT CONVERTER
  // ========================

  (() => {
    const fileInput = document.getElementById('converter-file');
    const controls = document.getElementById('converter-controls');
    const preview = document.getElementById('converter-preview');
    const originalInfo = document.getElementById('converter-original-info');
    const formatSelect = document.getElementById('converter-format');
    const qualitySlider = document.getElementById('converter-quality');
    const qualityVal = document.getElementById('converter-quality-val');
    const qualityRow = document.getElementById('converter-quality-row');
    const convertBtn = document.getElementById('converter-convert-btn');
    const comparison = document.getElementById('converter-comparison');
    const origSizeEl = document.getElementById('converter-orig-size');
    const newSizeEl = document.getElementById('converter-new-size');
    const downloadBtn = document.getElementById('converter-download');
    const canvas = document.getElementById('converter-canvas');

    let currentFile = null;
    let convertedBlob = null;
    let convertedExt = 'png';

    setupDropZone('converter-drop', 'converter-file');

    // Show quality slider only for JPEG and WebP
    formatSelect.addEventListener('change', () => {
      const fmt = formatSelect.value;
      qualityRow.style.display = (fmt === 'image/png') ? 'none' : 'flex';
    });

    qualitySlider.addEventListener('input', () => {
      qualityVal.textContent = qualitySlider.value;
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      currentFile = file;

      const dataURL = await readFileAsDataURL(file);
      preview.src = dataURL;
      originalInfo.textContent = `Original: ${file.type.split('/')[1].toUpperCase()} — ${formatBytes(file.size)}`;

      controls.style.display = 'flex';
      comparison.style.display = 'none';
      downloadBtn.style.display = 'none';
      convertedBlob = null;
    });

    convertBtn.addEventListener('click', async () => {
      if (!currentFile) return;

      const dataURL = await readFileAsDataURL(currentFile);
      const img = await loadImage(dataURL);

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const format = formatSelect.value;
      const quality = parseInt(qualitySlider.value, 10) / 100;

      // Determine extension
      const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
      convertedExt = extMap[format] || 'png';

      const mimeType = format;
      const blobQuality = (format === 'image/png') ? undefined : quality;

      canvas.toBlob(blob => {
        if (!blob) {
          showToast('Conversion failed. Try a different format.', 'error');
          return;
        }
        convertedBlob = blob;
        origSizeEl.textContent = formatBytes(currentFile.size) + ` (${currentFile.type.split('/')[1].toUpperCase()})`;
        newSizeEl.textContent = formatBytes(blob.size) + ` (${convertedExt.toUpperCase()})`;
        comparison.style.display = 'flex';
        downloadBtn.style.display = 'inline-flex';
        showToast('Image converted successfully!');
      }, mimeType, blobQuality);
    });

    downloadBtn.addEventListener('click', () => {
      if (!convertedBlob) return;
      const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
      downloadBlob(convertedBlob, `${baseName}-converted.${convertedExt}`);
    });
  })();

  // ========================
  // TOOL 4: IMAGE COMPRESSOR (with target file size mode)
  // ========================

  (() => {
    const fileInput = document.getElementById('compressor-file');
    const controls = document.getElementById('compressor-controls');
    const preview = document.getElementById('compressor-preview');
    const originalInfo = document.getElementById('compressor-original-info');
    const qualitySlider = document.getElementById('compressor-quality');
    const qualityVal = document.getElementById('compressor-quality-val');
    const compressBtn = document.getElementById('compressor-compress-btn');
    const comparison = document.getElementById('compressor-comparison');
    const origSizeEl = document.getElementById('compressor-orig-size');
    const newSizeEl = document.getElementById('compressor-new-size');
    const reductionEl = document.getElementById('compressor-reduction');
    const downloadBtn = document.getElementById('compressor-download');
    const canvas = document.getElementById('compressor-canvas');
    const modeQuality = document.getElementById('compressor-mode-quality');
    const modeTarget = document.getElementById('compressor-mode-target');
    const qualityRow = document.getElementById('compressor-quality-row');
    const targetRow = document.getElementById('compressor-target-row');
    const targetSizeInput = document.getElementById('compressor-target-size');

    let currentFile = null;
    let compressedBlob = null;
    let isTargetMode = false;

    setupDropZone('compressor-drop', 'compressor-file');

    // Mode toggle
    modeQuality.addEventListener('click', () => {
      isTargetMode = false;
      modeQuality.classList.add('active');
      modeTarget.classList.remove('active');
      qualityRow.style.display = 'flex';
      targetRow.style.display = 'none';
    });

    modeTarget.addEventListener('click', () => {
      isTargetMode = true;
      modeTarget.classList.add('active');
      modeQuality.classList.remove('active');
      qualityRow.style.display = 'none';
      targetRow.style.display = 'flex';
    });

    qualitySlider.addEventListener('input', () => {
      qualityVal.textContent = qualitySlider.value;
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      currentFile = file;

      const dataURL = await readFileAsDataURL(file);
      preview.src = dataURL;
      originalInfo.textContent = `Original: ${formatBytes(file.size)}`;

      controls.style.display = 'flex';
      comparison.style.display = 'none';
      downloadBtn.style.display = 'none';
      compressedBlob = null;
    });

    /**
     * Compress with binary search to find the quality that meets target size
     */
    function compressToTarget(img, targetKB) {
      return new Promise((resolve) => {
        const targetBytes = targetKB * 1024;
        let low = 0.01;
        let high = 1.0;
        let bestBlob = null;

        function tryQuality(quality) {
          return new Promise((res) => {
            canvas.toBlob(blob => {
              res(blob);
            }, 'image/jpeg', quality);
          });
        }

        (async function search() {
          // Binary search for the right quality
          for (let i = 0; i < 10; i++) {
            const mid = (low + high) / 2;
            const blob = await tryQuality(mid);
            if (blob && blob.size <= targetBytes) {
              bestBlob = blob;
              low = mid;
            } else {
              high = mid;
            }
          }

          // If we couldn't get under target with low quality, try minimum
          if (!bestBlob) {
            bestBlob = await tryQuality(0.01);
          }

          resolve(bestBlob);
        })();
      });
    }

    compressBtn.addEventListener('click', async () => {
      if (!currentFile) return;

      const dataURL = await readFileAsDataURL(currentFile);
      const img = await loadImage(dataURL);

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      if (isTargetMode) {
        // Target size mode
        const targetKB = parseInt(targetSizeInput.value, 10);
        if (isNaN(targetKB) || targetKB < 1) {
          showToast('Please enter a valid target size.', 'error');
          return;
        }
        showToast('Compressing to target size...');
        const blob = await compressToTarget(img, targetKB);
        if (!blob) {
          showToast('Compression failed.', 'error');
          return;
        }
        compressedBlob = blob;

        const origSize = currentFile.size;
        const newSize = blob.size;
        const reduction = ((1 - newSize / origSize) * 100).toFixed(1);

        origSizeEl.textContent = formatBytes(origSize);
        newSizeEl.textContent = formatBytes(newSize);
        reductionEl.textContent = reduction + '% smaller';

        comparison.style.display = 'flex';
        downloadBtn.style.display = 'inline-flex';
        showToast(`Compressed to ${formatBytes(newSize)}!`);
      } else {
        // Quality mode (original behavior)
        const quality = parseInt(qualitySlider.value, 10) / 100;

        canvas.toBlob(blob => {
          if (!blob) {
            showToast('Compression failed.', 'error');
            return;
          }
          compressedBlob = blob;

          const origSize = currentFile.size;
          const newSize = blob.size;
          const reduction = ((1 - newSize / origSize) * 100).toFixed(1);

          origSizeEl.textContent = formatBytes(origSize);
          newSizeEl.textContent = formatBytes(newSize);
          reductionEl.textContent = reduction + '% smaller';

          comparison.style.display = 'flex';
          downloadBtn.style.display = 'inline-flex';
          showToast('Image compressed successfully!');
        }, 'image/jpeg', quality);
      }
    });

    downloadBtn.addEventListener('click', () => {
      if (!compressedBlob) return;
      const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
      downloadBlob(compressedBlob, `${baseName}-compressed.jpg`);
    });
  })();

  // ========================
  // TOOL 5: FAVICON GENERATOR (with 48x48 and ICO info)
  // ========================

  (() => {
    const fileInput = document.getElementById('favicon-file');
    const results = document.getElementById('favicon-results');
    const faviconInfo = document.getElementById('favicon-info');
    const canvas16 = document.getElementById('favicon-canvas-16');
    const canvas32 = document.getElementById('favicon-canvas-32');
    const canvas48 = document.getElementById('favicon-canvas-48');
    const canvas64 = document.getElementById('favicon-canvas-64');
    const dl16 = document.getElementById('favicon-dl-16');
    const dl32 = document.getElementById('favicon-dl-32');
    const dl48 = document.getElementById('favicon-dl-48');
    const dl64 = document.getElementById('favicon-dl-64');

    let currentFile = null;

    setupDropZone('favicon-drop', 'favicon-file');

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      currentFile = file;

      const dataURL = await readFileAsDataURL(file);
      const img = await loadImage(dataURL);

      // Center-crop to square
      const size = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - size) / 2;
      const sy = (img.naturalHeight - size) / 2;

      // Draw to each favicon canvas
      [canvas16, canvas32, canvas48, canvas64].forEach(c => {
        const dim = parseInt(c.id.split('-').pop(), 10);
        c.width = dim;
        c.height = dim;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, size, size, 0, 0, dim, dim);
      });

      results.style.display = 'grid';
      faviconInfo.style.display = 'block';
      showToast('Favicons generated!');
    });

    // Download helpers
    function downloadFavicon(canvasEl, suffix) {
      canvasEl.toBlob(blob => {
        const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'favicon';
        downloadBlob(blob, `${baseName}-${suffix}.png`);
      }, 'image/png');
    }

    dl16.addEventListener('click', () => downloadFavicon(canvas16, '16x16'));
    dl32.addEventListener('click', () => downloadFavicon(canvas32, '32x32'));
    dl48.addEventListener('click', () => downloadFavicon(canvas48, '48x48'));
    dl64.addEventListener('click', () => downloadFavicon(canvas64, '64x64'));
  })();

  // ========================
  // TOOL 6: MEME GENERATOR (with font outline toggle & more fonts)
  // ========================

  (() => {
    const fileInput = document.getElementById('meme-file');
    const controls = document.getElementById('meme-controls');
    const canvas = document.getElementById('meme-canvas');
    const topTextInput = document.getElementById('meme-top-text');
    const bottomTextInput = document.getElementById('meme-bottom-text');
    const fontSelect = document.getElementById('meme-font');
    const fontSizeSlider = document.getElementById('meme-fontsize');
    const fontSizeVal = document.getElementById('meme-fontsize-val');
    const colorInput = document.getElementById('meme-color');
    const outlineCheckbox = document.getElementById('meme-outline');
    const generateBtn = document.getElementById('meme-generate-btn');
    const downloadBtn = document.getElementById('meme-download');

    let currentFile = null;
    let loadedImage = null;
    let memeBlob = null;

    setupDropZone('meme-drop', 'meme-file');

    fontSizeSlider.addEventListener('input', () => {
      fontSizeVal.textContent = fontSizeSlider.value;
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      currentFile = file;

      const dataURL = await readFileAsDataURL(file);
      loadedImage = await loadImage(dataURL);

      controls.style.display = 'flex';
      downloadBtn.style.display = 'none';
      memeBlob = null;

      // Initial draw
      drawMeme();
    });

    // Live preview on text/style changes
    [topTextInput, bottomTextInput].forEach(input => {
      input.addEventListener('input', drawMeme);
    });
    [fontSizeSlider, colorInput].forEach(input => {
      input.addEventListener('input', drawMeme);
    });
    fontSelect.addEventListener('change', drawMeme);
    outlineCheckbox.addEventListener('change', drawMeme);

    /**
     * Draw the meme on the canvas with top/bottom text
     */
    function drawMeme() {
      if (!loadedImage) return;

      const img = loadedImage;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      // Draw the base image
      ctx.drawImage(img, 0, 0);

      // Text settings
      const fontSize = parseInt(fontSizeSlider.value, 10);
      const fillColor = colorInput.value;
      const fontFamily = fontSelect.value;
      const useOutline = outlineCheckbox.checked;

      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = fillColor;

      if (useOutline) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, fontSize / 16);
        ctx.lineJoin = 'round';
      }

      const topText = topTextInput.value.toUpperCase();
      const bottomText = bottomTextInput.value.toUpperCase();
      const centerX = canvas.width / 2;
      const margin = fontSize * 0.3;

      // Draw top text
      if (topText) {
        const topY = margin;
        if (useOutline) ctx.strokeText(topText, centerX, topY);
        ctx.fillText(topText, centerX, topY);
      }

      // Draw bottom text
      if (bottomText) {
        ctx.textBaseline = 'bottom';
        const bottomY = canvas.height - margin;
        if (useOutline) ctx.strokeText(bottomText, centerX, bottomY);
        ctx.fillText(bottomText, centerX, bottomY);
      }
    }

    generateBtn.addEventListener('click', () => {
      if (!loadedImage) {
        showToast('Please upload an image first.', 'error');
        return;
      }
      drawMeme();

      canvas.toBlob(blob => {
        memeBlob = blob;
        downloadBtn.style.display = 'inline-flex';
        showToast('Meme generated!');
      }, 'image/png');
    });

    downloadBtn.addEventListener('click', () => {
      if (!memeBlob) return;
      const baseName = currentFile ? currentFile.name.replace(/\.[^/.]+$/, '') : 'meme';
      downloadBlob(memeBlob, `${baseName}-meme.png`);
    });
  })();

  // ========================
  // TOOL 7: COLOR PALETTE EXTRACTOR (with copy all as CSS variables)
  // ========================

  (() => {
    const fileInput = document.getElementById('palette-file');
    const preview = document.getElementById('palette-preview');
    const img = document.getElementById('palette-img');
    const grid = document.getElementById('palette-grid');
    const canvas = document.getElementById('palette-canvas');
    const copyAllBtn = document.getElementById('palette-copy-all');

    let extractedColors = [];

    setupDropZone('palette-drop', 'palette-file');

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      const dataURL = await readFileAsDataURL(file);
      img.src = dataURL;
      preview.style.display = 'block';

      const imageObj = await loadImage(dataURL);

      // Scale down to max 100px for performance
      const maxDim = 100;
      let w = imageObj.naturalWidth;
      let h = imageObj.naturalHeight;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageObj, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const pixels = imageData.data;

      // Extract dominant colors using median cut algorithm
      const numColors = 8;
      const colors = medianCut(pixels, numColors);

      // Store for copy all
      extractedColors = colors.map(c => rgbToHex(c[0], c[1], c[2]));

      // Display palette
      grid.innerHTML = '';
      grid.style.display = 'grid';
      copyAllBtn.style.display = 'inline-flex';

      colors.forEach((color, idx) => {
        const hex = rgbToHex(color[0], color[1], color[2]);

        const swatch = document.createElement('div');
        swatch.className = 'palette-swatch';

        const colorDiv = document.createElement('div');
        colorDiv.className = 'swatch-color';
        colorDiv.style.backgroundColor = hex;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'swatch-info';

        const hexSpan = document.createElement('span');
        hexSpan.className = 'swatch-hex';
        hexSpan.textContent = hex;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'swatch-copy';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(hex).then(() => {
            showToast(`Copied ${hex} to clipboard!`);
          }).catch(() => {
            showToast('Failed to copy.', 'error');
          });
        });

        infoDiv.appendChild(hexSpan);
        infoDiv.appendChild(copyBtn);
        swatch.appendChild(colorDiv);
        swatch.appendChild(infoDiv);
        grid.appendChild(swatch);
      });

      showToast('Color palette extracted!');
    });

    // Copy all colors as CSS variables
    copyAllBtn.addEventListener('click', () => {
      if (extractedColors.length === 0) return;

      const cssVars = ':root {\n' + extractedColors.map((hex, i) => {
        return `  --color-${i + 1}: ${hex};`;
      }).join('\n') + '\n}';

      navigator.clipboard.writeText(cssVars).then(() => {
        showToast('CSS variables copied to clipboard!');
      }).catch(() => {
        showToast('Failed to copy.', 'error');
      });
    });

    /**
     * Convert RGB values to hex string
     */
    function rgbToHex(r, g, b) {
      return '#' + [r, g, b].map(v => {
        const hex = Math.round(v).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }

    /**
     * Median Cut color quantization algorithm
     * Extracts `numColors` dominant colors from pixel data
     */
    function medianCut(pixels, numColors) {
      // Build array of [r, g, b] from pixel data (skip alpha)
      const colorList = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        // Skip fully transparent pixels
        if (a < 128) continue;
        colorList.push([r, g, b]);
      }

      if (colorList.length === 0) return [[0, 0, 0]];

      // Start with one bucket containing all colors
      let buckets = [colorList];

      // Split until we reach numColors buckets
      while (buckets.length < numColors) {
        // Find the bucket with the largest range
        let maxRange = -1;
        let maxIdx = 0;

        buckets.forEach((bucket, idx) => {
          const range = getBucketRange(bucket);
          if (range.maxRange > maxRange) {
            maxRange = range.maxRange;
            maxIdx = idx;
          }
        });

        const bucketToSplit = buckets[maxIdx];
        if (bucketToSplit.length < 2) break;

        const range = getBucketRange(bucketToSplit);
        const channel = range.channel; // 0=R, 1=G, 2=B

        // Sort by the channel with the greatest range
        bucketToSplit.sort((a, b) => a[channel] - b[channel]);

        // Split at median
        const mid = Math.floor(bucketToSplit.length / 2);
        const left = bucketToSplit.slice(0, mid);
        const right = bucketToSplit.slice(mid);

        // Replace the bucket with the two halves
        buckets.splice(maxIdx, 1, left, right);
      }

      // Average each bucket to get the representative color
      return buckets.map(bucket => {
        const avg = [0, 0, 0];
        bucket.forEach(color => {
          avg[0] += color[0];
          avg[1] += color[1];
          avg[2] += color[2];
        });
        return [
          avg[0] / bucket.length,
          avg[1] / bucket.length,
          avg[2] / bucket.length
        ];
      });
    }

    /**
     * Get the range info for a bucket of colors
     * Returns the max range value and which channel has it
     */
    function getBucketRange(bucket) {
      let minR = 255, maxR = 0;
      let minG = 255, maxG = 0;
      let minB = 255, maxB = 0;

      bucket.forEach(c => {
        if (c[0] < minR) minR = c[0]; if (c[0] > maxR) maxR = c[0];
        if (c[1] < minG) minG = c[1]; if (c[1] > maxG) maxG = c[1];
        if (c[2] < minB) minB = c[2]; if (c[2] > maxB) maxB = c[2];
      });

      const rangeR = maxR - minR;
      const rangeG = maxG - minG;
      const rangeB = maxB - minB;

      let maxRange = rangeR;
      let channel = 0;
      if (rangeG > maxRange) { maxRange = rangeG; channel = 1; }
      if (rangeB > maxRange) { maxRange = rangeB; channel = 2; }

      return { maxRange, channel };
    }
  })();

  // ========================
  // TOOL 8: EXIF VIEWER (improved presentation)
  // ========================

  (() => {
    const fileInput = document.getElementById('exif-file');
    const preview = document.getElementById('exif-preview');
    const img = document.getElementById('exif-img');
    const tableWrap = document.getElementById('exif-table-wrap');
    const tbody = document.getElementById('exif-tbody');

    setupDropZone('exif-drop', 'exif-file');

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      const dataURL = await readFileAsDataURL(file);
      img.src = dataURL;
      preview.style.display = 'block';

      // Clear previous data
      tbody.innerHTML = '';

      // Read EXIF data using exif-js
      try {
        const exifData = await readExifData(file);

        if (exifData && Object.keys(exifData).length > 0) {
          // Display EXIF tags
          Object.entries(exifData).forEach(([tag, value]) => {
            addRow(tag, formatExifValue(value));
          });
        } else {
          // No EXIF data found; show file properties fallback
          addFileProperties(file);
        }
      } catch (err) {
        // EXIF reading failed; show file properties fallback
        addFileProperties(file);
      }

      tableWrap.style.display = 'block';
      showToast('Metadata loaded!');
    });

    /**
     * Read EXIF data from a file using exif-js
     */
    function readExifData(file) {
      return new Promise((resolve) => {
        if (typeof EXIF === 'undefined') {
          resolve(null);
          return;
        }

        EXIF.getData(file, function () {
          const allMeta = EXIF.getAllTags(this);
          resolve(allMeta);
        });
      });
    }

    /**
     * Format EXIF value for display
     */
    function formatExifValue(value) {
      if (value === null || value === undefined) return 'N/A';
      if (value instanceof Array) return value.join(', ');
      if (typeof value === 'object' && value.toString) return value.toString();
      return String(value);
    }

    /**
     * Add standard File object properties as fallback
     */
    function addFileProperties(file) {
      const fallbackRow = document.createElement('tr');
      const td1 = document.createElement('td');
      const td2 = document.createElement('td');
      td1.textContent = 'Note';
      td2.textContent = 'No EXIF data found. Showing file properties instead.';
      td2.style.color = 'var(--text-secondary)';
      td2.style.fontStyle = 'italic';
      fallbackRow.appendChild(td1);
      fallbackRow.appendChild(td2);
      tbody.appendChild(fallbackRow);

      addRow('File Name', file.name);
      addRow('File Size', formatBytes(file.size));
      addRow('File Type', file.type || 'Unknown');
      addRow('Last Modified', new Date(file.lastModified).toLocaleString());
    }

    /**
     * Add a row to the EXIF table
     */
    function addRow(tag, value) {
      const tr = document.createElement('tr');
      const tdTag = document.createElement('td');
      const tdVal = document.createElement('td');
      tdTag.textContent = tag;
      tdVal.textContent = value;
      tr.appendChild(tdTag);
      tr.appendChild(tdVal);
      tbody.appendChild(tr);
    }
  })();

}); // end DOMContentLoaded
