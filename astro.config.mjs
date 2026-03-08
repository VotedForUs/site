// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://votedforus.github.io',
  base: '/site',
  outDir: './dist',
  cacheDir: './.astro',
  output: 'static',
  devToolbar: {
    enabled: false,
  },
});
