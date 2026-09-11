import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API, OmezovacDotazu, SpotifyKlient, TOKEN_URL, konfigZProstredi, platnyTokenUzivatele,
} from './spotify';

/* Falešné Spotify. Odpovědi jsou ve tvaru Web API, žádná síť ani zvuk. */

const KONFIG = { clientId: 'klient', clientSecret: 'tajne' };
const T = '4iV5W9uYEdYUVa79Axb7Rh';
const A = '4aawyAB9vmqN3uQ7FjRGTy';
const P = '3cEYpjA9oz9GiPac4AsH4n';
const R = '0TnOYISbd1XYRBk9myaseg';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

type Obsluha = (init: RequestInit | undefined, url: string) => Response | Promise<Response>;

function spotify(trasy: Record<string, Obsluha>) {
  const volani: { url: string; init?: RequestInit }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    volani.push({ url, init });
    const cesta = url.startsWith(API) ? url.slice(API.length) : url;
    const obsluha =
      trasy[url] ?? trasy[cesta] ??
      Object.entries(trasy).find(([k]) => k.endsWith('*') && cesta.startsWith(k.slice(0, -1)))?.[1] ??
      (url === TOKEN_URL ? () => json({ access_token: 'token-aplikace', expires_in: 3600 }) : undefined);
    if (!obsluha) return json({ error: { status: 404, message: 'Not found' } }, 404);
    return obsluha(init, url);
  };
  const spanky: number[] = [];
  const klient = (o: { ted?: () => number } = {}) =>
    new SpotifyKlient(KONFIG, { fetch: f, spanek: async (ms) => { spanky.push(ms); }, ...o });
  return {
    klient,
    volani,
    spanky,
    tokenu: () => volani.filter((v) => v.url === TOKEN_URL).length,
    na: (kus: string) => volani.filter((v) => v.url.includes(kus)),
  };
}

const skladba = (id = T, o: Record<string, unknown> = {}) => ({
  id, type: 'track', name: 'One', duration_ms: 446_000, artists: [{ name: 'Metallica' }],
  album: { name: 'Justice', artists: [{ name: 'Metallica' }], release_date: '1988', images: [] },
  external_urls: { spotify: `https://open.spotify.com/track/${id}` }, ...o,
});

const hlavicka = (init: RequestInit | undefined, jmeno: string) =>
  new Headers(init?.headers as HeadersInit).get(jmeno);

test('token aplikace se vyžádá jednou a správně', async () => {
  const sp = spotify({ [`/tracks/${T}`]: () => json(skladba()), [`/tracks/${A}`]: () => json(skladba(A)) });
  const k = sp.klient();
  await k.skladba(T);
  await k.skladba(A);
  assert.equal(sp.tokenu(), 1);
  const tokenove = sp.volani.find((v) => v.url === TOKEN_URL)!;
  assert.equal(hlavicka(tokenove.init, 'authorization'), `Basic ${Buffer.from('klient:tajne').toString('base64')}`);
  assert.equal(tokenove.init?.body, 'grant_type=client_credentials');
  assert.equal(hlavicka(sp.na(`/tracks/${T}`)[0].init, 'authorization'), 'Bearer token-aplikace');
});

test('souběžné dotazy si token nežádají každý zvlášť', async () => {
  const sp = spotify({ [`/tracks/${T}`]: () => json(skladba()), [`/tracks/${A}`]: () => json(skladba(A)) });
  const k = sp.klient();
  await Promise.all([k.skladba(T), k.skladba(A)]);
  assert.equal(sp.tokenu(), 1);
});

test('stejný dotaz jde z mezipaměti', async () => {
  const sp = spotify({ [`/tracks/${T}`]: () => json(skladba()) });
  const k = sp.klient();
  await k.skladba(T);
  await k.skladba(T);
  assert.equal(sp.na(`/tracks/${T}`).length, 1);
});

test('přetížení: počká podle Retry-After a zkusí znovu', async () => {
  let prvni = true;
  const sp = spotify({
    [`/tracks/${T}`]: () => {
      if (prvni) { prvni = false; return json({}, 429, { 'retry-after': '2' }); }
      return json(skladba());
    },
  });
  const k = await sp.klient().skladba(T);
  assert.equal(k.skladby[0].title, 'One');
  assert.deepEqual(sp.spanky, [2000]);
});

test('trvalé přetížení skončí RATE_LIMITED', async () => {
  const sp = spotify({ [`/tracks/${T}`]: () => json({}, 429, { 'retry-after': '1' }) });
  await assert.rejects(sp.klient().skladba(T), (e: any) => e.kod === 'RATE_LIMITED');
});

test('vypršelý token aplikace se obnoví jednou', async () => {
  let pokus = 0;
  const sp = spotify({ [`/tracks/${T}`]: () => (++pokus === 1 ? json({}, 401) : json(skladba())) });
  await sp.klient().skladba(T);
  assert.equal(sp.tokenu(), 2);
});

test('neexistující skladba a album mají vlastní hlášky', async () => {
  const sp = spotify({});
  await assert.rejects(sp.klient().skladba(T), (e: any) => e.kod === 'TRACK_NOT_FOUND');
  await assert.rejects(sp.klient().album(A), (e: any) => e.kod === 'TRACK_NOT_FOUND' && /album/.test(e.message));
});

test('špatné klíče aplikace', async () => {
  const sp = spotify({ [TOKEN_URL]: () => json({ error: 'invalid_client' }, 400) });
  await assert.rejects(sp.klient().skladba(T), (e: any) => e.kod === 'SPOTIFY_NOT_CONFIGURED' && /invalid_client/.test(e.technicky));
});

test('výpadek sítě: dva pokusy navíc, pak chyba', async () => {
  let pokusu = 0;
  const f = async (url: string) => {
    if (url === TOKEN_URL) return json({ access_token: 't', expires_in: 3600 });
    pokusu++;
    throw new TypeError('fetch failed');
  };
  const k = new SpotifyKlient(KONFIG, { fetch: f, spanek: async () => {} });
  await assert.rejects(k.skladba(T), (e: any) => e.kod === 'SPOTIFY_API_ERROR' && /fetch failed/.test(e.technicky));
  assert.equal(pokusu, 3);
});

test('album dotáhne další stránky skladeb', async () => {
  const stopa = (id: string, n: number) => ({ id, type: 'track', name: `Stopa ${n}`, duration_ms: 1000, artists: [{ name: 'Sepultura' }] });
  const sp = spotify({
    [`/albums/${A}`]: () => json({
      id: A, name: 'Roots', artists: [{ name: 'Sepultura' }], total_tracks: 2, images: [],
      tracks: { items: [stopa('a0000000000000000000a1', 1)], next: `${API}/albums/${A}/tracks?offset=1&limit=1` },
    }),
    [`/albums/${A}/tracks*`]: () => json({ items: [stopa('a0000000000000000000a2', 2)], next: null }),
  });
  const k = await sp.klient().album(A);
  assert.deepEqual(k.skladby.map((s) => s.title), ['Stopa 1', 'Stopa 2']);
  assert.equal(k.skladby[1].album, 'Roots');
});

test('odkaz next mimo Spotify se nenásleduje', async () => {
  // Server nesmí jít tam, kam mu řekne cizí odpověď.
  const sp = spotify({
    [`/albums/${A}`]: () => json({ id: A, name: 'X', tracks: { items: [], next: 'https://zlo.example/ukradni' } }),
  });
  await assert.rejects(sp.klient().album(A), (e: any) => e.kod === 'SPOTIFY_API_ERROR' && /odmítnutá adresa/.test(e.technicky));
  assert.equal(sp.na('zlo.example').length, 0);
});

test('playlist bez přihlášení: jen hlavička a vysvětlení', async () => {
  const sp = spotify({ [`/playlists/${P}`]: () => json({ id: P, name: 'Zkouška', items: { total: 12 } }) });
  const v = await sp.klient().playlist(P);
  assert.equal(v.kolekce.obsahNedostupny, true);
  assert.equal(v.kolekce.celkem, 12);
  assert.equal(v.upozorneni?.kod, 'SPOTIFY_LOGIN_REQUIRED');
  assert.equal(sp.na('/items').length, 0, 'na skladby se bez přihlášení vůbec nesahá');
});

test('vlastní playlist: skladby přes /items s tokenem uživatele', async () => {
  const sp = spotify({
    [`/playlists/${P}`]: () => json({ id: P, name: 'Zkouška', items: { total: 1 } }),
    [`/playlists/${P}/items*`]: () => json({ items: [{ item: skladba() }], next: null }),
  });
  const v = await sp.klient().playlist(P, 'token-uzivatele-1234567890');
  assert.equal(v.kolekce.skladby.length, 1);
  assert.equal(v.upozorneni, undefined);
  const polozky = sp.na('/items')[0];
  assert.equal(hlavicka(polozky.init, 'authorization'), 'Bearer token-uzivatele-1234567890');
  assert.match(polozky.url, /additional_types=track/);
  assert.equal(hlavicka(sp.na(`/playlists/${P}`)[0].init, 'authorization'), 'Bearer token-aplikace', 'hlavička klíčem aplikace');
});

test('cizí playlist s přihlášením: 403 se promění ve vysvětlení', async () => {
  const sp = spotify({
    [`/playlists/${P}`]: () => json({ id: P, name: 'Cizí', items: { total: 30 } }),
    [`/playlists/${P}/items*`]: () => json({ error: { status: 403 } }, 403),
  });
  const v = await sp.klient().playlist(P, 'token-uzivatele-1234567890');
  assert.equal(v.kolekce.obsahNedostupny, true);
  assert.equal(v.upozorneni?.kod, 'PLAYLIST_UNAVAILABLE');
  assert.match(v.upozorneni!.zprava, /majiteli nebo spoluautorovi/);
});

test('odpovědi s tokenem uživatele se nekešují', async () => {
  const sp = spotify({
    [`/playlists/${P}`]: () => json({ id: P, name: 'Zkouška' }),
    [`/playlists/${P}/items*`]: () => json({ items: [], next: null }),
  });
  const k = sp.klient();
  await k.playlist(P, 'token-uzivatele-1234567890');
  await k.playlist(P, 'token-uzivatele-1234567890');
  assert.equal(sp.na('/items').length, 2);
});

test('hledání: nejvýš deset výsledků a zakódovaný dotaz', async () => {
  const sp = spotify({ '/search*': () => json({ tracks: { items: [skladba()] } }) });
  const k = await sp.klient().hledej('AC/DC Back in Black');
  assert.equal(k.skladby.length, 1);
  const url = sp.na('/search')[0].url;
  assert.match(url, /limit=10/);
  assert.match(url, /q=AC%2FDC%20Back%20in%20Black/);
  await assert.rejects(sp.klient().hledej('   '), (e: any) => e.kod === 'INVALID_URL');
});

test('náhled rozbalí zkrácený odkaz z mobilu', async () => {
  const sp = spotify({
    'https://spotify.link/AbC123': () => new Response(null, { status: 302, headers: { location: `https://open.spotify.com/track/${T}?si=x` } }),
    [`/tracks/${T}`]: () => json(skladba()),
  });
  const v = await sp.klient().nahled('https://spotify.link/AbC123');
  assert.equal(v.druh, 'kolekce');
  assert.equal((v as any).kolekce.skladby[0].sourceId, T);
});

test('zkrácený odkaz, který vede mimo Spotify, se odmítne', async () => {
  const sp = spotify({
    'https://spotify.link/zlo': () => new Response(null, { status: 302, headers: { location: 'https://zlo.example/' } }),
  });
  await assert.rejects(sp.klient().nahled('https://spotify.link/zlo'), (e: any) => e.kod === 'INVALID_URL');
  assert.equal(sp.na('zlo.example').length, 0);
});

test('náhled: interpret s alby, neplatné a nepodporované odkazy', async () => {
  const sp = spotify({
    [`/artists/${R}`]: () => json({ id: R, name: 'Sepultura', genres: [] }),
    [`/artists/${R}/albums*`]: () => json({ items: [{ id: 'a1', name: 'Roots' }], next: null }),
  });
  const v = await sp.klient().nahled(`https://open.spotify.com/artist/${R}`);
  assert.equal(v.druh, 'interpret');
  assert.deepEqual((v as any).interpret.alba.map((a: any) => a.nazev), ['Roots']);

  await assert.rejects(sp.klient().nahled('nesmysl'), (e: any) => e.kod === 'INVALID_URL');
  await assert.rejects(sp.klient().nahled(`https://open.spotify.com/episode/${T}`), (e: any) => e.kod === 'UNSUPPORTED_SOURCE');
});

test('zrušený dotaz', async () => {
  const sp = spotify({ [`/tracks/${T}`]: () => json(skladba()) });
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(sp.klient().skladba(T, ctrl.signal), (e: any) => e.kod === 'CANCELLED');
});

test('brzda na dotazy od jednoho uživatele', () => {
  let ted = 0;
  const b = new OmezovacDotazu(3, 1000, () => ted);
  assert.deepEqual([b.povol('u'), b.povol('u'), b.povol('u'), b.povol('u')], [true, true, true, false]);
  assert.equal(b.povol('jiny'), true, 'každý má svoji');
  ted = 1001;
  assert.equal(b.povol('u'), true, 'po uplynutí okna zase jde');
});

test('token uživatele z hlavičky se jen zkontroluje', () => {
  assert.equal(platnyTokenUzivatele('BQDx9_abc-DEF.ghi~jkl+mno/pqr='), 'BQDx9_abc-DEF.ghi~jkl+mno/pqr=');
  assert.equal(platnyTokenUzivatele('kratky'), undefined);
  assert.equal(platnyTokenUzivatele('token s mezerou uprostred 123'), undefined);
  assert.equal(platnyTokenUzivatele('abcdefghijklmnopqrstuv\r\nX-Injekce: 1'), undefined);
  assert.equal(platnyTokenUzivatele(undefined), undefined);
  assert.equal(platnyTokenUzivatele(['pole']), undefined);
});

test('konfigurace jen se dvěma klíči', () => {
  assert.equal(konfigZProstredi({ SPOTIFY_CLIENT_ID: 'a' } as any), null);
  assert.deepEqual(konfigZProstredi({ SPOTIFY_CLIENT_ID: ' a ', SPOTIFY_CLIENT_SECRET: 'b' } as any), { clientId: 'a', clientSecret: 'b' });
});
