import type { Loader } from 'astro/loaders';
import { fetchAllRecords, rkeyFromUri, resolveHandle, didFromUri, DID, PDS_HOST } from '@/lib/pds';
import { remoteImage } from '@/lib/image-store';

interface DidDocument {
  service?: { id: string; type: string; serviceEndpoint: string }[];
}

async function resolvePdsHost(did: string): Promise<string> {
  try {
    const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
    if (!res.ok) return PDS_HOST;
    const doc = await res.json() as DidDocument;
    const pdsService = doc.service?.find(s => s.id === '#atproto_pds');
    if (!pdsService) return PDS_HOST;
    return new URL(pdsService.serviceEndpoint).hostname;
  } catch {
    return PDS_HOST;
  }
}

interface PublicationRecord {
  name?: string;
  description?: string;
  url?: string;
  base_path?: string;
  icon?: { ref?: { $link?: string }; mimeType?: string };
}

export function subscriptionsLoader(): Loader {
  return {
    name: 'subscriptions-loader',
    async load({ store, logger, generateDigest }) {
      logger.info('Fetching Standard subscriptions');
      store.clear();

      try {
        for await (const record of fetchAllRecords('site.standard.graph.subscription', DID, PDS_HOST)) {
          const value = record.value as Record<string, unknown>;
          const rkey = rkeyFromUri(record.uri);
          const publicationUri = value.publication as string;

          const subjectDid = didFromUri(publicationUri);
          const uriParts = publicationUri.replace('at://', '').split('/');
          const collection = uriParts[1];
          const pubRkey = uriParts[2];

          const pdsHost = await resolvePdsHost(subjectDid);

          const getRecordUrl = `https://${pdsHost}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(subjectDid)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(pubRkey)}`;
          const pubRes = await fetch(getRecordUrl);
          if (!pubRes.ok) {
            logger.warn(`Could not fetch publication record for ${publicationUri}`);
            continue;
          }
          const pubData = await pubRes.json() as { value: PublicationRecord; cid: string };
          const pub = pubData.value;

          const siteUrl = pub.url ?? (pub.base_path ? `https://${pub.base_path}` : undefined);
          if (!siteUrl) {
            logger.warn(`No URL in publication record ${publicationUri}`);
            continue;
          }

          const rawIconUrl = pub.icon?.ref?.$link
            ? `https://${pdsHost}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(subjectDid)}&cid=${pub.icon.ref.$link}`
            : undefined;
          const iconUrl = rawIconUrl
            ? await remoteImage(rawIconUrl, { width: 96, height: 96, fit: 'cover' })
            : undefined;

          const handle = await resolveHandle(subjectDid, pdsHost);

          store.set({
            id: rkey,
            data: {
              name: pub.name ?? handle,
              description: pub.description,
              siteUrl,
              iconUrl,
              handle,
            },
            digest: generateDigest(record.cid),
          });
        }
      } catch (err) {
        logger.warn(`Subscriptions fetch failed, skipping: ${err}`);
      }
    },
  };
}
