// @ts-check
import { defineConfig } from 'astro/config';

// BASE_URL env var sets the deploy subpath (e.g. '/site' on GitHub Pages).
// Defaults to '/' so local dev works at http://localhost:4321/
const base = process.env.BASE_URL ?? '/';

/**
 * Routes that exist only under `astro dev`.
 *
 * `/social-card-capture` renders one share card and nothing else, at exactly
 * 1200×630, for `npm run social-cards` to screenshot. It is injected here
 * rather than kept in `src/pages/` so no build can ever emit it.
 */
/** @type {import('astro').AstroIntegration} */
const devOnlyRoutes = {
  name: 'vfu-dev-only-routes',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command !== 'dev') return;
      injectRoute({
        pattern: '/social-card-capture',
        entrypoint: './src/dev/social-card-capture.astro',
        prerender: false,
      });
    },
  },
};

// https://astro.build/config
export default defineConfig({
  // SITE_URL moves the origin for a PR preview; see utils/seoConfig.ts.
  site: process.env.SITE_URL?.replace(/\/+$/, '') || 'https://votedfor.us',
  base,
  outDir: './dist',
  cacheDir: './.astro',
  output: 'static',
  integrations: [devOnlyRoutes],
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
});
