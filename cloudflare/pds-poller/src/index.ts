interface Env {
  POLLER: DurableObjectNamespace;
  DEPLOY_HOOK: string;
  // Shared secret gating /pending-notification, which mutates state (drains the queue).
  // Optional locally; when unset the route is unauthenticated.
  NOTIFY_SECRET?: string;
}

const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';
const PDS_HOST = 'bsky.social';

// Collections tracked as a full rkey→cid map, so an edit or delete of *any* record (not
// just the newest) is detected. Only actually paginated when the repo rev has moved (see
// poll()) — most minutes cost a single getLatestCommit call.
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

const LIST_RECORDS_PAGE_LIMIT = 100;

type Verb = 'New' | 'Updated' | 'Removed';

// One-line description of a watched change, e.g. "New book", "Updated post". Noun-level
// only — no record parsing. Falls back to the raw collection for anything unmapped.
function describeChange(verb: Verb, collection: string): string {
  const noun = COLLECTION_NOUNS[collection] ?? collection;
  return `${verb} ${noun}`;
}

// rkey → cid for every record currently in a collection.
type CollectionMap = Record<string, string>;
type CollectionsState = Record<string, CollectionMap>;

interface RecordChange {
  verb: Verb;
  rkey: string;
}

// Full-map diff: catches a create/update/delete of *any* record, not just the newest —
// unlike a "compare the newest rkey" check, which misses edits to older records.
function diffCollection(prev: CollectionMap, next: CollectionMap): RecordChange[] {
  const changes: RecordChange[] = [];
  for (const rkey of Object.keys(next)) {
    if (!(rkey in prev)) changes.push({ verb: 'New', rkey });
    else if (prev[rkey] !== next[rkey]) changes.push({ verb: 'Updated', rkey });
  }
  for (const rkey of Object.keys(prev)) {
    if (!(rkey in next)) changes.push({ verb: 'Removed', rkey });
  }
  return changes;
}

// Persisted so it survives DO eviction — surfaced by the /status snapshot.
interface LastChange {
  verb: Verb;
  collection: string;
  rkey: string;
  at: number; // wall-clock ms
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

  // Cheap gate: com.atproto.sync.getLatestCommit's rev changes on *any* commit to the
  // repo — including collections we don't watch (likes, follows, reposts) and the
  // build's own site.standard.document writes. So a rev change doesn't by itself mean a
  // watched collection changed; it just means it's worth checking. Most minutes the rev
  // is unchanged and poll() costs exactly one subrequest.
  //
  // When the rev has moved (or its check failed — fail open rather than going blind),
  // fully paginate every watched collection and diff its rkey→cid map against the stored
  // one. This catches an edit or delete of *any* record, closing the blind spot a
  // "newest record only" check would have.
  private async poll(): Promise<void> {
    // Flush a deploy left pending by a POST that threw a network error last cycle. This
    // has to happen before the early returns below (unchanged rev, or a scan this cycle
    // with nothing changed) — otherwise a failed deploy sits stuck until the next
    // detected change or the hourly fallback, since those early-return paths never
    // reached maybeDeploy() before.
    await this.maybeDeploy();

    const storedRev = await this.state.storage.get<string>('rev');
    const storedCollections = await this.state.storage.get<CollectionsState>('collections');
    const errors: string[] = [];

    const rev = await this.fetchLatestCommitRev(errors);

    // First run (no stored baseline): scan once to establish it and return without
    // deploying, so deploying the Worker itself doesn't fire a spurious rebuild.
    if (!storedCollections) {
      const scanned = await this.scanCollections(errors);
      await this.state.storage.put('collections', scanned);
      await this.maybeAdvanceRev(rev, scanned);
      await this.state.storage.put('lastPollAt', Date.now());
      await this.state.storage.put('lastPollErrors', errors);
      return;
    }

    // Nothing moved — skip the full scan entirely.
    if (rev && rev === storedRev) {
      await this.state.storage.put('lastPollAt', Date.now());
      await this.state.storage.put('lastPollErrors', errors);
      return;
    }

    const scanned = await this.scanCollections(errors);
    const collections: CollectionsState = { ...storedCollections };
    const changes: Array<{ collection: string; verb: Verb; rkey: string }> = [];

    for (const [collection, next] of Object.entries(scanned)) {
      const prev = storedCollections[collection] ?? {};
      const diffs = diffCollection(prev, next);
      if (diffs.length === 0) continue;
      collections[collection] = next;
      for (const { verb, rkey } of diffs) changes.push({ collection, verb, rkey });
    }

    if (changes.length > 0) {
      await this.state.storage.put('collections', collections);

      const count = (await this.state.storage.get<number>('changeCount')) ?? 0;
      await this.state.storage.put('changeCount', count + changes.length);

      const last = changes[changes.length - 1];
      const lastChange: LastChange = { verb: last.verb, collection: last.collection, rkey: last.rkey, at: Date.now() };
      await this.state.storage.put('lastChange', lastChange);

      const pending = (await this.state.storage.get<string[]>('pendingSummary')) ?? [];
      for (const { verb, collection } of changes) {
        if (!SILENT_COLLECTIONS.has(collection)) pending.push(describeChange(verb, collection));
      }
      await this.state.storage.put('pendingSummary', pending);

      await this.state.storage.put('deployPending', true);
    }

    await this.maybeAdvanceRev(rev, scanned);
    await this.state.storage.put('lastPollAt', Date.now());
    await this.state.storage.put('lastPollErrors', errors);

    await this.maybeDeploy();
  }

  // Only persist the new rev once every watched collection scanned cleanly. If a
  // collection's fetch failed this cycle, its stored map is left stale (fine — the
  // caller kept the old value), but advancing rev regardless would mean the cheap
  // rev-gate short-circuits every later cycle until the repo happens to change again —
  // silently deferring detection of anything already sitting in that collection,
  // possibly for days. Withholding rev instead forces a rescan every cycle until the
  // collection succeeds.
  //
  // Trade-off: a persistently failing collection (e.g. its upstream service goes away
  // and starts 4xx-ing) causes a full ~30-request scan every minute instead of the
  // usual single getLatestCommit call. That's still well inside bsky.social's rate
  // limit, and it's loudly visible in lastPollErrors, so it's an acceptable default —
  // but it's a deliberate trade, not an oversight.
  private async maybeAdvanceRev(rev: string | null, scanned: CollectionsState): Promise<void> {
    if (!rev) return;
    if (Object.keys(scanned).length < WATCHED_COLLECTIONS.length) return;
    await this.state.storage.put('rev', rev);
  }

  // Fetch every watched collection's full rkey→cid map in parallel. A collection whose
  // fetch fails is omitted from the result (caller keeps the stored value for it).
  //
  // Subrequest ceiling: the Workers free plan allows 50 subrequests per invocation. A
  // full scan is already ~30 (roughly one listRecords page per ~100 records across all
  // watched collections, plus getLatestCommit, plus an occasional plc.directory lookup).
  // app.bsky.feed.post and com.barryfrost.checkin grow monotonically, so at roughly
  // double today's record counts a scan will start clipping the ceiling and truncate
  // silently into the errors path. No action needed now, but if scans start failing,
  // that's why — the fix is spreading per-collection scans across multiple cycles, or
  // switching to com.atproto.sync.getRepo?since=<rev> CAR diffing instead of per-
  // collection listRecords pagination.
  private async scanCollections(errors: string[]): Promise<CollectionsState> {
    const results = await Promise.all(
      WATCHED_COLLECTIONS.map(async (collection) => ({
        collection,
        map: await this.fetchCollectionMap(collection, errors),
      })),
    );
    const scanned: CollectionsState = {};
    for (const { collection, map } of results) if (map) scanned[collection] = map;
    return scanned;
  }

  private async fetchCollectionMap(collection: string, errors: string[]): Promise<CollectionMap | null> {
    const map: CollectionMap = {};
    let cursor: string | undefined;
    try {
      do {
        const params = new URLSearchParams({ repo: DID, collection, limit: String(LIST_RECORDS_PAGE_LIMIT) });
        if (cursor) params.set('cursor', cursor);
        const res = await fetch(`https://${PDS_HOST}/xrpc/com.atproto.repo.listRecords?${params}`);
        if (!res.ok) {
          errors.push(`${collection}: HTTP ${res.status}`);
          return null;
        }
        const body = (await res.json()) as { records?: Array<{ uri: string; cid: string }>; cursor?: string };
        const records = body.records ?? [];
        for (const record of records) {
          const rkey = record.uri.split('/').pop() ?? '';
          map[rkey] = record.cid;
        }
        // A short page means we've reached the end, regardless of what cursor comes back.
        cursor = records.length === LIST_RECORDS_PAGE_LIMIT ? body.cursor : undefined;
      } while (cursor);
      return map;
    } catch (err) {
      errors.push(`${collection}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // Unlike listRecords, the bsky.social entryway returns 401 (AuthMissing) on
  // getLatestCommit for a repo hosted on its own dedicated PDS shard — the same call
  // works unauthenticated when sent to that shard directly. So this needs the DID's
  // actual PDS host, resolved from its DID document and cached in DO storage (looked up
  // once, not every cycle). If the cached host starts rejecting the call, drop the cache
  // so the next cycle re-resolves rather than failing forever on a stale host.
  private async fetchLatestCommitRev(errors: string[]): Promise<string | null> {
    const host = await this.resolvePdsHost(errors);
    if (!host) return null;
    try {
      const res = await fetch(`https://${host}/xrpc/com.atproto.sync.getLatestCommit?did=${DID}`);
      if (!res.ok) {
        errors.push(`getLatestCommit: HTTP ${res.status}`);
        if (res.status === 401 || res.status === 404) await this.state.storage.delete('pdsHost');
        return null;
      }
      const body = (await res.json()) as { rev?: string };
      return body.rev ?? null;
    } catch (err) {
      errors.push(`getLatestCommit: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async resolvePdsHost(errors: string[]): Promise<string | null> {
    const cached = await this.state.storage.get<string>('pdsHost');
    if (cached) return cached;
    try {
      const res = await fetch(`https://plc.directory/${DID}`);
      if (!res.ok) {
        errors.push(`plc.directory: HTTP ${res.status}`);
        return null;
      }
      const doc = (await res.json()) as { service?: Array<{ type: string; serviceEndpoint: string }> };
      const service = doc.service?.find((s) => s.type === 'AtprotoPersonalDataServer');
      if (!service) {
        errors.push('plc.directory: no AtprotoPersonalDataServer service found');
        return null;
      }
      const host = new URL(service.serviceEndpoint).host;
      await this.state.storage.put('pdsHost', host);
      return host;
    } catch (err) {
      errors.push(`plc.directory: ${err instanceof Error ? err.message : String(err)}`);
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
  // double-drain. Repeats within the window collapse to a "×N" suffix. This atomicity is
  // also why state lives in the DO rather than KV: a plain scheduled Worker writing to KV
  // while a build's GET races the read-modify-write could drop or duplicate a notification.
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
    const [rev, pdsHost, collections, changeCount, lastChange, lastPollAt, lastPollErrors, deployPending, lastDeployAt, lastDeployStatus, pendingSummary] =
      await Promise.all([
        this.state.storage.get<string>('rev'),
        this.state.storage.get<string>('pdsHost'),
        this.state.storage.get<CollectionsState>('collections'),
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
      rev: rev ?? null,
      pdsHost: pdsHost ?? null,
      recordCounts: Object.fromEntries(Object.entries(collections ?? {}).map(([c, m]) => [c, Object.keys(m).length])),
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
    if (url.pathname === '/status') {
      return stub(env).fetch(req);
    }
    if (url.pathname === '/poll' || url.pathname === '/pending-notification') {
      // Gate: both mutate state (poll drives a scan and can trigger a deploy; the drain
      // clears the notification queue), so a random caller shouldn't be able to trigger
      // either. The minute cron doesn't go through this router at all — it calls
      // stub.fetch('/poll') on the DO directly — so this is purely for manual curl
      // debugging. When NOTIFY_SECRET is unset (local dev) both routes are open.
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
      // recovers even with no new record. POST the hook directly rather than via the DO,
      // so this still fires if the DO is wedged.
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
