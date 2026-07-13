/**
 * Emoji → twemoji SVG for satori's loadAdditionalAsset hook.
 *
 * Satori calls this for each emoji grapheme; we resolve it to twemoji's
 * codepoint filename and return the SVG as a base64 data URI. Without this,
 * emoji render as blank boxes.
 *
 * Filename rule mirrors twemoji's own: strip the U+FE0F variation selector
 * unless the sequence contains a U+200D zero-width joiner (so ZWJ emoji like
 * 👩‍🔧 and flags like 🇫🇷 keep their full codepoints).
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const twemojiDir = dirname(require.resolve('@twemoji/svg/package.json'));

const U200D = '‍';
const UFE0F = /️/g;

function toCodePoints(emoji: string): string {
  const source = emoji.includes(U200D) ? emoji : emoji.replace(UFE0F, '');
  return Array.from(source)
    .map((ch) => ch.codePointAt(0)!.toString(16))
    .join('-');
}

const cache = new Map<string, string | undefined>();

export function emojiSvgDataUri(emoji: string): string | undefined {
  if (cache.has(emoji)) return cache.get(emoji);
  let uri: string | undefined;
  try {
    const svg = readFileSync(join(twemojiDir, `${toCodePoints(emoji)}.svg`), 'utf8');
    uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    uri = undefined;
  }
  cache.set(emoji, uri);
  return uri;
}
