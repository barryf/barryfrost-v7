export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  });
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const RELATIVE_CUTOFF_DAYS = 14;

// Intl returns relative phrases lowercase ("today", "yesterday"). Capitalise when the
// date stands alone as a label; leave it as-is mid-sentence ("Posted today").
export function capitaliseDate(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Whole-calendar-day difference in Europe/London (negative = in the past).
function calendarDayDiff(from: Date, to: Date): number {
  const dayNumber = (d: Date) => {
    const [y, m, day] = localParts(d).date.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
  };
  return dayNumber(to) - dayNumber(from);
}

// "2 days ago" / "today" for recent dates; the absolute short date once older than the
// cutoff. Always whole-calendar-day (Europe/London) granularity — never hours or minutes,
// even for timestamped values. Relative to build time, and the site only rebuilds hourly,
// so "2 minutes ago" would sit there stale for up to an hour; "today" stays true all day.
export function formatDateRelative(date: Date, now: Date = new Date()): string {
  const days = calendarDayDiff(now, date);
  if (Math.abs(days) > RELATIVE_CUTOFF_DAYS) return formatDateShort(date);
  const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  return rtf.format(days, 'day');
}

// True when formatDateRelative renders a relative phrase ("today", "3 days ago")
// rather than an absolute date — i.e. the date is within the relative cutoff window.
// Mirrors the branch selection in formatDateRelative so callers can adjust surrounding
// copy (e.g. "Posted 3 days ago" vs "Posted on 22 Apr 2026").
export function isRelativeDate(date: Date, now: Date = new Date()): boolean {
  return Math.abs(calendarDayDiff(now, date)) <= RELATIVE_CUTOFF_DAYS;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// "October 2000" from a "2000-10" travelblog month key.
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return formatMonthYear(new Date(Date.UTC(y, m - 1, 1)));
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

// Human offset label ("GMT+1" / "GMT") for display in title tooltips.
function localOffsetLabel(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  return parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
}

export function toISODate(date: Date): string {
  if (isMidnightUTC(date)) return localParts(date).date;
  const { date: d, time } = localParts(date);
  return `${d}T${time}${localOffset(date)}`;
}

// "4 July 2026 13:45:12 (GMT+1)" when there's a time; "4 July 2026" for all-day dates.
export function formatDateTitle(date: Date): string {
  if (isMidnightUTC(date)) return formatDate(date);
  const { time } = localParts(date);
  return `${formatDate(date)} ${time} (${localOffsetLabel(date)})`;
}

