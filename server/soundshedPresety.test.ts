import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jePresetovySoubor,
  retezecSceny,
  prectiPreset,
  sloucPresety,
  dekodujJuce,
  aktivniPresetId,
} from './soundshedPresety';

test('pomocné soubory Soundshedu se za presety nepovažují', () => {
  assert.equal(jePresetovySoubor('0afd978e.json'), true);
  assert.equal(jePresetovySoubor('preset-folders.json'), false);
  assert.equal(jePresetovySoubor('factory-archive-state.json'), false);
  assert.equal(jePresetovySoubor('poznamka.txt'), false);
});

test('řetězec jde podle hran, ne podle pořadí v souboru', () => {
  // Uzly schválně naházené: kdyby se vypisovaly tak, jak leží,
  // vyšel by reverb před aparátem.
  const graf = {
    nodes: [
      { id: '__output__', type: 'output', category: 'utility', label: 'Output' },
      { id: 'rev', category: 'reverb', label: 'Room Reverb' },
      { id: '__input__', type: 'input', category: 'utility', label: 'Input' },
      { id: 'amp', category: 'amp', label: 'Neural Amp (NAM)', resources: [{ resourceId: 'tone3000:545783' }] },
    ],
    edges: [
      { from: 'rev', to: '__output__' },
      { from: '__input__', to: 'amp' },
      { from: 'amp', to: 'rev' },
    ],
  };
  const r = retezecSceny(graf);
  assert.deepEqual(r.map((c) => c.nazev), ['Neural Amp (NAM)', 'Room Reverb']);
  assert.deepEqual(r[0].zdroje, ['tone3000:545783']);
});

test('zdroj bez id se do seznamu nedostane jako text "undefined"', () => {
  const graf = {
    nodes: [
      { id: '__input__', type: 'input', category: 'utility' },
      { id: 'cab', category: 'cab', label: 'IR Cabinet', resources: [{ resourceId: 'tone3000:52730' }, { neco: 'jineho' }] },
    ],
    edges: [{ from: '__input__', to: 'cab' }],
  };
  assert.deepEqual(retezecSceny(graf)[0].zdroje, ['tone3000:52730']);
});

test('zacyklený graf chůzi neutopí', () => {
  const graf = {
    nodes: [
      { id: '__input__', type: 'input', category: 'utility' },
      { id: 'a', category: 'delay', label: 'A' },
      { id: 'b', category: 'delay', label: 'B' },
    ],
    edges: [
      { from: '__input__', to: 'a' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
  };
  assert.deepEqual(retezecSceny(graf).map((c) => c.nazev), ['A', 'B']);
});

test('prázdný graf dá prázdný řetězec, ne pád', () => {
  assert.deepEqual(retezecSceny(undefined), []);
  assert.deepEqual(retezecSceny({ nodes: [], edges: [] }), []);
});

test('preset se přečte i bez kategorie a značek', () => {
  const p = prectiPreset(JSON.stringify({ id: 'x1', name: 'Test', scenes: [] }));
  assert.equal(p?.kategorie, 'Bez kategorie');
  assert.deepEqual(p?.znacky, []);
});

test('cizí nebo poškozený soubor není chyba, jen není preset', () => {
  assert.equal(prectiPreset('{tohle není json'), null);
  assert.equal(prectiPreset(JSON.stringify({ neco: 'jineho' })), null);
  assert.equal(prectiPreset(JSON.stringify({ id: 'x' })), null);
});

test('tentýž preset uložený dvakrát se v seznamu objeví jednou', () => {
  // Soundshed ukládá stejný preset z archivu i s odkazy na tone3000.
  // Liší se jen id a zdroje — pro hráče je to jeden zvuk.
  const zArchivu = {
    id: 'a', nazev: 'Corrosion', kategorie: 'Factory', znacky: [],
    sceny: [{ id: 's1', nazev: 'Scene 1', retezec: [{ kategorie: 'amp', nazev: 'Neural FX (NAM)', zdroje: ['pack__56d562b1'] }] }],
  };
  const zTone3000 = {
    ...zArchivu, id: 'b',
    sceny: [{ id: 's1', nazev: 'Scene 1', retezec: [{ kategorie: 'amp', nazev: 'Neural FX (NAM)', zdroje: ['tone3000:1'] }] }],
  };
  assert.equal(sloucPresety([zArchivu, zTone3000]).length, 1);
});

test('stejné jméno s jiným řetězcem jsou dva různé presety', () => {
  // Tohle je ta past: sloučit podle jména by o jeden preset připravilo.
  const a = {
    id: 'a', nazev: 'Corrosion', kategorie: 'Factory', znacky: [],
    sceny: [{ id: 's', nazev: 'S', retezec: [{ kategorie: 'amp', nazev: 'Neural FX (NAM)', zdroje: [] }] }],
  };
  const b = {
    ...a, id: 'b',
    sceny: [{ id: 's', nazev: 'S', retezec: [{ kategorie: 'amp', nazev: 'Neural FX (NAM)', zdroje: [] }, { kategorie: 'cab', nazev: 'IR Cabinet', zdroje: [] }] }],
  };
  assert.equal(sloucPresety([a, b]).length, 2);
});

test('z duplicit vyhrává ta s víc scénami', () => {
  const osekana = { id: 'a', nazev: 'A', kategorie: 'K', znacky: [], sceny: [] };
  const uplna = { id: 'a', nazev: 'A', kategorie: 'K', znacky: [], sceny: [{ id: 's', nazev: 'S', retezec: [] }] };
  assert.equal(sloucPresety([osekana, uplna]).length, 1);
  assert.equal(sloucPresety([osekana, uplna])[0].sceny.length, 1);
  assert.equal(sloucPresety([uplna, osekana])[0].sceny.length, 1);
});

test('seznam je řazený česky podle kategorie a jména', () => {
  const p = (id: string, kategorie: string, nazev: string) => ({ id, nazev, kategorie, znacky: [], sceny: [] });
  const r = sloucPresety([p('1', 'Metal', 'Židle'), p('2', 'Metal', 'Auto'), p('3', 'Factory', 'Cokoliv')]);
  assert.deepEqual(r.map((x) => x.nazev), ['Cokoliv', 'Auto', 'Židle']);
});

test('JUCE kódování se rozbalí zpátky na původní data', () => {
  // Zakóduje se stejným postupem, jakým to dělá JUCE, a musí to projít tam i zpět.
  const ABECEDA = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const puvodni = Buffer.from('{"presetId":"abc-123"}', 'utf8');
  let text = `${puvodni.length}.`;
  const znaku = Math.ceil((puvodni.length * 8) / 6);
  for (let i = 0; i < znaku; i++) {
    const bit = i * 6;
    const idx = bit >> 3;
    const off = bit & 7;
    let c = puvodni[idx] >> off;
    if (off > 2 && idx + 1 < puvodni.length) c |= puvodni[idx + 1] << (8 - off);
    text += ABECEDA[c & 0x3f];
  }
  assert.equal(dekodujJuce(text)?.toString('utf8'), puvodni.toString('utf8'));
  assert.equal(aktivniPresetId(`<VALUE name="filterState" val="${text}"/>`), 'abc-123');
});

test('nesmyslná hodnota nerozbije čtení aktivního presetu', () => {
  assert.equal(dekodujJuce('bez tecky'), null);
  assert.equal(dekodujJuce('0.'), null);
  assert.equal(aktivniPresetId('<PROPERTIES></PROPERTIES>'), undefined);
  assert.equal(aktivniPresetId('<VALUE name="filterState" val="5.XXXX"/>'), undefined);
});
