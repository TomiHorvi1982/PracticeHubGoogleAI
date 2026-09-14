import test from 'node:test';
import assert from 'node:assert/strict';

import { dobaVTaktu, polohaJezdce, zaUderem } from './metronomPohyb';

const blizko = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('na každou dobu je jezdec přesně na kraji', () => {
  // Klepnutí a kraj musí padnout na stejný okamžik — o to jde.
  assert.ok(blizko(polohaJezdce(0), 0), 'první doba vlevo');
  assert.ok(blizko(polohaJezdce(1), 1), 'druhá vpravo');
  assert.ok(blizko(polohaJezdce(2), 0), 'třetí zase vlevo');
  assert.ok(blizko(polohaJezdce(7), 1));
});

test('mezi dobami jede přes střed', () => {
  assert.ok(blizko(polohaJezdce(0.5), 0.5));
  assert.ok(blizko(polohaJezdce(1.5), 0.5));
});

test('u kraje zpomalí jako kyvadlo', () => {
  // Stejný kus času ujede u kraje méně než uprostřed — oko pak úder vidí.
  const uKraje = polohaJezdce(0.1) - polohaJezdce(0);
  const veStredu = polohaJezdce(0.55) - polohaJezdce(0.45);
  assert.ok(uKraje < veStredu, `${uKraje} vs ${veStredu}`);
});

test('poloha zůstává v mezích i pro nesmysl', () => {
  for (const p of [-3, Number.NaN, Infinity, 1e9 + 0.3]) {
    const x = polohaJezdce(p);
    assert.ok(x >= 0 && x <= 1, `${p} → ${x}`);
  }
});

test('kolikátá doba v taktu', () => {
  assert.equal(dobaVTaktu(0, 4), 0);
  assert.equal(dobaVTaktu(3.99, 4), 3);
  assert.equal(dobaVTaktu(4, 4), 0, 'nový takt');
  assert.equal(dobaVTaktu(5.2, 3), 2);
  assert.equal(dobaVTaktu(-1, 4), 0, 'před spuštěním');
  assert.equal(dobaVTaktu(2, 0), 0, 'nesmyslný takt nespadne');
});

test('jak dávno padl poslední úder', () => {
  assert.ok(blizko(zaUderem(3), 0));
  assert.ok(blizko(zaUderem(3.25), 0.25));
  assert.equal(zaUderem(-0.5), 0);
});
