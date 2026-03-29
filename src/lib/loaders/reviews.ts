import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, DID, PDS_HOST } from '../pds';

export function reviewsLoader(): Loader {
  return {
    name: 'reviews-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching reviews');
      store.clear();

      for await (const record of fetchAllRecords('social.popfeed.feed.review', DID, PDS_HOST)) {
        const value = record.value as Record<string, unknown>;
        const rkey = rkeyFromUri(record.uri);
        const identifiers = value.identifiers as { imdbId?: string; tmdbId?: string } | undefined;

        store.set({
          id: rkey,
          data: {
            title: value.title as string,
            creativeWorkType: value.creativeWorkType as string,
            rating: value.rating as number | undefined,
            genres: (value.genres as string[]) ?? [],
            posterUrl: value.posterUrl as string | undefined,
            backdropUrl: value.backdropUrl as string | undefined,
            mainCredit: value.mainCredit as string | undefined,
            mainCreditRole: value.mainCreditRole as string | undefined,
            releaseDate: value.releaseDate as string | undefined,
            text: (value.text as string) || '',
            facets: (value.facets as unknown[]) ?? [],
            imdbId: identifiers?.imdbId,
            tmdbId: identifiers?.tmdbId,
            createdAt: value.createdAt as string,
            uri: record.uri,
          },
          digest: generateDigest(record.cid),
        });
      }
    },
  };
}
