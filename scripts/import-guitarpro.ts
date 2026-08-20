// scripts/import-guitarpro.ts — naimportuje Guitar Pro taby ze složky na disku
// do Zpěvníku a připojí je ke skladbám.
//
// Očekávaná struktura (název složky = album, název souboru = číslo a název skladby):
//
//   <složka>/
//     Roots (1996)/
//       01 Roots Bloody Roots.gp
//       02 Attitude.gp
//     Arise (1991)/
//       01 Arise.gp
//
// Skladbu spáruje podle názvu; když ještě neexistuje, založí ji. Samotný
// soubor jde do Storage (bucket `assets`) a ke skladbě se uloží jen odkaz
// na něj — příloha v `metadata.attachments` typu 'guitarpro'. Modul
// „TABS & TABULATURY" v detailu skladby ho pak nabídne ke stažení.
//
// Soubory se do metadat záměrně nevkládají jako base64: 36 tabů by přidalo
// ~6 MB, které by se stahovaly při každém načtení zpěvníku. Podepsaný odkaz
// si appka vyrobí až ve chvíli, kdy tab někdo opravdu otevře.
//
// Idempotentní: stejný soubor podruhé nenahraje (pozná se podle `legacy_id`
// přílohy odvozeného z cesty). Přílohu, která ještě drží base64 z dřívějšího
// běhu, přesune do Storage. Nikdy nemaže.
//
// Použití:
//   bun run scripts/import-guitarpro.ts ~/Sepultura-Tabs
//   bun run scripts/import-guitarpro.ts ~/Sepultura-Tabs --dry-run

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('BLOCKED: chybí VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ROOT = path.resolve(process.argv[2] || '');
const DRY_RUN = process.argv.includes('--dry-run');

if (!ROOT || !fs.existsSync(ROOT)) {
  console.error(`BLOCKED: složka neexistuje: ${ROOT || '(nezadána)'}`);
  console.error('Použití: bun run scripts/import-guitarpro.ts <složka> [--dry-run]');
  process.exit(1);
}

const GP_EXTS = new Set(['.gp', '.gp3', '.gp4', '.gp5', '.gpx']);

/** Porovnání názvů odolné vůči diakritice, pomlčkám a velikosti písmen. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

interface TabFile {
  filePath: string;
  album: string;
  trackNumber: number | null;
  title: string;
}

function collectTabs(root: string): TabFile[] {
  const out: TabFile[] = [];
  for (const albumDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!albumDir.isDirectory() || albumDir.name.startsWith('.')) continue;
    const albumPath = path.join(root, albumDir.name);
    for (const entry of fs.readdirSync(albumPath, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      if (!GP_EXTS.has(path.extname(entry.name).toLowerCase())) continue;

      const stem = path.basename(entry.name, path.extname(entry.name));
      const m = stem.match(/^(\d+)\s+(.*)$/);
      out.push({
        filePath: path.join(albumPath, entry.name),
        album: albumDir.name,
        trackNumber: m ? parseInt(m[1], 10) : null,
        title: (m ? m[2] : stem).trim(),
      });
    }
  }
  return out;
}

/**
 * Nahraje soubor do bucketu `assets` a založí k němu řádek v `assets`.
 * Vrátí přílohu ve tvaru, který appka čte (`SongAttachment` + `storagePath`,
 * podle kterého se za běhu vyrobí podepsaná adresa).
 */
async function uploadTab(tab: TabFile, legacyId: string) {
  const bytes = fs.readFileSync(tab.filePath);
  const name = path.basename(tab.filePath);

  const { data: existingAsset } = await admin
    .from('assets')
    .select('id, storage_path')
    .eq('metadata->>legacy_id', legacyId)
    .maybeSingle();

  // Storage klíče berou jen ASCII — „Itsári.gp" by upload odmítl. Původní
  // název s diakritikou zůstává v `name` / `original_filename`.
  const safeName = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-');
  const storagePath = existingAsset?.storage_path || `global/guitar_pro/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await admin.storage
    .from('assets')
    .upload(storagePath, bytes, { contentType: 'application/octet-stream', upsert: true });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  const row = {
    owner_id: null,
    name: `${tab.title} (${tab.album})`,
    original_filename: name,
    mime_type: 'application/octet-stream',
    size_bytes: bytes.length,
    storage_bucket: 'assets',
    storage_path: storagePath,
    asset_type: 'guitar_pro',
    category: 'guitar_pro',
    status: 'active',
    metadata: { legacy_id: legacyId, album: tab.album, track_number: tab.trackNumber ?? undefined },
  };

  const { data: asset, error: assetErr } = existingAsset
    ? await admin.from('assets').update(row).eq('id', existingAsset.id).select('id').single()
    : await admin.from('assets').insert(row).select('id').single();
  if (assetErr || !asset) throw new Error(`assets: ${assetErr?.message || 'zápis selhal'}`);

  return {
    id: asset.id,
    legacyId,
    name,
    type: 'guitarpro' as const,
    // Vyplní se za běhu podepsanou adresou; prázdný řetězec drží tvar typu.
    dataUrl: '',
    storageBucket: 'assets',
    storagePath,
    size: bytes.length,
    uploadedAt: Date.now(),
  };
}

/** Interpret se bere z názvu kořenové složky ("Sepultura-Tabs" -> "Sepultura"). */
function guessArtist(root: string): string {
  const base = path.basename(root).replace(/[-_]?tabs?$/i, '').replace(/[-_]+/g, ' ').trim();
  return base || 'Neznámý interpret';
}

async function main() {
  const artist = guessArtist(ROOT);
  const tabs = collectTabs(ROOT);
  console.log(`Složka:    ${ROOT}`);
  console.log(`Interpret: ${artist}`);
  console.log(`Nalezeno:  ${tabs.length} Guitar Pro souborů\n`);
  if (DRY_RUN) console.log('*** NANEČISTO — nic se nezapíše ***\n');

  const { data: existingSongs, error } = await admin
    .from('songs')
    .select('id, title, metadata')
    .eq('status', 'active');
  if (error) {
    console.error('Nepodařilo se načíst skladby:', error.message);
    process.exit(1);
  }

  const byTitle = new Map<string, any>();
  for (const s of existingSongs || []) byTitle.set(norm(s.title), s);

  let pripojeno = 0;
  let zalozeno = 0;
  let preskoceno = 0;
  let chyb = 0;

  for (const tab of tabs.sort((a, b) => a.album.localeCompare(b.album) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0))) {
    const legacyId = `gp:${path.relative(ROOT, tab.filePath).split(path.sep).join('/')}`;
    const label = `${tab.album} / ${tab.trackNumber ?? '--'} ${tab.title}`;

    try {
      let song = byTitle.get(norm(tab.title));

      // Už připojeno dřívějším během? Přílohu, která ještě drží base64,
      // je potřeba přesunout do Storage — jinak se nechává být.
      let stara: any = null;
      if (song) {
        const attachments = (song.metadata?.attachments || []) as any[];
        stara = attachments.find((a) => a?.legacyId === legacyId) || null;
        if (stara && stara.storagePath) {
          preskoceno++;
          continue;
        }
      }

      if (DRY_RUN) {
        if (stara) console.log(`  ↑ přesunout tab do Storage: ${label}`);
        else if (song) console.log(`  ~ připojit tab k existující skladbě: ${label}`);
        else console.log(`  + založit skladbu a připojit tab: ${label}`);
        if (song) pripojeno++;
        else zalozeno++;
        continue;
      }

      const attachment = await uploadTab(tab, legacyId);

      if (!song) {
        const metadata = {
          album: tab.album,
          trackNumber: tab.trackNumber ?? undefined,
          content: '',
          chordsUsed: [],
          notes: `Tab naimportován ze složky ${tab.album}.`,
          attachments: [attachment],
        };
        const { data: created, error: insErr } = await admin
          .from('songs')
          .insert({
            id: crypto.randomUUID(),
            legacy_id: legacyId,
            title: tab.title,
            artist,
            owner_id: null,
            status: 'active',
            source_type: 'upload',
            metadata,
          })
          .select('id, title, metadata')
          .single();
        if (insErr || !created) throw new Error(insErr?.message || 'insert selhal');
        byTitle.set(norm(created.title), created);
        console.log(`  + nová skladba + tab: ${label}`);
        zalozeno++;
        continue;
      }

      const metadata = { ...(song.metadata || {}) };
      const ostatni = ((metadata.attachments as any[]) || []).filter((a) => a?.legacyId !== legacyId);
      metadata.attachments = [...ostatni, attachment];
      if (!metadata.album) metadata.album = tab.album;

      const { error: updErr } = await admin.from('songs').update({ metadata }).eq('id', song.id);
      if (updErr) throw new Error(updErr.message);

      song.metadata = metadata;
      console.log(stara ? `  ↑ tab přesunut do Storage: ${label}` : `  ~ tab připojen: ${label}`);
      pripojeno++;
    } catch (e: any) {
      chyb++;
      console.log(`  ! ${label}: ${e.message}`);
    }
  }

  console.log(`\nHotovo: ${pripojeno} připojeno k existujícím, ${zalozeno} nových skladeb, ${preskoceno} beze změny, ${chyb} chyb.`);
  process.exit(chyb > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Neočekávaná chyba:', e);
  process.exit(1);
});
