import test from 'node:test';
import assert from 'node:assert/strict';
import { otisky, stabilniNove } from './sledovaniSlozky.js';

const sada = (nazev: string, velikosti: number[]) => ({
  nazev,
  stopy: velikosti.map((velikost) => ({ velikost })),
});

test('otisk počítá stopy i celkovou velikost', () => {
  const o = otisky([sada('Roots', [10, 20, 30])]);
  assert.deepEqual(o.get('Roots'), { pocet: 3, velikost: 60 });
});

test('co tam bylo od začátku se neohlásí jako nové', () => {
  const o = otisky([sada('Roots', [10])]);
  assert.deepEqual(stabilniNove(o, o, new Set(['Roots'])), []);
});

test('sada se ohlásí až kolo po tom, co se objeví', () => {
  const prazdno = new Map();
  const ted = otisky([sada('Amen', [10, 10])]);
  // První kolo: ještě nevíme, jestli se dopisuje.
  assert.deepEqual(stabilniNove(prazdno, ted, new Set()), []);
  // Druhé kolo se stejným otiskem — hotovo.
  assert.deepEqual(stabilniNove(ted, ted, new Set()), ['Amen']);
});

test('sada, která ještě roste, se neohlásí', () => {
  const minule = otisky([sada('Amen', [10])]);
  const ted = otisky([sada('Amen', [10, 40])]);
  assert.deepEqual(stabilniNove(minule, ted, new Set()), []);
});

test('dopisovaný soubor se pozná podle velikosti, i když stop je stejně', () => {
  const minule = otisky([sada('Amen', [5])]);
  const ted = otisky([sada('Amen', [37])]);
  assert.deepEqual(stabilniNove(minule, ted, new Set()), []);
});

test('víc sad naráz', () => {
  const minule = otisky([sada('Amen', [10]), sada('Roots', [20])]);
  const ted = otisky([sada('Amen', [10]), sada('Roots', [20])]);
  assert.deepEqual(stabilniNove(minule, ted, new Set()).sort(), ['Amen', 'Roots']);
});

test('už ohlášená se podruhé nehlásí', () => {
  const o = otisky([sada('Amen', [10])]);
  assert.deepEqual(stabilniNove(o, o, new Set(['Amen'])), []);
});
