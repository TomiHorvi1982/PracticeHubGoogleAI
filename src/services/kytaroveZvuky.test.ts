import test from 'node:test';
import assert from 'node:assert/strict';

import { ALL_INSTRUMENTS } from '../data/instrumentPresets.js';
import { VYCHOZI_KYTARA, jeKytara, kytaroveZvuky } from './kytaroveZvuky';

test('nabídka není prázdná a každá kytara má jméno', () => {
  const z = kytaroveZvuky();
  assert.ok(z.length >= 10, `v bance je jen ${z.length} kytar`);
  for (const k of z) {
    assert.ok(k.nazev.trim().length > 0, `${k.id} nemá jméno`);
  }
});

test('všechna nabízená id v katalogu opravdu jsou', () => {
  // Tohle je ta chyba, kvůli které roky hrál klavír: v kódu stálo
  // `acoustic_guitar_steel`, což je jméno soundfontu, ne id nástroje.
  const znama = new Set(ALL_INSTRUMENTS.map((i: any) => String(i.id)));
  for (const k of kytaroveZvuky()) {
    assert.ok(znama.has(k.id), `${k.id} v katalogu není — hrál by klavír`);
  }
});

test('každá nabízená kytara má soundfont, ze kterého se dá hrát', () => {
  const podleId = new Map(ALL_INSTRUMENTS.map((i: any) => [String(i.id), i]));
  for (const k of kytaroveZvuky()) {
    assert.ok(podleId.get(k.id)?.soundfont, `${k.id} nemá soundfont`);
  }
});

test('výchozí kytara je skutečná kytara', () => {
  assert.ok(jeKytara(VYCHOZI_KYTARA));
  assert.equal(kytaroveZvuky()[0].id, VYCHOZI_KYTARA, 'výchozí má být první v nabídce');
});

test('čisté zvuky jsou napřed, zkreslené a exotické až za nimi', () => {
  const poradi = kytaroveZvuky().map((z) => z.id);
  const strat = poradi.indexOf('electric_strat_clean');
  const banjo = poradi.indexOf('banjo_5_string');
  assert.ok(strat >= 0 && strat < 5, 'čistý Stratocaster patří dopředu');
  if (banjo >= 0) assert.ok(banjo > strat, 'banjo má hmatník jinak, patří dozadu');
});

test('neznámé id se za kytaru nevydává', () => {
  assert.equal(jeKytara('acoustic_guitar_steel'), false, 'to je jméno soundfontu, ne nástroje');
  assert.equal(jeKytara('grand_piano_steinway'), false);
  assert.equal(jeKytara(''), false);
});
