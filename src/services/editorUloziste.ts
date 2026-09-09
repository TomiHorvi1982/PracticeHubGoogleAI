import { ClipTrack } from '@waveform-playlist/core';

/**
 * Stopy editoru mimo komponentu.
 *
 * Editor je sekce jako každá jiná: přepnutím na tabulaturu se odmontuje
 * a s ním by zmizel i stav ve `useState`. Načítat stopy znovu pokaždé,
 * když si člověk odskočí pro akordy, je otravné.
 *
 * Nahrávky se drží tady, v paměti stránky. Do prohlížeče se uložit
 * nedají — dekódovaný zvuk má desítky megabajtů a `localStorage` má
 * kolem pěti. Reload je tedy pořád vyprázdní, ale přepnutí sekce ne,
 * a to byla ta otravná část.
 */

type Poslucha = (stopy: ClipTrack[]) => void;

class EditorUloziste {
  private stopy: ClipTrack[] = [];
  private posluchaci = new Set<Poslucha>();

  public dej(): ClipTrack[] { return this.stopy; }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stopy);
    return () => { this.posluchaci.delete(f); };
  }

  /**
   * Nastaví stopy.
   *
   * Bere i funkci, aby šlo psát `nastav(p => [...p, nova])` bez rizika,
   * že se mezitím stav změnil jinde.
   */
  public nastav(nove: ClipTrack[] | ((p: ClipTrack[]) => ClipTrack[])): void {
    this.stopy = typeof nove === 'function' ? nove(this.stopy) : nove;
    this.posluchaci.forEach((f) => f(this.stopy));
  }

  public vyprazdni(): void { this.nastav([]); }
}

export const editorUloziste = new EditorUloziste();
