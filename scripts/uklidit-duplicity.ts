// Smaže z knihovny kopie souborů, které v ní leží víckrát.
//
// Duplicita se pozná podle obsahu, ne podle názvu — přejmenovaná kopie je
// pořád kopie. Z každé skupiny zůstane nejstarší soubor; kopie, na kterou
// ukazuje příloha nějaké písně, se nemaže vůbec.
//
// Použití:
//   bun run scripts/uklidit-duplicity.ts --check   (jen vypíše, co by udělal)
//   bun run scripts/uklidit-duplicity.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { isR2Configured, deleteObject } = await import('../r2.ts');
const { uklidDuplicit } = await import('../knihovnaUklid.ts');

const URL = process.env.VITE_SUPABASE_URL;
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KLIC) {
  console.error('Chybí VITE_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const admin = createClient(URL, KLIC, { auth: { persistSession: false } });
const JEN_KONTROLA = process.argv.includes('--check');

const { data: skupiny, error } = await admin.rpc('duplicitni_soubory');
if (error) {
  console.error('Nepodařilo se zjistit duplicity:', error.message);
  process.exit(1);
}

const kopii = (skupiny || []).reduce((a: number, s: any) => a + Number(s.pocet) - 1, 0);
const bajtu = (skupiny || []).reduce((a: number, s: any) => a + Number(s.bajtu_navic), 0);
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

console.log(`Skupin: ${(skupiny || []).length}, zbytečných kopií: ${kopii}, místo navíc: ${mb(bajtu)}`);

if (JEN_KONTROLA) {
  for (const s of (skupiny || []).slice(0, 20) as any[]) {
    console.log(`  ${s.pocet}× ${s.nazvy.join(' | ')}  (${mb(Number(s.bajtu_navic))})`);
  }
  if ((skupiny || []).length > 20) console.log(`  … a dalších ${(skupiny || []).length - 20} skupin`);
  process.exit(0);
}

if (!isR2Configured()) {
  console.error('R2 není nastavené — zkontroluj R2_* proměnné v .env');
  process.exit(1);
}

const smazZUloziste = async (bucket: string, key: string) => {
  if (bucket === 'r2') await deleteObject(key);
  else await admin.storage.from(bucket).remove([key]);
};

const v = await uklidDuplicit(admin, smazZUloziste);
console.log(`\nSmazáno ${v.smazano} kopií, uvolněno ${mb(v.uvolneno)}.`);
if (v.ponechano) console.log(`${v.ponechano} kopií zůstalo — visí na nich přílohy písní.`);
