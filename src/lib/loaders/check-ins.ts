import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '@/lib/pds';

const DID_SHORT = DID.replace('did:plc:', '');
import { pdsImage } from '@/lib/image-store';
import { mapLimit } from '@/lib/concurrency';

interface FsqLocation {
  fsq_place_id?: string;
  name?: string;
  latitude?: string;
  longitude?: string;
}

interface CheckInPhoto {
  image?: { ref?: { $link?: string } };
}

export function checkInsLoader(): Loader {
  return {
    name: 'check-ins-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching check-ins');
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
            sourceUrl: `https://www.beaconbits.app/beacons/${DID_SHORT}/${rkey}`,
            source: 'beaconbits' as const,
          },
          digest: generateDigest(record.cid),
        });
      }

      const checkinRecords = [];
      for await (const record of fetchAllRecords('com.barryfrost.checkin', DID, PDS_HOST)) {
        checkinRecords.push(record);
      }

      await mapLimit(checkinRecords, 16, async (record) => {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const location = value.location as FsqLocation | undefined;
        const photos = (value.photos as CheckInPhoto[] | undefined) ?? [];

        const results = await Promise.all(photos.map(async (photo) => {
          const link = photo.image?.ref?.['$link'];
          if (!link) return null;
          const [thumb, full] = await Promise.all([
            pdsImage(link, { width: 192, height: 192, fit: 'cover' }),
            pdsImage(link, { width: 720, height: 720, fit: 'cover' }),
          ]);
          return { thumb, full };
        }));
        const photoUrls = results.filter(r => r !== null).map(r => r.thumb);
        const photoFullUrls = results.filter(r => r !== null).map(r => r.full);

        store.set({
          id: rkey,
          data: {
            venueName: location?.name ?? '',
            venueCategory: value.category as string | undefined,
            venueAddress: value.address as string | undefined,
            fsqPlaceId: location?.fsq_place_id,
            latitude: location?.latitude,
            longitude: location?.longitude,
            createdAt: value.createdAt as string,
            uri: record.uri,
            photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
            photoFullUrls: photoFullUrls.length > 0 ? photoFullUrls : undefined,
            source: 'foursquare' as const,
          },
          digest: generateDigest(record.cid),
        });
      });
    },
  };
}
