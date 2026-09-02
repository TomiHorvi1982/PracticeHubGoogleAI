import test from 'node:test';
import assert from 'node:assert/strict';
import { jeModel, nazevModelu, udajeModelu } from './mistniAparaty.js';

test('model se pozná podle přípony', () => {
  assert.equal(jeModel('Peavey.nam'), true);
  assert.equal(jeModel('Peavey.NAM'), true);
  assert.equal(jeModel('Peavey.wav'), false);
  assert.equal(jeModel('namecheap.txt'), false);
});

test('podtržítka se v názvu vracejí na mezery', () => {
  assert.equal(
    nazevModelu('Full_Rig_Peavey_5150_MXR_Mesa_OS_SM57.nam'),
    'Full Rig Peavey 5150 MXR Mesa OS SM57',
  );
});

test('přípona se ustřihne bez ohledu na velikost písmen', () => {
  assert.equal(nazevModelu('Amp.NAM'), 'Amp');
});

test('údaje se čtou z hlavičky modelu', () => {
  const j = JSON.stringify({
    version: '0.5.4',
    architecture: 'WaveNet',
    sample_rate: 48000,
    metadata: { modeled_by: '2dor', loudness: -32.8 },
  });
  assert.deepEqual(udajeModelu(j), {
    architektura: 'WaveNet',
    vzorkovaciFrekvence: 48000,
    autor: '2dor',
  });
});

test('poškozený JSON nespadne, jen nemá údaje', () => {
  assert.deepEqual(udajeModelu('{tohle není json'), {});
  assert.deepEqual(udajeModelu(''), {});
});

test('cizí JSON bez očekávaných polí dá prázdné údaje', () => {
  assert.deepEqual(udajeModelu('{"neco":1}'), {
    architektura: undefined,
    vzorkovaciFrekvence: undefined,
    autor: undefined,
  });
});

test('nulová vzorkovací frekvence se nebere jako údaj', () => {
  // `Number(0) || undefined` musí dát undefined, ne 0 — jinak by se
  // v popisku ukázalo „0 Hz“.
  assert.equal(udajeModelu('{"sample_rate":0}').vzorkovaciFrekvence, undefined);
});
