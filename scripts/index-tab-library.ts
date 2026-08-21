// scripts/index-tab-library.ts — zpřístupní velkou sbírku Guitar Pro
// tabulatur (stovky složek podle interpretů) v aplikaci.
//
// Sbírka je typicky mnohem větší než volný tarif Supabase, takže se dělí na
// dvě části:
//
//   1. REJSTŘÍK — interpret, název, formát, velikost a cesta. Je drobný, takže
//      se nahraje celý. V appce pak jde sbírkou listovat podle abecedy
//      a hledat v ní, i když samotné soubory nikde nahrané nejsou.
//   2. SOUBORY — nahrávají se až na vyžádání (`--upload`), s hlídaným
//      limitem. Nahraný soubor přepne záznam na `stored` a jde otevřít
//      v přehrávači tabulatur.
//
// Očekává složky pojmenované podle interpreta:
//
//   <sbírka>/
//     Sepultura/
//       Roots Bloody Roots.gp5
//     Metallica/
//       One.gp4
//
// Idempotentní podle cesty k souboru. Nikdy nemaže.
//
// Použití:
//   bun run scripts/index-tab-library.ts <složka> --check
//   bun run scripts/index-tab-library.ts <složka>
//   bun run scripts/index-tab-library.ts <složka> --upload --limit-mb 200

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('BLOCKED: chybí VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ROOT = path.resolve(process.argv[2] || '');
const CHECK_ONLY = process.argv.includes('--check') || process.argv.includes('--dry-run');
const DO_UPLOAD = process.argv.includes('--upload');
const limitIdx = process.argv.indexOf('--limit-mb');
const LIMIT_MB = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : 200;

if (!ROOT || !fs.existsSync(ROOT)) {
  console.error(`BLOCKED: složka neexistuje nebo k ní není přístup: ${ROOT || '(nezadána)'}`);
  console.error('Použití: bun run scripts/index-tab-library.ts <složka> [--check] [--upload] [--limit-mb N]');
  process.exit(1);
}

const TAB_EXTS = new Set(['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.gtp', '.ptb', '.tg']);

interface TabFile {
  relPath: string;
  absPath: string;
  artist: string;
  title: string;
  format: string;
  size: number;
  /** iCloud drží nestažené soubory jako prázdné zástupce — z těch se číst nedá. */
  dataless: boolean;
}

/**
 * iCloud Drive nechává nestažené soubory na disku jen jako zástupce. Starší
 * macOS jim dává jméno `.název.icloud`, novější nechává jméno i velikost, ale
 * soubor nezabírá žádné bloky. Číst z nich nejde — musí se nejdřív stáhnout.
 */
function isDataless(abs: string, st: fs.Stats): boolean {
  if (path.basename(abs).startsWith('.') && abs.endsWith('.icloud')) return true;
  return st.size > 0 && st.blocks === 0;
}

function collect(root: string): TabFile[] {
  const out: TabFile[] = [];

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e: any) {
      console.log(`  ! nelze číst ${path.relative(root, dir) || '.'}: ${e.code || e.message}`);
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && !e.name.endsWith('.icloud')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(abs);
        continue;
      }
      // Zástupce se jmenuje `.Song.gp5.icloud` — skutečné jméno je uvnitř.
      const realName = e.name.endsWith('.icloud') ? e.name.slice(1, -'.icloud'.length) : e.name;
      const ext = path.extname(realName).toLowerCase();
      if (!TAB_EXTS.has(ext)) continue;

      let st: fs.Stats;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }

      const rel = path.relative(root, abs).split(path.sep).join('/');
      // Interpret = první úroveň složek pod kořenem. Soubor ležící přímo
      // v kořeni interpreta nemá, což je pořád lepší než si ho vymyslet.
      const parts = rel.split('/');
      const artist = parts.length > 1 ? parts[0] : 'Neznámý interpret';

      out.push({
        relPath: rel,
        absPath: abs,
        artist: artist.trim(),
        title: path.basename(realName, ext).trim(),
        format: ext.slice(1),
        size: st.size,
        dataless: isDataless(abs, st),
      });
    }
  };

  walk(root);
  return out;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function report(files: TabFile[]) {
  const byArtist = new Map<string, number>();
  for (const f of files) byArtist.set(f.artist, (byArtist.get(f.artist) || 0) + 1);
  const total = files.reduce((a, f) => a + f.size, 0);
  const dataless = files.filter((f) => f.dataless);

  console.log(`Interpretů: ${byArtist.size}`);
  console.log(`Tabulatur:  ${files.length}  (${mb(total)})`);
  console.log(`Formáty:    ${[...new Set(files.map((f) => f.format))].sort().join(', ')}`);

  const top = [...byArtist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('\nNejvíc zastoupení:');
  for (const [a, n] of top) console.log(`  ${String(n).padStart(4)}  ${a}`);

  if (dataless.length) {
    console.log(
      `\nPozor: ${dataless.length} souborů je jen zástupců z iCloudu (nestažené).\n` +
        `  Do rejstříku půjdou, ale nahrát se nedají, dokud je iCloud nestáhne.\n` +
        `  Ve Finderu složku vyberte a dejte „Stáhnout nyní", nebo:\n` +
        `    find "${ROOT}" -name '*.icloud' -exec brctl download {} \\;`
    );
  }
}

async function main() {
  console.log(`Sbírka: ${ROOT}\n`);
  const files = collect(ROOT);

  if (files.length === 0) {
    console.error('BLOCKED: ve složce nejsou žádné tabulatury (.gp .gp3 .gp4 .gp5 .gpx .gtp .ptb .tg).');
    process.exit(1);
  }

  report(files);

  if (CHECK_ONLY) {
    console.log('\n*** KONTROLA — nic se nezapsalo ***');
    return;
  }

  // --- rejstřík ---
  console.log('\nZapisuji rejstřík…');
  const { data: existing, error: exErr } = await admin.from('tab_library').select('rel_path, status');
  if (exErr) throw new Error(exErr.message);
  const known = new Map((existing || []).map((r: any) => [r.rel_path, r.status]));

  const nove = files.filter((f) => !known.has(f.relPath));
  let zapsano = 0;

  // Po dávkách — jeden insert na tisíce řádků by neprošel.
  const DAVKA = 500;
  for (let i = 0; i < nove.length; i += DAVKA) {
    const chunk = nove.slice(i, i + DAVKA).map((f) => ({
      artist: f.artist,
      title: f.title,
      format: f.format,
      rel_path: f.relPath,
      size_bytes: f.size,
      status: 'indexed' as const,
      metadata: { dataless: f.dataless },
    }));
    const { error } = await admin.from('tab_library').upsert(chunk, { onConflict: 'rel_path' });
    if (error) throw new Error(`rejstřík: ${error.message}`);
    zapsano += chunk.length;
    process.stdout.write(`\r  ${zapsano}/${nove.length}`);
  }
  console.log(`\r  ${zapsano} nových záznamů, ${known.size} už v rejstříku bylo.`);

  if (!DO_UPLOAD) {
    console.log(
      `\nSoubory se nenahrávaly. Sbírka je v appce vidět a dá se v ní hledat;\n` +
        `pro nahrání souborů přidejte --upload (výchozí strop ${LIMIT_MB} MB).`
    );
    return;
  }

  // --- soubory ---
  const kNahrani = files.filter((f) => known.get(f.relPath) !== 'stored' && !f.dataless);
  const strop = LIMIT_MB * 1024 * 1024;
  console.log(`\nNahrávám soubory (strop ${LIMIT_MB} MB)…`);

  let bajtu = 0;
  let nahrano = 0;
  let preskoceno = 0;

  for (const f of kNahrani) {
    if (bajtu + f.size > strop) {
      preskoceno++;
      continue;
    }
    try {
      const bytes = fs.readFileSync(f.absPath);
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      // Klíč musí být ASCII — názvy kapel bývají s diakritikou i s emoji.
      const safe = f.relPath
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9._/-]+/g, '-');
      const storagePath = `global/tab_library/${safe}`;

      const { error: upErr } = await admin.storage
        .from('assets')
        .upload(storagePath, bytes, { contentType: 'application/octet-stream', upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { error: rowErr } = await admin
        .from('tab_library')
        .update({
          storage_bucket: 'assets',
          storage_path: storagePath,
          content_hash: hash,
          status: 'stored',
          updated_at: new Date().toISOString(),
        })
        .eq('rel_path', f.relPath);
      if (rowErr) throw new Error(rowErr.message);

      bajtu += bytes.length;
      nahrano++;
      if (nahrano % 25 === 0) process.stdout.write(`\r  ${nahrano} souborů, ${mb(bajtu)}`);
    } catch (e: any) {
      console.log(`\n  ! ${f.relPath}: ${e.message}`);
    }
  }

  console.log(`\r  ${nahrano} souborů nahráno (${mb(bajtu)}).`);
  if (preskoceno) {
    console.log(
      `  ${preskoceno} souborů se do stropu nevešlo — zůstávají v rejstříku jako „jen v seznamu".\n` +
        `  Strop zvýšíte přes --limit-mb.`
    );
  }
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
