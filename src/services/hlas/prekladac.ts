import { authService } from '../authService';

/**
 * Překlad do angličtiny a přečtení nahlas.
 *
 * Přednost má překladač vestavěný v prohlížeči: běží na zařízení, nic
 * neposílá ven a nic nestojí. Není ale všude a při prvním použití si
 * stahuje model, takže se na něj čeká jen omezeně — než aby se kvůli
 * němu zaseklo psaní textu.
 *
 * Když není, doptá se server, kde překládá Gemini. To už je odeslání
 * textu ven, a volající to má říct nahlas.
 */

export type CestaPrekladu = 'prohlížeč' | 'server' | 'žádná';

/** Kolik se čeká na vestavěný překladač, než se to vzdá. */
const STROP_MS = 6000;

function scasovacem<T>(slib: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    slib.catch(() => null),
    new Promise<null>((hotovo) => setTimeout(() => hotovo(null), ms)),
  ]);
}

let vestavenyPrekladac: any = null;
let vestavenySelhal = false;

/**
 * Připraví vestavěný překladač, nebo řekne, že to nejde.
 *
 * Drží se mezi voláními: vyrobit ho pokaždé znovu by u každého řádku
 * textu znamenalo čekání, které nemá důvod se opakovat.
 */
async function pripravVestaveny(): Promise<any | null> {
  if (vestavenyPrekladac) return vestavenyPrekladac;
  if (vestavenySelhal) return null;

  const T = (self as any).Translator;
  if (typeof T === 'undefined') {
    vestavenySelhal = true;
    return null;
  }

  const dvojice = { sourceLanguage: 'cs', targetLanguage: 'en' };
  const stav = await scasovacem(T.availability(dvojice), STROP_MS);
  if (!stav || stav === 'unavailable') {
    vestavenySelhal = true;
    return null;
  }

  const hotovy = await scasovacem(T.create(dvojice), STROP_MS);
  if (!hotovy) {
    vestavenySelhal = true;
    return null;
  }
  vestavenyPrekladac = hotovy;
  return hotovy;
}

export interface VysledekPrekladu {
  text: string;
  cesta: CestaPrekladu;
}

/** Přeloží český text do angličtiny. */
export async function doAnglictiny(text: string): Promise<VysledekPrekladu> {
  const zdroj = text.trim();
  if (!zdroj) return { text: '', cesta: 'žádná' };

  const vestaveny = await pripravVestaveny();
  if (vestaveny) {
    const prelozeno = await scasovacem(vestaveny.translate(zdroj), STROP_MS * 2);
    if (prelozeno) return { text: String(prelozeno), cesta: 'prohlížeč' };
  }

  const token = authService.getCurrentSession()?.token;
  const odpoved = await fetch('/api/preklad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ text: zdroj, doJazyka: 'en' }),
  });
  const data = await odpoved.json().catch(() => ({}));
  if (!odpoved.ok) throw new Error(data.error || 'Překlad se nepodařil.');
  return { text: String(data.text || ''), cesta: 'server' };
}

/**
 * Přečte text anglicky.
 *
 * Hlasy prohlížeč načítá opožděně, takže se na ně chvíli počká —
 * bez toho by první přečtení sáhlo po českém hlase a anglická věta by
 * z něj vyšla k nepoznání.
 */
export async function prectiAnglicky(text: string): Promise<void> {
  if (!text.trim() || typeof speechSynthesis === 'undefined') return;

  const hlasy = await new Promise<SpeechSynthesisVoice[]>((hotovo) => {
    const uz = speechSynthesis.getVoices();
    if (uz.length) return hotovo(uz);
    const casovac = setTimeout(() => hotovo(speechSynthesis.getVoices()), 1500);
    speechSynthesis.addEventListener('voiceschanged', () => {
      clearTimeout(casovac);
      hotovo(speechSynthesis.getVoices());
    }, { once: true });
  });

  const veta = new SpeechSynthesisUtterance(text);
  veta.lang = 'en-US';
  const anglicky = hlasy.find((h) => /^en-US/i.test(h.lang)) || hlasy.find((h) => /^en/i.test(h.lang));
  if (anglicky) veta.voice = anglicky;
  speechSynthesis.cancel();
  speechSynthesis.speak(veta);
}

export function prestanCist(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
