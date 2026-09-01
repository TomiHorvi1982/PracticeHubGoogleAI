import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usekZDob, tikyNaVteriny, poDobach, TIKU_NA_CTVRTKU } from './gpUsek';

const nota = (struna: number, prazec: number, midi: number) => ({ struna, prazec, midi });

/** Dva takty po čtyřech čtvrťkách. */
const DOBY = [
  { start: 0, delka: 960, noty: [nota(6, 0, 40)] },
  { start: 960, delka: 960, noty: [nota(5, 2, 45)] },
  { start: 1920, delka: 960, noty: [nota(4, 2, 50)] },
  { start: 2880, delka: 960, noty: [nota(3, 0, 55)] },
  // druhý takt
  { start: 3840, delka: 960, noty: [nota(2, 1, 60)] },
  { start: 4800, delka: 960, noty: [nota(1, 0, 64)] },
];

test('vybere jen doby z rozsahu', () => {
  const u = usekZDob(DOBY, 0, 3840);
  assert.equal(u.noty.length, 4);
  assert.equal(u.delka, 3840);
});

test('časy se počítají od začátku úseku', () => {
  // Úsek se cvičí sám o sobě, takže musí začínat na nule.
  const u = usekZDob(DOBY, 3840, 5760);
  assert.deepEqual(u.noty.map((n) => n.cas), [0, 960]);
});

test('nota začínající před úsekem se nebere', () => {
  // Doznívá do úseku, ale hráč ji v něm nezahraje.
  const u = usekZDob([{ start: 0, delka: 4000, noty: [nota(6, 0, 40)] }], 1000, 2000);
  assert.equal(u.noty.length, 0);
});

test('struna a pražec se nesou dál', () => {
  const u = usekZDob(DOBY, 960, 1920);
  assert.equal(u.noty[0].struna, 5);
  assert.equal(u.noty[0].prazec, 2);
});

test('prázdný nebo obrácený rozsah nic nevrátí', () => {
  assert.deepEqual(usekZDob(DOBY, 2000, 2000).noty, []);
  assert.deepEqual(usekZDob(DOBY, 3000, 1000).noty, []);
});

test('tiky se převedou na vteřiny podle tempa', () => {
  // Čtvrťka při 120 BPM trvá půl vteřiny.
  assert.equal(tikyNaVteriny(TIKU_NA_CTVRTKU, 120), 0.5);
  assert.equal(tikyNaVteriny(TIKU_NA_CTVRTKU * 4, 60), 4);
  assert.equal(tikyNaVteriny(960, 0), 0);
});

test('noty ve stejnou chvíli tvoří jednu dobu', () => {
  // Akord musí na hmatníku naskočit naráz, ne po tónech.
  const akord = [
    { start: 0, delka: 960, noty: [nota(6, 3, 43), nota(5, 2, 45), nota(4, 0, 50)] },
    { start: 960, delka: 960, noty: [nota(3, 0, 55)] },
  ];
  const u = usekZDob(akord, 0, 1920);
  const skupiny = poDobach(u.noty);
  assert.equal(skupiny.length, 2);
  assert.equal(skupiny[0].noty.length, 3);
  assert.equal(skupiny[1].noty.length, 1);
});
