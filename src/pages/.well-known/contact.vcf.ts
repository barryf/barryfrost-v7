// ContactSpec (https://contactspec.org): a vCard at /.well-known/contact.vcf.
// Content-Type and CORS headers for the deployed file are set in public/_headers —
// the Response headers here only apply under `astro dev`.
import type { APIRoute } from 'astro';
import { PROFILE } from '@/lib/profile';

/** RFC 6350 §3.4 text escaping. */
function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** RFC 6350 §3.2 folding: lines over 75 octets continue on a line starting with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    // Continuation lines spend one octet on the leading space.
    if (size + charSize > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += charSize;
  }
  out.push(current);
  return out.join('\r\n ');
}

export const GET: APIRoute = () => {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `FN:${escape(PROFILE.name)}`,
    `N:${escape(PROFILE.familyName)};${escape(PROFILE.givenName)};;;`,
    `EMAIL;PREF=1:${PROFILE.email}`,
    `URL:${PROFILE.url}`,
    `PHOTO:${PROFILE.photo}`,
    `NOTE:${escape(PROFILE.summary)}`,
    // SOCIALPROFILE is from RFC 9554 (vCard extensions for JSContact).
    ...PROFILE.socialProfiles.map((p) => `SOCIALPROFILE;SERVICE-TYPE=${p.service}:${p.url}`),
    `SOURCE:${PROFILE.url}/.well-known/contact.vcf`,
    'END:VCARD',
  ];
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/vcard; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
};
