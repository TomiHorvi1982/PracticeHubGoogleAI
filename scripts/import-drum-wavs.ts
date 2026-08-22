// scripts/import-drum-wavs.ts — přinese do knihovny vzorky bicích ve WAV.
//
// Ze sbírky se vybírá, ne kopíruje všechno: deset tisíc souborů by v nabídce
// u padu nikdo neprošel a do úložiště by se ani nevešly. Bere se vyrovnaný
// počet od každého nástroje, aby nabídka nebyla ze tří čtvrtin perkuse.
//
// Nástroj se pozná z názvu souboru a uloží se do metadat, takže se v appce
// dá podle něj třídit — pad pro kopák nabídne kopáky, ne činely.
//
// Použití:
//   bun run scripts/import-drum-wavs.ts <složka>              # jen ukáže
//   bun run scripts/import-drum-wavs.ts <složka> --apply
//   bun run scripts/import-drum-wavs.ts <složka> --apply --per 30

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { uploadObject } from '../r2';

dotenv.config();

const DIR = path.resolve(process.argv[2] || '');
const APPLY = process.argv.includes('--apply');
const perIdx = process.argv.indexOf('--per');
const PER = perIdx > -1 ? parseInt(process.argv[perIdx + 1], 10) : 25;

/** Nástroje, na které se vzorky třídí, a jak se poznají z názvu. */
const NASTROJE: { klic: string; popis: string; vzor: RegExp; mimo?: RegExp }[] = [
  { klic: 'kick', popis: 'Kopák', vzor: /(kick|bassdrum|\bbd[\s_-]?\d)/i },
  { klic: 'snare', popis: 'Virbl', vzor: /(snare|\bsd[\s_-]?\d)/i, mimo: /clap/i },
  { klic: 'hihat', popis: 'Hi-hat', vzor: /(hi-?hat|\bhh[\s_-]?\d|\bhat\b)/i },
  { klic: 'tom', popis: 'Tomy', vzor: /\btom/i },
  { klic: 'crash', popis: 'Crash', vzor: /crash/i },
  { klic: 'ride', popis: 'Ride', vzor: /\bride\b/i },
  { klic: 'clap', popis: 'Tlesk', vzor: /clap/i },
  { klic: 'perc', popis: 'Perkuse', vzor: /(perc|shaker|tamb|cowbell|conga|bongo|rim)/i },
];

/** Delší soubory jsou smyčky nebo dozvuky, ne úder — do sady nepatří. */
const MAX_BAJTU = 900 * 1024;

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

function urciNastroj(nazev: string): string | null {
  for (const n of NASTROJE) {
    if (n.mimo?.test(nazev)) continue;
    if (n.vzor.test(nazev)) return n.klic;
  }
  return null;
}

async function main() {
  if (!DIR || !fs.existsSync(DIR)) {
    console.error('BLOCKED: zadejte složku se vzorky.');
    process.exit(1);
  }

  const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Co už v knihovně je, se znovu nenahrává.
  const { data: stavajici } = await admin
    .from('assets')
    .select('name')
    .eq('status', 'active')
    .eq('category', 'drum_kit_sample');
  const zname = new Set((stavajici || []).map((a) => a.name.toLowerCase()));

  const soubory = vsechnyWav(DIR);
  const podleNastroje = new Map<string, string[]>();

  for (const f of soubory) {
    const jmeno = path.basename(f);
    if (zname.has(jmeno.toLowerCase())) continue;
    let velikost = 0;
    try {
      velikost = fs.statSync(f).size;
    } catch {
      continue;
    }
    if (velikost === 0 || velikost > MAX_BAJTU) continue;

    const nastroj = urciNastroj(jmeno);
    if (!nastroj) continue;
    if (!podleNastroje.has(nastroj)) podleNastroje.set(nastroj, []);
    podleNastroje.get(nastroj)!.push(f);
  }

  console.log(`Složka:  ${DIR}`);
  console.log(`WAV:     ${soubory.length}`);
  console.log(`Na nástroj: ${PER}`);
  console.log(`Režim:   ${APPLY ? 'NAHRÁVÁNÍ' : 'jen ukázka (--apply nahraje)'}\n`);

  let nahrano = 0;
  let bajtu = 0;

  for (const n of NASTROJE) {
    const kandidati = podleNastroje.get(n.klic) || [];
    if (!kandidati.length) {
      console.log(`  ${n.popis.padEnd(10)} — nic nenalezeno`);
      continue;
    }

    // Rovnoměrně napříč sbírkou, ne prvních N z jedné složky — jinak by
    // celý pad zněl jedním balíkem.
    const krok = Math.max(1, Math.floor(kandidati.length / PER));
    const vybrane = kandidati.filter((_, i) => i % krok === 0).slice(0, PER);

    console.log(`  ${n.popis.padEnd(10)} ${String(vybrane.length).padStart(3)} z ${kandidati.length} dostupných`);

    if (!APPLY) continue;

    for (const f of vybrane) {
      const jmeno = path.basename(f);
      const bajty = fs.readFileSync(f);
      const klic = `assets/global/drum_samples/${n.klic}/${crypto.randomUUID()}-${jmeno.replace(/[^\w.\-]+/g, '_')}`;
      try {
        await uploadObject(klic, bajty, 'audio/wav');
        const { error } = await admin.from('assets').insert({
          name: jmeno,
          original_filename: jmeno,
          mime_type: 'audio/wav',
          size_bytes: bajty.length,
          storage_bucket: 'r2',
          storage_path: klic,
          asset_type: 'sample',
          category: 'drum_kit_sample',
          status: 'active',
          owner_id: null,
          // `nastroj` je to, podle čeho appka nabídne k padu ty správné
          // zvuky. `kitId` se schválně nevyplňuje — tyhle vzorky nepatří
          // do žádné sady, jsou to zásoby, ze kterých se sada skládá.
          metadata: { nastroj: n.klic, popisNastroje: n.popis, balik: path.basename(path.dirname(f)) },
        });
        if (error) throw new Error(error.message);
        nahrano++;
        bajtu += bajty.length;
      } catch (e: any) {
        console.log(`      ! ${jmeno.slice(0, 40)}: ${e.message.slice(0, 50)}`);
      }
    }
  }

  console.log(`\nNahráno: ${nahrano} vzorků, ${(bajtu / 1048576).toFixed(1)} MB.`);
  if (!APPLY) console.log('Nic se nenahrálo. Spusťte s --apply.');
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
