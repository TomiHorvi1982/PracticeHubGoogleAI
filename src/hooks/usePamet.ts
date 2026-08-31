import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Stav, který přežije přepnutí sekce.
 *
 * Sekce se při odchodu odpojí a všechno v nich zmizí — po návratu se
 * hledaný soubor hledá znovu, filtr se nastavuje znovu a otevřený náhled
 * je pryč. Přitom je to práce, kterou člověk před chvílí udělal.
 *
 * Ukládá se do `sessionStorage`, ne do `localStorage`: má to přežít
 * překlikávání mezi sekcemi, ne návrat za týden. Zavřením okna se to
 * zapomene, což je správně — jinak by se po měsíci otevřela knihovna
 * s filtrem, o kterém nikdo neví, proč tam je.
 */

/** Předpona, ať se to v úložišti nemíchá s ostatním. */
const PREDPONA = 'neverlate_pamet_';

function nacti<T>(klic: string, vychozi: T): T {
  try {
    const ulozene = sessionStorage.getItem(PREDPONA + klic);
    return ulozene === null ? vychozi : (JSON.parse(ulozene) as T);
  } catch {
    // Poškozený nebo zakázaný `sessionStorage` není důvod sekci neotevřít.
    return vychozi;
  }
}

export function usePamet<T>(klic: string, vychozi: T): [T, (v: T | ((p: T) => T)) => void] {
  const [hodnota, setHodnota] = useState<T>(() => nacti(klic, vychozi));

  // Klíč v refu: kdyby se změnil, zápis by jinak zamířil na ten starý.
  const klicRef = useRef(klic);
  klicRef.current = klic;

  useEffect(() => {
    try {
      sessionStorage.setItem(PREDPONA + klicRef.current, JSON.stringify(hodnota));
    } catch {
      /* plné úložiště nesmí shodit sekci */
    }
  }, [hodnota]);

  return [hodnota, setHodnota as (v: T | ((p: T) => T)) => void];
}

/**
 * Totéž pro množinu identifikátorů.
 *
 * `Set` se do JSON neuloží — vyleze z něj prázdný objekt a po návratu do
 * sekce by výběr tiše zmizel. Uvnitř se proto drží pole.
 */
export function usePametMnoziny(
  klic: string,
  vychozi: string[] = []
): [Set<string>, (f: (p: Set<string>) => Set<string>) => void] {
  const [pole, setPole] = usePamet<string[]>(klic, vychozi);
  const mnozina = useRef(new Set(pole));
  mnozina.current = new Set(pole);

  const nastav = useCallback(
    (f: (p: Set<string>) => Set<string>) => {
      setPole([...f(new Set(mnozina.current))]);
    },
    [setPole]
  );

  return [mnozina.current, nastav];
}
