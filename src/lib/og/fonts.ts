/**
 * Work Sans fonts for satori. Satori reads ttf/otf/woff (not woff2), so we use
 * the .woff files shipped by @fontsource/work-sans. Resolved via package.json +
 * path join because the package restricts subpath exports. Loaded once at
 * module init.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Font } from 'satori';

const require = createRequire(import.meta.url);
const fontDir = join(dirname(require.resolve('@fontsource/work-sans/package.json')), 'files');

function load(file: string): Buffer {
  return readFileSync(join(fontDir, file));
}

export const fonts: Font[] = [
  { name: 'Work Sans', data: load('work-sans-latin-400-normal.woff'), weight: 400, style: 'normal' },
  { name: 'Work Sans', data: load('work-sans-latin-600-normal.woff'), weight: 600, style: 'normal' },
];
