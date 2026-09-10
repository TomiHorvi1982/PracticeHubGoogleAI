import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LADENI, NEJNIZSI, NEJVYSSI, jeStandardni, najdiPreset, odchylkaOdStandardu,
  omezStrunu, platneLadeni, popisLadeni, posunLadeni, posunStrunu,
} from './ladeniKytary';
import {
  STANDARDNI_LADENI, jmenaStrun, midiNaPrazci, naTabulaturu, polohyStupnice,
  stupniceVPoloze,
} from './cvikyTechnik';

const standard = () => [...STANDARDNI_LADENI];

test('všechna hotová ladění mají šest strun v mezích', () => {
  for (const l of LADENI) {
    assert.equal(l.struny.length, 6, `${l.nazev} nemá šest strun`);
    assert.ok(platneLadeni(l.struny), `${l.nazev} je mimo meze`);
  }
});

test('drop ladění se liší jen nejnižší strunou', () => {
  const std = LADENI.find((l) => l.id === 'standard')!.struny;
  const drop = LADENI.find((l) => l.id === 'dropD')!.struny;
  assert.equal(drop[0], std[0] - 2, 'nejnižší o celý tón dolů');
  assert.deepEqual(drop.slice(1), std.slice(1), 'ostatní se nesmí hnout');
});

test('drop C je drop D o celý tón níž', () => {
  const dropD = LADENI.find((l) => l.id === 'dropD')!.struny;
  const dropC = LADENI.find((l) => l.id === 'dropC')!.struny;
  assert.deepEqual(dropC, dropD.map((m) => m - 2));
});

test('jména strun se počítají z ladění', () => {
  assert.deepEqual(jmenaStrun(standard()), ['E', 'A', 'D', 'G', 'H', 'e']);
  const dropD = LADENI.find((l) => l.id === 'dropD')!.struny;
  assert.deepEqual(jmenaStrun(dropD), ['D', 'A', 'D', 'G', 'H', 'e']);
  const dadgad = LADENI.find((l) => l.id === 'dadgad')!.struny;
  assert.deepEqual(jmenaStrun(dadgad), ['D', 'A', 'D', 'G', 'A', 'd']);
});

test('přeladěná struna změní tón na pražci', () => {
  const dropD = posunStrunu(standard(), 0, -2);
  assert.equal(midiNaPrazci(0, 0, standard()), 40, 'E2 naprázdno');
  assert.equal(midiNaPrazci(0, 0, dropD), 38, 'D2 naprázdno');
  assert.equal(midiNaPrazci(0, 5, dropD), 43, 'pátý pražec je pořád pátý');
  // Ostatní struny zůstaly.
  assert.equal(midiNaPrazci(3, 7, dropD), midiNaPrazci(3, 7, standard()));
});

test('struna se nepřeladí mimo meze', () => {
  assert.equal(omezStrunu(NEJNIZSI - 10), NEJNIZSI);
  assert.equal(omezStrunu(NEJVYSSI + 10), NEJVYSSI);
  const dole = posunStrunu(standard(), 0, -100);
  assert.equal(dole[0], NEJNIZSI);
});

test('posun celé kytary se buď povede celý, nebo vůbec', () => {
  const dolu = posunLadeni(standard(), -2);
  assert.deepEqual(dolu, STANDARDNI_LADENI.map((m) => m - 2));
  // Kdyby se krajní struna zastavila a ostatní jely dál, ladění by se
  // po pár kliknutích tiše zdeformovalo.
  const moc = posunLadeni(standard(), -100);
  assert.deepEqual(moc, standard(), 'mimo meze se nesmí hnout nic');
});

test('hotové ladění se pozná, vlastní ne', () => {
  assert.equal(najdiPreset(standard())?.id, 'standard');
  assert.equal(najdiPreset(posunStrunu(standard(), 0, -2))?.id, 'dropD');
  assert.equal(najdiPreset(posunStrunu(standard(), 2, -1)), null, 'tohle nikdo nemá');
});

test('popis ladění pojmenuje hotové, vlastní vypíše', () => {
  assert.equal(popisLadeni(standard()), 'Standardní E');
  assert.equal(popisLadeni(posunStrunu(standard(), 2, -1)), 'E A C# G H e');
});

test('odchylka od standardu se počítá po strunách', () => {
  const dropD = posunStrunu(standard(), 0, -2);
  assert.equal(odchylkaOdStandardu(dropD, 0), -2);
  assert.equal(odchylkaOdStandardu(dropD, 3), 0);
  assert.equal(jeStandardni(standard()), true);
  assert.equal(jeStandardni(dropD), false);
});

test('rozbité uložené ladění se nepřijme', () => {
  assert.equal(platneLadeni(null), false);
  assert.equal(platneLadeni([40, 45, 50]), false, 'málo strun');
  assert.equal(platneLadeni([40, 45, 50, 55, 59, 64, 69]), false, 'moc strun');
  assert.equal(platneLadeni([40, 45, 50, 55, 59, 999]), false, 'mimo meze');
  assert.equal(platneLadeni([40, 45, 50, 55, 59, 64.5]), false, 'půltón a půl neexistuje');
  assert.equal(platneLadeni(standard()), true);
});

test('stupnice se v jiném ladění najde jinde na krku', () => {
  /*
   * Tohle je celý smysl věci: E moll pentatonika leží ve standardu na
   * dvanáctém pražci nejnižší struny, v drop D o dva pražce výš, protože
   * struna je o dva půltóny níž.
   */
  const dropD = posunStrunu(standard(), 0, -2);
  assert.deepEqual(polohyStupnice(40, standard()), [0, 12]);
  // V drop D o dva pražce výš. Druhá oktáva (14) vypadne, protože se
  // polohy hledají jen do dvanáctého pražce — výš už se stupnice necvičí.
  assert.deepEqual(polohyStupnice(40, dropD), [2]);
});

test('tóny stupnice v poloze se ladění přizpůsobí', () => {
  const dropD = posunStrunu(standard(), 0, -2);
  const kroky = [0, 3, 5, 7, 10];                    // mollová pentatonika
  const vStd = stupniceVPoloze(40, kroky, 5, standard());
  const vDrop = stupniceVPoloze(40, kroky, 5, dropD);
  // Na přeladěné struně padnou tóny na jiné pražce.
  const stdNula = vStd.filter((t) => t.struna === 0).map((t) => t.prazec);
  const dropNula = vDrop.filter((t) => t.struna === 0).map((t) => t.prazec);
  assert.notDeepEqual(stdNula, dropNula);
  // A pořád to jsou tóny té stupnice.
  for (const t of vDrop) {
    assert.ok(kroky.includes(((midiNaPrazci(t.struna, t.prazec, dropD) - 40) % 12 + 12) % 12));
  }
});

test('tabulatura pojmenuje struny podle ladění', () => {
  const dropD = posunStrunu(standard(), 0, -2);
  const tab = naTabulaturu([{ struna: 0, prazec: 5 }], dropD);
  const radky = tab.split('\n');
  assert.equal(radky.length, 6);
  // Nejnižší struna je poslední řádek a v drop D se jmenuje D, ne E.
  assert.ok(radky[5].startsWith('D|'), `čekal jsem D, mám: ${radky[5]}`);
  assert.ok(radky[0].startsWith('e|'), `nejvyšší struna malým e: ${radky[0]}`);
});

test('dlouhá jména strun tabulaturu nerozhodí', () => {
  // C# je o znak delší než E; bez zarovnání by se svislice rozjely.
  const dropCis = LADENI.find((l) => l.id === 'dropCis')!.struny;
  const radky = naTabulaturu([{ struna: 0, prazec: 3 }], dropCis).split('\n');
  const svislice = radky.map((r) => r.indexOf('|'));
  assert.equal(new Set(svislice).size, 1, `svislice se rozjely: ${svislice}`);
});
