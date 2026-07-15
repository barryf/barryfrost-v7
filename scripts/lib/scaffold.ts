import { existsSync, readdirSync, writeFileSync } from 'fs';

// ─── TID generation ───────────────────────────────────────────────────────────
// AT Protocol TIDs are 13-char base32-sortable-encoded 64-bit values:
//   bits 63–10: microseconds since Unix epoch
//   bits  9–0:  clock ID (disambiguates records sharing a timestamp)
// Historically-dated TIDs place backfilled records in the correct chronological
// position. Module-level state keeps a batch of generated TIDs strictly increasing.

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
