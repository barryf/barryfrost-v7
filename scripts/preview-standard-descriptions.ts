// Print the description/textContent a site.standard.document record would carry, for eyeballing
// plaintext extraction (notably the reference-style link stripping in lib/standard-site.ts).
//
//   npx tsx scripts/preview-standard-descriptions.ts                 # posts using reference links
//   npx tsx scripts/preview-standard-descriptions.ts articles/ux-london weeknotes/301
//
// Slugs are `<collection>/<slug>`; a bare slug is looked up in both collections. Read-only —
// no PDS session, no network.
import { readEntries, buildDocumentRecord, type CollectionName, type Entry } from './lib/standard-site.js';

const COLLECTIONS: CollectionName[] = ['articles', 'weeknotes'];

const all: Entry[] = COLLECTIONS.flatMap((c) => readEntries(c));

const args = process.argv.slice(2);
const selected = args.length
  ? args.flatMap((arg) => {
      const [maybeCollection, ...rest] = arg.split('/');
      const matches = rest.length
        ? all.filter((e) => e.collection === maybeCollection && e.slug === rest.join('/'))
        : all.filter((e) => e.slug === arg);
      if (!matches.length) console.warn(`no entry matched: ${arg}`);
      return matches;
    })
  // Default: every post that uses reference-style links, which is what the stripping is for.
  : all.filter((e) => /^[ \t]{0,3}\[[^\]]+\]:[ \t]*\S+/m.test(e.body));

if (!selected.length) {
  console.log('nothing to preview');
  process.exit(0);
}

for (const entry of selected) {
  const record = buildDocumentRecord(entry);
  console.log(`\n─── ${entry.collection}/${entry.slug} ───`);
  console.log(`title:       ${record.title}`);
  console.log(`description: ${record.description ?? '(none)'}`);
  console.log(`textContent: ${(record.textContent ?? '(none)').slice(0, 400)}…`);
}
