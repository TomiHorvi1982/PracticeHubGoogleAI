import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Dovednost, Postup, STUPNE, coDal, hotovoZeStupne, nazevStupne, stavDovednosti,
  stupenHotovy,
} from './osnova';

const d = (id: string, stupen: number, poradi: number, druh: any = 'praxe'): Dovednost =>
  ({ id, stupen, poradi, druh, nazev: id, kriterium: 'něco' });

const p = (dovednostId: string, stav: any): Postup => ({
  zak_id: 'z1', dovednost_id: dovednostId, stav, tempo: null, poznamka: '',
  zmeneno: '2026-09-01T10:00:00Z',
});

const OSNOVA = [d('a', 1, 1), d('b', 1, 2), d('c', 1, 3, 'teorie'), d('x', 2, 1)];

test('šest stupňů má jméno i dobu', () => {
  assert.equal(STUPNE.length, 6);
  for (const s of STUPNE) {
    assert.ok(s.nazev.length > 2, `stupeň ${s.cislo} nemá jméno`);
    assert.ok(s.doba.length > 2, `stupeň ${s.cislo} nemá dobu`);
  }
  assert.equal(nazevStupne(1), 'První tóny');
  // Neznámý stupeň nesmí vrátit prázdno — v rozhraní by zmizel popisek.
  assert.match(nazevStupne(99), /99/);
});

test('chybějící řádek postupu znamená nezačato', () => {
  assert.equal(stavDovednosti([], 'a'), 'nezacato');
  assert.equal(stavDovednosti([p('a', 'cvici')], 'a'), 'cvici');
  assert.equal(stavDovednosti([p('a', 'cvici')], 'b'), 'nezacato');
});

test('procenta se počítají z celého stupně, ne jen z rozdělaného', () => {
  // Jedna ze tří hotová = 33 %, ne 100 %.
  assert.equal(hotovoZeStupne(OSNOVA, [p('a', 'hotovo')], 1), 33);
  assert.equal(hotovoZeStupne(OSNOVA, [p('a', 'hotovo'), p('b', 'cvici')], 1), 33);
  assert.equal(
    hotovoZeStupne(OSNOVA, [p('a', 'hotovo'), p('b', 'hotovo'), p('c', 'hotovo')], 1),
    100,
  );
});

test('prázdný stupeň dá nulu, ne dělení nulou', () => {
  assert.equal(hotovoZeStupne(OSNOVA, [], 5), 0);
  assert.equal(hotovoZeStupne([], [], 1), 0);
});

test('teorie se do postupu počítá stejně jako praxe', () => {
  // Teorie je šestina osnovy stupně; kdyby se nepočítala, stupeň by šel
  // dokončit, aniž by dítě vědělo, co hraje.
  assert.equal(hotovoZeStupne(OSNOVA, [p('a', 'hotovo'), p('b', 'hotovo')], 1), 67);
  assert.equal(stupenHotovy(OSNOVA, [p('a', 'hotovo'), p('b', 'hotovo')], 1), false);
});

test('na čem pokračovat: nejdřív rozdělané, pak nezačaté v pořadí', () => {
  const postup = [p('a', 'hotovo'), p('c', 'cvici')];
  assert.deepEqual(coDal(OSNOVA, postup, 1).map((x) => x.id), ['c', 'b']);
});

test('hotové dovednosti se mezi „co dál" nepletou', () => {
  const vse = [p('a', 'hotovo'), p('b', 'hotovo'), p('c', 'hotovo')];
  assert.deepEqual(coDal(OSNOVA, vse, 1), []);
});

test('bez postupu se pokračuje odshora podle pořadí', () => {
  assert.deepEqual(coDal(OSNOVA, [], 1).map((x) => x.id), ['a', 'b', 'c']);
});

test('stupeň je hotový, až když je hotové všechno', () => {
  assert.equal(stupenHotovy(OSNOVA, [p('a', 'hotovo'), p('b', 'hotovo')], 1), false);
  assert.equal(
    stupenHotovy(OSNOVA, [p('a', 'hotovo'), p('b', 'hotovo'), p('c', 'hotovo')], 1),
    true,
  );
  // Stupeň, který v osnově není, hotový není — jinak by dítě dostalo
  // sto bodů za prázdno.
  assert.equal(stupenHotovy(OSNOVA, [], 6), false);
});
