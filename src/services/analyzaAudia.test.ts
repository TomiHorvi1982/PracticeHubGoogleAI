import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spicka, rms, naDb, dynamickyRozsah, hlasitostLufs,
  toninaZChroma, stabilitaTempa, zastoupeniStop, vyrezZeStredu, detekujNastupy,
} from './analyzaAudia.js';

/** Sinus o dané amplitudě a kmitočtu. */
function sinus(amplituda: number, hz: number, vterin: number, fs = 48000): Float32Array {
  const d = new Float32Array(Math.round(fs * vterin));
  for (let i = 0; i < d.length; i++) d[i] = amplituda * Math.sin((2 * Math.PI * hz * i) / fs);
  return d;
}

test('špička sinu je jeho amplituda', () => {
  assert.ok(Math.abs(spicka(sinus(0.5, 440, 0.5)) - 0.5) < 0.001);
});

test('efektivní hodnota sinu je amplituda děleno odmocninou ze dvou', () => {
  // Známý vztah: RMS sinu = A / √2. Kdyby vyšlo něco jiného, je chyba
  // ve výpočtu, ne v signálu.
  const r = rms(sinus(1, 440, 0.5));
  assert.ok(Math.abs(r - 1 / Math.SQRT2) < 0.002, `vyšlo ${r}`);
});

test('decibely: jednička je nula, polovina asi −6', () => {
  assert.equal(naDb(1), 0);
  assert.ok(Math.abs(naDb(0.5) + 6.02) < 0.01);
});

test('ticho nedá minus nekonečno, ale čitelnou hodnotu', () => {
  assert.equal(naDb(0), -120);
  assert.equal(naDb(-1), -120);
});

test('činitel výkyvu sinu jsou tři decibely', () => {
  // Špička/RMS = √2, tedy 20·log10(√2) = 3,01 dB.
  const d = dynamickyRozsah(sinus(0.8, 440, 0.5));
  assert.ok(Math.abs(d - 3.01) < 0.05, `vyšlo ${d}`);
});

test('obdélník nemá dynamiku žádnou', () => {
  // U obdélníku se špička rovná efektivní hodnotě.
  const d = new Float32Array(4800);
  for (let i = 0; i < d.length; i++) d[i] = i % 2 ? 0.7 : -0.7;
  assert.ok(dynamickyRozsah(d) < 0.01);
});

test('ticho nemá dynamiku a nespadne', () => {
  assert.equal(dynamickyRozsah(new Float32Array(1000)), 0);
  assert.equal(dynamickyRozsah(new Float32Array(0)), 0);
});

test('hlasitější nahrávka má vyšší LUFS', () => {
  const tise = hlasitostLufs(sinus(0.1, 1000, 1), 48000);
  const hlasite = hlasitostLufs(sinus(0.8, 1000, 1), 48000);
  assert.ok(hlasite > tise, `${hlasite} nemá být menší než ${tise}`);
  // Osminásobek amplitudy je osmnáct decibelů; povolím širší pásmo,
  // protože K-váhování hodnotu podle kmitočtu posouvá.
  assert.ok(hlasite - tise > 14 && hlasite - tise < 22, `rozdíl ${hlasite - tise}`);
});

test('ticho i prázdný vstup dají spodní mez, ne NaN', () => {
  assert.equal(hlasitostLufs(new Float32Array(48000), 48000), -120);
  assert.equal(hlasitostLufs(new Float32Array(0), 48000), -120);
  assert.ok(Number.isFinite(hlasitostLufs(sinus(0.5, 440, 1), 0)));
});

test('durový kvintakord se pozná jako dur', () => {
  // C, E, G silně, ostatní slabě.
  const ch = new Array(12).fill(0.05);
  ch[0] = 1; ch[4] = 0.9; ch[7] = 0.95;
  const t = toninaZChroma(ch)!;
  assert.equal(t.tonika, 'C');
  assert.equal(t.dur, true);
  assert.equal(t.popis, 'C dur');
});

test('mollový kvintakord se pozná jako moll', () => {
  // A, C, E — stejné tóny jako C dur, ale s těžištěm na A.
  const ch = new Array(12).fill(0.05);
  ch[9] = 1; ch[0] = 0.85; ch[4] = 0.9;
  const t = toninaZChroma(ch)!;
  assert.equal(t.dur, false);
});

test('nejednoznačná nahrávka má nízkou jistotu', () => {
  // Všech dvanáct tónů stejně: žádná tónina nesedí líp než druhá.
  const t = toninaZChroma(new Array(12).fill(1));
  assert.ok(t === null || t.jistota < 20, 'rovnoměrné chroma nesmí tvrdit tóninu jistě');
});

test('prázdné chroma tóninu nevrací', () => {
  assert.equal(toninaZChroma(new Array(12).fill(0)), null);
  assert.equal(toninaZChroma([1, 2, 3]), null);
});

test('pravidelný klik má stabilitu sto', () => {
  assert.equal(stabilitaTempa([0.5, 0.5, 0.5, 0.5]), 100);
});

test('kolísavé tempo má stabilitu nižší', () => {
  const s = stabilitaTempa([0.5, 0.62, 0.44, 0.58]);
  assert.ok(s > 0 && s < 100, `vyšlo ${s}`);
});

test('míň než dva údery nic neříká', () => {
  assert.equal(stabilitaTempa([0.5]), 0);
  assert.equal(stabilitaTempa([]), 0);
});

test('zastoupení se počítá proti nejhlasitější stopě', () => {
  const z = zastoupeniStop({ drums: 0.8, bass: 0.4, vocals: 0.2 });
  assert.equal(z.drums, 100);
  assert.equal(z.bass, 50);
  assert.equal(z.vocals, 25);
});

test('samé ticho dá nuly, ne dělení nulou', () => {
  assert.deepEqual(zastoupeniStop({ a: 0, b: 0 }), { a: 0, b: 0 });
  assert.deepEqual(zastoupeniStop({}), {});
});

test('výřez ze středu má žádanou délku', () => {
  const d = new Float32Array(48000 * 200); // 200 vteřin
  const v = vyrezZeStredu(d, 48000, 90);
  assert.equal(v.length, 48000 * 90);
});

test('kratší nahrávka se nekrátí', () => {
  const d = new Float32Array(48000 * 10);
  assert.equal(vyrezZeStredu(d, 48000, 90).length, d.length);
});

test('výřez je opravdu ze středu, ne od začátku', () => {
  // Značka uprostřed musí ve výřezu být, značka na začátku ne.
  const d = new Float32Array(48000 * 100);
  d[Math.floor(d.length / 2)] = 1;
  d[10] = 1;
  const v = vyrezZeStredu(d, 48000, 20);
  assert.equal(spicka(v), 1, 'střed měl být uvnitř výřezu');
  assert.equal(v[10], 0, 'začátek nahrávky do výřezu nepatří');
});

test('nesmyslná délka výřezu vrátí celou nahrávku', () => {
  const d = new Float32Array(1000);
  assert.equal(vyrezZeStredu(d, 48000, 0).length, 1000);
  assert.equal(vyrezZeStredu(d, 48000, -5).length, 1000);
});

test('nástupy se najdou tam, kde zvuk prudce zesílí', () => {
  // Ticho s krátkými údery po půl vteřině.
  const vz = 8000;
  const d = new Float32Array(vz * 4);
  for (const t of [0.5, 1.0, 1.5, 2.0, 2.5]) {
    const od = Math.floor(t * vz);
    for (let i = od; i < od + 400; i++) d[i] = Math.sin(i * 0.3) * 0.8;
  }
  const n = detekujNastupy(d, vz);
  assert.ok(n.length >= 4, `naslo ${n.length}`);
  // Každý úder má mít nástup do 50 ms od svého místa.
  for (const t of [0.5, 1.0, 1.5, 2.0]) {
    assert.ok(n.some((x) => Math.abs(x - t) < 0.05), `chybi nastup u ${t}s: ${n.slice(0, 8)}`);
  }
});

test('v tichu ani v rovném tónu žádné nástupy nejsou', () => {
  const vz = 8000;
  assert.deepEqual(detekujNastupy(new Float32Array(vz * 2), vz), []);
  const rovny = new Float32Array(vz * 2);
  for (let i = 0; i < rovny.length; i++) rovny[i] = Math.sin(i * 0.1) * 0.5;
  assert.ok(detekujNastupy(rovny, vz).length <= 2, 'rovny ton nema nastupy');
});

test('krátká nebo prázdná data nic nerozbijí', () => {
  assert.deepEqual(detekujNastupy(new Float32Array(0), 8000), []);
  assert.deepEqual(detekujNastupy(new Float32Array(100), 8000), []);
  assert.deepEqual(detekujNastupy(new Float32Array(8000), 0), []);
});
