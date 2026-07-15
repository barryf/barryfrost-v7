// Publish articles/weeknotes as site.standard.document records (idempotent upsert).
//
// The PDS record is the source of truth: for each post we getRecord by its frontmatter
// `standardRkey`, and only putRecord when the content changed. A companion Bluesky post
// (rich link card) is created once, on a document's first publish in incremental mode, and
// its strong-ref is stored in `bskyPostRef` — the presence of that ref prevents any second
// post. In --backfill mode no new Bluesky posts are created; an existing bsky.app URL from
// the file's `syndication` frontmatter is reused as the ref where present.
//
// Usage:
//   npm run publish:standard -- [--backfill] [--dry-run] [--only <slug>] [--collection <name>]
import {
  readEntries, isPublishable, buildDocumentRecord, buildBlueskyPost,
  documentContentSignature, canonicalUrl, DOCUMENT_COLLECTION, PUBLICATIONS,
  createSession, getRecord, putRecord, createRecord, resolveBskyPostRef,
  resolveCoverImage, fetchOgImageUrl,
  type CollectionName, type Entry, type Session, type StrongRef, type BlobRef,
} from './lib/standard-site.js';

interface Args {
  backfill: boolean;
  dryRun: boolean;
  only?: string;
  collection?: CollectionName;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { backfill: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--backfill') args.backfill = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--collection') args.collection = argv[++i] as CollectionName;
  }
  return args;
}

function bskyUrlFromSyndication(entry: Entry): string | undefined {
  return entry.data.syndication?.find((u) => /bsky\.app\/.+\/post\//.test(u));
}

type Action = 'create' | 'update' | 'skip';

async function processEntry(entry: Entry, args: Args, session: Session | null): Promise<Action> {
  const rkey = entry.data.standardRkey!;
  const existing = session ? await getRecord(session, DOCUMENT_COLLECTION, rkey) : null;
  const existingRef = existing?.value.bskyPostRef as StrongRef | undefined;
  const existingCover = existing?.value.coverImage as BlobRef | undefined;

  const desiredNoRef = buildDocumentRecord(entry);
  const contentChanged = !existing || documentContentSignature(existing.value) !== documentContentSignature(desiredNoRef);

  // Resolve the Bluesky ref we should end up with (without posting yet).
  let bskyRef: StrongRef | undefined = existingRef;
  if (!bskyRef) {
    const syndicationUrl = bskyUrlFromSyndication(entry);
    if (syndicationUrl && session) bskyRef = (await resolveBskyPostRef(session, syndicationUrl)) ?? undefined;
  }

  // Resolve the coverImage we should end up with — attached once, then sticky (like bskyRef).
  // Unlike Bluesky posting this is a harmless enrichment, so it runs in both incremental and
  // --backfill modes: every published post already has a live page to read its og:image from.
  // The actual upload is a real PDS write, so it's skipped under --dry-run in favour of a
  // read-only peek at what would be attached.
  let coverImage: BlobRef | undefined = existingCover;
  let coverPreviewUrl: string | undefined;
  if (!existingCover && session) {
    if (args.dryRun) coverPreviewUrl = await fetchOgImageUrl(entry);
    else coverImage = (await resolveCoverImage(session, entry)) ?? undefined;
  }
  const willAttachCover = !!coverImage || !!coverPreviewUrl;

  const needsWrite = contentChanged
    || (!!bskyRef && !!existing && !existingRef)
    || (willAttachCover && !!existing);
  if (!needsWrite) {
    console.log(`  = skip   ${entry.collection}/${entry.slug}`);
    return 'skip';
  }

  // Create a fresh Bluesky post only when publishing new/changed content in incremental
  // mode with no ref available from an existing record or syndication.
  const wantNewPost = needsWrite && !bskyRef && !args.backfill;
  if (wantNewPost) {
    const post = buildBlueskyPost(entry);
    if (args.dryRun) {
      console.log(`    would post to Bluesky: ${JSON.stringify(post.text)} → card ${canonicalUrl(entry)}`);
    } else if (session) {
      bskyRef = await createRecord(session, 'app.bsky.feed.post', post as unknown as Record<string, unknown>);
      console.log(`    posted to Bluesky: ${bskyRef.uri}`);
    }
  }

  if (args.dryRun && !existingCover) {
    console.log(coverPreviewUrl
      ? `    would attach coverImage from: ${coverPreviewUrl}`
      : `    no body image — no coverImage`);
  }

  const record = buildDocumentRecord(entry, bskyRef, coverImage);
  if (existing) record.updatedAt = new Date().toISOString();

  const action: Action = existing ? 'update' : 'create';
  if (args.dryRun) {
    console.log(`  ${action === 'create' ? '+ create' : '~ update'} ${entry.collection}/${entry.slug} (dry-run)`);
  } else if (session) {
    await putRecord(session, DOCUMENT_COLLECTION, rkey, record as unknown as Record<string, unknown>);
    console.log(`  ${action === 'create' ? '+ create' : '~ update'} ${entry.collection}/${entry.slug}`);
  }
  return action;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const collections: CollectionName[] = args.collection ? [args.collection] : ['articles', 'weeknotes'];

  // Publications must exist (URIs pasted into src/lib/standard-site.ts) before real writes.
  const missing = collections.filter((c) => !PUBLICATIONS[c].uri);
  if (missing.length && !args.dryRun) {
    console.error(`Missing publication URI for: ${missing.join(', ')}. Run \`npm run standard:pubs\` and paste the AT-URIs into src/lib/standard-site.ts first.`);
    process.exit(1);
  }

  let session: Session | null = null;
  try {
    session = await createSession();
    console.log(`Authenticated as ${session.did}${args.backfill ? ' (backfill: no new Bluesky posts)' : ''}\n`);
  } catch (err) {
    if (!args.dryRun) throw err;
    console.log(`(offline dry-run — ${(err as Error).message})\n`);
  }

  const counts: Record<Action, number> = { create: 0, update: 0, skip: 0 };
  for (const c of collections) {
    const publishable = readEntries(c).filter(isPublishable);

    const withoutRkey = publishable.filter((e) => !e.data.standardRkey).length;
    if (withoutRkey) {
      console.log(`  (${c}: ${withoutRkey} publishable file(s) have no standardRkey — run \`npm run standard:rkeys\`)`);
    }

    const entries = publishable
      .filter((e) => e.data.standardRkey)
      .filter((e) => !args.only || e.slug === args.only)
      .sort((a, b) => new Date(a.data.date ?? 0).getTime() - new Date(b.data.date ?? 0).getTime());

    for (const entry of entries) counts[await processEntry(entry, args, session)] += 1;
  }

  console.log(`\nDone. created=${counts.create} updated=${counts.update} skipped=${counts.skip}${args.dryRun ? ' (dry-run)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
