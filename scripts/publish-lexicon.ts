// Publish the com.barryfrost.checkin lexicon doc to the PDS as a
// com.atproto.lexicon.schema record (idempotent upsert via putRecord).
//
// The local file is the canonical source: lexicons/com/barryfrost/checkin.json.
// This just wraps it in the required envelope and puts it under a fixed rkey
// matching the lexicon's own NSID, per the com.atproto.lexicon.schema convention.
//
// Usage: npm run publish:lexicon
import { readFileSync } from 'fs';
import { join } from 'path';
import { createSession, putRecord } from './lib/standard-site.js';

const LEXICON_PATH = join(process.cwd(), 'lexicons/com/barryfrost/checkin.json');
const COLLECTION = 'com.atproto.lexicon.schema';
const RKEY = 'com.barryfrost.checkin';

async function main() {
  const lexiconJson = JSON.parse(readFileSync(LEXICON_PATH, 'utf-8')) as Record<string, unknown>;
  const record = { $type: COLLECTION, ...lexiconJson };

  const session = await createSession();
  console.log(`Authenticated as ${session.did}`);

  const ref = await putRecord(session, COLLECTION, RKEY, record);
  console.log(`Published lexicon → ${ref.uri}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
