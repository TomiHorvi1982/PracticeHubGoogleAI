import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BARVY_SEKCI, Sekce, barvaProPoradi, maObsah, navrhniNazev, noveId, prectiPult,
  pridejSekci, sekceVCase, srovnejSekce, srovnejSekci,
} from './sekceSongu';
import {
  MIN_VYSKA_STOPY, MAX_VYSKA_STOPY, VYCHOZI_VYSKA_STOPY, srovnejVysku,
} from './rozvrzeniPultu';

const s = (od: number, doKdy: number, nazev = 'X'): Sekce => ({ id: noveId(), nazev, od, do: doKdy });

test('sekce nakreslená zprava doleva je pořád tatáž sekce', () => {
  const v = srovnejSekci({ nazev: 'Refrén', od: 80, do: 40 }, 200);
  assert.equal(v!.od, 40);
  assert.equal(v!.do, 80);
});

test('sekce se ořízne do skladby', () => {
  const v = srovnejSekci({ nazev: 'Outro', od: -10, do: 500 }, 200);
  assert.deepEqual([v!.od, v!.do], [0, 200]);
});

test('sekce bez délky se zahodí', () => {
  assert.equal(srovnejSekci({ od: 40, do: 40 }, 200), null);
  assert.equal(srovnejSekci({ od: 40, do: 40.01 }, 200), null);
  assert.equal(srovnejSekci({ od: NaN, do: 10 }, 200), null);
  // Bez znalosti délky se srovnat nedá.
  assert.equal(srovnejSekci({ od: 0, do: 10 }, 0), null);
});

test('sekce bez jména dostane náhradní, dlouhé se ořízne', () => {
  assert.equal(srovnejSekci({ od: 0, do: 10 }, 200)!.nazev, 'Sekce');
  assert.equal(srovnejSekci({ nazev: '   ', od: 0, do: 10 }, 200)!.nazev, 'Sekce');
  assert.equal(srovnejSekci({ nazev: 'a'.repeat(90), od: 0, do: 10 }, 200)!.nazev.length, 40);
});

test('nesmyslná barva se zahodí, platná zůstane', () => {
  assert.equal(srovnejSekci({ od: 0, do: 10, barva: 'javascript:zle' }, 200)!.barva, undefined);
  assert.equal(srovnejSekci({ od: 0, do: 10, barva: '#5E9EFF' }, 200)!.barva, '#5E9EFF');
});

test('seznam se seřadí podle začátku a nesmysly vypadnou', () => {
  const v = srovnejSekce([
    s(100, 140, 'Refrén'),
    null,
    'nesmysl',
    { od: 10, do: 10 },
    s(0, 20, 'Intro'),
  ], 200);
  assert.deepEqual(v.map((x) => x.nazev), ['Intro', 'Refrén']);
});

test('z něčeho, co není pole, vypadne prázdný seznam', () => {
  assert.deepEqual(srovnejSekce(undefined, 200), []);
  assert.deepEqual(srovnejSekce({ a: 1 }, 200), []);
});

test('dvě sekce se stejným id dostanou různá', () => {
  const v = srovnejSekce([
    { id: 'stejne', nazev: 'A', od: 0, do: 10 },
    { id: 'stejne', nazev: 'B', od: 20, do: 30 },
  ], 200);
  assert.equal(v.length, 2);
  assert.notEqual(v[0].id, v[1].id);
});

test('při překryvu vyhrává kratší sekce', () => {
  const sekce = [s(0, 100, 'Refrén'), s(40, 60, 'Sólo')];
  assert.equal(sekceVCase(sekce, 50)!.nazev, 'Sólo');
  assert.equal(sekceVCase(sekce, 20)!.nazev, 'Refrén');
  assert.equal(sekceVCase(sekce, 150), null);
});

test('název se nabízí z obvyklých a neopakuje se', () => {
  assert.equal(navrhniNazev([]), 'Intro');
  assert.equal(navrhniNazev([s(0, 10, 'Intro')]), 'Sloka');
  // Velikost písmen nesmí rozhodovat.
  assert.equal(navrhniNazev([s(0, 10, 'intro')]), 'Sloka');
});

test('barvy se cyklují a záporné pořadí nespadne', () => {
  assert.equal(barvaProPoradi(0), BARVY_SEKCI[0]);
  assert.equal(barvaProPoradi(BARVY_SEKCI.length), BARVY_SEKCI[0]);
  assert.equal(barvaProPoradi(-1), BARVY_SEKCI[BARVY_SEKCI.length - 1]);
});

test('přidání sekce vrátí seřazený seznam s barvou', () => {
  let v = pridejSekci([], 100, 140, 200);
  v = pridejSekci(v, 0, 20, 200);
  assert.deepEqual(v.map((x) => x.nazev), ['Sloka', 'Intro']);
  assert.equal(v[0].od, 0);
  assert.ok(v.every((x) => !!x.barva));
});

test('sekce, ze které nic nezbude, seznam nezmění', () => {
  const puvodni = [s(0, 10)];
  assert.equal(pridejSekci(puvodni, 50, 50, 200), puvodni);
});

test('uložený pult se přečte i z poškozených dat', () => {
  const p = prectiPult({
    sekce: [{ nazev: 'Intro', od: 0, do: 20 }, 'zmetek'],
    mrizka: { bpm: 117, faze: 0.2, shoda: 0.8 },
    mix: {
      vocals: { volume: -3, pan: 0.5, isMuted: true, isSolo: false, pitchSemi: 0 },
      rozbity: null,
      mimoRozsah: { volume: -900, pan: 50, pitchSemi: 99 },
    },
  }, 200);
  assert.equal(p.sekce!.length, 1);
  assert.deepEqual(p.mrizka, { bpm: 117, faze: 0.2, shoda: 0.8 });
  assert.equal(p.mix!.vocals.volume, -3);
  assert.equal(p.mix!.rozbity, undefined);
  // Hodnoty mimo rozsah se srovnají, ne aby rozhodily pult.
  assert.equal(p.mix!.mimoRozsah.volume, -60);
  assert.equal(p.mix!.mimoRozsah.pan, 1);
  assert.equal(p.mix!.mimoRozsah.pitchSemi, 12);
});

test('mřížka bez tempa se nepřečte', () => {
  assert.equal(prectiPult({ mrizka: { bpm: 0 } }, 200).mrizka, undefined);
  assert.equal(prectiPult({ mrizka: 'ne' }, 200).mrizka, undefined);
});

test('z ničeho vyjde prázdný pult', () => {
  const p = prectiPult(undefined, 200);
  assert.deepEqual(p.sekce, []);
  assert.equal(maObsah(p), false);
  assert.equal(maObsah({ sekce: [s(0, 10)] }), true);
  assert.equal(maObsah({ mrizka: { bpm: 120, faze: 0, shoda: 1 } }), true);
  assert.equal(maObsah({ mix: {} }), false);
});

test('výška stopy se drží v rozumných mezích', () => {
  assert.equal(srovnejVysku(10), MIN_VYSKA_STOPY);
  assert.equal(srovnejVysku(9999), MAX_VYSKA_STOPY);
  assert.equal(srovnejVysku(120), 120);
  assert.equal(srovnejVysku(120.6), 121);
  assert.equal(srovnejVysku(NaN), VYCHOZI_VYSKA_STOPY);
});
