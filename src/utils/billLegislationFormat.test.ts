import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatLegislationIdentifier,
  formatLegislationTypeLabel,
  normalizeBillTypeKey,
} from './billLegislationFormat.js';

test('normalizeBillTypeKey strips separators and uppercases', () => {
  assert.equal(normalizeBillTypeKey('h.res'), 'HRES');
  assert.equal(normalizeBillTypeKey('HCONRES'), 'HCONRES');
});

test('formatLegislationIdentifier formats common bill types', () => {
  assert.equal(formatLegislationIdentifier('S', '960'), 'S. 960');
  assert.equal(formatLegislationIdentifier('HR', '1442'), 'H.R. 1442');
  assert.equal(formatLegislationIdentifier('hres', '354'), 'H. Res. 354');
  assert.equal(formatLegislationIdentifier('HCONRES', '73'), 'H. Con. Res. 73');
});

test('formatLegislationTypeLabel returns schema labels', () => {
  assert.equal(formatLegislationTypeLabel('S'), 'act');
  assert.equal(formatLegislationTypeLabel('HRES'), 'simple resolution');
  assert.equal(formatLegislationTypeLabel('SJRES'), 'joint resolution');
  assert.equal(formatLegislationTypeLabel('SCONRES'), 'concurrent resolution');
});
