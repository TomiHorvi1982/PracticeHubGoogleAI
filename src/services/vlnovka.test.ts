import test from 'node:test';
import assert from 'node:assert/strict';
import { spocitejVrcholy, casNaX, xNaCas, popiskyOsy, cas } from './vlnovka.js';

test('vrcholy: každý sloupec dostane největší výchylku ze svého úseku', () => {
  const d = Float32Array.from([0, 0.5, 0, -0.9, 0.2, 0.1]);
  assert.deepEqual([...spocitejVrcholy(d, 3)], [0.5, Math.fround(-0.9) * -1, Math.fround(0.2)]);
});

test('vrcholy: záporná výchylka se počítá stejně jako kladná', () => {
  const d = Float32Array.from([-1, 0, 0, 0]);
  assert.equal(spocitejVrcholy(d, 2)[0], 1);
});

test('vrcholy: rána se neztratí v tichu kolem (nebere se průměr)', () => {
  const d = new Float32Array(1000);
  d[500] = 1;
  assert.equal(spocitejVrcholy(d, 2)[1], 1);
});

test('vrcholy: krátký soubor na širokém pultu nedá samé nuly', () => {
  const d = Float32Array.from([0.8, 0.6]);
  const v = spocitejVrcholy(d, 10);
  assert.equal(v.length, 10);
  assert.ok(v.every((x) => x > 0), 'některý sloupec zůstal prázdný');
});

test('vrcholy: prázdný vstup nespadne', () => {
  assert.equal(spocitejVrcholy(new Float32Array(0), 5).length, 5);
  assert.equal(spocitejVrcholy(Float32Array.from([1]), 0).length, 0);
});

test('čas na x a zpátky si odpovídá', () => {
  assert.equal(casNaX(60, 120, 600), 300);
  assert.equal(xNaCas(300, 120, 600), 60);
});

test('mimo rozsah se ořezává, ne extrapoluje', () => {
  assert.equal(casNaX(-5, 120, 600), 0);
  assert.equal(casNaX(999, 120, 600), 600);
  assert.equal(xNaCas(-10, 120, 600), 0);
  assert.equal(xNaCas(9999, 120, 600), 120);
});

test('nulová délka nedělí nulou', () => {
  assert.equal(casNaX(10, 0, 600), 0);
  assert.equal(xNaCas(10, 0, 600), 0);
  assert.deepEqual(popiskyOsy(0, 600), []);
});

test('popisky osy drží nejmenší odstup', () => {
  const p = popiskyOsy(217, 900, 70);
  assert.ok(p.length > 2);
  for (let i = 1; i < p.length; i++) {
    assert.ok(p[i].x - p[i - 1].x >= 70, `popisky ${i} a ${i - 1} jsou moc u sebe`);
  }
});

test('na úzkém pultu je popisků míň než na širokém', () => {
  assert.ok(popiskyOsy(217, 300).length < popiskyOsy(217, 1600).length);
});

test('popisky nepřetečou za konec skladby', () => {
  for (const p of popiskyOsy(217, 900)) assert.ok(p.cas <= 217.001);
});

test('velmi dlouhá nahrávka osu nezaplní', () => {
  assert.ok(popiskyOsy(7200, 900).length <= 20);
});

test('čas se píše jako m:ss', () => {
  assert.equal(cas(0), '0:00');
  assert.equal(cas(217), '3:37');
  assert.equal(cas(-1), '0:00');
});
