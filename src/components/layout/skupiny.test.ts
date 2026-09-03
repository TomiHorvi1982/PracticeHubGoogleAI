import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKUPINY, PRIME, STRANOU, skupinaSekce, dosazitelneSekce } from './skupiny';

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
