import { defineMain } from '@storybook-astro/framework/node';

export default defineMain({
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  staticDirs: ['../public'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
});
