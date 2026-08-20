// scripts/import-stems.ts — nahraje hotové rozseparované stopy do
// mixážního pultu, aniž by se skladba znovu hnala přes separaci.
//
// Když už stopy máte (z Moises, Stem Roller, RipX…), tenhle skript je
// napojí na skladbu ve zpěvníku jako hotovou sadu stop — worker se
// nespouští vůbec.
//
// Pult umí pět stop: vocals, drums, bass, guitar, other. Zdrojové složky
// jich mívají víc (lead a rhythm zvlášť, k tomu metronom), takže se stopy
// podle názvu souboru poskládají: co patří na kytaru, ffmpeg smíchá do
// jedné, metronom se zahodí.
//
// Stopy se cestou převedou do MP3. Nekomprimované WAV má u jedné skladby
// přes půl gigabajtu, což je víc, než kolik má celý volný tarif Supabase
// na soubory — a pro zkoušení je to slyšitelně stejné.
//
// Použití:
//   bun run scripts/import-stems.ts "<složka se stopami>" --song "Amen"
//   bun run scripts/import-stems.ts "<složka>" --song "Amen" --dry-run

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
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

const SRC = path.resolve(process.argv[2] || '');
const DRY_RUN = process.argv.includes('--dry-run');
const songIdx = process.argv.indexOf('--song');
const SONG_TITLE = songIdx > -1 ? process.argv[songIdx + 1] : null;
const brIdx = process.argv.indexOf('--bitrate');
const BITRATE = brIdx > -1 ? process.argv[brIdx + 1] : '192k';

if (!SRC || !fs.existsSync(SRC) || !SONG_TITLE) {
  console.error('BLOCKED: zadejte složku se stopami a název skladby.');
  console.error('Použití: bun run scripts/import-stems.ts "<složka>" --song "Název" [--dry-run]');
  process.exit(1);
}

const AUDIO_EXTS = new Set(['.wav', '.flac', '.aiff', '.aif', '.mp3', '.m4a', '.ogg']);

/**
 * Které fragmenty v názvu souboru patří ke které stopě pultu. Pořadí
 * rozhoduje — `metronome` musí padnout dřív než cokoliv jiného, ať se
 * klikací stopa nesmíchá do bicích.
 */
const RULES: { match: RegExp; stem: string | null }[] = [
  // „název(2).wav" je druhý export téhož — kdyby se přimíchal, hrála by ta
  // stopa proti ostatním dvakrát hlasitěji.
  { match: /\(\d+\)\.[a-z0-9]+$/i, stem: null },
  { match: /metronom|click|count[-_ ]?in/i, stem: null }, // zahodit
  { match: /vocal|vox|zpev|zpěv/i, stem: 'vocals' },
  { match: /drum|bic[ií]|perc/i, stem: 'drums' },
  { match: /bass|basa/i, stem: 'bass' },
  { match: /lead|rhythm|rytm|guitar|kytar|gtr/i, stem: 'guitar' },
  { match: /other|piano|keys|klav[ií]r|synth|backing/i, stem: 'other' },
];

const STEM_TYPES = ['vocals', 'drums', 'bass', 'guitar', 'other'];

function classify(file: string): string | null | undefined {
  const name = path.basename(file);
  for (const rule of RULES) {
    if (rule.match.test(name)) return rule.stem;
  }
  return undefined; // nezařazeno
}

function run(bin: string, args: string[]) {
  execFileSync(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

async function main() {
  const files = fs
    .readdirSync(SRC)
    .filter((f) => !f.startsWith('.') && AUDIO_EXTS.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(SRC, f))
    .sort();

  console.log(`Složka:   ${SRC}`);
  console.log(`Skladba:  ${SONG_TITLE}`);
  console.log(`Nalezeno: ${files.length} zvukových souborů\n`);

  // roztřídit
  const byStem = new Map<string, string[]>();
  const zahozene: string[] = [];
  const nezarazene: string[] = [];

  for (const f of files) {
    const stem = classify(f);
    if (stem === null) {
      zahozene.push(path.basename(f));
    } else if (stem === undefined) {
      nezarazene.push(path.basename(f));
    } else {
      if (!byStem.has(stem)) byStem.set(stem, []);
      byStem.get(stem)!.push(f);
    }
  }

  for (const stem of STEM_TYPES) {
    const zdroje = byStem.get(stem) || [];
    if (zdroje.length === 0) {
      console.log(`  ${stem.padEnd(7)} — CHYBÍ`);
    } else if (zdroje.length === 1) {
      console.log(`  ${stem.padEnd(7)} <- ${path.basename(zdroje[0])}`);
    } else {
      console.log(`  ${stem.padEnd(7)} <- smícháno z ${zdroje.length}:`);
      for (const z of zdroje) console.log(`              ${path.basename(z)}`);
    }
  }
  for (const z of zahozene) console.log(`  (zahozeno)  ${z}`);
  for (const n of nezarazene) console.log(`  (nezařazeno, přeskočí se)  ${n}`);

  if (byStem.size === 0) {
    console.error('\nBLOCKED: žádná stopa se nepodařilo zařadit.');
    process.exit(1);
  }

  // najít skladbu
  const { data: songs, error: songErr } = await admin
    .from('songs')
    .select('id, title')
    .eq('status', 'active')
    .eq('title', SONG_TITLE);
  if (songErr) throw new Error(songErr.message);
  if (!songs || songs.length === 0) {
    console.error(`\nBLOCKED: skladba „${SONG_TITLE}" není ve zpěvníku.`);
    process.exit(1);
  }
  if (songs.length > 1) {
    console.error(`\nBLOCKED: „${SONG_TITLE}" je ve zpěvníku ${songs.length}×, nevím ke které stopy patří.`);
    process.exit(1);
  }
  const song = songs[0];
  console.log(`\nSkladba nalezena: ${song.title} (${song.id})`);

  const legacyId = `stems:${path.basename(SRC)}`;
  const { data: existingSet } = await admin
    .from('stem_sets')
    .select('id')
    .eq('legacy_id', legacyId)
    .maybeSingle();
  if (existingSet) {
    console.log(`\nTahle sada stop už nahraná je (${existingSet.id}) — nic se nemění.`);
    return;
  }

  if (DRY_RUN) {
    console.log('\n*** NANEČISTO — nic se nenahrálo ***');
    return;
  }

  const setId = crypto.randomUUID();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stems-'));
  console.log(`\nPřevádím do MP3 ${BITRATE} a nahrávám…`);

  const nahrane: { stem: string; assetId: string }[] = [];
  let bajtu = 0;

  try {
    for (const stem of STEM_TYPES) {
      const zdroje = byStem.get(stem);
      if (!zdroje || zdroje.length === 0) continue;

      const out = path.join(tmp, `${stem}.mp3`);
      if (zdroje.length === 1) {
        run('ffmpeg', ['-y', '-i', zdroje[0], '-vn', '-c:a', 'libmp3lame', '-b:a', BITRATE, out]);
      } else {
        // `amix` dělí hlasitost počtem vstupů, proto se zesílí zpátky —
        // jinak by smíchaná kytara byla proti ostatním stopám potichu.
        const args = ['-y'];
        for (const z of zdroje) args.push('-i', z);
        args.push(
          '-filter_complex',
          `amix=inputs=${zdroje.length}:duration=longest:normalize=0`,
          '-vn', '-c:a', 'libmp3lame', '-b:a', BITRATE, out
        );
        run('ffmpeg', args);
      }

      const bytes = fs.readFileSync(out);
      const storagePath = `global/stems/${setId}/${stem}.mp3`;
      const { error: upErr } = await admin.storage
        .from('audio')
        .upload(storagePath, bytes, { contentType: 'audio/mpeg', upsert: true });
      if (upErr) throw new Error(`upload ${stem}: ${upErr.message}`);

      const { data: asset, error: assetErr } = await admin
        .from('assets')
        .insert({
          owner_id: null,
          name: `${song.title} — ${stem}`,
          original_filename: `${stem}.mp3`,
          mime_type: 'audio/mpeg',
          size_bytes: bytes.length,
          storage_bucket: 'audio',
          storage_path: storagePath,
          asset_type: 'stem',
          category: 'stem_mix',
          status: 'active',
          metadata: { legacy_id: `${legacyId}:${stem}`, stemSetId: setId, stemType: stem },
        })
        .select('id')
        .single();
      if (assetErr || !asset) throw new Error(`asset ${stem}: ${assetErr?.message}`);

      nahrane.push({ stem, assetId: asset.id });
      bajtu += bytes.length;
      console.log(`  ${stem.padEnd(7)} ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
    }

    const { error: setErr } = await admin.from('stem_sets').insert({
      id: setId,
      legacy_id: legacyId,
      song_id: song.id,
      model: 'import',
      status: 'completed',
    });
    if (setErr) throw new Error(`stem_sets: ${setErr.message}`);

    const { error: stemsErr } = await admin.from('stems').insert(
      nahrane.map((n) => ({ stem_set_id: setId, stem_type: n.stem, asset_id: n.assetId }))
    );
    if (stemsErr) throw new Error(`stems: ${stemsErr.message}`);

    console.log(
      `\nHotovo: ${nahrane.length} stop, ${(bajtu / 1024 / 1024).toFixed(1)} MB, ` +
        `napojeno na „${song.title}".`
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error('Chyba:', e.message);
  process.exit(1);
});
