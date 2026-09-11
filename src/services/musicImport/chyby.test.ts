import test from 'node:test';
import assert from 'node:assert/strict';

import { ImportChyba, ZPRAVY, jeKodChyby, lzeOpakovat, popisChyby } from './chyby';

test('věta o nedostupném zvuku je přesně podle zadání', () => {
  assert.equal(ZPRAVY.AUDIO_SOURCE_UNAVAILABLE, 'Audio source unavailable for authorized import.');
});

test('každá chyba ze zadání má hlášku', () => {
  for (const kod of [
    'INVALID_URL', 'UNSUPPORTED_SOURCE', 'SPOTIFY_API_ERROR', 'TRACK_NOT_FOUND', 'PLAYLIST_UNAVAILABLE',
    'METADATA_UNAVAILABLE', 'ARTWORK_UNAVAILABLE', 'AUDIO_SOURCE_UNAVAILABLE', 'DOWNLOAD_FAILED',
    'STORAGE_FAILED', 'DATABASE_FAILED', 'DUPLICATE_TRACK',
  ]) {
    assert.ok(jeKodChyby(kod), kod);
    assert.ok(ZPRAVY[kod as keyof typeof ZPRAVY].length > 10, kod);
  }
});

test('opakovat jde jen to, co opakováním může dopadnout jinak', () => {
  assert.equal(lzeOpakovat('STORAGE_FAILED'), true);
  assert.equal(lzeOpakovat('RATE_LIMITED'), true);
  assert.equal(lzeOpakovat('INVALID_URL'), false);
  assert.equal(lzeOpakovat('AUDIO_SOURCE_UNAVAILABLE'), false, 'oprávnění se opakováním nezmění');
  assert.equal(lzeOpakovat('METADATA_UNAVAILABLE'), false);
});

test('technický záznam se nepíše do hlášky', () => {
  const c = popisChyby(new ImportChyba('SPOTIFY_API_ERROR', 'HTTP 503 upstream'));
  assert.equal(c.zprava, ZPRAVY.SPOTIFY_API_ERROR);
  assert.equal(c.technicky, 'HTTP 503 upstream');
  assert.equal(c.zprava.includes('503'), false);
});

test('vlastní hláška přebije výchozí', () => {
  const c = popisChyby(new ImportChyba('TRACK_NOT_FOUND', '', 'Tohle album na Spotify není.'));
  assert.equal(c.zprava, 'Tohle album na Spotify není.');
});

test('zrušení přes AbortController', () => {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  assert.equal(popisChyby(e).kod, 'CANCELLED');
});

test('neznámá chyba dostane kód podle kroku', () => {
  const c = popisChyby(new TypeError('x is undefined'), 'DATABASE_FAILED');
  assert.equal(c.kod, 'DATABASE_FAILED');
  assert.equal(c.technicky, 'TypeError: x is undefined');
  assert.equal(popisChyby(undefined).technicky, '', 'ne „undefined"');
});

test('kód ze serveru se ověří', () => {
  assert.equal(jeKodChyby('RATE_LIMITED'), true);
  assert.equal(jeKodChyby('toString'), false, 'zděděné vlastnosti nejsou kódy');
  assert.equal(jeKodChyby(42), false);
});
