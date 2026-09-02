import test from 'node:test';
import assert from 'node:assert/strict';
import { rozsahTiku, taktyZTiku, poctuTaktu, UsekKeCviceni } from './usekDoCviceni.js';

// Takty po 3840 tikách (čtyřčtvrteční takt při 960 tikách na čtvrtku).
const ZACATKY = [0, 3840, 7680, 11520, 15360];

test('jeden takt končí tam, kde začíná další', () => {
  assert.deepEqual(rozsahTiku(ZACATKY, 1, 1), { odTiku: 3840, doTiku: 7680 });
});

test('víc taktů zabere celý rozsah', () => {
  assert.deepEqual(rozsahTiku(ZACATKY, 1, 3), { odTiku: 3840, doTiku: 15360 });
});

test('poslední takt se dohraje do konce partitury', () => {
  // Za posledním taktem žádný další začátek není.
  assert.deepEqual(rozsahTiku(ZACATKY, 4, 4, 19200), { odTiku: 15360, doTiku: 19200 });
});

test('tažení zprava doleva dá stejný úsek', () => {
  assert.deepEqual(rozsahTiku(ZACATKY, 3, 1), rozsahTiku(ZACATKY, 1, 3));
});

test('takt mimo rozsah se ořízne, ne spadne', () => {
  // Konec se dopočte podle délky předchozího taktu (3840).
  assert.deepEqual(rozsahTiku(ZACATKY, 0, 99), { odTiku: 0, doTiku: 19200 });
  assert.deepEqual(rozsahTiku(ZACATKY, -5, 0), { odTiku: 0, doTiku: 3840 });
});

test('bez taktů není co vracet', () => {
  assert.equal(rozsahTiku([], 0, 2), null);
});

test('poslední takt bez známého konce se odhadne podle předchozího', () => {
  // Předchozí takt je dlouhý 3840 tiků, tak se stejná délka dá i poslednímu.
  assert.deepEqual(rozsahTiku(ZACATKY, 4, 4), { odTiku: 15360, doTiku: 19200 });
});

test('jediný takt bez měřítka dostane délku čtyřčtvrtečního taktu', () => {
  assert.deepEqual(rozsahTiku([0], 0, 0), { odTiku: 0, doTiku: 3840 });
});

test('počet taktů se počítá včetně obou konců', () => {
  const u = { odTaktu: 2, doTaktu: 6 } as UsekKeCviceni;
  assert.equal(poctuTaktu(u), 5);
  assert.equal(poctuTaktu({ odTaktu: 3, doTaktu: 3 } as UsekKeCviceni), 1);
});

test('výběr doprostřed taktu se rozšíří na celé takty', () => {
  // Od půlky druhého taktu do půlky třetího.
  assert.deepEqual(taktyZTiku(ZACATKY, 5000, 9000), { odTaktu: 1, doTaktu: 2 });
});

test('výběr přesně po hranicích taktů nezabere ten následující', () => {
  // Od začátku druhého po začátek čtvrtého = takty 1 a 2, ne 1 až 3.
  assert.deepEqual(taktyZTiku(ZACATKY, 3840, 11520), { odTaktu: 1, doTaktu: 2 });
});

test('výběr uvnitř jediného taktu dá ten takt', () => {
  assert.deepEqual(taktyZTiku(ZACATKY, 4000, 4200), { odTaktu: 1, doTaktu: 1 });
});

test('obrácené tažení dá stejné takty', () => {
  assert.deepEqual(taktyZTiku(ZACATKY, 9000, 5000), taktyZTiku(ZACATKY, 5000, 9000));
});

test('bez taktů není co určit', () => {
  assert.equal(taktyZTiku([], 0, 100), null);
});

test('přichycení a převod zpět na tiky drží celé takty', () => {
  const t = taktyZTiku(ZACATKY, 5000, 9000)!;
  assert.deepEqual(rozsahTiku(ZACATKY, t.odTaktu, t.doTaktu), { odTiku: 3840, doTiku: 11520 });
});
