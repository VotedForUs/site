/** The breadcrumb trail a path produces, at the root and under a deployment base. */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { getBreadcrumbsFromPath } from './breadcrumbs.js';

describe('getBreadcrumbsFromPath', () => {
  it('is Home alone on the landing page', () => {
    assert.deepEqual(getBreadcrumbsFromPath('/'), [{ label: 'Home', href: '/' }]);
  });

  it('labels each level of a vote page', () => {
    assert.deepEqual(getBreadcrumbsFromPath('/bills/119/hr/1/3'), [
      { label: 'Home', href: '/' },
      { label: 'Bills', href: '/bills' },
      { label: '119th Congress', href: '/bills/119' },
      { label: 'HR', href: '/bills/119/hr' },
      { label: 'HR 1', href: '/bills/119/hr/1' },
      { label: 'Vote 3', href: '/bills/119/hr/1/3' },
    ]);
  });

  it('names the last crumb with the page title, and a segment with the label a page supplies', () => {
    const crumbs = getBreadcrumbsFromPath('/members/S000033', { pageTitle: 'Bernard Sanders' });
    assert.equal(crumbs.at(-1)?.label, 'Bernard Sanders');
    const labelled = getBreadcrumbsFromPath('/members/S000033/x', { labels: { S000033: 'Bernard Sanders' } });
    assert.equal(labelled[2].label, 'Bernard Sanders');
  });

  it('labels the chamber rosters and other top-level pages', () => {
    assert.equal(getBreadcrumbsFromPath('/members/senate')[2].label, 'Senate');
    assert.equal(getBreadcrumbsFromPath('/members/house')[2].label, 'House');
    assert.equal(getBreadcrumbsFromPath('/about')[1].label, 'About');
    assert.equal(getBreadcrumbsFromPath('/changelog')[1].label, 'Changelog');
  });

  it('leaves the deployment base out of the trail and puts every link under it', () => {
    const base = '/site-previews/pr-preview/pr-7/';
    assert.deepEqual(getBreadcrumbsFromPath('/site-previews/pr-preview/pr-7/bills/119', { base }), [
      { label: 'Home', href: '/site-previews/pr-preview/pr-7/' },
      { label: 'Bills', href: '/site-previews/pr-preview/pr-7/bills' },
      { label: '119th Congress', href: '/site-previews/pr-preview/pr-7/bills/119' },
    ]);
    assert.deepEqual(getBreadcrumbsFromPath('/site-previews/pr-preview/pr-7/', { base }), [
      { label: 'Home', href: '/site-previews/pr-preview/pr-7/' },
    ]);
    assert.deepEqual(getBreadcrumbsFromPath('/site-previews/pr-preview/pr-7', { base }).length, 1);
  });

  it('does not mistake a path that merely starts like the base for one under it', () => {
    const crumbs = getBreadcrumbsFromPath('/sitemap', { base: '/site/' });
    assert.equal(crumbs[1].href, '/site/sitemap');
  });
});
