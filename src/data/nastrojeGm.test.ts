import test from 'node:test';
import assert from 'node:assert/strict';
import { NASTROJE_GM, RODINY_NASTROJU, jmenoNastroje } from './nastrojeGm.js';

test('sada je úplná: 128 nástrojů', () => {
  assert.equal(NASTROJE_GM.length, 128);
});

test('čísla programů jdou 0 až 127 bez děr a bez opakování', () => {
  const cisla = NASTROJE_GM.map((n) => n.program);
  assert.deepEqual(cisla, [...Array(128).keys()]);
});

test('žádný nástroj nezůstal bez jména', () => {
  for (const n of NASTROJE_GM) {
    assert.ok(n.nazev.trim().length > 0, `program ${n.program} nemá jméno`);
  }
});

test('jména se neopakují — ve výběru by šlo o dvě stejné položky', () => {
  const jmena = NASTROJE_GM.map((n) => n.nazev);
  assert.equal(new Set(jmena).size, jmena.length);
});

test('rodin je šestnáct a každá má osm nástrojů', () => {
  assert.equal(RODINY_NASTROJU.length, 16);
  for (const r of RODINY_NASTROJU) {
    assert.equal(r.nastroje.length, 8, `rodina ${r.nazev} nemá osm nástrojů`);
  }
});

test('kytary sedí na standardní čísla General MIDI', () => {
  // Podle standardu je 24 nylonová a 30 distortion; kdyby se seznam
  // posunul, hrála by tabulatura něco jiného, než co je v souboru.
  assert.equal(jmenoNastroje(24), 'Nylonová kytara');
  assert.equal(jmenoNastroje(30), 'Distortion');
  assert.equal(jmenoNastroje(33), 'Prstová basa');
  assert.equal(jmenoNastroje(0), 'Klavír');
});

test('číslo mimo standard vrátí null, ne prázdný řetězec', () => {
  assert.equal(jmenoNastroje(128), null);
  assert.equal(jmenoNastroje(-1), null);
});
