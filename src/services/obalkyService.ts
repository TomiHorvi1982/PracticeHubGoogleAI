import { Song } from '../types';
import { authService } from './authService';
import { songDatabaseService } from './songDatabaseService';

/**
 * Obaly alb a fotky interpretů.
 *
 * Doplňují se jednou a uloží se k písni, takže se při každém otevření
 * knihovny nehledají znovu. V seznamu je z obalu na první pohled poznat,
 * o kterou skladbu jde — dřív než se stačí přečíst název.
 */

export interface Obalky {
  obalAlba: string;
  obrazekInterpreta: string;
  nazevAlba: string;
  podleCeho: string;
}

/** Má píseň obrázky už doplněné? */
export function maObalky(song: Song): boolean {
  return Boolean(song.obalAlba || song.obrazekInterpreta);
}

async function najdi(interpret: string, nazev: string): Promise<Obalky | null> {
  const token = authService.getCurrentSession()?.token;
  const odkaz = `/api/obalky?interpret=${encodeURIComponent(interpret)}&nazev=${encodeURIComponent(nazev)}`;
  const odpoved = await fetch(odkaz, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await odpoved.json().catch(() => ({}));
  if (!odpoved.ok) throw new Error(data?.error || 'Obrázky se nepodařilo najít.');
  if (!data?.nalezeno) return null;
  return {
    obalAlba: String(data.obalAlba || ''),
    obrazekInterpreta: String(data.obrazekInterpreta || ''),
    nazevAlba: String(data.nazevAlba || ''),
    podleCeho: String(data.podleCeho || ''),
  };
}

/** Doplní obrázky jedné písni a uloží je. Vrací uloženou píseň, nebo null. */
export async function doplnObalky(song: Song): Promise<Song | null> {
  const nalez = await najdi(song.artist, song.title);
  if (!nalez || (!nalez.obalAlba && !nalez.obrazekInterpreta)) return null;

  return songDatabaseService.saveSong({
    ...song,
    obalAlba: nalez.obalAlba || song.obalAlba,
    obrazekInterpreta: nalez.obrazekInterpreta || song.obrazekInterpreta,
    nazevAlba: nalez.nazevAlba || song.nazevAlba,
    updatedAt: Date.now(),
  });
}

export interface PostupDoplnovani {
  hotovo: number;
  celkem: number;
  doplneno: number;
  prave: string;
}

/**
 * Doplní obrázky všem písním, které je ještě nemají.
 *
 * Jde jedna po druhé, ne všechny naráz: Deezer je veřejná služba bez
 * klíče a stovka souběžných dotazů je spolehlivá cesta, jak si nechat
 * zavřít dveře. Píseň, u které se nic nenajde, se přeskočí a běh
 * pokračuje — hledá se podle názvu, takže vlastní nahrávky a demáče
 * v katalogu prostě nebudou.
 */
export async function doplnObalkyVsem(
  pisne: Song[],
  hlas: (postup: PostupDoplnovani) => void,
  zastavit: () => boolean = () => false,
): Promise<number> {
  const chybejici = pisne.filter((p) => !maObalky(p));
  let doplneno = 0;

  for (let i = 0; i < chybejici.length; i += 1) {
    if (zastavit()) break;
    const p = chybejici[i];
    hlas({ hotovo: i, celkem: chybejici.length, doplneno, prave: `${p.artist} — ${p.title}` });
    try {
      if (await doplnObalky(p)) doplneno += 1;
    } catch {
      /* jedna neúspěšná píseň nesmí zastavit zbytek */
    }
  }

  hlas({ hotovo: chybejici.length, celkem: chybejici.length, doplneno, prave: '' });
  return doplneno;
}
