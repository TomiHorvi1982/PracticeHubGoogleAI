import { test } from 'node:test';
import assert from 'node:assert/strict';
import { klicNapovedy, maBytRozbalena, hodnotaProUlozeni } from './napoveda';

test('klíč je pro každou sekci jiný', () => {
  assert.notEqual(klicNapovedy('mixer'), klicNapovedy('texty'));
  assert.match(klicNapovedy('mixer'), /mixer$/);
});

test('poprvé se nápověda ukáže', () => {
  assert.equal(maBytRozbalena(null), true);
});

test('po zavření zůstane sbalená', () => {
  assert.equal(maBytRozbalena('zavreno'), false);
  assert.equal(maBytRozbalena('otevreno'), true);
});

test('rozbité úložiště radši nápovědu ukáže, než zatají', () => {
  // Ukázat ji navíc je menší škoda než ji schovat někomu, kdo ji nezná.
  assert.equal(maBytRozbalena('nesmysl'), true);
  assert.equal(maBytRozbalena(''), true);
});

test('ukládaná hodnota odpovídá tomu, co se čte zpět', () => {
  assert.equal(maBytRozbalena(hodnotaProUlozeni(false)), false);
  assert.equal(maBytRozbalena(hodnotaProUlozeni(true)), true);
});
