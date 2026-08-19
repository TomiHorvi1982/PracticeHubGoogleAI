import { PlaylistItem } from '../types';
import {
  setFirestoreDoc,
  deleteFirestoreDoc,
  subscribeFirestoreCollection,
} from './firebase';

type PlaylistCallback = (items: PlaylistItem[]) => void;

class PlaylistService {
  private items: PlaylistItem[] = [];
  private subscribers: Set<PlaylistCallback> = new Set();
  private unsubscribeFirestore: (() => void) | null = null;
  private isLoaded: boolean = false;

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

  public setItems(items: PlaylistItem[]) {
    this.items = items;
    this.saveToLocalStorage();
    this.notify();
    this.persistAllToFirestore(items);
  }

  private saveToLocalStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('band_playlist_cache', JSON.stringify(this.items));
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
    }
  }

  public async init() {
    // 1. Instant local cache load
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('band_playlist_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            this.items = parsed;
            this.notify();
          }
        } catch (e) {}
      }
    }

    // 2. Real-time Cloud Sync from Firestore `playlists` collection
    this.unsubscribeFirestore = subscribeFirestoreCollection<PlaylistItem>('playlists', (cloudItems) => {
      if (cloudItems) {
        // Sort items by position/order or addedAt
        cloudItems.sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt));
        this.items = cloudItems;
        this.isLoaded = true;
        this.saveToLocalStorage();
        this.notify();
      }
    });
  }

  public async addItem(item: Partial<PlaylistItem>): Promise<PlaylistItem> {
    const newItem: PlaylistItem = {
      id: item.id || 'pl_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      youtubeId: item.youtubeId || '',
      title: item.title || 'Nová píseň',
      artist: item.artist || '',
      thumbnail: item.thumbnail || (item.youtubeId ? `https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg` : ''),
      duration: item.duration || '',
      addedBy: item.addedBy || '',
      addedByName: item.addedByName || 'Člen',
      addedAt: Date.now(),
      notes: item.notes || '',
      songId: item.songId || undefined,
      order: this.items.length,
    };

    // Optimistic local update
    this.items = [...this.items, newItem];
    this.saveToLocalStorage();
    this.notify();

    // Persist to Cloud Firestore
    try {
      await setFirestoreDoc('playlists', newItem.id, newItem);
    } catch (e) {
      console.warn('Failed to persist playlist item to Firestore:', e);
    }

    return newItem;
  }

  public async removeItem(itemId: string) {
    this.items = this.items.filter((item) => item.id !== itemId);
    this.saveToLocalStorage();
    this.notify();

    try {
      await deleteFirestoreDoc('playlists', itemId);
    } catch (e) {
      console.warn('Failed to delete playlist item from Firestore:', e);
    }
  }

  public async reorderItems(reordered: PlaylistItem[]) {
    const itemsWithOrder = reordered.map((item, idx) => ({ ...item, order: idx }));
    this.items = itemsWithOrder;
    this.saveToLocalStorage();
    this.notify();

    this.persistAllToFirestore(itemsWithOrder);
  }

  public async updateItem(itemId: string, updates: Partial<PlaylistItem>) {
    this.items = this.items.map((item) => (item.id === itemId ? { ...item, ...updates } : item));
    this.saveToLocalStorage();
    this.notify();

    const target = this.items.find((i) => i.id === itemId);
    if (target) {
      try {
        await setFirestoreDoc('playlists', itemId, target);
      } catch (e) {
        console.warn('Failed to update playlist item in Firestore:', e);
      }
    }
  }

  private async persistAllToFirestore(items: PlaylistItem[]) {
    try {
      for (let i = 0; i < items.length; i++) {
        await setFirestoreDoc('playlists', items[i].id, { ...items[i], order: i }).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to sync all playlist items to Firestore:', e);
    }
  }
}

export const playlistService = new PlaylistService();
