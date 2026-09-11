import test from 'node:test';
import assert from 'node:assert/strict';

import { adresaPrehravace } from './youtubeRam';

const parametry = (url: string) => new URL(url).searchParams;

test('adresa míří na vložený přehrávač bez cookies', () => {
  const u = new URL(adresaPrehravace('abc123', {}, 'https://priklad.cz'));
  assert.equal(u.origin, 'https://www.youtube-nocookie.com');
  assert.equal(u.pathname, '/embed/abc123');
});

test('ovládání z našeho kódu je zapnuté vždycky', () => {
  // Bez `enablejsapi` se přehrávač nedá ovládat a bez `origin` to
  // YouTube odmítne — ani jedno se nesmí dát vypnout zvenčí.
  const p = parametry(adresaPrehravace('abc', {}, 'https://priklad.cz'));
  assert.equal(p.get('enablejsapi'), '1');
  assert.equal(p.get('origin'), 'https://priklad.cz');
});

test('vlastní parametry projdou', () => {
  const p = parametry(adresaPrehravace('abc', { controls: 0, rel: 0, start: 42 }, 'https://priklad.cz'));
  assert.equal(p.get('controls'), '0');
  assert.equal(p.get('rel'), '0');
  assert.equal(p.get('start'), '42');
});

test('logické hodnoty se posílají jako jednička a nula', () => {
  // `autoplay=true` by YouTube nepřečetl — chce 1/0.
  const p = parametry(adresaPrehravace('abc', { autoplay: true, playsinline: false }, 'https://priklad.cz'));
  assert.equal(p.get('autoplay'), '1');
  assert.equal(p.get('playsinline'), '0');
});

test('id videa se escapuje', () => {
  // Id přichází z databáze i z výsledků hledání; lomítko v něm by jinak
  // ukázalo na úplně jinou cestu.
  const u = new URL(adresaPrehravace('a/b?c', {}, 'https://priklad.cz'));
  assert.equal(u.pathname, '/embed/a%2Fb%3Fc');
});

test('bez známého původu se parametr vynechá', () => {
  // Prázdný `origin` by YouTube považoval za neplatný a ovládání by
  // přestalo fungovat úplně; lepší ho neposlat.
  const p = parametry(adresaPrehravace('abc', {}, ''));
  assert.equal(p.has('origin'), false);
  assert.equal(p.get('enablejsapi'), '1');
});
