import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kategorieVyberu, strankovani, vzorHledani, ZVUKOVE_MIME, NEJVIC, NA_STRANU, VSE,
} from './vyberSamplu.js';

test('nástroj beze změny vrací svoje kategorie', () => {
  assert.deepEqual(kategorieVyberu('bicí', undefined), ['drum_loop']);
  assert.deepEqual(kategorieVyberu('stopy', undefined), ['stem_mix']);
});

test('neznámý nástroj spadne na bicí, ne na prázdno', () => {
  assert.deepEqual(kategorieVyberu('nesmysl', undefined), ['drum_loop']);
  assert.deepEqual(kategorieVyberu(undefined, undefined), ['drum_loop']);
});

test('výslovná kategorie přebije nástroj — tudy se jde k bicím vzorkům', () => {
  assert.deepEqual(kategorieVyberu('bicí', 'drum_kit_sample'), ['drum_kit_sample']);
});

test('„vše" znamená bez omezení kategorií', () => {
  assert.equal(kategorieVyberu(undefined, VSE), null);
  assert.equal(kategorieVyberu(VSE, undefined), null);
});

test('MIDI se mezi vzorky nepočítá', () => {
  assert.ok(!ZVUKOVE_MIME.includes('audio/midi'), 'MIDI není vzorek k poslechu');
  assert.deepEqual(ZVUKOVE_MIME, ['audio/wav', 'audio/mpeg']);
});

test('stránkování počítá konec rozsahu včetně', () => {
  assert.deepEqual(strankovani(0, 200), { od: 0, limit: 200, do: 199 });
  assert.deepEqual(strankovani(200, 200), { od: 200, limit: 200, do: 399 });
});

test('záporný začátek se ořízne na nulu', () => {
  assert.equal(strankovani(-50, 100).od, 0);
});

test('přehnaná velikost stránky se ořízne na strop', () => {
  assert.equal(strankovani(0, 100000).limit, NEJVIC);
  assert.equal(strankovani(0, 0).limit, NA_STRANU);
});

test('nesmysl v adrese nedá NaN', () => {
  const s = strankovani('abc', 'xyz');
  assert.equal(s.od, 0);
  assert.equal(s.limit, NA_STRANU);
  assert.ok(Number.isFinite(s.do));
});

test('žolíky v hledání se zneškodní', () => {
  assert.equal(vzorHledani('100%'), '%100\\%%');
  assert.equal(vzorHledani('a_b'), '%a\\_b%');
});
