/**
 * PKCE — ověření přihlášení bez tajného klíče v prohlížeči.
 *
 * Vyčleněno z `tone3000Api.ts`, protože totéž teď potřebuje i přihlášení
 * ke Spotify. Obě služby jedou podle RFC 7636 a dvě kopie téhož kódu by
 * se časem rozešly — a u kryptografie se to pozná až tím, že přihlášení
 * přestane fungovat.
 */

const ABECEDA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Náhodný `code_verifier`.
 *
 * Podle RFC 7636 má být 43–128 znaků z nevyhrazené abecedy. Bereme 64,
 * a z `crypto.getRandomValues` — `Math.random` se na tohle nehodí.
 */
export function nahodnyVerifier(delka = 64): string {
  const b = new Uint8Array(delka);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += ABECEDA[x % ABECEDA.length];
  return s;
}

/** Base64url bez výplně — tvar, který OAuth čeká. */
export function base64url(data: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(data)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `code_challenge` = base64url(SHA-256(verifier)), metoda S256. */
export async function vyzvaZVerifieru(verifier: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(h);
}
