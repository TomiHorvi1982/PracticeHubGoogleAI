import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STANDARDNI_LADENI, STUPNICE, cvikyTechnik, midiNaPrazci, nazevTonu, naTabulaturu,
  poSekvenci, polohyStupnice, stupniceVPoloze,
} from './cvikyTechnik';

test('ladění sedí na skutečné tóny kytary', () => {
  // E2 A2 D3 G3 H3 E4 — to, co slyší ladička.
  assert.deepEqual(STANDARDNI_LADENI.map(nazevTonu), ['E', 'A', 'D', 'G', 'H', 'E']);
  // Pátý pražec šesté struny je A — na tom stojí ladění po sluchu.
  assert.equal(nazevTonu(midiNaPrazci(0, 5)), 'A');
  // Dvanáctý pražec je oktáva.
  assert.equal(midiNaPrazci(0, 12) - midiNaPrazci(0, 0), 12);
});

test('durová stupnice má intervaly, které mít má', () => {
  const dur = STUPNICE.find((s) => s.id === 'dur')!;
  const rozdily = dur.kroky.slice(1).map((k, i) => k - dur.kroky[i]);
  assert.deepEqual(rozdily, [2, 2, 1, 2, 2, 2], 'celý-celý-půl-celý-celý-celý');
});

test('mollová pentatonika má pět tónů a malou tercii', () => {
  const p = STUPNICE.find((s) => s.id === 'pentatonika_moll')!;
  assert.equal(p.kroky.length, 5);
  assert.equal(p.kroky[1], 3);
});

test('stupnice v poloze zůstane v okně čtyř pražců', () => {
  const dur = STUPNICE.find((s) => s.id === 'dur')!;
  const t = stupniceVPoloze(40, dur.kroky, 5); // E dur od 5. pražce
  assert.ok(t.length > 0);
  for (const x of t) {
    assert.ok(x.prazec >= 5 && x.prazec <= 9, `pražec ${x.prazec} je mimo okno`);
    assert.ok(x.struna >= 0 && x.struna < 6);
  }
});

test('v poloze jsou jen tóny, které do stupnice patří', () => {
  const moll = STUPNICE.find((s) => s.id === 'moll')!;
  const zaklad = 45; // A
  const patri = new Set(moll.kroky.map((k) => (zaklad + k) % 12));
  for (const t of stupniceVPoloze(zaklad, moll.kroky, 5)) {
    assert.ok(patri.has(midiNaPrazci(t.struna, t.prazec) % 12),
      `${nazevTonu(midiNaPrazci(t.struna, t.prazec))} do A moll nepatří`);
  }
});

test('tóny jdou odspodu nahoru, ne zpřeházeně', () => {
  const dur = STUPNICE.find((s) => s.id === 'dur')!;
  const t = stupniceVPoloze(40, dur.kroky, 5);
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1]; const b = t[i];
    assert.ok(b.struna > a.struna || (b.struna === a.struna && b.prazec > a.prazec),
      'pořadí se má držet strun a pražců');
  }
});

test('polohy stupnice leží tam, kde je základní tón', () => {
  // E na šesté struně: prázdná (0) a dvanáctý pražec.
  assert.deepEqual(polohyStupnice(40), [0, 12]);
  // A na šesté struně je pátý pražec.
  assert.ok(polohyStupnice(45).includes(5));
});

test('sekvence po třech opakuje tóny s posunem', () => {
  const t = [0, 1, 2, 3, 4].map((p) => ({ struna: 0, prazec: p }));
  const v = poSekvenci(t, 'po3').map((x) => x.prazec);
  assert.deepEqual(v, [0, 1, 2, 1, 2, 3, 2, 3, 4]);
});

test('sekvence po čtyřech i v terciích dávají, co slibují', () => {
  const t = [0, 1, 2, 3, 4, 5].map((p) => ({ struna: 0, prazec: p }));
  assert.deepEqual(poSekvenci(t, 'po4').slice(0, 4).map((x) => x.prazec), [0, 1, 2, 3]);
  assert.deepEqual(poSekvenci(t, 'tercie').slice(0, 4).map((x) => x.prazec), [0, 2, 1, 3]);
});

test('rovná sekvence jde nahoru a zpátky bez zdvojeného vrcholu', () => {
  const t = [0, 1, 2].map((p) => ({ struna: 0, prazec: p }));
  assert.deepEqual(poSekvenci(t, 'rovne').map((x) => x.prazec), [0, 1, 2, 1, 0]);
});

test('prázdný vstup nespadne', () => {
  for (const s of ['rovne', 'po3', 'po4', 'tercie', 'nahoruDolu'] as const) {
    assert.deepEqual(poSekvenci([], s), []);
  }
});

test('tabulatura má šest řádků a nejvyšší struna nahoře', () => {
  const tab = naTabulaturu([{ struna: 0, prazec: 5 }, { struna: 5, prazec: 7 }]);
  const radky = tab.split('\n');
  assert.equal(radky.length, 6);
  assert.ok(radky[0].startsWith('e|'), 'nahoře patří vysoké e');
  assert.ok(radky[5].startsWith('E|'), 'dole basové E');
  // Pátý pražec nejnižší struny je na spodním řádku.
  assert.ok(radky[5].includes('5'));
  assert.ok(radky[0].includes('7'));
});

test('technika se v tabulatuře značí před tónem', () => {
  const tab = naTabulaturu([
    { struna: 2, prazec: 5 },
    { struna: 2, prazec: 7, technika: 'hammer' },
    { struna: 2, prazec: 5, technika: 'pull' },
  ]);
  const radek = tab.split('\n')[3]; // struna D je čtvrtá odshora
  assert.ok(radek.includes('h7'), `příklep chybí: ${radek}`);
  assert.ok(radek.includes('p5'), `odtah chybí: ${radek}`);
});

test('cviky technik pokrývají, co si člověk chce natrénovat', () => {
  const c = cvikyTechnik(5);
  const techniky = new Set(c.map((x) => x.technika));
  for (const t of ['trsatko', 'hammer', 'slide', 'bend', 'tapping'] as const) {
    assert.ok(techniky.has(t), `chybí cvik na ${t}`);
  }
  // Každý cvik má co hrát a rozumné rozpětí temp.
  for (const x of c) {
    assert.ok(x.tony.length > 0, `${x.nazev} nemá tóny`);
    assert.ok(x.bpmOd > 0 && x.bpmDo > x.bpmOd, `${x.nazev} má divná tempa`);
    assert.ok(x.pozor.length > 10, `${x.nazev} nemá na co upozornit`);
  }
});

test('cviky se dají posunout po krku a nevylezou z hmatníku', () => {
  for (const poloha of [1, 5, 12, 18]) {
    for (const c of cvikyTechnik(poloha)) {
      for (const t of c.tony) {
        assert.ok(t.prazec >= 0 && t.prazec <= 30, `${c.nazev}: pražec ${t.prazec}`);
        assert.ok(t.struna >= 0 && t.struna < 6, `${c.nazev}: struna ${t.struna}`);
      }
    }
  }
  // Nesmyslná poloha se srovná, ne aby vyrobila záporné pražce.
  assert.ok(cvikyTechnik(-50)[0].tony.every((t) => t.prazec >= 0));
  assert.ok(cvikyTechnik(999)[0].tony.every((t) => t.prazec <= 30));
});

test('všech dvanáct stupnic má jméno, popis i tóny', () => {
  assert.ok(STUPNICE.length >= 12);
  for (const s of STUPNICE) {
    assert.ok(s.kroky.length >= 5, `${s.nazev} má málo tónů`);
    assert.equal(s.kroky[0], 0, `${s.nazev} nezačíná na základním tónu`);
    assert.ok(s.kroky.every((k) => k >= 0 && k < 12), `${s.nazev} má krok mimo oktávu`);
    assert.ok(s.popis.length > 10, `${s.nazev} nemá popis`);
  }
  // Žádné dvě se nesmí jmenovat stejně ani mít stejné id.
  assert.equal(new Set(STUPNICE.map((s) => s.id)).size, STUPNICE.length);
});
