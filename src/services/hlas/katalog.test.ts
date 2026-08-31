import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vyhradyKeKroku, akcePodleId, AKCE } from './katalog';

test('každá akce má jednoznačné id a aspoň jednu frázi', () => {
  const ids = AKCE.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of AKCE) assert.ok(a.vychoziFraze.length > 0, `${a.id} nemá frázi`);
});

test('krok bez parametrů projde', () => {
  assert.deepEqual(vyhradyKeKroku({ akce: 'prehravani.spust', hodnoty: {} }), []);
});

test('vymyšlená akce se odmítne', () => {
  // Tohle je přesně to, co může přijít z popisu přeloženého modelem.
  const v = vyhradyKeKroku({ akce: 'kytara.rozladit', hodnoty: {} });
  assert.equal(v.length, 1);
  assert.match(v[0], /neexistuje/);
});

test('tempo mimo rozsah se odmítne', () => {
  assert.match(vyhradyKeKroku({ akce: 'metronom.tempo', hodnoty: { bpm: 5000 } })[0], /nad 300/);
  assert.match(vyhradyKeKroku({ akce: 'metronom.tempo', hodnoty: { bpm: 4 } })[0], /pod 20/);
  assert.deepEqual(vyhradyKeKroku({ akce: 'metronom.tempo', hodnoty: { bpm: 120 } }), []);
});

test('neexistující sekce se odmítne', () => {
  assert.match(vyhradyKeKroku({ akce: 'navigace.otevri', hodnoty: { sekce: 'kuchyně' } })[0], /neexistuje/);
  assert.deepEqual(vyhradyKeKroku({ akce: 'navigace.otevri', hodnoty: { sekce: 'pódium' } }), []);
});

test('chybějící povinný text se pozná', () => {
  const v = vyhradyKeKroku({ akce: 'zpevnik.otevriSkladbu', hodnoty: {} });
  assert.match(v[0], /Chybí/);
});

test('vynechaný parametr s výchozí hodnotou projde', () => {
  assert.deepEqual(vyhradyKeKroku({ akce: 'metronom.tempo', hodnoty: {} }), []);
  assert.ok(akcePodleId('metronom.tempo'));
});
