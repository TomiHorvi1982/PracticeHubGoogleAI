// Vyhodí z bicích sad vrstvy, které jsou v sadě dvakrát.
//
// Sada zná dva druhy záznamů: `pad:{nástroj}` (jeden vzorek) a
// `layer:{nástroj}:{síla}:rr{n}` (vrstvy podle síla úderu). Přehrávač
// oba ukládá pod stejný klíč `nástroj:síla:rr` a pad načítá jako
// `med:rr1` — takže pad a vrstva `med:rr1` téhož nástroje si sedí ve
// stejné přihrádce. Když mají navíc stejný obsah, jeden z nich je jen
// stažený a rozkódovaný navíc.
//
// Maže se pad, ne vrstva: vrstva nese sílu úderu i pořadí, pad ne.
// Pad, jehož dvojče leží v jiné přihrádce, zůstává — tam by smazání
// změnilo zvuk.
//
// Použití:
//   bun run scripts/sjednotit-sady.ts --check
//   bun run scripts/sjednotit-sady.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { isR2Configured, deleteObject } = await import('../r2.ts');

const URL = process.env.VITE_SUPABASE_URL;
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KLIC) {
  console.error('Chybí VITE_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const admin = createClient(URL, KLIC, { auth: { persistSession: false } });
const JEN_KONTROLA = process.argv.includes('--check');

const { data: vzorky, error } = await admin
  .from('assets')
  .select('id, name, size_bytes, content_hash, storage_bucket, storage_path, metadata')
  .eq('status', 'active')
  .eq('category', 'drum_kit_sample')
  .not('metadata->>kitId', 'is', null);

if (error) {
  console.error('Nepodařilo se načíst vzorky sad:', error.message);
  process.exit(1);
}

/** Přihrádka, do které vzorek v přehrávači spadne. */
function prihradka(m: any): string | null {
  if (m?.kind === 'pad' && m.padId) return `${m.padId}:med:rr1`;
  if (m?.kind === 'layer' && m.articulation) {
    return `${m.articulation}:${m.tier || 'med'}:rr${m.roundRobin || 1}`;
  }
  return null;
}

const vrstvy = new Map<string, { hash: string | null; name: string }>();
for (const v of vzorky || []) {
  const m: any = v.metadata;
  if (m?.kind !== 'layer') continue;
  const p = prihradka(m);
  if (p) vrstvy.set(`${m.kitId}|${p}`, { hash: v.content_hash, name: v.name });
}

const kZahozeni = (vzorky || []).filter((v) => {
  const m: any = v.metadata;
  if (m?.kind !== 'pad') return false;
  const p = prihradka(m);
  if (!p) return false;
  const vrstva = vrstvy.get(`${m.kitId}|${p}`);
  // Jen když je to opravdu tentýž zvuk. Jinak by se sada změnila.
  return Boolean(vrstva && v.content_hash && vrstva.hash === v.content_hash);
});

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;
const bajtu = kZahozeni.reduce((a, v) => a + Number(v.size_bytes || 0), 0);

console.log(`Vzorků v sadách: ${(vzorky || []).length}`);
console.log(`Zdvojených padů: ${kZahozeni.length} (${mb(bajtu)})`);
for (const v of kZahozeni) {
  console.log(`  ${(v.metadata as any).kitId.slice(0, 8)} ${(v.metadata as any).key} — ${v.name}`);
}

// Pady, které zůstávají, i když stejný soubor v sadě je: jejich dvojče
// sedí v jiné přihrádce, takže smazání by bylo slyšet.
const jinaPrihradka = (vzorky || []).filter((v) => {
  const m: any = v.metadata;
  if (m?.kind !== 'pad') return false;
  if (kZahozeni.some((z) => z.id === v.id)) return false;
  return (vzorky || []).some(
    (x) => (x.metadata as any)?.kitId === m.kitId && x.id !== v.id && x.content_hash === v.content_hash,
  );
});
if (jinaPrihradka.length) {
  console.log(`\nPonechané pady (stejný zvuk, ale jiná přihrádka — smazání by bylo slyšet):`);
  for (const v of jinaPrihradka) console.log(`  ${(v.metadata as any).key} — ${v.name}`);
}

if (JEN_KONTROLA || kZahozeni.length === 0) process.exit(0);

if (!isR2Configured()) {
  console.error('R2 není nastavené — zkontroluj R2_* proměnné v .env');
  process.exit(1);
}

let smazano = 0;
for (const v of kZahozeni) {
  if (v.storage_bucket === 'r2') await deleteObject(v.storage_path);
  else await admin.storage.from(v.storage_bucket).remove([v.storage_path]);
  const { error: chyba } = await admin.from('assets').delete().eq('id', v.id);
  if (chyba) {
    console.warn(`  ✗ ${v.name}: ${chyba.message}`);
    continue;
  }
  smazano++;
}

console.log(`\nSjednoceno: ${smazano} padů smazáno, uvolněno ${mb(bajtu)}.`);
