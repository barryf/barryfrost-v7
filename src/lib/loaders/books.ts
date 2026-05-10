import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '@/lib/pds';
import { transformImage } from '@/lib/image-url';

export function booksLoader(): Loader {
  return {
    name: 'books-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching BookHive books');
      store.clear();

      for await (const record of fetchAllRecords('buzz.bookhive.book', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const identifiers = value.identifiers as { isbn10?: string; isbn13?: string; goodreadsId?: string } | undefined;
        const cover = value.cover as { ref?: { $link?: string }; mimeType?: string } | undefined;
        const rawCoverUrl = cover?.ref?.$link
          ? `https://${PDS_HOST}/xrpc/com.atproto.sync.getBlob?did=${DID}&cid=${cover.ref.$link}`
          : undefined;
        const coverUrl = rawCoverUrl
          ? transformImage(rawCoverUrl, { width: 96, height: 144, fit: 'cover' })
          : undefined;

        store.set({
          id: rkey,
          data: {
            title: value.title as string,
            authors: value.authors as string,
            status: value.status as string,
            hiveId: value.hiveId as string | undefined,
            hiveBookUri: value.hiveBookUri as string | undefined,
            coverUrl,
            owned: value.owned as boolean | undefined,
            createdAt: value.createdAt as string,
            startedAt: value.startedAt as string | undefined,
            finishedAt: value.finishedAt as string | undefined,
            isbn10: identifiers?.isbn10,
            isbn13: identifiers?.isbn13,
            goodreadsId: identifiers?.goodreadsId,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
