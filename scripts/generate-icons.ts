/**
 * Regenerates every icon in public/ from a single square source photo.
 *
 * Usage: npx tsx scripts/generate-icons.ts [source]
 * Default source: src/assets/me.jpg
 *
 * Outputs:
 *   public/barryfrost.jpg      192x192  u-photo / feed avatar
 *   public/apple-touch-icon.png 180x180 iOS home screen
 *   public/icon-192.png        192x192  Android / PWA
 *   public/icon-512.png        512x512  Android PWA splash
 *   public/favicon.svg          32x32   modern browsers (PNG in an SVG wrapper)
 *   public/favicon.ico          32x32   legacy browsers
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const source = fileURLToPath(new URL(process.argv[2] ?? 'src/assets/me.jpg', root));
const out = (name: string) => fileURLToPath(new URL(`public/${name}`, root));

const png = (size: number) =>
  sharp(source)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

/** Packs PNG buffers into an ICO container. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const { width, height } = await sharp(source).metadata();
if (width !== height) {
  console.warn(`Source is ${width}x${height}, not square — icons will be centre-cropped.`);
}

await sharp(source)
  .resize(192, 192, { fit: 'cover' })
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile(out('barryfrost.jpg'));

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
] as const) {
  await writeFile(out(name), await png(size));
}

const favicon32 = await png(32);
await writeFile(
  out('favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n` +
    `  <image href="data:image/png;base64,${favicon32.toString('base64')}" width="32" height="32"/>\n` +
    `</svg>\n`,
);

// Single 32x32 entry to match the `sizes="32x32"` hint in BaseHead.astro.
await writeFile(out('favicon.ico'), ico([{ size: 32, data: favicon32 }]));

console.log(`Icons regenerated from ${source}`);
