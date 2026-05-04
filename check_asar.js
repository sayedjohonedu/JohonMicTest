const fs = require('fs');

const asarPath = 'c:\\Users\\Sayed Johon\\JohonMicTest\\dist\\win-unpacked\\resources\\app.asar';

function getSizes(node) {
  let size = 0;
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) {
      size += getSizes(child);
    }
  } else if (node.size) {
    size += node.size;
  }
  return size;
}

const fd = fs.openSync(asarPath, 'r');
const sizeBuf = Buffer.alloc(8);
fs.readSync(fd, sizeBuf, 0, 8, null);
const headerSize = sizeBuf.readUInt32LE(4);
const headerBuf = Buffer.alloc(headerSize);
fs.readSync(fd, headerBuf, 0, headerSize, 8);
fs.closeSync(fd);

// Parse the header
// It is preceded by 4 bytes of length, another 4 bytes of size, another 4 bytes of something? 
// The actual format:
// 4 bytes: uint32 size of header (which is actually 4 + size of json)
// Then uint32 size of following bytes
// Let's just find the first '{' and parse till the end
let headerString = headerBuf.toString('utf8');
const start = headerString.indexOf('{');
if (start !== -1) {
    headerString = headerString.substring(start);
    headerString = headerString.replace(/\0+$/, '');
    const json = JSON.parse(headerString);
    const root = json.files;
    let items = [];
    for (const [name, node] of Object.entries(root)) {
        const size = getSizes(node);
        items.push({name, size: size / 1024 / 1024});
    }
    items.sort((a,b) => b.size - a.size);
    for (const item of items) {
        console.log(`${item.name}: ${item.size.toFixed(2)} MB`);
    }
    
    // if node_modules is the biggest, what's inside it?
    if (root['node_modules'] && root['node_modules'].files) {
        console.log('\nInside node_modules:');
        let nmItems = [];
        for (const [name, node] of Object.entries(root['node_modules'].files)) {
            nmItems.push({name, size: getSizes(node) / 1024 / 1024});
        }
        nmItems.sort((a,b) => b.size - a.size).slice(0, 15).forEach(item => {
            console.log(`  ${item.name}: ${item.size.toFixed(2)} MB`);
        });
    }
}
