import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = await readFile(new URL('../public/icon.svg', import.meta.url));
const targets = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['favicon.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable.png', 512],
];

for (const [name, size] of targets) {
  await sharp(source, { density: 768 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, palette: false })
    .toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
}
