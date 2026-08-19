import { BandPhoto } from '../types';
import {
  setFirestoreDoc,
  deleteFirestoreDoc,
  subscribeFirestoreCollection,
} from './firebase';

type PhotoCallback = (photos: BandPhoto[]) => void;

class PhotoService {
  private photos: BandPhoto[] = [];
  private subscribers: Set<PhotoCallback> = new Set();
  private unsubscribeFirestore: (() => void) | null = null;
  private isLoaded: boolean = false;

  constructor() {
    this.init();
  }

  public subscribe(cb: PhotoCallback): () => void {
    this.subscribers.add(cb);
    cb(this.photos);
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    for (const sub of this.subscribers) {
      try {
        sub(this.photos);
      } catch (e) {
        console.error('Error in photo subscriber', e);
      }
    }
  }

  public getPhotos(): BandPhoto[] {
    return this.photos;
  }

  private saveToLocalStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('band_photos_cache', JSON.stringify(this.photos));
      } catch (e) {
        console.warn('Could not cache full photos in localStorage', e);
      }
    }
  }

  public async init() {
    // 1. Local storage cache first
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem('band_photos_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            this.photos = parsed;
            this.notify();
          }
        } catch (e) {}
      }
    }

    // 2. Real-time Cloud Firestore sync from `photos` collection
    this.unsubscribeFirestore = subscribeFirestoreCollection<BandPhoto>('photos', (cloudPhotos) => {
      if (cloudPhotos) {
        cloudPhotos.sort((a, b) => b.createdAt - a.createdAt);
        this.photos = cloudPhotos;
        this.isLoaded = true;
        this.saveToLocalStorage();
        this.notify();
      }
    });
  }

  public async savePhoto(photo: Partial<BandPhoto> & { title: string; dataUrl: string }): Promise<BandPhoto> {
    const photoId = photo.id || 'photo_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const fullPhoto: BandPhoto = {
      id: photoId,
      title: photo.title || 'Fotografie kapely',
      dataUrl: photo.dataUrl,
      type: photo.type || 'upload',
      authorId: photo.authorId || '',
      authorName: photo.authorName || 'Člen',
      createdAt: photo.createdAt || Date.now(),
      notes: photo.notes || '',
      tags: photo.tags || [],
      width: photo.width,
      height: photo.height,
    };

    const existingIndex = this.photos.findIndex((p) => p.id === photoId);
    if (existingIndex >= 0) {
      this.photos[existingIndex] = fullPhoto;
    } else {
      this.photos = [fullPhoto, ...this.photos];
    }

    this.saveToLocalStorage();
    this.notify();

    try {
      await setFirestoreDoc('photos', fullPhoto.id, fullPhoto);
    } catch (e) {
      console.warn('Failed to persist photo to Firestore:', e);
    }

    return fullPhoto;
  }

  public async addPhoto(photoData: {
    title: string;
    url?: string;
    dataUrl?: string;
    type?: 'photo' | 'screenshot' | 'upload';
    caption?: string;
    notes?: string;
    uploadedBy?: string;
    uploadedByName?: string;
    authorName?: string;
    tags?: string[];
  }): Promise<BandPhoto> {
    return this.savePhoto({
      title: photoData.title,
      dataUrl: photoData.dataUrl || photoData.url || '',
      type: photoData.type || 'upload',
      authorName: photoData.authorName || photoData.uploadedByName,
      notes: photoData.notes || photoData.caption,
      tags: photoData.tags,
    });
  }

  public async updatePhoto(photoId: string, updates: Partial<BandPhoto>) {
    const existing = this.photos.find((p) => p.id === photoId);
    if (!existing) return;

    const updated = { ...existing, ...updates };
    this.photos = this.photos.map((p) => (p.id === photoId ? updated : p));
    this.saveToLocalStorage();
    this.notify();

    try {
      await setFirestoreDoc('photos', photoId, updated);
    } catch (e) {
      console.warn('Failed to update photo in Firestore:', e);
    }
  }

  public async deletePhoto(photoId: string) {
    this.photos = this.photos.filter((p) => p.id !== photoId);
    this.saveToLocalStorage();
    this.notify();

    try {
      await deleteFirestoreDoc('photos', photoId);
    } catch (e) {
      console.warn('Failed to delete photo from Firestore:', e);
    }
  }
}

export const photoService = new PhotoService();
