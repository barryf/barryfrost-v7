/**
 * The shared Astro container used to render post bodies to HTML strings at build time
 * (feeds in feed-items.ts, social descriptions and images in social.ts).
 *
 * The MDX renderer must be registered or an `.mdx` body throws NoMatchingRenderer — MDX
 * compiles to JSX, which a bare container has no renderer for. One container serves the
 * whole build; creating one per entry is needless overhead.
 */

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx';

type Container = Awaited<ReturnType<typeof AstroContainer.create>>;

let container: Promise<Container> | undefined;

async function create(): Promise<Container> {
  return AstroContainer.create({ renderers: await loadRenderers([mdxRenderer()]) });
}

export function getContainer(): Promise<Container> {
  container ??= create();
  return container;
}
