import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

const DID_SHORT = DID.replace('did:plc:', '');
import { downloadImage } from '../download-image';

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
        for (const [i, photo] of photos.entries()) {
          const link = photo.image?.ref?.['$link'];
          if (!link) continue;
          const blobUrl = `https://${PDS_HOST}/xrpc/com.atproto.sync.getBlob?did=${DID}&cid=${link}`;
          const thumb = await downloadImage(blobUrl, 'checkins', `${rkey}-${i}.jpg`, 96, 96, 'cover');
          const full = await downloadImage(blobUrl, 'checkins', `${rkey}-${i}-full.jpg`, 360, 360, 'cover');
          if (thumb && full) {
            photoUrls.push(thumb);
            photoFullUrls.push(full);
          }
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
