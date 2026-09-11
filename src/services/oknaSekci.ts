/**
 * Kam se má která sekce vykreslit.
 *
 * Sekce žijí na jednom místě (`ZiveSekce`), aby po přepnutí nepřišly
 * o stav. Plocha s okny je ale chce mít uvnitř oken — a kdyby si je
 * vykreslila sama, existovala by každá sekce dvakrát. Dvakrát připojený
 * mixážní pult znamená dva zvukové řetězce a dva rámy s cizí službou.
 *
 * Řeší se to portálem: sekce zůstane připojená tam, kde byla, a jen se
 * její obsah zobrazí v okně. Plocha sem hlásí, kam patří co, a `ZiveSekce`
 * se podle toho zařídí.
 *
 * Kromě místa se hlásí i to, jestli má okno kreslit — zakryté okno má
 * plátna uspat stejně jako schovaná sekce.
 */

export interface OknoSekce {
  /** Kam se obsah přestěhuje. `null` znamená „okno se zavírá". */
  kam: HTMLElement | null;
  /** Má se v tomhle okně kreslit? Zakryté okno ne. */
  kreslit: boolean;
}

type Poslucha = () => void;

const okna = new Map<string, OknoSekce>();
const posluchaci = new Set<Poslucha>();

function ohlas(): void {
  for (const f of posluchaci) f();
}

export const oknaSekci = {
  /**
   * Přihlásí okno pro sekci.
   *
   * Když se nic nemění, neohlašuje se — jinak by každé překreslení
   * plochy vyvolalo překreslení všech sekcí v oknech.
   */
  nastav(sekce: string, kam: HTMLElement | null, kreslit = true): void {
    const stare = okna.get(sekce);
    if (kam === null) {
      if (!stare) return;
      okna.delete(sekce);
      ohlas();
      return;
    }
    if (stare && stare.kam === kam && stare.kreslit === kreslit) return;
    okna.set(sekce, { kam, kreslit });
    ohlas();
  },

  dej(sekce: string): OknoSekce | undefined {
    return okna.get(sekce);
  },

  subscribe(f: Poslucha): () => void {
    posluchaci.add(f);
    return () => { posluchaci.delete(f); };
  },

  /** Kolik oken je přihlášeno. Jen pro testy a ladění. */
  pocet(): number {
    return okna.size;
  },
};
