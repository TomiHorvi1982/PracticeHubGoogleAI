import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizuj, jeVymysl, cisloZVety, podobnost, najdiPrikaz, sekceZVety, zbytekVety } from './shoda';

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

test('název sekce se z věty vyčte', () => {
  assert.equal(sekceZVety('otevři playlist'), 'playlist');
  assert.equal(sekceZVety('Otevři pódium.'), 'pódium');
  assert.equal(sekceZVety('spusť přehrávání'), null);
});

test('delší název sekce vyhrává nad kratším', () => {
  // „knihovna skladeb" nesmí prohrát se samotným slovem, které je v ní.
  assert.equal(sekceZVety('otevři knihovnu skladeb'), 'knihovna skladeb');
});

test('vestavěné otevírání sekce sedne i s vysloveným názvem', () => {
  // Tohle dřív nesedlo vůbec: „otevři" proti „otevři pódium" dalo 0,5.
  const n = najdiPrikaz('Otevři pódium.', [
    { id: 'v', nazev: 'Otevřít sekci', fraze: ['otevři'] },
  ]);
  assert.equal(n?.prikaz.id, 'v');
  assert.equal(n?.sekce, 'pódium');
});

test('vlastní celá fráze vyhraje nad vestavěnou', () => {
  const n = najdiPrikaz('otevři playlist', [
    { id: 'vlastni', nazev: 'playlist', fraze: ['otevři playlist'] },
    { id: 'vestaveny', nazev: 'Otevřít sekci', fraze: ['otevři'] },
  ]);
  assert.equal(n?.prikaz.id, 'vlastni');
  assert.equal(n?.jistota, 1);
});

test('z věty jde vytáhnout text za frází', () => {
  assert.equal(zbytekVety('otevři skladbu Ambush', 'otevři skladbu'), 'Ambush');
  assert.equal(zbytekVety('Otevři skladbu Roots Bloody Roots.', 'otevři skladbu'), 'Roots Bloody Roots');
});

test('zbytek si drží původní tvar včetně diakritiky', () => {
  // Název se pak hledá tak, jak zazněl — ne bez háčků.
  assert.equal(zbytekVety('otevři skladbu Přítel', 'otevři skladbu'), 'Přítel');
});

test('když nic nezbylo, vrátí se prázdno', () => {
  assert.equal(zbytekVety('spusť přehrávání', 'spusť přehrávání'), '');
});

test('nález nese zbytek věty', () => {
  const n = najdiPrikaz('otevři skladbu Ambush', [
    { id: 'x', nazev: 'Otevřít skladbu', fraze: ['otevři skladbu'] },
  ]);
  assert.equal(n?.zbytek, 'Ambush');
});
