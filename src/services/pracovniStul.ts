import { LibraryAsset } from './assetLibraryService';

/**
 * Co má člověk zrovna rozdělané ve Virtual Instruments.
 *
 * Sekce nástrojů a plocha na Pódiu jsou dvě různá místa, ale pracuje se
 * v nich s tímtéž: vybraná stupnice na hmatníku, načtené MIDI, poskládaná
 * smyčka ze samplů. Bez sdíleného místa by si člověk na Pódiu musel
 * všechno vybrat znovu a doufat, že to zvolil stejně.
 */

export interface StavStolu {
  /** MIDI vybrané v sekci nástrojů. */
  midi: LibraryAsset | null;
  /** Základní tón a stupnice pro hmatník i klaviaturu. */
  zaklad: string;
  stupnice: string | null;
  /** Tóny stupnice bez oktáv, jak je spočítala sekce nástrojů. */
  tonyStupnice: string[];
}

let stav: StavStolu = { midi: null, zaklad: 'C', stupnice: null, tonyStupnice: [] };
const posluchaci = new Set<(s: StavStolu) => void>();

function oznam(): void {
  for (const f of posluchaci) f(stav);
}

export const pracovniStul = {
  getState(): StavStolu {
    return stav;
  },

  subscribe(f: (s: StavStolu) => void): () => void {
    posluchaci.add(f);
    f(stav);
    return () => posluchaci.delete(f);
  },

  nastavMidi(midi: LibraryAsset | null): void {
    stav = { ...stav, midi };
    oznam();
  },

  nastavStupnici(zaklad: string, stupnice: string | null, tony: string[]): void {
    // Ohlásí se jen skutečná změna. Sekce nástrojů přepočítává stupnici
    // při každém překreslení a hlásit to pokaždé by znamenalo překreslovat
    // i všechna okna na Pódiu.
    if (stav.zaklad === zaklad && stav.stupnice === stupnice && stav.tonyStupnice.join() === tony.join()) {
      return;
    }
    stav = { ...stav, zaklad, stupnice, tonyStupnice: tony };
    oznam();
  },
};
