import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const CONTENT_DIR = '/Users/barryf/Code/content/posts';
const WEEKNOTES_DIR = '/Users/barryf/Code/barryfrost-v7/src/content/weeknotes';

// Recursively find all JSON files under content/posts
function findJsonFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(full));
    } else if (entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

const jsonFiles = findJsonFiles(CONTENT_DIR);
let updated = 0;

for (const jsonPath of jsonFiles) {
  let json;
  try {
    json = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    continue;
  }

  const categories = json.properties?.category ?? [];
  if (!categories.includes('weeknotes')) continue;

  // Extract extra categories (not 'weeknotes', not 'emoji-*')
  const extras = categories.filter(
    c => c !== 'weeknotes' && !c.startsWith('emoji-')
  );
  if (extras.length === 0) continue;

  // Derive the weeknote slug from the JSON filename
  const basename = jsonPath.split('/').pop().replace('.json', '');
  // Strip leading 'week-' prefix to get e.g. '13-birthday'
  const slug = basename.replace(/^week-/, '');

  const mdPath = join(WEEKNOTES_DIR, `${slug}.md`);
  let md;
  try {
    md = readFileSync(mdPath, 'utf8');
  } catch {
    console.warn(`No .md file for ${slug} (from ${basename})`);
    continue;
  }

  // Skip if already has tags
  if (md.includes('\ntags:')) {
    console.log(`Already has tags: ${slug}`);
    continue;
  }

  // Insert tags after the emoji line (or before visibility/end of frontmatter)
  const tagsYaml = `tags:\n${extras.map(c => `  - ${c}`).join('\n')}`;

  // Insert before closing ---
  const newMd = md.replace(
    /^(---\n[\s\S]*?)(^---)/m,
    (_, front, close) => `${front}${tagsYaml}\n${close}`
  );

  if (newMd === md) {
    console.warn(`Couldn't insert tags for ${slug}`);
    continue;
  }

  writeFileSync(mdPath, newMd);
  console.log(`Updated ${slug}: ${extras.join(', ')}`);
  updated++;
}

console.log(`\nDone. Updated ${updated} weeknotes.`);
