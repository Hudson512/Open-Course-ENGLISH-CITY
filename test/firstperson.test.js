// Small pieces of the in-game first person that can be checked without a screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= {};
globalThis.localStorage ??= { getItem: () => null, setItem() {} };
const { wrapText, hexColour } = await import('../client/src/firstperson.js');

test('first person: colours from the game become CSS colours', () => {
  assert.equal(hexColour(0xe84393), '#e84393');
  assert.equal(hexColour(0x0000ff), '#0000ff');
  assert.equal(hexColour('#ffd32a'), '#ffd32a');
});

test('first person: what a player says fits in a small bubble', () => {
  assert.deepEqual(wrapText('Hi!'), ['Hi!']);
  assert.deepEqual(wrapText('Where is the nearest bakery, please?'), ['Where is the nearest bakery,', 'please?']);
  const long = wrapText('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen');
  assert.equal(long.length, 3);
  assert.ok(long.every(l => l.length <= 30), long.join('|'));
  assert.match(long[2], /…$/);                                      // cut short, and it says so
  assert.deepEqual(wrapText('   '), []);
});
