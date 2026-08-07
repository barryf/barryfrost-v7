import { fetchAllRecords, fetchWithRetry, DID, PDS_HOST } from './pds';

export interface SifaSelf {
  headline?: string;
  about?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
}

export interface SifaPosition {
  title: string;
  company: string;
  startedAt: string;
  endedAt?: string;
  description?: string;
  entityRef?: string;
}

export interface SifaEducation {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  endedAt?: string;
}

export interface SifaCertification {
  name: string;
  authority: string;
  issuedAt?: string;
  expiresAt?: string;
  credentialUrl?: string;
  entityRef?: string;
}

export interface SifaProject {
  name: string;
  url?: string;
  description?: string;
}

export interface SifaSkill {
  name: string;
  category?: 'technical' | 'business' | 'interpersonal';
}

export interface SifaLanguage {
  name: string;
  proficiency: string;
}

async function collectAll<T = Record<string, unknown>>(collection: string): Promise<T[]> {
  const records: T[] = [];
  for await (const r of fetchAllRecords(collection, DID, PDS_HOST)) {
    records.push(r.value as T);
  }
  return records;
}

function parseYM(ym: string): Date {
  const [year = 1970, month = 1] = ym.split('-').map(Number);
  return new Date(year, month - 1);
}

export async function getSelf(): Promise<SifaSelf | undefined> {
  const [self] = await collectAll<SifaSelf>('id.sifa.profile.self');
  return self;
}

export async function getPositions(): Promise<SifaPosition[]> {
  const positions = await collectAll<SifaPosition>('id.sifa.profile.position');
  return positions.sort((a, b) => parseYM(b.startedAt).getTime() - parseYM(a.startedAt).getTime());
}

export async function getCurrentPosition(): Promise<SifaPosition | undefined> {
  const positions = await getPositions();
  return positions.find(p => !p.endedAt);
}

export async function getEducation(): Promise<SifaEducation[]> {
  return collectAll<SifaEducation>('id.sifa.profile.education');
}

export async function getCertifications(): Promise<SifaCertification[]> {
  const certifications = await collectAll<SifaCertification>('id.sifa.profile.certification');
  // Newest first; undated certifications sort last.
  return certifications.sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? ''));
}

export async function getProjects(): Promise<SifaProject[]> {
  return collectAll<SifaProject>('id.sifa.profile.project');
}

export async function getSkills(): Promise<SifaSkill[]> {
  return collectAll<SifaSkill>('id.sifa.profile.skill');
}

export async function getLanguages(): Promise<SifaLanguage[]> {
  return collectAll<SifaLanguage>('id.sifa.profile.language');
}

const WIKIDATA_ENTITY = /wikidata\.org\/entity\/(Q\d+)$/;
const SIFA_COMPANY = /^https:\/\/sifa\.id\/company\//;

interface WikidataEntityData {
  entities?: Record<string, {
    claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
  }>;
}

/**
 * Sifa identifies a company by `entityRef`, which is either a Wikidata entity URI
 * or a sifa.id company page — neither of them the company's own site. Both sources
 * do expose that site though: Wikidata as claim P856 ("official website"), and
 * sifa.id as `url` on the application/ld+json it content-negotiates for the path.
 */
async function fetchEntityUrl(ref: string): Promise<string | undefined> {
  const wikidata = ref.match(WIKIDATA_ENTITY);
  if (wikidata) {
    const qid = wikidata[1];
    const res = await fetchWithRetry(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
    if (!res.ok) return undefined;
    const data = await res.json() as WikidataEntityData;
    const value = data.entities?.[qid]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
    return typeof value === 'string' ? value : undefined;
  }

  if (SIFA_COMPANY.test(ref)) {
    const res = await fetchWithRetry(ref);
    if (!res.ok) return undefined;
    const data = await res.json() as { url?: string };
    return data.url;
  }

  return undefined;
}

/**
 * Resolve `entityRef`s to company websites, deduplicated so a company held across
 * several positions costs one lookup. Best-effort by design: these are third-party
 * sources outside the PDS, so an unreachable one means an unlinked company name
 * rather than a failed build.
 */
export async function resolveEntityUrls(refs: (string | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(refs.filter((ref): ref is string => Boolean(ref)))];
  const urls = new Map<string, string>();
  await Promise.all(unique.map(async ref => {
    try {
      const url = await fetchEntityUrl(ref);
      if (url) urls.set(ref, url);
    } catch {
      // Leave it unlinked.
    }
  }));
  return urls;
}

export function formatLocation(self: SifaSelf | undefined): string | undefined {
  const loc = self?.location;
  if (!loc) return undefined;
  return [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || undefined;
}

export { parseYM };
