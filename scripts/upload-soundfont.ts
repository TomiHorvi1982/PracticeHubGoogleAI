// scripts/upload-soundfont.ts — nahraje zvukovou banku pro přehrávač
// tabulatur do Supabase Storage.
//
// Přehrávač Guitar Pro tabulatur (alphaTab) hraje přes soundfont. Ten
// vestavěný (sonivox, 1,3 MB) je nejmenší možná GM banka a podle toho zní.
// Tenhle skript nahraje pořádnou — výchozí je MuseScore_General.sf3
// (38 MB, licence MIT), která má výrazně lepší zkreslené kytary, baskytaru
// i bicí.
//
// Soubor jde do soukromého bucketu `assets`. Appka si ho stáhne přes
// podepsaný odkaz a uloží do IndexedDB, takže 38 MB se táhne jednou za
// prohlížeč, ne při každém otevření.
//
// Použití:
//   bun run scripts/upload-soundfont.ts                    # stáhne a nahraje
//   bun run scripts/upload-soundfont.ts ./muj-font.sf2     # nahraje vlastní

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

// Oficiální mirror MuseScore. Neposílá CORS hlavičky, takže si ho prohlížeč
// stáhnout nemůže — proto ta cesta přes vlastní úložiště.
const DEFAULT_URL =
  'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3';

/** Cesta v bucketu je pevná — appka na ni spoléhá (viz tabSoundfontService). */
const STORAGE_PATH = 'global/soundfonts/tab-player.sf3';

async function nacti(): Promise<{ bytes: Buffer; puvod: string }> {
  const local = process.argv[2];
  if (local) {
    const p = path.resolve(local);
    if (!fs.existsSync(p)) {
      console.error(`BLOCKED: soubor neexistuje: ${p}`);
      process.exit(1);
    }
    return { bytes: fs.readFileSync(p), puvod: p };
  }

  console.log(`Stahuji ${DEFAULT_URL} …`);
  const res = await fetch(DEFAULT_URL);
  if (!res.ok) throw new Error(`stažení selhalo: HTTP ${res.status}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), puvod: DEFAULT_URL };
}

async function main() {
  const { bytes, puvod } = await nacti();

  const magic = bytes.subarray(0, 4).toString('latin1');
  if (magic !== 'RIFF') {
    console.error(`BLOCKED: tohle není soundfont — soubor začíná „${magic}", čekal jsem „RIFF".`);
    process.exit(1);
  }

  console.log(`Zdroj:    ${puvod}`);
  console.log(`Velikost: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);

  const { error: upErr } = await admin.storage.from('assets').upload(STORAGE_PATH, bytes, {
    contentType: 'application/octet-stream',
    upsert: true,
    cacheControl: '31536000',
  });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  const legacyId = 'soundfont:tab-player';
  const { data: existing } = await admin
    .from('assets')
    .select('id')
    .eq('metadata->>legacy_id', legacyId)
    .maybeSingle();

  const row = {
    owner_id: null,
    name: 'Zvuková banka přehrávače tabulatur',
    original_filename: path.basename(puvod),
    mime_type: 'application/octet-stream',
    size_bytes: bytes.length,
    storage_bucket: 'assets',
    storage_path: STORAGE_PATH,
    asset_type: 'preset',
    category: 'soundfont',
    status: 'active',
    metadata: { legacy_id: legacyId, source: puvod },
  };

  const { error: rowErr } = existing
    ? await admin.from('assets').update(row).eq('id', existing.id)
    : await admin.from('assets').insert(row);
  if (rowErr) throw new Error(`assets: ${rowErr.message}`);

  console.log(`\nHotovo — nahráno jako ${STORAGE_PATH}.`);
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
