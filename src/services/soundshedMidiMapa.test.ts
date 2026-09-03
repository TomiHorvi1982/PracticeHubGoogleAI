import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OVLADACE, cisloOvladace, popisOvladace, kolizeCisel, VYCHOZI_NASTAVENI } from './soundshedMidiMapa';

test('výchozí katalog nemá dva ovladače na stejném čísle', () => {
  assert.deepEqual(kolizeCisel(VYCHOZI_NASTAVENI), []);
});

test('všech osm padů setlistu odpovídá adresám Soundshedu', () => {
  const pady = OVLADACE.filter((o) => o.adresa.startsWith('default.setlistPreset'));
  assert.equal(pady.length, 8);
  assert.deepEqual(pady.map((p) => p.adresa), [
    'default.setlistPreset1', 'default.setlistPreset2', 'default.setlistPreset3',
    'default.setlistPreset4', 'default.setlistPreset5', 'default.setlistPreset6',
    'default.setlistPreset7', 'default.setlistPreset8',
  ]);
});

test('čísla se drží mimo obsazená CC pod 20', () => {
  // Pod dvacítkou sedí modulace, hlasitost, expression a spol.
  for (const o of OVLADACE) assert.ok(o.cislo >= 20, `${o.nazev} má ${o.cislo}`);
});

test('vlastní číslo přebije výchozí', () => {
  const n = { ...VYCHOZI_NASTAVENI, cisla: { preset1: 99 } };
  const p1 = OVLADACE.find((o) => o.id === 'preset1')!;
  assert.equal(cisloOvladace(p1, n), 99);
  assert.equal(popisOvladace(p1, n), 'CC 99, kanál 1');
});

test('kolize se ohlásí, ne přejde mlčky', () => {
  // Dvě věci naučené na jednu zprávu = jedna z nich tiše přestane fungovat.
  const n = { ...VYCHOZI_NASTAVENI, cisla: { preset2: 20 } };
  const k = kolizeCisel(n);
  assert.equal(k.length, 1);
  assert.match(k[0], /Preset 1 a Preset 2/);
});

test('nesmyslné vlastní číslo spadne zpátky na výchozí', () => {
  const p1 = OVLADACE.find((o) => o.id === 'preset1')!;
  assert.equal(cisloOvladace(p1, { ...VYCHOZI_NASTAVENI, cisla: { preset1: NaN } }), 20);
});
