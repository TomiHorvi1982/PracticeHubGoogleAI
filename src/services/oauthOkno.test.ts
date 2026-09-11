import test from 'node:test';
import assert from 'node:assert/strict';

import { KANAL_NAVRATU, cekejNaNavrat, stateZHledani } from './oauthOkno';

/** Tak, jak to dělá návratová stránka. Kanál se hned zavře. */
function posli(data: unknown) {
  const k = new BroadcastChannel(KANAL_NAVRATU);
  k.postMessage(data);
  k.close();
}

test('návrat přes BroadcastChannel ukončí čekání', async () => {
  // Tohle je cesta, která funguje i pod COOP: same-origin, kdy okno
  // nemá `opener`.
  const cekani = cekejNaNavrat('spotify-navrat', { ocekavanyState: 'abc', casovyLimitMs: 2000 });
  posli({ typ: 'spotify-navrat', hledani: '?code=K&state=abc' });
  assert.deepEqual(await cekani, { ok: true, hledani: '?code=K&state=abc' });
});

test('návrat s cizím state se ignoruje, nečeká se na něj chybou', async () => {
  // Jiná karta aplikace dokončila vlastní přihlášení — tohle čekání to nesmí ukončit.
  const cekani = cekejNaNavrat('spotify-navrat', { ocekavanyState: 'moje', casovyLimitMs: 2000 });
  posli({ typ: 'spotify-navrat', hledani: '?code=CIZI&state=cizi' });
  posli({ typ: 'spotify-navrat', hledani: '?code=MOJE&state=moje' });
  assert.deepEqual(await cekani, { ok: true, hledani: '?code=MOJE&state=moje' });
});

test('zpráva pro jinou službu se ignoruje', async () => {
  const cekani = cekejNaNavrat('spotify-navrat', { casovyLimitMs: 80 });
  posli({ typ: 't3k-navrat', hledani: '?code=X' });
  const v = await cekani;
  assert.equal(v.ok, false, 'dočkal se jen časového limitu');
});

test('časový limit', async () => {
  const v = await cekejNaNavrat('spotify-navrat', { casovyLimitMs: 30 });
  assert.equal(v.ok, false);
  assert.match((v as any).chyba, /včas/);
});

test('zrušení z aplikace', async () => {
  const ctrl = new AbortController();
  const cekani = cekejNaNavrat('spotify-navrat', { signal: ctrl.signal, casovyLimitMs: 2000 });
  ctrl.abort();
  assert.deepEqual(await cekani, { ok: false, chyba: 'Přihlášení bylo zrušeno.', zruseno: true });
});

test('už zrušené čekání skončí hned', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const v = await cekejNaNavrat('spotify-navrat', { signal: ctrl.signal });
  assert.equal((v as any).zruseno, true);
});

test('state z návratové adresy', () => {
  assert.equal(stateZHledani('?code=a&state=xyz'), 'xyz');
  assert.equal(stateZHledani('?code=a'), null);
});
