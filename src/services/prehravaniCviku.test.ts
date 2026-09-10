import test from 'node:test';
import assert from 'node:assert/strict';

import { Tonu, poSekvenci } from './cvikyTechnik';
import { dalsiCas, dalsiIndex, delkaKroku, jeHraneTeď } from './prehravaniCviku';

const t = (struna: number, prazec: number): Tonu => ({ struna, prazec });

test('bez smyčky cvik po posledním tónu skončí', () => {
  assert.equal(dalsiIndex(0, 3, false), 1);
  assert.equal(dalsiIndex(1, 3, false), 2);
  assert.equal(dalsiIndex(2, 3, false), -1);
});

test('ve smyčce se po posledním tónu vrací na začátek', () => {
  assert.equal(dalsiIndex(2, 3, true), 0);
  assert.equal(dalsiIndex(0, 1, true), 0, 'jednotónový cvik se točí na místě');
});

test('prázdný cvik nehraje ani ve smyčce', () => {
  assert.equal(dalsiIndex(0, 0, true), -1);
  assert.equal(dalsiIndex(0, 0, false), -1);
});

test('krok je osmina a pomalu než dvacet se nejde', () => {
  assert.equal(delkaKroku(60), 0.5);
  assert.equal(delkaKroku(120), 0.25);
  // Nula z posuvníku by jinak dělila nulou a vyrobila nekonečnou pauzu.
  assert.equal(delkaKroku(0), delkaKroku(20));
  assert.equal(delkaKroku(-5), delkaKroku(20));
});

test('ve smyčce se nenasbírá zpoždění', () => {
  // Cíle se sčítají z cílů, ne z okamžiku, kdy se časovač opravdu spustil.
  let cil = 0;
  for (let i = 0; i < 10000; i++) cil = dalsiCas(cil, 120);
  assert.equal(cil, 10000 * 250, 'deset tisíc kroků přesně na čas');
});

test('změna tempa se projeví až na dalším kroku', () => {
  /*
   * Kdyby se cíl počítal jako `zacatek + n * krok`, zrychlení uprostřed
   * cviku by přepočítalo i uplynulou část a zbytek by se vysypal naráz.
   */
  let cil = dalsiCas(0, 60);              // 500 ms
  assert.equal(cil, 500);
  cil = dalsiCas(cil, 120);               // dvakrát rychleji, ale až teď
  assert.equal(cil, 750, 'uplynulá část se nepřepočítává');
});

test('svítí ten pražec, který se zrovna hraje', () => {
  const tony = [t(0, 5), t(0, 7), t(1, 5)];
  assert.equal(jeHraneTeď(tony, 1, 0, 7), true);
  assert.equal(jeHraneTeď(tony, 1, 0, 5), false);
  assert.equal(jeHraneTeď(tony, -1, 0, 5), false, 'když se nehraje, nesvítí nic');
});

test('hmatník bliká i na zpáteční cestě', () => {
  /*
   * Tohle je ta nahlášená chyba. Sekvence „rovně" projde stupnici nahoru
   * a stejné pražce znovu dolů. Dřívější `findIndex` našel vždycky první
   * výskyt, takže se index přehrávaného tónu na zpáteční cestě nikdy
   * netrefil a hmatník od poloviny cviku zhasl.
   */
  const stupnice = [t(0, 5), t(0, 7), t(0, 8)];
  const cvik = poSekvenci(stupnice, 'rovne');
  assert.deepEqual(cvik.map((x) => x.prazec), [5, 7, 8, 7, 5], 'nahoru a zpátky');

  // Index 3 je pražec 7 na cestě dolů — tentýž pražec jako index 1.
  assert.equal(jeHraneTeď(cvik, 3, 0, 7), true, 'na zpáteční cestě musí svítit');
  assert.equal(jeHraneTeď(cvik, 4, 0, 5), true, 'i poslední tón cesty zpátky');
  // A nesmí svítit dva naráz.
  assert.equal(jeHraneTeď(cvik, 3, 0, 5), false);
  assert.equal(jeHraneTeď(cvik, 3, 0, 8), false);
});

test('index mimo cvik nesvítí', () => {
  const tony = [t(0, 5)];
  assert.equal(jeHraneTeď(tony, 9, 0, 5), false);
  assert.equal(jeHraneTeď([], 0, 0, 0), false);
});

test('sekvence „jak je" nechá tóny být', () => {
  const riff = [t(5, 12), t(4, 10), t(5, 12)];
  assert.deepEqual(poSekvenci(riff, 'jakJe'), riff);
  // A nevrací tentýž objekt, aby se do něj nedalo psát zvenčí.
  assert.notEqual(poSekvenci(riff, 'jakJe'), riff);
});
