interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: { $type: string; uri?: string; did?: string; tag?: string }[];
}

export function renderRichText(text: string, facets: Facet[]): string {
  if (!facets || facets.length === 0) {
    return escapeHtml(text);
  }

  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  const decoder = new TextDecoder();

  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  let html = '';
  let lastByte = 0;

  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index;

    if (byteStart > lastByte) {
      html += escapeHtml(decoder.decode(encoded.slice(lastByte, byteStart)));
    }

    const facetText = escapeHtml(decoder.decode(encoded.slice(byteStart, byteEnd)));
    const feature = facet.features[0];

    if (feature?.$type === 'app.bsky.richtext.facet#link') {
      html += `<a class="underline" href="${escapeAttr(feature.uri!)}" rel="nofollow noopener" target="_blank">${facetText}</a>`;
    } else if (feature?.$type === 'app.bsky.richtext.facet#mention') {
      html += `<a class="underline" href="https://bsky.app/profile/${escapeAttr(feature.did!)}">${facetText}</a>`;
    } else if (feature?.$type === 'app.bsky.richtext.facet#tag') {
      html += `<a class="underline" href="https://bsky.app/hashtag/${escapeAttr(feature.tag!)}">${facetText}</a>`;
    } else {
      html += facetText;
    }

    lastByte = byteEnd;
  }

  if (lastByte < encoded.length) {
    html += escapeHtml(decoder.decode(encoded.slice(lastByte)));
  }

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/&/g, '&amp;');
}
