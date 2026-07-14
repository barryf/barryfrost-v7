export const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';
export const HANDLE = 'barryfrost.com';
export const PDS_HOST = 'bsky.social';

/** HTTP statuses worth retrying — transient server/rate-limit errors, not client mistakes. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * fetch with exponential backoff for transient failures.
 *
 * bsky.social's shared PDS intermittently returns 500s (and the odd 429/503) on
 * otherwise-valid requests. Without retries a single blip aborts the whole build,
 * so we retry retryable statuses and network errors with backoff (0.5s, 1s, 2s)
 * before giving up. Genuine 4xx responses (e.g. 400/404) are returned immediately.
 */
export async function fetchWithRetry(url: string, attempts = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || i >= attempts - 1 || !RETRYABLE_STATUSES.has(res.status)) return res;
    } catch (err) {
      if (i >= attempts - 1) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** i));
  }
}

export async function resolveHandle(did: string): Promise<string> {
  const res = await fetchWithRetry(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`);
  if (!res.ok) return did;
  const data = await res.json() as { handle?: string };
  return data.handle ?? did;
}

export function didFromUri(uri: string): string {
  return uri.replace('at://', '').split('/')[0];
}

interface ListRecordsResponse {
  records: {
    uri: string;
    cid: string;
    value: Record<string, unknown>;
  }[];
  cursor?: string;
}

export async function* fetchAllRecords(
  collection: string,
  did: string = DID,
  host: string = PDS_HOST,
): AsyncGenerator<{ uri: string; cid: string; value: Record<string, unknown> }> {
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({
      repo: did,
      collection,
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);

    const url = `https://${host}/xrpc/com.atproto.repo.listRecords?${params}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      throw new Error(`PDS fetch failed: ${res.status} ${res.statusText} for ${collection}`);
    }

    const data: ListRecordsResponse = await res.json();
    for (const record of data.records) {
      yield record;
    }
    cursor = data.cursor;
  } while (cursor);
}

export function rkeyFromUri(uri: string): string {
  return uri.split('/').pop()!;
}

export function pdslsUrl(atUri: string): string {
  return `https://pdsls.dev/${atUri}`;
}
