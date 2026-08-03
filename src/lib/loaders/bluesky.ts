import type { Loader } from 'astro/loaders';
import { fetchAllRecords, fetchWithRetry, rkeyFromUri, resolveHandle, DID, PDS_HOST } from '@/lib/pds';
import { pdsImage } from '@/lib/image-store';
import { mapLimit, RECORD_CONCURRENCY } from '@/lib/concurrency';

interface BlueskyImage {
  alt?: string;
  image?: { ref?: { $link?: string } };
}

interface BlueskyQuoteRef {
  uri?: string;
  cid?: string;
}

interface BlueskyExternal {
  uri?: string;
  title?: string;
  description?: string;
  thumb?: { ref?: { $link?: string } };
}

interface BlueskyEmbed {
  $type?: string;
  images?: BlueskyImage[];
  media?: { $type?: string; images?: BlueskyImage[]; external?: BlueskyExternal };
  record?: BlueskyQuoteRef | { record?: BlueskyQuoteRef };
  external?: BlueskyExternal;
}

const APPVIEW_HOST = 'public.api.bsky.app';

/**
 * Weeknotes syndicated to Bluesky duplicate what the site already publishes, so they are
 * dropped from the posts feed. The shape has drifted over time: titles picked up a leading
 * emoji, and the permalink moved out of the post text into a link card. Match either the
 * title or a weeknote URL, on both the current `/weeknotes/week-N` path and the older
 * `/YYYY/MM/week-N-slug` one.
 */
const WEEKNOTE_TITLE = /^\P{L}*Week \d+\b/iu;
const WEEKNOTE_URL = /barryfrost\.com\/(?:weeknotes\/|\d{4}\/\d{2}\/)week-\d+/i;

function isWeeknotePost(text: string, externalUri: string | undefined): boolean {
  return WEEKNOTE_TITLE.test(text)
    || WEEKNOTE_URL.test(text)
    || (externalUri !== undefined && WEEKNOTE_URL.test(externalUri));
}

interface AppViewPostView {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string };
  record: { text: string; createdAt: string; facets?: unknown[] };
}

async function fetchPostFromAppView(uri: string): Promise<AppViewPostView | null> {
  const params = new URLSearchParams({ uris: uri });
  const res = await fetchWithRetry(`https://${APPVIEW_HOST}/xrpc/app.bsky.feed.getPosts?${params}`);
  if (!res.ok) return null;
  const data = await res.json() as { posts: AppViewPostView[] };
  return data.posts[0] ?? null;
}

async function extractImages(embed: BlueskyEmbed | undefined): Promise<{ urls: string[]; largeUrls: string[]; alts: string[] }> {
  if (!embed) return { urls: [], largeUrls: [], alts: [] };
  const images = embed.$type === 'app.bsky.embed.images'
    ? embed.images
    : embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media?.$type === 'app.bsky.embed.images'
      ? embed.media.images
      : undefined;
  if (!images) return { urls: [], largeUrls: [], alts: [] };
  const results = await Promise.all(images.map(async (img) => {
    const link = img.image?.ref?.$link;
    if (!link) return null;
    const [url, largeUrl] = await Promise.all([
      pdsImage(link, { width: 192, height: 192, fit: 'contain' }),
      pdsImage(link, { width: 1600, fit: 'scale-down' }),
    ]);
    return { url, largeUrl, alt: img.alt ?? '' };
  }));
  const present = results.filter(r => r !== null);
  return {
    urls: present.map(r => r.url),
    largeUrls: present.map(r => r.largeUrl),
    alts: present.map(r => r.alt),
  };
}

async function extractExternal(embed: BlueskyEmbed | undefined): Promise<{ uri: string; title: string; description: string; thumbUrl: string | null } | null> {
  const external = embed?.$type === 'app.bsky.embed.external'
    ? embed.external
    : embed?.$type === 'app.bsky.embed.recordWithMedia' && embed.media?.$type === 'app.bsky.embed.external'
      ? embed.media.external
      : undefined;
  if (!external?.uri) return null;
  const link = external.thumb?.ref?.$link;
  const thumbUrl = link ? await pdsImage(link, { width: 600, fit: 'scale-down' }) : null;
  return {
    uri: external.uri,
    title: external.title ?? '',
    description: (external.description ?? '').replace(/^Alt:\s*/i, ''),
    thumbUrl,
  };
}

function extractQuoteRef(embed: BlueskyEmbed | undefined): { uri: string; cid: string } | null {
  if (!embed) return null;
  if (embed.$type === 'app.bsky.embed.record') {
    const ref = embed.record as BlueskyQuoteRef | undefined;
    if (ref?.uri && ref?.cid) return { uri: ref.uri, cid: ref.cid };
  }
  if (embed.$type === 'app.bsky.embed.recordWithMedia') {
    const outer = embed.record as { record?: BlueskyQuoteRef } | undefined;
    const ref = outer?.record;
    if (ref?.uri && ref?.cid) return { uri: ref.uri, cid: ref.cid };
  }
  return null;
}

async function hydrateQuotedPost(uri: string, cid: string): Promise<object> {
  const parts = uri.replace('at://', '').split('/');
  const authorDid = parts[0];
  const rkey = parts[2];

  const post = await fetchPostFromAppView(uri);
  if (!post) return { available: false, uri, authorDid, rkey };

  return {
    available: true,
    uri,
    cid,
    authorDid: post.author.did,
    authorHandle: post.author.handle,
    authorDisplayName: post.author.displayName,
    rkey: rkeyFromUri(post.uri),
    text: post.record.text,
    facets: post.record.facets ?? [],
    createdAt: post.record.createdAt,
  };
}

export function blueskyLoader(): Loader {
  return {
    name: 'bluesky-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching Bluesky posts');
      store.clear();

      const handleCache = new Map<string, string>();

      const records = [];
      for await (const record of fetchAllRecords('app.bsky.feed.post', DID, PDS_HOST)) {
        records.push(record);
      }

      await mapLimit(records, RECORD_CONCURRENCY, async (record) => {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);

        const embed = value.embed as BlueskyEmbed | undefined;
        const externalUri = embed?.external?.uri ?? embed?.media?.external?.uri;
        if (isWeeknotePost(value.text as string, externalUri)) return;

        let reply: { parentUri: string; parentHandle: string; parentRkey: string } | null = null;
        const replyRef = value.reply as { parent?: { uri?: string } } | undefined;
        if (replyRef?.parent?.uri) {
          const parentUri = replyRef.parent.uri;
          const parts = parentUri.replace('at://', '').split('/');
          const parentDid = parts[0];
          const parentRkey = parts[2];

          if (!handleCache.has(parentDid)) {
            handleCache.set(parentDid, await resolveHandle(parentDid));
          }

          reply = {
            parentUri,
            parentHandle: handleCache.get(parentDid)!,
            parentRkey,
          };
        }

        const { urls: imageUrls, largeUrls: imageLargeUrls, alts: imageAlts } = await extractImages(embed);

        const external = await extractExternal(embed);

        const quoteRef = extractQuoteRef(embed);
        const quotedPost = quoteRef
          ? await hydrateQuotedPost(quoteRef.uri, quoteRef.cid)
          : null;

        store.set({
          id: rkey,
          data: {
            text: value.text as string,
            createdAt: value.createdAt as string,
            facets: (value.facets as unknown[]) ?? [],
            reply,
            uri: record.uri,
            imageUrls,
            imageLargeUrls,
            imageAlts,
            external,
            quotedPost,
          },
          digest: generateDigest(record.cid),
        });
      });
    },
  };
}
