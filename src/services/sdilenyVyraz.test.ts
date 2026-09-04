import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maHledatZnovu, vyrazZeSkladby } from './sdilenyVyraz';

test('prázdný a jednopísmenný výraz se nehledá', () => {
  assert.equal(maHledatZnovu('', null), false);
  assert.equal(maHledatZnovu('a', null), false);
  assert.equal(maHledatZnovu('  ', null), false);
});

test('nový výraz se hledá', () => {
  assert.equal(maHledatZnovu('sepultura', null), true);
  assert.equal(maHledatZnovu('sepultura', 'metallica'), true);
});

test('týž výraz se nehledá podruhé', () => {
  // Přepínání mezi sekcemi by jinak posílalo tentýž dotaz pořád dokola.
  assert.equal(maHledatZnovu('sepultura', 'sepultura'), false);
  assert.equal(maHledatZnovu(' sepultura ', 'sepultura'), false);
});

test('výraz ze skladby začíná interpretem', () => {
  assert.equal(vyrazZeSkladby('Sepultura', 'Roots'), 'Sepultura Roots');
  assert.equal(vyrazZeSkladby(undefined, 'Roots'), 'Roots');
  assert.equal(vyrazZeSkladby('Sepultura', undefined), 'Sepultura');
  assert.equal(vyrazZeSkladby('', ''), '');
});
