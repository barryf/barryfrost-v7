/**
 * Satori VDOM builders for the 1200×630 social cards. Returns plain element
 * objects (no JSX). On-brand: white ground, near-black ink, gray detail, amber
 * accent, Work Sans. Every container is display:flex, as satori requires.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CARD_W = 1200;
export const CARD_H = 630;

const INK = '#111111';
const MUTED = '#6b7280';   // gray-500
const ACCENT = '#b45309';  // amber-700
const BG = '#ffffff';
const PAD = 72;

const avatarDataUri = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'public/icon-192.png'),
).toString('base64')}`;

type Style = Record<string, string | number>;
type Node = { type: string; props: { style?: Style; children?: unknown } };

function el(type: string, style: Style, children?: unknown): Node {
  return { type, props: { style, children } };
}

function img(src: string, style: Style): Node {
  return { type: 'img', props: { src, style } } as unknown as Node;
}

const WORDMARK = 'barryfrost.com';

/** Shared frame: white ground, amber top rule, flex column with padding. */
function frame(children: unknown[]): Node {
  return el(
    'div',
    {
      width: CARD_W,
      height: CARD_H,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: BG,
      borderTop: `12px solid ${ACCENT}`,
      padding: PAD,
      fontFamily: 'Work Sans',
    },
    children,
  );
}

function label(text: string): Node {
  return el(
    'div',
    { display: 'flex', fontSize: 28, fontWeight: 600, letterSpacing: 4, textTransform: 'uppercase', color: ACCENT },
    text,
  );
}

function footer(right?: string): Node {
  return el(
    'div',
    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 30, color: MUTED },
    [
      el('div', { display: 'flex', fontWeight: 600, color: INK }, WORDMARK),
      right ? el('div', { display: 'flex' }, right) : el('div', { display: 'flex' }, ''),
    ],
  );
}

export function weeknoteCard({ emoji, title, date }: { emoji?: string; title: string; date: string }): Node {
  return frame([
    label('Weeknotes'),
    el('div', { display: 'flex', alignItems: 'center', gap: 48 }, [
      emoji
        ? el('div', { display: 'flex', fontSize: 200, lineHeight: 1 }, emoji)
        : el('div', { display: 'flex' }, ''),
      el(
        'div',
        { display: 'flex', flexDirection: 'column', flex: 1, fontSize: 68, fontWeight: 600, color: INK, lineHeight: 1.15 },
        title,
      ),
    ]),
    footer(date),
  ]);
}

export function articleCard({ title, date, section = 'Article' }: { title: string; date: string; section?: string }): Node {
  return frame([
    label(section),
    el(
      'div',
      { display: 'flex', fontSize: 76, fontWeight: 600, color: INK, lineHeight: 1.15 },
      title,
    ),
    footer(date),
  ]);
}

export function defaultCard({ tagline }: { tagline: string }): Node {
  return frame([
    el(
      'div',
      { display: 'flex', justifyContent: 'flex-end' },
      img(avatarDataUri, { width: 96, height: 96, borderRadius: 96 }),
    ),
    el('div', { display: 'flex', flexDirection: 'column' }, [
      el('div', { display: 'flex', fontSize: 88, fontWeight: 600, color: INK }, WORDMARK),
      el('div', { display: 'flex', fontSize: 38, color: MUTED, marginTop: 12 }, tagline),
    ]),
    footer(),
  ]);
}
