// Tab Navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

// QR Code Generator
let qrcode = null;
function generateQR() {
    const text = document.getElementById('qr-input').value;
    if (!text) return;
    
    document.getElementById('qr-result').innerHTML = ''; // Clear previous
    qrcode = new QRCode(document.getElementById('qr-result'), {
        text: text,
        width: 200,
        height: 200,
        colorDark : "#1d1d1f",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

// QR Code Scanner (File upload only)
const html5QrCode = new Html5Qrcode("qr-scan-res"); // though we don't render to this, we use the instance

document.getElementById('qr-file').addEventListener('change', e => {
    if (e.target.files.length == 0) return;
    const imageFile = e.target.files[0];
    
    html5QrCode.scanFile(imageFile, true)
    .then(decodedText => {
        document.getElementById('qr-scan-res').textContent = "Scanned: " + decodedText;
    })
    .catch(err => {
        document.getElementById('qr-scan-res').textContent = "Error scanning or no QR code found.";
    });
});

// Paste support for QR Code Scanner
document.addEventListener('paste', e => {
    if(!document.getElementById('qr-scan').classList.contains('active')) return;
    
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            const blob = item.getAsFile();
            html5QrCode.scanFile(blob, true)
            .then(decodedText => {
                document.getElementById('qr-scan-res').textContent = "Scanned: " + decodedText;
            })
            .catch(err => {
                document.getElementById('qr-scan-res').textContent = "Error scanning or no QR code found.";
            });
        }
    }
});

// Barcode Generator
function generateBarcode() {
    const text = document.getElementById('barcode-input').value;
    const format = document.getElementById('barcode-format').value;
    if (!text) return;

    try {
        JsBarcode("#barcode", text, {
            format: format,
            lineColor: "#1d1d1f",
            width: 2,
            height: 100,
            displayValue: true
        });
    } catch (e) {
        document.getElementById('barcode').innerHTML = ''; // clear
        const errorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        errorText.textContent = "Invalid data for format";
        errorText.setAttribute("x", "0");
        errorText.setAttribute("y", "20");
        errorText.setAttribute("fill", "red");
        document.getElementById('barcode').appendChild(errorText);
    }
}
