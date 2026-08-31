import { Song } from '../types';

/**
 * Co už je u písně po ruce.
 *
 * V seznamu se pozná jen název a interpret, takže než člověk zjistí,
 * jestli k písni existuje text nebo podklad, musí ji otevřít — a když
 * ne, otevřít další. U devadesáti písní je to k ničemu. Odsud se dá
 * vedle názvu vykreslit řádka značek a je to vidět na první pohled.
 *
 * Počítá se z toho, co píseň opravdu nese, ne z ručně nastavených
 * příznaků: ty by po prvním importu přestaly platit a nikdo by je
 * neudržoval.
 */

export type CoJeUPisne =
  | 'text'
  | 'akordy'
  | 'taby'
  | 'video'
  | 'audio'
  | 'stopy'
  | 'midi';

/** Jak se části rozdělené nahrávky obvykle jmenují. */
const NAZVY_STOP = /(vocal|zpěv|zpev|drum|bici|bicí|bass|basa|guitar|kytara|lead|rhythm|other|stem)/i;

/**
 * Kolik textu už je textem.
 *
 * Pár znaků bývá zbytek po importu — „intro", jedna značka akordu. Za
 * text se počítá až něco, co se dá zpívat.
 */
const TEXTU_NEJMIN = 40;

export interface Dostupnost {
  co: CoJeUPisne;
  /** Krátký popisek do bubliny. */
  popis: string;
}

const POPISY: Record<CoJeUPisne, string> = {
  text: 'Text písně',
  akordy: 'Akordy',
  taby: 'Tabulatura',
  video: 'Video na YouTube',
  audio: 'Nahrávka',
  stopy: 'Rozdělené stopy',
  midi: 'MIDI',
};

export function dostupnostPisne(s: Song): Dostupnost[] {
  const prilohy = s.attachments || [];
  const zvuky = prilohy.filter((p) => p.type === 'audio');

  // Za rozdělené stopy se počítá až sada: jeden soubor pojmenovaný
  // „bass" je pořád jen nahrávka basy, ne rozdělená píseň.
  const jsouStopy = zvuky.filter((p) => NAZVY_STOP.test(p.name)).length >= 2;

  const cisty = (s.content || '').replace(/\[[^\]]*\]/g, '').trim();

  const co: CoJeUPisne[] = [];
  if (cisty.length >= TEXTU_NEJMIN) co.push('text');
  if ((s.chordsUsed?.length || 0) > 0 || /\[[A-H][^\]]*\]/.test(s.content || '')) co.push('akordy');
  if ((s.tabs?.length || 0) > 0 || prilohy.some((p) => p.type === 'guitarpro')) co.push('taby');
  if ((s.youtubeVideos?.length || 0) > 0) co.push('video');
  // Nahrávka a stopy se nevylučují — u písně může být obojí.
  if (zvuky.length > 0) co.push('audio');
  if (jsouStopy) co.push('stopy');
  if ((s.midiFiles?.length || 0) > 0 || prilohy.some((p) => p.type === 'midi')) co.push('midi');

  return co.map((c) => ({ co: c, popis: POPISY[c] }));
}
