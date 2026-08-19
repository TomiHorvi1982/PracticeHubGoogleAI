// Unified Media Center Controller & State Service for NeverLate Studio
// Inspired by Kaset (Apple Music aesthetic, Smart Shuffle, Queue, Lyrics, Media Session)

import { MediaTrack, LyricLine, MediaPlaylist, MediaPlaybackState, Song } from '../types';
import { eventBus } from './eventBus';
import { songDatabaseService } from './songDatabaseService';

const STORAGE_KEY_LIKED = 'neverlate_media_liked_v2';
const STORAGE_KEY_HISTORY = 'neverlate_media_history_v2';
const STORAGE_KEY_PLAYLISTS = 'neverlate_media_playlists_v2';
const STORAGE_KEY_SONG_MAP = 'neverlate_media_song_map_v2';
const STORAGE_KEY_QUEUE = 'neverlate_media_queue_v2';

export class MediaCenterService {
  private queue: MediaTrack[] = [];
  private history: MediaTrack[] = [];
  private likedTracks: Map<string, MediaTrack> = new Map();
  private playlists: MediaPlaylist[] = [];
  private songMediaMap: Map<string, MediaTrack[]> = new Map(); // songId -> tracks

  private state: MediaPlaybackState = {
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 85,
    isMuted: false,
    playbackSpeed: 1.0,
    loopMode: 'off',
    smartShuffle: true,
    abLoop: null,
    lyricsIndex: -1,
  };

  private currentLyrics: LyricLine[] = [];
  private listeners: Set<(state: MediaPlaybackState, queue: MediaTrack[], lyrics: LyricLine[]) => void> = new Set();
  private isGeneratingSmartQueue = false;

  constructor() {
    this.loadFromStorage();
    this.initDefaultPlaylists();
    this.setupMediaSession();
    this.listenToGlobalEvents();
  }

  // --- PERSISTENCE ---
  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const rawLiked = localStorage.getItem(STORAGE_KEY_LIKED);
      if (rawLiked) {
        const parsed: MediaTrack[] = JSON.parse(rawLiked);
        parsed.forEach((t) => this.likedTracks.set(t.id, { ...t, isLiked: true }));
      }

      const rawHist = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (rawHist) {
        this.history = JSON.parse(rawHist);
      }

      const rawPl = localStorage.getItem(STORAGE_KEY_PLAYLISTS);
      if (rawPl) {
        this.playlists = JSON.parse(rawPl);
      }

      const rawMap = localStorage.getItem(STORAGE_KEY_SONG_MAP);
      if (rawMap) {
        const parsedMap: Record<string, MediaTrack[]> = JSON.parse(rawMap);
        Object.entries(parsedMap).forEach(([k, v]) => this.songMediaMap.set(k, v));
      }

      const rawQueue = localStorage.getItem(STORAGE_KEY_QUEUE);
      if (rawQueue) {
        this.queue = JSON.parse(rawQueue);
      }
    } catch (e) {
      console.warn('[MediaCenter] Error loading stored media data:', e);
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_LIKED, JSON.stringify(Array.from(this.likedTracks.values())));
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(this.history.slice(0, 50)));
      localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(this.playlists));
      localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(this.queue.slice(0, 30)));

      const mapObj: Record<string, MediaTrack[]> = {};
      this.songMediaMap.forEach((v, k) => {
        mapObj[k] = v;
      });
      localStorage.setItem(STORAGE_KEY_SONG_MAP, JSON.stringify(mapObj));
    } catch (e) {
      console.warn('[MediaCenter] Error saving media data:', e);
    }
  }

  private initDefaultPlaylists(): void {
    if (this.playlists.length === 0) {
      this.playlists = [
        {
          id: 'pl_rock_classics',
          name: 'Rock & Blues Backing Tracks',
          description: 'Cvičné backing tracky v různých tóninách pro kytarová sóla a improvizaci',
          icon: '🎸',
          trackIds: [],
          isCustom: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'pl_acoustic_jam',
          name: 'Acoustic Jam Sessions',
          description: 'Akustické doprovody, táborákové klasiky a folkové písně',
          icon: '🪕',
          trackIds: [],
          isCustom: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'pl_drum_grooves',
          name: 'Drum & Bass Rhythms',
          description: 'Rytmické smyčky pro trénink přesnosti a groovu',
          icon: '🥁',
          trackIds: [],
          isCustom: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      this.saveToStorage();
    }
  }

  // --- MEDIA SESSION API (macOS / Windows / Mobile lockscreen integration) ---
  private setupMediaSession(): void {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrev());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            this.seekTo(details.seekTime);
          }
        });
      } catch (e) {
        console.warn('[MediaCenter] MediaSession registration warning:', e);
      }
    }
  }

  private updateMediaSessionMetadata(track: MediaTrack | null): void {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && track) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist || 'NeverLate Studio',
          album: 'NeverLate Media Center',
          artwork: [
            {
              src: track.thumbnailUrl || `https://img.youtube.com/vi/${track.youtubeId || 'default'}/hqdefault.jpg`,
              sizes: '512x512',
              type: 'image/jpeg',
            },
          ],
        });
      } catch (e) {}
    }
  }

  // --- GLOBAL EVENT BUS BRIDGE ---
  private listenToGlobalEvents(): void {
    eventBus.on('TRANSPORT_PLAY', () => {
      if (!this.state.isPlaying && this.state.currentTrack) {
        this.setPlayingState(true);
      }
    });

    eventBus.on('TRANSPORT_PAUSE', () => {
      if (this.state.isPlaying) {
        this.setPlayingState(false);
      }
    });

    eventBus.on('SONG_CHANGED', ({ songId, song }) => {
      // Check if this song has attached media tracks
      if (songId) {
        const associated = this.getTracksForSong(songId);
        if (associated.length > 0 && !this.state.isPlaying) {
          // Prepared for instant 1-click playback
          this.setPlaybackTrack(associated[0], false);
        } else if (song && song.youtubeVideos && song.youtubeVideos.length > 0) {
          const firstYt = song.youtubeVideos[0];
          const autoTrack: MediaTrack = {
            id: `yt_${firstYt.id}`,
            youtubeId: firstYt.id,
            title: firstYt.title || `${song.artist} - ${song.title}`,
            artist: song.artist || 'Neznámý interpret',
            source: 'youtube',
            type: firstYt.type || 'backingtrack',
            bpm: song.bpm,
            key: song.key,
            associatedSongId: song.id,
            thumbnailUrl: `https://img.youtube.com/vi/${firstYt.id}/mqdefault.jpg`,
          };
          this.associateWithSong(autoTrack, song.id);
        }
      }
    });
  }

  // --- SUBSCRIPTIONS ---
  public subscribe(cb: (state: MediaPlaybackState, queue: MediaTrack[], lyrics: LyricLine[]) => void): () => void {
    this.listeners.add(cb);
    cb(this.state, this.queue, this.currentLyrics);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb(this.state, this.queue, this.currentLyrics));
  }

  // --- GETTERS ---
  public getState(): MediaPlaybackState {
    return { ...this.state };
  }

  public getQueue(): MediaTrack[] {
    return [...this.queue];
  }

  public getHistory(): MediaTrack[] {
    return [...this.history];
  }

  public getLikedTracks(): MediaTrack[] {
    return Array.from(this.likedTracks.values());
  }

  public getPlaylists(): MediaPlaylist[] {
    return [...this.playlists];
  }

  public getCurrentLyrics(): LyricLine[] {
    return [...this.currentLyrics];
  }

  public getTracksForSong(songId: string): MediaTrack[] {
    const list = this.songMediaMap.get(songId) || [];
    // Also include any video from songDatabase
    const song = songDatabaseService.getSongs().find((s) => s.id === songId);
    if (song && song.youtubeVideos) {
      const combined = [...list];
      song.youtubeVideos.forEach((v) => {
        if (!combined.some((t) => t.youtubeId === v.id)) {
          combined.push({
            id: `yt_${v.id}`,
            youtubeId: v.id,
            title: v.title,
            artist: song.artist,
            source: 'youtube',
            type: v.type,
            associatedSongId: song.id,
            bpm: song.bpm,
            key: song.key,
            thumbnailUrl: `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`,
          });
        }
      });
      return combined;
    }
    return list;
  }

  // --- PLAYBACK CONTROLS ---
  public playTrack(track: MediaTrack, contextList?: MediaTrack[]): void {
    this.setPlaybackTrack(track, true);

    // If contextList is provided, populate queue with the remaining tracks
    if (contextList && contextList.length > 0) {
      const idx = contextList.findIndex((t) => t.id === track.id || (t.youtubeId && t.youtubeId === track.youtubeId));
      if (idx !== -1) {
        this.queue = contextList.slice(idx + 1);
      } else {
        this.queue = contextList.filter((t) => t.id !== track.id);
      }
    }

    // Add to history
    this.history = [track, ...this.history.filter((t) => t.id !== track.id)].slice(0, 50);
    this.saveToStorage();
    this.notify();

    // Trigger lyrics fetching
    this.fetchLyrics(track);

    // Trigger Smart Shuffle replenishment if queue is getting low
    if (this.state.smartShuffle && this.queue.length <= 2) {
      this.replenishSmartQueue(track);
    }
  }

  public setPlaybackTrack(track: MediaTrack, autoPlay: boolean = true): void {
    const isLiked = this.likedTracks.has(track.id) || (track.youtubeId ? this.likedTracks.has(`yt_${track.youtubeId}`) : false);
    this.state = {
      ...this.state,
      currentTrack: { ...track, isLiked },
      isPlaying: autoPlay,
      currentTime: 0,
      lyricsIndex: -1,
    };
    this.updateMediaSessionMetadata(track);
    eventBus.emit('MEDIA_TRACK_CHANGED', { track, autoPlay });
    this.notify();
  }

  public togglePlay(): void {
    if (!this.state.currentTrack && this.queue.length > 0) {
      this.playTrack(this.queue[0]);
      return;
    }
    const nextPlaying = !this.state.isPlaying;
    this.setPlayingState(nextPlaying);
  }

  public setPlayingState(isPlaying: boolean): void {
    this.state = { ...this.state, isPlaying };
    if (isPlaying) {
      eventBus.emit('MEDIA_PLAY');
      eventBus.emit('TRANSPORT_PLAY');
    } else {
      eventBus.emit('MEDIA_PAUSE');
      eventBus.emit('TRANSPORT_PAUSE');
    }
    this.notify();
  }

  public playNext(): void {
    if (this.queue.length > 0) {
      const nextTrack = this.queue[0];
      this.queue = this.queue.slice(1);
      this.playTrack(nextTrack);
    } else if (this.state.loopMode === 'all' && this.history.length > 0) {
      const first = this.history[this.history.length - 1];
      this.playTrack(first);
    } else if (this.state.smartShuffle && this.state.currentTrack) {
      this.replenishSmartQueue(this.state.currentTrack, true);
    } else {
      this.setPlayingState(false);
    }
    this.saveToStorage();
    this.notify();
  }

  public playPrev(): void {
    // If we are more than 3 seconds into the song, restart it
    if (this.state.currentTime > 3) {
      this.seekTo(0);
      return;
    }

    if (this.history.length > 1) {
      const current = this.history[0];
      const prev = this.history[1];
      this.history = this.history.slice(1);
      if (current) {
        this.queue = [current, ...this.queue];
      }
      this.playTrack(prev);
    } else {
      this.seekTo(0);
    }
    this.saveToStorage();
    this.notify();
  }

  public seekTo(timeSeconds: number): void {
    const clamped = Math.max(0, Math.min(this.state.duration || 9999, timeSeconds));
    this.state = { ...this.state, currentTime: clamped };
    this.updateLyricsIndex(clamped);
    eventBus.emit('MEDIA_SEEK', { time: clamped });
    this.notify();
  }

  public updateTime(currentTime: number, duration?: number): void {
    const dur = duration !== undefined && duration > 0 ? duration : this.state.duration;

    // Check A-B Loop
    if (this.state.abLoop && this.state.abLoop.active) {
      const { start, end } = this.state.abLoop;
      if (end > start && currentTime >= end) {
        this.seekTo(start);
        return;
      }
    }

    this.state = {
      ...this.state,
      currentTime,
      duration: dur,
    };
    this.updateLyricsIndex(currentTime);
    this.notify();
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    this.state = { ...this.state, volume: clamped, isMuted: clamped === 0 };
    eventBus.emit('MEDIA_VOLUME_CHANGED', { volume: clamped });
    this.notify();
  }

  public toggleMute(): void {
    const nextMuted = !this.state.isMuted;
    this.state = { ...this.state, isMuted: nextMuted };
    this.notify();
  }

  public setPlaybackSpeed(speed: number): void {
    const valid = Math.max(0.25, Math.min(2.0, speed));
    this.state = { ...this.state, playbackSpeed: valid };
    eventBus.emit('MEDIA_SPEED_CHANGED', { speed: valid });
    this.notify();
  }

  public setLoopMode(mode: 'off' | 'one' | 'all'): void {
    this.state = { ...this.state, loopMode: mode };
    this.notify();
  }

  public toggleSmartShuffle(): void {
    const next = !this.state.smartShuffle;
    this.state = { ...this.state, smartShuffle: next };
    if (next && this.state.currentTrack && this.queue.length <= 1) {
      this.replenishSmartQueue(this.state.currentTrack);
    }
    this.notify();
  }

  public setAbLoop(ab: { start: number; end: number; active: boolean } | null): void {
    this.state = { ...this.state, abLoop: ab };
    this.notify();
  }

  // --- QUEUE MANAGEMENT ---
  public addToQueue(track: MediaTrack, position: 'next' | 'end' = 'end'): void {
    if (position === 'next') {
      this.queue = [track, ...this.queue];
    } else {
      this.queue = [...this.queue, track];
    }
    this.saveToStorage();
    this.notify();
  }

  public removeFromQueue(trackId: string): void {
    this.queue = this.queue.filter((t) => t.id !== trackId && t.youtubeId !== trackId);
    this.saveToStorage();
    this.notify();
  }

  public reorderQueue(newQueue: MediaTrack[]): void {
    this.queue = newQueue;
    this.saveToStorage();
    this.notify();
  }

  public clearQueue(): void {
    this.queue = [];
    this.saveToStorage();
    this.notify();
  }

  // --- LIKES & PLAYLISTS ---
  public toggleLike(track: MediaTrack): boolean {
    const key = track.id || (track.youtubeId ? `yt_${track.youtubeId}` : '');
    if (!key) return false;

    let isNowLiked = false;
    if (this.likedTracks.has(key)) {
      this.likedTracks.delete(key);
      isNowLiked = false;
    } else {
      this.likedTracks.set(key, { ...track, isLiked: true, addedAt: Date.now() });
      isNowLiked = true;
    }

    if (this.state.currentTrack && (this.state.currentTrack.id === key || this.state.currentTrack.youtubeId === track.youtubeId)) {
      this.state.currentTrack.isLiked = isNowLiked;
    }

    this.saveToStorage();
    this.notify();
    return isNowLiked;
  }

  public createPlaylist(name: string, description: string = '', icon: string = '🎵'): MediaPlaylist {
    const newPl: MediaPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim() || 'Nový playlist',
      description,
      icon,
      trackIds: [],
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.playlists.push(newPl);
    this.saveToStorage();
    this.notify();
    return newPl;
  }

  public addTrackToPlaylist(playlistId: string, track: MediaTrack): void {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (pl) {
      if (!pl.trackIds.includes(track.id)) {
        pl.trackIds.push(track.id);
        pl.updatedAt = Date.now();
        this.saveToStorage();
        this.notify();
      }
    }
  }

  public removeTrackFromPlaylist(playlistId: string, trackId: string): void {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (pl) {
      pl.trackIds = pl.trackIds.filter((id) => id !== trackId);
      pl.updatedAt = Date.now();
      this.saveToStorage();
      this.notify();
    }
  }

  public deletePlaylist(playlistId: string): void {
    this.playlists = this.playlists.filter((p) => p.id !== playlistId);
    this.saveToStorage();
    this.notify();
  }

  // --- SONG ASSOCIATION ---
  public associateWithSong(track: MediaTrack, songId: string): void {
    const current = this.songMediaMap.get(songId) || [];
    if (!current.some((t) => t.id === track.id || (t.youtubeId && t.youtubeId === track.youtubeId))) {
      const updated = [{ ...track, associatedSongId: songId }, ...current];
      this.songMediaMap.set(songId, updated);
      this.saveToStorage();
      eventBus.emit('SONG_MEDIA_ATTACHED', { songId, track });
      this.notify();
    }
  }

  public removeSongAssociation(trackId: string, songId: string): void {
    const current = this.songMediaMap.get(songId) || [];
    const updated = current.filter((t) => t.id !== trackId && t.youtubeId !== trackId);
    this.songMediaMap.set(songId, updated);
    this.saveToStorage();
    this.notify();
  }

  // --- TIME-SYNCED LYRICS ENGINE (LRC) ---
  public parseLrc(lrcText: string): LyricLine[] {
    const lines = lrcText.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      let match;
      const timestamps: number[] = [];
      while ((match = timeRegex.exec(line)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const millis = match[3] ? parseInt(match[3].padEnd(3, '0').substring(0, 3), 10) : 0;
        timestamps.push(minutes * 60 + seconds + millis / 1000);
      }

      const textOnly = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
      if (timestamps.length > 0 && textOnly) {
        timestamps.forEach((t) => {
          result.push({ time: t, text: textOnly });
        });
      }
    }

    result.sort((a, b) => a.time - b.time);
    return result;
  }

  public async fetchLyrics(track: MediaTrack): Promise<LyricLine[]> {
    // If track already has parsed lyrics
    if (Array.isArray(track.lyrics) && track.lyrics.length > 0) {
      this.currentLyrics = track.lyrics;
      this.notify();
      return this.currentLyrics;
    }

    try {
      const res = await fetch('/api/media/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: track.title,
          artist: track.artist,
          youtubeId: track.youtubeId,
          songId: track.associatedSongId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.lyrics && Array.isArray(data.lyrics) && data.lyrics.length > 0) {
          this.currentLyrics = data.lyrics;
          this.notify();
          return this.currentLyrics;
        } else if (data.lrcText) {
          this.currentLyrics = this.parseLrc(data.lrcText);
          this.notify();
          return this.currentLyrics;
        }
      }
    } catch (e) {
      console.warn('[MediaCenter] Failed to fetch lyrics:', e);
    }

    // Fallback: Check if active song has chords/content we can display
    if (track.associatedSongId) {
      const song = songDatabaseService.getSongs().find((s) => s.id === track.associatedSongId);
      if (song && song.content) {
        const songLines = song.content.split('\n').filter((l) => l.trim().length > 0);
        // Distribute approximately over 3 minutes
        const approxDuration = 180;
        const interval = approxDuration / Math.max(songLines.length, 1);
        this.currentLyrics = songLines.map((line, idx) => ({
          time: Math.round(idx * interval * 10) / 10,
          text: line,
        }));
        this.notify();
        return this.currentLyrics;
      }
    }

    this.currentLyrics = [];
    this.notify();
    return [];
  }

  private updateLyricsIndex(currentTime: number): void {
    if (this.currentLyrics.length === 0) return;
    let idx = -1;
    for (let i = 0; i < this.currentLyrics.length; i++) {
      if (currentTime >= this.currentLyrics[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    if (idx !== this.state.lyricsIndex) {
      this.state.lyricsIndex = idx;
    }
  }

  // --- SMART SHUFFLE & DISCOVERY ENGINE ---
  private async replenishSmartQueue(track: MediaTrack, playImmediateNext: boolean = false): Promise<void> {
    if (this.isGeneratingSmartQueue) return;
    this.isGeneratingSmartQueue = true;

    try {
      const res = await fetch('/api/media/smart-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: track.title,
          artist: track.artist,
          genre: track.genre || 'Rock / Acoustic',
          bpm: track.bpm || 120,
          key: track.key || 'G',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const recommended: MediaTrack[] = data.recommendations || [];
        // Filter out tracks already in queue or history
        const existingIds = new Set([
          ...this.queue.map((t) => t.id),
          ...this.history.map((t) => t.id),
          track.id,
        ]);
        const fresh = recommended.filter((t) => !existingIds.has(t.id));

        if (fresh.length > 0) {
          if (playImmediateNext) {
            const nextOne = fresh[0];
            this.queue = [...this.queue, ...fresh.slice(1)];
            this.playTrack(nextOne);
          } else {
            this.queue = [...this.queue, ...fresh];
            this.saveToStorage();
            this.notify();
          }
        }
      }
    } catch (err) {
      console.warn('[MediaCenter] Smart recommendations error:', err);
    } finally {
      this.isGeneratingSmartQueue = false;
    }
  }
}

export const mediaCenterService = new MediaCenterService();
