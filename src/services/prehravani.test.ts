import test from 'node:test';
import assert from 'node:assert/strict';
import { dalsiCas, kompenzacePitche } from './prehravani.js';

test('uprostřed skladby čas prostě běží', () => {
  assert.deepEqual(dalsiCas(50, 217, false), { cas: 50, konec: false });
});

test('na konci se počitadlo zastaví, ne přeteče', () => {
  assert.deepEqual(dalsiCas(224, 217, false), { cas: 217, konec: true });
});

test('přesně na konci je taky konec', () => {
  assert.deepEqual(dalsiCas(217, 217, false), { cas: 217, konec: true });
});

test('ve smyčce se zabalí dokola a konec nenastane', () => {
  assert.deepEqual(dalsiCas(224, 217, true), { cas: 7, konec: false });
  assert.equal(dalsiCas(1000, 217, true).konec, false);
});

test('nulová délka nedělí nulou', () => {
  assert.deepEqual(dalsiCas(10, 0, false), { cas: 0, konec: false });
  assert.deepEqual(dalsiCas(10, 0, true), { cas: 0, konec: false });
});

test('záporný čas se nepodleze', () => {
  assert.deepEqual(dalsiCas(-5, 217, false), { cas: 0, konec: false });
});

test('normální rychlost nic nerozlaďuje', () => {
  assert.equal(kompenzacePitche(1), 0);
});

test('poloviční rychlost je přesně oktáva nahoru', () => {
  assert.equal(kompenzacePitche(0.5), 12);
});

test('dvojnásobná rychlost je oktáva dolů', () => {
  assert.equal(kompenzacePitche(2), -12);
});

test('0,75× je zhruba pět půltónů', () => {
  assert.ok(Math.abs(kompenzacePitche(0.75) - 4.98) < 0.01);
});

test('nesmyslná rychlost nevrátí NaN', () => {
  assert.equal(kompenzacePitche(0), 0);
  assert.equal(kompenzacePitche(-1), 0);
});
