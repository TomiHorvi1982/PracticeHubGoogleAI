import test from 'node:test';
import assert from 'node:assert/strict';

import { OPRAVNENI, adresaBezLocalhostu, precitNavrat, urlAutorizace, vyprsi } from './spotifyPrihlaseni';

test('z localhostu se nabídne 127.0.0.1 se stejným portem a cestou', () => {
  // Spotify localhost jako návratovou adresu nepřijme, 127.0.0.1 ano.
  assert.equal(adresaBezLocalhostu('http://localhost:3000/'), 'http://127.0.0.1:3000/');
  assert.equal(adresaBezLocalhostu('http://LOCALHOST:5173/x?y=1'), 'http://127.0.0.1:5173/x?y=1');
  assert.equal(adresaBezLocalhostu('http://app.localhost:3000/'), 'http://127.0.0.1:3000/');
});

test('adresy, se kterými Spotify problém nemá, se nechají být', () => {
  assert.equal(adresaBezLocalhostu('http://127.0.0.1:3000/'), null);
  assert.equal(adresaBezLocalhostu('http://[::1]:3000/'), null);
  assert.equal(adresaBezLocalhostu('https://neverlast.vercel.app/'), null);
  assert.equal(adresaBezLocalhostu('https://mylocalhost.cz/'), null, 'jen hostitel localhost, ne podřetězec');
  assert.equal(adresaBezLocalhostu('nesmysl'), null);
});

test('adresa autorizace: PKCE a jen čtení playlistů', () => {
  const u = new URL(urlAutorizace({ clientId: 'k', navrat: 'http://127.0.0.1:3000/spotify-callback.html', vyzva: 'V', state: 'S' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), 'V');
  assert.equal(u.searchParams.get('state'), 'S');
  assert.equal(u.searchParams.get('scope'), OPRAVNENI.join(' '));
  assert.ok(OPRAVNENI.every((o) => o.startsWith('playlist-read')), 'o nic víc aplikace nežádá');
});

test('návrat: state první, pak chyba, pak kód', () => {
  assert.deepEqual(precitNavrat('?code=K&state=S', 'S'), { ok: true, code: 'K' });
  assert.equal(precitNavrat('?code=K&state=CIZI', 'S').ok, false, 'cizí state');
  assert.equal(precitNavrat('?code=K&state=S', null).ok, false, 'bez uloženého state');
  assert.match((precitNavrat('?error=access_denied&state=S', 'S') as any).chyba, /odmítnuto/);
  assert.equal(precitNavrat('?state=S', 'S').ok, false, 'bez kódu');
});

test('token se obnovuje s předstihem', () => {
  assert.equal(vyprsi(80_000, 30_000), true, 'zbývá 50 s — méně než minutová rezerva');
  assert.equal(vyprsi(200_000, 30_000), false, 'zbývá 170 s');
});
