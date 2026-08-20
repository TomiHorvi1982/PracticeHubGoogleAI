import { CustomDrumKit, CustomDrumSample, MultiLayerSampleLayer } from '../types';
import { audioSynth } from './audioSynth';
import { sampledDrumEngine, DrumArticulation, VelocityTier } from './SampledDrumEngine';
import { supabase } from './supabaseClient';
import { authService } from './authService';
import type { RealtimeChannel } from '@supabase/supabase-js';

const DB_NAME = 'StrumCustomDrumKitsDB';
const STORE_NAME = 'custom_kits';
const LOCAL_STORAGE_BACKUP_KEY = 'strum_custom_drum_kits_v2';
const STORAGE_BUCKET = 'assets';
const CATEGORY = 'drum_kit_sample';

/** One `assets` row per sample layer (see docs/migration Phase 11) — not one
 * blob per kit. `metadata.key` is the same key format used locally
 * (`pad:{padId}` / `layer:{articulation}:{tier}:rr{roundRobin}`), so a kit's
 * assets can be matched back to `kit.samples`/`kit.multiLayers` directly. */
interface DrumKitRow {
  id: string;
  owner_id: string | null;
  name: string;
  cz_name: string | null;
  icon: string | null;
  genre: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface DrumKitSampleAssetRow {
  id: string;
  storage_bucket: string;
  storage_path: string;
  metadata: {
    kitId: string;
    key: string;
    kind: 'pad' | 'layer';
    padId?: string;
    articulation?: string;
    tier?: string;
    roundRobin?: number;
    name: string;
    size?: number;
    duration?: number;
    uploadedAt: number;
    volume?: number;
    pitchOffset?: number;
  };
}

type SampleEntry = {
  key: string;
  kind: 'pad' | 'layer';
  padId?: string;
  articulation?: string;
  tier?: string;
  roundRobin?: number;
  sample: CustomDrumSample | MultiLayerSampleLayer;
};

function padKey(padId: string): string {
  return `pad:${padId}`;
}
function layerKeyFor(articulation: string, tier: string, roundRobin: number): string {
  return `layer:${articulation}:${tier}:rr${roundRobin}`;
}

function collectSamples(kit: CustomDrumKit): SampleEntry[] {
  const entries: SampleEntry[] = [];
  for (const [padId, sample] of Object.entries(kit.samples || {})) {
    if (sample) entries.push({ key: padKey(padId), kind: 'pad', padId, sample });
  }
  for (const [articulation, layers] of Object.entries(kit.multiLayers || {})) {
    for (const layer of Object.values(layers || {})) {
      if (layer) {
        entries.push({
          key: layerKeyFor(articulation, layer.tier, layer.roundRobin),
          kind: 'layer',
          articulation,
          tier: layer.tier,
          roundRobin: layer.roundRobin,
          sample: layer,
        });
      }
    }
  }
  return entries;
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string; ext: string } {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(header)?.[1] || 'audio/wav';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mime.includes('wav') ? 'wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('ogg') ? 'ogg' : mime.includes('flac') ? 'flac' : 'm4a';
  return { blob: new Blob([bytes], { type: mime }), mime, ext };
}

class CustomDrumKitService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryKits: CustomDrumKit[] = [];
  private subscribers: Set<(kits: CustomDrumKit[]) => void> = new Set();
  private realtimeChannel: RealtimeChannel | null = null;
  /** Sample keys already known to exist in Supabase, per kit — lets saveKit
   * upload/delete only what actually changed instead of re-syncing everything. */
  private persistedSampleKeys: Map<string, Set<string>> = new Map();

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

    // 2. Real Supabase load + Realtime sync from `drum_kits`/`assets`
    await this.fetchAll();
    this.realtimeChannel = supabase
      .channel('drum-kits-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drum_kits' }, () => {
        this.fetchAll();
      })
      .subscribe();
  }

  private async fetchAll() {
    try {
      const [{ data: kitRows, error: kitError }, { data: assetRows, error: assetError }] = await Promise.all([
        supabase.from('drum_kits').select('*').order('created_at', { ascending: true }),
        supabase.from('assets').select('id, storage_bucket, storage_path, metadata').eq('category', CATEGORY).eq('status', 'active'),
      ]);

      if (kitError) {
        console.warn('[customDrumKitService] Failed to load drum kits:', kitError.message);
        return;
      }

      const assetsByKit = new Map<string, DrumKitSampleAssetRow[]>();
      for (const row of (assetRows as DrumKitSampleAssetRow[]) || []) {
        const kitId = row.metadata?.kitId;
        if (!kitId) continue;
        if (!assetsByKit.has(kitId)) assetsByKit.set(kitId, []);
        assetsByKit.get(kitId)!.push(row);
      }

      const kits: CustomDrumKit[] = [];
      for (const row of (kitRows as DrumKitRow[]) || []) {
        const kit: CustomDrumKit = {
          id: row.id,
          name: row.name,
          czName: row.cz_name || undefined,
          icon: row.icon || undefined,
          genre: row.genre || undefined,
          description: row.description || undefined,
          createdAt: new Date(row.created_at).getTime(),
          updatedAt: new Date(row.updated_at).getTime(),
          samples: {},
          multiLayers: {},
        };

        const assets = assetsByKit.get(row.id) || [];
        const keys = new Set<string>();
        await Promise.all(
          assets.map(async (asset) => {
            keys.add(asset.metadata.key);
            const { data: signed } = await supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 3600);
            if (!signed?.signedUrl) return;
            let dataUrl: string;
            try {
              const res = await fetch(signed.signedUrl);
              const blob = await res.blob();
              dataUrl = await this.readFileAsDataUrl(blob);
            } catch (e) {
              console.warn(`[customDrumKitService] Failed to fetch sample ${asset.metadata.name}:`, e);
              return;
            }

            const meta = asset.metadata;
            if (meta.kind === 'pad' && meta.padId) {
              kit.samples[meta.padId] = {
                padId: meta.padId,
                name: meta.name,
                dataUrl,
                size: meta.size,
                duration: meta.duration,
                volume: meta.volume,
                pitchOffset: meta.pitchOffset,
                uploadedAt: meta.uploadedAt,
                tier: meta.tier as VelocityTier | undefined,
                roundRobin: meta.roundRobin,
              };
            } else if (meta.kind === 'layer' && meta.articulation && meta.tier && meta.roundRobin) {
              if (!kit.multiLayers![meta.articulation]) kit.multiLayers![meta.articulation] = {};
              const layerKey = `${meta.tier}:rr${meta.roundRobin}`;
              kit.multiLayers![meta.articulation][layerKey] = {
                tier: meta.tier as MultiLayerSampleLayer['tier'],
                roundRobin: meta.roundRobin,
                name: meta.name,
                dataUrl,
                size: meta.size,
                duration: meta.duration,
                uploadedAt: meta.uploadedAt,
              };
            }
          })
        );

        this.persistedSampleKeys.set(row.id, keys);
        kits.push(kit);
      }

      this.memoryKits = kits;
      this.notify();
      for (const kit of kits) {
        await this.saveToLocalIndexedDB(kit).catch(() => {});
      }
      // Supabase is the source of truth: drop locally cached kits that no
      // longer exist there (deleted here or by another band member).
      // Without this they linger in IndexedDB forever and get re-fed to the
      // audio engines on every load, which surfaces as endless
      // "Failed to decode sample" errors for a kit the user already deleted.
      await this.pruneLocalKits(new Set(kits.map((k) => k.id))).catch(() => {});
      this.preloadKitsIntoAudioSynth(kits);
    } catch (e: any) {
      console.warn('[customDrumKitService] fetchAll failed:', e.message);
    }
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

  /**
   * Is this id a user-created drum kit (as opposed to a built-in `drums`
   * / `drums_*` kit, or some non-drum instrument profile)?
   *
   * Kit ids used to carry a `custom_` prefix, which callers pattern-matched
   * on. They are plain UUIDs since the Supabase migration (`drum_kits.id`
   * is a uuid column), so membership in the loaded kit list is now the only
   * reliable test — never re-introduce a prefix check.
   */
  public isCustomKitId(id: string): boolean {
    return this.memoryKits.some((k) => k.id === id);
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

    // 3. Persist to Supabase (shared band resource — owner_id always null)
    if (!authService.isAuthenticated()) {
      console.warn('[customDrumKitService] Not signed in — kit kept local-only.');
      return;
    }
    try {
      await this.persistKitToSupabase(kit);
    } catch (err) {
      console.warn('[customDrumKitService] Supabase save failed for kit:', err);
    }
  }

  private async persistKitToSupabase(kit: CustomDrumKit): Promise<void> {
    const { error: upsertError } = await supabase.from('drum_kits').upsert({
      id: kit.id,
      owner_id: null,
      name: kit.name,
      cz_name: kit.czName || null,
      icon: kit.icon || null,
      genre: kit.genre || null,
      description: kit.description || null,
      updated_at: new Date(kit.updatedAt).toISOString(),
    });
    if (upsertError) throw new Error(upsertError.message);

    const current = collectSamples(kit);
    const currentKeys = new Set(current.map((e) => e.key));
    const persisted = this.persistedSampleKeys.get(kit.id) || new Set<string>();

    const toUpload = current.filter((e) => !persisted.has(e.key));
    const toDelete = [...persisted].filter((k) => !currentKeys.has(k));

    if (toDelete.length > 0) {
      const { data: staleAssets } = await supabase
        .from('assets')
        .select('id, storage_bucket, storage_path')
        .eq('category', CATEGORY)
        .eq('metadata->>kitId', kit.id)
        .in('metadata->>key', toDelete);
      for (const asset of staleAssets || []) {
        await supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);
        await supabase.from('assets').delete().eq('id', asset.id);
      }
    }

    for (const entry of toUpload) {
      if (!entry.sample.dataUrl) continue;
      const { blob, mime, ext } = dataUrlToBlob(entry.sample.dataUrl);
      const assetId = crypto.randomUUID();
      const safeKey = entry.key.replace(/[^a-zA-Z0-9:_-]/g, '_');
      const storagePath = `global/drum_kit_samples/${kit.id}/${safeKey}.${ext}`;

      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, blob, {
        contentType: mime,
        upsert: true,
      });
      if (uploadError) {
        console.warn(`[customDrumKitService] Upload failed for ${entry.key}:`, uploadError.message);
        continue;
      }

      const metadata: DrumKitSampleAssetRow['metadata'] = {
        kitId: kit.id,
        key: entry.key,
        kind: entry.kind,
        padId: entry.padId,
        articulation: entry.articulation,
        tier: entry.tier,
        roundRobin: entry.roundRobin,
        name: entry.sample.name,
        size: entry.sample.size,
        duration: entry.sample.duration,
        uploadedAt: entry.sample.uploadedAt,
        volume: (entry.sample as CustomDrumSample).volume,
        pitchOffset: (entry.sample as CustomDrumSample).pitchOffset,
      };

      const { error: insertError } = await supabase.from('assets').insert({
        id: assetId,
        owner_id: null,
        name: entry.sample.name,
        original_filename: entry.sample.name,
        mime_type: mime,
        size_bytes: blob.size,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        asset_type: 'sample',
        category: CATEGORY,
        status: 'active',
        metadata,
      });
      if (insertError) {
        console.warn(`[customDrumKitService] Failed to record asset for ${entry.key}:`, insertError.message);
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      }
    }

    this.persistedSampleKeys.set(kit.id, currentKeys);
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

    // Delete from Supabase — samples' Storage objects, their `assets` rows, then the kit row.
    if (!authService.isAuthenticated()) return;
    try {
      const { data: assets } = await supabase
        .from('assets')
        .select('id, storage_bucket, storage_path')
        .eq('category', CATEGORY)
        .eq('metadata->>kitId', id);
      for (const asset of assets || []) {
        await supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);
      }
      if (assets && assets.length > 0) {
        await supabase.from('assets').delete().in('id', assets.map((a) => a.id));
      }
      await supabase.from('drum_kits').delete().eq('id', id);
      this.persistedSampleKeys.delete(id);
    } catch (err) {
      console.warn('[customDrumKitService] Supabase delete error:', err);
    }
  }

  /** Removes locally cached kits whose ids aren't in `keepIds`, from both
   * IndexedDB and the localStorage backup, and unloads their audio buffers. */
  private async pruneLocalKits(keepIds: Set<string>): Promise<void> {
    const localKits = await this.getAllKitsFromLocal();
    const stale = localKits.filter((k) => !keepIds.has(k.id));
    if (stale.length === 0) return;

    for (const kit of stale) {
      audioSynth.unloadCustomKit(kit.id);
      sampledDrumEngine.unloadCustomKit(kit.id);
      try {
        const db = await this.initDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        transaction.objectStore(STORE_NAME).delete(kit.id);
      } catch (e) {
        // ignore — cache pruning is best-effort
      }
    }

    try {
      const remaining = this.getFromLocalStorage().filter((k) => keepIds.has(k.id));
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(remaining));
    } catch (e) {}
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
      id: crypto.randomUUID(),
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
