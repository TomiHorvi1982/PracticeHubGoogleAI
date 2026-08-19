import { PlaylistItem } from '../types';
import { supabase } from './supabaseClient';
import { authService } from './authService';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PlaylistCallback = (items: PlaylistItem[]) => void;

/** `playlist_songs` row shape, widened in Phase 9 to carry a full queue
 * entry directly (see docs/migration) — "Setlisty" is one shared queue of
 * YouTube-video entries, optionally linked to a song, not a strict
 * song-only join table. */
interface PlaylistSongRow {
  id: string;
  song_id: string | null;
  youtube_id: string | null;
  title: string | null;
  artist: string | null;
  thumbnail_url: string | null;
  duration: string | null;
  added_by: string | null;
  added_by_name: string | null;
  notes: string | null;
  position: number;
  created_at: string;
}

function rowToItem(row: PlaylistSongRow): PlaylistItem {
  return {
    id: row.id,
    youtubeId: row.youtube_id || '',
    title: row.title || '',
    artist: row.artist || '',
    thumbnail: row.thumbnail_url || (row.youtube_id ? `https://img.youtube.com/vi/${row.youtube_id}/mqdefault.jpg` : ''),
    duration: row.duration || '',
    addedBy: row.added_by || '',
    addedByName: row.added_by_name || 'Člen',
    addedAt: new Date(row.created_at).getTime(),
    notes: row.notes || '',
    songId: row.song_id || undefined,
    order: row.position,
  };
}

const SHARED_PLAYLIST_LEGACY_ID = 'shared-setlist';

/** One shared, collaborative Setlisty queue — any signed-in band member can
 * add/reorder/remove entries (see phase9_collaborative_playlist_rls). */
class PlaylistService {
  private items: PlaylistItem[] = [];
  private subscribers: Set<PlaylistCallback> = new Set();
  private playlistId: string | null = null;
  private realtimeChannel: RealtimeChannel | null = null;

  constructor() {
    this.init();
  }

  public subscribe(cb: PlaylistCallback): () => void {
    this.subscribers.add(cb);
    cb(this.items);
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    for (const sub of this.subscribers) {
      try {
        sub(this.items);
      } catch (e) {
        console.error('Error in playlist subscriber', e);
      }
    }
  }

  public getItems(): PlaylistItem[] {
    return this.items;
  }

  private async ensurePlaylistId(): Promise<string> {
    if (this.playlistId) return this.playlistId;

    const { data: existing } = await supabase.from('playlists').select('id').eq('legacy_id', SHARED_PLAYLIST_LEGACY_ID).maybeSingle();
    if (existing) {
      this.playlistId = existing.id;
      return existing.id;
    }

    const { data: created, error } = await supabase
      .from('playlists')
      .insert({ legacy_id: SHARED_PLAYLIST_LEGACY_ID, name: 'Setlist', owner_id: null })
      .select('id')
      .single();
    if (error || !created) {
      throw new Error(error?.message || 'Nepodařilo se založit sdílený playlist.');
    }
    this.playlistId = created.id;
    return created.id;
  }

  private async fetchAll() {
    try {
      const playlistId = await this.ensurePlaylistId();
      const { data, error } = await supabase
        .from('playlist_songs')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

      if (error) {
        console.warn('[playlistService] Failed to load playlist:', error.message);
        return;
      }
      this.items = (data as PlaylistSongRow[]).map(rowToItem);
      this.notify();
    } catch (e: any) {
      console.warn('[playlistService] fetchAll failed:', e.message);
    }
  }

  public async init() {
    await this.fetchAll();

    this.realtimeChannel = supabase
      .channel('playlist-songs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_songs' }, () => {
        this.fetchAll();
      })
      .subscribe();
  }

  public async addItem(item: Partial<PlaylistItem>): Promise<PlaylistItem> {
    if (!authService.isAuthenticated()) {
      throw new Error('Pro úpravu setlistu musíte být přihlášeni.');
    }
    const user = authService.getCurrentUser();
    const playlistId = await this.ensurePlaylistId();

    const { data, error } = await supabase
      .from('playlist_songs')
      .insert({
        playlist_id: playlistId,
        song_id: item.songId || null,
        youtube_id: item.youtubeId || null,
        title: item.title || 'Nová píseň',
        artist: item.artist || null,
        thumbnail_url: item.thumbnail || (item.youtubeId ? `https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg` : null),
        duration: item.duration || null,
        added_by: user?.id || null,
        added_by_name: user?.displayName || 'Člen',
        notes: item.notes || null,
        position: this.items.length,
      })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message || 'Nepodařilo se přidat položku do setlistu.');

    const newItem = rowToItem(data as PlaylistSongRow);
    this.items = [...this.items, newItem];
    this.notify();
    return newItem;
  }

  public async removeItem(itemId: string) {
    if (!authService.isAuthenticated()) {
      console.warn('[playlistService] Cannot remove item while signed out.');
      return;
    }
    const { error } = await supabase.from('playlist_songs').delete().eq('id', itemId);
    if (error) {
      console.warn('[playlistService] Failed to remove item:', error.message);
      return;
    }
    this.items = this.items.filter((item) => item.id !== itemId);
    this.notify();
  }

  public async reorderItems(reordered: PlaylistItem[]) {
    if (!authService.isAuthenticated()) {
      console.warn('[playlistService] Cannot reorder while signed out.');
      return;
    }
    const itemsWithOrder = reordered.map((item, idx) => ({ ...item, order: idx }));
    this.items = itemsWithOrder;
    this.notify();

    // Persist each new position; RLS covers authorization per-row.
    await Promise.all(
      itemsWithOrder.map((item, idx) => supabase.from('playlist_songs').update({ position: idx }).eq('id', item.id))
    ).catch((e) => console.warn('[playlistService] Failed to persist reorder:', e));
  }
}

export const playlistService = new PlaylistService();
