import test from 'node:test';
import assert from 'node:assert/strict';

import { doWav, jmenoNahravky, spicka, spojKusy } from './wav';

const text = (b: Uint8Array, od: number, delka: number) =>
  String.fromCharCode(...b.subarray(od, od + delka));

const cti32 = (b: Uint8Array, od: number) =>
  new DataView(b.buffer, b.byteOffset).getUint32(od, true);
const cti16 = (b: Uint8Array, od: number) =>
  new DataView(b.buffer, b.byteOffset).getUint16(od, true);
const ctiI16 = (b: Uint8Array, od: number) =>
  new DataView(b.buffer, b.byteOffset).getInt16(od, true);

test('kusy se slepí ve správném pořadí a nic se neztratí', () => {
  const spojene = spojKusy([
    new Float32Array([1, 2]),
    new Float32Array([3]),
    new Float32Array([4, 5, 6]),
  ]);
  assert.deepEqual([...spojene], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...spojKusy([])], []);
});

test('hlavička WAV má, co má mít', () => {
  const b = doWav([new Float32Array([0, 0.5, -0.5, 1])], 48000);
  assert.equal(text(b, 0, 4), 'RIFF');
  assert.equal(text(b, 8, 4), 'WAVE');
  assert.equal(text(b, 12, 4), 'fmt ');
  assert.equal(text(b, 36, 4), 'data');
  assert.equal(cti16(b, 20), 1, 'má to být nekomprimované PCM');
  assert.equal(cti16(b, 22), 1, 'jeden kanál');
  assert.equal(cti32(b, 24), 48000);
  assert.equal(cti16(b, 34), 16, 'šestnáct bitů na vzorek');
  // Velikosti musí sedět, jinak přehrávač usekne konec nebo přečte smetí.
  assert.equal(cti32(b, 40), 4 * 2, 'délka dat');
  assert.equal(cti32(b, 4), 36 + 4 * 2, 'délka RIFF');
  assert.equal(b.length, 44 + 4 * 2);
});

test('vzorky se převedou na šestnáct bitů se správným znaménkem', () => {
  const b = doWav([new Float32Array([0, 1, -1, 0.5])], 44100);
  assert.equal(ctiI16(b, 44), 0);
  assert.equal(ctiI16(b, 46), 32767, 'plná kladná výchylka');
  assert.equal(ctiI16(b, 48), -32768, 'plná záporná výchylka');
  assert.equal(ctiI16(b, 50), Math.round(0.5 * 32767));
});

test('signál mimo rozsah se ořízne, ne přeteče', () => {
  // Bez oříznutí by z +2 vyšlo záporné číslo a v nahrávce by to prasklo.
  const b = doWav([new Float32Array([2, -2, 1.0001])], 44100);
  assert.equal(ctiI16(b, 44), 32767);
  assert.equal(ctiI16(b, 46), -32768);
  assert.equal(ctiI16(b, 48), 32767);
});

test('stereo se prokládá po vzorcích', () => {
  const b = doWav([new Float32Array([1, 0]), new Float32Array([0, -1])], 44100);
  assert.equal(cti16(b, 22), 2, 'dva kanály');
  assert.equal(cti16(b, 32), 4, 'zarovnání bloku = kanály × 2 bajty');
  assert.equal(cti32(b, 28), 44100 * 4, 'bajtů za vteřinu');
  // L, P, L, P — ne nejdřív celý levý kanál.
  assert.equal(ctiI16(b, 44), 32767);
  assert.equal(ctiI16(b, 46), 0);
  assert.equal(ctiI16(b, 48), 0);
  assert.equal(ctiI16(b, 50), -32768);
});

test('nestejně dlouhé kanály se useknou na kratší', () => {
  // Delší kanál by jinak četl za koncem toho kratšího.
  const b = doWav([new Float32Array([1, 1, 1]), new Float32Array([0])], 44100);
  assert.equal(cti32(b, 40), 1 * 2 * 2, 'jeden vzorek ve dvou kanálech');
});

test('WAV bez kanálů je chyba, ne prázdný soubor', () => {
  assert.throws(() => doWav([], 44100));
});

test('prázdný kanál dá platnou hlavičku bez dat', () => {
  const b = doWav([new Float32Array(0)], 44100);
  assert.equal(b.length, 44);
  assert.equal(cti32(b, 40), 0);
});

test('špička pozná ticho od signálu', () => {
  assert.equal(spicka(new Float32Array([0, 0, 0])), 0);
  // Float32 neudrží 0,7 přesně — porovnává se s tolerancí.
  assert.ok(Math.abs(spicka(new Float32Array([0.2, -0.7, 0.3])) - 0.7) < 1e-6);
  assert.equal(spicka(new Float32Array(0)), 0);
});

test('dvě nahrávky za sebou se nepřepíšou', () => {
  const a = jmenoNahravky('di', new Date(2026, 8, 9, 14, 3, 7));
  assert.equal(a, 'di-2026-09-09-140307.wav');
  const b = jmenoNahravky('di', new Date(2026, 8, 9, 14, 3, 8));
  assert.notEqual(a, b);
  // Jednociferné hodnoty musí být doplněné nulou, jinak se jména neřadí.
  assert.match(jmenoNahravky('di', new Date(2026, 0, 5, 9, 8, 7)), /2026-01-05-090807/);
});
