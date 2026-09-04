import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Hlidac, base64url, hlavickyProStazeni, jejichAdresa, jmenoTvurce, nahodnyVerifier,
  precitNavrat, typModelu, urlAutorizace, vyprsi, vyzvaZVerifieru, T3K_AUTORIZACE,
} from './tone3000Api';

const zaklad = {
  clientId: 't3k_pk_abc',
  navrat: 'http://localhost:3000/tone3000-callback.html',
  vyzva: 'VYZVA',
  state: 'STATE',
};

test('verifier má délku z RFC a jen povolené znaky', () => {
  const v = nahodnyVerifier();
  assert.equal(v.length, 64);
  assert.ok(v.length >= 43 && v.length <= 128);
  assert.match(v, /^[A-Za-z0-9\-._~]+$/);
  assert.notEqual(v, nahodnyVerifier());
});

test('base64url nemá výplň ani znaky, které se v adrese pletou', () => {
  // Bajty schválně takové, aby v obyčejném base64 vyšlo '+' i '/'.
  const b = new Uint8Array([0xfb, 0xff, 0xbf]).buffer;
  const s = base64url(b);
  assert.equal(s, '-_-_');
  assert.ok(!s.includes('='));
});

test('výzva je base64url ze SHA-256 verifieru', async () => {
  // Kontrolní pár z RFC 7636, příloha B.
  const v = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(await vyzvaZVerifieru(v), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('adresa autorizace nese povinné parametry PKCE', () => {
  const u = new URL(urlAutorizace(zaklad));
  assert.equal(`${u.origin}${u.pathname}`, T3K_AUTORIZACE);
  assert.equal(u.searchParams.get('client_id'), 't3k_pk_abc');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), 'VYZVA');
  assert.equal(u.searchParams.get('state'), 'STATE');
  assert.equal(u.searchParams.get('redirect_uri'), zaklad.navrat);
  // Volitelné se neposílají prázdné.
  assert.equal(u.searchParams.get('prompt'), null);
  assert.equal(u.searchParams.get('gears'), null);
});

test('víc gearů se spojuje podtržítkem, ne čárkou', () => {
  const u = new URL(urlAutorizace({ ...zaklad, gears: ['amp', 'amp-cab'], format: 'nam' }));
  assert.equal(u.searchParams.get('gears'), 'amp_amp-cab');
  assert.equal(u.searchParams.get('format'), 'nam');
});

test('výběr tónu posílá prompt a tone_id', () => {
  const u = new URL(urlAutorizace({ ...zaklad, prompt: 'load_tone', toneId: 42, menubar: true }));
  assert.equal(u.searchParams.get('prompt'), 'load_tone');
  assert.equal(u.searchParams.get('tone_id'), '42');
  assert.equal(u.searchParams.get('menubar'), 'true');
});

test('návrat s nesedícím state se odmítne', () => {
  const r = precitNavrat('?code=X&state=CIZI', 'STATE');
  assert.equal(r.ok, false);
  assert.match(r.chyba!, /nesedí/);
});

test('návrat bez uloženého state se odmítne', () => {
  assert.equal(precitNavrat('?code=X&state=STATE', null).ok, false);
});

test('zrušené přihlášení má vlastní hlášku', () => {
  const r = precitNavrat('?error=access_denied&state=STATE', 'STATE');
  assert.equal(r.ok, false);
  assert.match(r.chyba!, /zrušil/);
});

test('návrat z výběru tónu nese kód i tone_id', () => {
  const r = precitNavrat('?code=ABC&state=STATE&tone_id=1234', 'STATE');
  assert.deepEqual(r, { ok: true, code: 'ABC', toneId: 1234 });
});

test('návrat bez tone_id má tone_id nevyplněné, ne nulu', () => {
  const r = precitNavrat('?code=ABC&state=STATE', 'STATE');
  assert.equal(r.ok, true);
  assert.equal(r.toneId, undefined);
});

test('token se obnovuje s předstihem', () => {
  const ted = 1_000_000;
  assert.equal(vyprsi(ted + 30_000, ted), true, 'půl minuty do konce už je pozdě');
  assert.equal(vyprsi(ted + 300_000, ted), false);
});

test('token jde jen na doménu TONE3000', () => {
  assert.equal(jejichAdresa('https://www.tone3000.com/api/v1/models/1/file'), true);
  assert.equal(jejichAdresa('https://cdn.tone3000.com/x.nam'), true);
  assert.equal(jejichAdresa('https://zloduch.example/x.nam'), false);
  // Podvod na konci jména domény.
  assert.equal(jejichAdresa('https://tone3000.com.zloduch.example/x.nam'), false);
  // Bez https se nikam nechodí.
  assert.equal(jejichAdresa('http://www.tone3000.com/x.nam'), false);
  assert.equal(jejichAdresa('nesmysl'), false);
});

test('na cizí adresu se hlavička s tokenem nepřidá', () => {
  assert.deepEqual(
    hlavickyProStazeni('https://www.tone3000.com/a.nam', 'TAJNE'),
    { Authorization: 'Bearer TAJNE' },
  );
  assert.deepEqual(hlavickyProStazeni('https://zloduch.example/a.nam', 'TAJNE'), {});
});

test('typ modelu se pozná z přípony i z architektury', () => {
  assert.equal(typModelu({ model_url: 'https://x/a.nam', architecture_version: null }), 'nam');
  assert.equal(typModelu({ model_url: 'https://x/a.wav?sig=1', architecture_version: null }), 'ir');
  // Bez přípony rozhodne architektura — tu mají jen NAM modely.
  assert.equal(typModelu({ model_url: 'https://x/soubor', architecture_version: '2' }), 'nam');
  assert.equal(typModelu({ model_url: 'https://x/soubor', architecture_version: null }), 'ir');
});

test('jméno tvůrce padá zpátky na username', () => {
  const u = { id: 1, username: 'kytarista', is_verified: false, avatar_url: null, url: '' };
  assert.equal(jmenoTvurce({ ...u, display_name: null }), 'kytarista');
  assert.equal(jmenoTvurce({ ...u, display_name: 'Kytarista Známý' }), 'Kytarista Známý');
});

test('hlídač pustí sto dotazů a stoprvní odloží', () => {
  const h = new Hlidac(100);
  const t0 = 1_000_000;
  for (let i = 0; i < 100; i++) {
    assert.equal(h.cekani(t0 + i), 0, `dotaz ${i} měl projít`);
    h.zapis(t0 + i);
  }
  assert.ok(h.cekani(t0 + 100) > 0, 'stoprvní se má odložit');
  // Za minutu od prvního je zase volno.
  assert.equal(h.cekani(t0 + 60_001), 0);
});
