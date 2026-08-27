// Přestěhuje zbytek souborů ze Supabase Storage do R2.
//
// Knihovna byla na dvou místech: hromadný import skončil v R2, kdežto
// všechno nahrané přes appku padalo do Supabase Storage. Dvojí úložiště
// znamená dvojí účty, dvojí zálohy a pokaždé otázku, kde soubor vlastně
// je. R2 vyhrálo, protože v něm leží 3,3 GB z 3,35 GB a odchozí přenos
// se u něj neplatí.
//
// Použití:
//   bun run scripts/sjednotit-uloziste.ts --check   (jen vypíše, co by udělal)
//   bun run scripts/sjednotit-uloziste.ts
//
// Bezpečné opakování: co je už v R2, přeskočí. Ze Supabase nic nemaže —
// úklid je vědomé rozhodnutí, ne vedlejší účinek stěhování.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { isR2Configured, uploadObject, objectSize } = await import('../r2.ts');

const URL = process.env.VITE_SUPABASE_URL;
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KLIC) {
  console.error('Chybí VITE_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}
if (!isR2Configured()) {
  console.error('R2 není nastavené — zkontroluj R2_* proměnné v .env');
  process.exit(1);
}

const admin = createClient(URL, KLIC, { auth: { persistSession: false } });
const JEN_KONTROLA = process.argv.includes('--check');

const { data: soubory, error } = await admin
  .from('assets')
  .select('id, name, storage_bucket, storage_path, mime_type, size_bytes')
  .neq('storage_bucket', 'r2')
  .eq('status', 'active');

if (error) {
  console.error('Katalog se nepodařilo načíst:', error.message);
  process.exit(1);
}

console.log(`K přestěhování: ${soubory?.length || 0} souborů\n`);
if (JEN_KONTROLA) {
  for (const s of (soubory || []).slice(0, 10)) {
    console.log(`  ${s.storage_bucket}/${s.storage_path}`);
  }
  if ((soubory?.length || 0) > 10) console.log(`  … a dalších ${soubory!.length - 10}`);
  process.exit(0);
}

let hotovo = 0;
let preskoceno = 0;
let selhalo = 0;

for (const s of soubory || []) {
  // Klíč v R2 nese původní koš jako první úroveň — stejně jako u souborů,
  // které se tam nastěhovaly dřív.
  const klic = `${s.storage_bucket}/${s.storage_path}`;

  try {
    if (await objectSize(klic)) {
      // Už tam je z dřívějšího běhu; stačí přepsat záznam v katalogu.
      await admin.from('assets').update({ storage_bucket: 'r2', storage_path: klic }).eq('id', s.id);
      preskoceno++;
      continue;
    }

    const { data: obsah, error: chybaStazeni } = await admin.storage
      .from(s.storage_bucket)
      .download(s.storage_path);
    if (chybaStazeni || !obsah) throw new Error(chybaStazeni?.message || 'soubor nelze stáhnout');

    const bajty = new Uint8Array(await obsah.arrayBuffer());
    await uploadObject(klic, bajty, s.mime_type || undefined);

    // Katalog se přepisuje až po úspěšném nahrání. Opačné pořadí by při
    // chybě ukázalo na soubor, který v R2 není.
    const { error: chybaZapisu } = await admin
      .from('assets')
      .update({ storage_bucket: 'r2', storage_path: klic, size_bytes: bajty.length })
      .eq('id', s.id);
    if (chybaZapisu) throw new Error(chybaZapisu.message);

    hotovo++;
    if (hotovo % 10 === 0) console.log(`  … ${hotovo}`);
  } catch (e: any) {
    selhalo++;
    console.log(`  ! ${s.name}: ${e?.message}`);
  }
}

console.log(`\nPřestěhováno ${hotovo}, už bylo v R2 ${preskoceno}, selhalo ${selhalo}.`);
console.log('V Supabase Storage originály zůstaly — smažte je, až ověříte, že vše hraje.');
