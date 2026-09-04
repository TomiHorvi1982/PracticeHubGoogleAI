import { useEffect, useRef, useState } from 'react';
import { sdilenyVyraz, maHledatZnovu } from './sdilenyVyraz';

/**
 * Napojí sekci na sdílený vyhledávací výraz.
 *
 * Sekce dostane výraz do svého pole a zavolá se jí hledání — ale jen
 * když je sekce právě vykreslená a výraz je jiný, než jaký naposledy
 * hledala. Protože se sekce vykreslují až po přepnutí, znamená to
 * „hledej při vstupu", ne „hledej na pozadí pořád".
 *
 * `hledej` se schválně drží v ref: sekce ji obvykle skládají v těle
 * komponenty, takže by se při každém překreslení lišila a efekt by se
 * spouštěl dokola.
 */
export function useSdilenyVyraz(hledej: (vyraz: string) => void): string {
  const [vyraz, setVyraz] = useState(sdilenyVyraz.ziskej());
  const naposledy = useRef<string | null>(null);
  const hledejRef = useRef(hledej);
  hledejRef.current = hledej;

  useEffect(() => sdilenyVyraz.subscribe(setVyraz), []);

  useEffect(() => {
    if (!maHledatZnovu(vyraz, naposledy.current)) return;
    naposledy.current = vyraz;
    hledejRef.current(vyraz.trim());
  }, [vyraz]);

  return vyraz;
}
