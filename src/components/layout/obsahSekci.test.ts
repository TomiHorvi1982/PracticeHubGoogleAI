import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { dosazitelneSekce } from './skupiny';
import { SEKCE_HLASEM } from './sekce';

/**
 * Každá sekce, na kterou vede navigace, musí mít obsah.
 *
 * Vznikl po chybě, která sedm sekcí tiše zahodila: při náhradě bloku
 * BandLabu v `App.tsx` se vyřízlo všechno od `bandlab:` po `stemmixer:`,
 * a s tím i Guitar Pro, Metronom, Ladička, Výuka, Nastavení, Virtual
 * Instruments a AI kapela. Importy komponent zůstaly, takže TypeScript
 * nic nehlásil, a test navigace hlídal jen nabídku, ne obsah. Tlačítko
 * v liště svítilo a obrazovka pod ním byla prázdná.
 *
 * `App.tsx` se do testu načíst nedá — sahá na Supabase a na prohlížeč —
 * proto se klíče mapy čtou ze zdrojového textu.
 */
function klicObsahuSekci(): Set<string> {
  const zdroj = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const zacatek = zdroj.indexOf('const obsahSekci');
  assert.ok(zacatek >= 0, 'v App.tsx chybí mapa obsahSekci');
  const konec = zdroj.indexOf('\n  };', zacatek);
  const telo = zdroj.slice(zacatek, konec);
  return new Set([...telo.matchAll(/^ {4}([a-z0-9]+):/gm)].map((m) => m[1]));
}

test('každá sekce z navigace má v App.tsx obsah', () => {
  const klice = klicObsahuSekci();
  const chybi = dosazitelneSekce().filter((id) => !klice.has(id));
  assert.deepEqual(chybi, [], `bez obsahu: ${chybi.join(', ')}`);
});

test('každý hlasový příkaz vede na sekci s obsahem', () => {
  const klice = klicObsahuSekci();
  const chybi = [...new Set(Object.values(SEKCE_HLASEM))].filter((id) => !klice.has(id));
  assert.deepEqual(chybi, [], `hlasem na prázdnou obrazovku: ${chybi.join(', ')}`);
});

test('čtení mapy opravdu něco čte', () => {
  // Kdyby se změnil tvar zápisu, dva testy výš by tiše prošly s prázdnou
  // množinou — a hlídaly by přesně nic.
  assert.ok(klicObsahuSekci().size >= 15);
});
