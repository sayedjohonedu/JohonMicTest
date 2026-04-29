document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

// Update Dropzone Label
function updateDropzone(inputId, dropzoneId) {
    const input = document.getElementById(inputId);
    input.addEventListener('change', (e) => {
        if(e.target.files[0]) {
            document.getElementById(dropzoneId).querySelector('.dropzone-label').innerText = e.target.files[0].name;
        }
    });
}
['resize', 'crop', 'convert', 'comp', 'fav', 'meme', 'pal', 'exif'].forEach(prefix => {
    updateDropzone(`${prefix}-file`, `${prefix}-dropzone`);
});

// Shared Image Loader
function loadImage(file, callback) {
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => callback(img, e.target.result);
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Resizer
const resizeFile = document.getElementById('resize-file');
const resizeW = document.getElementById('resize-w');
const resizeH = document.getElementById('resize-h');
const resizeBtn = document.getElementById('resize-btn');
let resizeImgObj = null;

resizeFile.addEventListener('change', e => {
    if(!e.target.files[0]) return;
    loadImage(e.target.files[0], img => {
        resizeImgObj = img;
        resizeW.value = img.width;
        resizeH.value = img.height;
    });
});

resizeBtn.addEventListener('click', () => {
    if(!resizeImgObj) return;
    const canvas = document.createElement('canvas');
    canvas.width = parseInt(resizeW.value) || resizeImgObj.width;
    canvas.height = parseInt(resizeH.value) || resizeImgObj.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(resizeImgObj, 0, 0, canvas.width, canvas.height);
    const link = document.createElement('a');
    link.download = 'resized.png';
    link.href = canvas.toDataURL();
    link.click();
});

// Cropper
let cropper = null;
const cropFile = document.getElementById('crop-file');
const cropImage = document.getElementById('crop-image');
const cropBtn = document.getElementById('crop-btn');

cropFile.addEventListener('change', e => {
    if(!e.target.files[0]) return;
    loadImage(e.target.files[0], (img, src) => {
        cropImage.src = src;
        cropImage.style.display = 'block';
        if(cropper) cropper.destroy();
        cropper = new Cropper(cropImage, { aspectRatio: NaN, viewMode: 1 });
    });
});

cropBtn.addEventListener('click', () => {
    if(!cropper) return;
    const canvas = cropper.getCroppedCanvas();
    const link = document.createElement('a');
    link.download = 'cropped.png';
    link.href = canvas.toDataURL();
    link.click();
});

// Format Converter
const convertFile = document.getElementById('convert-file');
const convertFormat = document.getElementById('convert-format');
const convertBtn = document.getElementById('convert-btn');
let convertImgObj = null;

convertFile.addEventListener('change', e => {
    if(e.target.files[0]) loadImage(e.target.files[0], img => convertImgObj = img);
});

convertBtn.addEventListener('click', () => {
    if(!convertImgObj) return;
    const canvas = document.createElement('canvas');
    canvas.width = convertImgObj.width;
    canvas.height = convertImgObj.height;
    canvas.getContext('2d').drawImage(convertImgObj, 0, 0);
    const format = convertFormat.value;
    const ext = format.split('/')[1];
    const link = document.createElement('a');
    link.download = `converted.${ext}`;
    link.href = canvas.toDataURL(format);
    link.click();
});

// Compressor
const compFile = document.getElementById('comp-file');
const compQual = document.getElementById('comp-qual');
const compBtn = document.getElementById('comp-btn');
let compImgObj = null;

compFile.addEventListener('change', e => {
    if(e.target.files[0]) loadImage(e.target.files[0], img => compImgObj = img);
});
compBtn.addEventListener('click', () => {
    if(!compImgObj) return;
    const canvas = document.createElement('canvas');
    canvas.width = compImgObj.width;
    canvas.height = compImgObj.height;
    canvas.getContext('2d').drawImage(compImgObj, 0, 0);
    const link = document.createElement('a');
    link.download = 'compressed.jpeg';
    link.href = canvas.toDataURL('image/jpeg', parseFloat(compQual.value));
    link.click();
});

// Favicon Generator
const favFile = document.getElementById('fav-file');
const favBtn = document.getElementById('fav-btn');
let favImgObj = null;

favFile.addEventListener('change', e => {
    if(e.target.files[0]) loadImage(e.target.files[0], img => favImgObj = img);
});
favBtn.addEventListener('click', () => {
    if(!favImgObj) return;
    const sizes = [16, 32, 64];
    sizes.forEach(size => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas.getContext('2d').drawImage(favImgObj, 0, 0, size, size);
        const link = document.createElement('a');
        link.download = `favicon-${size}x${size}.png`;
        link.href = canvas.toDataURL();
        link.click();
    });
});

// Meme Generator
const memeFile = document.getElementById('meme-file');
const memeTop = document.getElementById('meme-top');
const memeBot = document.getElementById('meme-bot');
const memeCanvas = document.getElementById('meme-canvas');
const memeBtn = document.getElementById('meme-btn');
const mCtx = memeCanvas.getContext('2d');
let memeImgObj = null;

function drawMeme() {
    if(!memeImgObj) return;
    memeCanvas.width = memeImgObj.width;
    memeCanvas.height = memeImgObj.height;
    mCtx.drawImage(memeImgObj, 0, 0);
    
    mCtx.fillStyle = 'white';
    mCtx.strokeStyle = 'black';
    mCtx.lineWidth = Math.max(2, memeCanvas.width * 0.005);
    mCtx.textAlign = 'center';
    
    let fontSize = memeCanvas.width * 0.1;
    mCtx.font = `800 ${fontSize}px Impact, sans-serif`;
    
    if(memeTop.value) {
        mCtx.strokeText(memeTop.value.toUpperCase(), memeCanvas.width/2, fontSize + 10);
        mCtx.fillText(memeTop.value.toUpperCase(), memeCanvas.width/2, fontSize + 10);
    }
    if(memeBot.value) {
        mCtx.strokeText(memeBot.value.toUpperCase(), memeCanvas.width/2, memeCanvas.height - 20);
        mCtx.fillText(memeBot.value.toUpperCase(), memeCanvas.width/2, memeCanvas.height - 20);
    }
}

memeFile.addEventListener('change', e => {
    if(e.target.files[0]) loadImage(e.target.files[0], img => {
        memeImgObj = img;
        drawMeme();
    });
});
memeTop.addEventListener('input', drawMeme);
memeBot.addEventListener('input', drawMeme);

memeBtn.addEventListener('click', () => {
    if(!memeImgObj) return;
    const link = document.createElement('a');
    link.download = 'meme.png';
    link.href = memeCanvas.toDataURL();
    link.click();
});

// Palette Extractor
const palFile = document.getElementById('pal-file');
const palColors = document.getElementById('pal-colors');

function getLuminance(r, g, b) {
    let rs = r / 255, gs = g / 255, bs = b / 255;
    rs = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
    gs = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
    bs = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

palFile.addEventListener('change', e => {
    if(!e.target.files[0]) return;
    loadImage(e.target.files[0], img => {
        const canvas = document.createElement('canvas');
        canvas.width = 50; canvas.height = 50;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 50, 50);
        const data = ctx.getImageData(0,0,50,50).data;
        const colors = [];
        const step = Math.max(4, Math.floor(data.length / 5 / 4) * 4);
        for(let i=0; i<data.length; i+=step) {
            colors.push({r: data[i], g: data[i+1], b: data[i+2]});
            if(colors.length === 5) break;
        }
        palColors.innerHTML = '';
        colors.forEach(c => {
            const hex = '#' + ((1<<24) + (c.r<<16) + (c.g<<8) + c.b).toString(16).slice(1);
            const d = document.createElement('div');
            d.className = 'palette-color';
            d.style.backgroundColor = hex;
            d.style.color = getLuminance(c.r, c.g, c.b) > 0.5 ? '#000' : '#fff';
            d.style.textShadow = getLuminance(c.r, c.g, c.b) > 0.5 ? 'none' : '0 1px 3px rgba(0,0,0,0.3)';
            
            d.innerHTML = `<span>${hex.toUpperCase()}</span> <span>Copy</span>`;
            d.addEventListener('click', () => {
                navigator.clipboard.writeText(hex);
                const orig = d.innerHTML;
                d.innerHTML = `<span>${hex.toUpperCase()}</span> <span>Copied!</span>`;
                setTimeout(() => d.innerHTML = orig, 1000);
            });
            palColors.appendChild(d);
        });
    });
});

// EXIF Viewer
const exifFile = document.getElementById('exif-file');
const exifData = document.getElementById('exif-data');

exifFile.addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file) return;
    EXIF.getData(file, function() {
        const allTags = EXIF.getAllTags(this);
        let out = '';
        for(let tag in allTags) {
            if(allTags.hasOwnProperty(tag) && tag !== 'MakerNote' && tag !== 'UserComment' && tag !== 'thumbnail') {
                out += `${tag}: ${allTags[tag]}\n`;
            }
        }
        exifData.value = out || 'No EXIF data found in this image.';
    });
});