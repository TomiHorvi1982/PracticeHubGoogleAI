import test from 'node:test';
import assert from 'node:assert/strict';

import { coUkazat, jeAdresaZaka } from './vstupniBrana';

test('dokud se neví, kdo je přihlášený, neukáže se nic', () => {
  /*
   * Přihlášení se po načtení obnovuje ze Supabase až za chvíli. Kdyby se
   * mezitím ukázala brána, přihlášenému by probliklo přihlašování; kdyby
   * studio, nepřihlášený by ho na okamžik viděl celé.
   */
  assert.equal(coUkazat({ pripraveno: false, prihlasen: false }), 'cekani');
  assert.equal(coUkazat({ pripraveno: false, prihlasen: true }), 'cekani');
});

test('nepřihlášený dostane jen bránu', () => {
  assert.equal(coUkazat({ pripraveno: true, prihlasen: false }), 'brana');
});

test('přihlášený projde', () => {
  assert.equal(coUkazat({ pripraveno: true, prihlasen: true }), 'dovnitr');
});

test('adresa pro žáky', () => {
  assert.equal(jeAdresaZaka('/zak'), true);
  assert.equal(jeAdresaZaka('/zak/'), true);
  assert.equal(jeAdresaZaka('/ZAK'), true, 'velká písmena z přepsaného odkazu');
  assert.equal(jeAdresaZaka('/'), false);
  assert.equal(jeAdresaZaka('/zakaznik'), false, 'jen celé slovo');
  assert.equal(jeAdresaZaka(''), false);
});
