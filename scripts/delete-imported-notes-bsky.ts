/**
 * Delete all Bluesky posts previously imported by import-notes-bsky.ts.
 *
 * Reads scripts/imported-notes-bsky.json, calls deleteRecord for each URI,
 * then clears the file so the importer can re-run from scratch.
 *
 * Usage:
 *   npx tsx scripts/delete-imported-notes-bsky.ts [--dry-run]
 *
 * Env vars required (live mode):
 *   BSKY_HANDLE        e.g. barryfrost.com
 *   BSKY_APP_PASSWORD  an app password from bsky.app settings
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const IMPORTED_FILE = join(process.cwd(), 'scripts/imported-notes-bsky.json');
const PDS_REGISTRY_HOST = 'bsky.social';
const WRITE_DELAY_MS = 250;

interface ImportedMap {
  [slug: string]: { uri: string };
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return env;
  const raw = readFileSync(envPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
  return env;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolvePds(handle: string): Promise<string> {
  const res = await fetch(`https://${PDS_REGISTRY_HOST}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error(`describeRepo failed: ${res.status}`);
  const data = await res.json() as { didDoc?: { service?: { serviceEndpoint?: string }[] } };
  const endpoint = data.didDoc?.service?.[0]?.serviceEndpoint;
  if (!endpoint) throw new Error('Could not resolve PDS endpoint');
  return endpoint;
}

interface Session { accessJwt: string; did: string }

async function createSession(pds: string, identifier: string, password: string): Promise<Session> {
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  return await res.json() as Session;
}

async function deleteRecord(pds: string, jwt: string, did: string, collection: string, rkey: string): Promise<void> {
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.deleteRecord`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: did, collection, rkey }),
  });
  if (!res.ok) throw new Error(`deleteRecord(${rkey}) failed: ${res.status} ${await res.text()}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!existsSync(IMPORTED_FILE)) {
    console.log('No imported-notes-bsky.json found — nothing to delete.');
    return;
  }

  const imported: ImportedMap = JSON.parse(readFileSync(IMPORTED_FILE, 'utf-8'));
  const entries = Object.entries(imported);
  console.log(`${entries.length} records to delete`);
  if (entries.length === 0) return;

  let pds = '';
  let session: Session | null = null;
  if (!dryRun) {
    const env = { ...loadEnv(), ...process.env };
    const handle = env['BSKY_HANDLE'];
    const password = env['BSKY_APP_PASSWORD'];
    if (!handle || !password) {
      console.error('Error: BSKY_HANDLE and BSKY_APP_PASSWORD must be set');
      process.exit(1);
    }
    console.log(`Resolving PDS for ${handle}…`);
    pds = await resolvePds(handle);
    console.log(`PDS: ${pds}`);
    session = await createSession(pds, handle, password);
    console.log(`Authenticated as ${session.did}`);
  }

  let deleted = 0;
  let failed = 0;

  for (const [slug, { uri }] of entries) {
    // URI format: at://did/collection/rkey
    const rkey = uri.split('/').pop()!;

    if (dryRun) {
      console.log(`[dry-run] would delete ${slug} → ${uri}`);
      deleted++;
      continue;
    }

    try {
      await deleteRecord(pds, session!.accessJwt, session!.did, 'app.bsky.feed.post', rkey);
      console.log(`  ✓ deleted ${slug} (${rkey})`);
      deleted++;
    } catch (err) {
      console.error(`  ✗ ${slug}: ${(err as Error).message}`);
      failed++;
    }

    await sleep(WRITE_DELAY_MS);
  }

  if (!dryRun && failed === 0) {
    writeFileSync(IMPORTED_FILE, '{}\n', 'utf-8');
    console.log(`\nCleared ${IMPORTED_FILE}`);
  } else if (!dryRun) {
    console.log(`\n${failed} deletions failed — imported file not cleared. Fix errors and re-run.`);
  }

  console.log(`\nDone. ${deleted} deleted, ${failed} failed.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
