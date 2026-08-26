import { authService } from './authService';
import { Okno } from '../components/songbook/plovouciOkna';

/**
 * Osobní nastavení Pódia.
 *
 * Rozložení oken bylo dosud uložené na skladbě, takže si ho celá kapela
 * sdílela: kytarista si otevřel tabulaturu a bubeníkovi tím zmizel text.
 * Co kdo u které písně potřebuje vidět, je ale osobní věc — proto se to
 * ukládá ke člověku, ne k písni.
 *
 * Zatím jen v prohlížeči. Uložení na profil do databáze čeká na sloupec
 * `profiles.podium`; do té doby si každý drží své nastavení na svém
 * počítači.
 */

const KLIC = 'neverlate_podium';

interface Podium {
  /** Rozložení oken u jednotlivých písní. Klíčem je id skladby. */
  pisne: Record<string, Okno[]>;
  /** Který playlist má člověk na Pódiu otevřený. */
  playlist?: string;
}

function kdo(): string {
  return authService.getCurrentSession()?.user?.id || 'host';
}

function nacti(): Podium {
  try {
    const vse = JSON.parse(localStorage.getItem(KLIC) || '{}');
    const moje = vse[kdo()];
    return { pisne: moje?.pisne || {}, playlist: moje?.playlist };
  } catch {
    return { pisne: {} };
  }
}

function uloz(p: Podium): void {
  try {
    const vse = JSON.parse(localStorage.getItem(KLIC) || '{}');
    vse[kdo()] = p;
    localStorage.setItem(KLIC, JSON.stringify(vse));
  } catch {
    /* plné úložiště nesmí shodit práci s Pódiem */
  }
}

export const podiumProfil = {
  /** Okna, která si člověk u téhle písně nastavil. */
  oknaPisne(songId: string): Okno[] | null {
    const o = nacti().pisne[songId];
    return Array.isArray(o) ? o : null;
  },

  ulozOknaPisne(songId: string, okna: Okno[]): void {
    const p = nacti();
    p.pisne[songId] = okna;
    uloz(p);
  },

  /** Které písně už mají něco nastaveno — Pódium to ukazuje u playlistu. */
  maNastaveno(songId: string): boolean {
    return (nacti().pisne[songId]?.length || 0) > 0;
  },

  playlist(): string | undefined {
    return nacti().playlist;
  },

  ulozPlaylist(id: string): void {
    const p = nacti();
    p.playlist = id;
    uloz(p);
  },
};
