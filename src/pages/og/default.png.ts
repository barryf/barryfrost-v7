import type { APIRoute } from 'astro';
import { ogCardBuffer } from '@/lib/og-store';

export const prerender = true;

// The branded default card (dev / no-creds fallback for /og/default.png).
export const GET: APIRoute = async () => {
  const png = await ogCardBuffer({ kind: 'default' });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
