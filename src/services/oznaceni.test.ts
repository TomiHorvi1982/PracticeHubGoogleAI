import test from 'node:test';
import assert from 'node:assert/strict';

import { Oznaceni, jeZeStroje, prepni, zkratText } from './oznaceni';

const z = (text: string, sekce = 'stemmixer'): Oznaceni => ({ text, sekce, prvek: 'span', kdy: 1 });

test('první klik označí', () => {
  assert.deepEqual(prepni([], z('8 stop')).map((x) => x.text), ['8 stop']);
});

test('druhý klik na totéž označení zruší', () => {
  assert.equal(prepni([z('8 stop')], z('8 stop')).length, 0);
});

test('stejný text v jiné sekci je jiné označení', () => {
  // „Nastavení" může být nadpis v mixpultu i v ladičce — smazat se má jen ten, na který se kliklo.
  assert.equal(prepni([z('Nastavení', 'tuner')], z('Nastavení', 'stemmixer')).length, 2);
});

test('text se zkrátí a sjednotí mezery', () => {
  assert.equal(zkratText('  Mixážní\n   pult  '), 'Mixážní pult');
  assert.equal(zkratText('x'.repeat(500)).length, 200);
});

test('zapisovat smí jen tenhle počítač', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(jeZeStroje(a), true, a);
  for (const a of ['192.168.1.20', '::ffff:10.0.0.5', '', undefined]) assert.equal(jeZeStroje(a), false, String(a));
});
