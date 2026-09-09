import test from 'node:test';
import assert from 'node:assert/strict';

import { STANDARDNI_LADENI, Tonu, midiNaPrazci } from './cvikyTechnik';
import { TRID } from './porovnaniHry';
import { naProcenta, predlohaZTonu, slovy, zkontrolujCvik } from './samokontrola';

const VZ = 22050;

/**
 * Nahraje „hru": pro každý tón kus sinusovky na jeho frekvenci.
 *
 * Sinus místo kytary schválně — měří se shoda výšek, a čistý tón je
 * nejjednodušší předloha, u které se dá říct, co má vyjít.
 */
function zahrej(tony: Tonu[], bpm: number, vzorkovaci = VZ): Float32Array {
  const delka = 30 / bpm;
  const naTon = Math.round(delka * vzorkovaci);
  const out = new Float32Array(naTon * tony.length);
  tony.forEach((t, i) => {
    const midi = midiNaPrazci(t.struna, t.prazec, STANDARDNI_LADENI);
    const hz = 440 * 2 ** ((midi - 69) / 12);
    for (let n = 0; n < naTon; n++) {
      // Pár harmonických, ať to není holá sinusovka — chroma se počítá
      // ze spektra a jeden vrchol je málo reprezentativní.
      const t0 = n / vzorkovaci;
      out[i * naTon + n] = 0.5 * Math.sin(2 * Math.PI * hz * t0)
        + 0.2 * Math.sin(2 * Math.PI * hz * 2 * t0);
    }
  });
  return out;
}

const CVIK: Tonu[] = [
  { struna: 5, prazec: 5 }, { struna: 5, prazec: 7 },
  { struna: 4, prazec: 5 }, { struna: 4, prazec: 7 },
];

test('předloha má tolik snímků, kolik odpovídá tempu', () => {
  const pomalu = predlohaZTonu(CVIK, 60, VZ);
  const rychle = predlohaZTonu(CVIK, 120, VZ);
  assert.ok(pomalu.length > rychle.length, 'pomalejší cvik trvá déle');
  for (const r of pomalu) {
    assert.equal(r.length, TRID);
    // Jeden tón je jedna třída — přesně jedna jednička.
    assert.equal([...r].filter((x) => x === 1).length, 1);
  }
});

test('prázdný cvik nevyrobí předlohu', () => {
  assert.deepEqual(predlohaZTonu([], 80, VZ), []);
});

test('nesmyslné tempo se srovná, ne aby vyrobilo nekonečno snímků', () => {
  const r = predlohaZTonu(CVIK, 0, VZ);
  assert.ok(r.length > 0 && r.length < 100000);
});

test('správně zahraný cvik dostane vysokou shodu', () => {
  const v = zkontrolujCvik(zahrej(CVIK, 80), CVIK, 80, VZ);
  assert.equal(v.merÍtelne, true);
  assert.ok(v.tony > 0.6, `shoda tónů jen ${v.tony.toFixed(2)}`);
  assert.ok(v.procenta >= 60, `jen ${v.procenta} %`);
});

test('úplně jiné tóny dostanou míň než ty správné', () => {
  const spatne: Tonu[] = [
    { struna: 0, prazec: 1 }, { struna: 0, prazec: 2 },
    { struna: 1, prazec: 1 }, { struna: 1, prazec: 3 },
  ];
  const dobre = zkontrolujCvik(zahrej(CVIK, 80), CVIK, 80, VZ);
  const jine = zkontrolujCvik(zahrej(spatne, 80), CVIK, 80, VZ);
  assert.ok(jine.tony < dobre.tony, 'jiné tóny mají mít horší shodu');
});

test('ticho se neznámkuje jako špatná hra', () => {
  // Nula procent by vypadala jako „hraješ špatně", ačkoli se jen nic
  // nenahrálo. To je jiná zpráva.
  const ticho = new Float32Array(VZ * 3);
  const v = zkontrolujCvik(ticho, CVIK, 80, VZ);
  assert.equal(v.merÍtelne, false);
  assert.equal(v.procenta, 0);
  assert.match(slovy(v), /mikrofon/i);
});

test('moc krátká nahrávka se taky neznámkuje', () => {
  const kratka = zahrej(CVIK, 80).slice(0, Math.floor(VZ * 0.2));
  assert.equal(zkontrolujCvik(kratka, CVIK, 80, VZ).merÍtelne, false);
});

test('cvik bez tónů nejde zkontrolovat', () => {
  assert.equal(zkontrolujCvik(zahrej(CVIK, 80), [], 80, VZ).merÍtelne, false);
});

test('tóny váží víc než časování', () => {
  // Kdo hraje správné tóny s kolísavým rytmem, je dál než kdo drží
  // tempo a mačká vedle.
  assert.ok(naProcenta(1, 200) > naProcenta(0.3, 0));
  assert.equal(naProcenta(1, 0), 100);
  assert.equal(naProcenta(0, 0), 30, 'samo časování dá nejvýš třicet');
});

test('rozptyl nad čtvrt vteřiny už se nepočítá', () => {
  assert.equal(naProcenta(1, 250), 70);
  assert.equal(naProcenta(1, 1000), 70, 'horší než čtvrt vteřiny je pořád stejně špatné');
});

test('hodnocení slovy radí, co dělat dál', () => {
  assert.match(slovy({ tony: 1, rozptylMs: 10, procenta: 92, merÍtelne: true }), /odevzdat/i);
  assert.match(slovy({ tony: 0.9, rozptylMs: 200, procenta: 70, merÍtelne: true }), /metronom|ještě jednou/i);
  assert.match(slovy({ tony: 0.2, rozptylMs: 40, procenta: 20, merÍtelne: true }), /zpomal|nesedí/i);
});
