// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://VotedForUs.github.io',
  base: '/site',
  outDir: '../../dist/site',
  cacheDir: '../../.astro',
  output: 'static',
  devToolbar: {
    enabled: false,
  },
});
