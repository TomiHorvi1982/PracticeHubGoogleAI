import { authService } from './authService';
import { UzelStromu } from './knihovnaStrom';

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
  subcategory?: string | null;
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
    params: Parameters<AssetLibraryService['listPage']>[0] = {}
  ): Promise<LibraryAsset[]> {
    const { assets } = await this.listPage(params);
    return assets;
  }

  public async listPage(
    params: {
      owner?: 'mine' | 'global';
      category?: string;
      subcategory?: string;
      search?: string;
      limit?: number;
      offset?: number;
      sort?: 'name' | 'created';
    } = {}
  ): Promise<{ assets: LibraryAsset[]; total: number }> {
    const qs = new URLSearchParams();
    if (params.owner) qs.set('owner', params.owner);
    if (params.category) qs.set('category', params.category);
    if (params.subcategory) qs.set('subcategory', params.subcategory);
    if (params.search) qs.set('search', params.search);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    if (params.sort) qs.set('sort', params.sort);

    const res = await authorizedFetch(`/api/assets?${qs.toString()}`);
    if (!res.ok) return { assets: [], total: 0 };
    const data = await res.json();
    return { assets: data.assets || [], total: data.total ?? (data.assets || []).length };
  }

  /**
   * Nahrání souboru do knihovny.
   *
   * Dva kroky: server nejdřív založí řádek v katalogu a řekne, kam bajty
   * poslat, pak se pošlou. Rozdělení na dva kroky znamená, že po neúspěchu
   * zůstane záznam ve stavu `pending` — ten jde najít a uklidit, kdežto
   * soubor bez záznamu by v úložišti ležel navždy a nikdo by o něm nevěděl.
   *
   * Bajty jdou přes náš server do R2. Přímo do úložiště by to bylo o hop
   * kratší, ale prohlížeč cizí původ bez povoleného CORS odmítne — a to
   * je nastavení u Cloudflare, ne v kódu.
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

    const token = authService.getCurrentSession()?.token;
    const putRes = await fetch(initData.upload_endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
    const putData = await putRes.json().catch(() => ({}));
    if (!putRes.ok) {
      throw new Error(putData.error || 'Nahrání souboru selhalo.');
    }
    return putData.asset;
  }

  /** Strom knihovny: kolik souborů a místa je v které složce. */
  public async strom(): Promise<UzelStromu[]> {
    const res = await authorizedFetch('/api/assets-strom');
    if (!res.ok) return [];
    const d = await res.json();
    return d.uzly || [];
  }

  /**
   * Přeřadí soubor do jiné složky.
   *
   * `null` v podkategorii znamená „zpátky na hromádku nezařazených" —
   * to je platný stav, ne chyba, takže se posílá i on.
   */
  public async prerad(
    id: string,
    zmena: { category?: string; subcategory?: string | null }
  ): Promise<LibraryAsset | null> {
    const res = await authorizedFetch(`/api/assets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(zmena),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Přeřazení se nepovedlo.');
    return d.asset || null;
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

  /**
   * Podepsaná adresa souboru.
   *
   * Neúspěch vyhodí chybu i s důvodem. Dřív se vracelo `null` na všechno —
   * na chybějící přihlášení, smazaný soubor i nedostupné úložiště — a
   * volající pak neměl co ukázat, takže náhled zůstal viset na „připravuji“.
   */
  public async getDownloadUrl(id: string): Promise<string | null> {
    const res = await authorizedFetch(`/api/assets/${id}`);
    if (!res.ok) {
      const duvod =
        res.status === 401 ? 'nejste přihlášeni'
        : res.status === 403 ? 'k souboru nemáte přístup'
        : res.status === 404 ? 'soubor v knihovně není'
        : `server vrátil ${res.status}`;
      throw new Error(`Soubor se nepodařilo získat — ${duvod}.`);
    }
    const data = await res.json();
    if (!data.download_url) {
      throw new Error('Úložiště k souboru nevrátilo odkaz — možná chybí v R2.');
    }
    return data.download_url;
  }
}

export const assetLibraryService = new AssetLibraryService();

/**
 * Adresa, ze které se dá soubor stáhnout přes `fetch`.
 *
 * Podává ho náš server, ne přímo R2. Podepsaný odkaz do R2 vede na cizí
 * doménu a prohlížeč na ni `fetch` pustí jen s povoleným původem — ten se
 * musí do nastavení bucketu dopsat pro každou adresu zvlášť, včetně
 * náhodných portů vývojového serveru. Přes vlastní server jde o stejný
 * původ, takže tenhle problém nevzniká.
 *
 * Pro `<img>`, `<iframe>` a `<audio>` se dál hodí podepsaný odkaz —
 * ty cizí původ neřeší a ušetří se tím přenos přes server.
 */
export async function nactiObsahJakoUrl(assetId: string): Promise<string> {
  const res = await authorizedFetch(`/api/assets/${assetId}/content`);
  if (!res.ok) {
    const duvod =
      res.status === 401 ? 'nejste přihlášeni'
      : res.status === 403 ? 'k souboru nemáte přístup'
      : res.status === 404 ? 'soubor v knihovně není'
      : `server vrátil ${res.status}`;
    throw new Error(`Soubor se nepodařilo načíst — ${duvod}.`);
  }
  // Blob adresa patří téhle stránce, takže ji přečte `fetch`, `<iframe>`,
  // `<img>` i `<audio>` bez dalšího přihlašování. Volající ji musí po
  // dokončení uvolnit přes `URL.revokeObjectURL`, jinak zůstane v paměti.
  return URL.createObjectURL(await res.blob());
}

/**
 * Adresa a hlavičky pro stažení obsahu přes náš server.
 *
 * Pro volající, kteří si `fetch` dělají sami a blob adresu nepotřebují.
 */
export function contentRequest(assetId: string): { adresa: string; hlavicky: Record<string, string> } {
  const token = authService.getCurrentSession()?.token;
  return {
    adresa: `/api/assets/${assetId}/content`,
    hlavicky: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

/**
 * Stáhne přílohu z úložiště a vrátí ji jako blob adresu.
 *
 * Přílohy písní dostávají podepsaný odkaz přímo do R2. Ten prohlížeč pro
 * `fetch` blokuje jako cizí původ, takže přehrávač tabulatur i MIDI hlásily
 * „Failed to fetch" nad souborem, který v úložišti v pořádku leží. Tudy jdou
 * bajty přes náš server a výsledek patří téhle stránce.
 *
 * Volající musí adresu po dokončení uvolnit přes `URL.revokeObjectURL`.
 */
export async function nactiPrilohuJakoUrl(bucket: string, path: string): Promise<string> {
  const res = await authorizedFetch(
    `/api/files/content?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`
  );
  if (!res.ok) {
    throw new Error(
      res.status === 401 ? 'Nejste přihlášeni.' : `Soubor se nepodařilo načíst (HTTP ${res.status}).`
    );
  }
  return URL.createObjectURL(await res.blob());
}
