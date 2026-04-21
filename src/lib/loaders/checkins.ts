import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';
import historicalCheckins from '../../data/historical-checkins.json';

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
            source: 'beaconbits' as const,
          },
          digest: generateDigest(record.cid),
        });
      }

      logger.info(`Loading ${historicalCheckins.length} historical checkins`);
      for (const entry of historicalCheckins) {
        store.set({
          id: `v6-${entry.id}`,
          data: {
            venueName: entry.venueName,
            venueAddress: entry.venueAddress,
            venueUri: entry.venueUri,
            swarmUrl: entry.swarmUrl,
            latitude: entry.latitude,
            longitude: entry.longitude,
            createdAt: entry.createdAt,
            source: 'foursquare' as const,
          },
          digest: generateDigest(entry.createdAt + entry.venueName),
        });
      }
    },
  };
}
