import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PresetKytary, VYCHOZI_EQ, navrhniNazevPresetu, novePresetId, prazdnyPreset,
  presetProProgram, srovnejPreset, srovnejPresety, typPasma, volnyProgram,
} from './presetyKytary';

test('prázdný preset je neutrální — nic neubírá ani nepřidává', () => {
  const p = prazdnyPreset();
  assert.equal(p.vstupDb, 0);
  assert.equal(p.vystupDb, 0);
  assert.ok(p.eq.every((b) => b.db === 0), 'ekvalizér má být na nule');
  assert.equal(p.delay.zapnuto, false);
  assert.equal(p.reverb.zapnuto, false);
  // Nová kytara má EQ vypnutý, ne zapnutý s nulami.
  assert.equal(p.bypassEq, true);
});

test('krajní pásma jsou police, prostřední zvony', () => {
  assert.equal(typPasma(0), 'lowshelf');
  assert.equal(typPasma(1), 'peaking');
  assert.equal(typPasma(2), 'peaking');
  assert.equal(typPasma(4), 'highshelf');
});

test('hodnoty mimo rozsah se srovnají, ne aby rozhodily kanál', () => {
  const p = srovnejPreset({
    nazev: 'Divné', vstupDb: 999, vystupDb: -999,
    eq: [{ hz: 0, db: 500, q: -3 }],
    delay: { zapnuto: true, cas: 99, zpetna: 5, mix: 9 },
    reverb: { zapnuto: true, delka: 0, mix: -1 },
  })!;
  assert.equal(p.vstupDb, 24);
  assert.equal(p.vystupDb, -24);
  assert.equal(p.eq[0].hz, 20);
  assert.equal(p.eq[0].db, 24);
  assert.equal(p.eq[0].q, 0.1);
  assert.equal(p.delay.cas, 2);
  assert.equal(p.delay.zpetna, 0.9, 'zpětná vazba nad 0,9 se rozjede do nekonečna');
  assert.equal(p.delay.mix, 1);
  assert.equal(p.reverb.delka, 0.1);
  assert.equal(p.reverb.mix, 0);
});

test('chybějící pásma se doplní výchozími', () => {
  const p = srovnejPreset({ nazev: 'Půlka', eq: [{ hz: 100, db: 3, q: 1 }] })!;
  assert.equal(p.eq.length, VYCHOZI_EQ.length);
  assert.equal(p.eq[0].db, 3);
  assert.equal(p.eq[4].hz, VYCHOZI_EQ[4].hz);
  assert.equal(p.eq[4].db, 0);
});

test('preset bez jména dostane náhradní, dlouhé se ořízne', () => {
  assert.equal(srovnejPreset({})!.nazev, 'Preset');
  assert.equal(srovnejPreset({ nazev: '   ' })!.nazev, 'Preset');
  assert.equal(srovnejPreset({ nazev: 'x'.repeat(90) })!.nazev.length, 40);
});

test('z nesmyslu nevznikne preset', () => {
  assert.equal(srovnejPreset(null), null);
  assert.equal(srovnejPreset('preset'), null);
  assert.deepEqual(srovnejPresety(undefined), []);
  assert.deepEqual(srovnejPresety({ a: 1 }), []);
});

test('dvě stejná id se rozejdou', () => {
  const v = srovnejPresety([
    { id: 'stejne', nazev: 'A' },
    { id: 'stejne', nazev: 'B' },
  ]);
  assert.equal(v.length, 2);
  assert.notEqual(v[0].id, v[1].id);
});

test('dva presety na stejném programu MIDI: druhý o číslo přijde', () => {
  // Jinak by nožní přepínač vyvolal nepředvídatelný z nich.
  const v = srovnejPresety([
    { nazev: 'Rytmika', midiProgram: 3 },
    { nazev: 'Sólo', midiProgram: 3 },
  ]);
  assert.equal(v[0].midiProgram, 3);
  assert.equal(v[1].midiProgram, undefined);
});

test('program mimo rozsah MIDI se srovná a zaokrouhlí', () => {
  assert.equal(srovnejPreset({ midiProgram: 500 })!.midiProgram, 127);
  assert.equal(srovnejPreset({ midiProgram: -5 })!.midiProgram, 0);
  assert.equal(srovnejPreset({ midiProgram: 7.6 })!.midiProgram, 8);
  assert.equal(srovnejPreset({})!.midiProgram, undefined);
});

test('preset se najde podle čísla programu', () => {
  const p = srovnejPresety([
    { nazev: 'Rytmika', midiProgram: 0 },
    { nazev: 'Sólo', midiProgram: 5 },
  ]);
  assert.equal(presetProProgram(p, 5)!.nazev, 'Sólo');
  assert.equal(presetProProgram(p, 9), null);
});

test('nabídne se první volné číslo programu', () => {
  const p: PresetKytary[] = [
    { ...prazdnyPreset('A'), midiProgram: 0 },
    { ...prazdnyPreset('B'), midiProgram: 1 },
    { ...prazdnyPreset('C'), midiProgram: 3 },
  ];
  assert.equal(volnyProgram(p), 2);
  assert.equal(volnyProgram([]), 0);
});

test('názvy se nabízejí z obvyklých a neopakují se', () => {
  assert.equal(navrhniNazevPresetu([]), 'Rytmika');
  assert.equal(navrhniNazevPresetu([prazdnyPreset('Rytmika')]), 'Sólo');
  // Velikost písmen nesmí rozhodovat.
  assert.equal(navrhniNazevPresetu([prazdnyPreset('rytmika')]), 'Sólo');
});

test('seznam se zastropuje, ať databáze neroste donekonečna', () => {
  const moc = Array.from({ length: 80 }, (_, i) => ({ id: novePresetId(), nazev: `P${i}` }));
  assert.equal(srovnejPresety(moc).length, 32);
});

test('model a bedna se pamatují jménem, ne obsahem', () => {
  const p = srovnejPreset({ nazev: 'S aparátem', model: 'Marshall JCM800', bedna: 'V30' })!;
  assert.equal(p.model, 'Marshall JCM800');
  assert.equal(p.bedna, 'V30');
  // Nesmyslné typy se zahodí, ne aby se do kanálu dostal objekt.
  assert.equal(srovnejPreset({ model: { a: 1 } })!.model, undefined);
});
