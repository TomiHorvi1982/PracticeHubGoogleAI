import test from 'node:test';
import assert from 'node:assert/strict';

import type { Song, SongAttachment } from '../../types';
import type { AudioSourceProvider } from './audioZdroje';
import {
  PolozkaImportu, ZavislostiImportu, importuj, pripravPolozky, souhrn, zopakujNeuspesne,
} from './importWorkflow';
import type { NahledSkladby } from './normalizace';

/* Databáze, úložiště i zdroje zvuku jsou falešné. Žádný skutečný zvuk. */

const TED = 1_700_000_000_000;

const s = (id: string, o: Partial<NahledSkladby> = {}): NahledSkladby => ({
  source: 'spotify', sourceId: id, sourceUrl: `https://open.spotify.com/track/${id}`, title: `Píseň ${id}`,
  artist: 'Kapela', artists: ['Kapela'], album: 'Album', albumArtist: 'Kapela', duration: 200, releaseDate: '2020',
  coverUrl: 'https://i.scdn.co/image/x', isrc: null, externalIds: {}, trackNumber: 1, discNumber: 1,
  explicit: false, poradi: 1, ...o,
});

function databaze(o: { pisne?: Song[]; selze?: number } = {}) {
  const pisne: Song[] = [...(o.pisne || [])];
  let selhani = o.selze || 0;
  let zapisu = 0;
  const ulozPisen = async (song: Song) => {
    if (selhani > 0) { selhani--; throw new Error('spojení s databází spadlo'); }
    zapisu++;
    const ulozena = { ...song, id: song.id.startsWith('song_') ? `uuid-${zapisu}` : song.id };
    const i = pisne.findIndex((p) => p.id === ulozena.id);
    if (i >= 0) pisne[i] = ulozena; else pisne.push(ulozena);
    return ulozena;
  };
  return { pisne, ulozPisen, zapisu: () => zapisu };
}

function zdroj(ids: string[], o: { selze?: number } = {}) {
  let selhani = o.selze || 0;
  let prevzeti = 0;
  const z: AudioSourceProvider = {
    id: 'test',
    nazev: 'Test',
    canHandle: (x) => ids.includes(x.sourceId),
    getMetadata: async (x) => ({ zdroj: 'test', popis: `zvuk ${x.sourceId}`, checksum: `sha-${x.sourceId}` }),
    download: async (_n, x): Promise<SongAttachment> => {
      if (selhani > 0) { selhani--; throw new Error('R2 nedostupné'); }
      prevzeti++;
      return { id: `a-${x.sourceId}`, name: `${x.sourceId}.mp3`, type: 'audio', dataUrl: '', storageBucket: 'r2', storagePath: `assets/${x.sourceId}.mp3`, uploadedAt: 1 };
    },
  };
  return { z, prevzeti: () => prevzeti };
}

const zav = (db: ReturnType<typeof databaze>, zdroje: AudioSourceProvider[] = []): ZavislostiImportu =>
  ({ pisne: () => db.pisne, ulozPisen: db.ulozPisen, zdroje, ted: () => TED });

const stavy = (p: PolozkaImportu[]) => p.map((x) => x.stav);

test('bez zvuku se píseň založí a nedostupný zvuk se ohlásí', async () => {
  const db = databaze();
  const v = await importuj(pripravPolozky([s('a'), s('b')]), zav(db));
  assert.deepEqual(stavy(v), ['hotovo', 'hotovo']);
  assert.equal(v[0].upozorneni?.zprava, 'Audio source unavailable for authorized import.');
  const p = db.pisne[0];
  assert.equal(p.title, 'Píseň a');
  assert.equal(p.obalAlba, 'https://i.scdn.co/image/x');
  assert.equal(p.nazevAlba, 'Album');
  assert.equal(p.importMetadata?.sourceId, 'a');
  assert.equal(p.importMetadata?.importedAt, TED);
  assert.equal('poradi' in (p.importMetadata || {}), false, 'pořadí patří k náhledu, ne k písni');
});

test('s oprávněným zvukem se připojí příloha a otisk', async () => {
  const db = databaze();
  const { z } = zdroj(['a']);
  const [p] = await importuj(pripravPolozky([s('a')]), zav(db, [z]));
  assert.equal(p.stav, 'hotovo');
  assert.equal(p.upozorneni, undefined);
  assert.equal(p.zvuk, 'zvuk a');
  assert.equal(db.pisne[0].attachments?.[0].storagePath, 'assets/a.mp3');
  assert.equal(db.pisne[0].importMetadata?.audioChecksum, 'sha-a');
});

test('režim „jen se zvukem" nezaloží nic bez oprávněného zvuku', async () => {
  const db = databaze();
  const [p] = await importuj(pripravPolozky([s('a')]), zav(db), { jenSeZvukem: true });
  assert.equal(p.stav, 'chyba');
  assert.equal(p.chyba?.kod, 'AUDIO_SOURCE_UNAVAILABLE');
  assert.equal(p.chyba?.opakovat, false);
  assert.equal(db.zapisu(), 0);
});

test('duplicita se nezaloží podruhé', async () => {
  const existujici: Song = {
    id: 'e', title: 'Chci zas v tobě spát', artist: 'David Koller', key: 'G', content: 'text', chordsUsed: [],
    createdAt: 1, updatedAt: 1,
  };
  const db = databaze({ pisne: [existujici] });
  const [p] = await importuj(
    pripravPolozky([s('x', { title: 'Chci zas v tobě spát - Remastered 2011', artist: 'David Koller' })]),
    zav(db),
  );
  assert.equal(p.stav, 'duplicita');
  assert.equal(p.shoda?.druh, 'nazev');
  assert.equal(p.shoda?.song.id, 'e');
  assert.equal(db.zapisu(), 0);
});

test('„Replace metadata" nepřepíše ručně psanou píseň', async () => {
  const existujici: Song = {
    id: 'e', title: 'Chci zas v tobě spát', artist: 'David Koller', key: 'G', content: 'Mlčíš a svět…',
    chordsUsed: ['G'], createdAt: 1, updatedAt: 1,
  };
  const db = databaze({ pisne: [existujici] });
  const [p] = await importuj(
    pripravPolozky([s('x', { title: 'Chci Zas V Tobe Spat', artist: 'David Koller' })]),
    zav(db),
    { rozhodnuti: { x: 'nahradit' } },
  );
  assert.equal(p.stav, 'hotovo');
  assert.equal(p.songId, 'e', 'tatáž píseň, žádná nová');
  const ulozena = db.pisne.find((x) => x.id === 'e')!;
  assert.equal(ulozena.title, 'Chci zas v tobě spát', 'název podle zpěvníku, ne podle Spotify');
  assert.equal(ulozena.content, 'Mlčíš a svět…', 'text zůstal');
  assert.equal(ulozena.key, 'G');
  assert.equal(ulozena.importMetadata?.sourceId, 'x');
  assert.equal(ulozena.obalAlba, 'https://i.scdn.co/image/x');
  assert.equal(db.pisne.length, 1);
});

test('duplicita podle otisku se pozná dřív, než se cokoli nahraje', async () => {
  const existujici: Song = {
    id: 'e', title: 'Jiný název', artist: 'Jiný', key: '', content: '', chordsUsed: [], createdAt: 1, updatedAt: 1,
    importMetadata: { audioChecksum: 'sha-a' } as any,
  };
  const db = databaze({ pisne: [existujici] });
  const { z, prevzeti } = zdroj(['a']);
  const [p] = await importuj(pripravPolozky([s('a')]), zav(db, [z]));
  assert.equal(p.stav, 'duplicita');
  assert.equal(p.shoda?.druh, 'checksum');
  assert.equal(prevzeti(), 0, 'duplicitní zvuk se nenahrál');
});

test('zrušení uprostřed: hotové zůstane, zbytek se nezačne', async () => {
  const db = databaze();
  const ctrl = new AbortController();
  const v = await importuj(pripravPolozky([s('a'), s('b'), s('c')]), zav(db), {
    signal: ctrl.signal,
    priZmene: (p) => { if (p[0].stav === 'hotovo') ctrl.abort(); },
  });
  assert.deepEqual(stavy(v), ['hotovo', 'zruseno', 'zruseno']);
  assert.equal(v[1].chyba?.kod, 'CANCELLED');
  assert.equal(db.zapisu(), 1);
});

test('zrušení před začátkem nezaloží nic', async () => {
  const db = databaze();
  const ctrl = new AbortController();
  ctrl.abort();
  const v = await importuj(pripravPolozky([s('a')]), zav(db), { signal: ctrl.signal });
  assert.deepEqual(stavy(v), ['zruseno']);
  assert.equal(db.zapisu(), 0);
});

test('chyba úložiště a opakování', async () => {
  const db = databaze();
  const { z, prevzeti } = zdroj(['a'], { selze: 1 });
  const prvni = await importuj(pripravPolozky([s('a')]), zav(db, [z]));
  assert.equal(prvni[0].stav, 'chyba');
  assert.equal(prvni[0].chyba?.kod, 'STORAGE_FAILED');
  assert.equal(prvni[0].chyba?.opakovat, true);
  assert.match(prvni[0].chyba!.technicky, /R2/);

  const druhy = await zopakujNeuspesne(prvni, zav(db, [z]));
  assert.equal(druhy[0].stav, 'hotovo');
  assert.equal(prevzeti(), 1);
});

test('po chybě databáze se zvuk při opakování nenahraje znovu', async () => {
  const db = databaze({ selze: 1 });
  const { z, prevzeti } = zdroj(['a']);
  const prvni = await importuj(pripravPolozky([s('a')]), zav(db, [z]));
  assert.equal(prvni[0].chyba?.kod, 'DATABASE_FAILED');
  assert.ok(prvni[0].priloha, 'příloha zůstala u položky');
  assert.equal(prevzeti(), 1);

  const druhy = await zopakujNeuspesne(prvni, zav(db, [z]));
  assert.equal(druhy[0].stav, 'hotovo');
  assert.equal(prevzeti(), 1, 'v knihovně jen jednou');
  assert.equal(db.pisne[0].attachments?.length, 1);
});

test('chybějící údaje: chyba, kterou opakování nezmění', async () => {
  const db = databaze();
  const prvni = await importuj(pripravPolozky([s('a', { artist: '' }), s('b')]), zav(db));
  assert.equal(prvni[0].chyba?.kod, 'METADATA_UNAVAILABLE');
  assert.equal(prvni[0].chyba?.opakovat, false);

  const druhy = await zopakujNeuspesne(prvni, zav(db));
  assert.equal(druhy[0].stav, 'chyba', 'zůstala, jak byla');
  assert.equal(db.zapisu(), 1, 'hotová se nezakládala znovu');
});

test('průběh se hlásí po krocích', async () => {
  const db = databaze();
  const zaznam: string[] = [];
  await importuj(pripravPolozky([s('a')]), zav(db), { priZmene: (p) => zaznam.push(p[0].stav) });
  assert.deepEqual(zaznam, ['bezi', 'hotovo']);
});

test('souhrn', async () => {
  const db = databaze();
  const { z } = zdroj(['b']);
  const v = await importuj(pripravPolozky([s('a'), s('b'), s('c', { title: '' })]), zav(db, [z]));
  assert.deepEqual(souhrn(v), { celkem: 3, hotovo: 2, duplicit: 0, chyb: 1, zruseno: 0, bezZvuku: 1, zbyva: 0 });
});
