/**
 * Prefixes a root-relative path with Astro `BASE_URL`.
 * Absolute http(s) URLs are unchanged.
 *
 * @param url - Root-relative path (e.g. `/images/legislators/A000055.jpg`) or absolute URL
 * @param base - Astro `import.meta.env.BASE_URL` (defaults to `/`)
 * @returns URL usable as an `href` / `src` under the site base path
 */
export function withBaseUrl(url: string, base: string = '/'): string {
  if (!url || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  if (!normalizedBase) {
    return normalizedPath;
  }
  return `${normalizedBase}${normalizedPath}`;
}
