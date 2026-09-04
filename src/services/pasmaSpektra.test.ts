import test from 'node:test';
import assert from 'node:assert/strict';

import { DO_HZ, OD_HZ, novaSpicka, pasma, popisHz, vyskaPasma } from './pasmaSpektra';

// Typický analyzér: fftSize 2048 → 1024 košů, 48 kHz.
const KOSU = 1024;
const VZORKOVACI = 48000;

test('pásma pokryjí slyšitelný rozsah a nepřekrývají se', () => {
  const p = pasma(48, KOSU, VZORKOVACI);
  assert.ok(p.length > 0);
  for (let i = 1; i < p.length; i++) {
    assert.ok(p[i].od > p[i - 1].do, `pásmo ${i} začíná dřív, než skončilo ${i - 1}`);
  }
  // Nic nesmí ukázat mimo pole košů.
  assert.ok(p.every((x) => x.od >= 0 && x.do < KOSU && x.od <= x.do));
});

test('pásma jsou logaritmická, ne rovnoměrná', () => {
  const p = pasma(24, KOSU, VZORKOVACI);
  const prvni = p[0].do - p[0].od;
  const posledni = p[p.length - 1].do - p[p.length - 1].od;
  // Nahoře připadá na pásmo mnohem víc košů než dole — o to jde.
  assert.ok(posledni > prvni * 5, `dole ${prvni}, nahoře ${posledni}`);
});

test('střední frekvence rostou a drží se v rozsahu', () => {
  const p = pasma(32, KOSU, VZORKOVACI);
  for (let i = 1; i < p.length; i++) assert.ok(p[i].stred > p[i - 1].stred);
  assert.ok(p[p.length - 1].stred <= DO_HZ);
});

test('popisek sedí na koše, které pásmo opravdu kreslí', () => {
  // Dole se pásma posouvají, aby se nepřekrývala. Popisek musí jít za
  // nimi, jinak by ukazoval jinam, než co je pod ním vidět.
  const naKos = (VZORKOVACI / 2) / KOSU;
  for (const b of pasma(56, KOSU, VZORKOVACI)) {
    const odHz = b.od * naKos;
    const doHz = (b.do + 1) * naKos;
    assert.ok(b.stred >= odHz && b.stred <= doHz,
      `střed ${Math.round(b.stred)} Hz mimo ${Math.round(odHz)}–${Math.round(doHz)} Hz`);
  }
});

test('pilový tón se trefí do pásma, kde ho čekáme', () => {
  // 220 Hz při 48 kHz a 1024 koších padne na koš 9.
  const p = pasma(56, KOSU, VZORKOVACI);
  const kos = Math.round(220 / ((VZORKOVACI / 2) / KOSU));
  const i = p.findIndex((b) => kos >= b.od && kos <= b.do);
  assert.ok(i >= 0, 'koš se základním tónem nepatří žádnému pásmu');
  assert.ok(Math.abs(p[i].stred - 220) < 40, `popisek hlásí ${Math.round(p[i].stred)} Hz`);
});

test('nesmyslné vstupy vrátí prázdno místo pádu', () => {
  assert.deepEqual(pasma(0, KOSU, VZORKOVACI), []);
  assert.deepEqual(pasma(48, 1, VZORKOVACI), []);
  assert.deepEqual(pasma(48, KOSU, 0), []);
});

test('víc pásem než košů se nezacyklí ani nepřeteče', () => {
  const p = pasma(500, 64, VZORKOVACI);
  assert.ok(p.length <= 64);
  assert.ok(p.every((x) => x.do < 64));
});

test('výška pásma bere špičku, ne průměr', () => {
  const data = new Uint8Array([0, 0, 255, 0, 0]);
  assert.equal(vyskaPasma(data, { od: 0, do: 4, stred: 100 }), 1);
  assert.equal(vyskaPasma(data, { od: 0, do: 1, stred: 100 }), 0);
  // Přesah za konec pole nesmí spadnout.
  assert.equal(vyskaPasma(data, { od: 3, do: 99, stred: 100 }), 0);
});

test('špička vyskočí hned a klesá pomalu', () => {
  assert.equal(novaSpicka(0.2, 0.9), 0.9, 'nahoru okamžitě');
  assert.equal(Number(novaSpicka(0.9, 0.1).toFixed(4)), 0.888, 'dolů po kouscích');
  // Nikdy neklesne pod aktuální hodnotu.
  assert.equal(novaSpicka(0.5, 0.495, 0.5), 0.495);
});

test('popisky frekvence se čtou', () => {
  assert.equal(popisHz(80), '80');
  assert.equal(popisHz(1000), '1k');
  assert.equal(popisHz(1500), '1.5k');
  assert.equal(popisHz(12000), '12k');
});
