import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKUPINY, PRIME, STRANOU, skupinaSekce, dosazitelneSekce, viditelnePolozky } from './skupiny';

/**
 * Sekce, které navigace musí umět otevřít.
 *
 * Schválně vypsané ručně, ne odvozené ze `skupiny.ts` — jinak by test
 * jen potvrdil sám sebe a vypadnutí sekce by neodhalil.
 */
const OCEKAVANE = [
  'songbook', 'podium', 'alphatab', 'texty', 'practise', 'instruments',
  'practice', 'tuner', 'stemmixer', 'liveamp', 'library', 'zalozky',
  'vitejte', 'settings',
];

test('seskupením se neztratila žádná sekce', () => {
  const mame = dosazitelneSekce().sort();
  assert.deepEqual(mame, [...OCEKAVANE].sort());
});

test('žádná sekce není na dvou místech zároveň', () => {
  // Dvě cesty k jedné obrazovce nutí hádat, která je ta správná —
  // přesně to bylo předtím u Metronomu a Ladičky.
  const vse = dosazitelneSekce();
  assert.equal(new Set(vse).size, vse.length);
});

test('rozbalovátko se pozná podle otevřené sekce', () => {
  assert.equal(skupinaSekce('stemmixer'), 'zvuk');
  assert.equal(skupinaSekce('tuner'), 'cviceni');
  assert.equal(skupinaSekce('songbook'), null, 'přímá sekce do skupiny nepatří');
});

test('v liště je nejvýš šest cílů, ne čtrnáct', () => {
  // Čtrnáct položek se do lišty vešlo jen tak tak a poslední byla
  // useknutá; na mobilu bylo osm mimo obrazovku.
  assert.ok(PRIME.length + SKUPINY.length <= 6, `je jich ${PRIME.length + SKUPINY.length}`);
});

test('žádná skupina není tak velká, aby se v ní hledalo', () => {
  for (const s of SKUPINY) assert.ok(s.polozky.length <= 5, `${s.nazev} má ${s.polozky.length}`);
});

test('skupiny nejsou prázdné a stranou jsou jen dvě věci', () => {
  for (const s of SKUPINY) assert.ok(s.polozky.length > 0, `${s.nazev} je prázdná`);
  assert.equal(STRANOU.length, 2);
});

test('ladička se v nabídce neukazuje, ale dosažitelná zůstává', () => {
  // Vykresluje tutéž komponentu jako dolní panel, kde se spouští z horní
  // lišty. Kdyby vypadla úplně, přišlo by se o hlasový příkaz i o trasu.
  const cviceni = SKUPINY.find((s) => s.id === 'cviceni')!;
  assert.ok(cviceni.polozky.some((p) => p.id === 'tuner'), 'sekce má zůstat');
  assert.ok(!viditelnePolozky(cviceni).some((p) => p.id === 'tuner'), 'v nabídce být nemá');
  assert.ok(dosazitelneSekce().includes('tuner'));
});

test('sekce s akordovým trenažérem se nejmenuje Metronom', () => {
  // Vykresluje PracticeAssistant — akordové postupy, rytmické vzory a
  // výběr nástroje. Metronom je z toho jen část a název schovával zbytek.
  const p = SKUPINY.flatMap((s) => s.polozky).find((x) => x.id === 'practice')!;
  assert.notEqual(p.nazev, 'Metronom');
  assert.match(p.nazev, /[Aa]kord/);
});

test('v žádné nabídce nezůstane po skrytí prázdno', () => {
  for (const s of SKUPINY) {
    assert.ok(viditelnePolozky(s).length > 0, `${s.nazev} by byla prázdná`);
  }
});
