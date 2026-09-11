import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * Je sekce vidět?
 *
 * Sekce zůstávají po přepnutí připojené (`ZiveSekce`), aby nepřišly o
 * rozdělanou práci. Jenže řada z nich zastavovala zvuk až při
 * odmontování — metronom, smyčka na hmatníku, sekvencer, ladička — a
 * odmontování teď nepřijde. Schovaná sekce by hrála dál.
 *
 * Tohle je jiná otázka než `KresleniOkna`. To říká „má se kreslit" a na
 * ploše s okny je `false` i pro okno, které je jen zakryté jiným oknem —
 * a to má hrát dál, jen nemá počítat vlnovky. Tady jde o to, jestli je
 * sekce otevřená vůbec: na celé obrazovce, nebo v okně na ploše.
 *
 * Mimo `ZiveSekce` je výchozí hodnota `true`, takže komponenta použitá
 * jinde (modální okno, zpěvník) se chová jako dřív.
 */
export const SekceVidet = createContext(true);

export function useSekceVidet(): boolean {
  return useContext(SekceVidet);
}

/**
 * Zavolá `zastav`, jakmile se sekce schová.
 *
 * Jen při přechodu z „vidět" na „schovaná", ne při každém vykreslení
 * a ne při připojení. Funkce se drží v refu, takže volající může předat
 * obyčejnou funkci definovanou v těle komponenty.
 */
export function useZastavPriSkryti(zastav: () => void): void {
  const videt = useContext(SekceVidet);
  const funkce = useRef(zastav);
  funkce.current = zastav;
  const predtim = useRef(videt);

  useEffect(() => {
    if (predtim.current && !videt) {
      try {
        funkce.current();
      } catch (e) {
        console.warn('[sekce] Zastavení při schování selhalo:', e);
      }
    }
    predtim.current = videt;
  }, [videt]);
}
