import test from 'node:test';
import assert from 'node:assert/strict';

import type { LibraryAsset } from '../assetLibraryService';
import {
  KnihovnaProvider, VlastniSouborProvider, jeZvukovySoubor, sha256, souborPatriKeSkladbe,
} from './audioZdroje';
import type { NahledSkladby } from './normalizace';

/* Žádný skutečný zvuk: soubory jsou pár bajtů textu s typem audio. */

const asset = (name: string, o: Partial<LibraryAsset> = {}): LibraryAsset => ({
  id: `id-${name}`, owner_id: 'u', name, original_filename: name, mime_type: 'audio/mpeg', size_bytes: 1000,
  storage_bucket: 'r2', storage_path: `assets/users/u/my_songs/${name}`, asset_type: 'audio',
  category: 'my_songs', status: 'active', metadata: {}, created_at: '', updated_at: '', ...o,
});

const skladba = (o: Partial<NahledSkladby> = {}): NahledSkladby => ({
  source: 'spotify', sourceId: 'id1', sourceUrl: '', title: 'One', artist: 'Metallica', artists: ['Metallica'],
  album: null, albumArtist: null, duration: 1, releaseDate: null, coverUrl: null, isrc: null, externalIds: {},
  trackNumber: null, discNumber: null, explicit: false, poradi: 1, ...o,
});

test('soubor se ke skladbě přiřadí po slovech, ne podřetězcem', () => {
  const one = { title: 'One', artist: 'Metallica' };
  assert.equal(souborPatriKeSkladbe('Metallica - One.mp3', one), true);
  assert.equal(souborPatriKeSkladbe('metallica_one_remaster.wav', one), true);
  assert.equal(souborPatriKeSkladbe('Someone.mp3', one), false, 'One není Someone');
  assert.equal(souborPatriKeSkladbe('Metallica - Enter Sandman.mp3', one), false);
});

test('soubor z alba bez interpreta v názvu', () => {
  const nomad = { title: 'Nomad', artist: 'Sepultura' };
  assert.equal(souborPatriKeSkladbe('08. Nomad.mp3', nomad), true);
  assert.equal(souborPatriKeSkladbe('Nomad Remix.mp3', nomad), false, 'bez interpreta jen přesná shoda');
});

test('knihovna najde zvuk a nekopíruje ho', async () => {
  const hledane: string[] = [];
  const z = new KnihovnaProvider({
    hledej: async (dotaz) => {
      hledane.push(dotaz);
      return [asset('One.pdf', { mime_type: 'application/pdf', asset_type: 'pdf' }), asset('Metallica - One.mp3')];
    },
  });
  const n = await z.getMetadata(skladba({ title: 'One - Remastered' }));
  assert.equal(hledane[0], 'One', 'hledá se čistý název');
  assert.equal(n?.asset?.name, 'Metallica - One.mp3', 'PDF se stejným názvem se přeskočí');
  const p = await z.download(n!);
  assert.equal(p.type, 'audio');
  assert.equal(p.storagePath, 'assets/users/u/my_songs/Metallica - One.mp3', 'odkaz na tentýž soubor');
});

test('nedostupná knihovna není chyba importu', async () => {
  const z = new KnihovnaProvider({ hledej: async () => { throw new Error('502'); } });
  assert.equal(await z.getMetadata(skladba()), null);
});

test('přerušené hledání v knihovně se ohlásí jako zrušení', async () => {
  const e = new Error('aborted');
  e.name = 'AbortError';
  const z = new KnihovnaProvider({ hledej: async () => { throw e; } });
  await assert.rejects(z.getMetadata(skladba()), (x: any) => x.kod === 'CANCELLED');
});

test('vlastní soubor: otisk, nahrání a chyba úložiště', async () => {
  const soubor = new File(['abc'], 'moje-nahravka.mp3', { type: 'audio/mpeg' });
  let nahrano = 0;
  const ok = new VlastniSouborProvider(new Map([['id1', soubor]]), {
    nahraj: async (f) => { nahrano++; return asset(f.name); },
  });
  assert.equal(ok.canHandle(skladba()), true);
  assert.equal(ok.canHandle(skladba({ sourceId: 'jina' })), false);

  const n = await ok.getMetadata(skladba());
  // SHA-256 řetězce „abc" z FIPS 180-2.
  assert.equal(n?.checksum, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(nahrano, 0, 'hledání nic nenahrává');

  const p = await ok.download(n!, skladba());
  assert.equal(nahrano, 1);
  assert.equal(p.name, 'moje-nahravka.mp3');

  const spatne = new VlastniSouborProvider(new Map([['id1', soubor]]), {
    nahraj: async () => { throw new Error('R2 nedostupné'); },
  });
  await assert.rejects(spatne.download(n!, skladba()), (x: any) => x.kod === 'STORAGE_FAILED' && /R2/.test(x.technicky));
});

test('vlastní soubor musí být zvuk a nesmí být prázdný', async () => {
  const pdf = new VlastniSouborProvider(new Map([['id1', new File(['%PDF'], 'noty.pdf', { type: 'application/pdf' })]]), {
    nahraj: async () => asset('x'),
  });
  await assert.rejects(pdf.getMetadata(skladba()), (x: any) => x.kod === 'DOWNLOAD_FAILED');

  const prazdny = new VlastniSouborProvider(new Map([['id1', new File([], 'ticho.wav', { type: 'audio/wav' })]]), {
    nahraj: async () => asset('x'),
  });
  await assert.rejects(prazdny.getMetadata(skladba()), (x: any) => x.kod === 'DOWNLOAD_FAILED');
});

test('zvuk se pozná i podle přípony, když prohlížeč typ nezná', () => {
  assert.equal(jeZvukovySoubor({ name: 'demo.flac', type: '' }), true);
  assert.equal(jeZvukovySoubor({ name: 'demo.txt', type: '' }), false);
});

test('otisk je stabilní', async () => {
  assert.equal(await sha256(new Blob(['abc'])), await sha256(new Blob(['abc'])));
  assert.notEqual(await sha256(new Blob(['abc'])), await sha256(new Blob(['abd'])));
});
