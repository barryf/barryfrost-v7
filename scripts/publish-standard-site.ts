// Publish articles/weeknotes as site.standard.document records (idempotent upsert).
//
// The PDS record is the source of truth: for each post we getRecord by its frontmatter
// `standardRkey`, and only putRecord when the content changed. A companion Bluesky post
// (rich link card) is created once, on a document's first publish in incremental mode, and
// its strong-ref is stored in `bskyPostRef` — the presence of that ref prevents any second
// post. That post's external embed carries `associatedRefs` (document + publication) so
// Bluesky renders the enhanced Standard Site card, which is why a new post writes the
// document record twice: once to mint the ref, once to store `bskyPostRef`. In --backfill
// mode no new Bluesky posts are created; an existing bsky.app URL from the file's
// `syndication` frontmatter is reused as the ref where present.
//
// Local Markdown stays canonical, so an authored bsky.app URL in `syndication` frontmatter
// always wins over the record's `bskyPostRef` — that is how a hand-replaced Bluesky post
// repoints a stale ref. --sync-syndication additionally closes the reverse gap, writing a
// record's ref back into frontmatter for posts whose card post was created by a CI run that
// had no way to commit to the repo. It is opt-in precisely so CI never takes that path.
//
// Usage:
//   npm run publish:standard -- [--backfill] [--dry-run] [--sync-syndication]
//                               [--only <slug>] [--collection <name>]
import { readFileSync, writeFileSync } from 'fs';
import {
  readEntries, isPublishable, buildDocumentRecord, buildBlueskyPost,
  documentContentSignature, canonicalUrl, DOCUMENT_COLLECTION, PUBLICATIONS, documentUri,
  createSession, getRecord, putRecord, createRecord, resolveBskyPostRef, getPublicationRef,
  resolveCoverImage, fetchOgImageUrl, withResolvedImages, addSyndicationUrl, setBskyPostFalse,
  bskyUrlFromRef,
  type CollectionName, type Entry, type Session, type StrongRef, type BlobRef,
} from './lib/standard-site.js';

interface Args {
  backfill: boolean;
  dryRun: boolean;
  syncSyndication: boolean;
  only?: string;
  collection?: CollectionName;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { backfill: false, dryRun: false, syncSyndication: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--backfill') args.backfill = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--sync-syndication') args.syncSyndication = true;
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--collection') args.collection = argv[++i] as CollectionName;
  }
  return args;
}

function bskyUrlFromSyndication(entry: Entry): string | undefined {
  return entry.data.syndication?.find((u) => /bsky\.app\/.+\/post\//.test(u));
}

type Action = 'create' | 'update' | 'skip';

async function processEntry(source: Entry, args: Args, session: Session | null): Promise<Action> {
  // Build-time-only image paths are resolved against the live page before anything reads the
  // body, so the record, its signature and the Bluesky post all agree on absolute URLs.
  const entry = await withResolvedImages(source);
  const rkey = entry.data.standardRkey!;
  const existing = session ? await getRecord(session, DOCUMENT_COLLECTION, rkey) : null;
  const existingRef = existing?.value.bskyPostRef as StrongRef | undefined;
  const existingCover = existing?.value.coverImage as BlobRef | undefined;

  const desiredNoRef = buildDocumentRecord(entry);
  const contentChanged = !existing || documentContentSignature(existing.value) !== documentContentSignature(desiredNoRef);

  // Resolve the Bluesky ref we should end up with (without posting yet). Frontmatter is the
  // canonical side: an authored URL that still resolves overrides the record's ref, so
  // deleting a card post and linking its replacement is enough to correct `bskyPostRef`. An
  // authored URL that no longer resolves is reported and ignored rather than clobbering.
  let bskyRef: StrongRef | undefined = existingRef;
  const authoredUrl = bskyUrlFromSyndication(entry);
  if (authoredUrl && session && (!existingRef || bskyUrlFromRef(existingRef) !== authoredUrl)) {
    const resolved = await resolveBskyPostRef(session, authoredUrl);
    if (resolved) {
      if (existingRef) console.log(`    repoint bskyPostRef → ${authoredUrl} (record had ${bskyUrlFromRef(existingRef)})`);
      bskyRef = resolved;
    } else {
      console.warn(`    ! frontmatter bsky URL does not resolve: ${authoredUrl}${existingRef ? ' — keeping the record ref' : ''}`);
    }
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

  // The reverse direction: a record ref the frontmatter doesn't know about. Runs before the
  // skip below, since the steady state for these is a record that needs no write at all.
  let suppressPost = source.data.bskyPost === false;
  if (args.syncSyndication && bskyRef && !authoredUrl && session) {
    const url = bskyUrlFromRef(bskyRef);
    if (await resolveBskyPostRef(session, url)) {
      if (args.dryRun) console.log(`    would add to frontmatter: ${url}`);
      else {
        writeFileSync(source.filePath, addSyndicationUrl(readFileSync(source.filePath, 'utf-8'), url));
        console.log(`    frontmatter += ${url}`);
      }
    } else {
      // The post is gone and no authored URL replaces it: drop the dead ref, and record the
      // deliberate absence in frontmatter so a later content edit can't republish an old
      // post — clearing the ref alone would remove the only "already posted" guard.
      bskyRef = undefined;
      suppressPost = true;
      if (args.dryRun) console.log(`    would clear dead bskyPostRef (${url}) and set bskyPost: false`);
      else {
        writeFileSync(source.filePath, setBskyPostFalse(readFileSync(source.filePath, 'utf-8')));
        console.log(`    cleared dead bskyPostRef (${url}); frontmatter bskyPost: false`);
      }
    }
  }

  // Compares both directions, so clearing a ref counts as a change, not just gaining one.
  const refChanged = !!existing && (existingRef?.uri ?? null) !== (bskyRef?.uri ?? null);
  const needsWrite = contentChanged || refChanged || (willAttachCover && !!existing);
  if (!needsWrite) {
    console.log(`  = skip   ${entry.collection}/${entry.slug}`);
    return 'skip';
  }

  // Create a fresh Bluesky post only when publishing new/changed content in incremental
  // mode with no ref available from an existing record or syndication.
  const wantNewPost = needsWrite && !bskyRef && !args.backfill && !suppressPost;

  if (args.dryRun && !existingCover) {
    console.log(coverPreviewUrl
      ? `    would attach coverImage from: ${coverPreviewUrl}`
      : `    no body image — no coverImage`);
  }

  const action: Action = existing ? 'update' : 'create';
  const label = `  ${action === 'create' ? '+ create' : '~ update'} ${entry.collection}/${entry.slug}`;

  const writeDocument = async (ref: StrongRef | undefined): Promise<StrongRef | null> => {
    const record = buildDocumentRecord(entry, ref, coverImage);
    if (existing) record.updatedAt = new Date().toISOString();
    if (!session) return null;
    return await putRecord(session, DOCUMENT_COLLECTION, rkey, record as unknown as Record<string, unknown>);
  };

  if (args.dryRun) {
    if (wantNewPost) {
      console.log(`    would post to Bluesky: card-only → ${canonicalUrl(entry)}`);
      console.log(`    would attach associatedRefs: ${documentUri(rkey)} + ${PUBLICATIONS[entry.collection].uri}`);
    }
    console.log(`${label} (dry-run)`);
    return action;
  }
  if (!session) return action;

  if (wantNewPost) {
    // The post's associatedRefs need the document's strong ref, so the record has to land
    // first; the ref comes back from that write and the record is re-put with bskyPostRef.
    const docRef = await writeDocument(undefined);
    const pubRef = await getPublicationRef(session, entry.collection);
    const refs = [docRef, pubRef].filter((r): r is StrongRef => !!r);
    const post = buildBlueskyPost(entry, undefined, refs);
    bskyRef = await createRecord(session, 'app.bsky.feed.post', post as unknown as Record<string, unknown>);
    console.log(`    posted to Bluesky: ${bskyRef.uri} (associatedRefs: ${refs.length})`);
  }

  await writeDocument(bskyRef);
  console.log(label);
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
