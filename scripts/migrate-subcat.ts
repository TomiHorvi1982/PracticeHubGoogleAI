// scripts/migrate-subcat.ts — Backfill subcategory for files with NULL subcategory.
//
// Idempotent: safe to run multiple times. Updates ONLY rows where:
//   - subcategory IS NULL
//   - navrhniPodkategorii(name) returns a non-null result
//
// This script uses the same inference logic as LibrarySection.tsx to ensure
// consistency between new uploads and existing data.
//
// Usage:
//   cd <repo root>
//   bun run scripts/migrate-subcat.ts
//
// Requires SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL in .env

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

/**
 * Návrh podkategorie z názvu souboru.
 * Odpovídá logice z LibrarySection.tsx a knihovnaStrom.ts.
 * Vrací null, pokud žádná podkategorie nesedí.
 */
function navrhniPodkategorii(kategorie: string, nazev: string): string | null {
  const n = nazev.toLowerCase();

  // Řezání velkých písmen a nevyučovaných značek
  const cleanName = n.replace(/[-\._]/g, ' ').replace(/\bvs\.?\b/g, ' vs ');

  const patterns: Record<string, Array<{ pattern: RegExp | string; value: string }>> = {
    drum_kit_sample: [
      { pattern: /\bkick\b/, value: 'kick' },
      { pattern: /\bsnare\b/, value: 'snare' },
      { pattern: /\bhihat\b|\bhat\b/, value: 'hihat' },
      { pattern: /\btom\b/, value: 'tom' },
      { pattern: /\bcrash\b/, value: 'crash' },
      { pattern: /\bride\b/, value: 'ride' },
      { pattern: /\bperc\b/, value: 'perkuse' },
    ],
    drum_loop: [
      { pattern: /\ brick \b|rock\b/, value: 'rock' },
      { pattern: /\bmusic\b.*metal/i, value: 'metal' },
      { pattern: /\bfunk\b/i, value: 'funk' },
      { pattern: /\bpop\b/i, value: 'pop' },
      { pattern: /\bjazz\b/i, value: 'jazz' },
      { pattern: /\blatin\b/i, value: 'latin' },
      { pattern: /\bfill\b/i, value: 'fill' },
    ],
    bass_sample: [
      { pattern: /\briff\b/i, value: 'riffy' },
      { pattern: /\bjednotlivy|single\b/i, value: 'jednotlivé tóny' },
      { pattern: /\bsmyck|loop\b/i, value: 'smyčky' },
    ],
    guitar_sample: [
      { pattern: /\briff\b/i, value: 'riffy' },
      { pattern: /\bakord\b/i, value: 'akordy' },
      { pattern: /\bsolo\b/i, value: 'sóla' },
      { pattern: /\bsmyck|loop\b/i, value: 'smyčky' },
    ],
    vocal_sample: [
      { pattern: /\bsbor|choir\b/i, value: 'sbory' },
      { pattern: /\bad.lib|adlib\b/i, value: 'ad-lib' },
      { pattern: /\bfraz|phrase\b/i, value: 'fráze' },
    ],
    stem_mix: [
      { pattern: /\bzpěv|vocals?\b/i, value: 'zpěv' },
      { pattern: /\b(kyta?ra|guitar|lead)\b/i, value: 'kytara' },
      { pattern: /\bbas|bass\b/i, value: 'basa' },
      { pattern: /\b(drums?|bicí)\b/i, value: 'bicí' },
      { pattern: /\botalní\b|other|riff/i, value: 'ostatní' },
    ],
    recordings: [
      { pattern: /\bzkoušky|rehearsal\b/i, value: 'zkoušky' },
      { pattern: /\bkonc|concert\b/i, value: 'koncerty' },
      { pattern: /\bdema\b/i, value: 'dema' },
    ],
    images: [
      { pattern: /\bkapel|band\b/i, value: 'kapely' },
      { pattern: /\binterpret|artist\b/i, value: 'interpreti' },
      { pattern: /\bteorie|theory\b/i, value: 'teorie' },
      { pattern: /\bnastroj|instrument\b/i, value: 'nástroje' },
      { pattern: /\baparatura|rig\b/i, value: 'aparatura' },
      { pattern: /\bplakat|poster\b/i, value: 'plakáty' },
    ],
    pdf: [
      { pattern: /\btab\b/, value: 'tabulatury' },
      { pattern: /\bakordy\b/, value: 'akordy' },
      { pattern: /\bnoty\b/, value: 'noty' },
      { pattern: /\bteorie\b/, value: 'teorie' },
      { pattern: /\bkniha|book\b/, value: 'knihy' },
      { pattern: /\btext\s*pisne|lyric\b/i, value: 'texty písní' },
      { pattern: /\bmanual\b/i, value: 'manuály' },
      { pattern: /\bharmony\b/, value: 'teorie' },
      { pattern: /\bplayitfuckingproperly\b/, value: 'manuály' },
    ],
    midi: [
      { pattern: /\bklavírní|piano\b/i, value: 'klavírní' },
      { pattern: /\bbicí|drums?\b/i, value: 'bicí' },
      { pattern: /\b(cz)|cmajor|dflat|eminor|dminor|amajor|chopin|bach|beethoven/i, value: 'klavírní' },
    ],
    my_songs: [
      { pattern: /\brecording|dema|nahrávka\b/i, value: 'nahrávky kapely' },
    ],
    soundfont: [], // No subcategories
  };

  const list = patterns[kategorie];
  if (!list) return null;

  for (const { pattern, value } of list) {
    if (typeof pattern === 'string') {
      if (cleanName.includes(pattern)) return value;
    } else if (pattern.test(cleanName)) {
      return value;
    }
  }
  return null;
}

interface MigrationReport {
  scanned: number;
  updated: number;
  skipped: number;
  byCategory: Record<string, { scanned: number; updated: number }>;
  errors: string[];
}

function freshReport(): MigrationReport {
  return { scanned: 0, updated: 0, skipped: 0, byCategory: {}, errors: [] };
}

async function main() {
  console.log('=== Subcategory migration (IDempotentní backfill) ===\n');

  const report = freshReport();

  // Get all categories that exist in the database (with pagination)
  const uniqueCats: Set<string> = new Set();
  let catOffset = 0;
  const catBatchSize = 1000;

  while (true) {
    const { data: catRows, error: catErr } = await admin
      .from('assets')
      .select('category')
      .range(catOffset, catOffset + catBatchSize - 1);
    if (catErr) {
      console.error('Error fetching categories:', catErr.message);
      process.exit(1);
    }
    if (!catRows || catRows.length === 0) break;
    for (const r of catRows) {
      if (r.category) uniqueCats.add(r.category);
    }
    if (catRows.length < catBatchSize) break;
    catOffset += catBatchSize;
  }

  const catList = [...uniqueCats];

  console.log(`Nalezeno ${catList.length} kategorií: ${catList.join(', ')}\n`);

  // Process each category
  for (const cat of uniqueCats) {
    console.log(`Zpracovávám kategorii: ${cat}`);
    report.byCategory[cat] = { scanned: 0, updated: 0 };

    let offset = 0;
    const batchSize = 500;

    while (true) {
      const { data: rows, error } = await admin
        .from('assets')
        .select('id, name, original_filename, subcategory')
        .eq('category', cat)
        .is('subcategory', null)
        .range(offset, offset + batchSize - 1);

      if (error) {
        report.errors.push(`Error fetching ${cat} at offset ${offset}: ${error.message}`);
        break;
      }

      if (!rows || rows.length === 0) break;

      // Batch updates
      const updates: { id: string; subcategory: string }[] = [];
      for (const row of rows) {
        report.byCategory[cat].scanned++;
        report.scanned++;

        const name = row.name || row.original_filename || '';
        const inferred = navrhniPodkategorii(cat, name);

        if (inferred) {
          updates.push({ id: row.id, subcategory: inferred });
          report.byCategory[cat].updated++;
          report.updated++;
        } else {
          report.skipped++;
        }
      }

      // Apply updates in batches
      for (const upd of updates) {
        const { error: updErr } = await admin
          .from('assets')
          .update({ subcategory: upd.subcategory })
          .eq('id', upd.id)
          .is('subcategory', null);

        if (updErr) {
          report.errors.push(`Error updating ${upd.id}: ${updErr.message}`);
        }
      }

      if (rows.length < batchSize) break;
      offset += batchSize;
    }

    console.log(`  → ${report.byCategory[cat].scanned} souborů s NULL, ${report.byCategory[cat].updated} aktualizováno`);
  }

  // Summary
  console.log('\n=== Migration report ===');
  console.log(`Celkem skenováno: ${report.scanned}`);
  console.log(`Aktualizováno: ${report.updated}`);
  console.log(`Přeskořeno (žádná inference): ${report.skipped}`);
  console.log('\nRozdělení podle kategorie:');
  for (const [cat, stats] of Object.entries(report.byCategory)) {
    if (stats.updated > 0) {
      console.log(`  ${cat}: ${stats.updated}/${stats.scanned}`);
    }
  }

  if (report.errors.length > 0) {
    console.log('\nChyby:');
    report.errors.slice(0, 10).forEach((e) => console.log(`  - ${e}`));
    if (report.errors.length > 10) console.log(`  ... a ${report.errors.length - 10} dalších`);
  }

  process.exit(report.errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Migration halted:', e?.message || e);
  process.exit(1);
});