interface Env {
  POLLER: DurableObjectNamespace;
  DEPLOY_HOOK: string;
  // Shared secret gating /pending-notification, which mutates state (drains the queue).
  // Optional locally; when unset the route is unauthenticated.
  NOTIFY_SECRET?: string;
}

const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';
const PDS_HOST = 'bsky.social';

// Collections whose newest record is polled every minute. Unlike a firehose subscription
// there's no server-side filtering, so this list drives 10 individual listRecords calls
// per cycle — trivial load (~14.4k/day) against bsky.social's 3,000-per-5-min per-IP limit.
//
// NB: site.standard.document is intentionally NOT watched — the build writes those
// records itself (scripts/publish-standard-site.ts), so watching them would loop.
const WATCHED_COLLECTIONS = [
  'app.bsky.feed.post',
  'app.beaconbits.beacon',
  'com.barryfrost.checkin',
  'social.popfeed.feed.review',
  'buzz.bookhive.book',
  'site.standard.graph.subscription',
  'social.grain.gallery',
  'social.grain.gallery.item',
  'social.grain.photo',
  'app.rocksky.album',
];

// Human-friendly noun per watched collection, for the deploy notification the build
// pipeline pulls from /pending-notification. Keys mirror WATCHED_COLLECTIONS.
const COLLECTION_NOUNS: Record<string, string> = {
  'app.bsky.feed.post': 'post',
  'app.beaconbits.beacon': 'beacon',
  'com.barryfrost.checkin': 'check-in',
  'social.popfeed.feed.review': 'review',
  'buzz.bookhive.book': 'book',
  'site.standard.graph.subscription': 'subscription',
  'social.grain.gallery': 'gallery',
  'social.grain.gallery.item': 'gallery item',
  'social.grain.photo': 'photo',
  'app.rocksky.album': 'album',
};

// Still watched (rebuilds still fire) but excluded from the notification summary — too
// frequent to be worth a Pushover per event (e.g. every track listened to on Rocksky).
const SILENT_COLLECTIONS = new Set(['app.rocksky.album']);

type Verb = 'New' | 'Updated' | 'Removed';

// One-line description of a watched change, e.g. "New book", "Updated post". Noun-level
// only — no record parsing. Falls back to the raw collection for anything unmapped.
function describeChange(verb: Verb, collection: string): string {
  const noun = COLLECTION_NOUNS[collection] ?? collection;
  return `${verb} ${noun}`;
}

interface RecordRef {
  rkey: string;
  cid: string;
}

type LatestMap = Record<string, RecordRef | null>;

// Persisted so it survives DO eviction — surfaced by the /status snapshot.
interface LastChange {
  verb: Verb;
  collection: string;
  rkey: string;
  at: number; // wall-clock ms
}

interface CollectionResult {
  collection: string;
  ref: RecordRef | null;
}

// rkeys are TIDs (lexically sortable by creation time), so string comparison alone tells
// us whether the newest record moved forward (new/updated) or backward (something ahead
// of it got deleted).
function diff(prev: RecordRef | null, next: RecordRef | null): Verb | null {
  if (!next) return prev ? 'Removed' : null;
  if (!prev) return 'New';
  if (next.rkey > prev.rkey) return 'New';
  if (next.rkey === prev.rkey) return next.cid !== prev.cid ? 'Updated' : null;
  return 'Removed'; // the previously-newest record is gone; this older one is now newest
}

export class PdsPoller implements DurableObject {
  private deploying = false;

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/poll') {
      await this.poll();
      return Response.json(await this.status());
    }
    if (url.pathname === '/status') {
      return Response.json(await this.status());
    }
    if (url.pathname === '/pending-notification') {
      return Response.json({ message: await this.drainSummary() });
    }
    return new Response(null, { status: 404 });
  }

  // Fetch the newest record of every watched collection, diff against the stored
  // baseline, queue notification lines, and fire the deploy hook if anything (or a
  // previously-failed deploy attempt) is pending.
  //
  // Documented blind spot: an update or delete of a *non-newest* record in a collection
  // doesn't change records[0], so this poll misses it. Rare in practice (edits/deletes
  // almost always target the latest record) and the hourly unconditional rebuild covers it.
  private async poll(): Promise<void> {
    const stored = await this.state.storage.get<LatestMap>('latest');
    const errors: string[] = [];

    const results = await Promise.all(
      WATCHED_COLLECTIONS.map((collection): Promise<CollectionResult | null> => this.fetchLatest(collection, errors)),
    );

    // First run (no stored baseline): persist and return without deploying, so deploying
    // the Worker itself doesn't fire a spurious rebuild.
    if (!stored) {
      const baseline: LatestMap = {};
      for (const r of results) if (r) baseline[r.collection] = r.ref;
      await this.state.storage.put('latest', baseline);
      await this.state.storage.put('lastPollAt', Date.now());
      await this.state.storage.put('lastPollErrors', errors);
      return;
    }

    const latest: LatestMap = { ...stored };
    let changed = false;

    for (const r of results) {
      if (!r) continue; // this collection's fetch failed this cycle — keep the stored value
      const { collection, ref } = r;
      const prev = stored[collection] ?? null;
      const verb = diff(prev, ref);
      if (!verb) continue;

      changed = true;
      latest[collection] = ref;

      const count = (await this.state.storage.get<number>('changeCount')) ?? 0;
      await this.state.storage.put('changeCount', count + 1);
      const lastChange: LastChange = { verb, collection, rkey: (ref ?? prev)!.rkey, at: Date.now() };
      await this.state.storage.put('lastChange', lastChange);

      if (!SILENT_COLLECTIONS.has(collection)) {
        const pending = (await this.state.storage.get<string[]>('pendingSummary')) ?? [];
        pending.push(describeChange(verb, collection));
        await this.state.storage.put('pendingSummary', pending);
      }
    }

    await this.state.storage.put('latest', latest);
    await this.state.storage.put('lastPollAt', Date.now());
    await this.state.storage.put('lastPollErrors', errors);

    if (changed) await this.state.storage.put('deployPending', true);
    await this.maybeDeploy();
  }

  private async fetchLatest(collection: string, errors: string[]): Promise<CollectionResult | null> {
    try {
      const params = new URLSearchParams({ repo: DID, collection, limit: '1' });
      const res = await fetch(`https://${PDS_HOST}/xrpc/com.atproto.repo.listRecords?${params}`);
      if (!res.ok) {
        errors.push(`${collection}: HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { records?: Array<{ uri: string; cid: string }> };
      const record = body.records?.[0];
      if (!record) return { collection, ref: null };
      const rkey = record.uri.split('/').pop() ?? '';
      return { collection, ref: { rkey, cid: record.cid } };
    } catch (err) {
      errors.push(`${collection}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // Fire the deploy hook if a deploy is pending, whether flagged by this cycle's diff or
  // left over from a previous cycle whose POST threw (network error, no response).
  private async maybeDeploy(): Promise<void> {
    if (!(await this.state.storage.get<boolean>('deployPending'))) return;
    await this.triggerDeploy();
  }

  // POST the Cloudflare deploy hook. The in-memory guard prevents overlapping fires.
  // The pending flag is cleared once the hook returns *any* response — retrying a
  // non-2xx every minute would loop forever. Only a network exception (no response)
  // leaves the flag set so the next cycle retries.
  private async triggerDeploy(): Promise<void> {
    if (this.deploying) return;
    this.deploying = true;
    try {
      const res = await fetch(this.env.DEPLOY_HOOK, { method: 'POST' });
      console.log(`deploy hook POST ${res.status}`);
      await this.state.storage.put('lastDeployAt', Date.now());
      await this.state.storage.put('lastDeployStatus', res.status);
      await this.state.storage.put('deployPending', false);
      if (!res.ok) console.log(`deploy hook returned non-2xx (${res.status}) — check DEPLOY_HOOK`);
    } catch (err) {
      console.log('deploy hook network error, will retry next cycle', err);
    } finally {
      this.deploying = false;
    }
  }

  // Return the accumulated content descriptions as one message and clear the queue. Read
  // and clear are atomic here — the DO is single-threaded, so no concurrent build can
  // double-drain. Repeats within the window collapse to a "×N" suffix.
  private async drainSummary(): Promise<string | null> {
    const pending = (await this.state.storage.get<string[]>('pendingSummary')) ?? [];
    if (pending.length === 0) return null;
    await this.state.storage.put('pendingSummary', []);
    const counts = new Map<string, number>();
    for (const line of pending) counts.set(line, (counts.get(line) ?? 0) + 1);
    return [...counts].map(([line, n]) => (n > 1 ? `${line} ×${n}` : line)).join('\n');
  }

  // Observable snapshot returned by /poll and /status — reliable via curl and wrangler tail.
  private async status(): Promise<Record<string, unknown>> {
    const [latest, changeCount, lastChange, lastPollAt, lastPollErrors, deployPending, lastDeployAt, lastDeployStatus, pendingSummary] =
      await Promise.all([
        this.state.storage.get<LatestMap>('latest'),
        this.state.storage.get<number>('changeCount'),
        this.state.storage.get<LastChange>('lastChange'),
        this.state.storage.get<number>('lastPollAt'),
        this.state.storage.get<string[]>('lastPollErrors'),
        this.state.storage.get<boolean>('deployPending'),
        this.state.storage.get<number>('lastDeployAt'),
        this.state.storage.get<number>('lastDeployStatus'),
        this.state.storage.get<string[]>('pendingSummary'),
      ]);
    const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);
    return {
      now: new Date().toISOString(),
      latest: latest ?? null,
      changeCount: changeCount ?? 0,
      lastChange: lastChange ?? null,
      lastPollAt: iso(lastPollAt),
      lastPollErrors: lastPollErrors ?? [],
      deployPending: deployPending ?? false,
      lastDeployAt: iso(lastDeployAt),
      lastDeployStatus: lastDeployStatus ?? null,
      pendingSummary: pendingSummary ?? [],
    };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/poll' || url.pathname === '/status') {
      return stub(env).fetch(req);
    }
    if (url.pathname === '/pending-notification') {
      // Gate the drain: it mutates state, so a random caller shouldn't be able to swallow
      // a pending notification. When NOTIFY_SECRET is unset (local dev) the route is open.
      if (env.NOTIFY_SECRET && req.headers.get('X-Notify-Secret') !== env.NOTIFY_SECRET) {
        return new Response(null, { status: 401 });
      }
      return stub(env).fetch(req);
    }
    return new Response(null, { status: 404 });
  },

  // The minute cron drives the poll; the hourly cron is a belt-and-braces rebuild.
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    if (event.cron === '0 * * * *') {
      // Unconditionally re-trigger a build so a build that failed (e.g. PDS unreachable)
      // recovers even with no new record, and so the poll's non-newest-record blind spot
      // self-heals within the hour. POST the hook directly rather than via the DO, so this
      // still fires if the DO is wedged.
      try {
        const res = await fetch(env.DEPLOY_HOOK, { method: 'POST' });
        console.log(`hourly fallback deploy hook POST ${res.status}`);
      } catch (err) {
        console.log('hourly fallback deploy hook network error', err);
      }
      return;
    }
    await stub(env).fetch('https://do/poll');
  },
};

function stub(env: Env): DurableObjectStub {
  return env.POLLER.get(env.POLLER.idFromName('singleton'));
}
