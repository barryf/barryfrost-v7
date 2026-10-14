/**
 * Machine-readable profile details for the SocialSpec endpoints (contactspec.org's
 * /.well-known/contact.vcf and aboutspec.org's /.well-known/about.md). The human pages
 * — /about and /contact — remain the canonical prose.
 */

export const SITE_URL = 'https://barryfrost.com';

export const PROFILE = {
  givenName: 'Barry',
  familyName: 'Frost',
  name: 'Barry Frost',
  email: 'barry@barryfrost.com',
  url: SITE_URL,
  photo: `${SITE_URL}/barryfrost.jpg`,
  summary:
    'Part-time software engineer and full-time technology leader, based in the UK. I build teams, websites and apps.',
  // Services I'm happy to be contacted on, mirroring /contact.
  socialProfiles: [
    { service: 'Mastodon', url: 'https://mastodon.social/@barryf' },
    { service: 'Bluesky', url: 'https://bsky.app/profile/barryfrost.com' },
  ],
} as const;
