// scripts/migrate-data.ts — Phase 7 one-off backfill: data/*.json → Supabase.
//
// Idempotent: safe to run more than once. Each table it touches has a
// `legacy_id` (or `metadata->>'legacy_id'` for `assets`) unique marker; rows
// that already carry a given legacy id are skipped, not re-inserted.
//
// What it does NOT do:
//  - Never migrates plaintext passwords. Users are created in Supabase Auth
//    with email_confirm:true and NO password — nobody (including this
//    script) ever sets or sees a real password. Getting them able to log in
//    again is a separate, deliberate step (invite email / admin UI), not an
//    automatic side effect of this backfill.
//  - Never sends email. `admin.createUser()` does not trigger anything.
//  - `stems.json` entries only produce `stem_sets` rows (the fact that a
//    stem-separation was attempted). No `stems` rows are created, because
//    today's data is 100% synthetic/fake audio — see docs/audit — and a
//    `stems` row would need to point at a real audio asset that doesn't
//    exist. Re-run real separation later (Phase 5/Stem Worker, not built
//    yet) to populate `stems` for real.
//
// Usage:
//   cd <repo root>
//   bun run scripts/migrate-data.ts
//
// Requires SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL in .env (same
// vars server.ts already uses — see docs/migration/2026-08-19-phase-2-4-supabase-migration-plan.md).

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
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

const DATA_DIR = path.join(process.cwd(), 'data');

interface Report {
  migrated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function freshReport(): Report {
  return { migrated: 0, skipped: 0, failed: 0, errors: [] };
}

function readJsonArrayIfExists(filename: string): any[] | null {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch (e: any) {
    console.error(`Could not parse ${filename}: ${e.message}`);
    return null;
  }
}

const VALID_ROLES = new Set(['admin', 'editor', 'musician', 'viewer']);
function normalizeRole(role: unknown): string {
  return typeof role === 'string' && VALID_ROLES.has(role) ? role : 'musician';
}

// --- users.json → auth.users + profiles ---
async function migrateUsers(report: Report) {
  const users = readJsonArrayIfExists('users.json');
  if (!users) {
    console.log('users.json not found — skipping user migration.');
    return;
  }

  for (const u of users) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email) {
      report.failed++;
      report.errors.push(`user ${u.id}: missing email`);
      continue;
    }

    try {
      const { data: existing } = await admin.from('profiles').select('user_id').eq('email', email).maybeSingle();
      if (existing) {
        report.skipped++;
        continue;
      }

      const role = normalizeRole(u.role);
      const status = u.status === 'active' ? 'active' : 'invited';

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true, // no password set — nobody can log in until a real invite/reset flow runs
        user_metadata: { display_name: u.displayName || email.split('@')[0], role, status, legacy_id: u.id },
      });

      if (createError || !created.user) {
        report.failed++;
        report.errors.push(`user ${email}: ${createError?.message}`);
        continue;
      }

      // Belt-and-suspenders: explicitly set role/status/permissions in case
      // the handle_new_user trigger's defaults ever drift from this script.
      await admin
        .from('profiles')
        .update({ role, status, permissions: u.permissions || undefined })
        .eq('user_id', created.user.id);

      report.migrated++;
    } catch (e: any) {
      report.failed++;
      report.errors.push(`user ${email}: ${e.message}`);
    }
  }
}

// --- songs.json → songs ---
async function migrateSongs(report: Report) {
  const songs = readJsonArrayIfExists('songs.json');
  if (!songs) {
    console.log('songs.json not found — skipping song migration.');
    return;
  }

  for (const s of songs) {
    try {
      const { data: existing } = await admin.from('songs').select('id').eq('legacy_id', s.id).maybeSingle();
      if (existing) {
        report.skipped++;
        continue;
      }

      const { error } = await admin.from('songs').insert({
        legacy_id: s.id,
        title: s.title || 'Bez názvu',
        artist: s.artist || null,
        source_type: 'library',
        status: 'active',
        owner_id: null, // legacy DEFAULT_SONGS were shared/global, not per-user
        metadata: {
          key: s.key,
          tuning: s.tuning,
          bpm: s.bpm,
          capo: s.capo,
          chordsUsed: s.chordsUsed,
          notes: s.notes,
          content: s.content,
          author: s.author,
          youtubeVideos: s.youtubeVideos,
        },
      });

      if (error) {
        report.failed++;
        report.errors.push(`song ${s.id}: ${error.message}`);
        continue;
      }
      report.migrated++;
    } catch (e: any) {
      report.failed++;
      report.errors.push(`song ${s.id}: ${e.message}`);
    }
  }
}

// --- playlist.json → playlists + playlist_songs ---
// Legacy playlist.json is actually a flat "recently queued YouTube videos"
// list, not a set of named playlists. It's migrated into one playlist;
// entries with no matching song (pure video queue items, no songId, or a
// songId that wasn't itself migrated) are logged and skipped rather than
// guessed at.
async function migratePlaylist(report: Report) {
  const items = readJsonArrayIfExists('playlist.json');
  if (!items || items.length === 0) {
    console.log('playlist.json not found or empty — skipping playlist migration.');
    return;
  }

  const LEGACY_PLAYLIST_ID = 'legacy-playlist';
  let playlistId: string;

  const { data: existingPlaylist } = await admin.from('playlists').select('id').eq('legacy_id', LEGACY_PLAYLIST_ID).maybeSingle();
  if (existingPlaylist) {
    playlistId = existingPlaylist.id;
  } else {
    const { data: created, error } = await admin
      .from('playlists')
      .insert({ legacy_id: LEGACY_PLAYLIST_ID, name: 'Migrovaný playlist', owner_id: null })
      .select('id')
      .single();
    if (error || !created) {
      report.failed++;
      report.errors.push(`playlist container: ${error?.message}`);
      return;
    }
    playlistId = created.id;
  }

  let position = 0;
  for (const item of items) {
    if (!item.songId) {
      report.skipped++;
      report.errors.push(`playlist item ${item.id}: no songId (video-queue-only entry) — not migrated, no song to link to`);
      position++;
      continue;
    }

    const { data: song } = await admin.from('songs').select('id').eq('legacy_id', item.songId).maybeSingle();
    if (!song) {
      report.skipped++;
      report.errors.push(`playlist item ${item.id}: song legacy_id ${item.songId} not found (migrate songs.json first) — skipped`);
      position++;
      continue;
    }

    const { data: existingLink } = await admin
      .from('playlist_songs')
      .select('playlist_id')
      .eq('playlist_id', playlistId)
      .eq('song_id', song.id)
      .maybeSingle();
    if (existingLink) {
      report.skipped++;
      position++;
      continue;
    }

    const { error } = await admin.from('playlist_songs').insert({ playlist_id: playlistId, song_id: song.id, position });
    if (error) {
      report.failed++;
      report.errors.push(`playlist item ${item.id}: ${error.message}`);
    } else {
      report.migrated++;
    }
    position++;
  }
}

// --- photos.json → assets (category='band_photos'), real bytes uploaded to Storage ---
async function migratePhotos(report: Report) {
  const photos = readJsonArrayIfExists('photos.json');
  if (!photos) {
    console.log('photos.json not found — skipping photo migration.');
    return;
  }

  for (const p of photos) {
    try {
      const { data: existing } = await admin.from('assets').select('id').eq('metadata->>legacy_id', p.id).maybeSingle();
      if (existing) {
        report.skipped++;
        continue;
      }

      const dataUrl: string | undefined = p.dataUrl;
      const match = dataUrl?.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) {
        report.skipped++;
        report.errors.push(`photo ${p.id}: no usable dataUrl — skipped`);
        continue;
      }

      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const ext = mimeType.split('/')[1]?.split('+')[0] || 'bin';
      const assetId = crypto.randomUUID();
      const storagePath = `global/band-photos/${assetId}.${ext}`;

      const { error: uploadError } = await admin.storage.from('assets').upload(storagePath, buffer, { contentType: mimeType });
      if (uploadError) {
        report.failed++;
        report.errors.push(`photo ${p.id}: storage upload failed — ${uploadError.message}`);
        continue;
      }

      const { error: insertError } = await admin.from('assets').insert({
        id: assetId,
        owner_id: null,
        name: p.title || 'Fotka',
        mime_type: mimeType,
        size_bytes: buffer.byteLength,
        storage_bucket: 'assets',
        storage_path: storagePath,
        asset_type: 'image',
        category: 'band_photos',
        status: 'active',
        metadata: { legacy_id: p.id, notes: p.notes, tags: p.tags, authorName: p.authorName, width: p.width, height: p.height },
      });

      if (insertError) {
        await admin.storage.from('assets').remove([storagePath]);
        report.failed++;
        report.errors.push(`photo ${p.id}: ${insertError.message}`);
        continue;
      }
      report.migrated++;
    } catch (e: any) {
      report.failed++;
      report.errors.push(`photo ${p.id}: ${e.message}`);
    }
  }
}

// --- stems.json → stem_sets only (no fake `stems` rows — see file header) ---
async function migrateStems(report: Report) {
  const stemSongs = readJsonArrayIfExists('stems.json');
  if (!stemSongs) {
    console.log('stems.json not found — skipping stem migration.');
    return;
  }

  for (const doc of stemSongs) {
    try {
      const { data: existing } = await admin.from('stem_sets').select('id').eq('legacy_id', doc.id).maybeSingle();
      if (existing) {
        report.skipped++;
        continue;
      }

      // Find (or create a bare) song for this stem set so it has somewhere to attach.
      let songId: string | null = null;
      const { data: existingSong } = await admin.from('songs').select('id').eq('legacy_id', doc.id).maybeSingle();
      if (existingSong) {
        songId = existingSong.id;
      } else {
        const { data: newSong, error: songError } = await admin
          .from('songs')
          .insert({
            legacy_id: doc.id,
            title: doc.title || 'Bez názvu',
            artist: doc.artist || null,
            source_type: 'external',
            source_reference: doc.youtubeUrl || null,
            status: 'active',
            owner_id: null,
            metadata: { youtubeId: doc.youtubeId, durationSeconds: doc.durationSeconds },
          })
          .select('id')
          .single();
        if (songError || !newSong) {
          report.failed++;
          report.errors.push(`stem set ${doc.id}: could not create backing song — ${songError?.message}`);
          continue;
        }
        songId = newSong.id;
      }

      const { error } = await admin.from('stem_sets').insert({
        legacy_id: doc.id,
        song_id: songId,
        status: doc.status === 'completed' ? 'failed' : doc.status || 'failed',
        // Marked 'failed' even if the legacy record said "completed" — the
        // legacy pipeline was synthetic (see docs/audit), so there is no
        // real separated audio to carry forward. Re-run real separation
        // once the Stem Worker exists.
        model: 'legacy-synthetic-not-migrated',
      });

      if (error) {
        report.failed++;
        report.errors.push(`stem set ${doc.id}: ${error.message}`);
        continue;
      }
      report.migrated++;
    } catch (e: any) {
      report.failed++;
      report.errors.push(`stem set ${doc.id}: ${e.message}`);
    }
  }
}

function printReport(name: string, r: Report) {
  console.log(`\n${name}:`);
  console.log(`  ${r.migrated} migrated`);
  console.log(`  ${r.skipped} skipped (already migrated / not migratable)`);
  console.log(`  ${r.failed} failed`);
  if (r.errors.length > 0) {
    console.log(`  notes:`);
    r.errors.forEach((e) => console.log(`    - ${e}`));
  }
}

async function main() {
  console.log('=== Phase 7 data migration: data/*.json -> Supabase ===');
  console.log(`Data directory: ${DATA_DIR}`);

  const reports = {
    users: freshReport(),
    songs: freshReport(),
    playlists: freshReport(),
    photos: freshReport(),
    stems: freshReport(),
  };

  // Order matters: songs before playlist/stems (they reference songs by legacy_id).
  await migrateUsers(reports.users);
  await migrateSongs(reports.songs);
  await migratePlaylist(reports.playlists);
  await migratePhotos(reports.photos);
  await migrateStems(reports.stems);

  console.log('\n=== Migration report ===');
  printReport('Users', reports.users);
  printReport('Songs', reports.songs);
  printReport('Playlist entries', reports.playlists);
  printReport('Photos', reports.photos);
  printReport('Stem sets', reports.stems);

  const totalFailed = Object.values(reports).reduce((sum, r) => sum + r.failed, 0);
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Migration crashed:', e);
  process.exit(1);
});
