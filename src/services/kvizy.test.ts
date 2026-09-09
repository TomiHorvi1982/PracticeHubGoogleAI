import test from 'node:test';
import assert from 'node:assert/strict';

import { STANDARDNI_LADENI, TONY, midiNaPrazci } from './cvikyTechnik';
import { nahodaZeSemene } from './pracovniListy';
import {
  INTERVALY, Otazka, otazkaAkord, otazkaHmatnik, otazkaInterval, sestavKviz, vyhodnot,
} from './kvizy';

const psana = (i: number): Otazka => ({
  id: `p${i}`, druh: 'vyber', text: `Otázka ${i}`,
  moznosti: ['a', 'b'], spravne: 0,
});

test('u každé generované otázky je správná odpověď mezi možnostmi', () => {
  // Tohle je ta chyba, kterou by nikdo nenašel dřív než dítě: otázka,
  // na kterou se nedá odpovědět správně.
  for (let semeno = 1; semeno <= 60; semeno++) {
    for (let stupen = 1; stupen <= 6; stupen++) {
      const n = nahodaZeSemene(semeno * 31 + stupen);
      for (const o of [otazkaInterval(stupen, n), otazkaAkord(n), otazkaHmatnik(stupen, n)]) {
        assert.ok(o.spravne >= 0, `${o.id}: správná odpověď v nabídce není`);
        assert.ok(o.spravne < o.moznosti.length, `${o.id}: index mimo nabídku`);
        assert.ok(o.moznosti.length >= 2, `${o.id}: jediná možnost není otázka`);
        assert.equal(new Set(o.moznosti).size, o.moznosti.length, `${o.id}: možnost se opakuje`);
      }
    }
  }
});

test('interval hraje dva tóny po sobě a sedí na zadání', () => {
  for (let semeno = 1; semeno <= 40; semeno++) {
    const o = otazkaInterval(5, nahodaZeSemene(semeno));
    assert.equal(o.tony?.length, 2);
    assert.equal(o.spolu, false, 'dva tóny za sebou se dají dozpívat, souzvuk ne');
    const rozdil = o.tony![1] - o.tony![0];
    const nazev = o.moznosti[o.spravne];
    const ocekavany = INTERVALY.find((i) => i.nazev === nazev)!;
    assert.equal(rozdil, ocekavany.pultonu, `${nazev} má mít ${ocekavany.pultonu} půltónů`);
  }
});

test('mladší stupně dostanou míň intervalů na výběr', () => {
  const maly = otazkaInterval(1, nahodaZeSemene(5));
  const velky = otazkaInterval(6, nahodaZeSemene(5));
  assert.ok(maly.moznosti.length < velky.moznosti.length,
    'devítileté dítě s výběrem ze sedmi intervalů hádá');
  assert.equal(maly.moznosti.length, 3);
});

test('akord zní naráz a má tři tóny s správnou tercií', () => {
  for (let semeno = 1; semeno <= 40; semeno++) {
    const o = otazkaAkord(nahodaZeSemene(semeno));
    assert.equal(o.spolu, true);
    assert.equal(o.tony?.length, 3);
    const tercie = o.tony![1] - o.tony![0];
    const kvinta = o.tony![2] - o.tony![0];
    assert.equal(kvinta, 7, 'kvinta má být čistá');
    const durovy = o.moznosti[o.spravne].startsWith('dur');
    assert.equal(tercie, durovy ? 4 : 3, 'tercie neodpovídá zadanému akordu');
  }
});

test('hmatník: správná odpověď opravdu ukazuje na ten tón', () => {
  const jmena = ['E (nejsilnější)', 'A', 'D', 'G', 'H', 'e (nejtenčí)'];
  for (let semeno = 1; semeno <= 60; semeno++) {
    const o = otazkaHmatnik(4, nahodaZeSemene(semeno));
    const hledany = o.text.replace('Kde leží tón ', '').replace('?', '');
    const odpoved = o.moznosti[o.spravne];
    const [strunaText, prazecText] = odpoved.split(', ');
    const struna = jmena.indexOf(strunaText);
    const prazec = Number(prazecText.replace('. pražec', ''));
    const midi = midiNaPrazci(struna, prazec, STANDARDNI_LADENI);
    assert.equal(TONY[((midi % 12) + 12) % 12], hledany, `${odpoved} není ${hledany}`);
  }
});

test('žádná špatná odpověď na hmatníku není taky správná', () => {
  // Týž tón leží na krku víckrát — bez kontroly by v nabídce byly dvě
  // správné odpovědi a dítě by dostalo chybu za pravdu.
  const jmena = ['E (nejsilnější)', 'A', 'D', 'G', 'H', 'e (nejtenčí)'];
  for (let semeno = 1; semeno <= 60; semeno++) {
    const o = otazkaHmatnik(6, nahodaZeSemene(semeno));
    const hledany = o.text.replace('Kde leží tón ', '').replace('?', '');
    o.moznosti.forEach((m, i) => {
      if (i === o.spravne) return;
      const [s, p] = m.split(', ');
      const midi = midiNaPrazci(jmena.indexOf(s), Number(p.replace('. pražec', '')), STANDARDNI_LADENI);
      assert.notEqual(TONY[((midi % 12) + 12) % 12], hledany, `${m} je taky správně`);
    });
  }
});

test('nižší stupně zůstávají u prvních pražců', () => {
  for (let semeno = 1; semeno <= 30; semeno++) {
    const o = otazkaHmatnik(1, nahodaZeSemene(semeno));
    for (const m of o.moznosti) {
      const prazec = Number(m.split(', ')[1].replace('. pražec', ''));
      assert.ok(prazec <= 5, `první stupeň nesahá na ${prazec}. pražec`);
    }
  }
});

test('kvíz míchá psané otázky s poslechem a hmatníkem', () => {
  const psane = [psana(1), psana(2), psana(3), psana(4), psana(5)];
  const k = sestavKviz(psane, 3, 6, nahodaZeSemene(9));
  assert.equal(k.length, 6);
  const druhy = new Set(k.map((o) => o.druh));
  assert.ok(druhy.has('poslech'), 'kvíz ze samých pojmů ověří paměť, ne hudebníka');
  assert.ok(druhy.has('hmatnik'));
  assert.ok(druhy.has('vyber'));
});

test('kvíz vyjde i bez psaných otázek v databázi', () => {
  const k = sestavKviz([], 2, 6, nahodaZeSemene(4));
  assert.ok(k.length >= 3);
  for (const o of k) assert.notEqual(o.druh, 'vyber');
});

test('kvíz nikdy nevrátí prázdno', () => {
  assert.ok(sestavKviz([], 1, 0, nahodaZeSemene(1)).length >= 1);
});

test('vyhodnocení počítá jen trefy, nezodpovězené jsou chyba', () => {
  const otazky: Otazka[] = [
    { id: 'a', druh: 'vyber', text: '', moznosti: ['x', 'y'], spravne: 1 },
    { id: 'b', druh: 'vyber', text: '', moznosti: ['x', 'y'], spravne: 0 },
    { id: 'c', druh: 'vyber', text: '', moznosti: ['x', 'y'], spravne: 0 },
  ];
  assert.equal(vyhodnot(otazky, [1, 0, 0]), 3);
  assert.equal(vyhodnot(otazky, [1, 1, null]), 1);
  assert.equal(vyhodnot(otazky, [null, null, null]), 0);
});
