// scripts/import-drum-loops.ts — přinese do knihovny bicí smyčky ve WAV.
//
// Nahrazují MIDI groovy. Smyčka je hotová nahrávka, takže zní tak, jak ji
// nahrál bubeník — MIDI se muselo skládat ze vzorků a znělo podle toho, jak
// dobrou sadu k němu appka zrovna měla.
//
// Tempo se čte z názvu souboru („... - 160 BPM.wav"). Bez něj se smyčka
// nedá vybírat k písni, takže se soubory bez tempa přeskakují — smyčka,
// kterou nejde zařadit, je v knihovně jen na obtíž.
//
// Použití:
//   bun run scripts/import-drum-loops.ts <složka>            # jen ukáže
//   bun run scripts/import-drum-loops.ts <složka> --apply --limit 120

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { uploadObject } from '../r2';

dotenv.config();

const DIR = path.resolve(process.argv[2] || '');
const APPLY = process.argv.includes('--apply');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : 120;

/** Smyčka delší než tohle bývá celá skladba, ne takt k opakování. */
const MAX_BAJTU = 6 * 1024 * 1024;

/**
 * Vypadá to na bicí, ne na kytaru nebo klavír?
 *
 * `rhythm` se sem nesmí — kytarové balíky ho mají v názvu skoro u každého
 * riffu („Rock 4 - Rhythm 3"), takže s ním prošly do výběru smyčky, které
 * s bicími nemají nic společného.
 */
const BICI = /(drum|perc|beat|break|kick|snare|\bhat\b|\btom\b|conga|bongo|shaker|tamb)/i;
const NENI_BICI = /(guitar|piano|bass|vocal|vox|synth|pad|lead|string|brass|choir|riff)/i;

function tempoZNazvu(nazev: string): number | null {
  const m = nazev.match(/(\d{2,3})\s*bpm/i);
  if (!m) return null;
  const bpm = parseInt(m[1], 10);
  // Mimo tenhle rozsah to nebude tempo, ale číslo v názvu.
  return bpm >= 50 && bpm <= 250 ? bpm : null;
}

function vsechnyWav(dir: string): string[] {
  const out: string[] = [];
  const chod = (d: string) => {
    let polozky: fs.Dirent[];
    try {
      polozky = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of polozky) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) chod(abs);
      else if (/\.wav$/i.test(e.name)) out.push(abs);
    }
  };
  chod(dir);
  return out;
}

async function main() {
  if (!DIR || !fs.existsSync(DIR)) {
    console.error('BLOCKED: zadejte složku se smyčkami.');
    process.exit(1);
  }

  const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: stavajici } = await admin
    .from('assets')
    .select('name')
    .eq('status', 'active')
    .eq('category', 'drum_loop');
  const zname = new Set((stavajici || []).map((a) => a.name.toLowerCase()));

  const kandidati: { cesta: string; bpm: number; velikost: number }[] = [];
  for (const f of vsechnyWav(DIR)) {
    const jmeno = path.basename(f);
    if (zname.has(jmeno.toLowerCase())) continue;
    const cesta = f.toLowerCase();
    if (NENI_BICI.test(cesta)) continue;
    if (!BICI.test(jmeno) && !BICI.test(cesta)) continue;
    const bpm = tempoZNazvu(jmeno);
    if (!bpm) continue;
    let velikost = 0;
    try {
      velikost = fs.statSync(f).size;
    } catch {
      continue;
    }
    if (velikost === 0 || velikost > MAX_BAJTU) continue;
    kandidati.push({ cesta: f, bpm, velikost });
  }

  // Rozprostřít napříč tempy, ne vzít 120 smyček po sobě z jedné složky —
  // jinak by celá knihovna byla v jednom tempu a jednom stylu.
  const podleTempa = new Map<number, typeof kandidati>();
  for (const k of kandidati) {
    const koš = Math.round(k.bpm / 10) * 10;
    if (!podleTempa.has(koš)) podleTempa.set(koš, []);
    podleTempa.get(koš)!.push(k);
  }

  const vybrane: typeof kandidati = [];
  const koše = [...podleTempa.keys()].sort((a, b) => a - b);
  let kolo = 0;
  while (vybrane.length < LIMIT && kolo < 100) {
    for (const k of koše) {
      const seznam = podleTempa.get(k)!;
      if (kolo < seznam.length && vybrane.length < LIMIT) vybrane.push(seznam[kolo]);
    }
    kolo++;
  }

  console.log(`Složka:     ${DIR}`);
  console.log(`Kandidátů:  ${kandidati.length} bicích smyček s tempem`);
  console.log(`Temp:       ${koše.length} různých (${koše[0]}–${koše[koše.length - 1]} BPM)`);
  console.log(`Vybráno:    ${vybrane.length}`);
  console.log(`Velikost:   ${(vybrane.reduce((n, k) => n + k.velikost, 0) / 1048576).toFixed(0)} MB`);
  console.log(`Režim:      ${APPLY ? 'NAHRÁVÁNÍ' : 'jen ukázka (--apply nahraje)'}\n`);

  if (!APPLY) {
    for (const k of vybrane.slice(0, 8)) {
      console.log(`  ${String(k.bpm).padStart(3)} BPM  ${path.basename(k.cesta).slice(0, 58)}`);
    }
    console.log('\nNic se nenahrálo. Spusťte s --apply.');
    return;
  }

  let nahrano = 0;
  let bajtu = 0;
  for (const k of vybrane) {
    const jmeno = path.basename(k.cesta);
    try {
      const bajty = fs.readFileSync(k.cesta);
      const klic = `assets/global/drum_loops/${crypto.randomUUID()}-${jmeno.replace(/[^\w.\-]+/g, '_')}`;
      await uploadObject(klic, bajty, 'audio/wav');
      const { error } = await admin.from('assets').insert({
        name: jmeno,
        original_filename: jmeno,
        mime_type: 'audio/wav',
        size_bytes: bajty.length,
        storage_bucket: 'r2',
        storage_path: klic,
        asset_type: 'sample',
        category: 'drum_loop',
        status: 'active',
        owner_id: null,
        // Tempo je to hlavní, podle čeho se smyčka k písni vybírá.
        metadata: { bpm: k.bpm, balik: path.basename(path.dirname(k.cesta)) },
      });
      if (error) throw new Error(error.message);
      nahrano++;
      bajtu += bajty.length;
    } catch (e: any) {
      console.log(`  ! ${jmeno.slice(0, 44)}: ${e.message.slice(0, 46)}`);
    }
  }
  console.log(`\nNahráno: ${nahrano} smyček, ${(bajtu / 1048576).toFixed(0)} MB.`);
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
