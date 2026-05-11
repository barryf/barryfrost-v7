import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '@/lib/pds';

const DID_SHORT = DID.replace('did:plc:', '');
import { blobImage } from '@/lib/image-url';

interface FsqLocation {
  fsq_place_id?: string;
  name?: string;
  latitude?: string;
  longitude?: string;
}

interface CheckinPhoto {
  image?: { ref?: { $link?: string } };
}

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
            sourceUrl: `https://www.beaconbits.app/beacons/${DID_SHORT}/${rkey}`,
            source: 'beaconbits' as const,
          },
          digest: generateDigest(record.cid),
        });
      }

      for await (const record of fetchAllRecords('com.barryfrost.checkin', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const location = value.location as FsqLocation | undefined;
        const photos = (value.photos as CheckinPhoto[] | undefined) ?? [];

        const photoUrls: string[] = [];
        const photoFullUrls: string[] = [];
        for (const photo of photos) {
          const link = photo.image?.ref?.['$link'];
          if (!link) continue;
          photoUrls.push(blobImage(link, { width: 192, height: 192, fit: 'cover' }));
          photoFullUrls.push(blobImage(link, { width: 720, height: 720, fit: 'cover' }));
        }

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
      }
    },
  };
}
