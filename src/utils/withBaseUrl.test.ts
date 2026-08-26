import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withBaseUrl } from './withBaseUrl.js';

describe('withBaseUrl', () => {
  it('leaves root-relative paths unchanged when base is /', () => {
    assert.equal(withBaseUrl('/images/legislators/A000055.jpg', '/'), '/images/legislators/A000055.jpg');
  });

  it('prefixes a GH Pages subpath base', () => {
    assert.equal(
      withBaseUrl('/images/legislators/A000055.jpg', '/site/'),
      '/site/images/legislators/A000055.jpg',
    );
    assert.equal(
      withBaseUrl('/images/legislators/A000055.jpg', '/site'),
      '/site/images/legislators/A000055.jpg',
    );
  });

  it('leaves absolute http(s) URLs unchanged', () => {
    assert.equal(
      withBaseUrl('https://www.congress.gov/img/member/a000055_200.jpg', '/site/'),
      'https://www.congress.gov/img/member/a000055_200.jpg',
    );
  });

  it('returns empty string unchanged', () => {
    assert.equal(withBaseUrl('', '/site/'), '');
  });

  it('adds a leading slash when the path has none', () => {
    assert.equal(withBaseUrl('images/x.jpg', '/'), '/images/x.jpg');
    assert.equal(withBaseUrl('images/x.jpg', '/site'), '/site/images/x.jpg');
  });
});
