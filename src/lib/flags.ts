// Flag emoji for the countries visited on the 2000–2001 travelblog.
// Keyed by the country name used in each month's frontmatter `countries` array.
const FLAGS: Record<string, string> = {
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'United Kingdom': '🇬🇧',
  Britain: '🇬🇧',
  Thailand: '🇹🇭',
  'New Zealand': '🇳🇿',
  Australia: '🇦🇺',
  Fiji: '🇫🇯',
  USA: '🇺🇸',
  'United States': '🇺🇸',
};

export function countryFlag(name: string): string {
  return FLAGS[name] ?? '';
}
