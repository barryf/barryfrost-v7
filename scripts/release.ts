// Build → deploy → notify orchestrator, run by Cloudflare Workers Builds as the deploy
// command (`npm run deploy`). One linear process so a failure in *either* the Astro build
// or `wrangler deploy` is caught and reported — the old `build && deploy && notify` chain
// went silent on a build failure.
//
// On success it pulls a content summary from the pds-firehose Worker and only notifies if
// there is one, so hourly-cron and code-push rebuilds stay silent. On any failure it always
// notifies (high priority) and exits non-zero so Cloudflare marks the build failed.
import { execSync } from 'node:child_process';

const { PUSHOVER_TOKEN, PUSHOVER_USER, NOTIFY_SECRET } = process.env;
const FIREHOSE_URL = 'https://pds-firehose.barryf.workers.dev';

// No-op when Pushover creds are absent (e.g. local runs), mirroring the old script's guard.
async function sendPushover(message: string, opts: { title?: string; priority?: number } = {}): Promise<void> {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) return;
  try {
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: PUSHOVER_TOKEN,
        user: PUSHOVER_USER,
        title: opts.title ?? 'barryfrost-v7',
        message,
        priority: opts.priority ?? 0,
      }),
    });
  } catch (err) {
    console.error('pushover send failed', err);
  }
}

// Drain the firehose Worker's pending content summary. Returns null (send nothing) on any
// error or when the build was not content-driven — notifications must never block a deploy.
async function pendingSummary(): Promise<string | null> {
  try {
    const res = await fetch(`${FIREHOSE_URL}/pending-notification`, {
      headers: NOTIFY_SECRET ? { 'X-Notify-Secret': NOTIFY_SECRET } : {},
    });
    if (!res.ok) {
      console.error(`pending-notification returned ${res.status}`);
      return null;
    }
    const { message } = (await res.json()) as { message: string | null };
    return message?.trim() || null;
  } catch (err) {
    console.error('pending-notification fetch failed', err);
    return null;
  }
}

let step = 'build';
try {
  execSync('npm run build', { stdio: 'inherit' });
  step = 'deploy';
  execSync('npx wrangler deploy', { stdio: 'inherit' });

  // Syndicate articles/weeknotes to Standard.site — gated so it only runs in production
  // (set PUBLISH_STANDARD_SITE=1 in the Workers Build env after launch). Runs after deploy
  // so the .well-known files and per-page verification <link> tags are already live. The
  // publisher is idempotent, so a failure here must not fail the deploy.
  if (process.env.PUBLISH_STANDARD_SITE) {
    step = 'publish-standard-site';
    try {
      execSync('npx tsx scripts/publish-standard-site.ts', { stdio: 'inherit' });
    } catch (err) {
      console.error('publish-standard-site failed (deploy unaffected)', err);
      await sendPushover(`standard.site publish failed\n${err instanceof Error ? err.message : String(err)}`.slice(0, 900), {
        title: 'barryfrost — standard.site publish failed',
        priority: 1,
      });
    }
  }

  const summary = await pendingSummary();
  if (summary) await sendPushover(summary);
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  await sendPushover(`${step} step failed\n${detail}`.slice(0, 900), {
    title: 'barryfrost — build failed',
    priority: 1,
  });
  process.exit(1);
}
