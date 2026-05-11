import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '@/lib/pds';
import { blobImage } from '@/lib/image-url';

interface GalleryRecord {
  title?: string;
  description?: string;
  address?: { name?: string; locality?: string; region?: string; country?: string };
  createdAt?: string;
}

interface GalleryItemRecord {
  gallery: string;
  item: string;
  position: number;
  createdAt?: string;
}

interface PhotoRecord {
  alt?: string;
  photo?: { ref?: { $link?: string }; mimeType?: string };
  aspectRatio?: { width: number; height: number };
  createdAt?: string;
}

export function photosLoader(): Loader {
  return {
    name: 'photos-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching Grain galleries');
      store.clear();

      // Collect all galleries
      const galleries = new Map<string, { rkey: string; title: string; description?: string; address?: string; createdAt: string; cid: string }>();
      for await (const record of fetchAllRecords('social.grain.gallery', DID, PDS_HOST)) {
        const value = record.value as GalleryRecord;
        const rkey = rkeyFromUri(record.uri);
        const address = value.address?.name ?? value.address?.locality;
        galleries.set(record.uri, {
          rkey,
          title: value.title ?? 'Gallery',
          description: value.description,
          address,
          createdAt: value.createdAt ?? new Date().toISOString(),
          cid: record.cid,
        });
      }

      // Collect all gallery items grouped by gallery URI
      const galleryItems = new Map<string, { photoUri: string; position: number }[]>();
      for await (const record of fetchAllRecords('social.grain.gallery.item', DID, PDS_HOST)) {
        const value = record.value as GalleryItemRecord;
        const existing = galleryItems.get(value.gallery) ?? [];
        existing.push({ photoUri: value.item, position: value.position });
        galleryItems.set(value.gallery, existing);
      }

      // Collect all photos
      const photos = new Map<string, PhotoRecord>();
      for await (const record of fetchAllRecords('social.grain.photo', DID, PDS_HOST)) {
        photos.set(record.uri, record.value as PhotoRecord);
      }

      // Build one feed entry per gallery
      for (const [galleryUri, gallery] of galleries) {
        const items = (galleryItems.get(galleryUri) ?? []).sort((a, b) => a.position - b.position);
        const photoCount = items.length;

        const thumbnailUrls: string[] = [];
        const thumbnailFullUrls: string[] = [];
        for (const item of items.slice(0, 4)) {
          const photo = photos.get(item.photoUri);
          if (photo?.photo?.ref?.$link) {
            thumbnailUrls.push(blobImage(photo.photo.ref.$link, { width: 240, height: 240, fit: 'cover' }));
            thumbnailFullUrls.push(blobImage(photo.photo.ref.$link, { width: 2000, height: 2000, fit: 'contain' }));
          }
        }

        store.set({
          id: gallery.rkey,
          data: {
            title: gallery.title,
            description: gallery.description,
            address: gallery.address,
            thumbnailUrls,
            thumbnailFullUrls,
            photoCount,
            createdAt: gallery.createdAt,
            galleryRkey: gallery.rkey,
          },
          digest: generateDigest(gallery.cid),
        });
      }
    },
  };
}
