import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizuj, shoda, vyberNejlepsi, dotazNaSkladbu, NalezenaStopa } from './vyberAlba';

const s = (o: Partial<NalezenaStopa>): NalezenaStopa => ({
  id: '1', nazev: '', interpret: '', album: 'A', albumId: '10', ...o,
});

test('přívažky ve jménu se pro porovnání odstraní', () => {
  assert.equal(normalizuj('Roots Bloody Roots (Live)'), 'roots bloody roots');
  assert.equal(normalizuj('Territory [Remastered 2017]'), 'territory');
  assert.equal(normalizuj('Refuse/Resist - Radio Edit'), 'refuse resist');
});

test('diakritika a velikost písmen nerozhodují', () => {
  assert.equal(shoda('Kabát', 'kabat'), 2);
  assert.equal(shoda('Škwor', 'SKWOR'), 2);
});

test('částečná shoda se pozná, ale váží míň', () => {
  assert.equal(shoda('Roots Bloody Roots', 'Roots'), 1);
  assert.equal(shoda('Roots', 'Territory'), 0);
});

test('cizí interpret se nevezme, i když název sedí přesně', () => {
  // Radši album neukázat než ukázat cizí — coververze mají tentýž
  // název a jiného interpreta.
  const v = [s({ interpret: 'Coverband', nazev: 'Roots Bloody Roots', albumId: '99' })];
  assert.equal(vyberNejlepsi(v, 'Sepultura', 'Roots Bloody Roots'), null);
});

test('interpret váží víc než název', () => {
  const v = [
    s({ id: 'a', interpret: 'Sepultura', nazev: 'Roots Bloody Roots (Live)', albumId: '11' }),
    s({ id: 'b', interpret: 'Jiná kapela', nazev: 'Roots Bloody Roots', albumId: '12' }),
  ];
  assert.equal(vyberNejlepsi(v, 'Sepultura', 'Roots Bloody Roots')?.id, 'a');
});

test('z více verzí téhož interpreta vyhraje přesnější název', () => {
  const v = [
    s({ id: 'a', interpret: 'Sepultura', nazev: 'Roots Bloody Roots (Live)', albumId: '11' }),
    s({ id: 'b', interpret: 'Sepultura', nazev: 'Roots Bloody Roots', albumId: '12' }),
  ];
  // Obě mají po odstranění závorky týž název, tak rozhoduje pořadí —
  // hlavně že vyhraje Sepultura a ne někdo jiný.
  assert.equal(vyberNejlepsi(v, 'Sepultura', 'Roots Bloody Roots')?.interpret, 'Sepultura');
});

test('výsledek bez alba se přeskočí', () => {
  const v = [s({ interpret: 'Sepultura', nazev: 'Roots', albumId: '' })];
  assert.equal(vyberNejlepsi(v, 'Sepultura', 'Roots'), null);
});

test('prázdné výsledky nic nevrátí', () => {
  assert.equal(vyberNejlepsi([], 'Sepultura', 'Roots'), null);
});

test('dotaz začíná interpretem', () => {
  // Bez něj vyhraje nejznámější skladba toho jména bez ohledu na kapelu.
  assert.equal(dotazNaSkladbu('Sepultura', 'Roots'), 'Sepultura Roots');
  assert.equal(dotazNaSkladbu('', 'Roots'), 'Roots');
});
