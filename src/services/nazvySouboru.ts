import { SongAttachment } from '../types';
import { soubory } from './mnozneCislo';

/**
 * Názvy a počty souborů při stahování.
 *
 * Oddělené od samotného stahování, protože to sahá na přihlášení a na
 * síť — tohle je čistý výpočet a jde ověřit samostatně.
 */

/** Přípona podle typu — nahrané soubory ji občas v názvu nemají. */
const PRIPONY: Record<SongAttachment['type'], string> = {
  pdf: 'pdf',
  midi: 'mid',
  guitarpro: 'gp5',
  txt: 'txt',
  image: 'png',
  audio: 'mp3',
};

/**
 * Skloňování počtu souborů.
 *
 * Sdílí obecné skloňování, aby čeština nežila v aplikaci na dvou místech
 * a nerozešla se.
 */
export const souboru = (pocet: number) => soubory(pocet);

/**
 * Název, pod kterým se soubor uloží na disk.
 *
 * Znaky, které operační systémy v názvech nepřipouštějí, se nahrazují —
 * lomítko by znamenalo podadresář a dvojtečka rozbije Windows.
 */
export function nazevSouboru(att: SongAttachment): string {
  const cisty = (att.name || 'priloha').replace(/[/\\?%*:|"<>]/g, '-').trim();
  if (/\.[a-z0-9]{2,4}$/i.test(cisty)) return cisty;
  return `${cisty}.${PRIPONY[att.type] || 'bin'}`;
}
