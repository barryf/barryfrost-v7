export function plainExcerpt(body: string, maxLen = 160): string {
  const text = body
    .replace(/^#+\s+/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).replace(/\s\S*$/, '') + '…' : text;
}

export function weeknoteLabel(e: { data: { emoji?: string; title: string } }): string {
  return `${e.data.emoji ? e.data.emoji + ' ' : ''}${e.data.title}`;
}
