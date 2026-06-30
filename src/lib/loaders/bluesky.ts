import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, resolveHandle, DID, PDS_HOST } from '@/lib/pds';
import { pdsImage } from '@/lib/image-store';

interface BlueskyImage {
  alt?: string;
  image?: { ref?: { $link?: string } };
}

interface BlueskyQuoteRef {
  uri?: string;
  cid?: string;
}

interface BlueskyEmbed {
  $type?: string;
  images?: BlueskyImage[];
  media?: { $type?: string; images?: BlueskyImage[] };
  record?: BlueskyQuoteRef | { record?: BlueskyQuoteRef };
}

const APPVIEW_HOST = 'public.api.bsky.app';

interface AppViewPostView {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string };
  record: { text: string; createdAt: string; facets?: unknown[] };
}

async function fetchPostFromAppView(uri: string): Promise<AppViewPostView | null> {
  const params = new URLSearchParams({ uris: uri });
  const res = await fetch(`https://${APPVIEW_HOST}/xrpc/app.bsky.feed.getPosts?${params}`);
  if (!res.ok) return null;
  const data = await res.json() as { posts: AppViewPostView[] };
  return data.posts[0] ?? null;
}

async function extractImages(embed: BlueskyEmbed | undefined): Promise<{ urls: string[]; alts: string[] }> {
  if (!embed) return { urls: [], alts: [] };
  const images = embed.$type === 'app.bsky.embed.images'
    ? embed.images
    : embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media?.$type === 'app.bsky.embed.images'
      ? embed.media.images
      : undefined;
  if (!images) return { urls: [], alts: [] };
  const results = await Promise.all(images.map(async (img) => {
    const link = img.image?.ref?.$link;
    if (!link) return null;
    return { url: await pdsImage(link, { width: 192, height: 192, fit: 'contain' }), alt: img.alt ?? '' };
  }));
  const present = results.filter(r => r !== null);
  return { urls: present.map(r => r.url), alts: present.map(r => r.alt) };
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

      for await (const record of fetchAllRecords('app.bsky.feed.post', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);

        let reply: { parentUri: string; parentHandle: string; parentRkey: string } | null = null;
        const replyRef = value.reply as { parent?: { uri?: string } } | undefined;
        if (replyRef?.parent?.uri) {
          const parentUri = replyRef.parent.uri;
          const parts = parentUri.replace('at://', '').split('/');
          const parentDid = parts[0];
          const parentRkey = parts[2];

          if (!handleCache.has(parentDid)) {
            handleCache.set(parentDid, await resolveHandle(parentDid, PDS_HOST));
          }

          reply = {
            parentUri,
            parentHandle: handleCache.get(parentDid)!,
            parentRkey,
          };
        }

        if (/^Week \d+/i.test(value.text as string)) continue;

        const embed = value.embed as BlueskyEmbed | undefined;
        const { urls: imageUrls, alts: imageAlts } = await extractImages(embed);

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
            imageAlts,
            quotedPost,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
