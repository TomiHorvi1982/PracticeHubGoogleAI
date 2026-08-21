import { BandPhoto } from '../types';
import { supabase } from './supabaseClient';
import { authService } from './authService';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { fileUrlService } from './fileUrlService';

type PhotoCallback = (photos: BandPhoto[]) => void;

const STORAGE_BUCKET = 'assets';
const CATEGORY = 'band_photos';

/** `assets` row shape, filtered to `category = 'band_photos'` (see
 * phase9_collaborative_band_photos_rls). Any signed-in band member may add
 * a photo; only its author or an admin may edit/delete it — enforced by
 * RLS on both the `assets` table and the `assets` storage bucket, not just
 * here. */
interface AssetRow {
  id: string;
  name: string;
  storage_bucket: string;
  storage_path: string;
  category: string;
  status: string;
  metadata: {
    authorId?: string;
    authorName?: string;
    notes?: string;
    tags?: string[];
    width?: number;
    height?: number;
    photoType?: BandPhoto['type'];
  };
  created_at: string;
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] || 'png';
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(header)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

/**
 * Shared, collaborative band photo gallery: photos are global (owner_id
 * NULL, category='band_photos') — any signed-in band member can add one;
 * only its author or an admin can edit/delete it. Binary bytes live in the
 * `assets` Storage bucket; `dataUrl` here is a long-lived signed URL to
 * that object, matching the old Firestore-era field name so callers don't
 * need to change.
 */
class PhotoService {
  private photos: BandPhoto[] = [];
  private subscribers: Set<PhotoCallback> = new Set();
  private realtimeChannel: RealtimeChannel | null = null;

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

  private async rowToPhoto(row: AssetRow): Promise<BandPhoto> {
    const signedUrl = await fileUrlService.getOne(row.storage_bucket, row.storage_path);
    return {
      id: row.id,
      title: row.name,
      dataUrl: signedUrl || '',
      type: row.metadata.photoType || 'upload',
      authorId: row.metadata.authorId || '',
      authorName: row.metadata.authorName || 'Člen',
      createdAt: new Date(row.created_at).getTime(),
      notes: row.metadata.notes || '',
      tags: row.metadata.tags || [],
      width: row.metadata.width,
      height: row.metadata.height,
    };
  }

  private async fetchAll() {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('category', CATEGORY)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[photoService] Failed to load photos:', error.message);
      return;
    }
    this.photos = await Promise.all((data as AssetRow[]).map((row) => this.rowToPhoto(row)));
    this.notify();
  }

  public async init() {
    await this.fetchAll();

    this.realtimeChannel = supabase
      .channel('band-photos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets', filter: `category=eq.${CATEGORY}` }, () => {
        this.fetchAll();
      })
      .subscribe();
  }

  public async savePhoto(photo: Partial<BandPhoto> & { title: string; dataUrl: string }): Promise<BandPhoto> {
    if (!authService.isAuthenticated()) {
      throw new Error('Pro přidání fotky musíte být přihlášeni.');
    }
    const user = authService.getCurrentUser();
    const { blob, mime } = dataUrlToBlob(photo.dataUrl);
    const assetId = crypto.randomUUID();
    const storagePath = `global/${CATEGORY}/${assetId}.${extFromMime(mime)}`;

    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, blob, {
      contentType: mime,
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    const { data, error } = await supabase
      .from('assets')
      .insert({
        id: assetId,
        owner_id: null,
        name: photo.title || 'Fotografie kapely',
        original_filename: photo.title || null,
        mime_type: mime,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        asset_type: 'image',
        category: CATEGORY,
        status: 'active',
        metadata: {
          authorId: photo.authorId || user?.id || '',
          authorName: photo.authorName || user?.displayName || 'Člen',
          notes: photo.notes || '',
          tags: photo.tags || [],
          width: photo.width,
          height: photo.height,
          photoType: photo.type || 'upload',
        },
      })
      .select()
      .single();

    if (error || !data) {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      throw new Error(error?.message || 'Nepodařilo se uložit fotku.');
    }

    const newPhoto = await this.rowToPhoto(data as AssetRow);
    this.photos = [newPhoto, ...this.photos];
    this.notify();
    return newPhoto;
  }

  public async updatePhoto(photoId: string, updates: Partial<BandPhoto>) {
    if (!authService.isAuthenticated()) {
      console.warn('[photoService] Cannot update photo while signed out.');
      return;
    }
    const existing = this.photos.find((p) => p.id === photoId);
    if (!existing) return;

    const { data: row } = await supabase.from('assets').select('*').eq('id', photoId).single();
    if (!row) return;

    const nextMetadata = {
      ...(row as AssetRow).metadata,
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
    };

    const { error } = await supabase
      .from('assets')
      .update({
        ...(updates.title !== undefined ? { name: updates.title } : {}),
        metadata: nextMetadata,
      })
      .eq('id', photoId);

    if (error) {
      console.warn('[photoService] Failed to update photo:', error.message);
      return;
    }

    const updated = { ...existing, ...updates };
    this.photos = this.photos.map((p) => (p.id === photoId ? updated : p));
    this.notify();
  }

  public async deletePhoto(photoId: string) {
    if (!authService.isAuthenticated()) {
      console.warn('[photoService] Cannot delete photo while signed out.');
      return;
    }
    const { data: row } = await supabase.from('assets').select('storage_bucket, storage_path').eq('id', photoId).single();

    const { error } = await supabase.from('assets').delete().eq('id', photoId);
    if (error) {
      console.warn('[photoService] Failed to delete photo:', error.message);
      return;
    }
    if (row) {
      await supabase.storage.from(row.storage_bucket).remove([row.storage_path]);
    }
    this.photos = this.photos.filter((p) => p.id !== photoId);
    this.notify();
  }
}

export const photoService = new PhotoService();
