import test from 'node:test';
import assert from 'node:assert/strict';
import { skutecneId, ALIASY_NASTROJU } from './aliasyNastroju.js';
import { ALL_INSTRUMENTS } from '../data/instrumentPresets.js';

test('stará kytarová označení míří na skutečné nástroje', () => {
  assert.equal(skutecneId('acoustic_guitar'), 'acoustic_dreadnought');
  assert.equal(skutecneId('electric_guitar'), 'electric_strat_clean');
});

test('každý cíl překladu v katalogu opravdu existuje', () => {
  // Tohle je jádro věci: kdyby cíl neexistoval, vyhledání by zase
  // spadlo na klavír a chyba by se vrátila v tichosti.
  const znama = new Set(ALL_INSTRUMENTS.map((i) => i.id));
  for (const [stare, nove] of Object.entries(ALIASY_NASTROJU)) {
    assert.ok(znama.has(nove), `cíl „${nove}" pro „${stare}" v katalogu není`);
  }
});

test('žádný alias nepřekrývá platné id', () => {
  // Kdyby staré označení bylo zároveň platné, překlad by ho přebil
  // a hrálo by se něco jiného, než co si volající vyžádal.
  const znama = new Set(ALL_INSTRUMENTS.map((i) => i.id));
  for (const stare of Object.keys(ALIASY_NASTROJU)) {
    assert.ok(!znama.has(stare), `„${stare}" je platné id, alias by ho přebil`);
  }
});

test('neznámé i platné id projde beze změny', () => {
  assert.equal(skutecneId('acoustic_dreadnought'), 'acoustic_dreadnought');
  assert.equal(skutecneId('neco_uplne_jineho'), 'neco_uplne_jineho');
});

test('cíle překladu jsou opravdu kytary, ne cokoliv', () => {
  const podle = new Map(ALL_INSTRUMENTS.map((i) => [i.id, i]));
  for (const nove of Object.values(ALIASY_NASTROJU)) {
    const n = podle.get(nove)!;
    assert.match(
      `${n.id} ${n.category || ''}`.toLowerCase(),
      /guitar|dreadnought|strat|lespaul|tele|bass/,
      `„${nove}" nevypadá jako kytara`,
    );
  }
});
