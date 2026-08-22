/**
 * Hlídá, aby v appce hrál vždycky jen jeden zdroj zvuku.
 *
 * Zvuk umí spustit několik míst nezávisle na sobě: spodní lišta přehrávače,
 * Media Center, mixážní pult, bicí. Každé si drží vlastní přehrávač a o
 * ostatních neví — takže se stopy míchají dohromady a uživatel slyší dvě
 * skladby naráz.
 *
 * Řeší to jedno místo, které ví, kdo zrovna hraje. Kdo chce spustit zvuk,
 * ohlásí se přes `claim()`; tím se zastaví všichni ostatní. Zastavení je na
 * každém zdroji — bus nezná YouTube ani Web Audio, jen zavolá funkci, kterou
 * mu zdroj dal.
 */

type StopFn = () => void;

const zdroje = new Map<string, StopFn>();
let hraje: string | null = null;

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
      if (hraje === id) hraje = null;
    };
  },

  /**
   * Ohlásí, že tenhle zdroj začíná hrát, a zastaví všechny ostatní.
   *
   * Chyba v cizím zastavení nesmí shodit spuštění toho, kdo se hlásí —
   * jinak by jeden rozbitý přehrávač zablokoval zvuk v celé appce.
   */
  claim(id: string): void {
    for (const [jinyId, stop] of zdroje) {
      if (jinyId === id) continue;
      try {
        stop();
      } catch (e) {
        console.warn(`[audioBus] Zdroj „${jinyId}" se nepodařilo zastavit:`, e);
      }
    }
    hraje = id;
  },

  /** Ohlásí, že tenhle zdroj dohrál. Cizích se nedotýká. */
  release(id: string): void {
    if (hraje === id) hraje = null;
  },

  /** Kdo zrovna hraje, nebo `null`. Pro diagnostiku. */
  current(): string | null {
    return hraje;
  },
};
