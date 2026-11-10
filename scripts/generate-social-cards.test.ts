/** Which images the generator draws, and where it puts them. */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { cardJobs, parseCastArgs } from './generate-social-cards.js';

describe('cardJobs', () => {
  const casts = [{ voteId: '119-HR-1-3', bioguideId: 'A000382' }];

  it('captures each cast from the capture route into its own file', () => {
    assert.deepEqual(cardJobs(casts, false), [{
      label: '119-HR-1-3/A000382',
      query: 'voteId=119-HR-1-3&bioguideId=A000382',
      file: '/social-cards/119-HR-1-3/A000382.png',
    }]);
  });

  it('adds the site default when drawing the whole sample', () => {
    const jobs = cardJobs(casts, true);
    assert.deepEqual(jobs.at(-1), { label: 'default', query: 'default', file: '/social-card-default.png' });
  });

  it('never writes under the old /v/ path', () => {
    assert.ok(cardJobs(casts, true).every((job) => !job.file.includes('/v/')));
  });
});

describe('parseCastArgs', () => {
  it('is the whole sample when no cast is named', () => {
    assert.equal(parseCastArgs([]), null);
    assert.equal(parseCastArgs(['--verbose']), null);
  });

  it('reads voteId/bioguideId', () => {
    assert.deepEqual(parseCastArgs(['119-HCONRES-22-1/A000382']), [{ voteId: '119-HCONRES-22-1', bioguideId: 'A000382' }]);
  });

  it('refuses anything else rather than guessing', () => {
    assert.throws(() => parseCastArgs(['119-HR-1-3']), /not voteId\/bioguideId/);
    assert.throws(() => parseCastArgs(['../x/y']), /not voteId\/bioguideId/);
  });
});
