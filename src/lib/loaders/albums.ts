import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '@/lib/pds';
import { transformImage } from '@/lib/image-url';

export function albumsLoader(): Loader {
  return {
    name: 'albums-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching Rocksky albums');
      store.clear();

      for await (const record of fetchAllRecords('app.rocksky.album', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const albumArtUrl = value.albumArtUrl as string | undefined;
        const coverUrl = albumArtUrl
          ? transformImage(albumArtUrl, { width: 240, height: 240, fit: 'cover' })
          : undefined;

        store.set({
          id: rkey,
          data: {
            title: value.title as string,
            artist: value.artist as string,
            coverUrl,
            createdAt: value.createdAt as string,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
