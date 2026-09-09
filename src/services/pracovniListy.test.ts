import test from 'node:test';
import assert from 'node:assert/strict';

import {
  POJMY_STUPNE, TAJENKY_STUPNE, bezDiakritiky, bingoKarta, kvintovyKruh,
  nahodaZeSemene, osmismerka, spojovacka, zamichej,
} from './pracovniListy';

const nahoda = () => nahodaZeSemene(12345);

test('týž list se vytiskne dvakrát stejně', () => {
  // Dítě list poztrácí a chce ten samý, ne nový.
  const a = osmismerka(['STRUNA', 'PRAZEC'], 'HRAJ', nahodaZeSemene(7));
  const b = osmismerka(['STRUNA', 'PRAZEC'], 'HRAJ', nahodaZeSemene(7));
  assert.deepEqual(a.mrizka, b.mrizka);
  // Jiné semínko dá jiný list.
  const c = osmismerka(['STRUNA', 'PRAZEC'], 'HRAJ', nahodaZeSemene(8));
  assert.notDeepEqual(a.mrizka, c.mrizka);
});

test('diakritika a mezery z pojmů zmizí', () => {
  assert.equal(bezDiakritiky('Příklep'), 'PRIKLEP');
  assert.equal(bezDiakritiky('kvintový kruh'), 'KVINTOVYKRUH');
  assert.equal(bezDiakritiky('žžž 123'), 'ZZZ');
});

test('všechna slova jsou v mřížce doopravdy k nalezení', () => {
  // Tohle je celý smysl testu: na osmisměrce, kterou nikdo nezkontroloval,
  // se dá strávit půl hodiny a nenajít nic.
  const slova = POJMY_STUPNE[3];
  const o = osmismerka(slova, TAJENKY_STUPNE[3], nahodaZeSemene(42));
  assert.deepEqual(o.neumistena, [], 'na některá slova nezbylo místo');

  const strana = o.mrizka.length;
  const smery = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];
  for (const slovo of o.slova) {
    let nalezeno = false;
    for (let r = 0; r < strana && !nalezeno; r++) {
      for (let c = 0; c < strana && !nalezeno; c++) {
        for (const [dr, dc] of smery) {
          let sedi = true;
          for (let i = 0; i < slovo.length; i++) {
            const rr = r + dr * i; const cc = c + dc * i;
            if (rr < 0 || rr >= strana || cc < 0 || cc >= strana || o.mrizka[rr][cc] !== slovo[i]) {
              sedi = false; break;
            }
          }
          if (sedi) { nalezeno = true; break; }
        }
      }
    }
    assert.ok(nalezeno, `${slovo} v mřížce není`);
  }
});

test('mřížka je čtvercová a samá velká písmena', () => {
  const o = osmismerka(POJMY_STUPNE[1], TAJENKY_STUPNE[1], nahoda());
  for (const radek of o.mrizka) {
    assert.equal(radek.length, o.mrizka.length, 'mřížka není čtverec');
    for (const p of radek) assert.match(p, /^[A-Z]$/, `divné písmeno: ${p}`);
  }
});

test('osmisměrka pro každý stupeň vyjde a slova se vejdou', () => {
  for (let stupen = 1; stupen <= 6; stupen++) {
    const o = osmismerka(POJMY_STUPNE[stupen], TAJENKY_STUPNE[stupen], nahodaZeSemene(stupen * 11));
    assert.deepEqual(o.neumistena, [], `stupeň ${stupen}: slova se nevešla`);
    assert.ok(o.tajenka.length > 0, `stupeň ${stupen}: nezbylo místo na tajenku`);
  }
});

test('tajenka se vejde celá, když je na ni místo', () => {
  const o = osmismerka(POJMY_STUPNE[2], TAJENKY_STUPNE[2], nahodaZeSemene(3));
  assert.equal(o.tajenka, bezDiakritiky(TAJENKY_STUPNE[2]));
});

test('krátká slova a prázdný vstup nespadnou', () => {
  const o = osmismerka(['A', 'BC', 'DEF'], 'X', nahoda());
  assert.deepEqual(o.slova, ['DEF'], 'dvoupísmenná slova do osmisměrky nepatří');
  const prazdna = osmismerka([], '', nahoda());
  assert.ok(prazdna.mrizka.length >= 8);
});

test('spojovačka zamíchá pravý sloupec, ale klíče sedí', () => {
  const dvojice: [string, string][] = [['Em', 'e-moll'], ['Am', 'a-moll'], ['C', 'C-dur'], ['G', 'G-dur']];
  const s = spojovacka(dvojice, nahoda());
  assert.equal(s.vlevo.length, 4);
  assert.equal(s.vpravo.length, 4);
  // Vodorovné spojení by nesmělo být řešením.
  assert.ok(s.vpravo.some((x, i) => x.klic !== String(i)), 'pravý sloupec zůstal v pořadí');
  // Nic se neztratilo ani nepřibylo.
  assert.deepEqual(
    [...s.vpravo].map((x) => x.text).sort(),
    dvojice.map(([, b]) => b).sort(),
  );
});

test('spojovačka s jedinou dvojicí nezacyklí', () => {
  const s = spojovacka([['Em', 'e-moll']], nahoda());
  assert.equal(s.vpravo.length, 1);
});

test('kvintový kruh začíná na C a jde po kvintách', () => {
  const k = kvintovyKruh();
  assert.equal(k.length, 12);
  assert.equal(k[0].tonina, 'C');
  assert.equal(k[0].predznamenani, 0);
  assert.equal(k[0].uhel, 0);
  assert.equal(k[1].tonina, 'G');
  assert.equal(k[1].predznamenani, 1, 'G dur má jeden křížek');
  assert.equal(k[11].tonina, 'F');
  assert.equal(k[11].predznamenani, -1, 'F dur má jedno béčko');
  // Kolem dokola po třiceti stupních.
  assert.deepEqual(k.map((x) => x.uhel), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
});

test('bingo má pět na pět a volné pole uprostřed', () => {
  const karta = bingoKarta(['C', 'D', 'E', 'F', 'G', 'A', 'H'], nahoda());
  assert.equal(karta.length, 5);
  for (const radek of karta) assert.equal(radek.length, 5);
  assert.equal(karta[2][2], null, 'uprostřed patří volné pole');
  const plna = karta.flat().filter((x) => x !== null);
  assert.equal(plna.length, 24);
});

test('míchání nic neztratí ani nepřidá', () => {
  const p = [1, 2, 3, 4, 5, 6, 7, 8];
  const z = zamichej(p, nahoda());
  assert.deepEqual([...z].sort((a, b) => a - b), p);
  assert.deepEqual(p, [1, 2, 3, 4, 5, 6, 7, 8], 'původní pole se změnilo');
});

test('každý stupeň má pojmy i tajenku', () => {
  for (let s = 1; s <= 6; s++) {
    assert.ok(POJMY_STUPNE[s]?.length >= 6, `stupeň ${s} má málo pojmů`);
    assert.ok(TAJENKY_STUPNE[s]?.length > 4, `stupeň ${s} nemá tajenku`);
  }
});
