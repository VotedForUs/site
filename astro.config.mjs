// @ts-check
import { defineConfig } from 'astro/config';

// BASE_URL env var sets the deploy subpath (e.g. '/site' on GitHub Pages).
// Defaults to '/' so local dev works at http://localhost:4321/
const base = process.env.BASE_URL ?? '/';

/**
 * The member drill-down rewrite, in `astro dev` and `astro preview`.
 *
 * A member's votes on one bill live at /members/{bioguide}/{term}/{billId},
 * which is not a document — there would be 267,511 of them. In production
 * `public/_redirects` tells Cloudflare Pages to serve that member's own page
 * for any deeper path, and `vfu-member-record` reads the path and opens the
 * bill. `_redirects` is a hosting feature, so the local servers need the same
 * rewrite or those URLs 404 locally and only locally.
 *
 * @param {{ middlewares: { use: (fn: Function) => void } }} server
 */
function applyMemberDrillDownRewrite(server) {
  server.middlewares.use((req, _res, next) => {
    const match = /^(\/members\/[A-Za-z0-9]+)\/\d+\/[a-z]+-\d+(?:\/\d+)?\/?(\?.*)?$/.exec(req.url ?? '');
    if (match) req.url = match[1];
    next();
  });
}

/** @type {import('vite').Plugin} */
const memberDrillDownRewrite = {
  name: 'vfu-member-drilldown-rewrite',
  configureServer: applyMemberDrillDownRewrite,
  configurePreviewServer: applyMemberDrillDownRewrite,
};

// https://astro.build/config
export default defineConfig({
  site: 'https://votedfor.us',
  base,
  outDir: './dist',
  cacheDir: './.astro',
  output: 'static',
  devToolbar: {
    enabled: false,
  },
  /*
   * ClientRouter turns prefetching on, and its default is to fetch a link's
   * page as soon as the pointer touches it. Every destination here is a whole
   * document — a member page is 334 KB — and the lists are 545 and 606 rows
   * long, so hovering down one would pull hundreds of megabytes for pages
   * nobody asked for. `tap` waits for the press instead, which still starts
   * the fetch before the click completes.
   */
  prefetch: {
    defaultStrategy: 'tap',
  },
  vite: {
    plugins: [memberDrillDownRewrite],
  },
});
