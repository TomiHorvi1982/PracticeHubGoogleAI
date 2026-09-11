import test from 'node:test';
import assert from 'node:assert/strict';

import type { Song } from '../../types';
import { cistyNazev, najdiDuplicitu } from './duplicity';

const pisen = (o: Partial<Song>): Song => ({
  id: 'p', title: '', artist: '', key: '', content: '', chordsUsed: [], createdAt: 1, updatedAt: 1, ...o,
});

const zImportu = (id: string, o: Partial<Song> = {}, meta: Record<string, unknown> = {}) => pisen({
  id,
  title: 'One',
  artist: 'Metallica',
  importMetadata: {
    source: 'spotify', sourceId: `spotify-${id}`, sourceUrl: '', title: 'One', artist: 'Metallica',
    artists: ['Metallica'], album: null, albumArtist: null, duration: 1, releaseDate: null, coverUrl: null,
    isrc: null, externalIds: {}, trackNumber: null, discNumber: null, explicit: false, importedAt: 1,
    ...meta,
  } as any,
  ...o,
});

const kandidat = (o: Record<string, unknown> = {}) => ({
  sourceId: 'novy', isrc: null as string | null, title: 'Cokoli', artist: 'Někdo', ...o,
});

test('tatáž položka ze Spotify', () => {
  const s = zImportu('a');
  assert.equal(najdiDuplicitu(kandidat({ sourceId: 'spotify-a' }), [s])?.druh, 'sourceId');
});

test('tatáž nahrávka z jiného alba podle ISRC', () => {
  const s = zImportu('a', {}, { isrc: 'USEE10001993' });
  assert.equal(najdiDuplicitu(kandidat({ isrc: 'USEE10001993' }), [s])?.druh, 'isrc');
});

test('tentýž zvukový soubor u jiné písně', () => {
  const s = zImportu('a', { title: 'Úplně jiný název' }, { audioChecksum: 'abc123' });
  assert.equal(najdiDuplicitu(kandidat({ audioChecksum: 'abc123' }), [s])?.druh, 'checksum');
});

test('ručně přepsaná píseň bez vazby na Spotify', () => {
  // Nejdůležitější případ: zpěvník byl dřív než import.
  const s = pisen({ id: 'zpevnik', title: 'Chci zas v tobě spát', artist: 'David Koller' });
  const shoda = najdiDuplicitu(kandidat({ title: 'Chci zas v tobe spat', artist: 'DAVID KOLLER' }), [s]);
  assert.equal(shoda?.druh, 'nazev');
  assert.equal(shoda?.song.id, 'zpevnik');
});

test('remaster je tatáž píseň', () => {
  const s = pisen({ title: 'Paranoid', artist: 'Black Sabbath' });
  for (const t of ['Paranoid - Remastered 2009', 'Paranoid (Remastered)', 'Paranoid - 2012 Remaster', 'Paranoid - Mono']) {
    assert.equal(najdiDuplicitu(kandidat({ title: t, artist: 'Black Sabbath' }), [s])?.druh, 'nazev', t);
  }
});

test('živá verze a remix jsou jiné nahrávky', () => {
  // Spojit je se studiovou by znamenalo, že se jedna z nich neimportuje.
  const s = pisen({ title: 'One', artist: 'Metallica' });
  assert.equal(najdiDuplicitu(kandidat({ title: 'One - Live', artist: 'Metallica' }), [s]), null);
  assert.equal(najdiDuplicitu(kandidat({ title: 'One (Remix)', artist: 'Metallica' }), [s]), null);
});

test('jiný interpret se stejným názvem není duplicita', () => {
  const s = pisen({ title: 'One', artist: 'U2' });
  assert.equal(najdiDuplicitu(kandidat({ title: 'One', artist: 'Metallica' }), [s]), null);
});

test('přednost má nejjistější shoda', () => {
  const podleNazvu = pisen({ id: 'nazev', title: 'One', artist: 'Metallica' });
  const podleId = zImportu('id', { title: 'Jinak' });
  const shoda = najdiDuplicitu(kandidat({ sourceId: 'spotify-id', title: 'One', artist: 'Metallica' }), [podleNazvu, podleId]);
  assert.equal(shoda?.druh, 'sourceId');
  assert.equal(shoda?.song.id, 'id');
});

test('prázdný název se neshodne se vším bez názvu', () => {
  const s = pisen({ title: '', artist: '' });
  assert.equal(najdiDuplicitu(kandidat({ title: '', artist: '' }), [s]), null);
});

test('chybějící ISRC se nepovažuje za shodu', () => {
  const s = zImportu('a');   // isrc: null
  assert.equal(najdiDuplicitu(kandidat({ isrc: null, title: 'Jinak', artist: 'Jinak' }), [s]), null);
});

test('čistý název', () => {
  assert.equal(cistyNazev('Paranoid - Remastered 2009'), 'Paranoid');
  assert.equal(cistyNazev('Heroes - 2017 Remaster - Mono'), 'Heroes', 'vrstvené doplňky');
  assert.equal(cistyNazev('Hey Jude - Radio Edit'), 'Hey Jude');
  assert.equal(cistyNazev('One - Live'), 'One - Live');
  assert.equal(cistyNazev('Remastered'), 'Remastered', 'celý název se neodstraní');
});
