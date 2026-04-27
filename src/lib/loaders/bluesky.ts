import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, resolveHandle, DID, PDS_HOST } from '../pds';
import { downloadImage } from '../download-image';

interface BlueskyImage {
  alt?: string;
  image?: { ref?: { $link?: string } };
}

interface BlueskyEmbed {
  $type?: string;
  images?: BlueskyImage[];
  media?: { $type?: string; images?: BlueskyImage[] };
}

async function extractImages(embed: BlueskyEmbed | undefined, rkey: string): Promise<{ urls: string[]; alts: string[] }> {
  const urls: string[] = [];
  const alts: string[] = [];
  if (!embed) return { urls, alts };
  const images = embed.$type === 'app.bsky.embed.images'
    ? embed.images
    : embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media?.$type === 'app.bsky.embed.images'
      ? embed.media.images
      : undefined;
  if (!images) return { urls, alts };
  for (const [index, img] of images.entries()) {
    const link = img.image?.ref?.$link;
    if (!link) continue;
    const blobUrl = `https://${PDS_HOST}/xrpc/com.atproto.sync.getBlob?did=${DID}&cid=${link}`;
    const url = await downloadImage(blobUrl, 'bluesky', `${rkey}-${index}.jpg`, 96, 96, 'inside');
    if (url) {
      urls.push(url);
      alts.push(img.alt ?? '');
    }
  }
  return { urls, alts };
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

        const { urls: imageUrls, alts: imageAlts } = await extractImages(value.embed as BlueskyEmbed | undefined, rkey);

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
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
