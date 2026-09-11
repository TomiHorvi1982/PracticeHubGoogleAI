/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Atribut `credentialless` na `<iframe>`.
 *
 * Typy Reactu ho neznají — je to novější věc, kterou zatím neumí všechny
 * prohlížeče. Potřebujeme ho, protože aplikace běží cross-origin
 * izolovaná kvůli openDAW a bez něj by prohlížeč zablokoval každý cizí
 * rám: YouTube, TONE3000 i Freetar.
 *
 * Deklaruje se jako řetězec, ne `boolean`: React by `credentialless={true}`
 * vykreslil jako `credentialless="true"`, kdežto `false` by atribut
 * nevynechal, ale napsal `credentialless="false"` — a to je podle HTML
 * pořád zapnuté, protože u logických atributů rozhoduje přítomnost, ne
 * hodnota. Prázdný řetězec je proto jediný zápis, který znamená to, co
 * vypadá, že znamená.
 */
declare namespace React {
  interface IframeHTMLAttributes<T> {
    credentialless?: '';
  }
}
