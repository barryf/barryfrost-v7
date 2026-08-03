// Upsert the two site.standard.publication records (Articles + Weeknotes).
//
// On first run the records are created — paste the printed AT-URIs into
// src/lib/standard-site.ts (PUBLICATIONS.<key>.uri). Once a URI is set, re-running updates
// that record in place, so this file stays the source of truth for each publication's name,
// description, theme and icon. The /.well-known verification endpoints and the per-page
// verification <link> tags are generated from the same config, so there's nothing else to
// edit. Re-running is safe: the rkey never changes, so verification keeps matching.
//
// Usage: npm run standard:pubs [-- --dry-run]
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PUBLICATIONS, PUBLICATION_COLLECTION, createSession, createRecord, putRecord, uploadBlob,
  type BlobRef, type CollectionName, type Session,
} from './lib/standard-site.js';

/** The site's own PWA icon — square and 512x512, comfortably inside the lexicon's
 *  "at least 256x256" and 1MB limits, so it needs no re-encoding. */
const ICON_PATH = join('public', 'icon-512.png');

// Light-mode palette from src/styles/global.css / Base.astro.
const THEME = {
  background: { $type: 'site.standard.theme.color#rgb', r: 255, g: 255, b: 255 }, // white
  foreground: { $type: 'site.standard.theme.color#rgb', r: 75, g: 85, b: 99 },    // gray-600
  accent: { $type: 'site.standard.theme.color#rgb', r: 217, g: 119, b: 6 },       // amber-600
  accentForeground: { $type: 'site.standard.theme.color#rgb', r: 255, g: 255, b: 255 },
};

const META: Record<CollectionName, { name: string; description: string }> = {
  articles: {
    name: 'Barry Frost - Articles',
    description: 'Longer-form writing by Barry on software, the web, and whatever else.',
  },
  weeknotes: {
    name: 'Barry Frost - Weeknotes',
    description: 'Weekly notes posted by Barry.',
  },
};

function publicationRecord(collection: CollectionName, icon?: BlobRef) {
  return {
    $type: 'site.standard.publication',
    url: PUBLICATIONS[collection].url,
    name: META[collection].name,
    description: META[collection].description,
    basicTheme: THEME,
    preferences: { showInDiscover: true },
    ...(icon ? { icon } : {}),
  };
}

/** Upload the shared icon once and reuse the blob for both publications. */
async function uploadIcon(session: Session): Promise<BlobRef> {
  const bytes = readFileSync(join(process.cwd(), ICON_PATH));
  const blob = await uploadBlob(session, bytes, 'image/png');
  console.log(`Uploaded ${ICON_PATH} (${bytes.length} bytes) as publication icon\n`);
  return blob;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const collections: CollectionName[] = ['articles', 'weeknotes'];

  if (dryRun) {
    for (const c of collections) {
      console.log(`\n# ${c}\n${JSON.stringify(publicationRecord(c), null, 2)}`);
    }
    console.log(`\n(dry run — no writes; each record would also carry an icon blob from ${ICON_PATH})`);
    return;
  }

  const session = await createSession();
  console.log(`Authenticated as ${session.did}\n`);
  const icon = await uploadIcon(session);

  for (const c of collections) {
    const uri = PUBLICATIONS[c].uri;
    const record = publicationRecord(c, icon);
    if (uri) {
      // Update in place — same rkey, so the .well-known value stays correct.
      const rkey = uri.split('/').pop()!;
      await putRecord(session, PUBLICATION_COLLECTION, rkey, record);
      console.log(`~ ${c} publication updated:\n    ${uri}\n`);
      continue;
    }
    const ref = await createRecord(session, PUBLICATION_COLLECTION, record);
    console.log(`✓ ${c} publication created:`);
    console.log(`    ${ref.uri}`);
    console.log(`    → paste into PUBLICATIONS.${c}.uri in src/lib/standard-site.ts\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
