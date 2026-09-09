/**
 * Úpravy klipů v editoru stop.
 *
 * `waveform-playlist` umí klipy tahat po časové ose sám, jakmile se
 * zapne `ClipInteractionProvider`. Střih a prolínačky ale přes kontext
 * poskytovatele ven nevydává — hook `useClipSplitting` chce odkaz na
 * engine, ke kterému se zvenčí nedostaneme.
 *
 * Klip je naštěstí obyčejná data: kde na ose začíná, kolik z nahrávky
 * hraje a od kterého místa. Střih i prolínačka jsou tedy počty, ne
 * zásahy do zvuku — a počty se dají ověřit testem bez prohlížeče.
 *
 * Časy jsou tady ve vzorcích, protože v nich klip počítá i knihovna.
 * Převod na vteřiny dělá volající, který zná vzorkovací frekvenci.
 */

/**
 * Prolínačka tak, jak ji čte knihovna: délka ve **vteřinách**, ne ve
 * vzorcích, a druh křivky v poli `type`. Zbytek souboru počítá ve
 * vzorcích, takže právě tady se převádí — a je to jediné místo, kde se
 * ty dvě jednotky potkávají.
 */
export interface ProlinackaData {
  duration: number;
  type: string;
}

/** Jen to, co k úpravám potřebujeme. Zbytek klipu se nese beze změny. */
export interface KlipData {
  id: string;
  startSample: number;
  durationSamples: number;
  offsetSamples: number;
  sampleRate: number;
  fadeIn?: ProlinackaData;
  fadeOut?: ProlinackaData;
  [dalsi: string]: unknown;
}

export interface StopaData {
  id: string;
  clips: KlipData[];
  [dalsi: string]: unknown;
}

/** Kde klip na ose končí. */
export const konecKlipu = (k: KlipData): number => k.startSample + k.durationSamples;

/** Leží čas uvnitř klipu? Krajní body ne — z nich by vznikl prázdný kus. */
export function uvnitr(k: KlipData, vzorek: number): boolean {
  return vzorek > k.startSample && vzorek < konecKlipu(k);
}

/**
 * Rozstřihne klip v daném místě.
 *
 * Vzniknou dva klipy, které dohromady hrají přesně totéž co původní:
 * druhý začíná tam, kde první končí, a posune si `offset` do nahrávky
 * o tolik, kolik už první odehrál. Bez toho by se druhá půlka přehrála
 * od začátku souboru.
 *
 * Mimo klip nebo přesně na jeho kraji se nestříhá — vrátí se, co bylo.
 */
export function rozstrihni(klip: KlipData, vzorek: number, novéId: string): KlipData[] {
  if (!uvnitr(klip, vzorek)) return [klip];
  const prvniDelka = vzorek - klip.startSample;
  return [
    {
      ...klip,
      durationSamples: prvniDelka,
      // Konec prvního dílu je nový střih, ne původní doznění.
      fadeOut: undefined,
    },
    {
      ...klip,
      id: novéId,
      startSample: vzorek,
      durationSamples: klip.durationSamples - prvniDelka,
      offsetSamples: klip.offsetSamples + prvniDelka,
      fadeIn: undefined,
    },
  ];
}

/**
 * Rozstřihne stopu v daném čase.
 *
 * Stříhá se nanejvýš jeden klip — v jednom místě osy jich víc nad sebou
 * neleží.
 */
export function rozstrihniStopu(stopa: StopaData, vzorek: number, novéId: string): StopaData {
  let strihano = false;
  const clips = stopa.clips.flatMap((k) => {
    if (strihano || !uvnitr(k, vzorek)) return [k];
    strihano = true;
    return rozstrihni(k, vzorek, novéId);
  });
  return strihano ? { ...stopa, clips } : stopa;
}

/** Který klip leží v daném čase. `-1`, když žádný. */
export function klipVCase(stopa: StopaData, vzorek: number): number {
  return stopa.clips.findIndex((k) => vzorek >= k.startSample && vzorek < konecKlipu(k));
}

export type Prolinacka = 'in' | 'out';

/**
 * Nasadí prolínačku na kraj klipu.
 *
 * Delší prolínačka, než je klip sám, nedává smysl — ořízne se na jeho
 * délku. Nula ji sundá.
 */
export function nastavProlinacku(
  klip: KlipData,
  kde: Prolinacka,
  vterin: number,
  tvar: string = 'logarithmic',
): KlipData {
  const delkaKlipu = klip.durationSamples / klip.sampleRate;
  const omezene = Math.min(Math.max(0, vterin), delkaKlipu);
  const hodnota = omezene > 0 ? { duration: omezene, type: tvar } : undefined;
  return kde === 'in' ? { ...klip, fadeIn: hodnota } : { ...klip, fadeOut: hodnota };
}

/**
 * Posune klip po ose.
 *
 * Před nulu se nedostane: záporný začátek by knihovna počítala jako
 * čas před začátkem skladby a klip by zmizel.
 */
export function posunKlip(klip: KlipData, oVzorku: number): KlipData {
  return { ...klip, startSample: Math.max(0, klip.startSample + oVzorku) };
}

/** Smaže klip ze stopy. */
export function smazKlip(stopa: StopaData, klipId: string): StopaData {
  return { ...stopa, clips: stopa.clips.filter((k) => k.id !== klipId) };
}

/** Nejzazší konec ze všech stop — délka celé skladby ve vzorcích. */
export function delkaVzorku(stopy: StopaData[]): number {
  return stopy.reduce(
    (max, s) => s.clips.reduce((m, k) => Math.max(m, konecKlipu(k)), max),
    0,
  );
}
