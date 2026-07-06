// One-time: create the two site.standard.publication records (Articles + Weeknotes).
//
// After running, paste the printed AT-URIs into src/lib/standard-site.ts
// (PUBLICATIONS.<key>.uri). The /.well-known verification endpoints and the per-page
// verification <link> tags are generated from that config, so there's nothing else to edit.
//
// Usage: npm run standard:pubs [-- --dry-run]
import { PUBLICATIONS, createSession, createRecord, type CollectionName } from './lib/standard-site.js';

// Light-mode palette from src/styles/global.css / Base.astro.
const THEME = {
  background: { $type: 'site.standard.theme.color#rgb', r: 255, g: 255, b: 255 }, // white
  foreground: { $type: 'site.standard.theme.color#rgb', r: 75, g: 85, b: 99 },    // gray-600
  accent: { $type: 'site.standard.theme.color#rgb', r: 217, g: 119, b: 6 },       // amber-600
  accentForeground: { $type: 'site.standard.theme.color#rgb', r: 255, g: 255, b: 255 },
};

const META: Record<CollectionName, { name: string; description: string }> = {
  articles: {
    name: 'Barry Frost — Articles',
    description: 'Longer-form writing by Barry Frost on software, the web, and whatever else.',
  },
  weeknotes: {
    name: 'Barry Frost — Weeknotes',
    description: 'Weekly notes from Barry Frost.',
  },
};

function publicationRecord(collection: CollectionName) {
  return {
    $type: 'site.standard.publication',
    url: PUBLICATIONS[collection].url,
    name: META[collection].name,
    description: META[collection].description,
    basicTheme: THEME,
    preferences: { showInDiscover: true },
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const collections: CollectionName[] = ['articles', 'weeknotes'];

  if (dryRun) {
    for (const c of collections) {
      console.log(`\n# ${c}\n${JSON.stringify(publicationRecord(c), null, 2)}`);
    }
    console.log('\n(dry run — no records created)');
    return;
  }

  const session = await createSession();
  console.log(`Authenticated as ${session.did}\n`);

  for (const c of collections) {
    if (PUBLICATIONS[c].uri) {
      console.log(`⚠ ${c}: PUBLICATIONS.${c}.uri already set (${PUBLICATIONS[c].uri}). Skipping to avoid a duplicate.`);
      continue;
    }
    const ref = await createRecord(session, 'site.standard.publication', publicationRecord(c));
    console.log(`✓ ${c} publication created:`);
    console.log(`    ${ref.uri}`);
    console.log(`    → paste into PUBLICATIONS.${c}.uri in src/lib/standard-site.ts\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
