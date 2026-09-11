import test from 'node:test';
import assert from 'node:assert/strict';

import { rozeberOdkaz, vypadaJakoOdkaz } from './spotifyOdkaz';

// Identifikátory z dokumentace Spotify — 22 znaků base62.
const T = '4iV5W9uYEdYUVa79Axb7Rh';
const A = '4aawyAB9vmqN3uQ7FjRGTy';
const P = '3cEYpjA9oz9GiPac4AsH4n';
const R = '0TnOYISbd1XYRBk9myaseg';

const ok = (vstup: string) => {
  const r = rozeberOdkaz(vstup);
  assert.equal(r.stav, 'ok', `${vstup} → ${JSON.stringify(r)}`);
  return (r as Extract<typeof r, { stav: 'ok' }>).odkaz;
};
const chyba = (vstup: string) => {
  const r = rozeberOdkaz(vstup);
  assert.equal(r.stav, 'chyba', `${vstup} → ${JSON.stringify(r)}`);
  return (r as Extract<typeof r, { stav: 'chyba' }>).kod;
};

test('odkaz z tlačítka Sdílet se očistí od sledování', () => {
  const o = ok(`https://open.spotify.com/track/${T}?si=a1b2c3d4e5f6`);
  assert.deepEqual(o, { druh: 'track', id: T, url: `https://open.spotify.com/track/${T}` });
});

test('všechny čtyři druhy obsahu', () => {
  assert.equal(ok(`https://open.spotify.com/track/${T}`).druh, 'track');
  assert.equal(ok(`https://open.spotify.com/album/${A}`).druh, 'album');
  assert.equal(ok(`https://open.spotify.com/playlist/${P}`).druh, 'playlist');
  assert.equal(ok(`https://open.spotify.com/artist/${R}`).druh, 'artist');
});

test('jazyková verze webu a kód pro vložení', () => {
  assert.equal(ok(`https://open.spotify.com/intl-cs/album/${A}`).id, A);
  assert.equal(ok(`https://open.spotify.com/intl-pt-BR/track/${T}`).id, T);
  assert.equal(ok(`https://open.spotify.com/embed/playlist/${P}?utm_source=generator`).id, P);
});

test('URI z desktopové aplikace, i starý tvar', () => {
  assert.equal(ok(`spotify:track:${T}`).druh, 'track');
  assert.equal(ok(`spotify:user:nekdo:playlist:${P}`).id, P);
  assert.equal(ok(`https://open.spotify.com/user/nekdo/playlist/${P}`).id, P);
});

test('adresa bez protokolu a stará doména', () => {
  assert.equal(ok(`open.spotify.com/track/${T}`).id, T);
  assert.equal(ok(`https://play.spotify.com/album/${A}`).id, A);
});

test('zkrácený odkaz z mobilu se pozná, rozbalí ho server', () => {
  assert.deepEqual(rozeberOdkaz('https://spotify.link/AbCdEf123?si=x'), {
    stav: 'kratky',
    adresa: 'https://spotify.link/AbCdEf123',
  });
});

test('podvržená doména neprojde', () => {
  /*
   * spotDL rozhoduje podmínkou `"open.spotify.com" in url` — tahle adresa
   * by mu prošla. Tady se kontroluje hostitel celý.
   */
  assert.equal(chyba(`https://open.spotify.com.podvrh.cz/track/${T}`), 'INVALID_URL');
  assert.equal(chyba(`https://podvrh.cz/open.spotify.com/track/${T}`), 'INVALID_URL');
});

test('cizí web a divné protokoly', () => {
  assert.equal(chyba(`https://soundcloud.com/track/${T}`), 'INVALID_URL');
  assert.equal(chyba(`ftp://open.spotify.com/track/${T}`), 'INVALID_URL');
  assert.equal(chyba('javascript:alert(1)'), 'INVALID_URL');
});

test('podcasty a profily se neimportují', () => {
  assert.equal(chyba(`https://open.spotify.com/episode/${T}`), 'UNSUPPORTED_SOURCE');
  assert.equal(chyba(`https://open.spotify.com/show/${T}`), 'UNSUPPORTED_SOURCE');
  assert.equal(chyba(`spotify:episode:${T}`), 'UNSUPPORTED_SOURCE');
  assert.equal(chyba('https://open.spotify.com/user/nekdo'), 'UNSUPPORTED_SOURCE');
});

test('rozbité nebo prázdné', () => {
  assert.equal(chyba(''), 'INVALID_URL');
  assert.equal(chyba('   '), 'INVALID_URL');
  assert.equal(chyba('https://open.spotify.com/track/kratke'), 'INVALID_URL');
  assert.equal(chyba('https://open.spotify.com/'), 'INVALID_URL');
});

test('pole slouží pro odkaz i hledání', () => {
  assert.equal(vypadaJakoOdkaz('Metallica One'), false);
  assert.equal(vypadaJakoOdkaz('AC/DC Back in Black'), false);
  assert.equal(vypadaJakoOdkaz(`open.spotify.com/track/${T}`), true);
  assert.equal(vypadaJakoOdkaz(`spotify:track:${T}`), true);
  assert.equal(vypadaJakoOdkaz('https://cokoli.cz'), true, 'rozbitý odkaz se má ohlásit, ne hledat');
  assert.equal(vypadaJakoOdkaz('spotify.link/abc'), true);
});
