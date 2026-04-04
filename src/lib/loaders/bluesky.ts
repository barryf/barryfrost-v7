import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

async function resolveHandle(did: string, host: string): Promise<string> {
  const res = await fetch(`https://${host}/xrpc/com.atproto.repo.describeRepo?repo=${did}`);
  if (!res.ok) return did;
  const data = await res.json() as { handle?: string };
  return data.handle ?? did;
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

        store.set({
          id: rkey,
          data: {
            text: value.text as string,
            createdAt: value.createdAt as string,
            facets: (value.facets as unknown[]) ?? [],
            embed: value.embed ?? null,
            reply,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
