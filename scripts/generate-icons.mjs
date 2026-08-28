import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const faviconSource = await readFile(new URL('./favicon-source.svg', import.meta.url));
const appSource = await readFile(new URL('../public/icon.svg', import.meta.url));
const faviconTargets = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['favicon-64.png', 64],
  ['favicon.png', 64],
];
const appTargets = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable.png', 512],
];

const rendered = new Map();

for (const [name, size] of faviconTargets) {
  const png = await sharp(faviconSource, { density: 768 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();

  rendered.set(size, png);
  await writeFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)), png);
}

for (const [name, size] of appTargets) {
  await sharp(appSource, { density: 768 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, palette: false })
    .toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
}

// Keep the root fallback visually identical to the declared PNG favicons.
const icoSizes = [16, 32, 64];
const directoryBytes = 6 + (16 * icoSizes.length);
let imageOffset = directoryBytes;
const header = Buffer.alloc(directoryBytes);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // icon
header.writeUInt16LE(icoSizes.length, 4);

const images = icoSizes.map((size, index) => {
  const png = rendered.get(size);
  const entry = 6 + (index * 16);
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt8(0, entry + 2); // true colour
  header.writeUInt8(0, entry + 3); // reserved
  header.writeUInt16LE(1, entry + 4); // colour planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(imageOffset, entry + 12);
  imageOffset += png.length;
  return png;
});

await writeFile(
  fileURLToPath(new URL('../public/favicon.ico', import.meta.url)),
  Buffer.concat([header, ...images]),
);
