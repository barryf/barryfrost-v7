export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// "2000-10" — the YYYY-MM bucket a (midnight-UTC) date falls in.
export function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// "October 2000" from a "2000-10" month key.
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return formatMonthYear(new Date(Date.UTC(y, m - 1, 1)));
}

// "Sat 14 Oct" — compact weekday + day + month for a within-month entry heading.
export function formatEntryDay(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const TZ = 'Europe/London';

function isMidnightUTC(date: Date): boolean {
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
}

function localParts(date: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

function localOffset(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  if (tzName === 'GMT') return '+00:00';
  const match = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return '+00:00';
  return `${match[1]}${match[2].padStart(2, '0')}:${(match[3] ?? '0').padStart(2, '0')}`;
}

export function toISODate(date: Date): string {
  if (isMidnightUTC(date)) return localParts(date).date;
  const { date: d, time } = localParts(date);
  return `${d}T${time}${localOffset(date)}`;
}

export function formatDateTitle(date: Date): string {
  if (isMidnightUTC(date)) return formatDate(date);
  const { date: d, time } = localParts(date);
  return `${d} ${time}${localOffset(date)}`;
}

