import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, HANDLE, PDS_HOST } from '@/lib/pds';
import { DOCUMENT_COLLECTION } from '@/lib/standard-site';

/**
 * rkey → Bluesky permalink for the card post each article/weeknote was syndicated to.
 *
 * scripts/publish-standard-site.ts creates that post once and stores its strong-ref as
 * `bskyPostRef` on the site.standard.document record, so the record already knows the
 * syndication URL and the Markdown file doesn't have to. Posts published before v7 keep
 * the bsky.app URL in their `syndication` frontmatter; see @/lib/syndication for how the
 * two are combined.
 *
 * Only records carrying a ref are stored — a post with no entry renders no Bluesky link.
 * A failed fetch is warned about rather than thrown: these links are an enrichment, and
 * a PDS blip shouldn't fail the build.
 */
export function standardDocumentsLoader(): Loader {
  return {
    name: 'standard-documents-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching Standard documents');
      store.clear();

      try {
        for await (const record of fetchAllRecords(DOCUMENT_COLLECTION, DID, PDS_HOST)) {
          const ref = (record.value as { bskyPostRef?: { uri?: string } }).bskyPostRef;
          if (!ref?.uri) continue;

          store.set({
            id: rkeyFromUri(record.uri),
            data: { bskyUrl: `https://bsky.app/profile/${HANDLE}/post/${rkeyFromUri(ref.uri)}` },
            digest: generateDigest(record.cid),
          });
        }
      } catch (err) {
        logger.warn(`Standard documents fetch failed, skipping: ${err}`);
      }
    },
  };
}
