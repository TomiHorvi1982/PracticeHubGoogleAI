import test from 'node:test';
import assert from 'node:assert/strict';

import { bezpecneJmeno } from './tone3000';

test('jméno souboru nemůže utéct ze složky', () => {
  assert.equal(bezpecneJmeno('../../evil', 7, 'nam'), 'evil [7].nam');
  assert.equal(bezpecneJmeno('a/b/c', 7, 'nam'), 'a b c [7].nam');
  assert.equal(bezpecneJmeno('...', 7, 'nam'), 'tone3000-7.nam');
});

test('jméno, ze kterého nic nezbude, spadne na ID', () => {
  assert.equal(bezpecneJmeno('', 12, 'ir'), 'tone3000-12.wav');
  assert.equal(bezpecneJmeno('***', 12, 'ir'), 'tone3000-12.wav');
});

test('diakritika v názvu zůstane, přípona odpovídá typu', () => {
  assert.equal(bezpecneJmeno('Křupavý Marshall', 3, 'nam'), 'Křupavý Marshall [3].nam');
  assert.equal(bezpecneJmeno('V30 bedna', 4, 'ir'), 'V30 bedna [4].wav');
});

test('dlouhé jméno se ořízne, ale zůstane použitelné', () => {
  const j = bezpecneJmeno('x'.repeat(300), 9, 'nam');
  assert.ok(j.length < 100, j.length.toString());
  assert.ok(j.endsWith(' [9].nam'));
});
