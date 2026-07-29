import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '@/lib/pds';
import { pdsImage } from '@/lib/image-store';
import { mapLimit, RECORD_CONCURRENCY } from '@/lib/concurrency';

interface FsqLocation {
  fsq_place_id?: string;
  name?: string;
  latitude?: string;
  longitude?: string;
}

interface AddressDetails {
  street?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
}

interface CheckInPhoto {
  image?: { ref?: { $link?: string } };
}

// Foursquare check-ins only carry a single comma-joined address string, e.g.
// "30 High St, Welwyn, Hertfordshire, AL6 9EQ". Split it best-effort into
// street / locality / region / postal-code so the card can emit structured
// markup. If the shape is unexpected, fall back to leaving the whole blob as
// the street address so nothing is dropped.
function splitAddressBlob(address: string): AddressDetails {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 4) {
    return {
      street: parts.slice(0, parts.length - 3).join(', '),
      locality: parts[parts.length - 3],
      region: parts[parts.length - 2],
      postalCode: parts[parts.length - 1],
    };
  }
  if (parts.length === 3) {
    return { street: parts[0], locality: parts[1], region: parts[2] };
  }
  if (parts.length === 2) {
    return { street: parts[0], locality: parts[1] };
  }
  return { street: address };
}

export function checkInsLoader(): Loader {
  return {
    name: 'check-ins-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching check-ins');
      store.clear();

      const checkinRecords = [];
      for await (const record of fetchAllRecords('com.barryfrost.checkin', DID, PDS_HOST)) {
        checkinRecords.push(record);
      }

      await mapLimit(checkinRecords, RECORD_CONCURRENCY, async (record) => {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const location = value.location as FsqLocation | undefined;
        const photos = (value.photos as CheckInPhoto[] | undefined) ?? [];
        const address = value.address as string | undefined;
        const addr = address ? splitAddressBlob(address) : undefined;

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
            venueStreet: addr?.street,
            venueLocality: addr?.locality,
            venueRegion: addr?.region,
            venuePostalCode: addr?.postalCode,
            fsqPlaceId: location?.fsq_place_id,
            latitude: location?.latitude,
            longitude: location?.longitude,
            createdAt: value.createdAt as string,
            comment: value.comment as string | undefined,
            uri: record.uri,
            photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
            photoFullUrls: photoFullUrls.length > 0 ? photoFullUrls : undefined,
          },
          digest: generateDigest(record.cid),
        });
      });
    },
  };
}
