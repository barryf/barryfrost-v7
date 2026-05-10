import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '@/lib/pds';

export function documentsLoader(): Loader {
  return {
    name: 'documents-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching standard.site documents');
      store.clear();

      for await (const record of fetchAllRecords('site.standard.document', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);

        store.set({
          id: rkey,
          data: {
            title: value.title as string | undefined,
            path: value.path as string | undefined,
            publishedAt: value.publishedAt as string | undefined,
            description: value.description as string | undefined,
            tags: (value.tags as string[]) ?? [],
            uri: record.uri,
            createdAt: value.createdAt as string | undefined,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
