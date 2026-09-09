import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DNU_V_SERII, Odmena, SAZBY, ZaznamBodu, bodyZaKviz, bodyZaUkol, lzeVymenit,
  nasbirano, seradOdmeny, serieDnu, serieDosazena, zdrojStupne, zdrojUkolu, zustatek,
} from './body';

const z = (pocet: number, vymeneno: string | null = null): ZaznamBodu => ({
  id: Math.random().toString(36), zak_id: 'z1', pocet,
  za_co: 'něco', zdroj: null, vymeneno_za: vymeneno, datum: '2026-09-01T10:00:00Z',
});

const odmena = (nazev: string, cena: number, aktivni = true): Odmena =>
  ({ id: nazev, nazev, cena, aktivni });

test('zůstatek je součet, výměny se odečítají', () => {
  assert.equal(zustatek([z(10), z(15), z(-50, 'lízátko')]), -25);
  assert.equal(zustatek([]), 0);
});

test('nasbíráno počítá jen připsané, ne utracené', () => {
  const zaznamy = [z(100), z(25), z(-50, 'plectrum')];
  assert.equal(nasbirano(zaznamy), 125);
  assert.equal(zustatek(zaznamy), 75);
});

test('vyměnit jde jen to, na co body stačí a co je v nabídce', () => {
  const zaznamy = [z(100)];
  assert.equal(lzeVymenit(zaznamy, odmena('lízátko', 50)), true);
  assert.equal(lzeVymenit(zaznamy, odmena('lízátko', 100)), true, 'přesně na to má');
  assert.equal(lzeVymenit(zaznamy, odmena('struny', 300)), false);
  assert.equal(lzeVymenit(zaznamy, odmena('vyřazené', 10, false)), false);
});

test('pozdě odevzdaný úkol dostane míň, ale ne nulu', () => {
  // Dítě, které to dodělalo o dva dny později, udělalo přesně to, co po
  // něm chceme — jen později.
  assert.equal(bodyZaUkol(true, false), SAZBY.ukolVcas);
  assert.equal(bodyZaUkol(false, false), SAZBY.ukolPozde);
  assert.ok(bodyZaUkol(false, false) > 0, 'za pozdní odevzdání nemá být nula');
  assert.ok(bodyZaUkol(true, false) > bodyZaUkol(false, false));
});

test('splněné cílové tempo přidá bonus', () => {
  assert.equal(bodyZaUkol(true, true), SAZBY.ukolVcas + SAZBY.ukolNaTempo);
  assert.equal(bodyZaUkol(false, true), SAZBY.ukolPozde + SAZBY.ukolNaTempo);
});

test('kvíz bez chyby dá plnou sazbu, dokončený něco', () => {
  assert.equal(bodyZaKviz(6, 6), SAZBY.kvizBezChyby);
  assert.equal(bodyZaKviz(4, 6), SAZBY.kvizDokoncen);
  assert.equal(bodyZaKviz(0, 6), SAZBY.kvizDokoncen, 'i za pokus se něco dá');
  assert.equal(bodyZaKviz(0, 0), 0, 'kvíz bez otázek není kvíz');
});

test('série počítá dny v řadě', () => {
  const dnes = new Date('2026-09-09T18:00:00');
  const dny = ['2026-09-09', '2026-09-08', '2026-09-07', '2026-09-06', '2026-09-05'];
  assert.equal(serieDnu(dny, dnes), 5);
  assert.equal(serieDosazena(dny, dnes), true);
});

test('série se nepřeruší, dokud dnes ještě nezačalo', () => {
  // Kdo cvičil pět dní a dnes ještě nesáhl na kytaru, o sérii nepřijde
  // v poledne. Přeruší ji až celý vynechaný den.
  const dnes = new Date('2026-09-09T12:00:00');
  const dny = ['2026-09-08', '2026-09-07', '2026-09-06', '2026-09-05', '2026-09-04'];
  assert.equal(serieDnu(dny, dnes), 5);
  // Ale o den později už série spadne.
  assert.equal(serieDnu(dny, new Date('2026-09-10T12:00:00')), 0);
});

test('vynechaný den sérii utne', () => {
  const dnes = new Date('2026-09-09T18:00:00');
  const dny = ['2026-09-09', '2026-09-08', '2026-09-06', '2026-09-05'];
  assert.equal(serieDnu(dny, dnes), 2);
  assert.equal(serieDosazena(dny, dnes), false);
});

test('opakovaná aktivita v jednom dni sérii nenafoukne', () => {
  const dnes = new Date('2026-09-09T18:00:00');
  const dny = ['2026-09-09T08:00:00Z', '2026-09-09T15:00:00Z', '2026-09-09T20:00:00Z'];
  assert.equal(serieDnu(dny, dnes), 1, 'třikrát za den je pořád jeden den');
});

test('bez aktivity není série', () => {
  assert.equal(serieDnu([], new Date()), 0);
  assert.equal(serieDosazena([], new Date()), false);
  assert.ok(DNU_V_SERII >= 2);
});

test('ceník: co si dítě může dovolit, je napřed', () => {
  const nabidka = [odmena('struny', 300), odmena('plectrum', 100), odmena('lízátko', 50)];
  // Se 120 body dosáhne na lízátko a plectrum.
  const s = seradOdmeny(nabidka, 120);
  assert.deepEqual(s.map((o) => o.nazev), ['lízátko', 'plectrum', 'struny']);
  // Bez bodů zůstane pořadí podle ceny, ať vidí, kam to vede.
  assert.deepEqual(seradOdmeny(nabidka, 0).map((o) => o.nazev), ['lízátko', 'plectrum', 'struny']);
});

test('vyřazené odměny se dítěti nenabízejí', () => {
  const nabidka = [odmena('lízátko', 50), odmena('došlo', 10, false)];
  assert.deepEqual(seradOdmeny(nabidka, 100).map((o) => o.nazev), ['lízátko']);
});

test('klíče zdrojů mají tvar, který jde rozeznat', () => {
  assert.equal(zdrojUkolu('abc'), 'ukol:abc');
  assert.equal(zdrojStupne(3), 'stupen:3');
  assert.notEqual(zdrojUkolu('1'), zdrojStupne(1));
});
