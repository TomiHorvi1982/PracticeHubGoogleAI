import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jeRadekTabu, prazceZRadku, blokyTabu, tabNaDoby, STANDARDNI_LADENI,
} from './textovyTab';
import { TIKU_NA_CTVRTKU } from './gpUsek';

/** Vlastní cvičná ukázka: prázdné struny odspodu nahoru. */
const PRAZDNE_STRUNY = [
  'e|-----------5--|',
  'B|--------4-----|',
  'G|-----3--------|',
  'D|--2-----------|',
  'A|-0------------|',
  'E|--------------|',
].join('\n');

test('pozná řádek tabulatury od běžného textu', () => {
  assert.equal(jeRadekTabu('e|---3---5---|'), true);
  assert.equal(jeRadekTabu('Sloka první, zpívá se pomalu'), false);
  assert.equal(jeRadekTabu(''), false);
});

test('dvojciferný pražec se čte jako jedno číslo', () => {
  // Z „12" nesmí vzniknout první a druhý pražec — to je jiná melodie.
  const p = prazceZRadku('e|---12---7--|');
  assert.deepEqual(p.map((x) => x.prazec), [12, 7]);
});

test('sloupec pražce se drží pro řazení v čase', () => {
  const p = prazceZRadku('e|-5---7-|');
  assert.ok(p[0].sloupec < p[1].sloupec);
});

test('šest řádků tvoří jednu soustavu', () => {
  const b = blokyTabu(PRAZDNE_STRUNY);
  assert.equal(b.length, 1);
  assert.equal(b[0].length, 6);
});

test('dvě soustavy pod sebou jsou dva bloky', () => {
  const b = blokyTabu(`${PRAZDNE_STRUNY}\n\n${PRAZDNE_STRUNY}`);
  assert.equal(b.length, 2);
});

test('horní řádek je nejvyšší struna', () => {
  // V tabulatuře je nahoře e, ne E — obrácené pořadí by celý hmat
  // překlopilo na opačný konec krku.
  const doby = tabNaDoby(PRAZDNE_STRUNY);
  const prvni = doby[0].noty[0];
  // Nejdřív v čase je A|-0-, tedy pátá struna, prázdná.
  assert.equal(prvni.struna, 5);
  assert.equal(prvni.prazec, 0);
  assert.equal(prvni.midi, STANDARDNI_LADENI[4]);
});

test('pražec se přičte k prázdné struně', () => {
  const doby = tabNaDoby('e|--5--|\nB|-----|\nG|-----|\nD|-----|\nA|-----|\nE|-----|');
  assert.equal(doby[0].noty[0].midi, STANDARDNI_LADENI[0] + 5);
});

test('tóny ve stejném sloupci tvoří akord', () => {
  const akord = [
    'e|--0--|',
    'B|--1--|',
    'G|--0--|',
    'D|--2--|',
    'A|--3--|',
    'E|-----|',
  ].join('\n');
  const doby = tabNaDoby(akord);
  assert.equal(doby.length, 1, 'jeden sloupec je jedna doba');
  assert.equal(doby[0].noty.length, 5);
});

test('události jdou rovnoměrně za sebou', () => {
  // Rytmus v textu není; nestejné mezery by cvičení rozhodily.
  const doby = tabNaDoby(PRAZDNE_STRUNY, STANDARDNI_LADENI, TIKU_NA_CTVRTKU);
  const casy = doby.map((d) => d.start);
  assert.deepEqual(casy, [0, 960, 1920, 2880, 3840]);
});

test('druhá soustava navazuje časem, ne že by hrála přes první', () => {
  const doby = tabNaDoby(`${PRAZDNE_STRUNY}\n\n${PRAZDNE_STRUNY}`);
  assert.equal(doby.length, 10, 'pět událostí ze dvou soustav');
  assert.ok(doby[5].start > doby[4].start);
});

test('text mezi soustavami se přeskočí', () => {
  const s = `Sloka:\n${PRAZDNE_STRUNY}\nRefrén následuje\n${PRAZDNE_STRUNY}`;
  assert.equal(tabNaDoby(s).length, 10);
});

test('vstup bez tabulatury nic nevrátí', () => {
  assert.deepEqual(tabNaDoby('jen obyčejný text\na druhý řádek'), []);
  assert.deepEqual(tabNaDoby(''), []);
});
