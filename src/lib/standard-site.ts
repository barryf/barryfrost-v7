// Standard.site (site.standard.*) publishing config — the single source of truth shared
// by the build (verification <link> tags), the .well-known files, and the publish scripts.
//
// Articles and weeknotes are syndicated to the AT Protocol long-form ecosystem as
// `site.standard.document` records grouped under two `site.standard.publication` records.
// See scripts/publish-standard-site.ts and the plan for the full flow.
import { DID } from './pds';

export { DID };
export const DOCUMENT_COLLECTION = 'site.standard.document';
export const PUBLICATION_COLLECTION = 'site.standard.publication';

/** The canonical production origin, and where v7 is deployed (mirrors astro.config.mjs
 *  `site:`). Used for publication URLs and to fetch a post's rendered og:image for
 *  Standard Site's coverImage. */
export const SITE_ORIGIN = 'https://barryfrost.com';

export interface PublicationConfig {
  /** Base URL — combined with a document `path` to form the canonical URL. No trailing slash. */
  readonly url: string;
  /** The publication record's at:// URI. Filled in by scripts/create-standard-publications.ts. */
  readonly uri: string;
}

/** Keyed by content collection name. `uri` is empty until the publication records exist —
 *  paste the AT-URIs printed by scripts/create-standard-publications.ts here. The
 *  /.well-known endpoints and per-page verification <link> tags derive from this config. */
export const PUBLICATIONS: Record<'articles' | 'weeknotes', PublicationConfig> = {
  articles: {
    url: `${SITE_ORIGIN}/articles`,
    uri: 'at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/site.standard.publication/3ms6nt2pxna2e',
  },
  weeknotes: {
    url: `${SITE_ORIGIN}/weeknotes`,
    uri: 'at://did:plc:j5ksi3y4tdtbp7vpsxsfyask/site.standard.publication/3ms6nt2xzap2v',
  },
};

/** at:// URI of a document record given its rkey. */
export function documentUri(rkey: string): string {
  return `at://${DID}/${DOCUMENT_COLLECTION}/${rkey}`;
}

/** Standard Reader's web view of a document record — the readable face of the at:// URI. */
export function standardReaderUrl(rkey: string): string {
  return `https://standard-reader.app/a/${DID}/${rkey}`;
}
