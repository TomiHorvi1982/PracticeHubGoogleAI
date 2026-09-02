import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fft, hannovoOkno, magnitudy, snimkySpektra, snimekVterin, VYCHOZI_SNIMKY } from './spektrum';

/** Sinusovka o zadané frekvenci. */
function sinus(hz: number, vzorku: number, vzorkovaci = 44100): Float32Array {
  const s = new Float32Array(vzorku);
  for (let i = 0; i < vzorku; i += 1) s[i] = Math.sin((2 * Math.PI * hz * i) / vzorkovaci);
  return s;
}

test('stejnosměrný signál dá energii jen v nultém košíku', () => {
  const re = new Float32Array(8).fill(1);
  const im = new Float32Array(8);
  fft(re, im);
  assert.equal(Math.round(re[0]), 8);
  for (let i = 1; i < 8; i += 1) assert.ok(Math.abs(re[i]) < 1e-6, `košík ${i} měl být prázdný`);
});

test('sinusovka má vrchol na své frekvenci', () => {
  // 441 Hz při 44 100 a okně 1024 padne přesně na desátý košík.
  const okno = 1024;
  const m = magnitudy(sinus(441 * (44100 / okno) / 43.066, okno), hannovoOkno(okno));
  const vrchol = m.indexOf(Math.max(...m));
  assert.ok(vrchol > 0 && vrchol < okno / 2, `vrchol na ${vrchol}`);
});

test('vrchol odpovídá zadané frekvenci', () => {
  const okno = 4096;
  const vzorkovaci = 44100;
  const hz = 440;
  const m = magnitudy(sinus(hz, okno, vzorkovaci), hannovoOkno(okno));
  const vrchol = m.indexOf(Math.max(...m));
  const naKosik = vzorkovaci / okno;
  assert.ok(Math.abs(vrchol * naKosik - hz) < naKosik * 1.5,
    `vrchol na ${Math.round(vrchol * naKosik)} Hz místo ${hz}`);
});

test('okno má na krajích nulu a uprostřed jedničku', () => {
  const o = hannovoOkno(64);
  assert.ok(o[0] < 1e-6);
  assert.ok(o[63] < 1e-6);
  assert.ok(Math.abs(o[32] - 1) < 0.01);
});

test('krátký signál nedá žádný snímek', () => {
  assert.deepEqual(snimkySpektra(new Float32Array(100)), []);
});

test('počet snímků odpovídá délce a kroku', () => {
  // Vteřina zvuku, okno 4096, krok 2048 — asi dvacet snímků.
  const s = snimkySpektra(sinus(440, 44100));
  assert.ok(s.length >= 19 && s.length <= 22, `snímků ${s.length}`);
  assert.equal(s[0].length, VYCHOZI_SNIMKY.okno / 2);
});

test('délka snímku ve vteřinách sedí na krok', () => {
  assert.ok(Math.abs(snimekVterin(44100) - 2048 / 44100) < 1e-9);
});
