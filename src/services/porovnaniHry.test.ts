import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chromaZeSpektra, vzdalenostChroma, zarovnej, odchylkyZarovnani, ohodnot, TRID,
  porovnejNahravky,
} from './porovnaniHry';

const VZORKOVACI = 44100;
const KOSIKU = 1024;

/** Spektrum s jedním vrcholem na zadané frekvenci. */
function spektroSTonem(hz: number): Float32Array {
  const s = new Float32Array(KOSIKU);
  const naKosik = VZORKOVACI / 2 / KOSIKU;
  s[Math.round(hz / naKosik)] = 1;
  return s;
}

/** Chroma s jedinou třídou — na zkoušení zarovnání. */
function chromaTridy(t: number): Float32Array {
  const c = new Float32Array(TRID);
  c[t] = 1;
  return c;
}

test('komorní a padne do třídy A', () => {
  const c = chromaZeSpektra(spektroSTonem(440), VZORKOVACI);
  // A je devátá třída, počítáno od C.
  assert.equal(c.indexOf(Math.max(...c)), 9);
});

test('tentýž tón o oktávu výš padne do stejné třídy', () => {
  // Právě proto se používá chroma: riff o oktávu jinde je pořád ten riff.
  const nizky = chromaZeSpektra(spektroSTonem(220), VZORKOVACI);
  const vysoky = chromaZeSpektra(spektroSTonem(880), VZORKOVACI);
  assert.equal(nizky.indexOf(Math.max(...nizky)), vysoky.indexOf(Math.max(...vysoky)));
});

test('chroma je normované, takže hlasitost nerozhoduje', () => {
  const tichy = chromaZeSpektra(spektroSTonem(440), VZORKOVACI);
  const hlasity = chromaZeSpektra(spektroSTonem(440).map((v) => v * 50) as any, VZORKOVACI);
  assert.equal(vzdalenostChroma(tichy, hlasity) < 0.001, true);
});

test('brum pod pásmem kytary se nepočítá', () => {
  // Padesátihertzový brum ze sítě by jinak přihodil energii do třídy G.
  const c = chromaZeSpektra(spektroSTonem(50), VZORKOVACI);
  assert.equal(c.every((v) => v === 0), true);
});

test('vzdálenost: shodné nula, nesouvisející jedna', () => {
  assert.equal(vzdalenostChroma(chromaTridy(0), chromaTridy(0)), 0);
  assert.equal(vzdalenostChroma(chromaTridy(0), chromaTridy(6)), 1);
});

test('shodné hry se zarovnají po úhlopříčce s nulovou cenou', () => {
  const a = [0, 4, 7, 0].map(chromaTridy);
  const z = zarovnej(a, a);
  assert.equal(z.cena, 0);
  assert.deepEqual(z.cesta, [[0, 0], [1, 1], [2, 2], [3, 3]]);
});

test('posunutá hra se pořád zarovná', () => {
  // Stejné tóny, jen začínají později — cena musí zůstat nízká.
  const predloha = [0, 4, 7, 11].map(chromaTridy);
  const moje = [0, 0, 4, 7, 11].map(chromaTridy);
  const z = zarovnej(moje, predloha);
  assert.ok(z.cena < 0.2, `cena ${z.cena} má být nízká`);
});

test('úplně jiná hra dá vysokou cenu', () => {
  const predloha = [0, 0, 0, 0].map(chromaTridy);
  const moje = [6, 6, 6, 6].map(chromaTridy);
  assert.ok(zarovnej(moje, predloha).cena > 0.8);
});

test('prázdný vstup nespadne', () => {
  assert.deepEqual(zarovnej([], [chromaTridy(0)]).cesta, []);
  assert.deepEqual(zarovnej([chromaTridy(0)], []).cesta, []);
});

test('stálý posun celé nahrávky se odečte', () => {
  // Zmáčknuté nahrávání o chvíli dřív není chyba hry.
  const cesta: [number, number][] = [[5, 0], [6, 1], [7, 2], [8, 3]];
  const { odchylky, stredniPosunMs } = odchylkyZarovnani({ cesta, cena: 0 }, 0.01);
  assert.ok(stredniPosunMs > 0, 'posun se má rozpoznat');
  for (const o of odchylky) assert.equal(Math.abs(o.posunMs) < 0.001, true);
});

test('rozptyl se nevyruší souměrnými odchylkami', () => {
  // Průměr by u „jednou napřed, jednou pozadu" vyšel nula a vypadalo by
  // to, že hraješ přesně. Tohle je přesně ta past.
  const cesta: [number, number][] = [[0, 0], [3, 1], [2, 2], [5, 3]];
  const h = ohodnot({ cesta, cena: 0.1 }, 0.01);
  assert.ok(h.rozptylMs > 5, `rozptyl ${h.rozptylMs} měl být znatelný`);
});

test('hodnocení ukáže nejhorší místo', () => {
  const cesta: [number, number][] = [[0, 0], [1, 1], [9, 2], [3, 3]];
  const h = ohodnot({ cesta, cena: 0.1 }, 0.01);
  assert.ok(Math.abs(h.nejhorsiMs) > 0);
  assert.equal(h.nejhorsiCas, 9 * 0.01);
});

test('shoda tónů se odvozuje z ceny zarovnání', () => {
  assert.equal(ohodnot({ cesta: [[0, 0]], cena: 0 }, 0.01).tony, 1);
  assert.equal(ohodnot({ cesta: [[0, 0]], cena: 1 }, 0.01).tony, 0);
});

/** Sinusovka pro zkoušky celého porovnání. */
function ton(hz: number, vterin: number, vzorkovaci = 22050): Float32Array {
  const s = new Float32Array(Math.round(vterin * vzorkovaci));
  for (let i = 0; i < s.length; i += 1) s[i] = Math.sin((2 * Math.PI * hz * i) / vzorkovaci);
  return s;
}

test('shodná nahrávka vyjde jako shodná', () => {
  const a = ton(440, 1);
  const v = porovnejNahravky(a, a, 22050);
  assert.ok(v.tony > 0.95, `shoda tónů ${v.tony}`);
  assert.ok(v.rozptylMs < 20, `rozptyl ${v.rozptylMs} ms`);
});

test('jiný tón vyjde jako neshoda', () => {
  // Kvarta výš je jiná tónová třída, tedy jiná hra.
  const v = porovnejNahravky(ton(587.33, 1), ton(440, 1), 22050);
  assert.ok(v.tony < 0.5, `shoda tónů ${v.tony} měla být nízká`);
});

test('tentýž tón o oktávu výš projde jako shoda', () => {
  // Chroma slévá oktávy schválně — riff jinde na krku je pořád ten riff.
  const v = porovnejNahravky(ton(880, 1), ton(440, 1), 22050);
  assert.ok(v.tony > 0.9, `shoda ${v.tony}`);
});

test('krátký signál nespadne', () => {
  const v = porovnejNahravky(new Float32Array(10), ton(440, 1), 22050);
  assert.equal(v.snimku, 0);
});

test('totožné nahrávky dají úhlopříčku, ne bloudění', () => {
  /**
   * Tohle je past, na kterou modul spadl: když je cena všude skoro
   * nulová, borcení nemá co upřednostnit a putuje do stran. Z toho pak
   * vyleze „hraješ o 100 ms vedle" u hry přesné na vzorek.
   */
  const stejne = Array.from({ length: 9 }, () => chromaTridy(9));
  const z = zarovnej(stejne, stejne);
  assert.equal(z.cesta.length, 9, 'cesta má mít tolik kroků, kolik je snímků');
  for (const [i, j] of z.cesta) assert.equal(i, j, 'každý snímek patří ke svému');
});

test('rozptyl u shodné hry vyjde nulový', () => {
  const stejne = Array.from({ length: 12 }, () => chromaTridy(4));
  const h = ohodnot(zarovnej(stejne, stejne), 0.05);
  assert.ok(h.rozptylMs < 1, `rozptyl ${h.rozptylMs} ms měl být nulový`);
});

test('skutečné zpoždění se pořád najde', () => {
  // Pokuta nesmí zarovnání znehybnit — posunutou hru musí dohledat.
  const predloha = [0, 0, 4, 7, 11, 11].map(chromaTridy);
  const moje = [0, 0, 0, 4, 7, 11].map(chromaTridy);
  const z = zarovnej(moje, predloha);
  assert.ok(z.cesta.some(([i, j]) => i !== j), 'cesta se měla posunout');
  assert.ok(z.cena < 0.3, `cena ${z.cena} má zůstat nízká`);
});
