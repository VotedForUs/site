import preview from '../../.storybook/preview';
import type { AstroComponentFactory } from '@storybook-astro/renderer/types';
import SiteName from './SiteName.astro';

const meta = preview.meta({
  title: 'Identity/SiteName',
  component: SiteName as unknown as AstroComponentFactory,
  parameters: { layout: 'centered' },
  argTypes: {
    size: { control: 'inline-radio', options: ['header', 'hero'] },
    variant: { control: 'inline-radio', options: ['colour', 'mono'] },
  },
});

/** 21px in site chrome — the header lockup. */
export const HeaderColour = meta.story({ args: { size: 'header', variant: 'colour' } });

/** 44px as a standalone mark. */
export const HeroColour = meta.story({ args: { size: 'hero', variant: 'colour' } });

/** The single-colour treatment at chrome size. */
export const HeaderMono = meta.story({ args: { size: 'header', variant: 'mono' } });

export const HeroMono = meta.story({ args: { size: 'hero', variant: 'mono' } });
