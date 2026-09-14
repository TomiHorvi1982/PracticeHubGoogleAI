import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dobaMetronomu, metronomSeZmenil, platnaAdresaObrazku, platnaZprava, platnyVystup,
  rozdelTextSAkordy, znackyStupnice,
} from './televize';

const LADENI = [40, 45, 50, 55, 59, 64];
const MOLL_PENTATONIKA = [0, 3, 5, 7, 10];

test('každý druh výstupu v platném tvaru projde', () => {
  const vystupy = [
    { druh: 'prazdno' },
    { druh: 'akord', nazev: 'Em' },
    { druh: 'stupnice', zaklad: 57, stupniceId: 'pentatonika_moll' },
    { druh: 'metronom', bpm: 90, dobVTaktu: 4, zacatek: 1_700_000_000_000 },
    { druh: 'metronom', bpm: 90, dobVTaktu: 4, zacatek: null },
    { druh: 'text', nadpis: 'Píseň', text: '[Em]Slova' },
    { druh: 'list', stupen: 3, list: 'osmismerka', semeno: 4 },
    { druh: 'obrazek', url: 'https://example.com/a.png', popis: '' },
  ];
  for (const v of vystupy) assert.equal(platnyVystup(v), true, JSON.stringify(v));
});

test('rozbitý výstup televizi neshodí', () => {
  // Starší verze aplikace v jiné záložce může posílat jiný tvar.
  const spatne = [
    null, undefined, 'akord', 42, {},
    { druh: 'neznamy' },
    { druh: 'akord', nazev: '' },
    { druh: 'akord' },
    { druh: 'stupnice', zaklad: 999, stupniceId: 'dur' },
    { druh: 'metronom', bpm: 0, dobVTaktu: 4, zacatek: null },
    { druh: 'metronom', bpm: 90, dobVTaktu: 0, zacatek: null },
    { druh: 'metronom', bpm: Number.NaN, dobVTaktu: 4, zacatek: null },
    { druh: 'list', stupen: 7, list: 'osmismerka', semeno: 1 },
    { druh: 'list', stupen: 1, list: 'slajdy', semeno: 1 },
    { druh: 'text', nadpis: 'x', text: 'a'.repeat(20001) },
    { druh: 'obrazek', url: 'javascript:alert(1)', popis: '' },
  ];
  for (const v of spatne) assert.equal(platnyVystup(v), false, JSON.stringify(v));
});

test('obrázek jen z adresy, kterou druhé okno opravdu načte', () => {
  assert.equal(platnaAdresaObrazku('https://cdn.example.com/obr.jpg'), true);
  assert.equal(platnaAdresaObrazku('/obrazky/akordy.png'), true);
  assert.equal(platnaAdresaObrazku('http://localhost:3000/x.png'), true);
  // blob: patří jednomu dokumentu — v televizním okně nevede nikam.
  assert.equal(platnaAdresaObrazku('blob:http://localhost:3000/abc'), false);
  assert.equal(platnaAdresaObrazku('http://example.com/x.png'), false);
  assert.equal(platnaAdresaObrazku('//cizi.cz/x.png'), false);
  assert.equal(platnaAdresaObrazku('data:image/png;base64,AAAA'), false);
  assert.equal(platnaAdresaObrazku('nesmysl'), false);
});

test('zprávy mezi okny se kontrolují i s obsahem', () => {
  assert.equal(platnaZprava({ typ: 'ahoj' }), true);
  assert.equal(platnaZprava({ typ: 'zije', celaObrazovka: false }), true);
  assert.equal(platnaZprava({ typ: 'zije' }), false);
  assert.equal(platnaZprava({ typ: 'vystup', vystup: { druh: 'prazdno' } }), true);
  assert.equal(platnaZprava({ typ: 'vystup', vystup: { druh: 'akord' } }), false,
    'platný obal s rozbitým obsahem nesmí projít');
  assert.equal(platnaZprava({ typ: 'jiny' }), false);
  assert.equal(platnaZprava(null), false);
});

test('metronom počítá doby od jedné a v taktu dokola', () => {
  const zacatek = 1_000_000;
  const doba = 60000 / 120; // 500 ms
  assert.deepEqual(dobaMetronomu(120, 4, zacatek, zacatek), { doba: 1, uvnitr: 0 });
  assert.equal(dobaMetronomu(120, 4, zacatek, zacatek + doba)!.doba, 2);
  assert.equal(dobaMetronomu(120, 4, zacatek, zacatek + doba * 3.5)!.doba, 4);
  assert.equal(dobaMetronomu(120, 4, zacatek, zacatek + doba * 4)!.doba, 1, 'po čtvrté době zase jednička');
  assert.equal(dobaMetronomu(120, 3, zacatek, zacatek + doba * 5)!.doba, 3);
  const r = dobaMetronomu(120, 4, zacatek, zacatek + doba * 1.25)!;
  assert.ok(Math.abs(r.uvnitr - 0.25) < 1e-9);
});

test('zastavený metronom nemá dobu a budoucí začátek nespadne', () => {
  assert.equal(dobaMetronomu(120, 4, null, 5000), null);
  assert.equal(dobaMetronomu(0, 4, 1000, 5000), null);
  // Hodiny se mohou o kousek rozejít — záporný čas nemá dát nesmysl.
  assert.deepEqual(dobaMetronomu(120, 4, 5000, 4990), { doba: 1, uvnitr: 0 });
});

test('drobné kolísání začátku se znovu neposílá, změna tempa ano', () => {
  const a = { druh: 'metronom' as const, bpm: 90, dobVTaktu: 4, zacatek: 10_000 };
  assert.equal(metronomSeZmenil(a, { ...a, zacatek: 10_008 }), false);
  assert.equal(metronomSeZmenil(a, { ...a, zacatek: 10_050 }), true);
  assert.equal(metronomSeZmenil(a, { ...a, bpm: 91 }), true);
  assert.equal(metronomSeZmenil(a, { ...a, dobVTaktu: 3 }), true);
  assert.equal(metronomSeZmenil(a, { ...a, zacatek: null }), true, 'zastavení se musí poslat');
  assert.equal(
    metronomSeZmenil({ ...a, zacatek: null }, { ...a, zacatek: null }),
    false,
  );
});

test('mollová pentatonika z A leží, kde má', () => {
  const z = znackyStupnice(57, MOLL_PENTATONIKA, LADENI);
  const na = (struna: number, prazec: number) => z.find((x) => x.struna === struna && x.prazec === prazec);
  // Pátý pražec basové E je A — základní tón.
  assert.equal(na(0, 5)?.koren, true);
  // Osmý pražec basové E je C — v pentatonice, ale ne základ.
  assert.equal(na(0, 8)?.koren, false);
  // Šestý pražec basové E je A# — do stupnice nepatří.
  assert.equal(na(0, 6), undefined);
  // Prázdná A struna je základ.
  assert.equal(na(1, 0)?.koren, true);
});

test('značek je přesně tolik, kolik tónů stupnice na krku leží', () => {
  const z = znackyStupnice(57, MOLL_PENTATONIKA, LADENI, 12);
  // Pražce 0–11 projdou všech dvanáct tříd jednou, takže na každé struně
  // je pět značek; dvanáctý pražec přidá šestou jen tam, kde do stupnice
  // patří už prázdná struna. A–C–D–E–G: prázdné E, A, D, G, e ano, H ne.
  assert.equal(z.length, 5 * 6 + 5);
  assert.ok(z.every((x) => x.prazec >= 0 && x.prazec <= 12 && x.struna >= 0 && x.struna < 6));
});

test('akordy ze závorek se zvednou nad slova', () => {
  assert.deepEqual(rozdelTextSAkordy('[Em]Po stráni [Am]jde'), [
    { akord: 'Em', slova: 'Po stráni ' },
    { akord: 'Am', slova: 'jde' },
  ]);
  assert.deepEqual(rozdelTextSAkordy('Úvod bez akordu'), [{ akord: null, slova: 'Úvod bez akordu' }]);
  // Akord na konci řádku bez textu za ním se neztratí.
  assert.deepEqual(rozdelTextSAkordy('slova [G]'), [
    { akord: null, slova: 'slova ' },
    { akord: 'G', slova: '' },
  ]);
  assert.deepEqual(rozdelTextSAkordy(''), [{ akord: null, slova: '' }]);
});
