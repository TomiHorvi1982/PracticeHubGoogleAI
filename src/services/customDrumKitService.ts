import { CustomDrumKit, MultiLayerSampleLayer } from '../types';
import { audioSynth } from './audioSynth';
import { sampledDrumEngine, DrumArticulation, VelocityTier } from './SampledDrumEngine';
import {
  setFirestoreDoc,
  deleteFirestoreDoc,
  subscribeFirestoreCollection,
  getAllFirestoreDocs,
} from './firebase';

const DB_NAME = 'StrumCustomDrumKitsDB';
const STORE_NAME = 'custom_kits';
const LOCAL_STORAGE_BACKUP_KEY = 'strum_custom_drum_kits_v2';

class CustomDrumKitService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryKits: CustomDrumKit[] = [];
  private subscribers: Set<(kits: CustomDrumKit[]) => void> = new Set();
  private unsubscribeFirestore: (() => void) | null = null;

  constructor() {
    this.init();
  }

  public subscribe(cb: (kits: CustomDrumKit[]) => void): () => void {
    this.subscribers.add(cb);
    cb(this.memoryKits);
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    for (const sub of this.subscribers) {
      try {
        sub(this.memoryKits);
      } catch (e) {
        console.error('Error notifying drum kit subscriber', e);
      }
    }
  }

  public async init() {
    // 1. Initial fast load from local IndexedDB & LocalStorage
    try {
      const localKits = await this.getAllKitsFromLocal();
      if (localKits.length > 0) {
        this.memoryKits = localKits;
        this.notify();
        this.preloadKitsIntoAudioSynth(localKits);
      }
    } catch (e) {
      console.warn('Failed local drum kit load', e);
    }

    // 2. Real-time Cloud Firestore sync from `custom_drum_kits` collection
    this.unsubscribeFirestore = subscribeFirestoreCollection<CustomDrumKit>('custom_drum_kits', async (cloudKits) => {
      if (cloudKits && cloudKits.length > 0) {
        this.memoryKits = cloudKits;
        this.notify();
        // Save to local IndexedDB & AudioSynth
        for (const kit of cloudKits) {
          await this.saveToLocalIndexedDB(kit).catch(() => {});
        }
        this.preloadKitsIntoAudioSynth(cloudKits);
      }
    });
  }

  private initDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB not supported'));
          return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  public async getAllKitsFromLocal(): Promise<CustomDrumKit[]> {
    try {
      const db = await this.initDB();
      return new Promise<CustomDrumKit[]>((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve(this.getFromLocalStorage());
      });
    } catch {
      return this.getFromLocalStorage();
    }
  }

  public getKits(): CustomDrumKit[] {
    return this.memoryKits;
  }

  public getAllKits(): CustomDrumKit[] {
    return this.memoryKits;
  }

  public async getKitById(id: string): Promise<CustomDrumKit | null> {
    const memory = this.memoryKits.find((k) => k.id === id);
    if (memory) return memory;

    try {
      const db = await this.initDB();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch {
      const kits = this.getFromLocalStorage();
      return kits.find((k) => k.id === id) || null;
    }
  }

  public async saveKit(kit: CustomDrumKit): Promise<void> {
    kit.updatedAt = Date.now();

    // Update memory & notify UI
    const idx = this.memoryKits.findIndex((k) => k.id === kit.id);
    if (idx >= 0) {
      this.memoryKits[idx] = kit;
    } else {
      this.memoryKits.push(kit);
    }
    this.notify();

    // 1. Pre-decode into AudioSynth Web Audio buffers
    await this.preloadSingleKit(kit);

    // 2. Save to IndexedDB local cache
    await this.saveToLocalIndexedDB(kit);
    this.saveToLocalStorage(kit);

    // 3. Persist to Firestore Cloud Storage
    try {
      await setFirestoreDoc('custom_drum_kits', kit.id, kit);
    } catch (err) {
      console.warn('Firestore cloud save failed for custom drum kit:', err);
    }
  }

  public async deleteKit(id: string): Promise<void> {
    audioSynth.unloadCustomKit(id);
    sampledDrumEngine.unloadCustomKit(id);
    this.memoryKits = this.memoryKits.filter((k) => k.id !== id);
    this.notify();

    // Delete from local IndexedDB & LocalStorage
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
    } catch (err) {
      // ignore
    }

    const kits = this.getFromLocalStorage().filter((k) => k.id !== id);
    try {
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(kits));
    } catch (e) {}

    // Delete from Firestore Cloud Storage
    try {
      await deleteFirestoreDoc('custom_drum_kits', id);
    } catch (err) {
      console.warn('Firestore cloud delete error:', err);
    }
  }

  private async saveToLocalIndexedDB(kit: CustomDrumKit): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(kit);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      // ignore
    }
  }

  public async preloadKitsIntoAudioSynth(kits: CustomDrumKit[]): Promise<void> {
    for (const kit of kits) {
      await this.preloadSingleKit(kit);
    }
  }

  public async preloadSingleKit(kit: CustomDrumKit): Promise<void> {
    try {
      await sampledDrumEngine.preloadCustomKit(kit);
    } catch (err) {
      console.warn(`[customDrumKitService] SampledDrumEngine preload error for ${kit.name}:`, err);
    }

    if (kit.samples) {
      const promises = Object.entries(kit.samples).map(async ([padId, sample]) => {
        if (sample?.dataUrl) {
          try {
            await audioSynth.loadCustomDrumSample(kit.id, padId, sample.dataUrl);
          } catch (err) {
            console.error(`Failed to decode sample ${sample.name} for kit ${kit.name}:`, err);
          }
        }
      });
      await Promise.all(promises);
    }
  }

  public async addMultiLayerSample(
    kitId: string,
    articulation: DrumArticulation,
    layer: MultiLayerSampleLayer
  ): Promise<CustomDrumKit | null> {
    const kit = await this.getKitById(kitId);
    if (!kit) return null;

    if (!kit.multiLayers) {
      kit.multiLayers = {};
    }
    if (!kit.multiLayers[articulation]) {
      kit.multiLayers[articulation] = {};
    }

    const layerKey = `${layer.tier}:rr${layer.roundRobin}`;
    kit.multiLayers[articulation][layerKey] = layer;

    await this.saveKit(kit);
    return kit;
  }

  public async removeMultiLayerSample(
    kitId: string,
    articulation: DrumArticulation,
    tier: VelocityTier,
    roundRobin: number
  ): Promise<CustomDrumKit | null> {
    const kit = await this.getKitById(kitId);
    if (!kit || !kit.multiLayers || !kit.multiLayers[articulation]) return kit;

    const layerKey = `${tier}:rr${roundRobin}`;
    delete kit.multiLayers[articulation][layerKey];

    if (Object.keys(kit.multiLayers[articulation]).length === 0) {
      delete kit.multiLayers[articulation];
    }

    await this.saveKit(kit);
    return kit;
  }

  private getFromLocalStorage(): CustomDrumKit[] {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveToLocalStorage(kit: CustomDrumKit): void {
    try {
      const kits = this.getFromLocalStorage();
      const index = kits.findIndex((k) => k.id === kit.id);
      if (index >= 0) {
        kits[index] = kit;
      } else {
        kits.push(kit);
      }
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(kits));
    } catch (e) {}
  }

  public readFileAsDataUrl(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  public readFileAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  }

  public createEmptyKit(name = 'Moje Vlastní Sada Bicích', genre = 'Custom'): CustomDrumKit {
    return {
      id: `custom_kit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      czName: name,
      icon: '🥁',
      genre,
      description: 'Uživatelská sada s vlastními nahranými nebo importovanými samply.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      samples: {},
    };
  }
}

export const customDrumKitService = new CustomDrumKitService();
