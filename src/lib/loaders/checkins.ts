import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

export function checkinsLoader(): Loader {
  return {
    name: 'checkins-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching checkins');
      store.clear();

      for await (const record of fetchAllRecords('app.beaconbits.beacon', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const location = value.location as { latitude: string; longitude: string } | undefined;

        store.set({
          id: rkey,
          data: {
            venueName: value.venueName as string,
            venueCategory: value.venueCategory as string | undefined,
            venueAddress: value.venueAddress as string | undefined,
            venueUri: value.venueUri as string | undefined,
            latitude: location?.latitude,
            longitude: location?.longitude,
            rating: value.rating as number | undefined,
            createdAt: value.createdAt as string,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
