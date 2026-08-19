import { Song } from '../types';
import { INITIAL_SONGS } from '../data/chordsAndScales';
import {
  setFirestoreDoc,
  deleteFirestoreDoc,
  subscribeFirestoreCollection,
  getAllFirestoreDocs,
} from './firebase';

type SongsCallback = (songs: Song[]) => void;

class SongDatabaseService {
  private songs: Song[] = INITIAL_SONGS;
  private subscribers: Set<SongsCallback> = new Set();
  private unsubscribeFirestore: (() => void) | null = null;
  private isInitialized: boolean = false;

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

  public setSongs(songs: Song[]) {
    this.songs = songs;
    this.saveToLocalStorage();
    this.notify();
  }

  private saveToLocalStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('band_songs_db', JSON.stringify(this.songs));
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
    }
  }

  public async init() {
    // 1. Fast initial UI load from localStorage
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('band_songs_db');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.songs = parsed;
            this.notify();
          }
        } catch (e) {}
      }
    }

    // 2. Real-time Cloud Sync from Firestore `songs` collection
    this.unsubscribeFirestore = subscribeFirestoreCollection<Song>('songs', async (cloudSongs) => {
      if (cloudSongs && cloudSongs.length > 0) {
        // Sort songs by updatedAt or title
        cloudSongs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        this.songs = cloudSongs;
        this.saveToLocalStorage();
        this.notify();
        this.isInitialized = true;
      } else if (!this.isInitialized) {
        // Seed initial default songs to Firestore on first launch if empty
        console.log('Seeding initial songs to Firestore...');
        this.isInitialized = true;
        for (const song of INITIAL_SONGS) {
          await setFirestoreDoc('songs', song.id, song).catch(() => {});
        }
      }
    });
  }

  public async saveSong(song: Song): Promise<Song> {
    const updatedSong: Song = {
      ...song,
      createdAt: song.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const existingIndex = this.songs.findIndex((s) => s.id === updatedSong.id);
    if (existingIndex >= 0) {
      this.songs[existingIndex] = updatedSong;
    } else {
      this.songs = [updatedSong, ...this.songs];
    }

    this.saveToLocalStorage();
    this.notify();

    // Persist securely to Firestore Cloud Storage
    try {
      await setFirestoreDoc('songs', updatedSong.id, updatedSong);
    } catch (e) {
      console.warn('Failed to save song to Firestore cloud:', e);
    }

    // Also notify legacy API endpoint if present
    try {
      await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song: updatedSong }),
      });
    } catch (e) {
      // ignore
    }

    return updatedSong;
  }

  public async deleteSong(songId: string) {
    this.songs = this.songs.filter((s) => s.id !== songId);
    this.saveToLocalStorage();
    this.notify();

    // Remove from Firestore Cloud Storage
    try {
      await deleteFirestoreDoc('songs', songId);
    } catch (e) {
      console.warn('Failed to delete song from Firestore cloud:', e);
    }

    // Also notify legacy API endpoint if present
    try {
      await fetch(`/api/songs/${songId}`, {
        method: 'DELETE',
      });
    } catch (e) {
      // ignore
    }
  }
}

export const songDatabaseService = new SongDatabaseService();
