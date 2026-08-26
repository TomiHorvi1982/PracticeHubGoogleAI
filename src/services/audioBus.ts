/**
 * Hlídá, aby v appce hrál vždycky jen jeden zdroj zvuku.
 *
 * Zvuk umí spustit několik míst nezávisle na sobě: spodní lišta přehrávače,
 * Media Center, mixážní pult, bicí, ukázky u výsledků hledání i u každé
 * skladby v knihovně. Každé si drží vlastní přehrávač a o ostatních neví —
 * takže se stopy míchají dohromady a uživatel slyší dvě skladby naráz.
 *
 * Řeší to jedno místo, které ví, kdo zrovna hraje. Kdo chce spustit zvuk,
 * ohlásí se přes `claim()`; tím se zastaví všichni ostatní. Zastavení je na
 * každém zdroji — bus nezná YouTube ani Web Audio, jen zavolá funkci, kterou
 * mu zdroj dal.
 *
 * Kromě toho si pamatuje, *co* hraje, aby to šlo ukázat ve vrchní liště.
 * Bez toho by uživatel u sedmi možných zdrojů zvuku hledal, který z nich
 * vypnout.
 */

type StopFn = () => void;

/** Co zrovna hraje. `zdroj` je pro člověka, ne pro kód. */
export interface CoHraje {
  id: string;
  nazev: string;
  zdroj: string;
}

const zdroje = new Map<string, StopFn>();
const posluchaci = new Set<(stav: CoHraje | null) => void>();
let hraje: CoHraje | null = null;

function ohlas(): void {
  for (const f of posluchaci) {
    try {
      f(hraje);
    } catch (e) {
      console.warn('[audioBus] Posluchač spadl:', e);
    }
  }
}

export const audioBus = {
  /**
   * Zaregistruje zdroj zvuku a jeho způsob zastavení. Volá se při připojení
   * komponenty, ne až při přehrávání — zdroj musí jít zastavit i tehdy,
   * když se o slovo hlásí někdo jiný.
   */
  register(id: string, stop: StopFn): () => void {
    zdroje.set(id, stop);
    return () => {
      zdroje.delete(id);
      if (hraje?.id === id) {
        hraje = null;
        ohlas();
      }
    };
  },

  /**
   * Ohlásí, že tenhle zdroj začíná hrát, a zastaví všechny ostatní.
   *
   * Chyba v cizím zastavení nesmí shodit spuštění toho, kdo se hlásí —
   * jinak by jeden rozbitý přehrávač zablokoval zvuk v celé appce.
   */
  claim(id: string, nazev?: string, zdroj?: string): void {
    for (const [jinyId, stop] of zdroje) {
      if (jinyId === id) continue;
      try {
        stop();
      } catch (e) {
        console.warn(`[audioBus] Zdroj „${jinyId}" se nepodařilo zastavit:`, e);
      }
    }
    hraje = { id, nazev: nazev || '', zdroj: zdroj || id };
    ohlas();
  },

  /** Ohlásí, že tenhle zdroj dohrál. Cizích se nedotýká. */
  release(id: string): void {
    if (hraje?.id === id) {
      hraje = null;
      ohlas();
    }
  },

  /** Zastaví, co zrovna hraje. Pro tlačítko ve vrchní liště. */
  stopAll(): void {
    for (const [id, stop] of zdroje) {
      try {
        stop();
      } catch (e) {
        console.warn(`[audioBus] Zdroj „${id}" se nepodařilo zastavit:`, e);
      }
    }
    hraje = null;
    ohlas();
  },

  /** Kdo zrovna hraje, nebo `null`. */
  current(): CoHraje | null {
    return hraje;
  },

  /**
   * Sleduje, co hraje. Vrací funkci pro odhlášení.
   *
   * Ohlásí se hned při přihlášení — komponenta připojená uprostřed
   * přehrávání by jinak čekala na změnu, která už proběhla.
   */
  subscribe(f: (stav: CoHraje | null) => void): () => void {
    posluchaci.add(f);
    f(hraje);
    return () => posluchaci.delete(f);
  },
};
