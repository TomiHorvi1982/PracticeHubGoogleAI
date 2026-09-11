import test from 'node:test';
import assert from 'node:assert/strict';

import {
  interpretSAlby, kolekceZAlba, kolekceZHledani, kolekceZPlaylistu, kolekceZeSkladby,
  nejvetsiObal, normalizujIsrc, normalizujSkladbu, platneDatum,
} from './normalizace';

/* Vymyšlené odpovědi ve tvaru Spotify Web API. Žádný zvuk. */

const OBALY = [
  { url: 'https://i.scdn.co/image/640', width: 640, height: 640 },
  { url: 'https://i.scdn.co/image/64', width: 64, height: 64 },
  { url: 'https://i.scdn.co/image/300', width: 300, height: 300 },
];

const skladba = (o: Record<string, unknown> = {}) => ({
  id: '4iV5W9uYEdYUVa79Axb7Rh',
  type: 'track',
  name: 'One',
  duration_ms: 446_446,
  explicit: false,
  track_number: 4,
  disc_number: 1,
  artists: [{ name: 'Metallica' }, { name: 'Host' }],
  album: {
    name: '...And Justice for All',
    artists: [{ name: 'Metallica' }],
    release_date: '1988-08-25',
    images: OBALY,
  },
  external_ids: { isrc: 'us-ee1-00-01993' },
  external_urls: { spotify: 'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh' },
  ...o,
});

const vytahni = (v: ReturnType<typeof normalizujSkladbu>) => {
  assert.ok('skladba' in v, `čekal jsem skladbu, mám ${JSON.stringify(v)}`);
  return (v as any).skladba;
};

test('skladba se převede na jednotný tvar', () => {
  const s = vytahni(normalizujSkladbu(skladba(), 1));
  assert.equal(s.source, 'spotify');
  assert.equal(s.sourceId, '4iV5W9uYEdYUVa79Axb7Rh');
  assert.equal(s.title, 'One');
  assert.equal(s.artist, 'Metallica', 'do písně jde hlavní interpret');
  assert.deepEqual(s.artists, ['Metallica', 'Host'], 'do metadat všichni');
  assert.equal(s.album, '...And Justice for All');
  assert.equal(s.albumArtist, 'Metallica');
  assert.equal(s.duration, 446, 'milisekundy na vteřiny');
  assert.equal(s.releaseDate, '1988-08-25');
  assert.equal(s.coverUrl, 'https://i.scdn.co/image/640', 'největší obal, ne první');
  assert.equal(s.isrc, 'USEE10001993', 'ISRC bez pomlček a velkými');
  assert.equal(s.trackNumber, 4);
  assert.equal(s.explicit, false);
});

test('bez external_ids se nic nerozbije', () => {
  // Spotify je v únoru 2026 odebralo a v březnu vrátilo — musí to jít oběma směry.
  const s = vytahni(normalizujSkladbu(skladba({ external_ids: undefined }), 1));
  assert.equal(s.isrc, null);
  assert.deepEqual(s.externalIds, {});
});

test('popularity ani label se nečekají', () => {
  const s = vytahni(normalizujSkladbu(skladba(), 1));
  assert.equal('popularity' in s, false);
  assert.equal('label' in s, false);
});

test('co se neimportuje, se vynechá s důvodem', () => {
  assert.deepEqual(normalizujSkladbu(skladba({ is_local: true }), 1), { vynechano: 'mistni-soubor' });
  assert.deepEqual(normalizujSkladbu(skladba({ type: 'episode' }), 1), { vynechano: 'neni-skladba' });
  assert.deepEqual(normalizujSkladbu(skladba({ duration_ms: 0 }), 1), { vynechano: 'odstranena' });
  assert.deepEqual(normalizujSkladbu(skladba({ id: null }), 1), { vynechano: 'odstranena' });
  assert.deepEqual(normalizujSkladbu(skladba({ name: '  ' }), 1), { vynechano: 'bez-metadat' });
  assert.deepEqual(normalizujSkladbu(skladba({ artists: [] }), 1), { vynechano: 'bez-metadat' });
  assert.deepEqual(normalizujSkladbu(null, 1), { vynechano: 'odstranena' });
});

test('největší obal, i když rozměry chybí', () => {
  assert.equal(nejvetsiObal(OBALY), 'https://i.scdn.co/image/640');
  // Mozaika u playlistu rozměry nemá — vyhraje první.
  assert.equal(nejvetsiObal([{ url: 'https://mosaic.scdn.co/a', width: null, height: null }]), 'https://mosaic.scdn.co/a');
  assert.equal(nejvetsiObal([]), null);
  assert.equal(nejvetsiObal(undefined), null);
  // Do <img> smí jen https.
  assert.equal(nejvetsiObal([{ url: 'http://i.scdn.co/x', width: 9, height: 9 }]), null);
  assert.equal(nejvetsiObal([{ url: 'javascript:alert(1)', width: 9, height: 9 }]), null);
});

test('ISRC a datum', () => {
  assert.equal(normalizujIsrc('USEE10001993'), 'USEE10001993');
  assert.equal(normalizujIsrc('nesmysl'), null);
  assert.equal(normalizujIsrc(undefined), null);
  assert.equal(platneDatum('1988'), '1988', 'u starých alb Spotify zná jen rok');
  assert.equal(platneDatum('1988-08'), '1988-08');
  assert.equal(platneDatum('88'), null);
});

test('album doplní skladbám údaje, které v odpovědi nemají', () => {
  const zjednodusena = (id: string, n: number) => ({
    id, type: 'track', name: `Stopa ${n}`, duration_ms: 200_000, track_number: n,
    artists: [{ name: 'Sepultura' }],
  });
  const k = kolekceZAlba(
    { id: '4aawyAB9vmqN3uQ7FjRGTy', name: 'Roots', artists: [{ name: 'Sepultura' }], release_date: '1996-02-20', images: OBALY, total_tracks: 3 },
    [zjednodusena('a0000000000000000000a1', 1), { ...zjednodusena('a0000000000000000000a2', 2), is_local: true }, zjednodusena('a0000000000000000000a3', 3)],
  );
  assert.equal(k.druh, 'album');
  assert.equal(k.nazev, 'Roots');
  assert.equal(k.skladby.length, 2);
  assert.equal(k.skladby[0].album, 'Roots', 'album přišlo z kontextu');
  assert.equal(k.skladby[0].coverUrl, 'https://i.scdn.co/image/640');
  assert.equal(k.skladby[0].releaseDate, '1996-02-20');
  assert.equal(k.skladby[1].poradi, 3, 'pořadí sedí na album, i po vynechání');
  assert.deepEqual(k.vynechano, [{ duvod: 'mistni-soubor', pocet: 1 }]);
  assert.equal(k.celkem, 3);
});

test('playlist čte nové pole item i staré track', () => {
  const k = kolekceZPlaylistu(
    {
      id: '3cEYpjA9oz9GiPac4AsH4n',
      name: 'Zkouška',
      owner: { display_name: 'Tomáš' },
      description: 'Na <a href="https://x">čtvrtek</a> &amp; pátek',
      images: [{ url: 'https://mosaic.scdn.co/a', width: null, height: null }],
      items: { total: 4 },
    },
    [
      { item: skladba() },
      { track: skladba({ id: 'b0000000000000000000b2', name: 'Blackened' }) },
      { is_local: true, item: skladba({ id: 'c0000000000000000000c3' }) },
      { item: skladba({ id: 'd0000000000000000000d4', type: 'episode' }) },
    ],
  );
  assert.equal(k.nazev, 'Zkouška');
  assert.equal(k.autor, 'Tomáš');
  assert.equal(k.popis, 'Na čtvrtek & pátek', 'HTML z popisu pryč');
  assert.equal(k.celkem, 4, 'počet z pole items (únor 2026)');
  assert.deepEqual(k.skladby.map((s) => s.title), ['One', 'Blackened']);
  assert.deepEqual(
    [...k.vynechano].sort((a, b) => a.duvod.localeCompare(b.duvod)),
    [{ duvod: 'mistni-soubor', pocet: 1 }, { duvod: 'neni-skladba', pocet: 1 }],
  );
});

test('staré pole tracks.total u playlistu', () => {
  const k = kolekceZPlaylistu({ id: 'x', name: 'Starý', tracks: { total: 7 } }, []);
  assert.equal(k.celkem, 7);
});

test('cizí playlist: hlavička bez skladeb', () => {
  const k = kolekceZPlaylistu({ id: 'x', name: 'Cizí', items: { total: 50 } }, null);
  assert.equal(k.obsahNedostupny, true);
  assert.equal(k.skladby.length, 0);
  assert.equal(k.celkem, 50, 'kolik jich tam je, se ví i bez obsahu');
});

test('jedna skladba i výsledky hledání jako kolekce', () => {
  const k = kolekceZeSkladby(skladba());
  assert.equal(k?.druh, 'track');
  assert.equal(k?.skladby.length, 1);
  assert.equal(kolekceZeSkladby({ id: 'x', duration_ms: 0 }), null);

  const h = kolekceZHledani('one', { tracks: { items: [skladba(), skladba({ is_local: true })] } });
  assert.equal(h.skladby.length, 1);
  assert.equal(kolekceZHledani('nic', {}).skladby.length, 0, 'prázdná odpověď nespadne');
});

test('interpret s alby bez duplicit', () => {
  const i = interpretSAlby(
    { id: '0TnOYISbd1XYRBk9myaseg', name: 'Sepultura', images: OBALY, genres: ['thrash metal'] },
    [
      { id: 'a1', name: 'Roots', release_date: '1996-02-20', total_tracks: 16, album_type: 'album', images: OBALY },
      { id: 'a1', name: 'Roots', release_date: '1996-02-20' },
      { id: 'a2', name: 'Chaos A.D.', release_date: '1993' },
    ],
  );
  assert.equal(i.nazev, 'Sepultura');
  assert.deepEqual(i.alba.map((a) => a.id), ['a1', 'a2']);
  assert.equal(i.alba[0].rok, '1996');
  assert.deepEqual(i.zanry, ['thrash metal']);
});
