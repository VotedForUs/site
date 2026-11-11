/**
 * A throwaway `src/data` for script tests: real file shapes, tiny contents.
 * Congress 999 keeps every id away from the editorial entries on disk.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RawBill } from '../build-finder-index.js';

/** A bill file with one House roll call and one Senate voice vote. */
export const fixtureBill: RawBill = {
  id: '999-HR-26',
  congress: 999,
  type: 'HR',
  number: 26,
  title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.',
  lastActionDate: '2025-02-12',
  latestAction: { actionDate: '2025-02-12', text: 'Passed House' },
  titles: { titles: [{ title: 'Midnight Rules Relief Act', titleType: 'Popular Titles' }] },
  actions: {
    actions: [
      {
        actionDate: '2025-02-12',
        text: 'On passage Passed by the Yeas and Nays: 2 - 0 (Roll no. 40).',
        recordedVotes: [{
          id: '999-HR-26-1', chamber: 'House', rollNumber: 40, question: 'On Passage',
          result: 'Passed', votes: { A000055: 'Aye', R000579: 'No', Z999999: 'Aye' },
        }],
      },
      {
        actionDate: '2025-03-01',
        text: 'Passed Senate by Voice Vote.',
        recordedVotes: [{
          id: '999-HR-26-2', chamber: 'Senate', recordType: 'voice', question: 'On Passage',
          votes: {}, membersAtAction: ['S000033'],
        }],
      },
    ],
  },
};

/** A second, older bill with no recorded votes. */
export const fixtureBillNoVotes: RawBill = {
  id: '999-S-5',
  congress: 999,
  type: 'S',
  number: 5,
  title: 'A bill to require something.',
  lastActionDate: '2025-01-03',
  actions: { actions: [{ actionDate: '2025-01-03', text: 'Introduced.' }] },
};

/** Legislator files in the Congress.gov + legislator-YAML shape. */
export const fixtureLegislators: Record<string, Record<string, unknown>> = {
  A000055: {
    bioguideId: 'A000055', firstName: 'Robert', lastName: 'Aderholt',
    name: { official_full: 'Robert B. Aderholt', last: 'Aderholt' },
    latest_term: { type: 'rep', state: 'AL', district: 4, party: 'Republican' },
  },
  R000579: {
    bioguideId: 'R000579', firstName: 'Patrick', nickName: 'Pat', lastName: 'Ryan',
    name: { official_full: 'Patrick Ryan', last: 'Ryan' },
    latest_term: { type: 'rep', state: 'NY', district: 18, party: 'Democrat' },
  },
  S000033: {
    bioguideId: 'S000033', firstName: 'Bernard', lastName: 'Sanders',
    name: { official_full: 'Bernard Sanders', last: 'Sanders' },
    latest_term: { type: 'sen', state: 'VT', party: 'Independent' },
  },
  // Never cast a recorded vote: has a file, belongs in no index.
  N000000: {
    bioguideId: 'N000000', firstName: 'No', lastName: 'Votes',
    name: { official_full: 'No Votes', last: 'Votes' },
    latest_term: { type: 'sen', state: 'OH', party: 'Republican' },
  },
};

/**
 * Write a data directory under the OS temp dir.
 *
 * @param bills - Bill files to write, as `bills/{congress}/{type}/{number}.json`
 * @param legislators - Legislator files by bioguide id
 * @returns The directory, and a function that removes it
 */
export function makeDataDir(
  bills: RawBill[] = [fixtureBill, fixtureBillNoVotes],
  legislators: Record<string, Record<string, unknown>> = fixtureLegislators,
): { dataDir: string; root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vfu-data-'));
  const dataDir = path.join(root, 'src', 'data');
  for (const bill of bills) {
    const dir = path.join(dataDir, 'bills', String(bill.congress), String(bill.type).toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${bill.number}.json`), JSON.stringify(bill));
  }
  fs.mkdirSync(path.join(dataDir, 'legislators'), { recursive: true });
  for (const [id, legislator] of Object.entries(legislators)) {
    fs.writeFileSync(path.join(dataDir, 'legislators', `${id}.json`), JSON.stringify(legislator));
  }
  return { dataDir, root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
