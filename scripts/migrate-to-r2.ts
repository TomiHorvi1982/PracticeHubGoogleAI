// scripts/migrate-to-r2.ts — přenese soubory ze Supabase Storage do Cloudflare R2.
//
// Supabase má ve volném tarifu 1 GB souborů a data kapely ho přerostla.
// R2 dává 10 GB a neúčtuje přenos ven. Databáze, přihlašování a rejstříky
// zůstávají v Supabase — stěhují se jenom soubory.
//
// Klíč v R2 zachovává původní rozvržení i s bucketem, ze kterého soubor
// přišel: `assets/global/guitar_pro/…`, `audio/global/stems/…`. Řádek se
// pak přepne na `storage_bucket = 'r2'`, podle čehož appka pozná, odkud
// soubor brát.
//
// KOPÍRUJE, NEMAŽE. Originály v Supabase zůstanou, dokud se ručně
// neuklidí — takže když se cokoliv pokazí, není co ztratit. Přenos je
// idempotentní: hotové soubory přeskočí podle velikosti v R2.
//
// Použití:
//   bun run scripts/migrate-to-r2.ts --check
//   bun run scripts/migrate-to-r2.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('BLOCKED: chybí VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const { isR2Configured, uploadObject, objectSize, R2_BUCKET_NAME } = await import('../r2.ts');
if (!isR2Configured()) {
  console.error('BLOCKED: chybí R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY v .env');
  process.exit(1);
}

const admin = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CHECK_ONLY = process.argv.includes('--check') || process.argv.includes('--dry-run');
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Klíč v R2 nese i původní bucket, aby se stejné cesty ze dvou bucketů nesrazily. */
const r2KeyFor = (bucket: string, path: string) => `${bucket}/${path}`;

async function main() {
  const { data: assets, error } = await admin
    .from('assets')
    .select('id, name, storage_bucket, storage_path, size_bytes, category')
    .eq('status', 'active')
    .order('category');
  if (error) throw new Error(error.message);

  const kPrenosu = (assets || []).filter((a: any) => a.storage_bucket !== 'r2');
  const hotove = (assets || []).length - kPrenosu.length;
  const celkem = kPrenosu.reduce((s: number, a: any) => s + (a.size_bytes || 0), 0);

  console.log(`Cílový bucket: ${R2_BUCKET_NAME()}`);
  console.log(`Souborů celkem: ${(assets || []).length}, už v R2: ${hotove}, k přenosu: ${kPrenosu.length} (${mb(celkem)})\n`);

  const podleKategorie = new Map<string, [number, number]>();
  for (const a of kPrenosu as any[]) {
    const k = podleKategorie.get(a.category) || [0, 0];
    podleKategorie.set(a.category, [k[0] + 1, k[1] + (a.size_bytes || 0)]);
  }
  for (const [kat, [n, b]] of [...podleKategorie].sort((x, y) => y[1][1] - x[1][1])) {
    console.log(`  ${kat.padEnd(18)} ${String(n).padStart(4)} ks  ${mb(b).padStart(10)}`);
  }

  if (CHECK_ONLY) {
    console.log('\n*** KONTROLA — nic se nepřenáší ***');
    return;
  }

  console.log('\nPřenáším…');
  let hotovo = 0, preskoceno = 0, chyb = 0, bajtu = 0;

  for (const a of kPrenosu as any[]) {
    const key = r2KeyFor(a.storage_bucket, a.storage_path);
    try {
      // Už v R2 leží ve správné velikosti? Pak jen přepnout řádek.
      const uz = await objectSize(key);
      if (uz !== null && (!a.size_bytes || uz === Number(a.size_bytes))) {
        await admin.from('assets').update({ storage_bucket: 'r2', storage_path: key }).eq('id', a.id);
        preskoceno++;
        continue;
      }

      const dl = await admin.storage.from(a.storage_bucket).download(a.storage_path);
      if (dl.error || !dl.data) throw new Error(`stažení: ${dl.error?.message || 'prázdné'}`);
      const bytes = new Uint8Array(await dl.data.arrayBuffer());

      await uploadObject(key, bytes, a.mime_type);

      // Ověřit, že v R2 opravdu leží — teprve pak přepnout řádek.
      const po = await objectSize(key);
      if (po !== bytes.length) throw new Error(`po nahrání sedí ${po} B, čekal jsem ${bytes.length} B`);

      const { error: upErr } = await admin
        .from('assets')
        .update({ storage_bucket: 'r2', storage_path: key, size_bytes: bytes.length })
        .eq('id', a.id);
      if (upErr) throw new Error(`zápis do databáze: ${upErr.message}`);

      hotovo++;
      bajtu += bytes.length;
      if (hotovo % 10 === 0) process.stdout.write(`\r  ${hotovo}/${kPrenosu.length}  ${mb(bajtu)}`);
    } catch (e: any) {
      chyb++;
      console.log(`\n  ! ${a.name || a.storage_path}: ${e.message}`);
    }
  }

  console.log(`\r  ${hotovo} přeneseno (${mb(bajtu)}), ${preskoceno} už v R2 bylo, ${chyb} chyb.`);
  console.log('\nOriginály v Supabase zůstaly nedotčené — uklidí se až po ověření, že appka čte z R2.');
  process.exit(chyb > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Chyba:', e.message); process.exit(1); });
