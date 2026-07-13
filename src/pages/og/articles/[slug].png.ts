import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { IS_PROD, R2_CONFIGURED } from '@/lib/r2';
import { ogCardBuffer, articleCardData } from '@/lib/og-store';

export const prerender = true;

// With R2 configured, cards live in R2 (see og-store) — emit no local files.
// In dev and credential-less PR builds, render each article card here.
export async function getStaticPaths() {
  if (IS_PROD && R2_CONFIGURED) return [];
  const articles = await getCollection('articles');
  return articles.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await ogCardBuffer(articleCardData(props.entry as CollectionEntry<'articles'>));
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
