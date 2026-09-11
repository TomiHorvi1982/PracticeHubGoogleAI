import test from 'node:test';
import assert from 'node:assert/strict';

import { maSePrekreslit } from './prekresleniTabu';

test('opraví se tabulatura vykreslená naslepo', () => {
  assert.equal(maSePrekreslit({ sirka: 1200, maSkore: true, kresleno0Sirkou: true }), true);
});

test('běžný návrat do sekce nic nepřekresluje', () => {
  // Tohle je ten důvod, proč se neptáme jen na viditelnost: překreslení
  // velké tabulatury trvá vteřiny a při každém přepnutí by bylo znát.
  assert.equal(maSePrekreslit({ sirka: 1200, maSkore: true, kresleno0Sirkou: false }), false);
});

test('do schované sekce se kreslit nezačne', () => {
  assert.equal(maSePrekreslit({ sirka: 0, maSkore: true, kresleno0Sirkou: true }), false);
});

test('bez načtené tabulatury není co kreslit', () => {
  assert.equal(maSePrekreslit({ sirka: 1200, maSkore: false, kresleno0Sirkou: true }), false);
});
