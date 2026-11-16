import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatTime } from './formatDate.js';

describe('formatDate', () => {
  it('prints a date-only value as that day, whatever zone the build runs in', () => {
    assert.equal(formatDate('2025-07-04'), 'Jul 4, 2025');
    assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026');
  });

  it('prints a timestamp as the Eastern day it fell on', () => {
    // 02:00 UTC is still the evening before in Washington.
    assert.equal(formatDate('2026-11-10T02:00:00Z'), 'Nov 9, 2026');
    assert.equal(formatDate('2026-11-09T22:41:05Z'), 'Nov 9, 2026');
  });

  it('says N/A for nothing and hands back what it cannot parse', () => {
    assert.equal(formatDate(undefined), 'N/A');
    assert.equal(formatDate(null), 'N/A');
    assert.equal(formatDate(''), 'N/A');
    assert.equal(formatDate('sometime in July'), 'sometime in July');
  });
});

describe('formatTime', () => {
  it('reads a 24-hour clock time as a 12-hour one', () => {
    assert.equal(formatTime('14:31:00'), '2:31 PM');
    assert.equal(formatTime('09:05:59'), '9:05 AM');
    assert.equal(formatTime('00:00:00'), '12:00 AM');
  });

  it('is empty when there is no time', () => {
    assert.equal(formatTime(undefined), '');
    assert.equal(formatTime(null), '');
    assert.equal(formatTime('soon'), '');
  });
});
