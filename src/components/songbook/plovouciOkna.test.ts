import test from 'node:test';
import assert from 'node:assert/strict';
import {
  vychoziOkna, srovnejDoRadku, AUTO_OKNA, noveOkno, POPIS_OKEN, Okno, TypOkna,
} from './plovouciOkna.js';

/** Předstíraný registr: říká, ke kterým typům jsou u písně data. */
const maData = (...typy: TypOkna[]) => (t: TypOkna) => typy.includes(t);

test('píseň bez čehokoli nechá plochu prázdnou', () => {
  assert.deepEqual(vychoziOkna(maData()), []);
});

test('otevře se jen to, k čemu jsou data', () => {
  const o = vychoziOkna(maData('tabs', 'youtube'));
  assert.deepEqual(o.map((x) => x.typ), ['tabs', 'youtube']);
});

test('pořadí je dané, ne podle toho, co přišlo dřív', () => {
  const o = vychoziOkna(maData('stems_mixer', 'text_chords', 'tabs'));
  assert.deepEqual(o.map((x) => x.typ), ['tabs', 'text_chords', 'stems_mixer']);
});

test('všechny čtyři materiály naráz', () => {
  const o = vychoziOkna(maData(...AUTO_OKNA));
  assert.equal(o.length, 4);
  assert.deepEqual(o.map((x) => x.typ), ['tabs', 'text_chords', 'youtube', 'stems_mixer']);
});

test('okna se nepřekrývají — leží vedle sebe, ne schodovitě', () => {
  const o = vychoziOkna(maData('tabs', 'text_chords'), 2000);
  // Na široké ploše se vejdou vedle sebe, takže druhé začíná za prvním.
  assert.ok(o[1].x >= o[0].x + o[0].sirka, 'druhé okno leží přes první');
  assert.equal(o[0].y, o[1].y, 'na jednom řádku mají mít stejnou výšku');
});

test('na úzké ploše se zalomí na další řádek', () => {
  const o = vychoziOkna(maData('tabs', 'text_chords'), 800);
  assert.equal(o[1].x, 12, 'druhé okno mělo začít nový řádek');
  assert.ok(o[1].y > o[0].y, 'druhý řádek má být níž');
});

test('každé okno má vlastní identitu', () => {
  const o = vychoziOkna(maData(...AUTO_OKNA));
  assert.equal(new Set(o.map((x) => x.id)).size, o.length);
});

test('pořadí navrchu roste, takže se okna dají vytáhnout dopředu', () => {
  const o = vychoziOkna(maData(...AUTO_OKNA));
  for (let i = 1; i < o.length; i++) assert.ok(o[i].poradi > o[i - 1].poradi);
});

test('okna dostanou výchozí rozměry svého typu', () => {
  const o = vychoziOkna(maData('tabs'));
  assert.equal(o[0].sirka, POPIS_OKEN.tabs.vychoziSirka);
  assert.equal(o[0].vyska, POPIS_OKEN.tabs.vychoziVyska);
});

test('srovnání do řádků respektuje sbalené okno', () => {
  const a: Okno = { ...noveOkno('tabs', []), sbalene: true };
  const b = noveOkno('youtube', [a]);
  const [, druhe] = srovnejDoRadku([a, b], 600);
  // Sbalené okno je vysoké 32, takže další řádek začíná hned pod ním.
  assert.equal(druhe.y, 12 + 32 + 12);
});
