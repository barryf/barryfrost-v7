import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

// ─── TID generation ───────────────────────────────────────────────────────────
// AT Protocol TIDs are 13-char base32-sortable-encoded 64-bit values:
//   bits 63–10: microseconds since Unix epoch
//   bits  9–0:  clock ID (disambiguates records sharing a timestamp)
// Historically-dated TIDs place backfilled records in the correct chronological
// position. Module-level state keeps a batch of generated TIDs strictly increasing.
//
// That state lives for one process only, so `genTid` alone cannot see rkeys minted by an
// earlier run: two posts sharing a frontmatter date (a late weeknote published alongside the
// next one) get byte-identical TIDs from separate scaffold runs. Mint with `genUniqueTid`,
// which rejects any TID already claimed in content frontmatter.

const BASE32 = '234567abcdefghijklmnopqrstuvwxyz';
let _lastTidMicros = 0n;
let _clockId = 0;

export function genTid(date: Date = new Date()): string {
  let micros = BigInt(date.getTime()) * 1000n;
  if (micros <= _lastTidMicros) {
    micros = _lastTidMicros;
    _clockId++;
    if (_clockId >= 1024) {
      micros++;
      _clockId = 0;
    }
  } else {
    _clockId = 0;
  }
  _lastTidMicros = micros;

  const tid = (micros << 10n) | BigInt(_clockId);
  let result = '';
  let n = tid;
  for (let i = 0; i < 13; i++) {
    result = BASE32[Number(n & 0x1fn)] + result;
    n >>= 5n;
  }
  return result;
}

// ─── rkey collision avoidance ─────────────────────────────────────────────────
// A TID is only an identity if nothing else holds it. `standardRkey` frontmatter is the
// full record of which TIDs this repo has handed out, so it is the set to mint against —
// the PDS is not consulted, keeping scaffolding offline and fast.

const RKEY_COLLECTIONS = ['articles', 'weeknotes'];

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (['.md', '.mdx'].includes(extname(name))) out.push(full);
  }
  return out;
}

/** Every `standardRkey` already claimed in article/weeknote frontmatter. */
export function usedRkeys(contentRoot = join(process.cwd(), 'src/content')): Set<string> {
  const used = new Set<string>();
  for (const collection of RKEY_COLLECTIONS) {
    const dir = join(contentRoot, collection);
    if (!existsSync(dir)) continue;
    for (const file of markdownFiles(dir)) {
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf-8'))?.[1];
      const rkey = frontmatter && /^standardRkey:\s*(\S+)/m.exec(frontmatter)?.[1];
      if (rkey) used.add(rkey);
    }
  }
  return used;
}

/**
 * A TID for `date` that no post already holds. Repeat `genTid` calls bump the clock ID, so
 * each retry yields the next TID for the same timestamp — a second post dated the same day
 * lands immediately after the first and the pair still sorts chronologically. Pass `taken`
 * to mint several in one pass, adding each result to the set as you go.
 */
export function genUniqueTid(date: Date = new Date(), taken: Set<string> = usedRkeys()): string {
  let tid = genTid(date);
  while (taken.has(tid)) tid = genTid(date);
  return tid;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function escapeYaml(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function nextWeekNumber(weeknotesDir: string): number {
  const files = readdirSync(weeknotesDir);
  let max = 0;
  for (const f of files) {
    const m = f.match(/^(\d+)\./);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export function renderArticleFrontmatter(opts: {
  title: string;
  date: string;
  tags?: string[];
  standardRkey?: string;
}): string {
  const lines = [
    `title: ${escapeYaml(opts.title)}`,
    `date: ${opts.date}`,
  ];
  if (opts.tags?.length) {
    lines.push('tags:');
    for (const t of opts.tags) lines.push(`  - ${t}`);
  }
  if (opts.standardRkey) lines.push(`standardRkey: ${opts.standardRkey}`);
  return lines.join('\n') + '\n';
}

export function renderWeeknoteFrontmatter(opts: {
  week: number;
  title: string;
  date: string;
  emoji?: string;
  tags?: string[];
  standardRkey?: string;
}): string {
  const lines = [
    `title: ${escapeYaml(opts.title)}`,
    `date: ${opts.date}`,
    `week: ${opts.week}`,
  ];
  if (opts.emoji) lines.push(`emoji: ${escapeYaml(opts.emoji)}`);
  if (opts.tags?.length) {
    lines.push('tags:');
    for (const t of opts.tags) lines.push(`  - ${t}`);
  }
  if (opts.standardRkey) lines.push(`standardRkey: ${opts.standardRkey}`);
  return lines.join('\n') + '\n';
}

export function writeStub(filePath: string, frontmatter: string): void {
  if (existsSync(filePath)) {
    throw new Error(`File already exists: ${filePath}`);
  }
  writeFileSync(filePath, `---\n${frontmatter}---\n\n`);
}
