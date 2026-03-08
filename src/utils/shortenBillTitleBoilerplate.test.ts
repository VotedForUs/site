import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { shortenBillTitleBoilerplate } from './shortenBillTitleBoilerplate.js';

describe('shortenBillTitleBoilerplate', () => {
  it('replaces "A bill to " with "To "', () => {
    assert.equal(
      shortenBillTitleBoilerplate('A bill to amend the Internal Revenue Code.'),
      'To amend the Internal Revenue Code.'
    );
  });

  it('shortens reconciliation act title', () => {
    assert.equal(
      shortenBillTitleBoilerplate('An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.'),
      'Reconciliation pursuant to H. Con. Res. 14.'
    );
  });

  it('shortens FY appropriations to FYYYYY Appropriations', () => {
    assert.equal(
      shortenBillTitleBoilerplate('Making appropriations for the fiscal year ending September 30, 2026, and for other purposes.'),
      'FY2026 Appropriations'
    );
  });

  it('shortens consolidated FY appropriations', () => {
    assert.equal(
      shortenBillTitleBoilerplate('Making consolidated appropriations for the fiscal year ending September 30, 2025, and for other purposes.'),
      'FY2025 Appropriations'
    );
  });

  it('returns unchanged when no pattern matches', () => {
    const title = 'Disapproval of EPA rule on the Water Rule.';
    assert.equal(shortenBillTitleBoilerplate(title), title);
  });

  it('returns empty string unchanged', () => {
    assert.equal(shortenBillTitleBoilerplate(''), '');
  });
});
