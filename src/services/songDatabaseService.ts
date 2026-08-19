import { Song } from '../types';
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

function songToRowUpdate(song: Song) {
  const metadata: Record<string, any> = {};
  for (const [key, value] of Object.entries(song)) {
    if (!CORE_FIELDS.has(key)) metadata[key] = value;
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
    this.songs = (data as SongRow[]).map(rowToSong);
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
