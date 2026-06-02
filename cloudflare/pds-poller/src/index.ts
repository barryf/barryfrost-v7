interface Env {
  CIDS: KVNamespace;
  DEPLOY_HOOK: string;
}

const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';
const HOST = 'bsky.social';

const COLLECTIONS = [
  'app.bsky.feed.post',
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

const PRETTY: Record<string, string> = {
  'app.bsky.feed.post': 'post',
  'app.beaconbits.beacon': 'beacon',
  'com.barryfrost.checkin': 'checkin',
  'social.popfeed.feed.review': 'review',
  'buzz.bookhive.book': 'book',
  'site.standard.document': 'document',
  'site.standard.graph.subscription': 'subscription',
  'social.grain.gallery': 'gallery',
  'social.grain.gallery.item': 'gallery item',
  'social.grain.photo': 'photo',
  'app.rocksky.album': 'album',
};

async function fetchLatestCid(collection: string): Promise<string | null> {
  const url = `https://${HOST}/xrpc/com.atproto.repo.listRecords?repo=${DID}&collection=${collection}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json() as { records?: { cid: string }[] };
  return data.records?.[0]?.cid ?? null;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const results = await Promise.all(
      COLLECTIONS.map(async (col) => {
        const latest = await fetchLatestCid(col);
        if (!latest) return null;
        const cached = await env.CIDS.get(col);
        if (latest === cached) return null;
        await env.CIDS.put(col, latest);
        return col;
      }),
    );

    const changed = results.filter((col): col is string => col !== null);
    if (changed.length === 0) return;

    const label = changed.map((col) => PRETTY[col] ?? col).join(', ');
    console.log(`PDS changed (${label}); triggering deploy`);

    await fetch(env.DEPLOY_HOOK, { method: 'POST' });
  },
};
