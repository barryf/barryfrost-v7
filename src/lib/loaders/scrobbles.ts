import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '@/lib/pds';
import { remoteImage } from '@/lib/image-store';
import { mapLimit, RECORD_CONCURRENCY } from '@/lib/concurrency';

export function scrobblesLoader(): Loader {
  return {
    name: 'scrobbles-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching Rocksky scrobbles');
      store.clear();

      const records = [];
      for await (const record of fetchAllRecords('app.rocksky.scrobble', DID, PDS_HOST)) {
        records.push(record);
      }

      await mapLimit(records, RECORD_CONCURRENCY, async (record) => {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const albumArtUrl = value.albumArtUrl as string | undefined;
        const coverUrl = albumArtUrl
          ? await remoteImage(albumArtUrl, { width: 240, height: 240, fit: 'cover' })
          : undefined;

        store.set({
          id: rkey,
          data: {
            title: value.title as string,
            artist: value.artist as string,
            album: value.album as string | undefined,
            albumArtist: value.albumArtist as string | undefined,
            coverUrl,
            spotifyLink: value.spotifyLink as string | undefined,
            createdAt: value.createdAt as string,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      });
    },
  };
}
