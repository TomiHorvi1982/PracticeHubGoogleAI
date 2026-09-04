import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  vyrez, casNaX, xNaCas, srovnejSmycku, dobyVRozsahu, dobaVTaktu, najdiFazi,
  MIN_ZOOM, MAX_ZOOM, tempoZNastupu, PRAH_MRIZKY,
} from './mrizkaDob';

test('bez přiblížení je vidět celá skladba', () => {
  assert.deepEqual(vyrez(200, 1, 100), { od: 0, do: 200 });
});

test('výřez se drží uvnitř skladby', () => {
  // U kraje se posune dovnitř, místo aby ukazoval prázdno za koncem.
  assert.deepEqual(vyrez(200, 2, 0), { od: 0, do: 100 });
  assert.deepEqual(vyrez(200, 2, 200), { od: 100, do: 200 });
});

test('přiblížení se ořízne do mezí', () => {
  assert.equal(vyrez(200, 0.1, 100).do - vyrez(200, 0.1, 100).od, 200 / MIN_ZOOM);
  assert.equal(vyrez(200, 999, 100).do - vyrez(200, 999, 100).od, 200 / MAX_ZOOM);
});

test('nulová délka nic nerozbije', () => {
  assert.deepEqual(vyrez(0, 4, 0), { od: 0, do: 0 });
  assert.equal(casNaX(5, 0, 0, 100), 0);
  assert.equal(xNaCas(50, 0, 0, 100), 0);
});

test('čas a pixely jdou tam i zpátky', () => {
  const [od, doKdy, sirka] = [30, 90, 600];
  for (const t of [30, 45, 60, 90]) {
    assert.ok(Math.abs(xNaCas(casNaX(t, od, doKdy, sirka), od, doKdy, sirka) - t) < 1e-9);
  }
});

test('smyčka se srovná, i když se táhne pozpátku', () => {
  assert.deepEqual(srovnejSmycku(80, 20, 200), { od: 20, do: 80 });
});

test('smyčka nikdy nemá nulovou délku', () => {
  // Z nulové smyčky se přehrávání nedostane ven.
  const s = srovnejSmycku(50, 50, 200);
  assert.ok(s.do - s.od >= 0.1);
});

test('smyčka na konci skladby se vejde dovnitř', () => {
  const s = srovnejSmycku(200, 200, 200);
  assert.ok(s.do <= 200 && s.od >= 0, 'nesmí přetéct přes skladbu');
  // Tolerance kvůli plovoucí aritmetice: 200 − 199.9 vyjde
  // 0.09999999999997726, což je pořád ta správná desetina vteřiny.
  assert.ok(s.do - s.od >= 0.1 - 1e-9, `delka ${s.do - s.od}`);
});

test('doby mají rozestup podle tempa', () => {
  const d = dobyVRozsahu(120, 0, 0, 2);   // 120 BPM = doba po 0,5 s
  assert.deepEqual(d, [0, 0.5, 1, 1.5, 2]);
});

test('fáze mřížku posune', () => {
  assert.deepEqual(dobyVRozsahu(120, 0.2, 0, 1), [0.2, 0.7]);
});

test('příliš hustá mřížka se nekreslí', () => {
  // Z tisíce čar by byla jen šeď.
  assert.deepEqual(dobyVRozsahu(120, 0, 0, 600), []);
});

test('nesmyslné tempo mřížku nevyrobí', () => {
  assert.deepEqual(dobyVRozsahu(0, 0, 0, 10), []);
  assert.deepEqual(dobyVRozsahu(120, 0, 10, 5), []);
});

test('první doba v taktu se pozná', () => {
  assert.equal(dobaVTaktu(0, 120, 0), 0);
  assert.equal(dobaVTaktu(0.5, 120, 0), 1);
  assert.equal(dobaVTaktu(2, 120, 0), 0, 'po čtyřech dobách zase přízvuk');
});

test('fáze se najde na pravidelných nástupech', () => {
  // Nástupy po 0,5 s posunuté o 0,2 s — mřížka má sednout na 0,2.
  const nastupy = [0.2, 0.7, 1.2, 1.7, 2.2, 2.7, 3.2];
  const r = najdiFazi(nastupy, 120);
  assert.ok(Math.abs(r.faze - 0.2) < 0.03, `faze ${r.faze}`);
  assert.ok(r.shoda > 0.8, `shoda ${r.shoda}`);
});

test('rozházené nástupy mřížku nepustí na obrazovku', () => {
  // Rozhoduje práh, ne konkrétní číslo: u osmi náhodných úderů se pár
  // čar trefí náhodou, ale na zobrazení to stačit nesmí.
  const nastupy = [0.03, 0.41, 0.62, 1.13, 1.44, 1.98, 2.27, 2.71];
  assert.ok(najdiFazi(nastupy, 120).shoda < PRAH_MRIZKY);
});

test('pravidelné nástupy práh pohodlně přejdou', () => {
  const nastupy = [0.2, 0.7, 1.2, 1.7, 2.2, 2.7, 3.2];
  assert.ok(najdiFazi(nastupy, 120).shoda >= PRAH_MRIZKY);
});

test('hi-haty mezi dobami shodu nesrazí', () => {
  // Detektor najde i ozdoby: na každou dobu tak vyjde víc nástupů.
  // Podíl trefených čar to snést musí — průměrná vzdálenost ne.
  const doby = [0, 0.5, 1, 1.5, 2, 2.5, 3];
  const ozdoby = [0.25, 0.62, 0.88, 1.31, 1.74, 2.13, 2.38, 2.81];
  assert.ok(najdiFazi([...doby, ...ozdoby].sort((a, b) => a - b), 120).shoda >= PRAH_MRIZKY);
});

test('málo nástupů nestačí na určení fáze', () => {
  assert.deepEqual(najdiFazi([1, 2], 120), { faze: 0, shoda: 0 });
});

test('tempo se spočítá z mezer mezi nástupy', () => {
  // Údery po 0,5 s = 120 BPM.
  const n = Array.from({ length: 16 }, (_, i) => i * 0.5);
  assert.equal(tempoZNastupu(n), 120);
});

test('jeden vynechaný úder tempo nerozhodí', () => {
  // Medián drží, i když jedna mezera vyjde dvojnásobná.
  const n = [0, 0.5, 1.0, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
  assert.equal(tempoZNastupu(n), 120);
});

test('nástupy na osminách se srovnají do obvyklého rozsahu', () => {
  // Po 0,2 s je 300 BPM — to se zpomalí na polovinu, tedy 150.
  const n = Array.from({ length: 20 }, (_, i) => i * 0.2);
  const t = tempoZNastupu(n);
  assert.ok(t >= 60 && t <= 180, `vyslo ${t}`);
});

test('málo nástupů tempo nedá', () => {
  assert.equal(tempoZNastupu([0, 0.5, 1]), 0);
  assert.equal(tempoZNastupu([]), 0);
});

test('samé dlouhé pauzy tempo nedají', () => {
  assert.equal(tempoZNastupu([0, 3, 6, 9, 12, 15, 18, 21, 24]), 0);
});
