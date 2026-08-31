import { authService } from '../authService';

/**
 * Poslech hlasového příkazu.
 *
 * Dvě cesty, protože přepis běží jen tam, kde běží whisper — tedy na
 * Macu se serverem, ne na Vercelu. Kdo se připojí k tomu Macu, mluví
 * lokálně a nahrávka nikam neodchází. Ostatním zbývá rozpoznávání
 * vestavěné v prohlížeči, které zvuk posílá Googlu; appka to o sobě
 * musí říct nahlas, ne to schovat.
 */

export type Cesta = 'mistni' | 'prohlizec' | 'zadna';

export interface Moznosti {
  cesta: Cesta;
  /** Odchází zvuk mimo tvůj počítač? Rozhoduje o upozornění v aplikaci. */
  odesilaVen: boolean;
  duvod: string;
}

export interface Poslouchani {
  /** Ukončí poslech dřív, než doběhne sám. */
  zastav: () => void;
  vysledek: Promise<string>;
}

/** Nad tuhle délku už to není příkaz; drží odezvu na uzdě. */
const NEJDELSI_MS = 6000;

type Rozpoznavac = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function rozpoznavacProhlizece(): Rozpoznavac | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Kterou cestou se tady dá mluvit.
 *
 * Server se ptá jako první: když whisper má, je to lepší volba pro
 * soukromí i pro češtinu.
 */
export async function zjistiMoznosti(): Promise<Moznosti> {
  try {
    const token = authService.getCurrentSession()?.token;
    const r = await fetch('/api/hlas/moznosti', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (r.ok && (await r.json())?.mistni) {
      return { cesta: 'mistni', odesilaVen: false, duvod: 'Přepis běží na tomhle počítači.' };
    }
  } catch {
    /* server neodpověděl — zkusí se prohlížeč */
  }

  if (rozpoznavacProhlizece()) {
    return {
      cesta: 'prohlizec',
      odesilaVen: true,
      duvod: 'Rozpoznávání obstarává prohlížeč — nahrávka odchází Googlu.',
    };
  }

  return {
    cesta: 'zadna',
    odesilaVen: false,
    duvod: 'Tenhle prohlížeč rozpoznávání řeči neumí a server ho tu nemá.',
  };
}

/** Nahraje pár vteřin a nechá je přepsat na serveru. */
function poslouchejMistne(): Poslouchani {
  let zastavit = () => {};
  const vysledek = (async () => {
    const proud = await navigator.mediaDevices.getUserMedia({ audio: true });
    const nahravac = new MediaRecorder(proud);
    const kousky: Blob[] = [];
    nahravac.ondataavailable = (e) => { if (e.data.size) kousky.push(e.data); };

    const dobehlo = new Promise<void>((hotovo) => { nahravac.onstop = () => hotovo(); });
    nahravac.start();

    const casovac = setTimeout(() => { if (nahravac.state !== 'inactive') nahravac.stop(); }, NEJDELSI_MS);
    zastavit = () => { if (nahravac.state !== 'inactive') nahravac.stop(); };

    await dobehlo;
    clearTimeout(casovac);
    // Mikrofon se pouští hned, ať v liště nesvítí, že appka pořád poslouchá.
    for (const stopa of proud.getTracks()) stopa.stop();

    const zvuk = new Blob(kousky, { type: kousky[0]?.type || 'audio/webm' });
    const token = authService.getCurrentSession()?.token;
    const odpoved = await fetch('/api/hlas/prepis?pripona=webm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: await zvuk.arrayBuffer(),
    });
    const data = await odpoved.json().catch(() => ({}));
    if (!odpoved.ok) throw new Error(data.error || 'Přepis selhal.');
    return String(data.text || '');
  })();

  return { zastav: () => zastavit(), vysledek };
}

/** Nechá rozpoznávat prohlížeč. Zvuk odchází ven — volající to má říct. */
function poslouchejProhlizecem(): Poslouchani {
  const Rozpoznavac = rozpoznavacProhlizece();
  if (!Rozpoznavac) {
    return { zastav: () => {}, vysledek: Promise.reject(new Error('Prohlížeč rozpoznávání neumí.')) };
  }

  const r = new Rozpoznavac();
  r.lang = 'cs-CZ';
  r.interimResults = false;
  r.maxAlternatives = 1;

  const vysledek = new Promise<string>((hotovo, chyba) => {
    let text = '';
    r.onresult = (e: any) => { text = e.results?.[0]?.[0]?.transcript || ''; };
    r.onerror = (e: any) => chyba(new Error(`Rozpoznávání selhalo: ${e?.error || 'neznámá chyba'}`));
    r.onend = () => hotovo(text);
  });

  r.start();
  setTimeout(() => { try { r.stop(); } catch { /* už skončilo */ } }, NEJDELSI_MS);
  return { zastav: () => { try { r.stop(); } catch { /* už skončilo */ } }, vysledek };
}

export function poslouchej(cesta: Cesta): Poslouchani {
  if (cesta === 'mistni') return poslouchejMistne();
  if (cesta === 'prohlizec') return poslouchejProhlizecem();
  return { zastav: () => {}, vysledek: Promise.reject(new Error('Není čím poslouchat.')) };
}
