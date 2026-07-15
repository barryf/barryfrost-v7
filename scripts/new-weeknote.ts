import { execFileSync } from 'child_process';
import { join } from 'path';
import {
  slugify,
  todayISO,
  nextWeekNumber,
  renderWeeknoteFrontmatter,
  writeStub,
  genTid,
} from './lib/scaffold.js';

function parseArgs(argv: string[]): Record<string, string | true> {
  const result: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const topic = args['topic'];
if (!topic || topic === true) {
  console.error('Usage: new-weeknote.ts --topic "Sofa" [--emoji "🛋️"] [--tags "foo,bar"] [--date YYYY-MM-DD] [--no-git]');
  process.exit(1);
}

const date = (args['date'] as string | undefined) ?? todayISO();
const emoji = args['emoji'] !== true ? (args['emoji'] as string | undefined) : undefined;
const tagsRaw = args['tags'];
const tags = tagsRaw && tagsRaw !== true
  ? (tagsRaw as string).split(',').map(t => t.trim()).filter(Boolean)
  : undefined;
const noGit = args['no-git'] === true || !!process.env.CI;

const weeknotesDir = join(process.cwd(), 'src/content/weeknotes');
const week = nextWeekNumber(weeknotesDir);
const topicStr = topic as string;
const title = `Week ${week} - ${topicStr}`;
const filePath = join(weeknotesDir, `${week}.md`);
const branch = `content/weeknote-${week}-${slugify(topicStr)}`;

const standardRkey = genTid(new Date(date));
const frontmatter = renderWeeknoteFrontmatter({ week, title, date, emoji, tags, standardRkey });

if (!noGit) {
  const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' }).trim();
  if (currentBranch !== 'main') {
    console.error(`Must be on main branch (currently on ${currentBranch}). Switch to main and try again.`);
    process.exit(1);
  }
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf-8' }).trim();
  if (dirty) {
    console.error('Working tree is not clean. Commit or stash changes first.');
    process.exit(1);
  }
  execFileSync('git', ['checkout', '-b', branch], { stdio: 'inherit' });
}

writeStub(filePath, frontmatter);
console.log(`Created: ${filePath}`);

if (!noGit) {
  execFileSync('git', ['add', filePath], { stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', `content: add weeknote ${week} — ${topicStr}`], { stdio: 'inherit' });
  execFileSync('git', ['push', '-u', 'origin', branch], { stdio: 'inherit' });
  execFileSync(
    'gh',
    [
      'pr', 'create',
      '--draft',
      '--title', `content: weeknote ${week} — ${topicStr}`,
      '--body', 'New weeknote stub. Edit the body and merge when ready.',
      '--head', branch,
    ],
    { stdio: 'inherit' },
  );
}
