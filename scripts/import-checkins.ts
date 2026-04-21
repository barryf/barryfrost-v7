/**
 * One-off script: reads checkin posts from v6 MF2 JSON files and writes
 * src/data/historical-checkins.json for use by checkinsLoader.
 *
 * Usage: npx tsx scripts/import-checkins.ts
 *
 * Source: ../content/posts/YYYY/MM/slug.json
 * Output: src/data/historical-checkins.json
 *
 * Includes post-type "checkin" and post-type "photo" records that carry a
 * checkin h-card (Swarm photo check-ins — photo URL is discarded).
 */

import { writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const POSTS_DIR = join(process.cwd(), '../content/posts');
const OUTPUT_FILE = join(process.cwd(), 'src/data/historical-checkins.json');

interface HCard {
  type: string[];
  value?: string;
  properties: {
    name?: string[];
    url?: string[];
    latitude?: (number | string)[];
    longitude?: (number | string)[];
    'street-address'?: string[];
    locality?: string[];
    region?: string[];
    'country-name'?: string[];
    'postal-code'?: string[];
  };
}

interface HAdr {
  type: string[];
  properties: {
    latitude?: (number | string)[];
    longitude?: (number | string)[];
    'street-address'?: string[];
    locality?: string[];
    region?: string[];
    'country-name'?: string[];
  };
}

interface MF2Post {
  type: string[];
  'post-type': string[];
  properties: {
    published?: string[];
    syndication?: string[];
    checkin?: HCard[];
    location?: HAdr[];
    photo?: string[];
  };
}

interface HistoricalCheckin {
  id: string;
  venueName: string;
  venueAddress?: string;
  venueUri?: string;
  swarmUrl?: string;
  latitude?: string;
  longitude?: string;
  createdAt: string;
  source: 'foursquare';
}

function foursquareUrl(urls: string[] | undefined): string | undefined {
  return urls?.find(u => /foursquare\.com\/v\//.test(u));
}

function buildAddress(props: HCard['properties'] | HAdr['properties']): string | undefined {
  const parts = [props['street-address']?.[0], props.locality?.[0]].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function processFile(filePath: string, slug: string): HistoricalCheckin | null {
  const raw = readFileSync(filePath, 'utf-8');
  const post: MF2Post = JSON.parse(raw);

  const postType = post['post-type']?.[0];
  const hasCheckinCard = Array.isArray(post.properties?.checkin) && post.properties.checkin.length > 0;

  if (postType !== 'checkin' && !(postType === 'photo' && hasCheckinCard)) return null;
  if (!hasCheckinCard) return null;

  const checkinCard = post.properties.checkin![0];
  const cardProps = checkinCard.properties;
  const location = post.properties.location?.[0];

  const venueName = cardProps.name?.[0];
  if (!venueName) return null;

  // Prefer location h-adr for coords (more reliable), fall back to checkin h-card
  const latSrc = location?.properties.latitude?.[0] ?? cardProps.latitude?.[0];
  const lngSrc = location?.properties.longitude?.[0] ?? cardProps.longitude?.[0];

  const latitude = latSrc !== undefined ? String(latSrc) : undefined;
  const longitude = lngSrc !== undefined ? String(lngSrc) : undefined;

  // Address from location h-adr preferred; fall back to checkin h-card
  const venueAddress = buildAddress(location?.properties ?? cardProps) ?? buildAddress(cardProps);

  // Foursquare venue URL: try h-card value first, then url[] array
  const venueUri = foursquareUrl(
    checkinCard.value ? [checkinCard.value] : undefined
  ) ?? foursquareUrl(cardProps.url);

  const published = post.properties.published?.[0];
  if (!published) return null;
  const createdAt = new Date(published).toISOString();

  const swarmUrl = post.properties.syndication?.find(u => /swarmapp\.com/.test(u));

  return {
    id: slug,
    venueName,
    venueAddress,
    venueUri,
    swarmUrl,
    latitude,
    longitude,
    createdAt,
    source: 'foursquare',
  };
}

function main() {
  const checkins: HistoricalCheckin[] = [];
  let skipped = 0;

  const years = readdirSync(POSTS_DIR).filter((d: string) => /^\d{4}$/.test(d)).sort();

  for (const year of years) {
    const yearDir = join(POSTS_DIR, year);
    const months = readdirSync(yearDir).filter((d: string) => /^\d{2}$/.test(d)).sort();

    for (const month of months) {
      const monthDir = join(yearDir, month);
      const files = readdirSync(monthDir).filter((f: string) => f.endsWith('.json'));

      for (const file of files) {
        const slug = file.replace(/\.json$/, '');
        const filePath = join(monthDir, file);

        try {
          const result = processFile(filePath, slug);
          if (result) {
            checkins.push(result);
          }
        } catch (err) {
          console.error(`Error processing ${filePath}:`, err);
          skipped++;
        }
      }
    }
  }

  checkins.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  writeFileSync(OUTPUT_FILE, JSON.stringify(checkins, null, 2) + '\n');
  console.log(`Done! ${checkins.length} checkins written to ${OUTPUT_FILE}`);
  if (skipped > 0) console.warn(`${skipped} files skipped due to errors`);
}

main();
