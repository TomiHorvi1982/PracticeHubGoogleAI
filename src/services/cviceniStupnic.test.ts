import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CVICENI, cviceniPodleId, tonyCviceni } from './cviceniStupnic';

/** C dur: sedm stupňů. */
const DUR = [0, 2, 4, 5, 7, 9, 11];
const C4 = 60;

test('nahoru a dolů projde oktávu a vrátí se', () => {
  const s = cviceniPodleId('nahoru_dolu')!.stupne(7, 1);
  assert.equal(s[0], 0);
  assert.equal(s[7], 7, 'vrchol je oktáva nad základem');
  assert.equal(s[s.length - 1], 0, 'končí tam, kde začalo');
});

test('vrchol se nehraje dvakrát', () => {
  // Zdvojený tón na obrátce zní jako zádrhel.
  const s = cviceniPodleId('nahoru_dolu')!.stupne(7, 1);
  assert.notEqual(s[7], s[8]);
});

test('tercie jdou ob jeden stupeň', () => {
  const s = cviceniPodleId('tercie')!.stupne(7, 1);
  assert.deepEqual(s.slice(0, 6), [0, 2, 1, 3, 2, 4]);
});

test('trojice postupují po jednom stupni', () => {
  const s = cviceniPodleId('trojice')!.stupne(7, 1);
  assert.deepEqual(s.slice(0, 6), [0, 1, 2, 1, 2, 3]);
});

test('čtveřice sedí na šestnáctiny', () => {
  const s = cviceniPodleId('ctverice')!.stupne(7, 1);
  assert.equal(s.length % 4, 0);
  assert.deepEqual(s.slice(0, 8), [0, 1, 2, 3, 1, 2, 3, 4]);
});

test('sekvence nepřeleze zadaný rozsah', () => {
  for (const c of CVICENI) {
    const s = c.stupne(7, 2);
    assert.ok(Math.max(...s) <= 14, `${c.id} přelezlo dvě oktávy`);
    assert.ok(Math.min(...s) >= 0, `${c.id} spadlo pod základ`);
  }
});

test('stupně se převedou na tóny C dur', () => {
  assert.deepEqual(tonyCviceni(C4, DUR, [0, 1, 2, 3, 4, 5, 6]), [60, 62, 64, 65, 67, 69, 71]);
});

test('stupeň nad rámec stupnice pokračuje o oktávu výš', () => {
  // Osmý stupeň je základ o oktávu výš, ne návrat na začátek.
  assert.deepEqual(tonyCviceni(C4, DUR, [7, 8, 9]), [72, 74, 76]);
});

test('dvě oktávy nahoru sedí', () => {
  assert.deepEqual(tonyCviceni(C4, DUR, [14]), [84]);
});

test('pentatonika o pěti stupních se přetáčí po pěti', () => {
  // Kratší stupnice se musí přetočit dřív, ne po sedmi.
  const pentatonika = [0, 3, 5, 7, 10];
  assert.deepEqual(tonyCviceni(C4, pentatonika, [4, 5]), [70, 72]);
});

test('prázdná stupnice nespadne', () => {
  assert.deepEqual(tonyCviceni(C4, [], [0, 1, 2]), []);
});
