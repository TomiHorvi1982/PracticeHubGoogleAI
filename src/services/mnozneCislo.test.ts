import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mnozne, skladby, soubory } from './mnozneCislo';

test('tři tvary podle počtu', () => {
  assert.equal(skladby(1), '1 skladba');
  assert.equal(skladby(2), '2 skladby');
  assert.equal(skladby(4), '4 skladby');
  assert.equal(skladby(5), '5 skladeb');
  assert.equal(skladby(0), '0 skladeb');
});

test('platí i pro vyšší čísla', () => {
  // Dvacet jedna bere tvar pro pět, ne pro jednu.
  assert.equal(skladby(21), '21 skladeb');
  assert.equal(skladby(102), '102 skladeb');
});

test('soubory se skloňují stejně', () => {
  assert.equal(soubory(1), '1 soubor');
  assert.equal(soubory(3), '3 soubory');
  assert.equal(soubory(9), '9 souborů');
});

test('vlastní tvary jdou dodat', () => {
  assert.equal(mnozne(2, ['stopa', 'stopy', 'stop']), '2 stopy');
  assert.equal(mnozne(7, ['stopa', 'stopy', 'stop']), '7 stop');
});
