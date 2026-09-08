import test from 'node:test';
import assert from 'node:assert/strict';
import {
  vychoziOkna, srovnejDoRadku, rozlozNaPlochu, AUTO_OKNA, noveOkno, POPIS_OKEN, Okno, TypOkna,
} from './plovouciOkna.js';

/** Předstíraný registr: říká, ke kterým typům jsou u písně data. */
const maData = (...typy: TypOkna[]) => (t: TypOkna) => typy.includes(t);

test('základní okna se otevřou i u písně, ke které nic není', () => {
  // Tabulatura, text a pult jsou to, kolem čeho se hraje. Prázdné okno
  // aspoň řekne, že materiál chybí; chybějící okno se musí na zkoušce
  // doklikávat.
  const o = vychoziOkna(maData());
  assert.deepEqual(o.map((x) => x.typ), ['tabs', 'text_chords', 'stems_mixer']);
});

test('okno navíc se otevře jen tam, kde je k němu materiál', () => {
  const bezVidea = vychoziOkna(maData('tabs'));
  assert.ok(!bezVidea.some((x) => x.typ === 'youtube'), 'video bez odkazu se otevírat nemá');

  const sVideem = vychoziOkna(maData('tabs', 'youtube'));
  assert.ok(sVideem.some((x) => x.typ === 'youtube'));
  // Základní tři jsou tam v obou případech.
  for (const t of ['tabs', 'text_chords', 'stems_mixer']) {
    assert.ok(bezVidea.some((x) => x.typ === t), `chybí ${t}`);
  }
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

test('rozvržení vyplní plochu a nic nepřeteče', () => {
  const okna = vychoziOkna(maData());   // tabulatura, text, pult
  const S = 1600; const V = 900;
  const r = rozlozNaPlochu(okna, S, V);
  for (const o of r) {
    assert.ok(o.x >= 0 && o.x + o.sirka <= S, `${o.typ} přetéká do šířky`);
    assert.ok(o.y >= 0 && o.y + o.vyska <= V, `${o.typ} přetéká do výšky`);
    assert.ok(o.sirka > 100 && o.vyska > 100, `${o.typ} je nepoužitelně malé`);
  }
});

test('pult drží celou šířku, ostatní se dělí nad ním', () => {
  const r = rozlozNaPlochu(vychoziOkna(maData()), 1600, 900);
  const pult = r.find((o) => o.typ === 'stems_mixer')!;
  const horni = r.filter((o) => o.typ !== 'stems_mixer');
  assert.ok(pult.sirka > horni[0].sirka, 'pult má být širší než okna nad ním');
  for (const o of horni) assert.ok(o.y < pult.y, 'pult patří pod ostatní');
  // Horní okna stojí vedle sebe, ne přes sebe.
  assert.notEqual(horni[0].x, horni[1].x);
  assert.equal(horni[0].y, horni[1].y);
});

test('jediné okno si vezme celou plochu', () => {
  const jedno = vychoziOkna(maData()).slice(0, 1);
  const r = rozlozNaPlochu(jedno, 1600, 900);
  assert.ok(r[0].sirka > 1500 && r[0].vyska > 850);
});

test('směšně malá plocha rozvržení nezmění', () => {
  const okna = vychoziOkna(maData());
  assert.deepEqual(rozlozNaPlochu(okna, 200, 150), okna);
});
