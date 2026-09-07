// scripts/diag-subcat.ts — Diagnostic for NULL subcategories in assets table.
//
// Shows the current state of subcategory assignments and what a
// safe backfill would change — no writes, read-only.
//
// Usage:
//   cd <repo root>
//   bun run scripts/diag-subcat.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('BLOCKED_BY_EXTERNAL_CONFIGURATION: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Simple inferencer, mirrors the production navrhniPodkategorii() logic.
function navrhniPodkategorii(kategorie: string, nazev: string): string | null {
  const n = nazev.toLowerCase();

  const map: Record<string, { pattern: string | RegExp; hodnota: string }[]> = {
    drum_kit_sample: [
      { pattern: /\bkick\b/, hodnota: 'kick' },
      { pattern: /\bsnare\b/, hodnota: 'snare' },
      { pattern: /\bhihat\b|\bhat\b/, hodnota: 'hihat' },
      { pattern: /\btom\b/, hodnota: 'tom' },
      { pattern: /\bcrash\b/, hodnota: 'crash' },
      { pattern: /\bride\b/, hodnota: 'ride' },
      { pattern: /\bperc\b/, hodnota: 'perkuse' },
    ],
    drum_loop: [
      { pattern: /\brick\b/i, hodnota: 'rock' },
      { pattern: /\bmetal\b/i, hodnota: 'metal' },
      { pattern: /\bfunk\b/i, hodnota: 'funk' },
      { pattern: /\bpop\b/i, hodnota: 'pop' },
      { pattern: /\bjazz\b/i, hodnota: 'jazz' },
      { pattern: /\blatin\b/i, hodnota: 'latin' },
      { pattern: /\bfill\b/i, hodnota: 'fill' },
    ],
    bass_sample: [
      { pattern: /\briff\b/i, hodnota: 'riffy' },
      { pattern: /\bjednotlivy|single\b/i, hodnota: 'jednotlivé tóny' },
      { pattern: /\bsmyck|loop\b/i, hodnota: 'smyčky' },
    ],
    guitar_sample: [
      { pattern: /\briff\b/i, hodnota: 'riffy' },
      { pattern: /\bakord\b/i, hodnota: 'akordy' },
      { pattern: /\bsolo\b/i, hodnota: 'sóla' },
      { pattern: /\bsmyck|loop\b/i, hodnota: 'smyčky' },
    ],
    vocal_sample: [
      { pattern: /\bsbor|choir\b/i, hodnota: 'sbory' },
      { pattern: /\bad.lib|adlib\b/i, hodnota: 'ad-lib' },
      { pattern: /\bfraz|phrase\b/i, hodnota: 'fráze' },
    ],
    stem_mix: [
      { pattern: /\bzpev|vocal\b/i, hodnota: 'zpěv' },
      { pattern: /\bkytar|guitar\b/i, hodnota: 'kytara' },
      { pattern: /\bbas|bass\b/i, hodnota: 'basa' },
      { pattern: /\bbic|drum\b/i, hodnota: 'bicí' },
    ],
    recordings: [
      { pattern: /\bzkouse|rehearsal\b/i, hodnota: 'zkoušky' },
      { pattern: /\bkonc|concert\b/i, hodnota: 'koncerty' },
      { pattern: /\bdem\b/i, hodnota: 'dema' },
    ],
    images: [
      { pattern: /\bkapel|band\b/i, hodnota: 'kapely' },
      { pattern: /\binterpret|artist\b/i, hodnota: 'interpreti' },
      { pattern: /\bteorie|theory\b/i, hodnota: 'teorie' },
      { pattern: /\bnastroj|instrument\b/i, hodnota: 'nástroje' },
      { pattern: /\baparatura|rig\b/i, hodnota: 'aparatura' },
      { pattern: /\bplakat|poster\b/i, hodnota: 'plakáty' },
    ],
    pdf: [
      { pattern: /\bakord\b/i, hodnota: 'akordy' },
      { pattern: /\btabulat|tab\b/i, hodnota: 'tabulatury' },
      { pattern: /\bnot\b/i, hodnota: 'noty' },
      { pattern: /\bteorie\b/i, hodnota: 'teorie' },
      { pattern: /\bkniha|book\b/i, hodnota: 'knihy' },
      { pattern: /\btext\s*pisne|lyric\b/i, hodnota: 'texty písní' },
      { pattern: /\bmanual\b/i, hodnota: 'manuály' },
    ],
  };

  const list = map[kategorie];
  if (!list) return null;
  for (const { pattern, hodnota } of list) {
    const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    if (re.test(n)) return hodnota;
  }
  return null;
}

async function main() {
  console.log('=== Diagnostika podkategorií: NULL záznamy ===\n');

  // 1. Celkový počet
  const { count: total } = await admin.from('assets').select('*', { count: 'exact', head: true });
  console.log(`Celkem záznamů: ${total}`);

  // 2. NULL subcategory count
  const { count: nullCount } = await admin.from('assets').select('*', { count: 'exact', head: true }).is('subcategory', null);
  console.log(`NULL subcategory: ${nullCount}`);

  // 3. Non-null subcategory count
  const { count: nonNullCount } = await admin.from('assets').select('*', { count: 'exact', head: true }).not('subcategory', 'is', null);
  console.log(`Already set subcategory: ${nonNullCount}`);

  // 4. Breakdown by category where subcategory IS NULL
  const { data: nullByCat } = await admin
    .from('assets')
    .select('category')
    .is('subcategory', null);

  const catCounts: Record<string, number> = {};
  for (const row of nullByCat || []) {
    const cat = row.category || 'unknown';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }
  console.log('\nNULL subcategory by category:');
  for (const [cat, cnt] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${cnt}`);
  }

  // 5. Sample filenames for each category (to show what inference would do)
  console.log('\nVzorové soubory (kategorie → navrhovaná podkategorie):');
  for (const cat of Object.keys(catCounts)) {
    const { data: sample } = await admin
      .from('assets')
      .select('name')
      .eq('category', cat)
      .is('subcategory', null)
      .limit(5);
    console.log(`\n  [${cat}] (${catCounts[cat]} souborů):`);
    for (const s of sample || []) {
      const navrh = navrhniPodkategorii(cat, s.name);
      console.log(`    "${s.name}" → ${navrh || '(zůstane NULL)'}`);
    }
  }

  // 6. How many would be changed by backfill
  let wouldChange = 0;
  let wouldStayNull = 0;
  for (const cat of Object.keys(catCounts)) {
    const { data: rows } = await admin
      .from('assets')
      .select('name')
      .eq('category', cat)
      .is('subcategory', null);
    for (const r of rows || []) {
      if (navrhniPodkategorii(cat, r.name)) wouldChange++;
      else wouldStayNull++;
    }
  }

  console.log(`\n=== Backfill simulace ===`);
  console.log(`Bylo by změněno: ${wouldChange}`);
  console.log(`Zůstalo by NULL: ${wouldStayNull} (soubor neodpovídá žádné známé názvové konvenci)`);
  console.log(`\nIdempotentní: ano — záznamy s nastavenou podkategorií se netkne.`);
}

main().catch((e) => {
  console.error('Chyba:', e?.message || e);
  process.exit(1);
});
