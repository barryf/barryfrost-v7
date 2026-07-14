/**
 * Social metadata derived from a post's rendered body.
 *
 * The body is rendered to HTML with the Astro container (as feed-items.ts does) rather
 * than regexed from the Markdown source. That is what makes `.md` and `.mdx` behave
 * identically — both compile to plain `<img>` and prose — and it is the only way to learn
 * an image's final content-hashed `/_astro/…` URL, which the asset pipeline decides at
 * build time.
 */

import { render, type CollectionEntry } from 'astro:content';
import { getContainer } from '@/lib/container';

export interface SocialMeta {
  description?: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
}

type PostEntry = CollectionEntry<'articles'> | CollectionEntry<'weeknotes'>;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/** Block-level tags become a space so prose either side of them doesn't run together. */
const BLOCK_TAGS =
  /<\/?(?:p|div|h[1-6]|li|ul|ol|dl|dt|dd|blockquote|pre|figure|figcaption|table|thead|tbody|tr|td|th|section|article|aside|header|footer|hr|br)\b[^>]*>/gi;

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Rendered HTML → single-line plain text. Only ever applied to rendered post bodies. */
export function stripHtml(html: string): string {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(BLOCK_TAGS, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

/** Cut on a word boundary and add an ellipsis. */
export function truncate(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

/** Attribute values come out of the rendered HTML entity-escaped (`&` → `&#38;`). */
function attr(tag: string, name: string): string | undefined {
  const value = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1];
  return value === undefined ? undefined : decodeEntities(value);
}

export async function socialMeta(entry: PostEntry): Promise<SocialMeta> {
  const { Content } = await render(entry);
  const html = await (await getContainer()).renderToString(Content);

  const description = truncate(stripHtml(html));
  const img = html.match(/<img\b[^>]*>/i)?.[0];
  if (!img) return { description: description || undefined };

  const width = attr(img, 'width');
  const height = attr(img, 'height');

  return {
    description: description || undefined,
    image: attr(img, 'src'),
    imageAlt: attr(img, 'alt') || undefined,
    imageWidth: width ? Number(width) : undefined,
    imageHeight: height ? Number(height) : undefined,
  };
}
