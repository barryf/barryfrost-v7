// One-time (backfill prep): assign a stable `standardRkey` TID to every publishable
// article/weeknote that lacks one, writing it into the file's frontmatter. Review the
// resulting `git diff` and commit — this is authored data, not a CI write-back. The rkey
// lets the build emit the verification <link> and keeps publishing idempotent.
//
// Usage: npm run standard:rkeys [-- --dry-run]
import { readFileSync, writeFileSync } from 'fs';
import { genUniqueTid, usedRkeys } from './lib/scaffold.js';
import { readEntries, isPublishable, type CollectionName, type Entry } from './lib/standard-site.js';

/** Insert `standardRkey: <rkey>` as the last line of the frontmatter block. */
function insertRkey(raw: string, rkey: string): string {
  return raw.replace(/^(---\r?\n[\s\S]*?)(\r?\n---\r?\n?)/, `$1\nstandardRkey: ${rkey}$2`);
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const collections: CollectionName[] = ['articles', 'weeknotes'];

  const pending: Entry[] = [];
  for (const c of collections) {
    for (const entry of readEntries(c)) {
      if (isPublishable(entry) && !entry.data.standardRkey) pending.push(entry);
    }
  }
  // Chronological order so generated TIDs sort by publish date.
  pending.sort((a, b) => new Date(a.data.date ?? 0).getTime() - new Date(b.data.date ?? 0).getTime());

  if (!pending.length) {
    console.log('All publishable articles/weeknotes already have a standardRkey. Nothing to do.');
    return;
  }

  console.log(`${pending.length} file(s) need a standardRkey:\n`);
  // One set for the whole pass, grown as each rkey is minted, so files sharing a date can't
  // collide with each other or with an rkey an earlier run already wrote to frontmatter.
  const taken = usedRkeys();
  for (const entry of pending) {
    const rkey = genUniqueTid(new Date(entry.data.date ?? Date.now()), taken);
    taken.add(rkey);
    console.log(`  ${entry.collection}/${entry.slug} → ${rkey}`);
    if (!dryRun) {
      const updated = insertRkey(readFileSync(entry.filePath, 'utf-8'), rkey);
      writeFileSync(entry.filePath, updated);
    }
  }
  console.log(dryRun ? '\n(dry run — no files written)' : '\n✓ Frontmatter updated. Review `git diff` and commit.');
}

main();
