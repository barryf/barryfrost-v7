export const DID = 'did:plc:j5ksi3y4tdtbp7vpsxsfyask';
export const PDS_HOST = 'bsky.social';

export async function resolveHandle(did: string, host: string = PDS_HOST): Promise<string> {
  const res = await fetch(`https://${host}/xrpc/com.atproto.repo.describeRepo?repo=${did}`);
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
    const res = await fetch(url);
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
