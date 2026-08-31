import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizuj, jeVymysl, cisloZVety, podobnost, najdiPrikaz } from './shoda';

const PRIKAZY = [
  { id: 'a', nazev: 'Spustit', fraze: ['spusť přehrávání', 'hraj'] },
  { id: 'b', nazev: 'Tempo', fraze: ['nastav tempo'] },
  { id: 'c', nazev: 'Pódium', fraze: ['otevři pódium'] },
];

test('diakritika ani interpunkce nerozhodují', () => {
  assert.equal(normalizuj('Spusť přehrávání!'), 'spust prehravani');
  assert.equal(normalizuj('  TEMPO,  120.  '), 'tempo 120');
});

test('pozná vymyšlené věty, které whisper píše na ticho', () => {
  // Přesně tohle vrátil na dvě sekundy čistého tónu.
  assert.equal(jeVymysl('Titulky vytvořil JohnyX'), true);
  assert.equal(jeVymysl(''), true);
  assert.equal(jeVymysl('spusť přehrávání'), false);
});

test('číslo přečte číslicí i slovem', () => {
  assert.equal(cisloZVety('nastav tempo 120'), 120);
  assert.equal(cisloZVety('nastav tempo sto dvacet'), 120);
  assert.equal(cisloZVety('tempo dvěstě'), 200);
  assert.equal(cisloZVety('spusť přehrávání'), null);
});

test('kratší fráze nevyhrává jen tím, že je kratší', () => {
  // „tempo" je v obou, ale věta má tři slova — shoda nesmí být plná.
  assert.ok(podobnost('nastav tempo 120', 'tempo') < 0.6);
});

test('najde příkaz i s nadbytečným slovem', () => {
  const n = najdiPrikaz('spusť přehrávání teď', PRIKAZY);
  assert.equal(n?.prikaz.id, 'a');
});

test('u příkazu s číslem vrátí i to číslo', () => {
  const n = najdiPrikaz('nastav tempo sto padesát', PRIKAZY);
  assert.equal(n?.prikaz.id, 'b');
  assert.equal(n?.cislo, 150);
});

test('nesouvisející věta nespustí nic', () => {
  assert.equal(najdiPrikaz('kde mám kabel od kytary', PRIKAZY), null);
});

test('vymyšlená věta nespustí nic, i kdyby slovy sedla', () => {
  assert.equal(najdiPrikaz('Titulky vytvořil hraj', PRIKAZY), null);
});

test('vybere lepší z více sedících příkazů', () => {
  const n = najdiPrikaz('otevři pódium', PRIKAZY);
  assert.equal(n?.prikaz.id, 'c');
  assert.equal(n?.jistota, 1);
});
