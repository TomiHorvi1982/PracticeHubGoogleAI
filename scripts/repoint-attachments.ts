// scripts/repoint-attachments.ts — přesměruje přílohy skladeb na R2.
//
// Přenos souborů do R2 přepsal tabulku `assets`, ale přílohy zapsané uvnitř
// `songs.metadata.attachments` zůstaly ukazovat na Supabase Storage. Zatím to
// funguje jen proto, že se originály v Supabase nemazaly — jakmile se uklidí,
// přestaly by se taby u skladeb otevírat.
//
// Ověřuje, že soubor v R2 opravdu leží, a teprve pak záznam přepíše. Nikdy
// nemaže a nedotkne se příloh, které mají obsah uložený přímo v sobě.
//
// Použití:
//   bun run scripts/repoint-attachments.ts --check
//   bun run scripts/repoint-attachments.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const { objectSize } = await import('../r2.ts');
const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CHECK_ONLY = process.argv.includes('--check') || process.argv.includes('--dry-run');

async function main() {
  const { data: songs, error } = await admin
    .from('songs')
    .select('id, title, metadata')
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  let prepnuto = 0, uzR2 = 0, chybiVR2 = 0, bezCesty = 0;
  const kZapisu: { id: string; metadata: any }[] = [];

  for (const s of songs || []) {
    const att = (s.metadata?.attachments || []) as any[];
    if (att.length === 0) continue;

    let zmena = false;
    const nove = [];
    for (const a of att) {
      if (!a?.storagePath) { bezCesty++; nove.push(a); continue; }
      if (a.storageBucket === 'r2') { uzR2++; nove.push(a); continue; }

      // Klíč v R2 nese i původní bucket — stejně jako u přenosu souborů.
      const r2Key = `${a.storageBucket || 'assets'}/${a.storagePath}`;
      const vel = await objectSize(r2Key);
      if (vel === null) {
        chybiVR2++;
        console.log(`  ! ${s.title} / ${a.name}: v R2 není, nechávám beze změny`);
        nove.push(a);
        continue;
      }

      // `dataUrl` se vyprázdní — je to podepsaný odkaz s omezenou platností
      // a appka si ho vyrábí až při načtení.
      nove.push({ ...a, storageBucket: 'r2', storagePath: r2Key, dataUrl: '' });
      zmena = true;
      prepnuto++;
    }

    if (zmena) kZapisu.push({ id: s.id, metadata: { ...s.metadata, attachments: nove } });
  }

  console.log(`\n  k přepnutí: ${prepnuto}, už na R2: ${uzR2}, v R2 chybí: ${chybiVR2}, bez cesty: ${bezCesty}`);
  console.log(`  dotčených skladeb: ${kZapisu.length}`);

  if (CHECK_ONLY) { console.log('\n*** KONTROLA — nic se nezapsalo ***'); return; }

  let ulozeno = 0;
  for (const z of kZapisu) {
    const { error: e } = await admin.from('songs').update({ metadata: z.metadata }).eq('id', z.id);
    if (e) console.log(`  ! ${z.id}: ${e.message}`);
    else ulozeno++;
  }
  console.log(`\n  uloženo skladeb: ${ulozeno}/${kZapisu.length}`);
}

main().catch((e) => { console.error('Chyba:', e.message); process.exit(1); });
