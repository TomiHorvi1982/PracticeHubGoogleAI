import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rozdelNaAkordy, SberacAkordu, MEZERA_MS } from './sberAkordu';

/** E dur na kytaře: E A E G# B E, rozebrané po strunách. */
const ROZEBRANE_E = [
  { midi: 40, cas: 0 },
  { midi: 47, cas: 220 },
  { midi: 52, cas: 430 },
  { midi: 56, cas: 640 },
  { midi: 59, cas: 850 },
  { midi: 64, cas: 1060 },
];

test('struny zahrané po sobě dají jeden akord', () => {
  const a = rozdelNaAkordy(ROZEBRANE_E);
  assert.equal(a.length, 1);
  assert.deepEqual(a[0], [40, 47, 52, 56, 59, 64]);
});

test('mezera akord uzavře a začne další', () => {
  const a = rozdelNaAkordy([
    { midi: 40, cas: 0 },
    { midi: 47, cas: 200 },
    // dvouvteřinová pauza — jiný akord
    { midi: 45, cas: 2200 },
    { midi: 52, cas: 2400 },
  ]);
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], [40, 47]);
  assert.deepEqual(a[1], [45, 52]);
});

test('táž struna dvakrát se nepočítá dvakrát', () => {
  // Mikrofon zachytí doznívající strunu znovu; akordu to nepomůže.
  const a = rozdelNaAkordy([
    { midi: 40, cas: 0 },
    { midi: 40, cas: 150 },
    { midi: 47, cas: 300 },
  ]);
  assert.deepEqual(a[0], [40, 47]);
});

test('tóny se vrací seřazené odspodu', () => {
  const a = rozdelNaAkordy([
    { midi: 64, cas: 0 },
    { midi: 40, cas: 100 },
    { midi: 52, cas: 200 },
  ]);
  assert.deepEqual(a[0], [40, 52, 64]);
});

test('nepřetržité brnkání se po čase uzavře samo', () => {
  // Bez horního stropu by se sbíralo donekonečna a nic by se nevyhodnotilo.
  const udery = Array.from({ length: 30 }, (_, i) => ({ midi: 40 + (i % 6), cas: i * 300 }));
  const a = rozdelNaAkordy(udery);
  assert.ok(a.length > 1, 'mělo se to rozdělit na víc akordů');
});

test('prázdný vstup nic nevyrobí', () => {
  assert.deepEqual(rozdelNaAkordy([]), []);
});

test('živý sběr uzavře akord až při dalším úderu po pauze', () => {
  const s = new SberacAkordu();
  assert.equal(s.pridej({ midi: 40, cas: 0 }), null);
  assert.equal(s.pridej({ midi: 47, cas: 200 }), null);
  assert.deepEqual(s.rozpracovany(), [40, 47]);

  const hotovy = s.pridej({ midi: 45, cas: 200 + MEZERA_MS + 100 });
  assert.deepEqual(hotovy, [40, 47]);
  assert.deepEqual(s.rozpracovany(), [45]);
});

test('poslední akord jde uzavřít ručně', () => {
  // Nikdo už další tón nezahraje — bez tohohle by zůstal viset.
  const s = new SberacAkordu();
  s.pridej({ midi: 40, cas: 0 });
  s.pridej({ midi: 47, cas: 100 });
  assert.deepEqual(s.uzavri(), [40, 47]);
  assert.equal(s.uzavri(), null);
});
