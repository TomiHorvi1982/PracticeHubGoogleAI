/**
 * Mluvené odpovědi.
 *
 * Hlasové ovládání doteď jen poslouchalo. Na pódiu ale nejde koukat na
 * obrazovku a ověřovat, jestli příkaz prošel — odpověď musí přijít uchem.
 *
 * Staví se na `speechSynthesis`, které má prohlížeč vestavěné: zdarma,
 * bez závislosti, hlasy z počítače a funguje i bez sítě. Knihovny na
 * GitHubu, které tohle obalují (speak-tts), přidají balík a skoro nic
 * navíc; ty, které syntetizují vlastními modely (vits-web), stahují
 * desítky megabajtů kvůli větě „tempo sto padesát".
 *
 * Skládání vět je oddělené od mluvení, aby šlo ověřit bez prohlížeče.
 */

export interface StavOdpovedi {
  /** Mluvit? Vypnuté ovládání zůstává tiché. */
  zapnuto: boolean;
  /** 0–1. Na pódiu se hodí hlasitěji než doma. */
  hlasitost: number;
  /** Rychlost řeči; 1 je normální. */
  rychlost: number;
}

export const VYCHOZI_ODPOVED: StavOdpovedi = { zapnuto: true, hlasitost: 0.9, rychlost: 1.05 };

/**
 * Číslovka slovy tam, kde by číslice zněly divně.
 *
 * Syntéza čte „150" česky jako „sto padesát" jen občas — u některých
 * hlasů z toho vyjde „jedna pět nula". Tempo se proto skládá ručně.
 */
export function tempoSlovy(bpm: number): string {
  const n = Math.round(bpm);
  if (!Number.isFinite(n) || n <= 0) return 'neplatné tempo';
  return `${n} úderů za minutu`;
}

export type DruhOdpovedi =
  | { druh: 'provedeno'; co: string }
  | { druh: 'tempo'; bpm: number }
  | { druh: 'sekce'; nazev: string }
  | { druh: 'skladba'; nazev: string; interpret?: string }
  | { druh: 'nalezeno'; kolik: number; vyraz: string }
  | { druh: 'nerozumim'; slyseno?: string }
  | { druh: 'nezapojeno'; co: string }
  | { druh: 'chyba'; text: string };

/**
 * Věta, kterou appka odpoví.
 *
 * Krátce: na pódiu nikdo nechce poslouchat souvětí, chce vědět, jestli
 * to prošlo. Proto nanejvýš pár slov a bez zdvořilostí.
 */
export function vetaOdpovedi(o: DruhOdpovedi): string {
  switch (o.druh) {
    case 'provedeno':
      return o.co;
    case 'tempo':
      return `Tempo ${tempoSlovy(o.bpm)}.`;
    case 'sekce':
      return `Otevírám ${o.nazev}.`;
    case 'skladba':
      return o.interpret ? `${o.nazev}, ${o.interpret}.` : `${o.nazev}.`;
    case 'nalezeno':
      if (o.kolik === 0) return `Na „${o.vyraz}" jsem nic nenašel.`;
      if (o.kolik === 1) return `Jeden výsledek na „${o.vyraz}".`;
      if (o.kolik < 5) return `${o.kolik} výsledky na „${o.vyraz}".`;
      return `${o.kolik} výsledků na „${o.vyraz}".`;
    case 'nerozumim':
      return o.slyseno ? `Nerozumím: ${o.slyseno}.` : 'Nerozuměl jsem.';
    case 'nezapojeno':
      return `${o.co} tady zatím nejde.`;
    case 'chyba':
      return o.text;
    default:
      return '';
  }
}

/**
 * Vybere hlas.
 *
 * Přednost má čeština a hlas z počítače — ten mluví i bez sítě a bez
 * prodlevy. Když žádný český není, vezme se cokoli: špatná výslovnost
 * je pořád lepší než ticho.
 */
export function vyberHlas(hlasy: { lang: string; localService?: boolean; name: string }[]) {
  if (!hlasy.length) return null;
  const cesky = hlasy.filter((h) => /^cs/i.test(h.lang));
  const mistni = cesky.find((h) => h.localService);
  return mistni || cesky[0] || hlasy.find((h) => h.localService) || hlasy[0];
}

let stav: StavOdpovedi = { ...VYCHOZI_ODPOVED };

export function nastavOdpoved(z: Partial<StavOdpovedi>): void {
  stav = {
    zapnuto: z.zapnuto ?? stav.zapnuto,
    hlasitost: Math.max(0, Math.min(1, z.hlasitost ?? stav.hlasitost)),
    rychlost: Math.max(0.5, Math.min(2, z.rychlost ?? stav.rychlost)),
  };
}

export function stavOdpovedi(): StavOdpovedi { return { ...stav }; }

/**
 * Řekne odpověď nahlas.
 *
 * Předchozí věta se přeruší: když se příkazy sypou za sebou, poslední
 * je ta, která platí — dočítat tu předchozí by jen zdržovalo.
 */
export function rekni(o: DruhOdpovedi | string): void {
  if (!stav.zapnuto) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const text = typeof o === 'string' ? o : vetaOdpovedi(o);
  if (!text.trim()) return;

  try {
    const s = window.speechSynthesis;
    s.cancel();
    const v = new SpeechSynthesisUtterance(text);
    const hlas = vyberHlas(s.getVoices());
    if (hlas) v.voice = hlas as SpeechSynthesisVoice;
    v.lang = hlas?.lang || 'cs-CZ';
    v.volume = stav.hlasitost;
    v.rate = stav.rychlost;
    s.speak(v);
  } catch {
    // Syntéza není nutná k ničemu podstatnému — když neumí, mlčí se.
  }
}

/** Umlčí, co se zrovna říká. */
export function umlc(): void {
  try { window.speechSynthesis?.cancel(); } catch { /* nevadí */ }
}
