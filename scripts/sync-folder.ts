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
//     zpevnik/          *.txt *.chordpro *.cho *.crd   -> Zpěvník (songs)
//     noty/             *.pdf                          -> okno Books
//     tabulatury/       *.gp *.gp3 *.gp4 *.gp5 *.gpx   -> okno Tabulatura
//     midi/             *.mid *.midi                   -> okno MIDI
//     samply/bici/      *.wav *.mp3                    -> Samples > Bicí
//     samply/basa/                                     -> Samples > Basa
//     samply/kytara/                                   -> Samples > Kytara
//     samply/vokaly/                                   -> Samples > Vokály
//     smycky/           *.wav *.mp3                    -> Samples > celé smyčky
//     stopy/            *.wav *.mp3                    -> Mixážní pult
//     nahravky/         *.wav *.mp3 *.flac *.m4a *.ogg -> Nahrávky ze zkoušek
//     fotky/            *.jpg *.jpeg *.png *.webp *.gif -> obrázky u písní
//
// Pojmenování samplů rozhoduje o řazení: tempo, tóninu a takt appka čte
// z názvu souboru, protože je tam mají všechny sample packy.
//   funky-groove_120bpm_Am_4-4.wav
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

const { isR2Configured, uploadObject, objectSize } = await import('../r2.ts');

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

/**
 * `--only zpevnik,fotky` omezí běh na vyjmenované sekce. Bez něj běží
 * všechny. Užitečné, když se má nahrát jen část složky — třeba proto, že
 * `nahravky/` a `bici-sady/` se do volného tarifu nevejdou.
 */
const onlyIdx = process.argv.indexOf('--only');
const ONLY: Set<string> | null =
  onlyIdx > -1 && process.argv[onlyIdx + 1]
    ? new Set(process.argv[onlyIdx + 1].split(',').map((s) => s.trim()).filter(Boolean))
    : null;

/**
 * `--force` přepočítá i soubory, které se od minule nezměnily. Obsah na
 * disku je stejný, ale skript z něj může odvodit něco jiného — po opravě
 * chyby v parsování názvů je tohle jediná cesta, jak srovnat, co už je
 * nahrané, bez ručního mazání.
 */
const FORCE = process.argv.includes('--force');

/** `--kit "Název sady"` omezí bici-sady/ na jednu sadu místo všech. */
const kitIdx = process.argv.indexOf('--kit');
const KIT = kitIdx > -1 ? process.argv[kitIdx + 1] : null;

/**
 * `--as noty-tabs` říká, že zadaná složka JE ta sekce, ne kořen, který ji
 * obsahuje. Sbírky bývají uspořádané po svém a kopírovat gigabajty jen kvůli
 * názvu složky nedává smysl.
 */
const asIdx = process.argv.indexOf('--as');
const AS_SECTION = asIdx > -1 ? process.argv[asIdx + 1] : null;

/**
 * Sekce, které skript zná. Doplňuje se ze specifikací knihovny, aby
 * přidání složky do `LIBRARY_SPECS` stačilo na jednom místě — jinak by
 * nová složka tiše chyběla v `--only` i v kontrolním výpisu.
 */
const SEKCE_PEVNE = ['zpevnik', 'fotky', 'bici-sady'];

/** Složky, které se nahrávají do knihovny. Musí sedět s `LIBRARY_SPECS`. */
const SLOZKY_KNIHOVNY = [
  'noty',
  'tabulatury',
  'midi',
  'samply/bici',
  'samply/basa',
  'samply/kytara',
  'samply/vokaly',
  'smycky',
  'stopy',
  'nahravky',
  'noty-tabs',
];

const SEKCE = [...SEKCE_PEVNE, ...SLOZKY_KNIHOVNY];
if (ONLY) {
  const nezname = [...ONLY].filter((s) => !SEKCE.includes(s));
  if (nezname.length) {
    console.error(`BLOCKED: neznámá sekce v --only: ${nezname.join(', ')}`);
    console.error(`Povolené: ${SEKCE.join(', ')}`);
    process.exit(1);
  }
}

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
    // Soubory s podtržítkem na začátku jsou poznámky pro člověka, ne obsah:
    // `_co-sem-patri.txt` v každé složce vysvětluje, co do ní patří, a bez
    // tohohle by se sám nahrál jako skladba.
    if (entry.name.startsWith('_')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Soubor, který je v iCloudu, ale ne na disku.
 *
 * iCloud umí obsah lokálně zahodit a nechat jen jméno a velikost. Takový
 * soubor vypadá normálně — `ls` ho ukáže i s megabajty — ale čtení ho
 * musí nejdřív stáhnout, což bez sítě selže a s pomalou linkou trvá
 * věčnost. Na macOS se to pozná tak, že logická velikost je nenulová,
 * ale na disku nezabírá žádné bloky.
 */
function jenVOblaku(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);
    return st.size > 0 && st.blocks === 0;
  } catch {
    return false;
  }
}

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Kde na disku sekce leží — s `--as` je to rovnou ROOT. */
function sectionDir(name: string): string {
  return AS_SECTION === name ? ROOT : path.join(ROOT, name);
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
  const dir = sectionDir('zpevnik');
  const files = walk(dir).filter((f) => SONG_EXTS.has(path.extname(f).toLowerCase()));

  for (const file of files) {
    const legacyId = relKey(file);
    const raw = fs.readFileSync(file, 'utf-8');
    // Postgres nepřijme nulový bajt v textu a spadne na „unsupported Unicode
    // escape sequence". Poškozený soubor tak shodí celý svůj záznam. Řídicí
    // znaky v textu písně stejně nemají co dělat, takže pryč s nimi —
    // tabulátory a konce řádků zůstávají.
    const content = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
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

      if (existing && !FORCE && existing.metadata?.sourceHash === hash) {
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

const ZVUK = new Set(['.wav', '.mp3', '.flac', '.m4a', '.ogg']);

/**
 * Složka na disku → kategorie v knihovně.
 *
 * Jedna složka, jedno okno v appce. `noty-tabs/` mísila noty, tabulatury
 * i MIDI dohromady, což znamenalo hádat, co kam patří; rozdělené složky
 * se jmenují jako okna, do kterých ty soubory doopravdy tečou.
 *
 * Původní `noty-tabs/` zůstává jako záloha, aby se už nasynchronizované
 * soubory nezaložily podruhé — jejich záznam se váže na cestu k souboru.
 */
const LIBRARY_SPECS: AssetSpec[] = [
  { dir: 'noty', exts: new Set(['.pdf']), category: 'pdf', assetType: 'pdf', bucket: 'assets' },
  { dir: 'tabulatury', exts: new Set(['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.ptb', '.tg']), category: 'guitar_pro', assetType: 'guitar_pro', bucket: 'assets' },
  { dir: 'midi', exts: new Set(['.mid', '.midi']), category: 'midi', assetType: 'midi', bucket: 'assets' },

  // Samply podle nástroje. Appka je v sekci Samples nabízí po kategoriích
  // a řadí podle tempa a tóniny, které čte z názvu souboru.
  { dir: 'samply/bici', exts: ZVUK, category: 'drum_kit_sample', assetType: 'sample', bucket: 'audio' },
  { dir: 'samply/basa', exts: ZVUK, category: 'bass_sample', assetType: 'sample', bucket: 'audio' },
  { dir: 'samply/kytara', exts: ZVUK, category: 'guitar_sample', assetType: 'sample', bucket: 'audio' },
  { dir: 'samply/vokaly', exts: ZVUK, category: 'vocal_sample', assetType: 'sample', bucket: 'audio' },

  { dir: 'smycky', exts: ZVUK, category: 'drum_loop', assetType: 'sample', bucket: 'audio' },
  { dir: 'stopy', exts: ZVUK, category: 'stem_mix', assetType: 'stem', bucket: 'audio' },
  { dir: 'nahravky', exts: ZVUK, category: 'recordings', assetType: 'recording', bucket: 'audio' },

  // Původní rozvržení. Nové soubory sem dávat netřeba, ale co už tu je,
  // musí zůstat rozpoznané.
  { dir: 'noty-tabs', exts: new Set(['.pdf']), category: 'pdf', assetType: 'pdf', bucket: 'assets' },
  { dir: 'noty-tabs', exts: new Set(['.gp', '.gp3', '.gp4', '.gp5', '.gpx']), category: 'guitar_pro', assetType: 'guitar_pro', bucket: 'assets' },
  { dir: 'noty-tabs', exts: new Set(['.mid', '.midi']), category: 'midi', assetType: 'midi', bucket: 'assets' },
];

// Kdyby někdo přidal specifikaci a zapomněl složku do seznamu nahoře,
// tiše by chyběla v `--only` i v kontrolním výpisu. Radši spadnout hned.
for (const spec of LIBRARY_SPECS) {
  if (!SLOZKY_KNIHOVNY.includes(spec.dir)) {
    throw new Error(`Složka „${spec.dir}" chybí v SLOZKY_KNIHOVNY.`);
  }
}

async function syncLibraryAssets(report: Report) {
  for (const spec of LIBRARY_SPECS) {
    if (ONLY && !ONLY.has(spec.dir)) continue;
    const dir = sectionDir(spec.dir);
    const files = walk(dir).filter((f) => spec.exts.has(path.extname(f).toLowerCase()));

    // Nahrává se souběžně. Po jednom by sbírka tohohle rozsahu
    // (přes dvacet tisíc MIDI souborů) trvala hodiny — čas jde skoro celý
    // na čekání na síť, ne na práci.
    const SOUBEZNE = 24;

    const nahrajJeden = async (file: string) => {
      const legacyId = relKey(file);
      const hash = hashFile(file);
      const name = path.basename(file);

      try {
        const { data: existing } = await admin.from('assets').select('id, storage_path, metadata').eq('metadata->>legacy_id', legacyId).maybeSingle();

        if (existing && !FORCE && existing.metadata?.sourceHash === hash) {
          report.skipped++;
          return;
        }

        const storagePath = existing?.storage_path || `global/${spec.category}/${crypto.randomUUID()}-${name}`;
        const bytes = fs.readFileSync(file);
        // Do R2, ne do Supabase Storage — sbírky not a nahrávek mají
        // gigabajty a Supabase dává ve volném tarifu jeden.
        const r2Key = `${spec.bucket}/${storagePath}`;
        await uploadObject(r2Key, bytes, mimeFor(file));
        const overeno = await objectSize(r2Key);
        if (overeno !== bytes.length) {
          throw new Error(`po nahrání sedí ${overeno} B, čekal jsem ${bytes.length} B`);
        }

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
            storage_bucket: 'r2',
            storage_path: r2Key,
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
        // U tisíců souborů by výpis každé chyby zahltil výstup; počet sedí,
        // podrobnosti se nechávají jen u prvních dvaceti.
        if (report.errors.length < 20) {
          report.errors.push(`${path.relative(ROOT, file)}: ${e.message}`);
        }
      }
    };

    for (let i = 0; i < files.length; i += SOUBEZNE) {
      await Promise.all(files.slice(i, i + SOUBEZNE).map(nahrajJeden));
      const hotovo = Math.min(i + SOUBEZNE, files.length);
      if (hotovo % 500 < SOUBEZNE) {
        process.stdout.write(`\r  ${spec.dir}: ${hotovo}/${files.length}`);
      }
    }
  }
}

// --- 4. fotky/ -> band_photos assets ---

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

async function syncPhotos(report: Report) {
  const dir = sectionDir('fotky');
  const files = walk(dir).filter((f) => PHOTO_EXTS.has(path.extname(f).toLowerCase()));

  for (const file of files) {
    const legacyId = relKey(file);
    const hash = hashFile(file);
    const name = path.basename(file);

    try {
      const { data: existing } = await admin.from('assets').select('id, storage_path, metadata').eq('metadata->>legacy_id', legacyId).maybeSingle();

      if (existing && !FORCE && existing.metadata?.sourceHash === hash) {
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
  // Dvě dynamiky jsou příponou jiné — `very_hard` končí na `hard`,
  // `med_soft` na `soft`. S hladovým prefixem a krátkou variantou napřed by
  // se `hihat_closed_very_hard_rr1` rozpadlo na artikulaci
  // „hihat_closed_very" a dynamiku „hard", takže by ta nejsilnější vrstva
  // skončila jako samostatný pad, který appka nikde nezobrazí. Proto líný
  // prefix a delší varianty jako první.
  const match = stem.match(/^(.+?)_(very_hard|med_soft|hard|med|soft)_rr(\d+)$/i);
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
    if (KIT && kitFolder.name !== KIT) continue;
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
        if (existing && !FORCE && existing.metadata?.sourceHash === hash) {
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
async function checkFolder() {
  const FREE_TIER_BYTES = 10 * 1024 ** 3; // Cloudflare R2 Free: 10 GB
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  const size = (f: string) => fs.statSync(f).size;
  const sum = (files: string[]) => files.reduce((a, f) => a + size(f), 0);

  console.log(`Kontroluji: ${ROOT}`);
  console.log('*** KONTROLA — nic se nezapisuje ***\n');

  let nahraje = 0;
  const problemy: string[] = [];

  // zpevnik/
  const zpevnikVse = walk(sectionDir('zpevnik'));
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

  // Sbírka tabulatur už jednou nahraná leží v `tab_library`, ne v
  // `assets`. Kdo na ni pustí synchronizaci, nahraje 2,7 GB podruhé —
  // a limit přeteče, aniž by v knihovně přibylo cokoli nového.
  {
    const tabulatury = walk(sectionDir('tabulatury'));
    if (tabulatury.length > 1000) {
      const { count } = await admin
        .from('tab_library')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'stored');
      if ((count || 0) > 1000) {
        problemy.push(
          `tabulatury/: ${tabulatury.length} souborů, ale v databázi už je sbírka ` +
            `o ${count} tabulaturách. Nejspíš je to totéž — nahrálo by se to podruhé. ` +
            `Ověřte, než pustíte synchronizaci bez --check.`
        );
      }
    }
  }

  // Složky knihovny
  for (const dir of SLOZKY_KNIHOVNY) {
    const vse = walk(sectionDir(dir));
    const specs = LIBRARY_SPECS.filter((s) => s.dir === dir);
    const podporovane = new Set(specs.flatMap((s) => [...s.exts]));
    const ok = vse.filter((f) => podporovane.has(path.extname(f).toLowerCase()));
    const ne = vse.filter((f) => !podporovane.has(path.extname(f).toLowerCase()));
    nahraje += sum(ok);
    if (vse.length === 0) continue; // prázdnou složku není o čem hlásit

    // Soubory jen v oblaku se počítají zvlášť: nahrát se dají, ale každý
    // se nejdřív musí stáhnout, takže z minutového běhu je klidně hodina.
    const voblaku = ok.filter(jenVOblaku);
    console.log(
      `${(dir + '/').padEnd(16)} ${ok.length} souborů (${mb(sum(ok))}), ${ne.length} ignorováno` +
        (voblaku.length ? `, ${voblaku.length} jen v iCloudu` : '')
    );
    if (voblaku.length) {
      problemy.push(
        `${dir}/: ${voblaku.length} souborů (${mb(sum(voblaku))}) je v iCloudu, ale ne na disku. ` +
          `Stáhněte je předem: brctl download "${sectionDir(dir)}"`
      );
    }
    if (ne.length) {
      const exts = [...new Set(ne.map((f) => path.extname(f).toLowerCase() || '(bez přípony)'))];
      problemy.push(
        `${dir}/: ${ne.length} souborů se nenahraje (${exts.join(', ')}). ` +
          `Přijímají se jen ${[...podporovane].join(', ')}.`
      );
    }
  }

  // fotky/
  const fotkyVse = walk(sectionDir('fotky'));
  const fotkyOk = fotkyVse.filter((f) => PHOTO_EXTS.has(path.extname(f).toLowerCase()));
  nahraje += sum(fotkyOk);
  console.log(`fotky/          ${fotkyOk.length} fotek (${mb(sum(fotkyOk))}), ${fotkyVse.length - fotkyOk.length} ignorováno`);

  // bici-sady/
  const kitDir = sectionDir('bici-sady');
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
      `Objem dat (${mb(nahraje)}) přesahuje 10 GB, které má Cloudflare R2 ve Free tarifu. ` +
        `Nad limit se neblokuje, ale doúčtuje ($0,015 za GB měsíčně) — je potřeba vybrat, co se nahraje.`
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
    await checkFolder();
    return;
  }

  console.log(`Synchronizuji z: ${ROOT}`);
  if (ONLY) console.log(`Jen sekce: ${[...ONLY].join(', ')}`);
  console.log('');

  const bezi = (sekce: string) => !ONLY || ONLY.has(sekce);

  const songReport = freshReport();
  if (bezi('zpevnik')) {
    await syncSongbook(songReport);
    printReport('Zpěvník (zpevnik/)', songReport);
  }

  const libraryReport = freshReport();
  if (SLOZKY_KNIHOVNY.some((d) => bezi(d))) {
    await syncLibraryAssets(libraryReport);
    printReport('Knihovna', libraryReport);
  }

  const photoReport = freshReport();
  if (bezi('fotky')) {
    await syncPhotos(photoReport);
    printReport('Fotky Kapely (fotky/)', photoReport);
  }

  const drumReport = freshReport();
  if (bezi('bici-sady')) {
    await syncDrumKits(drumReport);
    printReport('Bicí sady (bici-sady/)', drumReport);
  }

  const totalFailed = songReport.failed + libraryReport.failed + photoReport.failed + drumReport.failed;
  console.log(totalFailed > 0 ? `\nHotovo s ${totalFailed} chybami — viz výpis výše.` : '\nHotovo, beze chyb.');
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Neočekávaná chyba:', e);
  process.exit(1);
});
