import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

export function blueskyLoader(): Loader {
  return {
    name: 'bluesky-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching Bluesky posts');
      store.clear();

      for await (const record of fetchAllRecords('app.bsky.feed.post', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);

        store.set({
          id: rkey,
          data: {
            text: value.text as string,
            createdAt: value.createdAt as string,
            facets: (value.facets as unknown[]) ?? [],
            embed: value.embed ?? null,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
