import test from 'node:test';
import assert from 'node:assert/strict';

import { Tonu, naTabulaturu } from './cvikyTechnik';
import {
  VlastniCvik, navrhniNazev, pridejTon, smazCvik, uberPosledni, ulozCvik,
} from './vlastniCviky';

const t = (struna: number, prazec: number, technika?: any): Tonu => ({ struna, prazec, technika });

test('uložení pod stejným jménem přepíše, nezaloží druhý cvik', () => {
  let c: VlastniCvik[] = ulozCvik([], 'Přechod do refrénu', [t(2, 5)], 80);
  assert.equal(c.length, 1);
  c = ulozCvik(c, 'přechod do refrénu', [t(2, 5), t(2, 7)], 90);
  assert.equal(c.length, 1, 'velikost písmen nemá zakládat druhý cvik');
  assert.equal(c[0].tony.length, 2);
  assert.equal(c[0].bpm, 90);
  // Identita zůstává, ať se odkaz na cvik nerozbije.
  assert.equal(c[0].id, ulozCvik(c, 'Přechod do refrénu', [t(2, 5)], 90)[0].id);
});

test('cvik bez jména dostane náhradní, které se neopakuje', () => {
  let c = ulozCvik([], '   ', [t(0, 3)], 70);
  assert.equal(c[0].nazev, 'Cvik 1');
  c = ulozCvik(c, '', [t(0, 4)], 70);
  assert.equal(c.length, 2, 'druhý bezejmenný přepsal první');
  assert.equal(c[1].nazev, 'Cvik 2');
});

test('navržené jméno přeskočí to, které už někdo použil', () => {
  const c = ulozCvik([], 'Cvik 1', [t(0, 0)], 60);
  assert.equal(navrhniNazev(c), 'Cvik 2');
});

test('uložený cvik si pamatuje tempo i kytaru', () => {
  const c = ulozCvik([], 'Chug', [t(0, 0)], 140, 'palm_muted_metal');
  assert.equal(c[0].bpm, 140);
  assert.equal(c[0].zvuk, 'palm_muted_metal');
});

test('smazání odebere právě jeden cvik', () => {
  let c = ulozCvik([], 'A', [t(0, 1)], 60);
  c = ulozCvik(c, 'B', [t(0, 2)], 60);
  // Dva cviky uložené ve stejné milisekundě musí mít různá id, jinak
  // smazání jednoho vezme oba.
  assert.notEqual(c[0].id, c[1].id);
  const zbyle = smazCvik(c, c[0].id);
  assert.deepEqual(zbyle.map((x) => x.nazev), ['B']);
});

test('smazání neexistujícího cviku nic neubere', () => {
  const c = ulozCvik([], 'A', [t(0, 1)], 60);
  assert.equal(smazCvik(c, 'nic').length, 1);
});

test('ťukání přidává tóny na konec a opakovaný tón projde', () => {
  let tony: Tonu[] = [];
  tony = pridejTon(tony, t(2, 5));
  tony = pridejTon(tony, t(2, 5));
  assert.equal(tony.length, 2, 'střídavý úder na jednom pražci je taky cvik');
  tony = pridejTon(tony, t(1, 7));
  assert.deepEqual(tony.map((x) => x.prazec), [5, 5, 7]);
});

test('zpět ubere poslední tón a na prázdném nespadne', () => {
  const tony = [t(0, 1), t(0, 2)];
  assert.deepEqual(uberPosledni(tony).map((x) => x.prazec), [1]);
  assert.deepEqual(uberPosledni([]), []);
});

test('naťukaný cvik se dá vysázet do tabulatury', () => {
  // Tohle je celý smysl věci: co naťukáš, to se má objevit v zápisu.
  const tony = [t(5, 3), t(5, 5), t(4, 3, 'hammer')];
  const radky = naTabulaturu(tony).split('\n');
  assert.equal(radky.length, 6);
  assert.ok(radky[0].includes('3'), 'první tón chybí v tabulatuře');
  assert.ok(radky[1].includes('h3'), 'příklep se má značit před tónem');
});
