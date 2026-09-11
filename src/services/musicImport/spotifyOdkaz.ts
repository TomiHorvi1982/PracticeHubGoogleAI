/**
 * Rozbor odkazu na Spotify.
 *
 * Inspirované `parse_query` ze spotDL, ale přísnější. spotDL rozhoduje
 * podmínkou `"open.spotify.com" in url and "track" in url`, takže mu
 * projde i `open.spotify.com.podvrh.cz/track` nebo playlist, který má
 * v názvu slovo „track". Tady se adresa rozebere jako adresa: hostitel
 * musí sedět přesně a druh obsahu se čte z cesty, ne hledáním podřetězce.
 *
 * Co člověk ze Spotify dostane do schránky:
 *
 *   https://open.spotify.com/track/ID?si=…         tlačítko „Sdílet"
 *   https://open.spotify.com/intl-cs/album/ID       lokalizovaná verze webu
 *   https://open.spotify.com/embed/playlist/ID      kód pro vložení
 *   spotify:track:ID                                desktopová aplikace
 *   https://spotify.link/…                          zkrácený odkaz z mobilu
 *
 * Zkrácený odkaz se tady rozebrat nedá — kam vede, ví jen Spotify.
 * Vrací se proto zvlášť a rozbalí ho server.
 */

export type DruhZdroje = 'track' | 'album' | 'playlist' | 'artist';

export interface OdkazSpotify {
  druh: DruhZdroje;
  id: string;
  /** Kanonická podoba bez sledovacích parametrů a jazykové předpony. */
  url: string;
}

export type RozborOdkazu =
  | { stav: 'ok'; odkaz: OdkazSpotify }
  | { stav: 'kratky'; adresa: string }
  | { stav: 'chyba'; kod: 'INVALID_URL' | 'UNSUPPORTED_SOURCE'; detail: string };

/** Identifikátor Spotify: 22 znaků base62. */
const ID = /^[0-9A-Za-z]{22}$/;

const PODPOROVANE: readonly DruhZdroje[] = ['track', 'album', 'playlist', 'artist'];

/** Hostitelé zkrácených odkazů z mobilní aplikace. */
const KRATKE = new Set(['spotify.link', 'spotify.app.link']);

/** Hostitelé, na kterých leží obsah. `play.` je stará adresa, dodnes přesměrovává. */
const OBSAH = new Set(['open.spotify.com', 'play.spotify.com']);

const chyba = (kod: 'INVALID_URL' | 'UNSUPPORTED_SOURCE', detail: string): RozborOdkazu =>
  ({ stav: 'chyba', kod, detail });

function zDruhu(druh: string, id: string): RozborOdkazu {
  const d = druh.toLowerCase();
  if (!(PODPOROVANE as readonly string[]).includes(d)) {
    return chyba('UNSUPPORTED_SOURCE', `Spotify „${d}" se importovat nedá.`);
  }
  if (!ID.test(id)) return chyba('INVALID_URL', `Neplatný identifikátor: ${id}`);
  return { stav: 'ok', odkaz: { druh: d as DruhZdroje, id, url: `https://open.spotify.com/${d}/${id}` } };
}

export function rozeberOdkaz(vstup: string): RozborOdkazu {
  const text = (vstup || '').trim();
  if (!text) return chyba('INVALID_URL', 'Prázdný vstup.');

  // URI z desktopové aplikace: spotify:track:ID, i starý tvar s uživatelem.
  const uri = text.match(/^spotify:([a-z]+):([0-9A-Za-z]{22})$/i);
  if (uri) return zDruhu(uri[1], uri[2]);
  const staryUri = text.match(/^spotify:user:[^:]+:playlist:([0-9A-Za-z]{22})$/i);
  if (staryUri) return zDruhu('playlist', staryUri[1]);
  if (/^spotify:/i.test(text)) return chyba('UNSUPPORTED_SOURCE', 'Tenhle tvar odkazu Spotify neznám.');

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return chyba('INVALID_URL', 'Nedá se přečíst jako adresa.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return chyba('INVALID_URL', `Protokol ${url.protocol} se nepoužívá.`);
  }

  const hostitel = url.hostname.toLowerCase();
  if (KRATKE.has(hostitel)) return { stav: 'kratky', adresa: `https://${hostitel}${url.pathname}` };
  if (!OBSAH.has(hostitel)) return chyba('INVALID_URL', `Adresa nevede na Spotify (${hostitel}).`);

  let casti = url.pathname.split('/').filter(Boolean);
  // Jazyková předpona je jen první úsek cesty, nikde jinde.
  if (casti[0] && /^intl-[a-z]{2}(-[a-z]{2})?$/i.test(casti[0])) casti = casti.slice(1);
  if (casti[0] === 'embed') casti = casti.slice(1);

  // Starý tvar playlistu: /user/{uživatel}/playlist/{id}
  if (casti[0] === 'user' && casti[2] === 'playlist' && casti[3]) return zDruhu('playlist', casti[3]);

  if (casti.length < 2) {
    return casti[0]
      ? chyba('UNSUPPORTED_SOURCE', `Spotify „${casti[0]}" se importovat nedá.`)
      : chyba('INVALID_URL', 'V adrese chybí, co se má importovat.');
  }
  return zDruhu(casti[0], casti[1]);
}

/**
 * Vypadá vstup jako odkaz, nebo jako hledaný výraz?
 *
 * Jedno pole slouží pro obojí. „Metallica One" je hledání, cokoli se
 * Spotify v názvu nebo s protokolem je pokus o odkaz — a pokud je
 * rozbitý, má se to člověku říct, ne to tiše začít hledat.
 */
export function vypadaJakoOdkaz(vstup: string): boolean {
  const t = (vstup || '').trim().toLowerCase();
  return /^spotify:/.test(t) || /^[a-z]+:\/\//.test(t) || /(^|\.)spotify\.(com|link|app\.link)\b/.test(t);
}
