import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { KresleniOkna } from '../../hooks/useKreslit';
import { audioBus } from '../../services/audioBus';
import { ZDROJE_NAD_SEKCEMI, pridejZivou } from '../../services/zivotSekci';
import { oknaSekci } from '../../services/oknaSekci';

/**
 * Sekce, které přepnutím nezmizí.
 *
 * Dosud se vykreslovala jen ta jedna, na kterou ses díval, a přepnutí tu
 * předchozí odmontovalo. S ní zmizel celý její stav: načtené stopy
 * v editoru, naťukaný cvik, rozdělaný mix, rozepsaná tabulatura. Vracet
 * se do sekce znamenalo začínat znovu.
 *
 * Tady zůstávají připojené a jen se schovávají. React jim tím nechá
 * stav i vše, co si drží v paměti — včetně rámů s cizími službami, které
 * by se jinak načítaly od začátku.
 *
 * Schovává se `display: none`, ne odpojením ze stromu. Rozdíl je zásadní:
 * `display: none` nechá komponentu žít, zatímco odmontování ji zahodí.
 * Nastavuje se stylem, ne atributem `hidden` — ten by kterákoli třída
 * s `display` přebila a sekce by se překreslovaly přes sebe.
 *
 * Sekce se připojují až při prvním otevření. Postavit všechny dopředu by
 * protáhlo start o věci, které třeba nikdo neotevře, a některé si při
 * připojení sahají do databáze nebo staví zvukový řetěz.
 *
 * Plocha s okny si sekce nevykresluje sama — nechá si je sem přestěhovat
 * portálem. Kdyby si je vykreslila po svém, existovala by každá sekce
 * dvakrát: dva zvukové řetězce, dva rámy s cizí službou. A přepnutí mezi
 * celou obrazovkou a plochou by znamenalo, že se jedna z těch dvojic
 * postaví znovu — tedy zase ztráta rozdělané práce.
 */

interface Props<T extends string> {
  aktivni: T;
  obsah: Partial<Record<T, React.ReactNode>>;
}

export function ZiveSekce<T extends string>({ aktivni, obsah }: Props<T>) {
  const [zive, setZive] = useState<readonly T[]>(() => (obsah[aktivni] ? [aktivni] : []));

  /*
   * Okna se otevírají a zavírají mimo React.
   *
   * Návratová hodnota se nepoužívá — jde jen o to, aby se komponenta
   * překreslila, až se okno otevře nebo zavře, a sekce se do něj mohla
   * přestěhovat.
   */
  useSyncExternalStore(
    (f) => oknaSekci.subscribe(f),
    () => oknaSekci.pocet(),
    () => 0,
  );

  useEffect(() => {
    if (obsah[aktivni]) setZive((p) => pridejZivou(p, aktivni) as readonly T[]);
  }, [aktivni, obsah]);

  /*
   * Zvuk se při přepnutí předá.
   *
   * Schovaná sekce hraje dál — prohlížeč zvuk podle viditelnosti
   * neutlumí — takže bez tohohle by po pár přepnutích hrálo všechno
   * naráz. Spodní lišta přehrávače je výjimka, ta je schválně nad
   * sekcemi.
   *
   * Nedělá se to při prvním vykreslení: to by zastavilo zvuk spuštěný
   * ještě před otevřením aplikace do téhle sekce.
   */
  const prvni = useRef(true);
  useEffect(() => {
    if (prvni.current) { prvni.current = false; return; }
    audioBus.stopExcept(ZDROJE_NAD_SEKCEMI);
  }, [aktivni]);

  return (
    <>
      {zive.map((id) => {
        const okno = oknaSekci.dej(id);
        const videt = okno ? okno.kreslit : id === aktivni;

        // Schovaná sekce nemá co kreslit. Vlnovky a měřáky jedou na
        // `requestAnimationFrame`, který prohlížeč sám neuspí — počítaly
        // by dál a braly procesor zvuku.
        const telo = (
          <KresleniOkna.Provider value={videt}>
            {obsah[id]}
          </KresleniOkna.Provider>
        );

        // Sekce otevřená v okně se tam přestěhuje. Zůstává připojená
        // tady, takže se při zavření okna nepostaví znovu.
        if (okno?.kam) return <React.Fragment key={id}>{createPortal(telo, okno.kam)}</React.Fragment>;

        return (
          <div key={id} style={id === aktivni ? undefined : { display: 'none' }}>
            {telo}
          </div>
        );
      })}
    </>
  );
}
