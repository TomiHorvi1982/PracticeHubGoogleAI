import test from 'node:test';
import assert from 'node:assert/strict';
import { paryKanalu, parKanalu, maVicParu } from './kanalyVstupu.js';

test('šestikanálová zvukovka nabídne tři páry', () => {
  assert.deepEqual(paryKanalu(6).map((p) => p.popis), ['1–2', '3–4', '5–6']);
});

test('páry sedí na skutečná čísla kanálů', () => {
  const [prvni, druhy] = paryKanalu(6);
  assert.deepEqual([prvni.levy, prvni.pravy], [0, 1]);
  assert.deepEqual([druhy.levy, druhy.pravy], [2, 3]);
});

test('běžné stereo dá jediný pár a výběr nemá smysl', () => {
  assert.equal(paryKanalu(2).length, 1);
  assert.equal(maVicParu(2), false);
  assert.equal(maVicParu(6), true);
});

test('mono vstup nedá žádný pár', () => {
  assert.deepEqual(paryKanalu(1), []);
  assert.equal(parKanalu(1, 0), null);
});

test('lichý počet kanálů osamělý kanál nenabídne', () => {
  // Pět kanálů = dva použitelné páry, pátý zůstane stranou.
  assert.deepEqual(paryKanalu(5).map((p) => p.popis), ['1–2', '3–4']);
});

test('volba mimo rozsah spadne na první pár, ne na ticho', () => {
  assert.equal(parKanalu(6, 99)?.popis, '5–6');
  assert.equal(parKanalu(2, 5)?.popis, '1–2');
  assert.equal(parKanalu(6, -3)?.popis, '1–2');
});

test('nesmyslný počet kanálů nespadne', () => {
  assert.deepEqual(paryKanalu(0), []);
  assert.deepEqual(paryKanalu(-4), []);
  assert.deepEqual(paryKanalu(NaN), []);
});
