interface Env {
  LISTENER: DurableObjectNamespace;
  DEPLOY_HOOK: string;
  // Shared secret gating /pending-notification, which mutates state (drains the queue).
  // Optional locally; when unset the route is unauthenticated.
  NOTIFY_SECRET?: string;
}

const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';

// Collections whose changes should trigger a rebuild. Jetstream filters these
// server-side (wantedCollections), so the DO only receives relevant commits.
// Unlike the old poller there is no create-vs-update-vs-delete distinction:
// every commit in a watched collection warrants a rebuild.
const WATCHED_COLLECTIONS = [
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
];

// Human-friendly noun per watched collection, for the deploy notification the build
// pipeline pulls from /pending-notification. Keys mirror WATCHED_COLLECTIONS.
const COLLECTION_NOUNS: Record<string, string> = {
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

const OPERATION_VERBS: Record<string, string> = {
  create: 'New',
  update: 'Updated',
  delete: 'Removed',
};

// One-line description of a watched commit, e.g. "New book", "Updated post". Noun-level
// only — no record parsing. Falls back to the raw collection for anything unmapped.
function describeCommit(operation: string, collection: string): string {
  const verb = OPERATION_VERBS[operation] ?? 'Changed';
  const noun = COLLECTION_NOUNS[collection] ?? collection;
  return `${verb} ${noun}`;
}

// Jetstream host — public Bluesky instance. Cursors are time-based, so any of the
// four instances (jetstream{1,2}.us-{east,west}) is interchangeable on reconnect.
const JETSTREAM_HOST = 'jetstream2.us-east.bsky.network';

const HEARTBEAT_MS = 60_000; // alarm cadence: keeps the DO alive past the 15-min outbound ceiling
const DEBOUNCE_MS = 10_000; // coalesce a burst of commits into a single rebuild
const MAX_WAIT_MS = 60_000; // cap: deploy even if commits keep arriving, so sustained writes can't starve a rebuild
const CURSOR_BUFFER_US = 5_000_000; // replay 5s before the last event for gapless reconnects

interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: 'commit' | 'identity' | 'account';
  commit?: {
    rev: string;
    operation: 'create' | 'update' | 'delete';
    collection: string;
    rkey: string;
  };
}

// Persisted so it survives DO eviction — surfaced by the /ensure status snapshot.
interface LastCommit {
  operation: string;
  collection: string;
  rkey: string;
  timeUs: number;
  at: number; // wall-clock ms when received
}

function buildUrl(cursor: number | undefined): string {
  const params = new URLSearchParams({ wantedDids: DID });
  for (const c of WATCHED_COLLECTIONS) params.append('wantedCollections', c);
  if (cursor) params.set('cursor', String(cursor - CURSOR_BUFFER_US));
  // fetch()-based websocket upgrade uses the https scheme + Upgrade header.
  return `https://${JETSTREAM_HOST}/subscribe?${params}`;
}

export class JetstreamListener implements DurableObject {
  private ws: WebSocket | null = null;
  private wsOpen = false;
  private lastCommitAt = 0; // in-memory; 0 after eviction so a pending deploy fires on wake
  private deployPendingSince = 0; // first commit of the current pending burst
  private deploying = false;
  private connectedAt = 0; // in-memory: when the current socket connected
  private lastEventAt = 0; // in-memory: when any event was last received
  private replayFloor = 0; // cursor at connect: events at or below this are replays, already acted on

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/ensure') {
      await this.ensure();
      return Response.json(await this.status());
    }
    if (url.pathname === '/pending-notification') {
      return Response.json({ message: await this.drainSummary() });
    }
    return new Response(null, { status: 404 });
  }

  // Alarm is the heartbeat: it fires even after the DO is evicted, so the listener
  // self-heals across the 15-min outbound-socket ceiling and any eviction.
  async alarm(): Promise<void> {
    await this.ensure();
  }

  // Reconnect if needed, flush a durably-pending deploy, and reschedule the alarm.
  // Runs from both the liveness fetch and the alarm — same logic on every wake path.
  private async ensure(): Promise<void> {
    await this.connectIfNeeded();
    await this.maybeDeploy();
    await this.state.storage.setAlarm(Date.now() + HEARTBEAT_MS);
  }

  private async connectIfNeeded(): Promise<void> {
    if (this.wsOpen && this.ws) return;
    await this.openSocket();
  }

  private async openSocket(): Promise<void> {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.wsOpen = false;

    const cursor = await this.state.storage.get<number>('cursor');
    // Reconnect replays from cursor−5s, so re-received events (time_us ≤ cursor) were
    // already acted on. Record the floor to dedupe them and avoid phantom rebuilds.
    this.replayFloor = cursor ?? 0;
    const resp = await fetch(buildUrl(cursor), { headers: { Upgrade: 'websocket' } });
    const ws = resp.webSocket;
    if (!ws) {
      console.log(`jetstream upgrade failed: ${resp.status} ${resp.statusText}`);
      return;
    }

    ws.accept();
    this.ws = ws;
    this.wsOpen = true;
    this.connectedAt = Date.now();
    console.log(`connected to jetstream${cursor ? ` (cursor ${cursor})` : ''}`);

    ws.addEventListener('message', (event) => {
      this.onMessage(event).catch((err) => console.log('onMessage error', err));
    });
    ws.addEventListener('close', (event) => {
      console.log(`jetstream closed: ${event.code} ${event.reason}`);
      this.wsOpen = false;
      this.ws = null;
    });
    ws.addEventListener('error', () => {
      console.log('jetstream error');
      this.wsOpen = false;
      this.ws = null;
    });
  }

  private async onMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data !== 'string') return;

    let msg: JetstreamEvent;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    // Advance the cursor on every event so reconnect replay stays tight. Volume is
    // low — the wantedDids filter means we only ever see this one repo's events.
    this.lastEventAt = Date.now();
    if (typeof msg.time_us === 'number') {
      await this.state.storage.put('cursor', msg.time_us);
    }

    if (msg.kind !== 'commit' || !msg.commit) return;
    if (!WATCHED_COLLECTIONS.includes(msg.commit.collection)) return;

    // Ignore replayed commits from the reconnect buffer — acting on them would fire a
    // phantom rebuild on every reconnect when the repo is otherwise idle.
    if (typeof msg.time_us === 'number' && msg.time_us <= this.replayFloor) return;

    const { operation, collection, rkey } = msg.commit;
    console.log(`commit ${operation} ${collection} ${rkey}`);

    const count = (await this.state.storage.get<number>('watchedCommitCount')) ?? 0;
    const lastCommit: LastCommit = { operation, collection, rkey, timeUs: msg.time_us, at: this.lastEventAt };
    await this.state.storage.put('watchedCommitCount', count + 1);
    await this.state.storage.put('lastCommit', lastCommit);

    // Accumulate a noun-level description the next successful build will announce. Durable
    // so it survives DO eviction across the build window; drained by /pending-notification.
    const pending = (await this.state.storage.get<string[]>('pendingSummary')) ?? [];
    pending.push(describeCommit(operation, collection));
    await this.state.storage.put('pendingSummary', pending);

    await this.scheduleDeploy();
  }

  // Debounce: mark a deploy pending (durably) and, on the fast path, fire it ~10s
  // after the last commit. Each commit schedules its own timer; only the one that
  // sees no newer commit fires, so a burst coalesces into a single rebuild.
  private async scheduleDeploy(): Promise<void> {
    const now = Date.now();
    if (this.deployPendingSince === 0) this.deployPendingSince = now;
    this.lastCommitAt = now;
    await this.state.storage.put('deployPending', true);
    setTimeout(() => {
      this.maybeDeploy().catch((err) => console.log('maybeDeploy error', err));
    }, DEBOUNCE_MS);
  }

  // Fire the deploy if a burst has gone quiet for DEBOUNCE_MS, or if it has been
  // pending for MAX_WAIT_MS (so sustained writes can't starve a rebuild). After an
  // eviction the in-memory timers are 0, so a persisted-pending deploy fires on wake.
  private async maybeDeploy(): Promise<void> {
    if (!(await this.state.storage.get<boolean>('deployPending'))) return;
    const now = Date.now();
    const quiet = now - this.lastCommitAt >= DEBOUNCE_MS - 500;
    const capped = this.deployPendingSince > 0 && now - this.deployPendingSince >= MAX_WAIT_MS;
    if (quiet || capped) await this.triggerDeploy();
  }

  // POST the Cloudflare deploy hook. The in-memory guard prevents overlapping fires.
  // The pending flag is cleared once the hook returns *any* response — retrying a
  // non-2xx every 60s would loop forever. Only a network exception (no response)
  // leaves the flag set so the next alarm retries.
  private async triggerDeploy(): Promise<void> {
    if (this.deploying) return;
    if (!(await this.state.storage.get<boolean>('deployPending'))) return;

    this.deploying = true;
    try {
      const res = await fetch(this.env.DEPLOY_HOOK, { method: 'POST' });
      console.log(`deploy hook POST ${res.status}`);
      await this.state.storage.put('lastDeployAt', Date.now());
      await this.state.storage.put('lastDeployStatus', res.status);
      await this.state.storage.put('deployPending', false);
      this.deployPendingSince = 0;
      if (!res.ok) console.log(`deploy hook returned non-2xx (${res.status}) — check DEPLOY_HOOK`);
    } catch (err) {
      console.log('deploy hook network error, will retry on next alarm', err);
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

  // Observable snapshot returned by /ensure — reliable via curl and wrangler tail,
  // unlike the per-message console.logs which fire outside a tracked invocation.
  private async status(): Promise<Record<string, unknown>> {
    const [cursor, watchedCommitCount, lastCommit, lastDeployAt, lastDeployStatus, deployPending, pendingSummary] =
      await Promise.all([
        this.state.storage.get<number>('cursor'),
        this.state.storage.get<number>('watchedCommitCount'),
        this.state.storage.get<LastCommit>('lastCommit'),
        this.state.storage.get<number>('lastDeployAt'),
        this.state.storage.get<number>('lastDeployStatus'),
        this.state.storage.get<boolean>('deployPending'),
        this.state.storage.get<string[]>('pendingSummary'),
      ]);
    const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);
    return {
      now: new Date().toISOString(),
      connected: this.wsOpen,
      connectedAt: iso(this.connectedAt || undefined),
      lastEventAt: iso(this.lastEventAt || undefined),
      cursor: cursor ?? null,
      // cursor is unix microseconds; render the event time it points at
      cursorTime: cursor ? new Date(Math.floor(cursor / 1000)).toISOString() : null,
      watchedCommitCount: watchedCommitCount ?? 0,
      lastCommit: lastCommit ?? null,
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
    if (url.pathname === '/ensure') {
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

  // The */5 cron is a liveness ping; the hourly cron is a belt-and-braces rebuild.
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    if (event.cron === '0 * * * *') {
      // Unconditionally re-trigger a build so a build that failed (e.g. PDS
      // unreachable) recovers even with no new firehose commit. POST the hook
      // directly rather than via the DO, so this still fires if the DO is wedged.
      try {
        const res = await fetch(env.DEPLOY_HOOK, { method: 'POST' });
        console.log(`hourly fallback deploy hook POST ${res.status}`);
      } catch (err) {
        console.log('hourly fallback deploy hook network error', err);
      }
      return;
    }
    // Liveness ping: ensures the singleton DO exists and its alarm is scheduled.
    await stub(env).fetch('https://do/ensure');
  },
};

function stub(env: Env): DurableObjectStub {
  return env.LISTENER.get(env.LISTENER.idFromName('singleton'));
}
