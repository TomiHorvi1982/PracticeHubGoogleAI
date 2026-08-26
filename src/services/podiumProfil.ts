import { authService } from './authService';
import { Okno } from '../components/songbook/plovouciOkna';

/**
 * Osobní nastavení Pódia.
 *
 * Rozložení oken bylo dřív uložené na skladbě, takže si ho celá kapela
 * sdílela: kytarista si otevřel tabulaturu a bubeníkovi tím zmizel text.
 * Co kdo u které písně potřebuje vidět, je ale osobní věc — proto se to
 * ukládá ke člověku.
 *
 * Drží se na dvou místech naráz. V prohlížeči, aby se plocha vykreslila
 * hned a fungovala i bez sítě, a na profilu v databázi, aby ji člověk
 * našel i na jiném počítači. Čtení vyhrává profil; ten je společný pro
 * všechna zařízení, kdežto místní kopie je jen tohohle prohlížeče.
 */

const KLIC = 'neverlate_podium';

interface Podium {
  /** Rozložení oken u jednotlivých písní. Klíčem je id skladby. */
  pisne: Record<string, Okno[]>;
  /** Který playlist má člověk na Pódiu otevřený. */
  playlist?: string;
}

const PRAZDNE: Podium = { pisne: {} };

function kdo(): string {
  return authService.getCurrentSession()?.user?.id || 'host';
}

function zLokalu(): Podium {
  try {
    const vse = JSON.parse(localStorage.getItem(KLIC) || '{}');
    const moje = vse[kdo()];
    return { pisne: moje?.pisne || {}, playlist: moje?.playlist };
  } catch {
    return { ...PRAZDNE };
  }
}

function doLokalu(p: Podium): void {
  try {
    const vse = JSON.parse(localStorage.getItem(KLIC) || '{}');
    vse[kdo()] = p;
    localStorage.setItem(KLIC, JSON.stringify(vse));
  } catch {
    /* plné úložiště nesmí shodit práci s Pódiem */
  }
}

/** Poslední známý stav. Čte se z něj synchronně při vykreslování. */
let stav: Podium = zLokalu();

/**
 * Zápis na profil je odložený.
 *
 * Tažení okna vyvolá zápis při každém puštění myši; posílat kvůli tomu
 * dotaz na server znamená desítky volání za minutu. Čeká se, až se ruka
 * zastaví.
 */
let odlozeny: number | null = null;

async function posli(): Promise<void> {
  const token = authService.getCurrentSession()?.token;
  if (!token) return;
  try {
    await fetch('/api/podium', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ podium: stav }),
    });
  } catch {
    // Výpadek sítě není důvod cokoli hlásit — místní kopie platí dál a
    // na profil se to dostane při příští změně.
  }
}

function uloz(): void {
  doLokalu(stav);
  if (odlozeny !== null) window.clearTimeout(odlozeny);
  odlozeny = window.setTimeout(() => {
    odlozeny = null;
    void posli();
  }, 1200);
}

export const podiumProfil = {
  /**
   * Natáhne nastavení z profilu.
   *
   * Volá se po přihlášení. Než odpověď dorazí, platí místní kopie —
   * plocha se vykreslí hned a případný rozdíl se srovná po ní.
   */
  async nactiZProfilu(): Promise<void> {
    const token = authService.getCurrentSession()?.token;
    if (!token) return;
    try {
      const r = await fetch('/api/podium', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const d = await r.json();
      const z = d?.podium;
      if (z && typeof z === 'object' && z.pisne) {
        stav = { pisne: z.pisne || {}, playlist: z.playlist };
        doLokalu(stav);
        // Plocha už může být vykreslená ze staré kopie; tohle jí řekne,
        // ať se přepočítá.
        window.dispatchEvent(new CustomEvent('neverlate:podium-zmena', { detail: { zProfilu: true } }));
      }
    } catch {
      /* bez sítě se jede z místní kopie */
    }
  },

  /** Přepne se na nastavení jiného člověka po přihlášení a odhlášení. */
  prepniUzivatele(): void {
    stav = zLokalu();
  },

  /** Okna, která si člověk u téhle písně nastavil. */
  oknaPisne(songId: string): Okno[] | null {
    const o = stav.pisne[songId];
    return Array.isArray(o) ? o : null;
  },

  ulozOknaPisne(songId: string, okna: Okno[]): void {
    stav = { ...stav, pisne: { ...stav.pisne, [songId]: okna } };
    uloz();
  },

  /** Které písně už mají něco nastaveno — Pódium to ukazuje u playlistu. */
  maNastaveno(songId: string): boolean {
    return (stav.pisne[songId]?.length || 0) > 0;
  },

  playlist(): string | undefined {
    return stav.playlist;
  },

  ulozPlaylist(id: string): void {
    stav = { ...stav, playlist: id };
    uloz();
  },
};
