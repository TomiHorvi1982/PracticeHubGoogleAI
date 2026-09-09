import { STANDARDNI_LADENI, Tonu, midiNaPrazci } from './cvikyTechnik';
import { TRID, chromaZeSpektra, ohodnot, zarovnej } from './porovnaniHry';
import { SnimkyNastaveni, VYCHOZI_SNIMKY, snimekVterin, snimkySpektra } from './spektrum';

/**
 * Samokontrola domácího úkolu.
 *
 * Úkol „zahraj tohle na osmdesát" se dá ověřit sám: dítě to nahraje,
 * aplikace porovná, co zahrálo, s tím, co mělo — a učiteli se v přehledu
 * ukáže, kdo doopravdy cvičil.
 *
 * Předloha se nesyntetizuje.
 *
 * Nabízelo by se cvik přehrát do `OfflineAudioContext` a porovnat dvě
 * nahrávky, jenže to by znamenalo tahat zvukovou banku jen kvůli měření
 * a výsledek by záležel na tom, který nástroj je zrovna načtený. Cvik je
 * přitom posloupnost známých tónů, takže se chroma předlohy spočítá
 * rovnou z nich: jeden tón je jedna třída, a to je celé.
 *
 * Zarovnání i hodnocení dělá `porovnaniHry` — týž kód, kterým se
 * porovnává hra s oddělenou stopou. Bez prohlížeče, aby šlo ověřit testem.
 */

export interface VysledekKontroly {
  /** Shoda tónů, 0 až 1. */
  tony: number;
  /** Typický rozptyl časování v milisekundách. */
  rozptylMs: number;
  /** Kolik procent to celkově sedí — jedno číslo pro dítě. */
  procenta: number;
  /** Byl to pokus, který se dá vůbec měřit? */
  merÍtelne: boolean;
}

/**
 * Chroma předlohy z tónů cviku.
 *
 * Každý tón zabírá tolik snímků, kolik jich vyjde na jeho délku. Osmina
 * schválně: v téhle délce se cviky přehrávají i v Procvičování, takže se
 * měří totéž, co dítě slyšelo.
 */
export function predlohaZTonu(
  tony: Tonu[],
  bpm: number,
  vzorkovaci: number,
  nastaveni: SnimkyNastaveni = VYCHOZI_SNIMKY,
): Float32Array[] {
  const snimek = snimekVterin(vzorkovaci, nastaveni);
  const delkaTonu = 30 / Math.max(20, bpm);          // osmina ve vteřinách
  const snimkuNaTon = Math.max(1, Math.round(delkaTonu / snimek));

  const ramce: Float32Array[] = [];
  for (const t of tony) {
    const midi = midiNaPrazci(t.struna, t.prazec, STANDARDNI_LADENI);
    const trida = ((midi % TRID) + TRID) % TRID;
    for (let i = 0; i < snimkuNaTon; i++) {
      const r = new Float32Array(TRID);
      r[trida] = 1;
      ramce.push(r);
    }
  }
  return ramce;
}

/**
 * Kolik procent to sedí.
 *
 * Tóny váží víc než časování: dítě, které hraje správné tóny s kolísavým
 * rytmem, je dál než to, které drží tempo a mačká vedle. Rozptyl nad
 * čtvrt vteřiny už se nepočítá vůbec — to není nepřesnost, to je jiná
 * skladba.
 */
export function naProcenta(tony: number, rozptylMs: number): number {
  const casovani = Math.max(0, 1 - rozptylMs / 250);
  return Math.round((tony * 0.7 + casovani * 0.3) * 100);
}

/**
 * Porovná nahrávku dítěte s cvikem.
 *
 * Krátká nebo tichá nahrávka se neznámkuje: nula procent by vypadala
 * jako „hraješ špatně", ačkoli se jen nic nenahrálo.
 */
export function zkontrolujCvik(
  nahravka: Float32Array,
  tony: Tonu[],
  bpm: number,
  vzorkovaci: number,
  nastaveni: SnimkyNastaveni = VYCHOZI_SNIMKY,
): VysledekKontroly {
  const ticho = { tony: 0, rozptylMs: 0, procenta: 0, merÍtelne: false };
  if (!tony.length || nahravka.length < vzorkovaci * 0.5) return ticho;

  // Špička pod tímhle je ticho, ne hra. Mikrofon šumí i v prázdném pokoji.
  let spicka = 0;
  for (let i = 0; i < nahravka.length; i++) spicka = Math.max(spicka, Math.abs(nahravka[i]));
  if (spicka < 0.01) return ticho;

  const moje = snimkySpektra(nahravka, nastaveni).map((m) => chromaZeSpektra(m, vzorkovaci));
  if (moje.length < 4) return ticho;

  const predloha = predlohaZTonu(tony, bpm, vzorkovaci, nastaveni);
  const z = zarovnej(moje, predloha);
  const h = ohodnot(z, snimekVterin(vzorkovaci, nastaveni));

  return {
    tony: h.tony,
    rozptylMs: h.rozptylMs,
    procenta: naProcenta(h.tony, h.rozptylMs),
    merÍtelne: true,
  };
}

/**
 * Slovní hodnocení.
 *
 * Devítileté dítě si z „73 %" neodnese nic. Věta ano — a hlavně říká,
 * co dělat dál.
 */
export function slovy(v: VysledekKontroly): string {
  if (!v.merÍtelne) return 'Nic jsem neslyšel. Zkontroluj mikrofon a zkus to znovu.';
  if (v.procenta >= 85) return 'Sedí to! Tohle můžeš odevzdat.';
  if (v.procenta >= 65) return 'Skoro. Zkus to ještě jednou, pomaleji a čistěji.';
  if (v.rozptylMs > 150) return 'Tóny máš, ale utíká ti tempo. Pusť si k tomu metronom.';
  return 'Zatím to nesedí. Projdi si cvik po tónech a zpomal.';
}
