import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { blueskyLoader } from './lib/loaders/bluesky';
import { checkinsLoader } from './lib/loaders/checkins';
import { filmsLoader } from './lib/loaders/films';
import { documentsLoader } from './lib/loaders/documents';
import { booksLoader } from './lib/loaders/books';
import { subscriptionsLoader } from './lib/loaders/subscriptions';
import { blogrollLoader } from './lib/loaders/blogroll';
import { photosLoader } from './lib/loaders/photos';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/articles' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    visibility: z.string().optional(),
  }),
});

const weeknotes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/weeknotes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    week: z.number(),
    description: z.string().optional(),
    emoji: z.string().optional(),
    tags: z.array(z.string()).optional(),
    visibility: z.string().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

const travelblog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: 'src/content/travelblog' }),
  schema: z.object({
    date: z.coerce.date(),
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
    imageAlts: z.array(z.string()),
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

const checkins = defineCollection({
  loader: checkinsLoader(),
  schema: z.object({
    venueName: z.string(),
    venueCategory: z.string().optional(),
    venueAddress: z.string().optional(),
    venueUri: z.string().optional(),
    fsqPlaceId: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    rating: z.number().optional(),
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

const documents = defineCollection({
  loader: documentsLoader(),
  schema: z.object({
    title: z.string().optional(),
    path: z.string().optional(),
    publishedAt: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()),
    uri: z.string(),
    createdAt: z.string().optional(),
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
  }),
});

const photos = defineCollection({
  loader: photosLoader(),
  schema: z.object({
    title: z.string(),
    address: z.string().optional(),
    thumbnailUrls: z.array(z.string()),
    photoCount: z.number(),
    createdAt: z.string(),
    galleryRkey: z.string(),
  }),
});

export const collections = {
  articles,
  weeknotes,
  pages,
  travelblog,
  blueskyPosts,
  checkins,
  films,
  books,
  documents,
  blogroll,
  standardSubscriptions,
  photos,
};
