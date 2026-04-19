import { fetchAllRecords, DID, PDS_HOST } from './pds';

export interface SifaSelf {
  headline?: string;
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
}

export interface SifaEducation {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  endedAt?: string;
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

export async function getProjects(): Promise<SifaProject[]> {
  return collectAll<SifaProject>('id.sifa.profile.project');
}

export async function getSkills(): Promise<SifaSkill[]> {
  return collectAll<SifaSkill>('id.sifa.profile.skill');
}

export async function getLanguages(): Promise<SifaLanguage[]> {
  return collectAll<SifaLanguage>('id.sifa.profile.language');
}

export function formatLocation(self: SifaSelf | undefined): string | undefined {
  const loc = self?.location;
  if (!loc) return undefined;
  return [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || undefined;
}

export { parseYM };
