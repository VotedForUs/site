// @ts-check
import { defineConfig } from 'astro/config';

// BASE_URL env var sets the deploy subpath (e.g. '/site' on GitHub Pages).
// Defaults to '/' so local dev works at http://localhost:4321/
const base = process.env.BASE_URL ?? '/';

// https://astro.build/config
export default defineConfig({
  site: 'https://votedforus.github.io',
  base,
  outDir: './dist',
  cacheDir: './.astro',
  output: 'static',
  devToolbar: {
    enabled: false,
  },
});
