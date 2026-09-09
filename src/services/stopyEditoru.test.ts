import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KlipData, StopaData, delkaVzorku, klipVCase, konecKlipu, nastavProlinacku,
  posunKlip, rozstrihni, rozstrihniStopu, smazKlip, uvnitr,
} from './stopyEditoru';

const klip = (o: Partial<KlipData> = {}): KlipData => ({
  id: 'k1',
  startSample: 1000,
  durationSamples: 4000,
  offsetSamples: 500,
  sampleRate: 44100,
  ...o,
});

const stopa = (klipy: KlipData[]): StopaData => ({ id: 's1', clips: klipy });

test('konec klipu je začátek plus délka', () => {
  assert.equal(konecKlipu(klip()), 5000);
});

test('uvnitř klipu neplatí pro jeho kraje', () => {
  // Střih na kraji by vyrobil prázdný kus, který se nedá chytit ani smazat.
  assert.equal(uvnitr(klip(), 1000), false);
  assert.equal(uvnitr(klip(), 5000), false);
  assert.equal(uvnitr(klip(), 1001), true);
  assert.equal(uvnitr(klip(), 4999), true);
  assert.equal(uvnitr(klip(), 500), false);
});

test('střih vyrobí dva klipy, které dohromady hrají totéž', () => {
  const [a, b] = rozstrihni(klip(), 3000, 'k2');
  assert.equal(a.startSample, 1000);
  assert.equal(a.durationSamples, 2000);
  assert.equal(b.startSample, 3000);
  assert.equal(b.durationSamples, 2000);
  // Součet délek sedí na původní.
  assert.equal(a.durationSamples + b.durationSamples, 4000);
  // A navazují na sebe bez díry i bez překryvu.
  assert.equal(konecKlipu(a), b.startSample);
});

test('druhá půlka nezačne od začátku souboru', () => {
  // Tohle je ta chyba, kterou by nikdo nečekal: bez posunutého offsetu
  // by se za střihem přehrál začátek nahrávky znovu.
  const [, b] = rozstrihni(klip({ offsetSamples: 500 }), 3000, 'k2');
  assert.equal(b.offsetSamples, 500 + 2000);
});

test('střih mimo klip nebo na kraji nic nedělá', () => {
  assert.deepEqual(rozstrihni(klip(), 500, 'k2'), [klip()]);
  assert.deepEqual(rozstrihni(klip(), 1000, 'k2'), [klip()]);
  assert.deepEqual(rozstrihni(klip(), 5000, 'k2'), [klip()]);
  assert.deepEqual(rozstrihni(klip(), 9000, 'k2'), [klip()]);
});

test('nové id se nesmí shodovat s původním', () => {
  const [a, b] = rozstrihni(klip(), 3000, 'k2');
  assert.notEqual(a.id, b.id);
});

test('prolínačky se u střihu zahodí na nově vzniklých krajích', () => {
  const puvodni = klip({ fadeIn: { duration: 0.1, type: 'linear' }, fadeOut: { duration: 0.1, type: 'linear' } });
  const [a, b] = rozstrihni(puvodni, 3000, 'k2');
  // Náběh na začátku a doznění na konci zůstávají; uprostřed by visely
  // v místě střihu a bylo by slyšet ztišení tam, kde nic nekončí.
  assert.deepEqual(a.fadeIn, puvodni.fadeIn);
  assert.equal(a.fadeOut, undefined);
  assert.equal(b.fadeIn, undefined);
  assert.deepEqual(b.fadeOut, puvodni.fadeOut);
});

test('ve stopě se stříhá nanejvýš jeden klip', () => {
  const s = stopa([
    klip({ id: 'a', startSample: 0, durationSamples: 2000 }),
    klip({ id: 'b', startSample: 2000, durationSamples: 3000 }),
  ]);
  const po = rozstrihniStopu(s, 3000, 'novy');
  assert.equal(po.clips.length, 3);
  assert.deepEqual(po.clips.map((k) => k.startSample), [0, 2000, 3000]);
});

test('střih mimo všechny klipy vrátí tutéž stopu', () => {
  const s = stopa([klip({ startSample: 0, durationSamples: 1000 })]);
  assert.equal(rozstrihniStopu(s, 5000, 'novy'), s, 'nemá vzniknout nová kopie');
});

test('klip v čase se najde, mimo klipy se vrátí minus jedna', () => {
  const s = stopa([
    klip({ id: 'a', startSample: 0, durationSamples: 1000 }),
    klip({ id: 'b', startSample: 3000, durationSamples: 1000 }),
  ]);
  assert.equal(klipVCase(s, 500), 0);
  assert.equal(klipVCase(s, 3500), 1);
  assert.equal(klipVCase(s, 2000), -1, 'mezera mezi klipy');
  assert.equal(klipVCase(s, 1000), -1, 'konec klipu už do něj nepatří');
});

test('prolínačka se počítá ve vteřinách, ne ve vzorcích', () => {
  // Knihovna čte `duration` jako vteřiny. Kdyby se sem poslaly vzorky,
  // půlvteřinová prolínačka by vyšla na dvacet minut a klip by byl němý.
  const k = klip({ durationSamples: 44100 });
  const p = nastavProlinacku(k, 'in', 0.5);
  assert.deepEqual(p.fadeIn, { duration: 0.5, type: 'logarithmic' });
});

test('prolínačka se ořízne na délku klipu', () => {
  const k = klip({ durationSamples: 4410 });   // 0,1 s
  const dlouha = nastavProlinacku(k, 'in', 10);
  assert.equal(dlouha.fadeIn?.duration, 0.1, 'delší prolínačka než klip nedává smysl');
  const kratka = nastavProlinacku(k, 'out', 0.05);
  assert.equal(kratka.fadeOut?.duration, 0.05);
});

test('nulová prolínačka ji sundá', () => {
  const s = nastavProlinacku(klip({ fadeIn: { duration: 0.1, type: 'linear' } }), 'in', 0);
  assert.equal(s.fadeIn, undefined);
  // Záporná hodnota se chová jako nula, ne jako chyba.
  assert.equal(nastavProlinacku(klip(), 'out', -5).fadeOut, undefined);
});

test('prolínačka na jednom kraji nesahá na druhý', () => {
  const s = nastavProlinacku(klip({ fadeOut: { duration: 0.7, type: 'linear' } }), 'in', 0.01);
  assert.deepEqual(s.fadeOut, { duration: 0.7, type: 'linear' });
});

test('klip se neposune před nulu', () => {
  assert.equal(posunKlip(klip({ startSample: 1000 }), -500).startSample, 500);
  assert.equal(posunKlip(klip({ startSample: 1000 }), -9000).startSample, 0);
  assert.equal(posunKlip(klip({ startSample: 1000 }), 500).startSample, 1500);
});

test('smazání odebere právě jeden klip', () => {
  const s = stopa([klip({ id: 'a' }), klip({ id: 'b' })]);
  assert.deepEqual(smazKlip(s, 'a').clips.map((k) => k.id), ['b']);
  assert.equal(smazKlip(s, 'nic').clips.length, 2);
});

test('délka skladby je nejzazší konec ze všech stop', () => {
  const stopy = [
    stopa([klip({ startSample: 0, durationSamples: 1000 })]),
    stopa([klip({ startSample: 5000, durationSamples: 2000 })]),
  ];
  assert.equal(delkaVzorku(stopy), 7000);
  assert.equal(delkaVzorku([]), 0);
  assert.equal(delkaVzorku([stopa([])]), 0);
});
