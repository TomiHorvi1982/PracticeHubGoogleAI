import test from 'node:test';
import assert from 'node:assert/strict';

import { bodNaOblouku, dalsiUhel, drzenyTon, uhelZCentu } from './ladickaPohyb';

test('střed stupnice je svisle, kraje vodorovně', () => {
  assert.equal(uhelZCentu(0), 0);
  assert.equal(uhelZCentu(50), 90);
  assert.equal(uhelZCentu(-50), -90);
  assert.equal(uhelZCentu(25), 45);
});

test('mimo stupnici ručička nevyjede', () => {
  // Engine hlásí nanejvýš ±50 centů, ale ručička se nesmí zamotat ani tak.
  assert.equal(uhelZCentu(120), 90);
  assert.equal(uhelZCentu(-120), -90);
  assert.equal(uhelZCentu(Number.NaN), 0, 'nesmysl na vstupu ručičku neutrhne');
});

test('ručička se k cíli přibližuje, nepřeskočí ho', () => {
  const u = dalsiUhel({ soucasny: 0, cil: 90, dtMs: 16, casovaKonstanta: 120 });
  assert.ok(u > 0 && u < 90, `mezi startem a cílem, dostal ${u}`);
});

test('rychlost pohybu nezávisí na tom, jak často se kreslí', () => {
  /*
   * Jinak by ručička na pomalém stroji jela jinak než na rychlém. Dva
   * kroky po 16 ms musí skončit tam, kde jeden krok po 32 ms.
   */
  const jeden = dalsiUhel({ soucasny: 0, cil: 90, dtMs: 32, casovaKonstanta: 120 });
  const prvni = dalsiUhel({ soucasny: 0, cil: 90, dtMs: 16, casovaKonstanta: 120 });
  const dva = dalsiUhel({ soucasny: prvni, cil: 90, dtMs: 16, casovaKonstanta: 120 });
  assert.ok(Math.abs(jeden - dva) < 0.001, `${jeden} vs ${dva}`);
});

test('u cíle se ručička zastaví úplně', () => {
  // Bez tohohle by se donekonečna dopočítávala setina stupně a plátno
  // by se překreslovalo, i když se nic neděje.
  assert.equal(dalsiUhel({ soucasny: 90 - 0.001, cil: 90, dtMs: 16, casovaKonstanta: 120 }), 90);
  assert.equal(dalsiUhel({ soucasny: 12, cil: 12, dtMs: 16, casovaKonstanta: 120 }), 12);
});

test('bez času se ručička nehne', () => {
  assert.equal(dalsiUhel({ soucasny: 10, cil: 90, dtMs: 0, casovaKonstanta: 120 }), 10);
});

const ton = { frequency: 110, note: 'A', octave: 2, cents: 3, clarity: 0.9 };

test('při krátkém výpadku signálu tón zůstane', () => {
  /*
   * Mezi doznívajícími tóny engine hlásí ticho i několikrát za vteřinu.
   * Kdyby se displej hned vyprázdnil, poskakuje celá stránka.
   */
  assert.deepEqual(drzenyTon({ posledni: ton, kdy: 1000, ted: 1300, drzetMs: 1000 }), ton);
});

test('po delším tichu se displej vyprázdní', () => {
  assert.equal(drzenyTon({ posledni: ton, kdy: 1000, ted: 2500, drzetMs: 1000 }), null);
});

test('když nikdy nic nepřišlo, není co držet', () => {
  assert.equal(drzenyTon({ posledni: null, kdy: 0, ted: 500, drzetMs: 1000 }), null);
});

test('bod na oblouku', () => {
  // Nula míří nahoru, kladné doprava — stejně jako ručička.
  const nahore = bodNaOblouku(100, 100, 50, 0);
  assert.ok(Math.abs(nahore.x - 100) < 0.001, `x ${nahore.x}`);
  assert.ok(Math.abs(nahore.y - 50) < 0.001, `y ${nahore.y}`);

  const vpravo = bodNaOblouku(100, 100, 50, 90);
  assert.ok(Math.abs(vpravo.x - 150) < 0.001, `x ${vpravo.x}`);
  assert.ok(Math.abs(vpravo.y - 100) < 0.001, `y ${vpravo.y}`);
});
