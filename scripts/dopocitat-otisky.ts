// Dopočítá otisk obsahu u souborů, které ho ještě nemají.
//
// Bez otisku appka nepozná, že přejmenovaný soubor v knihovně už jednou
// byl. Většina souborů ho dostala zadarmo ze synchronizace z disku;
// zbytek — hlavně PDF nahraná přes appku — se musí stáhnout z úložiště
// a spočítat. Stahuje se po jednom, ať to nezahltí linku.
//
// Použití:
//   bun run scripts/dopocitat-otisky.ts --check   (jen spočítá, kolik jich chybí)
//   bun run scripts/dopocitat-otisky.ts
//
// Bezpečné opakování: co otisk má, se přeskočí.

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const { isR2Configured, getObjectBytes } = await import('../r2.ts');

const URL = process.env.VITE_SUPABASE_URL;
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KLIC) {
  console.error('Chybí VITE_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const admin = createClient(URL, KLIC, { auth: { persistSession: false } });
const JEN_KONTROLA = process.argv.includes('--check');
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

const { data: soubory, error } = await admin
  .from('assets')
  .select('id, name, storage_bucket, storage_path, size_bytes')
  // I soubory přesunuté do sbírky tabulatur — v úložišti pořád leží a
  // sbírka si otisk bere od nich.
  .in('status', ['active', 'moved'])
  .is('content_hash', null)
  .order('size_bytes', { ascending: true });

if (error) {
  console.error('Nepodařilo se načíst soubory:', error.message);
  process.exit(1);
}

const celkem = (soubory || []).reduce((a, s) => a + Number(s.size_bytes || 0), 0);
console.log(`Bez otisku: ${(soubory || []).length} souborů, ${mb(celkem)} ke stažení.`);

if (JEN_KONTROLA) process.exit(0);
if (!isR2Configured()) {
  console.error('R2 není nastavené — zkontroluj R2_* proměnné v .env');
  process.exit(1);
}

let hotovo = 0;
let nactenoBajtu = 0;
let selhalo = 0;
/** Soubory, u kterých se teprve teď ukázalo, že už v knihovně jsou. */
const duplicity: string[] = [];

for (const s of soubory || []) {
  let bajty: Uint8Array | null = null;
  if (s.storage_bucket === 'r2') {
    bajty = (await getObjectBytes(s.storage_path))?.body || null;
  } else {
    const { data } = await admin.storage.from(s.storage_bucket).download(s.storage_path);
    if (data) bajty = new Uint8Array(await data.arrayBuffer());
  }

  if (!bajty) {
    selhalo++;
    console.warn(`  ✗ ${s.name} — z úložiště se nenačetl`);
    continue;
  }

  const otisk = createHash('sha256').update(bajty).digest('hex');

  // Otisk může narazit na soubor, který v knihovně už je. Skript ale nic
  // nemaže — jen to vypíše, ať se úklid dělá vědomě.
  const { data: uzTam } = await admin
    .from('assets')
    .select('name')
    .eq('content_hash', otisk)
    .in('status', ['active', 'moved'])
    .neq('id', s.id)
    .maybeSingle();
  if (uzTam) duplicity.push(`${s.name} = ${uzTam.name}`);

  const { error: chyba } = await admin.from('assets').update({ content_hash: otisk }).eq('id', s.id);
  if (chyba) {
    selhalo++;
    console.warn(`  ✗ ${s.name} — zápis selhal: ${chyba.message}`);
    continue;
  }

  hotovo++;
  nactenoBajtu += bajty.length;
  if (hotovo % 25 === 0) {
    console.log(`  ${hotovo}/${(soubory || []).length} — staženo ${mb(nactenoBajtu)}`);
  }
}

console.log(`\nHotovo: ${hotovo} otisků, staženo ${mb(nactenoBajtu)}.`);
if (selhalo) console.log(`Nepovedlo se: ${selhalo}.`);
if (duplicity.length) {
  console.log(`\nNově odhalené duplicity (${duplicity.length}) — uklidit jde skriptem uklidit-duplicity.ts:`);
  for (const d of duplicity.slice(0, 30)) console.log(`  ${d}`);
  if (duplicity.length > 30) console.log(`  … a dalších ${duplicity.length - 30}`);
}
