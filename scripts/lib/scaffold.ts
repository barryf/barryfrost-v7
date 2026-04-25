import { existsSync, readdirSync, writeFileSync } from 'fs';

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
    const m = f.match(/^(\d+)-/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export function renderArticleFrontmatter(opts: {
  title: string;
  date: string;
  tags?: string[];
}): string {
  const lines = [
    `title: ${escapeYaml(opts.title)}`,
    `date: ${opts.date}`,
  ];
  if (opts.tags?.length) {
    lines.push('tags:');
    for (const t of opts.tags) lines.push(`  - ${t}`);
  }
  return lines.join('\n') + '\n';
}

export function renderWeeknoteFrontmatter(opts: {
  week: number;
  title: string;
  date: string;
  emoji?: string;
  tags?: string[];
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
  return lines.join('\n') + '\n';
}

export function writeStub(filePath: string, frontmatter: string): void {
  if (existsSync(filePath)) {
    throw new Error(`File already exists: ${filePath}`);
  }
  writeFileSync(filePath, `---\n${frontmatter}---\n\n`);
}
