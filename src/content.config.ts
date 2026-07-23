import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { blueskyLoader } from './lib/loaders/bluesky';
import { checkInsLoader } from './lib/loaders/check-ins';
import { filmsLoader } from './lib/loaders/films';
import { booksLoader } from './lib/loaders/books';
import { subscriptionsLoader } from './lib/loaders/subscriptions';
import { blogrollLoader } from './lib/loaders/blogroll';
import { photosLoader } from './lib/loaders/photos';
import { scrobblesLoader } from './lib/loaders/scrobbles';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/articles' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    visibility: z.string().optional(),
    featured: z.boolean().optional(),
    standardRkey: z.string().optional(),
    syndication: z.array(z.string().url()).optional(),
  }),
});

const weeknotes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/weeknotes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    week: z.number(),
    description: z.string().optional(),
    emoji: z.string().optional(),
    tags: z.array(z.string()).optional(),
    visibility: z.string().optional(),
    standardRkey: z.string().optional(),
    syndication: z.array(z.string().url()).optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

// One file per month (id = "YYYY-MM", e.g. "2001-08"). Frontmatter carries the
// ISO 3166-1 alpha-2 country codes visited and a short intro line; the body
// holds that month's posts under date headings.
const travelblog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/travelblog' }),
  schema: z.object({
    countries: z.array(z.string()),
    intro: z.string().optional(),
  }),
});

const blueskyPosts = defineCollection({
  loader: blueskyLoader(),
  schema: z.object({
    text: z.string(),
    createdAt: z.string(),
    facets: z.array(z.unknown()),
    reply: z.object({
      parentUri: z.string(),
      parentHandle: z.string(),
      parentRkey: z.string(),
    }).nullable(),
    uri: z.string(),
    imageUrls: z.array(z.string()),
    imageLargeUrls: z.array(z.string()),
    imageAlts: z.array(z.string()),
    external: z.object({
      uri: z.string(),
      title: z.string(),
      description: z.string(),
      thumbUrl: z.string().nullable(),
    }).nullable(),
    quotedPost: z.object({
      available: z.boolean(),
      uri: z.string(),
      cid: z.string().optional(),
      authorDid: z.string().optional(),
      authorHandle: z.string().optional(),
      rkey: z.string().optional(),
      text: z.string().optional(),
      facets: z.array(z.unknown()).optional(),
      createdAt: z.string().optional(),
      authorDisplayName: z.string().optional(),
    }).nullable(),
  }),
});

const checkIns = defineCollection({
  loader: checkInsLoader(),
  schema: z.object({
    venueName: z.string(),
    venueCategory: z.string().optional(),
    venueAddress: z.string().optional(),
    venueStreet: z.string().optional(),
    venueLocality: z.string().optional(),
    venueRegion: z.string().optional(),
    venuePostalCode: z.string().optional(),
    venueCountry: z.string().optional(),
    venueUri: z.string().optional(),
    fsqPlaceId: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    rating: z.number().optional(),
    comment: z.string().optional(),
    createdAt: z.string(),
    uri: z.string().optional(),
    sourceUrl: z.string().optional(),
    photoUrls: z.array(z.string()).optional(),
    photoFullUrls: z.array(z.string()).optional(),
    source: z.enum(['beaconbits', 'foursquare']).default('beaconbits'),
  }),
});

const films = defineCollection({
  loader: filmsLoader(),
  schema: z.object({
    title: z.string(),
    creativeWorkType: z.string(),
    rating: z.number().optional(),
    genres: z.array(z.string()),
    posterUrl: z.string().optional(),
    backdropUrl: z.string().optional(),
    mainCredit: z.string().optional(),
    mainCreditRole: z.string().optional(),
    releaseDate: z.string().optional(),
    text: z.string(),
    facets: z.array(z.unknown()),
    imdbId: z.string().optional(),
    tmdbId: z.string().optional(),
    createdAt: z.string(),
    uri: z.string(),
  }),
});

const books = defineCollection({
  loader: booksLoader(),
  schema: z.object({
    title: z.string(),
    authors: z.string(),
    status: z.string(),
    hiveId: z.string().optional(),
    hiveBookUri: z.string().optional(),
    coverUrl: z.string().optional(),
    owned: z.boolean().optional(),
    createdAt: z.string(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    isbn10: z.string().optional(),
    isbn13: z.string().optional(),
    goodreadsId: z.string().optional(),
    uri: z.string(),
  }),
});

const blogroll = defineCollection({
  loader: blogrollLoader(),
  schema: z.object({
    name: z.string(),
    url: z.string(),
    hostname: z.string(),
    avatarUrl: z.string().optional(),
  }),
});

const standardSubscriptions = defineCollection({
  loader: subscriptionsLoader(),
  schema: z.object({
    name: z.string(),
    description: z.string().optional(),
    siteUrl: z.string(),
    iconUrl: z.string().optional(),
    handle: z.string().optional(),
    createdAt: z.string().optional(),
  }),
});

const photos = defineCollection({
  loader: photosLoader(),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    address: z.string().optional(),
    thumbnailUrls: z.array(z.string()),
    thumbnailFullUrls: z.array(z.string()),
    photoCount: z.number(),
    createdAt: z.string(),
    galleryRkey: z.string(),
  }),
});

const scrobbles = defineCollection({
  loader: scrobblesLoader(),
  schema: z.object({
    title: z.string(),
    artist: z.string(),
    album: z.string().optional(),
    albumArtist: z.string().optional(),
    coverUrl: z.string().optional(),
    spotifyLink: z.string().optional(),
    createdAt: z.string(),
    uri: z.string(),
  }),
});

export const collections = {
  articles,
  weeknotes,
  pages,
  travelblog,
  blueskyPosts,
  'check-ins': checkIns,
  films,
  books,
  blogroll,
  standardSubscriptions,
  photos,
  scrobbles,
};
