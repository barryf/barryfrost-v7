/**
 * Weeknote permalinks are prefixed with `week-` so numeric IDs don't collide
 * with the /section/N pagination URL pattern (e.g. /weeknotes/250 would read
 * as page 250).
 */
export function weeknoteUrl(id: string): string {
  return `/weeknotes/week-${id}`;
}
