import test from 'node:test';
import assert from 'node:assert/strict';
import { postavDotaz, zpracujOdpoved, platnaDekada, DEKADY } from './tipyKapel.js';

test('český dotaz filtruje zemí, ne žánrem', () => {
  const q = postavDotaz('cesko', 1990);
  assert.ok(q.includes('country:CZ'));
  assert.ok(!q.includes('tag:'), 'žánrový filtr by vyhodil i známé kapely');
});

test('světový dotaz drží žánr', () => {
  const q = postavDotaz('svet', 2010);
  assert.ok(q.includes('tag:metal'));
  assert.ok(!q.includes('country:'));
});

test('dekáda pokrývá celých deset let', () => {
  assert.ok(postavDotaz('cesko', 1990).includes('begin:[1990 TO 1999]'));
  assert.ok(postavDotaz('svet', 2020).includes('begin:[2020 TO 2029]'));
});

test('odpověď se převede na jména', () => {
  const { tipy, celkem } = zpracujOdpoved({
    count: 442,
    artists: [
      { name: 'Škwor', country: 'CZ', 'life-span': { begin: '1998' }, disambiguation: '' },
      { name: 'Vypsaná fiXa', country: 'CZ', 'life-span': { begin: '1993' } },
    ],
  });
  assert.equal(celkem, 442);
  assert.deepEqual(tipy.map((t) => t.jmeno), ['Škwor', 'Vypsaná fiXa']);
  assert.equal(tipy[0].zacatek, '1998');
});

test('stejná kapela vedená dvakrát se ukáže jednou', () => {
  const { tipy } = zpracujOdpoved({
    artists: [{ name: 'Kabát' }, { name: 'kabát' }, { name: 'Lucie' }],
  });
  assert.deepEqual(tipy.map((t) => t.jmeno), ['Kabát', 'Lucie']);
});

test('položka bez jména se zahodí', () => {
  const { tipy } = zpracujOdpoved({ artists: [{ name: '' }, { name: '   ' }, { name: 'Doga' }] });
  assert.deepEqual(tipy.map((t) => t.jmeno), ['Doga']);
});

test('prázdná nebo rozbitá odpověď nespadne', () => {
  assert.deepEqual(zpracujOdpoved(null), { tipy: [], celkem: 0 });
  assert.deepEqual(zpracujOdpoved({}), { tipy: [], celkem: 0 });
  assert.deepEqual(zpracujOdpoved({ artists: 'nesmysl' }), { tipy: [], celkem: 0 });
});

test('celkem bez počtu spadne na délku seznamu', () => {
  assert.equal(zpracujOdpoved({ artists: [{ name: 'A' }, { name: 'B' }] }).celkem, 2);
});

test('dekáda z adresy se ověřuje', () => {
  assert.equal(platnaDekada('1990'), 1990);
  assert.equal(platnaDekada(2020), 2020);
  assert.equal(platnaDekada('1985'), null);
  assert.equal(platnaDekada('nesmysl'), null);
  assert.equal(platnaDekada(undefined), null);
});

test('nabízené dekády jdou po sobě', () => {
  assert.deepEqual(DEKADY, [1990, 2000, 2010, 2020]);
});
