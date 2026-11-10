// @ts-check
import { defineConfig } from 'astro/config';

// BASE_URL env var sets the deploy subpath (e.g. '/site' on GitHub Pages).
// Defaults to '/' so local dev works at http://localhost:4321/
const base = process.env.BASE_URL ?? '/';

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
});
