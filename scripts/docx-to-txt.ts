// scripts/docx-to-txt.ts — převede texty písní z Wordu na .txt, které
// umí načíst sync-folder.ts.
//
// `.docx` je zabalený ZIP, ne text — sync-folder ho zahodí. Tenhle skript
// ho převede přes macOS `textutil` a uloží vedle originálu pod názvem
// `Interpret - Nazev.txt`, což je tvar, ze kterého sync-folder pozná
// interpreta i název skladby.
//
// Název se bere z názvu souboru: odřízne se pořadové číslo („03. ") a
// zbytek se porovná s tím, co už je ve zpěvníku — když se skladba najde,
// použije se její název z databáze, ne z filenamu (v souborech bývají
// překlepy typu „RefuseResist" nebo „Slave new world").
//
// Originály nechává být. Existující .txt nepřepisuje bez `--force`.
//
// Použití:
//   bun run scripts/docx-to-txt.ts /Volumes/PortableSSD/NeverLateSync/zpevnik --artist Sepultura

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DIR = path.resolve(process.argv[2] || '');
const FORCE = process.argv.includes('--force');
const artistIdx = process.argv.indexOf('--artist');
const ARTIST = artistIdx > -1 ? process.argv[artistIdx + 1] : 'Neznámý interpret';

if (!DIR || !fs.existsSync(DIR)) {
  console.error(`BLOCKED: složka neexistuje: ${DIR || '(nezadána)'}`);
  console.error('Použití: bun run scripts/docx-to-txt.ts <složka> [--artist "Jméno"] [--force]');
  process.exit(1);
}

/** Porovnání názvů odolné vůči diakritice, číslování, mezerám a interpunkci. */
function normTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\d+[.\s-]*/, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Názvy skladeb, které už ve zpěvníku jsou — slouží jako slovník správných tvarů. */
async function knownTitles(): Promise<string[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn('Bez přístupu k databázi — názvy se vezmou z filenamů.');
    return [];
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.from('songs').select('title').eq('status', 'active');
  if (error) {
    console.warn(`Nepodařilo se načíst skladby (${error.message}) — názvy se vezmou z filenamů.`);
    return [];
  }
  return (data || []).map((s) => s.title);
}

/**
 * „RefuseResist" -> „Refuse Resist". Jen pro případ, že se skladba ve
 * zpěvníku nenajde a název musí vzniknout z filenamu.
 */
function tidyTitle(raw: string): string {
  const bezCisla = raw.replace(/^\d+[.\s-]*/, '').trim();
  const sMezerami = bezCisla.replace(/([a-z])([A-Z])/g, '$1 $2');
  return sMezerami
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

async function main() {
  const titles = await knownTitles();
  const byNorm = new Map(titles.map((t) => [normTitle(t), t]));

  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('.'));

  console.log(`Složka:    ${DIR}`);
  console.log(`Interpret: ${ARTIST}`);
  console.log(`Nalezeno:  ${files.length} .docx souborů\n`);

  let hotovo = 0;
  let preskoceno = 0;
  let chyb = 0;

  for (const file of files.sort()) {
    const stem = path.basename(file, path.extname(file));
    try {
      const text = execFileSync('textutil', ['-convert', 'txt', '-stdout', path.join(DIR, file)], {
        encoding: 'utf-8',
        maxBuffer: 32 * 1024 * 1024,
      }).trim();

      if (!text) throw new Error('převod vrátil prázdný text');

      const zDatabaze = byNorm.get(normTitle(stem));
      const title = zDatabaze || tidyTitle(stem);
      const out = path.join(DIR, `${ARTIST} - ${title}.txt`);

      if (fs.existsSync(out) && !FORCE) {
        console.log(`  = už existuje: ${path.basename(out)}`);
        preskoceno++;
        continue;
      }

      fs.writeFileSync(out, text, 'utf-8');
      const zdroj = zDatabaze ? 'název ze zpěvníku' : 'název z filenamu';
      console.log(`  + ${file}  ->  ${path.basename(out)}  (${zdroj}, ${text.length} znaků)`);
      hotovo++;
    } catch (e: any) {
      chyb++;
      console.log(`  ! ${file}: ${e.message}`);
    }
  }

  console.log(`\nHotovo: ${hotovo} převedeno, ${preskoceno} beze změny, ${chyb} chyb.`);
  process.exit(chyb > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Neočekávaná chyba:', e);
  process.exit(1);
});
