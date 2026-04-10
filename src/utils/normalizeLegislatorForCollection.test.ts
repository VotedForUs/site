import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { legislatorSmallSchema } from '../types.zod.js';
import { normalizeLegislatorForCollection } from './normalizeLegislatorForCollection.js';

function normalize(leg: Record<string, unknown>, fromFile = 'TEST') {
  return normalizeLegislatorForCollection(leg, fromFile);
}

function assertParses(leg: Record<string, unknown>, fromFile: string): void {
  const n = normalize(leg, fromFile);
  const p = legislatorSmallSchema.safeParse({ ...n, id: n.bioguide });
  assert.ok(p.success, p.success ? '' : JSON.stringify(p.error.issues));
}

describe('normalizeLegislatorForCollection', () => {
  it('maps legacy LegislatorSmall JSON', () => {
    assertParses(
      {
        id: 'A000360',
        bioguide: 'A000360',
        name: 'Lamar Alexander',
        lastName: 'Alexander',
        state: 'TN',
        party: 'Republican',
        nameTitle: 'Sen. Lamar Alexander (TN)',
        type: 'sen',
      },
      'A000360',
    );
  });

  it('maps full member API shape with nested id and latest_term', () => {
    assertParses(
      {
        bioguideId: 'Z000018',
        district: 1,
        state: 'Montana',
        depiction: { imageUrl: '/x.jpg', attribution: 'House' },
        id: { bioguide: 'Z000018' },
        name: { first: 'Ryan', last: 'Zinke', official_full: 'Ryan K. Zinke' },
        latest_term: {
          type: 'rep',
          state: 'MT',
          district: 1,
          party: 'Republican',
        },
      },
      'Z000018',
    );
  });

  it('infers type and state from terms when latest_term is missing', () => {
    assertParses(
      {
        bioguideId: 'X000001',
        terms: [
          {
            chamber: 'House of Representatives',
            congress: 119,
            district: 2,
            memberType: 'Representative',
            startYear: 2025,
            stateCode: 'CA',
            stateName: 'California',
          },
        ],
        name: { official_full: 'Test Member' },
      },
      'X000001',
    );
  });
});

describe('nestedIdBioguide fallback', () => {
  it('resolves bioguide from nested id when bioguide/bioguideId are absent', () => {
    const r = normalize({ id: { bioguide: 'N123' }, name: 'Foo', nameTitle: 'Rep. Foo ()' });
    assert.equal(r.bioguide, 'N123');
  });

  it('falls back to fromFile when id.bioguide is non-string', () => {
    const r = normalize({ id: { bioguide: 42 }, name: 'Foo', nameTitle: 'Rep. Foo ()' }, 'FILE1');
    assert.equal(r.bioguide, 'FILE1');
  });

  it('falls back to fromFile when id is not an object', () => {
    const r = normalize({ name: 'Foo', nameTitle: 'Rep. Foo ()' }, 'FILE2');
    assert.equal(r.bioguide, 'FILE2');
  });
});

describe('toOptionalNumber', () => {
  it('coerces string district to number', () => {
    const r = normalize({
      bioguideId: 'T1',
      district: '5',
      name: 'Test',
      nameTitle: 'Rep. Test (XX-5)',
    });
    assert.equal(r.district, 5);
  });

  it('returns undefined for empty string district', () => {
    const r = normalize({ bioguideId: 'T2', district: '', name: 'Test', nameTitle: 'Rep. Test ()' });
    assert.equal(r.district, undefined);
  });

  it('returns undefined for NaN', () => {
    const r = normalize({ bioguideId: 'T3', district: NaN, name: 'Test', nameTitle: 'Rep. Test ()' });
    assert.equal(r.district, undefined);
  });
});

describe('inferFromTermsArray', () => {
  it('returns undefined when terms is empty', () => {
    const r = normalize({ bioguideId: 'T4', terms: [], name: 'Test', nameTitle: 'Rep. Test ()' });
    assert.equal(r.type, undefined);
  });

  it('picks last term when all have endYear', () => {
    const r = normalize({
      bioguideId: 'T5',
      name: { official_full: 'Old Member' },
      terms: [
        { chamber: 'Senate', endYear: 2020, stateCode: 'NY' },
        { chamber: 'Senate', endYear: 2022, stateCode: 'NY' },
      ],
    });
    assert.equal(r.type, 'sen');
    assert.equal(r.state, 'NY');
  });
});

describe('chamberToLegType', () => {
  it('maps Senate chamber to sen', () => {
    const r = normalize({
      bioguideId: 'C1',
      name: { official_full: 'Senator Test' },
      terms: [{ chamber: 'Senate', stateCode: 'TX' }],
    });
    assert.equal(r.type, 'sen');
  });

  it('maps Senator memberType to sen when chamber is absent', () => {
    const r = normalize({
      bioguideId: 'C2',
      name: { official_full: 'Sen Test' },
      terms: [{ memberType: 'Senator', stateCode: 'FL' }],
    });
    assert.equal(r.type, 'sen');
  });

  it('defaults to rep for non-Senate chamber string', () => {
    const r = normalize({
      bioguideId: 'C3',
      name: { official_full: 'Rep Test' },
      terms: [{ chamber: 'House of Representatives', stateCode: 'OH' }],
    });
    assert.equal(r.type, 'rep');
  });

  it('returns undefined when neither chamber nor memberType are strings', () => {
    const r = normalize({
      bioguideId: 'C4',
      name: { official_full: 'Unknown' },
      terms: [{ stateCode: 'PA' }],
    });
    assert.equal(r.type, undefined);
  });
});

describe('displayName fallbacks', () => {
  it('uses directOrderName when name is not a string or object with official_full', () => {
    const r = normalize({
      bioguideId: 'D1',
      directOrderName: 'Jane Doe',
      latest_term: { type: 'rep', state: 'AL', party: 'Democrat' },
    });
    assert.equal(r.nameTitle, 'Rep. Jane Doe (AL-)');
  });

  it('uses invertedOrderName as last resort', () => {
    const r = normalize({
      bioguideId: 'D2',
      invertedOrderName: 'Doe, John',
      latest_term: { type: 'sen', state: 'NY', party: 'Democrat' },
    });
    assert.equal(r.nameTitle, 'Sen. Doe, John (NY)');
  });

  it('falls back to bioguideId when no name fields exist', () => {
    const r = normalize({ bioguideId: 'D3' });
    assert.equal(r.nameTitle, 'D3');
  });

  it('falls back to bioguide when bioguideId is absent', () => {
    const r = normalize({ bioguide: 'D4' });
    assert.equal(r.nameTitle, 'D4');
  });

  it('falls back to nested id bioguide', () => {
    const r = normalize({ id: { bioguide: 'D5' } });
    assert.equal(r.nameTitle, 'D5');
  });

  it('falls back to "Unknown" when nothing is available', () => {
    const r = normalize({});
    assert.equal(r.nameTitle, 'Unknown');
  });
});

describe('partyFromLeg fallbacks', () => {
  it('uses latest_term.party first', () => {
    const r = normalize({
      bioguideId: 'P1',
      name: 'Test',
      nameTitle: 'Rep. Test ()',
      party: 'Independent',
      latest_term: { type: 'rep', state: 'CA', party: 'Democrat' },
    });
    assert.equal(r.party, 'Democrat');
  });

  it('uses top-level party when latest_term has none', () => {
    const r = normalize({
      bioguideId: 'P2',
      name: 'Test',
      nameTitle: 'Rep. Test ()',
      party: 'Republican',
      latest_term: { type: 'rep', state: 'TX' },
    });
    assert.equal(r.party, 'Republican');
  });

  it('uses partyHistory[0].partyName when party fields are absent', () => {
    const r = normalize({
      bioguideId: 'P3',
      name: 'Test',
      nameTitle: 'Rep. Test ()',
      partyHistory: [{ partyName: 'Libertarian', startYear: 2020 }],
    });
    assert.equal(r.party, 'Libertarian');
  });

  it('uses partyHistory[0].partyAbbreviation when partyName is absent', () => {
    const r = normalize({
      bioguideId: 'P4',
      name: 'Test',
      nameTitle: 'Rep. Test ()',
      partyHistory: [{ partyAbbreviation: 'G', startYear: 2020 }],
    });
    assert.equal(r.party, 'G');
  });
});

describe('depiction and stateRank', () => {
  it('uses depiction imageUrl and attribution', () => {
    const r = normalize({
      bioguideId: 'I1',
      name: 'Test',
      nameTitle: 'Rep. Test ()',
      depiction: { imageUrl: '/img.jpg', attribution: 'House' },
    });
    assert.equal(r.imageUrl, '/img.jpg');
    assert.equal(r.attribution, 'House');
  });

  it('prefers top-level imageUrl over depiction', () => {
    const r = normalize({
      bioguideId: 'I2',
      name: 'Test',
      nameTitle: 'Rep. Test ()',
      imageUrl: '/top.jpg',
      depiction: { imageUrl: '/dep.jpg' },
    });
    assert.equal(r.imageUrl, '/top.jpg');
  });

  it('reads stateRank from latest_term.state_rank', () => {
    const r = normalize({
      bioguideId: 'SR1',
      name: 'Test',
      nameTitle: 'Sen. Test ()',
      latest_term: { type: 'sen', state: 'MD', state_rank: 'junior' },
    });
    assert.equal(r.stateRank, 'junior');
  });

  it('prefers top-level stateRank over latest_term.state_rank', () => {
    const r = normalize({
      bioguideId: 'SR2',
      name: 'Test',
      nameTitle: 'Sen. Test ()',
      stateRank: 'senior',
      latest_term: { type: 'sen', state: 'MD', state_rank: 'junior' },
    });
    assert.equal(r.stateRank, 'senior');
  });
});

describe('lastName extraction', () => {
  it('uses name.last from API shape', () => {
    const r = normalize({
      bioguideId: 'LN1',
      name: { first: 'Jane', last: 'Smith', official_full: 'Jane Smith' },
      latest_term: { type: 'rep', state: 'CA', party: 'Democrat' },
    });
    assert.equal(r.lastName, 'Smith');
  });

  it('uses top-level lastName when name is a string', () => {
    const r = normalize({
      bioguideId: 'LN2',
      name: 'Jane Smith',
      lastName: 'Smith',
      nameTitle: 'Rep. Jane Smith (CA-1)',
    });
    assert.equal(r.lastName, 'Smith');
  });
});
