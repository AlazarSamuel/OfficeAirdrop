const fs = require('fs');
const path = require('path');

const layersDir = path.join(__dirname, '../scratch_ico_layers');
const sizes = [16, 24, 32, 48, 64, 128, 256];

const pngBuffers = sizes.map(s => {
  const filePath = path.join(layersDir, `icon_${s}.png`);
  return {
    size: s,
    buffer: fs.readFileSync(filePath)
  };
});

// Calculate header and entries offset
const ICON_DIR_SIZE = 6;
const ICON_DIRENTRY_SIZE = 16;
const totalHeaderSize = ICON_DIR_SIZE + (ICON_DIRENTRY_SIZE * pngBuffers.length);

let currentOffset = totalHeaderSize;
const entries = [];

for (const item of pngBuffers) {
  const entry = Buffer.alloc(16);
  // Width (0 means 256)
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 0);
  // Height (0 means 256)
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 1);
  // Color palette (0)
  entry.writeUInt8(0, 2);
  // Reserved (0)
  entry.writeUInt8(0, 3);
  // Color planes (1)
  entry.writeUInt16LE(1, 4);
  // Bits per pixel (32)
  entry.writeUInt16LE(32, 6);
  // Image size in bytes
  entry.writeUInt32LE(item.buffer.length, 8);
  // Offset of image data
  entry.writeUInt32LE(currentOffset, 12);
  
  entries.push(entry);
  currentOffset += item.buffer.length;
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type 1 = ICO
header.writeUInt16LE(pngBuffers.length, 4); // Number of images

const icoBuffer = Buffer.concat([
  header,
  ...entries,
  ...pngBuffers.map(p => p.buffer)
]);

const outPaths = [
  path.join(__dirname, '../build/icon.ico'),
  path.join(__dirname, '../public/icon.ico'),
  path.join(__dirname, '../dist/icon.ico')
];

for (const out of outPaths) {
  const dir = path.dirname(out);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, icoBuffer);
  console.log(`Saved multi-layer ICO: ${out} (${icoBuffer.length} bytes)`);
}
