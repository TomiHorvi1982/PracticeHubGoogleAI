import { Song } from '../types';

/**
 * Řazení knihovny skladeb.
 *
 * Kritéria odpovídají tomu, podle čeho se hledá píseň na zkoušku: podle
 * kapely, tempa, tóniny nebo ladění. Prázdné hodnoty jdou vždycky nakonec —
 * skladby bez tempa nahoře by zakryly ty, kvůli kterým se řadilo.
 */

export type KlicRazeni =
  | 'band'
  | 'artist'
  | 'song'
  | 'tempo'
  | 'key'
  | 'tuning'
  | 'genre'
  | 'language'
  | 'recent';

/**
 * Údaje, které se dají zapnout jako sloupec.
 *
 * Název skladby mezi nimi není — ten je v seznamu vždycky. Žánr a jazyk
 * odešly: jako sloupec opakovaly u půlky knihovny totéž slovo a jazyk je
 * navíc jen odhad z textu.
 */
export const SLOUPCE: { klic: KlicRazeni; popis: string }[] = [
  { klic: 'band', popis: 'Kapela' },
  { klic: 'artist', popis: 'Autor' },
  { klic: 'tempo', popis: 'Tempo' },
  { klic: 'key', popis: 'Tónina' },
  { klic: 'tuning', popis: 'Ladění' },
];

function text(s: Song, klic: KlicRazeni): string {
  switch (klic) {
    case 'band': return s.artist || '';
    case 'artist': return (s as any).author || '';
    case 'song': return s.title || '';
    case 'key': return s.key || '';
    case 'tuning': return s.tuning || '';
    case 'genre': return (s as any).genre || '';
    case 'language': return (s as any).language || '';
    default: return '';
  }
}

export function seradPodle(songs: Song[], klic: KlicRazeni, sestupne = false): Song[] {
  const kopie = [...songs];
  const smer = sestupne ? -1 : 1;

  kopie.sort((a, b) => {
    if (klic === 'recent') return ((b.createdAt || 0) - (a.createdAt || 0)) * smer;

    if (klic === 'tempo') {
      const x = a.bpm || 0;
      const y = b.bpm || 0;
      // Skladby bez tempa patří nakonec bez ohledu na směr řazení —
      // jinak by při sestupném pořadí obsadily celý začátek.
      if (!x && !y) return a.title.localeCompare(b.title, 'cs');
      if (!x) return 1;
      if (!y) return -1;
      return (x - y) * smer || a.title.localeCompare(b.title, 'cs');
    }

    const x = text(a, klic);
    const y = text(b, klic);
    if (!x && !y) return a.title.localeCompare(b.title, 'cs');
    if (!x) return 1;
    if (!y) return -1;
    // Druhotně vždy podle názvu, aby stejné kapely nebyly zamíchané náhodně.
    return x.localeCompare(y, 'cs') * smer || a.title.localeCompare(b.title, 'cs');
  });

  return kopie;
}

/**
 * Odhad jazyka z textu písně.
 *
 * Nesleduje se nikde, ale dá se poznat: česká diakritika je pro češtinu a
 * slovenštinu jednoznačná a pár typických slov odliší zbytek. Jen odhad —
 * proto se ukazuje jako údaj o textu, ne jako vlastnost, kterou někdo zadal.
 */
export function odhadniJazyk(content: string): string | null {
  const t = (content || '').toLowerCase();
  if (t.trim().length < 60) return null;

  const ceskaPismena = (t.match(/[ěščřžýáíéúůňťď]/g) || []).length;
  const slova = t.split(/\s+/).length;
  if (ceskaPismena / Math.max(1, slova) > 0.08) {
    // Slovenština má ľ, ô a ä, které čeština nezná.
    return /[ľôä]/.test(t) ? 'Slovensky' : 'Česky';
  }

  const anglicka = (t.match(/\b(the|you|and|love|never|what|your|with|from|this)\b/g) || []).length;
  if (anglicka / Math.max(1, slova) > 0.03) return 'Anglicky';
  return null;
}
