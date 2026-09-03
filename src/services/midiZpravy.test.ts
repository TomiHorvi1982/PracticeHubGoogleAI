import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kanalNaNibble, zpravaCC, zpravaNoteOn, zpravaNoteOff, stisk, popisZpravy } from './midiZpravy';

test('kanály se venku počítají od jedné, v bajtech od nuly', () => {
  assert.equal(kanalNaNibble(1), 0);
  assert.equal(kanalNaNibble(16), 15);
});

test('kanál mimo rozsah spadne na první, ne na nesmyslný bajt', () => {
  assert.equal(kanalNaNibble(0), 0);
  assert.equal(kanalNaNibble(-5), 0);
  assert.equal(kanalNaNibble(99), 15);
  assert.equal(kanalNaNibble(NaN), 0);
});

test('Control Change má správný stavový bajt', () => {
  assert.deepEqual(zpravaCC(1, 20, 127), [0xb0, 20, 127]);
  assert.deepEqual(zpravaCC(16, 20, 0), [0xbf, 20, 0]);
});

test('hodnoty se ořezávají do rozsahu MIDI', () => {
  assert.deepEqual(zpravaCC(1, 999, 999), [0xb0, 127, 127]);
  assert.deepEqual(zpravaCC(1, -3, -3), [0xb0, 0, 0]);
});

test('Note On nikdy nemá velocity 0 — to je zamaskovaný Note Off', () => {
  assert.deepEqual(zpravaNoteOn(1, 60, 0), [0x90, 60, 1]);
  assert.deepEqual(zpravaNoteOff(1, 60), [0x80, 60, 0]);
});

test('stisknutí pošle sešlápnutí i puštění', () => {
  // Bez puštění zůstane CC viset na 127 a druhý stisk už není změna.
  assert.deepEqual(stisk('cc', 1, 20), [[0xb0, 20, 127], [0xb0, 20, 0]]);
  assert.deepEqual(stisk('note', 1, 36), [[0x90, 36, 127], [0x80, 36, 0]]);
});

test('popisek říká, co se má v Soundshedu naučit', () => {
  assert.equal(popisZpravy('cc', 1, 20), 'CC 20, kanál 1');
  assert.equal(popisZpravy('note', 10, 36), 'nota 36, kanál 10');
});
