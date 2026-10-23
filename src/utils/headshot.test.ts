/**
 * Portraits are answered by the files on disk, not by a field in the data.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { headshotPath, localHeadshot } from './headshot.js';

const fixture = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'headshots-'));
  fs.mkdirSync(path.join(dir, 'images', 'legislators'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'images', 'legislators', 'A000055.jpg'), 'x');
  return dir;
};

describe('headshotPath', () => {
  it('is the public path a portrait would live at', () => {
    assert.equal(headshotPath('A000055'), '/images/legislators/A000055.jpg');
  });
});

describe('localHeadshot', () => {
  it('answers with the path when the file is there', () => {
    assert.equal(localHeadshot('A000055', fixture()), '/images/legislators/A000055.jpg');
  });

  it('answers null when it is not — never a congress.gov URL', () => {
    // F000465 has only a remote imageUrl in the data and no file on disk.
    assert.equal(localHeadshot('F000465', fixture()), null);
  });

  it('answers null when the directory does not exist at all', () => {
    assert.equal(localHeadshot('A000055', path.join(os.tmpdir(), 'nothing-here')), null);
  });
});
