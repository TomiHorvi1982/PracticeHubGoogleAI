import { supabase } from './supabaseClient';

/**
 * Zvuková banka pro přehrávač Guitar Pro tabulatur.
 *
 * alphaTab hraje přes soundfont. Ten, který si s sebou nese (sonivox,
 * 1,3 MB), je nejmenší možná GM banka — zkreslená kytara i bicí z ní znějí
 * jako vyzvánění. Appka proto používá vlastní, výrazně větší banku
 * nahranou v Storage (`scripts/upload-soundfont.ts`).
 *
 * Ta má ale 38 MB, takže se nesmí tahat při každém otevření tabulatury.
 * Stáhne se jednou a uloží do IndexedDB; podepsaný odkaz se pokaždé liší,
 * takže na cache prohlížeče spoléhat nejde a musíme si ji držet sami.
 *
 * Když cokoliv z toho selže, přehrávač si poradí — spadne zpátky na
 * vestavěnou banku, takže tabulatura hraje vždycky, jen hůř.
 */

const STORAGE_BUCKET = 'assets';
const STORAGE_PATH = 'global/soundfonts/tab-player.sf3';

const DB_NAME = 'neverlate-tab-soundfont';
const DB_VERSION = 1;
const STORE = 'banks';

/** Klíč v cache. Změna verze zneplatní staré banky, aniž by se musely mazat ručně. */
const CACHE_KEY = `${STORAGE_PATH}#v1`;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readCache(): Promise<Uint8Array | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(CACHE_KEY);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v instanceof ArrayBuffer ? new Uint8Array(v) : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeCache(bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      // Uloží se ArrayBuffer, ne Uint8Array — structured clone by jinak u
      // pohledu do sdílené paměti mohl uložit i offset, na kterém nezáleží.
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      tx.objectStore(STORE).put(buf, CACHE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve(); // typicky došlo místo — banka prostě není v cache
    } catch {
      resolve();
    }
  });
}

/** Rozdělaná stahování se sdílejí, ať dvě otevřené tabulatury netáhnou 38 MB dvakrát. */
let inFlight: Promise<Uint8Array | null> | null = null;

async function download(): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(STORAGE_PATH, 60 * 30);
  if (error || !data?.signedUrl) {
    console.warn('[tabSoundfont] Podepsaný odkaz se nepodařilo získat:', error?.message);
    return null;
  }

  const res = await fetch(data.signedUrl);
  if (!res.ok) {
    console.warn(`[tabSoundfont] Stažení selhalo: HTTP ${res.status}`);
    return null;
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  // „RIFF" na začátku — jinak jsme místo banky stáhli chybovou stránku.
  if (bytes.length < 4 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF') {
    console.warn('[tabSoundfont] Stažený soubor není soundfont.');
    return null;
  }
  return bytes;
}

/**
 * Vrátí bajty zvukové banky, nebo `null`, když není k dispozici — volající
 * pak nechá hrát vestavěnou. Nikdy nevyhazuje: špatný zvuk je přijatelný,
 * rozbitá tabulatura ne.
 */
export async function loadTabSoundfont(): Promise<Uint8Array | null> {
  try {
    const cached = await readCache();
    if (cached) return cached;

    if (!inFlight) {
      inFlight = download().finally(() => {
        inFlight = null;
      });
    }
    const bytes = await inFlight;
    if (bytes) void writeCache(bytes);
    return bytes;
  } catch (e) {
    console.warn('[tabSoundfont] Nepodařilo se načíst zvukovou banku:', e);
    return null;
  }
}
