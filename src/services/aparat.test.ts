import { test } from 'node:test';
import assert from 'node:assert/strict';
import { krivkaZkresleni, VYCHOZI_APARAT } from './aparat';

test('bez zkreslení projde signál beze změny', () => {
  // Nulový drive musí být opravdu čistý, ne „skoro čistý".
  const k = krivkaZkresleni(0, 1024);
  const stred = k[512];
  assert.ok(Math.abs(stred) < 0.01, `střed křivky má být kolem nuly, je ${stred}`);
  assert.ok(Math.abs(k[1023] - 1) < 0.02, 'plný vstup má dát plný výstup');
});

test('křivka je lichá — kladné a záporné se chovají zrcadlově', () => {
  // Nesouměrné zkreslení přidává sudé harmonické; tohle je má nemít.
  const k = krivkaZkresleni(0.5, 1024);
  for (const i of [100, 300, 450]) {
    assert.ok(Math.abs(k[i] + k[1023 - i]) < 0.02, `nesouměrné na vzorku ${i}`);
  }
});

test('výstup nepřeteče přes jedničku', () => {
  // Přetečení by se na výstupu ořízlo natvrdo a zaskřípalo.
  for (const d of [0, 0.3, 0.7, 1]) {
    const k = krivkaZkresleni(d, 512);
    assert.ok(Math.max(...k) <= 1.001, `drive ${d} přetekl na ${Math.max(...k)}`);
    assert.ok(Math.min(...k) >= -1.001, `drive ${d} podtekl`);
  }
});

test('víc drivu znamená víc stlačení', () => {
  // U poloviny vstupu má silnější zkreslení dát vyšší výstup.
  const slabe = krivkaZkresleni(0.1, 1024)[768];
  const silne = krivkaZkresleni(0.9, 1024)[768];
  assert.ok(silne > slabe, `slabé ${slabe} mělo být pod silným ${silne}`);
});

test('meze se ořežou, ne aby spadly', () => {
  assert.equal(krivkaZkresleni(-5, 64).length, 64);
  assert.equal(krivkaZkresleni(99, 64).length, 64);
});

test('výchozí nastavení je v mezích', () => {
  for (const [klic, h] of Object.entries(VYCHOZI_APARAT)) {
    assert.ok(h >= 0 && h <= 1, `${klic} je mimo rozsah: ${h}`);
  }
});
