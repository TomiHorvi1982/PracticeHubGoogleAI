import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tonikaZPredznamenani, tonika } from './tonina';

test('bez předznamenání je C dur a A moll', () => {
  assert.equal(tonikaZPredznamenani(0, false), 'C');
  assert.equal(tonikaZPredznamenani(0, true), 'Am');
});

test('křížky jdou po kvintách nahoru', () => {
  assert.equal(tonikaZPredznamenani(1, false), 'G');
  assert.equal(tonikaZPredznamenani(2, false), 'D');
  assert.equal(tonikaZPredznamenani(4, false), 'E');
  assert.equal(tonikaZPredznamenani(7, false), 'C#');
});

test('béčka jdou po kvartách', () => {
  assert.equal(tonikaZPredznamenani(-1, false), 'F');
  assert.equal(tonikaZPredznamenani(-2, false), 'Bb');
  assert.equal(tonikaZPredznamenani(-4, false), 'Ab');
  assert.equal(tonikaZPredznamenani(-7, false), 'Cb');
});

test('moll je paralelní k témuž předznamenání', () => {
  // Stejné předznamenání, o malou tercii níž.
  assert.equal(tonikaZPredznamenani(1, true), 'Em');
  assert.equal(tonikaZPredznamenani(-1, true), 'Dm');
  assert.equal(tonikaZPredznamenani(3, true), 'F#m');
  assert.equal(tonikaZPredznamenani(-3, true), 'Cm');
});

test('nesmyslné předznamenání nespadne', () => {
  // Poškozený soubor nesmí shodit přehrávač kvůli názvu tóniny.
  assert.equal(tonikaZPredznamenani(99, false), 'C#');
  assert.equal(tonikaZPredznamenani(-99, true), 'Abm');
  assert.equal(tonikaZPredznamenani(NaN as any, false), 'C');
});

test('tónika se zbaví moll přípony', () => {
  assert.equal(tonika('Em'), 'E');
  assert.equal(tonika('Bbm'), 'Bb');
  assert.equal(tonika('C'), 'C');
});
