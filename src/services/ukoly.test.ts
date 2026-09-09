import test from 'node:test';
import assert from 'node:assert/strict';

import { NAZVY_STAVU, StavUkolu, Ukol, poTerminu, seradProZaka } from './ukoly';

const ukol = (o: Partial<Ukol> = {}): Ukol => ({
  id: o.id || 'u1',
  zak_id: 'z1',
  ucitel_uid: 'u',
  druh: 'text',
  cil_id: null,
  zadani: 'Cvič',
  do_kdy: null,
  cilove_tempo: null,
  stav: 'zadano',
  odevzdano_kdy: null,
  zpetna_vazba: '',
  created_at: '2026-09-01T10:00:00Z',
  ...o,
});

test('úkol je po termínu až po konci toho dne', () => {
  const u = ukol({ do_kdy: '2026-09-10' });
  // Neděle ráno ještě ne — den, na který je úkol, patří dítěti celý.
  assert.equal(poTerminu(u, new Date('2026-09-10T08:00:00')), false);
  assert.equal(poTerminu(u, new Date('2026-09-10T23:00:00')), false);
  assert.equal(poTerminu(u, new Date('2026-09-11T00:30:00')), true);
});

test('úkol bez termínu ani hotový úkol po termínu nejsou', () => {
  assert.equal(poTerminu(ukol({ do_kdy: null }), new Date('2030-01-01')), false);
  assert.equal(
    poTerminu(ukol({ do_kdy: '2020-01-01', stav: 'hotovo' }), new Date('2030-01-01')),
    false,
    'hotový úkol už nikoho nehoní',
  );
});

test('odevzdaný, ale neohodnocený úkol po termínu být může', () => {
  // Dítě odevzdalo pozdě — učitel to má vidět.
  const u = ukol({ do_kdy: '2026-09-01', stav: 'odevzdano' });
  assert.equal(poTerminu(u, new Date('2026-09-05')), true);
});

test('nahoře je, co se má udělat, dole hotové', () => {
  const seznam = [
    ukol({ id: 'hotovy', stav: 'hotovo' }),
    ukol({ id: 'odevzdany', stav: 'odevzdano' }),
    ukol({ id: 'cekajici', stav: 'zadano' }),
  ];
  assert.deepEqual(seradProZaka(seznam).map((u) => u.id), ['cekajici', 'odevzdany', 'hotovy']);
});

test('mezi nesplněnými je první ten s nejbližším termínem', () => {
  const seznam = [
    ukol({ id: 'pozdeji', do_kdy: '2026-09-20' }),
    ukol({ id: 'bezTerminu', do_kdy: null }),
    ukol({ id: 'drive', do_kdy: '2026-09-12' }),
  ];
  assert.deepEqual(
    seradProZaka(seznam).map((u) => u.id),
    ['drive', 'pozdeji', 'bezTerminu'],
    'úkol bez termínu počká až za těmi, které termín mají',
  );
});

test('dva úkoly bez termínu se řadí podle zadání', () => {
  const seznam = [
    ukol({ id: 'novejsi', created_at: '2026-09-05T10:00:00Z' }),
    ukol({ id: 'starsi', created_at: '2026-09-01T10:00:00Z' }),
  ];
  assert.deepEqual(seradProZaka(seznam).map((u) => u.id), ['starsi', 'novejsi']);
});

test('řazení nemění původní pole', () => {
  const seznam = [ukol({ id: 'a', stav: 'hotovo' }), ukol({ id: 'b' })];
  seradProZaka(seznam);
  assert.deepEqual(seznam.map((u) => u.id), ['a', 'b']);
});

test('prázdný seznam nespadne', () => {
  assert.deepEqual(seradProZaka([]), []);
});

test('každý stav má český název', () => {
  for (const s of ['zadano', 'odevzdano', 'hotovo'] as StavUkolu[]) {
    assert.ok(NAZVY_STAVU[s]?.length > 0, `stav ${s} nemá název`);
  }
});
