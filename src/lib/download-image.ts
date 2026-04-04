import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import sharp from 'sharp';

export async function downloadImage(
  url: string,
  subdir: string,
  filename: string,
  width: number,
  height: number
): Promise<string | undefined> {
  const webFilename = filename.replace(/\.[^.]+$/, '.webp');
  const webPath = `/images/${subdir}/${webFilename}`;
  const filePath = join(process.cwd(), 'public', webPath);
  if (existsSync(filePath)) return webPath;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const buffer = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(width * 2, height * 2, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, buffer);
    return webPath;
  } catch {
    return undefined;
  }
}
