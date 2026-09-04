import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platnyNamModel, znamaArchitektura } from './namModel';

const dobry = JSON.stringify({
  version: '0.5.4', architecture: 'WaveNet', sample_rate: 48000,
  metadata: { modeled_by: 'jp' }, weights: [0.1, -0.2, 0.3],
});

test('platný model projde a vrátí údaje', () => {
  const r = platnyNamModel(dobry);
  assert.equal(r.platny, true);
  assert.equal(r.udaje?.architektura, 'WaveNet');
  assert.equal(r.udaje?.vzorkovaci, 48000);
  assert.equal(r.udaje?.vah, 3);
  assert.equal(r.udaje?.autor, 'jp');
});

test('co není JSON, není model', () => {
  assert.equal(platnyNamModel('tohle není json').platny, false);
  assert.equal(platnyNamModel('').platny, false);
});

test('pole ani číslo nejsou model', () => {
  assert.equal(platnyNamModel('[1,2,3]').platny, false);
  assert.equal(platnyNamModel('42').platny, false);
  assert.equal(platnyNamModel('null').platny, false);
});

test('bez architektury a verze se model nenačte', () => {
  assert.match(platnyNamModel(JSON.stringify({ version: '0.5.4', weights: [1] })).duvod!, /architecture/);
  assert.match(platnyNamModel(JSON.stringify({ architecture: 'WaveNet', weights: [1] })).duvod!, /version/);
});

test('model bez vah je k ničemu', () => {
  const bez = JSON.stringify({ version: '0.5.4', architecture: 'WaveNet' });
  assert.match(platnyNamModel(bez).duvod!, /váhy/i);
  const prazdne = JSON.stringify({ version: '0.5.4', architecture: 'WaveNet', weights: [] });
  assert.equal(platnyNamModel(prazdne).platny, false);
});

test('váhy musí být čísla', () => {
  // Text nebo NaN mezi vahami by v zvukovém vlákně skončil tichem.
  const spatne = JSON.stringify({ version: '0.5.4', architecture: 'WaveNet', weights: [0.1, 'x'] });
  assert.match(platnyNamModel(spatne).duvod!, /čísla/);
});

test('neznámá architektura se nezamítá', () => {
  // NAM jich přidává; odmítnout model jen proto, že o ní nevíme, by
  // bylo horší než ho zkusit načíst.
  const novy = JSON.stringify({ version: '0.6.0', architecture: 'NecoNoveho', weights: [1, 2] });
  assert.equal(platnyNamModel(novy).platny, true);
  assert.equal(znamaArchitektura('NecoNoveho'), false);
  assert.equal(znamaArchitektura('WaveNet'), true);
});
