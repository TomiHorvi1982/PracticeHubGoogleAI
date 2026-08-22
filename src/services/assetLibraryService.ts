import { supabase } from './supabaseClient';
import { authService } from './authService';

/** Mirrors the `assets` table (see docs/migration Phase 2/6). */
export interface LibraryAsset {
  id: string;
  owner_id: string | null;
  name: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_bucket: string;
  storage_path: string;
  asset_type: 'audio' | 'sample' | 'stem' | 'midi' | 'guitar_pro' | 'pdf' | 'image' | 'preset' | 'recording';
  category: string;
  status: 'pending' | 'active' | 'deleted';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AssetCategoryOption {
  value: string;
  label: string;
  assetType: LibraryAsset['asset_type'];
  icon: string;
}

/** What the "My Library" UI lets you upload today — matches the storage_path
 * convention from docs/migration (Phase 5): global/{category}/... or
 * users/{id}/{category}/... */
export const ASSET_CATEGORIES: AssetCategoryOption[] = [
  { value: 'recordings', label: 'Nahrávky', assetType: 'recording', icon: '🎙️' },
  { value: 'backing_tracks', label: 'Backing tracky', assetType: 'audio', icon: '🎵' },
  { value: 'samples', label: 'Samply', assetType: 'sample', icon: '🥁' },
  { value: 'midi', label: 'MIDI', assetType: 'midi', icon: '🎹' },
  { value: 'guitar_pro', label: 'Guitar Pro', assetType: 'guitar_pro', icon: '🎸' },
  { value: 'pdf', label: 'PDF / Noty', assetType: 'pdf', icon: '📄' },
  { value: 'images', label: 'Obrázky', assetType: 'image', icon: '🖼️' },
  { value: 'presets', label: 'Presety', assetType: 'preset', icon: '⚙️' },
];

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = authService.getCurrentSession()?.token;
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

class AssetLibraryService {
  /**
   * Vrátí jen jednu stránku knihovny.
   *
   * Hledá a stránkuje databáze, ne prohlížeč — knihovna má desetitisíce
   * položek a stahovat je celé by při každém otevření trvalo věčnost.
   * `total` říká, kolik jich dotazu odpovídá celkem, aby šlo napsat
   * „zobrazeno 200 z 21 698" místo tichého useknutí.
   */
  public async list(
    params: { owner?: 'mine' | 'global'; category?: string; search?: string; limit?: number; offset?: number } = {}
  ): Promise<LibraryAsset[]> {
    const { assets } = await this.listPage(params);
    return assets;
  }

  public async listPage(
    params: { owner?: 'mine' | 'global'; category?: string; search?: string; limit?: number; offset?: number } = {}
  ): Promise<{ assets: LibraryAsset[]; total: number }> {
    const qs = new URLSearchParams();
    if (params.owner) qs.set('owner', params.owner);
    if (params.category) qs.set('category', params.category);
    if (params.search) qs.set('search', params.search);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));

    const res = await authorizedFetch(`/api/assets?${qs.toString()}`);
    if (!res.ok) return { assets: [], total: 0 };
    const data = await res.json();
    return { assets: data.assets || [], total: data.total ?? (data.assets || []).length };
  }

  /**
   * Full upload flow: ask the server for a place to put the file (creates
   * the metadata row + a signed upload URL), upload the bytes directly to
   * Supabase Storage (never through our own Express server), then tell the
   * server the upload finished.
   */
  public async upload(
    file: File,
    category: string,
    assetType: LibraryAsset['asset_type'],
    visibility: 'private' | 'global' = 'private'
  ): Promise<LibraryAsset> {
    const initRes = await authorizedFetch('/api/assets/upload-url', {
      method: 'POST',
      body: JSON.stringify({
        name: file.name,
        mime_type: file.type || 'application/octet-stream',
        category,
        asset_type: assetType,
        size_bytes: file.size,
        visibility,
      }),
    });
    const initData = await initRes.json();
    if (!initRes.ok) {
      throw new Error(initData.error || 'Nepodařilo se založit upload.');
    }

    const { asset, bucket, storage_path, upload_token } = initData;

    const { error: uploadError } = await supabase.storage.from(bucket).uploadToSignedUrl(storage_path, upload_token, file);
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const completeRes = await authorizedFetch(`/api/assets/${asset.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ size_bytes: file.size, mime_type: file.type }),
    });
    const completeData = await completeRes.json();
    if (!completeRes.ok) {
      throw new Error(completeData.error || 'Nepodařilo se dokončit upload.');
    }
    return completeData.asset;
  }

  public async remove(id: string): Promise<void> {
    const res = await authorizedFetch(`/api/assets/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Nepodařilo se smazat asset.');
    }
  }

  public async rename(id: string, name: string): Promise<LibraryAsset> {
    const res = await authorizedFetch(`/api/assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Nepodařilo se přejmenovat asset.');
    }
    return data.asset;
  }

  public async getDownloadUrl(id: string): Promise<string | null> {
    const res = await authorizedFetch(`/api/assets/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.download_url || null;
  }
}

export const assetLibraryService = new AssetLibraryService();
