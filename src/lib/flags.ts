// Countries are stored as ISO 3166-1 alpha-2 codes (e.g. "GB", "NZ") in each
// travelblog month's frontmatter. Flag and name are derived from the code, so
// there's no lookup table to maintain and no stray Unicode in the source.

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

// "GB" → 🇬🇧 by mapping each letter to its regional-indicator symbol.
export function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

// "GB" → "United Kingdom"; falls back to the raw code if unrecognised.
export function countryName(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
