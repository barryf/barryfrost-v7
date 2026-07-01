// build.format: 'file' means Astro.url.pathname includes the .html/index.html
// suffix at build time; strip it to get the logical route path.
export function cleanPathname(pathname: string): string {
  return pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
}
