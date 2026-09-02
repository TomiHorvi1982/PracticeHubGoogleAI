import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rolePodleNazvu, nazevBezRole, seskupDoSkladeb, jeZvuk, bezpecnaCesta, rozsahZHlavicky,
} from './mistniStopy.js';

test('Neural Mix Pro: acappella je zpěv', () => {
  assert.equal(rolePodleNazvu('TRAUTENBERK tanzmetal - Netáhlo (lyrics)-acappella.wav'), 'vocals');
});

test('Neural Mix Pro: basa a bicí', () => {
  assert.equal(rolePodleNazvu('TRAUTENBERK tanzmetal - Netáhlo (lyrics)-bass.wav'), 'bass');
  assert.equal(rolePodleNazvu('TRAUTENBERK tanzmetal - Netáhlo (lyrics)-drums.wav'), 'drums');
});

test('harmonic padá na Ostatní', () => {
  assert.equal(rolePodleNazvu('-harmonic.wav'), 'other');
});

test('Demucs pojmenování projde taky', () => {
  assert.equal(rolePodleNazvu('song_vocals.wav'), 'vocals');
  assert.equal(rolePodleNazvu('song_other.mp3'), 'other');
});

test('česky pojmenovaná stopa', () => {
  assert.equal(rolePodleNazvu('Ratamahatta - bicí.wav'), 'drums');
  assert.equal(rolePodleNazvu('Ratamahatta - sólo.wav'), 'lead');
});

test('štítek se hledá na konci, ne kdekoli v názvu', () => {
  // Kapela se jmenuje Bass Communion; stopa je ale bicí.
  assert.equal(rolePodleNazvu('Bass Communion - Ghosts-drums.wav'), 'drums');
});

test('neznámý název role nevrátí', () => {
  assert.equal(rolePodleNazvu('nahravka z zkusebny.wav'), null);
});

test('název skladby se odřízne od štítku', () => {
  assert.equal(
    nazevBezRole('TRAUTENBERK tanzmetal - Netáhlo (lyrics)-bass.wav'),
    'TRAUTENBERK tanzmetal Netáhlo (lyrics)',
  );
});

test('soubor bez názvu skladby dá prázdno, ne chybu', () => {
  assert.equal(nazevBezRole('-harmonic.wav'), '');
});

test('stopy jedné skladby se seskupí dohromady', () => {
  const sk = seskupDoSkladeb([
    { jmeno: 'Netáhlo-bass.wav', cesta: 'Netáhlo-bass.wav', velikost: 1 },
    { jmeno: 'Netáhlo-drums.wav', cesta: 'Netáhlo-drums.wav', velikost: 1 },
    { jmeno: 'Netáhlo-acappella.wav', cesta: 'Netáhlo-acappella.wav', velikost: 1 },
  ]);
  assert.equal(sk.length, 1);
  assert.equal(sk[0].nazev, 'Netáhlo');
  assert.deepEqual(sk[0].stopy.map((s) => s.role).sort(), ['bass', 'drums', 'vocals']);
});

test('podsložka rozhoduje o seskupení víc než název souboru', () => {
  const sk = seskupDoSkladeb([
    { jmeno: 'a-bass.wav', cesta: 'Sepultura Roots/a-bass.wav', velikost: 1 },
    { jmeno: 'b-drums.wav', cesta: 'Sepultura Roots/b-drums.wav', velikost: 1 },
  ]);
  assert.equal(sk.length, 1);
  assert.equal(sk[0].nazev, 'Sepultura Roots');
});

test('dvě různé skladby se nesloučí', () => {
  const sk = seskupDoSkladeb([
    { jmeno: 'Amen-bass.wav', cesta: 'Amen-bass.wav', velikost: 1 },
    { jmeno: 'Roots-bass.wav', cesta: 'Roots-bass.wav', velikost: 1 },
  ]);
  assert.equal(sk.length, 2);
});

test('databáze jiné aplikace není zvuk', () => {
  assert.equal(jeZvuk('guitar_automator.db'), false);
  assert.equal(jeZvuk('library.json'), false);
  assert.equal(jeZvuk('stopa.wav'), true);
});

test('cesta ven ze složky se neprojde', () => {
  assert.equal(bezpecnaCesta('/Users/x/Music/Stems', '../../.ssh/id_rsa'), null);
  assert.equal(bezpecnaCesta('/Users/x/Music/Stems', '/etc/passwd'), null);
  assert.equal(bezpecnaCesta('/Users/x/Music/Stems', 'a\0b'), null);
});

test('cesta dovnitř složky projde', () => {
  assert.equal(
    bezpecnaCesta('/Users/x/Music/Stems', 'Roots/bass.wav'),
    '/Users/x/Music/Stems/Roots/bass.wav',
  );
});

test('bez hlavičky Range se pošle celý soubor', () => {
  assert.equal(rozsahZHlavicky(undefined, 1000), null);
});

test('běžný rozsah zprostředka', () => {
  assert.deepEqual(rozsahZHlavicky('bytes=100-199', 1000), { od: 100, do: 199 });
});

test('otevřený konec dojede na konec souboru', () => {
  assert.deepEqual(rozsahZHlavicky('bytes=900-', 1000), { od: 900, do: 999 });
});

test('konec za hranicí se ořízne na velikost', () => {
  assert.deepEqual(rozsahZHlavicky('bytes=900-5000', 1000), { od: 900, do: 999 });
});

test('začátek za koncem souboru je mimo, ne oříznutí', () => {
  assert.equal(rozsahZHlavicky('bytes=2000-2100', 1000), 'mimo');
});

test('posledních N bajtů', () => {
  assert.deepEqual(rozsahZHlavicky('bytes=-300', 1000), { od: 700, do: 999 });
});

test('nesmysl v hlavičce znamená celý soubor', () => {
  assert.equal(rozsahZHlavicky('bytes=abc', 1000), null);
  assert.equal(rozsahZHlavicky('bytes=-', 1000), null);
});

// --- procházení opravdové složky ---
import fsx from 'node:fs';
import osx from 'node:os';
import pathx from 'node:path';
import { projdiStopy } from './mistniStopy.js';

function postavStrom(): string {
  const koren = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'stopy-'));
  // Sada ležící volně v kořeni.
  for (const n of ['Amen-bass.wav', 'Amen-drums.wav']) fsx.writeFileSync(pathx.join(koren, n), 'xx');
  // Sada ve vlastní podsložce.
  fsx.mkdirSync(pathx.join(koren, 'Roots'));
  for (const n of ['a-bass.wav', 'a-acappella.wav']) fsx.writeFileSync(pathx.join(koren, 'Roots', n), 'xxx');
  // Věci jiné aplikace, které do pultu nepatří.
  fsx.writeFileSync(pathx.join(koren, 'library.json'), '{}');
  fsx.writeFileSync(pathx.join(koren, 'guitar_automator.db'), 'x');
  fsx.mkdirSync(pathx.join(koren, '.samples'));
  fsx.writeFileSync(pathx.join(koren, '.samples', 'kick.wav'), 'x');
  fsx.writeFileSync(pathx.join(koren, '.skryty.wav'), 'x');
  return koren;
}

test('projde kořen i podsložku a ignoruje cizí soubory', () => {
  const koren = postavStrom();
  try {
    const n = projdiStopy(koren);
    const cesty = n.map((x) => x.cesta).sort();
    assert.deepEqual(cesty, [
      'Amen-bass.wav', 'Amen-drums.wav', 'Roots/a-acappella.wav', 'Roots/a-bass.wav',
    ]);
    // Velikosti se opravdu čtou z disku, ne odhadují.
    assert.equal(n.find((x) => x.cesta === 'Amen-bass.wav')!.velikost, 2);
    assert.equal(n.find((x) => x.cesta === 'Roots/a-bass.wav')!.velikost, 3);
  } finally {
    fsx.rmSync(koren, { recursive: true, force: true });
  }
});

test('podsložka se seskupí jako jedna skladba', () => {
  const koren = postavStrom();
  try {
    const sk = seskupDoSkladeb(projdiStopy(koren));
    const roots = sk.find((x) => x.nazev === 'Roots');
    assert.ok(roots, 'podsložka Roots chybí');
    assert.equal(roots!.stopy.length, 2);
    assert.deepEqual(roots!.stopy.map((t) => t.role).sort(), ['bass', 'vocals']);
    const amen = sk.find((x) => x.nazev === 'Amen');
    assert.equal(amen!.stopy.length, 2);
  } finally {
    fsx.rmSync(koren, { recursive: true, force: true });
  }
});

test('neexistující složka nespadne, jen nic nevrátí', () => {
  assert.deepEqual(projdiStopy('/tohle/tam/opravdu/neni'), []);
});
