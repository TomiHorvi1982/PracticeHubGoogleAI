import { Song, SongAttachment } from '../types';
import { supabase } from './supabaseClient';
import { authService } from './authService';
import type { RealtimeChannel } from '@supabase/supabase-js';

type SongsCallback = (songs: Song[]) => void;

/**
 * `songs` table row shape (see docs/migration Phase 2/9). Core columns hold
 * what every song has; everything else (chords/lyrics content, key, tuning,
 * attachments, locking, etc.) lives in `metadata` — the same rich Song
 * object this app has always used, just stored in Postgres jsonb instead of
 * a Firestore document.
 */
interface SongRow {
  id: string;
  title: string;
  artist: string | null;
  owner_id: string | null;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

const CORE_FIELDS = new Set(['id', 'title', 'artist', 'createdAt', 'updatedAt']);

function rowToSong(row: SongRow): Song {
  return {
    ...(row.metadata as Partial<Song>),
    id: row.id,
    title: row.title,
    artist: row.artist || '',
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  } as Song;
}

/**
 * Attachments imported in bulk keep their bytes in Storage and carry a
 * `storagePath` instead of an inline base64 `dataUrl`, so the songbook fetch
 * doesn't drag megabytes of tabs along with it. The UI only knows about
 * `dataUrl`, so hand it a signed URL — one batched call for every attachment
 * in the whole songbook rather than one per file.
 */
async function resolveStoredAttachments(songs: Song[]): Promise<void> {
  const byBucket = new Map<string, Set<string>>();
  for (const song of songs) {
    for (const att of song.attachments || []) {
      if (!att.storagePath || att.dataUrl) continue;
      const bucket = att.storageBucket || 'assets';
      if (!byBucket.has(bucket)) byBucket.set(bucket, new Set());
      byBucket.get(bucket)!.add(att.storagePath);
    }
  }
  if (byBucket.size === 0) return;

  const urls = new Map<string, string>();
  for (const [bucket, paths] of byBucket) {
    // 12 hours: long enough that a practice session never sees a link expire,
    // short enough that a leaked URL doesn't stay useful.
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls([...paths], 60 * 60 * 12);
    if (error) {
      console.warn(`[songDatabaseService] Failed to sign ${bucket} attachments:`, error.message);
      continue;
    }
    for (const entry of data || []) {
      if (entry.path && entry.signedUrl) urls.set(`${bucket}/${entry.path}`, entry.signedUrl);
    }
  }

  for (const song of songs) {
    if (!song.attachments) continue;
    song.attachments = song.attachments.map((att) => {
      if (!att.storagePath || att.dataUrl) return att;
      const url = urls.get(`${att.storageBucket || 'assets'}/${att.storagePath}`);
      return url ? { ...att, dataUrl: url } : att;
    });
  }
}

function songToRowUpdate(song: Song) {
  const metadata: Record<string, any> = {};
  for (const [key, value] of Object.entries(song)) {
    if (!CORE_FIELDS.has(key)) metadata[key] = value;
  }
  // Signed URLs resolved at load time expire; storing one would leave a dead
  // link behind. The `storagePath` is the durable reference — keep only that.
  if (Array.isArray(metadata.attachments)) {
    metadata.attachments = (metadata.attachments as SongAttachment[]).map((att) =>
      att.storagePath ? { ...att, dataUrl: '' } : att
    );
  }
  return { title: song.title, artist: song.artist || null, metadata };
}

/**
 * Shared, collaborative songbook: songs are global (owner_id NULL) by
 * default — any signed-in band member can add/edit them, matching the
 * app's real behavior (this is one shared songbook, not per-user private
 * songs). RLS (`songs_insert_own_or_shared` etc.) enforces this the same
 * way regardless of whether the write comes from here or anywhere else.
 */
class SongDatabaseService {
  private songs: Song[] = [];
  private subscribers: Set<SongsCallback> = new Set();
  private realtimeChannel: RealtimeChannel | null = null;

  constructor() {
    this.init();
  }

  public subscribe(cb: SongsCallback): () => void {
    this.subscribers.add(cb);
    cb(this.songs);
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    for (const sub of this.subscribers) {
      try {
        sub(this.songs);
      } catch (e) {
        console.error('Error in songDatabase subscriber', e);
      }
    }
  }

  public getSongs(): Song[] {
    return this.songs;
  }

  private async fetchAll() {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[songDatabaseService] Failed to load songs:', error.message);
      return;
    }
    const songs = (data as SongRow[]).map(rowToSong);
    await resolveStoredAttachments(songs);
    this.songs = songs;
    this.notify();
  }

  public async init() {
    await this.fetchAll();

    // Realtime: any insert/update/delete on `songs` (from this tab, another
    // tab, or another band member) re-syncs everyone's local list.
    this.realtimeChannel = supabase
      .channel('songs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, () => {
        this.fetchAll();
      })
      .subscribe();
  }

  public async saveSong(song: Song): Promise<Song> {
    if (!authService.isAuthenticated()) {
      throw new Error('Pro úpravu zpěvníku musíte být přihlášeni.');
    }

    const existing = this.songs.find((s) => s.id === song.id);
    const update = songToRowUpdate(song);

    if (existing) {
      const { data, error } = await supabase.from('songs').update(update).eq('id', song.id).select().single();
      if (error) throw new Error(error.message);
      const updated = rowToSong(data as SongRow);
      await resolveStoredAttachments([updated]);
      this.songs = this.songs.map((s) => (s.id === updated.id ? updated : s));
      this.notify();
      return updated;
    }

    const { data, error } = await supabase
      .from('songs')
      .insert({ id: song.id, ...update, owner_id: null, source_type: 'library', status: 'active' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const created = rowToSong(data as SongRow);
    await resolveStoredAttachments([created]);
    this.songs = [created, ...this.songs];
    this.notify();
    return created;
  }

  public async deleteSong(songId: string) {
    if (!authService.isAuthenticated()) {
      console.warn('[songDatabaseService] Cannot delete while signed out.');
      return;
    }
    const { error } = await supabase.from('songs').delete().eq('id', songId);
    if (error) {
      console.warn('[songDatabaseService] Failed to delete song:', error.message);
      return;
    }
    this.songs = this.songs.filter((s) => s.id !== songId);
    this.notify();
  }
}

export const songDatabaseService = new SongDatabaseService();
