import {
  NAZEV_KANALU, TEP_MS, TICHO_MS, Vystup, Zprava, platnaZprava,
} from './televize';

/**
 * Spojení mezi aplikací učitele a oknem na televizi.
 *
 * `BroadcastChannel`, ne `window.opener`: aplikace posílá
 * `Cross-Origin-Opener-Policy: same-origin`, a i když je televizní okno
 * na stejném původu, kanál nepotřebuje, aby okno otevřela zrovna tahle
 * záložka. Televize tak přežije i znovunačtení aplikace a naopak.
 *
 * Mezi okny stejného počítače to nejde přes síť, takže mezi kliknutím
 * a změnou na televizi není měřitelná prodleva.
 */

export interface StavTelevize {
  /** Co ovládání naposledy poslalo. */
  vystup: Vystup;
  /** Hlásí se televize? Když se odmlčí na déle než `TICHO_MS`, je pryč. */
  pripojena: boolean;
  celaObrazovka: boolean;
}

type Poslucha = (s: StavTelevize) => void;

let kanal: BroadcastChannel | null = null;
let stav: StavTelevize = { vystup: { druh: 'prazdno' }, pripojena: false, celaObrazovka: false };
let posledniTep = 0;
let hlidac: number | null = null;
const posluchaci = new Set<Poslucha>();

function oznam(zmena: Partial<StavTelevize>) {
  stav = { ...stav, ...zmena };
  posluchaci.forEach((f) => f(stav));
}

function posliZpravu(z: Zprava) {
  try { kanal?.postMessage(z); } catch { /* zavřený kanál; televize se zeptá sama */ }
}

export const televize = {
  /**
   * Zapne ovládání. Volá se jednou za život aplikace.
   *
   * Poslouchá, i když je nabídka zavřená — televize se může otevřít nebo
   * načíst znovu kdykoli a zeptá se, co má ukazovat.
   */
  spustOvladani(): void {
    if (kanal || typeof BroadcastChannel === 'undefined') return;
    kanal = new BroadcastChannel(NAZEV_KANALU);
    kanal.onmessage = (e) => {
      if (!platnaZprava(e.data)) return;
      if (e.data.typ === 'ahoj') {
        posliZpravu({ typ: 'vystup', vystup: stav.vystup });
      } else if (e.data.typ === 'zije') {
        posledniTep = Date.now();
        if (!stav.pripojena || stav.celaObrazovka !== e.data.celaObrazovka) {
          oznam({ pripojena: true, celaObrazovka: e.data.celaObrazovka });
        }
      }
    };
    hlidac = window.setInterval(() => {
      if (stav.pripojena && Date.now() - posledniTep > TICHO_MS) {
        oznam({ pripojena: false, celaObrazovka: false });
      }
    }, TEP_MS);
  },

  subscribe(f: Poslucha): () => void {
    posluchaci.add(f);
    f(stav);
    return () => { posluchaci.delete(f); };
  },

  getStav(): StavTelevize { return stav; },

  posli(vystup: Vystup): void {
    oznam({ vystup });
    posliZpravu({ typ: 'vystup', vystup });
  },

  /**
   * Otevře okno pro televizi.
   *
   * Na druhý displej ho prohlížeč sám nepřesune — bez zvláštního
   * povolení to neumí a Safari vůbec. Napoprvé se přetáhne myší, macOS si
   * pak pozici pamatuje. Vrací `false`, když okno zablokoval prohlížeč.
   */
  otevriOkno(): boolean {
    const okno = window.open('/?televize=1', 'neverlast-televize', 'popup,width=1280,height=720');
    return okno !== null;
  },

  /** Jen pro testy a úklid; aplikace ovládání nevypíná. */
  zastav(): void {
    if (hlidac !== null) clearInterval(hlidac);
    hlidac = null;
    kanal?.close();
    kanal = null;
  },
};

/**
 * Strana televize.
 *
 * Po připojení se zeptá, co ukazovat, a pak se každé dvě vteřiny hlásí,
 * aby ovládání vědělo, že okno žije a jestli je na celé obrazovce.
 */
export function pripojTelevizi(onVystup: (v: Vystup) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const k = new BroadcastChannel(NAZEV_KANALU);
  k.onmessage = (e) => {
    if (platnaZprava(e.data) && e.data.typ === 'vystup') onVystup(e.data.vystup);
  };
  const tep = () => {
    try {
      k.postMessage({ typ: 'zije', celaObrazovka: Boolean(document.fullscreenElement) } satisfies Zprava);
    } catch { /* nevadí */ }
  };
  k.postMessage({ typ: 'ahoj' } satisfies Zprava);
  tep();
  const casovac = window.setInterval(tep, TEP_MS);
  document.addEventListener('fullscreenchange', tep);
  return () => {
    clearInterval(casovac);
    document.removeEventListener('fullscreenchange', tep);
    k.close();
  };
}
