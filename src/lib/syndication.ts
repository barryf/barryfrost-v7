import { getCollection } from 'astro:content';

/** Matches a Bluesky post permalink. Mirrors the test publish-standard-site.ts applies to
 *  frontmatter when it decides whether an authored URL should override `bskyPostRef`. */
const BSKY_POST = /bsky\.app\/.+\/post\//;

/**
 * rkey → Bluesky URL, read once per build. The loader only stores records that carry a
 * `bskyPostRef`, so a per-post `getEntry` logged a "not found" warning for every other post
 * — on every page that lists it. Dev re-reads each call so edits to the store show up.
 */
let bskyUrls: Promise<Map<string, string>> | undefined;
function bskyUrlsByRkey(): Promise<Map<string, string>> {
  if (!bskyUrls || import.meta.env.DEV) {
    bskyUrls = getCollection('standardDocuments').then(
      (docs) => new Map(docs.map((doc) => [doc.id, doc.data.bskyUrl])),
    );
  }
  return bskyUrls;
}

/**
 * A post's syndication URLs: whatever the frontmatter lists, plus the Bluesky card post
 * recorded on its site.standard.document record.
 *
 * Frontmatter stays canonical and wins — a file that already names a bsky.app URL keeps
 * exactly that one, which is both how the older backfilled posts stay untouched and how a
 * hand-replaced card post overrides a stale `bskyPostRef`. Everything published since v7
 * gets its Bluesky link from the record instead, so no commit is needed after the card
 * post is created: the poller sees the new app.bsky.feed.post and the next build picks the
 * ref up on its own.
 */
export async function resolveSyndication(
  urls: string[] | undefined,
  standardRkey: string | undefined,
): Promise<string[] | undefined> {
  if (!standardRkey || urls?.some((url) => BSKY_POST.test(url))) return urls;

  const bskyUrl = (await bskyUrlsByRkey()).get(standardRkey);
  if (!bskyUrl) return urls;

  return [...(urls ?? []), bskyUrl];
}
