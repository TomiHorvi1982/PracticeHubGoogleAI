import test from 'node:test';
import assert from 'node:assert/strict';

import { ZDROJE_NAD_SEKCEMI, jeVidet, pridejZivou } from './zivotSekci';
import { audioBus } from './audioBus';

test('nová sekce se přidá na konec', () => {
  assert.deepEqual(pridejZivou(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(pridejZivou([], 'a'), ['a']);
});

test('už živá sekce se nepřidá podruhé', () => {
  const zive = ['a', 'b'];
  assert.equal(pridejZivou(zive, 'a'), zive, 'má se vrátit tentýž seznam');
});

test('pořadí se nikdy nepřeskládá', () => {
  /*
   * Tohle je celý důvod, proč se návrat k sekci nepřesouvá dopředu:
   * pořadí v seznamu určuje pořadí ve stromu a jeho změna by Reactu
   * řekla, ať komponenty postaví znovu — tedy přesně to, čemu se tu
   * snažíme zabránit.
   */
  let zive: readonly string[] = [];
  for (const s of ['mix', 'texty', 'mix', 'editor', 'texty']) zive = pridejZivou(zive, s);
  assert.deepEqual(zive, ['mix', 'texty', 'editor']);
});

test('vidět je právě jedna sekce', () => {
  assert.equal(jeVidet('mix', 'mix'), true);
  assert.equal(jeVidet('mix', 'texty'), false);
});

test('přepnutí sekce zastaví zvuk sekcí, ale ne spodní lištu', () => {
  const zastaveno: string[] = [];
  const odhlas = [
    audioBus.register('global-player', () => zastaveno.push('global-player')),
    audioBus.register('mixazni-pult', () => zastaveno.push('mixazni-pult')),
    audioBus.register('bicí', () => zastaveno.push('bicí')),
  ];
  audioBus.claim('mixazni-pult', 'Mix', 'Pult');
  // `claim` sám zastavuje ostatní; měříme až samotné přepnutí sekce.
  zastaveno.length = 0;

  audioBus.stopExcept(ZDROJE_NAD_SEKCEMI);

  assert.deepEqual(zastaveno.sort(), ['bicí', 'mixazni-pult']);
  assert.equal(audioBus.current(), null, 'hlášení se smaže, protože hrál zastavený zdroj');
  odhlas.forEach((f) => f());
});

test('hraje-li spodní lišta, přepnutí sekce ji nechá být', () => {
  const zastaveno: string[] = [];
  const odhlas = [
    audioBus.register('global-player', () => zastaveno.push('global-player')),
    audioBus.register('bicí', () => zastaveno.push('bicí')),
  ];
  audioBus.claim('global-player', 'Skladba', 'Přehrávač');
  zastaveno.length = 0;

  audioBus.stopExcept(ZDROJE_NAD_SEKCEMI);

  assert.deepEqual(zastaveno, ['bicí']);
  assert.equal(audioBus.current()?.id, 'global-player', 'hlášení musí zůstat');
  odhlas.forEach((f) => f());
  audioBus.release('global-player');
});

test('rozbitý zdroj nezablokuje zastavení ostatních', () => {
  const zastaveno: string[] = [];
  const odhlas = [
    audioBus.register('rozbity', () => { throw new Error('bum'); }),
    audioBus.register('funkcni', () => zastaveno.push('funkcni')),
  ];
  audioBus.stopExcept([]);
  assert.deepEqual(zastaveno, ['funkcni']);
  odhlas.forEach((f) => f());
});
