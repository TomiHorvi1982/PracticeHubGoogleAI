import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  urlHledani, urlModelu, urlPresProxy, jeBezpecnaAdresa, bezpecneJmeno,
  typSouboru, normalizujTony, normalizujModely, stranek, celkem, PROXY_SOUNDSHED,
} from './tone3000';

test('dotaz se skládá s ořezanou velikostí stránky', () => {
  const u = new URL(urlHledani('marshall', 'newest', 2, 20));
  assert.equal(u.searchParams.get('query'), 'marshall');
  assert.equal(u.searchParams.get('sort'), 'newest');
  assert.equal(u.searchParams.get('page'), '2');
  assert.equal(u.searchParams.get('page_size'), '20');
});

test('nesmyslné stránkování nespadne, jen se srovná do rozsahu', () => {
  const u = new URL(urlHledani('', 'newest', -5, 9999));
  assert.equal(u.searchParams.get('page'), '1');
  assert.equal(u.searchParams.get('page_size'), '50');
  // Prázdný dotaz se neposílá — vrátil by se prostě celý katalog.
  assert.equal(u.searchParams.has('query'), false);
});

test('modely se ptají na konkrétní tón', () => {
  const u = new URL(urlModelu(88475));
  assert.equal(u.searchParams.get('tone_id'), '88475');
});

// --- bezpečnost: adresa přichází z odpovědi cizí služby ---

test('stahuje se jen z povolených hostů a jen po https', () => {
  assert.equal(jeBezpecnaAdresa('https://www.tone3000.com/api/v1/models/1/download/a.wav'), true);
  assert.equal(jeBezpecnaAdresa('https://api-guitar.soundshed.com/v1/x'), true);
  assert.equal(jeBezpecnaAdresa('https://zlomyslny.example.com/a.wav'), false);
  // http by šlo cestou podvrhnout
  assert.equal(jeBezpecnaAdresa('http://www.tone3000.com/a.wav'), false);
  assert.equal(jeBezpecnaAdresa('file:///etc/passwd'), false);
  assert.equal(jeBezpecnaAdresa('tohle není adresa'), false);
});

test('host, který povolený jen připomíná, neprojde', () => {
  assert.equal(jeBezpecnaAdresa('https://www.tone3000.com.zly.example/a.wav'), false);
  assert.equal(jeBezpecnaAdresa('https://evil-api-guitar.soundshed.com/a.wav'), false);
});

test('odkaz se přepíše na proxy, cizí se zahodí', () => {
  assert.equal(
    urlPresProxy('https://www.tone3000.com/api/v1/models/746094/download/x.wav'),
    `${PROXY_SOUNDSHED}/models/746094/download/x.wav`,
  );
  assert.equal(urlPresProxy('https://zlomyslny.example.com/models/1/download/x.wav'), null);
});

// --- bezpečnost: jméno souboru také přichází zvenčí ---

test('jméno souboru nemůže utéct ze složky', () => {
  assert.equal(bezpecneJmeno('../../../etc/passwd', 7, 'nam'), 'etc passwd [7].nam');
  assert.equal(bezpecneJmeno('a/b\\c', 7, 'ir'), 'a b c [7].wav');
  assert.ok(!bezpecneJmeno('../../x', 7, 'nam').includes('..'));
});

test('jméno, ze kterého nic nezbude, spadne na ID', () => {
  assert.equal(bezpecneJmeno('///', 42, 'nam'), 'tone3000-42.nam');
  assert.equal(bezpecneJmeno('', 42, 'ir'), 'tone3000-42.wav');
  assert.equal(bezpecneJmeno('...', 42, 'nam'), 'tone3000-42.nam');
});

test('diakritika v názvu zůstane, přípona odpovídá typu', () => {
  assert.equal(bezpecneJmeno('Křupavý Marshall', 5, 'nam'), 'Křupavý Marshall [5].nam');
});

test('typ souboru se pozná z přípony', () => {
  assert.equal(typSouboru('https://x/a.nam'), 'nam');
  assert.equal(typSouboru('https://x/a.wav?podpis=1'), 'ir');
  assert.equal(typSouboru('https://x/a.exe'), null);
});

// --- normalizace odpovědi ---

test('tóny se přečtou i s chybějícími poli', () => {
  const t = normalizujTony({ data: [{ id: 1, title: 'A' }, { id: 'nesmysl' }, { title: 'bez id' }] });
  assert.equal(t.length, 1);
  assert.equal(t[0].poctyModelu, 0);
  assert.deepEqual(t[0].znacky, []);
});

test('obrázek z cizího hosta se zahodí', () => {
  const t = normalizujTony({ data: [{ id: 1, title: 'A', images: ['https://zly.example/x.png'] }] });
  assert.equal(t[0].obrazek, undefined);
});

test('model bez použitelného odkazu se do seznamu nedostane', () => {
  const m = normalizujModely({
    data: [
      { id: 1, name: 'ok', model_url: 'https://www.tone3000.com/api/v1/models/1/download/a.nam' },
      { id: 2, name: 'cizí', model_url: 'https://zly.example/a.nam' },
      { id: 3, name: 'divná přípona', model_url: 'https://www.tone3000.com/api/v1/models/3/download/a.exe' },
    ],
  });
  assert.equal(m.length, 1);
  assert.equal(m[0].typ, 'nam');
  assert.ok(m[0].odkaz.startsWith(PROXY_SOUNDSHED));
});

test('stránkování má rozumné výchozí hodnoty', () => {
  assert.equal(stranek({ total_pages: 395 }), 395);
  assert.equal(stranek({}), 1);
  assert.equal(celkem({ total: 1184 }), 1184);
  assert.equal(celkem({}), 0);
});
