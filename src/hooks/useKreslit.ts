import { RefObject, createContext, useContext, useEffect, useState } from 'react';

/**
 * Má se teď kreslit?
 *
 * Spektrum, vlnovky, přehrávací kurzory a měřáky jedou na
 * `requestAnimationFrame`. Prohlížeč ho sám uspí jedině tehdy, když je
 * v pozadí celá karta — plátno schované pod jiným oknem nebo odrolované
 * mimo obrazovku počítá a kreslí dál. Při hraní naživo tahle práce
 * soupeří o procesor se zvukovým vláknem a projeví se prasknutím.
 *
 * Skládá se ze tří odpovědí a stačí jedno „ne":
 *
 *   1. karta v pozadí (`document.hidden`),
 *   2. prvek není v dohledu (odrolovaný, zavřený panel),
 *   3. okno, ve kterém prvek sedí, je zakryté jiným oknem.
 *
 * Třetí bod prohlížeč sám nezjistí — plátno pod jiným oknem je z jeho
 * pohledu pořád na obrazovce. Odpověď proto přichází shora z plochy
 * přes `KresleniOkna`.
 */

/**
 * Kreslí okno, ve kterém komponenta sedí?
 *
 * Výchozí `true`: sekce mimo plochu žádné okno nemá a kreslit má.
 */
export const KresleniOkna = createContext(true);

/** Je karta prohlížeče vpředu? */
function kartaVpredu(): boolean {
  return typeof document === 'undefined' || !document.hidden;
}

export function useKreslit(prvek: RefObject<Element | null>): boolean {
  const okno = useContext(KresleniOkna);
  const [vpredu, setVpredu] = useState(kartaVpredu);
  // Napoprvé se kreslí. Pozorovatel se ozve hned po připojení, takže
  // opačná výchozí hodnota by způsobila bliknutí prázdného plátna.
  const [vDohledu, setVDohledu] = useState(true);

  useEffect(() => {
    const zmena = () => setVpredu(kartaVpredu());
    document.addEventListener('visibilitychange', zmena);
    return () => document.removeEventListener('visibilitychange', zmena);
  }, []);

  useEffect(() => {
    const el = prvek.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const pozorovatel = new IntersectionObserver(
      ([z]) => setVDohledu(z.isIntersecting),
      // Kousek nad okrajem obrazovky se kreslí taky, ať je plátno
      // hotové dřív, než na něj uživatel doroluje.
      { rootMargin: '120px' },
    );
    pozorovatel.observe(el);
    return () => pozorovatel.disconnect();
  }, [prvek]);

  return okno && vpredu && vDohledu;
}
