interface Env {
  CIDS: KVNamespace;
  DEPLOY_HOOK: string;
}

const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';
const HOST = 'bsky.social';

// Full CID digest: paginates all records to catch creates, updates, and deletes.
// Only used for small collections where in-place updates are possible.
const DIGEST_COLLECTIONS = [
  'app.beaconbits.beacon',
  'com.barryfrost.checkin',
  'social.popfeed.feed.review',
  'buzz.bookhive.book',
  'site.standard.document',
  'site.standard.graph.subscription',
  'social.grain.gallery',
  'social.grain.gallery.item',
  'social.grain.photo',
  'app.rocksky.album',
] as const;

// First-record CID only: catches creates. Acceptable because Bluesky posts
// cannot be updated in-place, and this collection is too large to paginate fully.
const HEAD_COLLECTIONS = [
  'app.bsky.feed.post',
] as const;

const PRETTY: Record<string, string> = {
  'app.bsky.feed.post': 'post',
  'app.beaconbits.beacon': 'beacon',
  'com.barryfrost.checkin': 'check-in',
  'social.popfeed.feed.review': 'review',
  'buzz.bookhive.book': 'book',
  'site.standard.document': 'document',
  'site.standard.graph.subscription': 'subscription',
  'social.grain.gallery': 'gallery',
  'social.grain.gallery.item': 'gallery item',
  'social.grain.photo': 'photo',
  'app.rocksky.album': 'album',
};

// Tier 1: fetch the repo-level commit rev via the relay (bsky.network).
// bsky.social requires auth for com.atproto.sync.* — the relay serves them publicly.
// rev advances on any write (creates, updates, deletes).
async function fetchRepoRev(): Promise<string | null> {
  const url = `https://bsky.network/xrpc/com.atproto.sync.getLatestCommit?did=${DID}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`getLatestCommit failed: ${res.status} ${res.statusText}`);
    return null;
  }
  const data = await res.json() as { rev?: string };
  if (!data.rev) console.log(`getLatestCommit: no rev in response`, JSON.stringify(data));
  return data.rev ?? null;
}

// Paginate all records and return a sorted, joined CID string.
// Sorting makes the digest order-independent. Returns null on any fetch error.
async function fetchCollectionDigest(collection: string): Promise<string | null> {
  const cids: string[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ repo: DID, collection, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`https://${HOST}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) return null;
    const data = await res.json() as { records?: { cid: string }[]; cursor?: string };
    for (const r of data.records ?? []) cids.push(r.cid);
    cursor = data.cursor;
  } while (cursor);
  return cids.sort().join(',');
}

// Fetch only the first record's CID — efficient for large collections where
// only creates need to be detected (not updates).
async function fetchHeadCid(collection: string): Promise<string | null> {
  const url = `https://${HOST}/xrpc/com.atproto.repo.listRecords?repo=${DID}&collection=${collection}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json() as { records?: { cid: string }[] };
  return data.records?.[0]?.cid ?? null;
}

export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Tier 1: check the repo-level rev. If unchanged, nothing has been written anywhere
    // in the repo since the last poll — return immediately (~1 subrequest).
    const rev = await fetchRepoRev();
    if (!rev) {
      console.log('getLatestCommit unavailable; skipping poll');
      return;
    }

    const cachedRev = await env.CIDS.get('_rev');
    if (rev === cachedRev) {
      console.log(`rev unchanged (${rev}); nothing to do`);
      return;
    }

    console.log(`rev changed: ${cachedRev ?? '(none)'} → ${rev}; scanning collections`);

    // Store the new rev unconditionally so untracked writes (likes, follows, etc.)
    // don't cause a re-scan on the next poll.
    await env.CIDS.put('_rev', rev);

    // Tier 2a: full digest scan for small collections — catches creates, updates, deletes.
    const digestResults = await Promise.all(
      DIGEST_COLLECTIONS.map(async (col) => {
        const digest = await fetchCollectionDigest(col);
        if (!digest) return null;
        const cached = await env.CIDS.get(col);
        if (digest === cached) return null;
        await env.CIDS.put(col, digest);
        return col;
      }),
    );

    // Tier 2b: head CID for large collections — catches creates only.
    const headResults = await Promise.all(
      HEAD_COLLECTIONS.map(async (col) => {
        const cid = await fetchHeadCid(col);
        if (!cid) return null;
        const cached = await env.CIDS.get(col);
        if (cid === cached) return null;
        await env.CIDS.put(col, cid);
        return col;
      }),
    );

    const changed = [...digestResults, ...headResults].filter((col): col is string => col !== null);
    if (changed.length === 0) {
      console.log('rev advanced but no tracked collections changed (untracked write)');
      return;
    }

    const label = changed.map((col) => PRETTY[col] ?? col).join(', ');
    console.log(`PDS changed (${label}); triggering deploy`);

    await fetch(env.DEPLOY_HOOK, { method: 'POST' });
  },
};
