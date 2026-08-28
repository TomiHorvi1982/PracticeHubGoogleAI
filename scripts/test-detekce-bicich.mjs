/**
 * Test detekce úderů proti známému zadání.
 *
 * Spouští se: `npx tsx scripts/test-detekce-bicich.mjs`
 * Vyžaduje `node-web-audio-api` (Web Audio mimo prohlížeč).
 *
 * Zvuky se skládají tak, aby odpovídaly skutečným nástrojům: kopák je
 * klesající sinus dole, virbl tělo kolem 200 Hz plus šum ve středech,
 * hi-hat šum posunutý nahoru. Bílý šum by hi-hat nezastupoval — ten má
 * energii převážně nad pěti kilohertzy.
 */
import { OfflineAudioContext } from 'node-web-audio-api';
globalThis.OfflineAudioContext = OfflineAudioContext;
const { vyctiRytmus } = await import('../src/services/detekceUderu.ts');
const SR = 44100;

/** Jednoduchý jednopólový filtr, ať mají zvuky realistické spektrum. */
function filtruj(vzorky, alfa, horni) {
  let stav = 0;
  return vzorky.map((v) => {
    stav = stav + alfa * (v - stav);
    return horni ? v - stav : stav;
  });
}

function uder(data, cas, druh) {
  const start = Math.floor(cas * SR);
  const delka = druh === 'kick' ? 0.18 : druh === 'snare' ? 0.14 : 0.05;
  const n = Math.floor(delka * SR);
  let syrove = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (druh === 'kick') {
      const f = 45 + 65 * Math.exp(-t * 30);
      syrove[i] = Math.sin(2 * Math.PI * f * t);
    } else if (druh === 'snare') {
      syrove[i] = 0.4 * Math.sin(2 * Math.PI * 200 * t) + 0.6 * (Math.random() * 2 - 1);
    } else {
      syrove[i] = Math.random() * 2 - 1;
    }
  }
  // Virbl: šum ve středech. Hi-hat: šum nahoře.
  if (druh === 'snare') syrove = filtruj(syrove, 0.35, false);
  if (druh === 'hihat') syrove = filtruj(syrove, 0.55, true);

  for (let i = 0; i < n && start + i < data.length; i++) {
    const t = i / SR;
    const obalka = Math.exp(-t * (druh === 'hihat' ? 90 : druh === 'snare' ? 25 : 14));
    const hlas = druh === 'hihat' ? 0.5 : druh === 'snare' ? 0.9 : 1.0;
    data[start + i] += syrove[i] * obalka * hlas;
  }
}

async function test(bpm, vzor, taktu = 16) {
  const dk = 60 / bpm / 4;
  const data = new Float32Array(Math.ceil(taktu * 16 * dk * SR) + SR);
  for (let t = 0; t < taktu; t++)
    for (let k = 0; k < 16; k++) {
      const cas = 0.5 + (t * 16 + k) * dk;
      for (const [druh, kroky] of Object.entries(vzor)) if (kroky.includes(k)) uder(data, cas, druh);
    }
  let max = 0; for (const v of data) max = Math.max(max, Math.abs(v));
  for (let i = 0; i < data.length; i++) data[i] = (data[i] / max) * 0.9;
  const ctx = new OfflineAudioContext(1, data.length, SR);
  const buf = ctx.createBuffer(1, data.length, SR);
  buf.copyToChannel(data, 0);
  return vyctiRytmus(buf);
}

function porovnej(nazev, ocekavano, dostal) {
  const o = new Set(ocekavano), d = new Set(dostal);
  const trefa = [...o].filter(x => d.has(x)).length;
  const navic = [...d].filter(x => !o.has(x)).length;
  const chybi = [...o].filter(x => !d.has(x)).length;
  console.log(`  ${chybi===0&&navic===0?'✓':trefa>0?'~':'✗'} ${nazev.padEnd(6)} čekáno [${[...o].join(',')}] dostal [${[...d].join(',')}]`);
  return { trefa, chybi, navic };
}

const zadani = [
  { bpm: 120, nazev: 'rock, osminové hi-haty', vzor: { kick: [0,8], snare: [4,12], hihat: [0,2,4,6,8,10,12,14] } },
  { bpm: 90,  nazev: 'pomalý, kopák na 1 a 3', vzor: { kick: [0,6,8], snare: [4,12], hihat: [0,4,8,12] } },
  { bpm: 160, nazev: 'rychlý punk',            vzor: { kick: [0,4,8,12], snare: [4,12], hihat: [0,2,4,6,8,10,12,14] } },
];

let T=0,C=0,N=0,tempoOk=0;
for (const z of zadani) {
  const v = await test(z.bpm, z.vzor);
  const od = Math.abs(v.bpm - z.bpm);
  if (od <= 2) tempoOk++;
  console.log(`\n${z.nazev} @ ${z.bpm} BPM`);
  console.log(`  ${od<=2?'✓':'✗'} tempo  čekáno ${z.bpm}, dostal ${v.bpm}`);
  const kroky = (pad) => v.mrizka[pad].map((b,i)=>b?i:-1).filter(i=>i>=0);
  for (const [d,pad] of [['kick','kick'],['snare','snare'],['hihat','hihat_closed']]) {
    const r = porovnej(d, z.vzor[d]||[], kroky(pad)); T+=r.trefa; C+=r.chybi; N+=r.navic;
  }
  console.log(`  úderů ${v.uderu}:`, v.poPasmech);
}
console.log(`\nTempo ${tempoOk}/${zadani.length}. Tečky: trefeno ${T}, chybí ${C}, navíc ${N}`);
