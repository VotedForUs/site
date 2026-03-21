import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { legislatorSmallSchema } from '../types.zod.js';
import { normalizeLegislatorForCollection } from './normalizeLegislatorForCollection.js';

function assertParses(leg: Record<string, unknown>, fromFile: string): void {
  const n = normalizeLegislatorForCollection(leg, fromFile);
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
