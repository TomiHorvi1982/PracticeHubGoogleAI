import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mistoVlozeni, meniPoradi, cilProPresun, poPresunu } from './pretahovaniPoradi';

const P = ['a', 'b', 'c', 'd'];

test('nad horní půlkou se zařadí před položku, nad dolní za ni', () => {
  assert.equal(mistoVlozeni(2, false), 2);
  assert.equal(mistoVlozeni(2, true), 3);
});

test('na poslední položku jde zařadit i za ni', () => {
  // Bez druhé půlky by šel seznam skládat jen jedním směrem.
  assert.equal(mistoVlozeni(3, true), 4);
  assert.deepEqual(poPresunu(P, 0, 4), ['b', 'c', 'd', 'a']);
});

test('puštění vedle sebe pořadí nemění', () => {
  assert.equal(meniPoradi(1, 1), false, 'těsně před sebe');
  assert.equal(meniPoradi(1, 2), false, 'těsně za sebe');
  assert.equal(meniPoradi(1, 0), true);
  assert.equal(meniPoradi(1, 3), true);
});

test('posun dopředu počítá s tím, že se položka nejdřív vyjme', () => {
  // Čára mezi 'c' a 'd' je místo 3; po vyjmutí 'a' je to index 2.
  assert.equal(cilProPresun(0, 3), 2);
  assert.deepEqual(poPresunu(P, 0, 3), ['b', 'c', 'a', 'd']);
});

test('posun dozadu se nepřepočítává', () => {
  assert.equal(cilProPresun(3, 1), 1);
  assert.deepEqual(poPresunu(P, 3, 1), ['a', 'd', 'b', 'c']);
});

test('přesun na začátek a na konec', () => {
  assert.deepEqual(poPresunu(P, 2, 0), ['c', 'a', 'b', 'd']);
  assert.deepEqual(poPresunu(P, 1, 4), ['a', 'c', 'd', 'b']);
});

test('puštění vedle sebe opravdu nic neudělá', () => {
  assert.deepEqual(poPresunu(P, 1, 1), P);
  assert.deepEqual(poPresunu(P, 1, 2), P);
});

test('nesmyslný zdroj pole nerozhodí', () => {
  assert.deepEqual(poPresunu(P, -1, 2), P);
  assert.deepEqual(poPresunu(P, 9, 2), P);
});

test('pořadí si zachová všechny položky', () => {
  for (let z = 0; z < P.length; z++) {
    for (let m = 0; m <= P.length; m++) {
      const v = poPresunu(P, z, m);
      assert.equal(v.length, P.length, `z=${z} misto=${m}`);
      assert.deepEqual([...v].sort(), [...P].sort(), `z=${z} misto=${m}`);
    }
  }
});
