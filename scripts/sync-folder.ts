// scripts/sync-folder.ts — Phase 12: manual folder → Supabase sync.
//
// Run this by hand whenever you plug in your data drive and want the app
// to pick up new/changed files. Not a background watcher — you decided
// that on purpose (see docs/migration/2026-08-20-phase12-folder-sync-plan.md).
//
// Usage:
//   cd <repo root>
//   bun run scripts/sync-folder.ts /Volumes/YourDrive/NeverLateSync
//   (or: SYNC_FOLDER=/path/to/folder bun run scripts/sync-folder.ts)
//
// Requires SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL in .env (same
// vars server.ts already uses).
//
// Folder layout it expects (see the plan doc for the full write-up):
//
//   <root>/
//     zpevnik/          *.txt / *.chordpro / *.cho / *.crd  -> Zpěvník (songs)
//     noty-tabs/        *.pdf                                -> Moje knihovna (PDF)
//                        *.gp / *.gp3 / *.gp4 / *.gp5 / *.gpx -> Moje knihovna (Guitar Pro)
//     nahravky/         *.wav / *.mp3 / *.flac / *.m4a / *.ogg -> Moje knihovna (Nahrávky)
//     fotky/            *.jpg / *.jpeg / *.png / *.webp / *.gif -> Fotky Kapely
//     bici-sady/
//       <Název sady>/   *.wav / *.mp3 / *.flac / *.m4a / *.ogg -> Custom Drum Kit samples
//                        `kick.wav`              -> legacy pad sample, padId = "kick"
//                        `snare_hard_rr1.wav`     -> multi-layer: articulation "snare", tier "hard", RR 1
//
// Idempotent & update-aware: every row/asset this script creates carries a
// `legacy_id` (or `metadata->>'legacy_id'` for assets) built from the file's
// path relative to <root>, plus a content hash. Unchanged files are
// skipped; a changed file updates the same row instead of duplicating it;
// a file removed from disk is left alone (this script never deletes).

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('BLOCKED BY EXTERNAL CONFIGURATION: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ROOT = path.resolve(process.argv[2] || process.env.SYNC_FOLDER || './NeverLateSync');
const CHECK_ONLY = process.argv.includes('--check') || process.argv.includes('--dry-run');

if (!fs.existsSync(ROOT)) {
  console.error(`BLOCKED: sync folder does not exist: ${ROOT}`);
  console.error('Pass the folder path as an argument, or set SYNC_FOLDER in .env.');
  process.exit(1);
}

interface Report {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function freshReport(): Report {
  return { added: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
}

function printReport(label: string, r: Report) {
  console.log(`\n${label}: +${r.added} added, ~${r.updated} updated, =${r.skipped} unchanged, !${r.failed} failed`);
  for (const e of r.errors) console.log(`  ! ${e}`);
}

// --- filesystem helpers ---

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // skip dotfiles (.DS_Store etc.)
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function relKey(filePath: string): string {
  return `sync:${path.relative(ROOT, filePath).split(path.sep).join('/')}`;
}

const MIME_BY_EXT: Record<string, string> = {
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.gp': 'application/octet-stream', '.gp3': 'application/octet-stream', '.gp4': 'application/octet-stream',
  '.gp5': 'application/octet-stream', '.gpx': 'application/octet-stream',
  '.mid': 'audio/midi', '.midi': 'audio/midi',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

function mimeFor(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// --- 1. zpevnik/ -> songs ---

const SONG_EXTS = new Set(['.txt', '.chordpro', '.cho', '.crd']);

function parseTitleArtist(fileStem: string): { title: string; artist: string } {
  const parts = fileStem.split(' - ');
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { title: fileStem.trim(), artist: 'Neznámý interpret' };
}

/** Porovnání názvů odolné vůči diakritice, číslování a interpunkci. */
function normTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\d+[.\s-]*/, '') // odřízne „03. " na začátku
    .replace(/[^a-z0-9]/g, '');
}

async function syncSongbook(report: Report) {
  const dir = path.join(ROOT, 'zpevnik');
  const files = walk(dir).filter((f) => SONG_EXTS.has(path.extname(f).toLowerCase()));

  for (const file of files) {
    const legacyId = relKey(file);
    const content = fs.readFileSync(file, 'utf-8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const { title, artist } = parseTitleArtist(path.basename(file, path.extname(file)));

    try {
      let { data: existing } = await admin.from('songs').select('id, metadata').eq('legacy_id', legacyId).maybeSingle();

      // Skladba už ve zpěvníku být může — jen se do ní dostala jinudy (import
      // tabů, ruční zadání), takže nese jiné `legacy_id`. Bez tohohle kroku by
      // se text uložil do nové skladby a v knihovně by vznikl duplikát, který
      // má text bez tabu vedle tabu bez textu.
      if (!existing) {
        const { data: kandidati } = await admin
          .from('songs')
          .select('id, title, metadata')
          .eq('status', 'active');
        const shoda = (kandidati || []).find((s) => normTitle(s.title) === normTitle(title));
        if (shoda) {
          existing = shoda;
          await admin.from('songs').update({ legacy_id: legacyId }).eq('id', shoda.id);
        }
      }

      if (existing && existing.metadata?.sourceHash === hash) {
        report.skipped++;
        continue;
      }

      const metadata = { ...(existing?.metadata || {}), content, sourceHash: hash };

      if (existing) {
        // Název a interpret se přepisují jen u skladeb, které z téhle složky
        // vznikly. U skladby spárované podle názvu by filename mohl být horší
        // než to, co už v appce je („1. RefuseResist" vs „Refuse Resist").
        const { error } = await admin.from('songs').update({ metadata }).eq('id', existing.id);
        if (error) throw new Error(error.message);
        report.updated++;
      } else {
        const { error } = await admin.from('songs').insert({
          id: crypto.randomUUID(),
          legacy_id: legacyId,
          title,
          artist,
          owner_id: null,
          status: 'active',
          source_type: 'upload',
          metadata,
        });
        if (error) throw new Error(error.message);
        report.added++;
      }
    } catch (e: any) {
      report.failed++;
      report.errors.push(`${path.relative(ROOT, file)}: ${e.message}`);
    }
  }
}

// --- 2/3. noty-tabs/ + nahravky/ -> Moje knihovna assets ---

interface AssetSpec {
  dir: string;
  exts: Set<string>;
  category: string;
  assetType: string;
  bucket: 'audio' | 'assets';
}

const LIBRARY_SPECS: AssetSpec[] = [
  { dir: 'noty-tabs', exts: new Set(['.pdf']), category: 'pdf', assetType: 'pdf', bucket: 'assets' },
  { dir: 'noty-tabs', exts: new Set(['.gp', '.gp3', '.gp4', '.gp5', '.gpx']), category: 'guitar_pro', assetType: 'guitar_pro', bucket: 'assets' },
  { dir: 'noty-tabs', exts: new Set(['.mid', '.midi']), category: 'midi', assetType: 'midi', bucket: 'assets' },
  { dir: 'nahravky', exts: new Set(['.wav', '.mp3', '.flac', '.m4a', '.ogg']), category: 'recordings', assetType: 'recording', bucket: 'audio' },
];

async function syncLibraryAssets(report: Report) {
  for (const spec of LIBRARY_SPECS) {
    const dir = path.join(ROOT, spec.dir);
    const files = walk(dir).filter((f) => spec.exts.has(path.extname(f).toLowerCase()));

    for (const file of files) {
      const legacyId = relKey(file);
      const hash = hashFile(file);
      const name = path.basename(file);

      try {
        const { data: existing } = await admin.from('assets').select('id, storage_path, metadata').eq('metadata->>legacy_id', legacyId).maybeSingle();

        if (existing && existing.metadata?.sourceHash === hash) {
          report.skipped++;
          continue;
        }

        const storagePath = existing?.storage_path || `global/${spec.category}/${crypto.randomUUID()}-${name}`;
        const bytes = fs.readFileSync(file);
        const { error: uploadError } = await admin.storage.from(spec.bucket).upload(storagePath, bytes, {
          contentType: mimeFor(file),
          upsert: true,
        });
        if (uploadError) throw new Error(uploadError.message);

        const metadata = { legacy_id: legacyId, sourceHash: hash };

        if (existing) {
          const { error } = await admin.from('assets').update({ name, size_bytes: bytes.length, metadata }).eq('id', existing.id);
          if (error) throw new Error(error.message);
          report.updated++;
        } else {
          const { error } = await admin.from('assets').insert({
            id: crypto.randomUUID(),
            owner_id: null,
            name,
            original_filename: name,
            mime_type: mimeFor(file),
            size_bytes: bytes.length,
            storage_bucket: spec.bucket,
            storage_path: storagePath,
            asset_type: spec.assetType,
            category: spec.category,
            status: 'active',
            metadata,
          });
          if (error) throw new Error(error.message);
          report.added++;
        }
      } catch (e: any) {
        report.failed++;
        report.errors.push(`${path.relative(ROOT, file)}: ${e.message}`);
      }
    }
  }
}

// --- 4. fotky/ -> band_photos assets ---

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

async function syncPhotos(report: Report) {
  const dir = path.join(ROOT, 'fotky');
  const files = walk(dir).filter((f) => PHOTO_EXTS.has(path.extname(f).toLowerCase()));

  for (const file of files) {
    const legacyId = relKey(file);
    const hash = hashFile(file);
    const name = path.basename(file);

    try {
      const { data: existing } = await admin.from('assets').select('id, storage_path, metadata').eq('metadata->>legacy_id', legacyId).maybeSingle();

      if (existing && existing.metadata?.sourceHash === hash) {
        report.skipped++;
        continue;
      }

      const storagePath = existing?.storage_path || `global/band_photos/${crypto.randomUUID()}-${name}`;
      const bytes = fs.readFileSync(file);
      const { error: uploadError } = await admin.storage.from('assets').upload(storagePath, bytes, {
        contentType: mimeFor(file),
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);

      const metadata = { ...(existing?.metadata || {}), legacy_id: legacyId, sourceHash: hash, authorName: 'Synchronizace z disku', notes: '', tags: [], photoType: 'upload' };

      if (existing) {
        const { error } = await admin.from('assets').update({ name, size_bytes: bytes.length, metadata }).eq('id', existing.id);
        if (error) throw new Error(error.message);
        report.updated++;
      } else {
        const { error } = await admin.from('assets').insert({
          id: crypto.randomUUID(),
          owner_id: null,
          name,
          original_filename: name,
          mime_type: mimeFor(file),
          size_bytes: bytes.length,
          storage_bucket: 'assets',
          storage_path: storagePath,
          asset_type: 'image',
          category: 'band_photos',
          status: 'active',
          metadata,
        });
        if (error) throw new Error(error.message);
        report.added++;
      }
    } catch (e: any) {
      report.failed++;
      report.errors.push(`${path.relative(ROOT, file)}: ${e.message}`);
    }
  }
}

// --- 5. bici-sady/<kit>/ -> drum_kits + drum_kit_sample assets ---

const KIT_SAMPLE_EXTS = new Set(['.wav', '.mp3', '.flac', '.m4a', '.ogg']);
const TIERS = new Set(['soft', 'med_soft', 'med', 'hard', 'very_hard']);

// "snare_hard_rr1" -> layer; "kick" -> legacy pad
function parseSampleFilename(stem: string): { kind: 'pad'; padId: string } | { kind: 'layer'; articulation: string; tier: string; roundRobin: number } {
  const match = stem.match(/^(.+)_(soft|med_soft|med|hard|very_hard)_rr(\d+)$/i);
  if (match && TIERS.has(match[2].toLowerCase())) {
    return { kind: 'layer', articulation: match[1], tier: match[2].toLowerCase(), roundRobin: parseInt(match[3], 10) };
  }
  return { kind: 'pad', padId: stem };
}

async function syncDrumKits(report: Report) {
  const dir = path.join(ROOT, 'bici-sady');
  if (!fs.existsSync(dir)) return;

  for (const kitFolder of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!kitFolder.isDirectory() || kitFolder.name.startsWith('.')) continue;
    const kitName = kitFolder.name;
    const kitDir = path.join(dir, kitName);
    const kitLegacyId = `sync:drumkit:${kitName}`;

    try {
      const { data: existingKit } = await admin.from('drum_kits').select('id').eq('legacy_id', kitLegacyId).maybeSingle();
      let kitId = existingKit?.id;
      if (!kitId) {
        kitId = crypto.randomUUID();
        const { error } = await admin.from('drum_kits').insert({
          id: kitId,
          legacy_id: kitLegacyId,
          owner_id: null,
          name: kitName,
          cz_name: kitName,
          icon: '🥁',
          genre: 'Custom',
          description: `Nahráno ze složky bici-sady/${kitName}.`,
        });
        if (error) throw new Error(error.message);
      }

      const files = walk(kitDir).filter((f) => KIT_SAMPLE_EXTS.has(path.extname(f).toLowerCase()));
      for (const file of files) {
        const legacyId = relKey(file);
        const hash = hashFile(file);
        const stem = path.basename(file, path.extname(file));
        const parsed = parseSampleFilename(stem);

        const { data: existing } = await admin.from('assets').select('id, storage_path, metadata').eq('metadata->>legacy_id', legacyId).maybeSingle();
        if (existing && existing.metadata?.sourceHash === hash) {
          report.skipped++;
          continue;
        }

        const storagePath = existing?.storage_path || `global/drum_kit_samples/${kitId}/${crypto.randomUUID()}-${stem}${path.extname(file)}`;
        const bytes = fs.readFileSync(file);
        const { error: uploadError } = await admin.storage.from('assets').upload(storagePath, bytes, {
          contentType: mimeFor(file),
          upsert: true,
        });
        if (uploadError) throw new Error(uploadError.message);

        const sampleKey = parsed.kind === 'pad' ? `pad:${parsed.padId}` : `layer:${parsed.articulation}:${parsed.tier}:rr${parsed.roundRobin}`;
        const metadata: Record<string, unknown> = {
          legacy_id: legacyId,
          sourceHash: hash,
          kitId,
          key: sampleKey,
          kind: parsed.kind,
          name: path.basename(file),
          uploadedAt: Date.now(),
          ...(parsed.kind === 'pad' ? { padId: parsed.padId } : { articulation: parsed.articulation, tier: parsed.tier, roundRobin: parsed.roundRobin }),
        };

        if (existing) {
          const { error } = await admin.from('assets').update({ size_bytes: bytes.length, metadata }).eq('id', existing.id);
          if (error) throw new Error(error.message);
          report.updated++;
        } else {
          const { error } = await admin.from('assets').insert({
            id: crypto.randomUUID(),
            owner_id: null,
            name: path.basename(file),
            original_filename: path.basename(file),
            mime_type: mimeFor(file),
            size_bytes: bytes.length,
            storage_bucket: 'assets',
            storage_path: storagePath,
            asset_type: 'sample',
            category: 'drum_kit_sample',
            status: 'active',
            metadata,
          });
          if (error) throw new Error(error.message);
          report.added++;
        }
      }
    } catch (e: any) {
      report.failed++;
      report.errors.push(`bici-sady/${kitName}: ${e.message}`);
    }
  }
}

// --- kontrola bez zápisu (--check) ---

/**
 * Projde složku a řekne, co by se nahrálo a co by se tiše přeskočilo,
 * aniž by se čehokoli dotkl. Slouží k tomu, aby se dala struktura na disku
 * srovnat dřív, než se pustí ostrý běh na gigabajtech dat.
 */
function checkFolder() {
  const FREE_TIER_BYTES = 1024 ** 3; // Supabase Free: 1 GB Storage
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  const size = (f: string) => fs.statSync(f).size;
  const sum = (files: string[]) => files.reduce((a, f) => a + size(f), 0);

  console.log(`Kontroluji: ${ROOT}`);
  console.log('*** KONTROLA — nic se nezapisuje ***\n');

  let nahraje = 0;
  const problemy: string[] = [];

  // zpevnik/
  const zpevnikVse = walk(path.join(ROOT, 'zpevnik'));
  const zpevnikOk = zpevnikVse.filter((f) => SONG_EXTS.has(path.extname(f).toLowerCase()));
  const zpevnikNe = zpevnikVse.filter((f) => !SONG_EXTS.has(path.extname(f).toLowerCase()));
  nahraje += sum(zpevnikOk);
  console.log(`zpevnik/        ${zpevnikOk.length} skladeb (${mb(sum(zpevnikOk))}), ${zpevnikNe.length} ignorováno`);
  for (const f of zpevnikOk.slice(0, 5)) {
    const { title, artist } = parseTitleArtist(path.basename(f, path.extname(f)));
    console.log(`                  „${title}" — ${artist}`);
  }
  if (zpevnikNe.length) {
    const exts = [...new Set(zpevnikNe.map((f) => path.extname(f).toLowerCase() || '(bez přípony)'))];
    problemy.push(
      `zpevnik/: ${zpevnikNe.length} souborů se nenahraje (${exts.join(', ')}). ` +
        `Přijímají se jen ${[...SONG_EXTS].join(', ')}.`
    );
  }

  // noty-tabs/ + nahravky/
  for (const dir of ['noty-tabs', 'nahravky']) {
    const vse = walk(path.join(ROOT, dir));
    const specs = LIBRARY_SPECS.filter((s) => s.dir === dir);
    const podporovane = new Set(specs.flatMap((s) => [...s.exts]));
    const ok = vse.filter((f) => podporovane.has(path.extname(f).toLowerCase()));
    const ne = vse.filter((f) => !podporovane.has(path.extname(f).toLowerCase()));
    nahraje += sum(ok);
    console.log(`${dir.padEnd(15)} ${ok.length} souborů (${mb(sum(ok))}), ${ne.length} ignorováno`);
    if (ne.length) {
      const exts = [...new Set(ne.map((f) => path.extname(f).toLowerCase() || '(bez přípony)'))];
      problemy.push(
        `${dir}/: ${ne.length} souborů se nenahraje (${exts.join(', ')}). ` +
          `Přijímají se jen ${[...podporovane].join(', ')}.`
      );
    }
  }

  // fotky/
  const fotkyVse = walk(path.join(ROOT, 'fotky'));
  const fotkyOk = fotkyVse.filter((f) => PHOTO_EXTS.has(path.extname(f).toLowerCase()));
  nahraje += sum(fotkyOk);
  console.log(`fotky/          ${fotkyOk.length} fotek (${mb(sum(fotkyOk))}), ${fotkyVse.length - fotkyOk.length} ignorováno`);

  // bici-sady/
  const kitDir = path.join(ROOT, 'bici-sady');
  if (fs.existsSync(kitDir)) {
    for (const kit of fs.readdirSync(kitDir, { withFileTypes: true })) {
      if (!kit.isDirectory() || kit.name.startsWith('.')) continue;
      const vzorky = walk(path.join(kitDir, kit.name)).filter((f) =>
        KIT_SAMPLE_EXTS.has(path.extname(f).toLowerCase())
      );
      const vrstvy = vzorky.filter(
        (f) => parseSampleFilename(path.basename(f, path.extname(f))).kind === 'layer'
      );
      nahraje += sum(vzorky);
      console.log(
        `bici-sady/${kit.name}: ${vzorky.length} vzorků (${mb(sum(vzorky))}), ` +
          `z toho ${vrstvy.length} s vrstvenými názvy`
      );
      if (vzorky.length && vrstvy.length === 0) {
        const ukazka = path.basename(vzorky[0]);
        problemy.push(
          `bici-sady/${kit.name}: žádný vzorek nemá tvar nastroj_dynamika_rrN.wav ` +
            `(např. „${ukazka}"). Nahrají se jako samostatné pady, které appka nepřiřadí ` +
            `k žádnému bubnu — sada zůstane nehratelná.`
        );
      }
    }
  }

  console.log(`\nCelkem by se nahrálo: ${mb(nahraje)}`);
  if (nahraje > FREE_TIER_BYTES) {
    problemy.push(
      `Objem dat (${mb(nahraje)}) přesahuje 1 GB, které má Supabase ve Free tarifu. ` +
        `Ostrý běh by v půlce začal selhávat — je potřeba vybrat, co se nahraje, nebo přejít na placený tarif.`
    );
  }

  if (problemy.length) {
    console.log(`\nProblémy (${problemy.length}):`);
    for (const p of problemy) console.log(`\n  • ${p}`);
  } else {
    console.log('\nŽádné problémy — složka je připravená k nahrání.');
  }
}

async function main() {
  if (CHECK_ONLY) {
    checkFolder();
    return;
  }

  console.log(`Synchronizuji z: ${ROOT}\n`);

  const songReport = freshReport();
  await syncSongbook(songReport);
  printReport('Zpěvník (zpevnik/)', songReport);

  const libraryReport = freshReport();
  await syncLibraryAssets(libraryReport);
  printReport('Moje knihovna (noty-tabs/, nahravky/)', libraryReport);

  const photoReport = freshReport();
  await syncPhotos(photoReport);
  printReport('Fotky Kapely (fotky/)', photoReport);

  const drumReport = freshReport();
  await syncDrumKits(drumReport);
  printReport('Bicí sady (bici-sady/)', drumReport);

  const totalFailed = songReport.failed + libraryReport.failed + photoReport.failed + drumReport.failed;
  console.log(totalFailed > 0 ? `\nHotovo s ${totalFailed} chybami — viz výpis výše.` : '\nHotovo, beze chyb.');
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Neočekávaná chyba:', e);
  process.exit(1);
});
