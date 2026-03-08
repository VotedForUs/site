import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { applyAcronyms, type AcronymEntry } from './applyAcronyms.js';

const BLM_EPA: AcronymEntry[] = [
  { acronym: 'BLM', name: 'Bureau of Land Management' },
  { acronym: 'EPA', name: 'Environmental Protection Agency' },
];

describe('applyAcronyms', () => {
  it('returns title unchanged when acronyms array is empty', () => {
    const title = 'Rule submitted by the Environmental Protection Agency.';
    assert.equal(applyAcronyms(title, []), title);
  });

  it('returns title unchanged when no acronym name appears in title', () => {
    const title = 'A bill to amend something.';
    assert.equal(applyAcronyms(title, BLM_EPA), title);
  });

  it('replaces one matching full name with acronym', () => {
    const title = 'Disapproval of Environmental Protection Agency rule on the Water Rule.';
    assert.equal(
      applyAcronyms(title, BLM_EPA),
      'Disapproval of EPA rule on the Water Rule.'
    );
  });

  it('replaces longest name first when one name contains another', () => {
    const acronyms: AcronymEntry[] = [
      { acronym: 'Short', name: 'Protection' },
      { acronym: 'EPA', name: 'Environmental Protection Agency' },
    ];
    const title = 'Rule submitted by the Environmental Protection Agency.';
    assert.equal(applyAcronyms(title, acronyms), 'Rule submitted by the EPA.');
  });

  it('replaces all occurrences of the same name', () => {
    const title = 'The Environmental Protection Agency and the Environmental Protection Agency rule.';
    assert.equal(
      applyAcronyms(title, BLM_EPA),
      'The EPA and the EPA rule.'
    );
  });

  it('returns empty string unchanged', () => {
    assert.equal(applyAcronyms('', BLM_EPA), '');
  });

  it('handles null/undefined title by returning as-is', () => {
    assert.equal(applyAcronyms(null as unknown as string, BLM_EPA), null as unknown as string);
    assert.equal(applyAcronyms(undefined as unknown as string, BLM_EPA), undefined as unknown as string);
  });

  it('skips entries with missing or empty name', () => {
    const acronyms: AcronymEntry[] = [
      { acronym: 'X', name: '' },
      { acronym: 'EPA', name: 'Environmental Protection Agency' },
    ];
    const title = 'Environmental Protection Agency rule.';
    assert.equal(applyAcronyms(title, acronyms), 'EPA rule.');
  });
});
