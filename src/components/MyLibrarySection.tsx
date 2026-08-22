import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  Trash2,
  Download,
  Pencil,
  Check,
  X,
  Globe2,
  User as UserIcon,
  Loader2,
  AlertCircle,
  FolderOpen,
  LogIn,
} from 'lucide-react';
import { UserAccount } from '../types';
import { assetLibraryService, ASSET_CATEGORIES, LibraryAsset } from '../services/assetLibraryService';

interface MyLibrarySectionProps {
  currentUser: UserAccount | null;
  onOpenLoginModal: () => void;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MyLibrarySection: React.FC<MyLibrarySectionProps> = ({ currentUser, onOpenLoginModal }) => {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine' | 'global'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [hledat, setHledat] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>(ASSET_CATEGORIES[0].value);
  const [uploadAsGlobal, setUploadAsGlobal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.role === 'admin';

  const loadAssets = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const owner = ownerFilter === 'all' ? undefined : ownerFilter;
      const data = await assetLibraryService.list({ owner, category: categoryFilter || undefined });
      setAssets(data);
    } catch (e: any) {
      setError(e.message || 'Nepodařilo se načíst knihovnu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, ownerFilter, categoryFilter]);

  /**
   * Hledá se v už načteném seznamu, ne dalším dotazem do databáze —
   * odezva je pak okamžitá při psaní. Porovnává se bez diakritiky, aby
   * „nohavica" našlo i „Nohavicu", a kromě názvu i původní jméno souboru:
   * hromadně nahrané věci mívají v názvu pořadové číslo, které si člověk
   * nepamatuje, ale příponu nebo kus filenamu ano.
   */
  const bezDiakritiky = (t: string) =>
    t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const dotaz = bezDiakritiky(hledat.trim());
  const zobrazene = dotaz
    ? assets.filter((a) =>
        bezDiakritiky(
          `${a.name} ${a.original_filename || ''} ${a.category} ${a.mime_type || ''}`
        ).includes(dotaz)
      )
    : assets;

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-4 p-4 sm:p-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 flex items-center justify-center">
          <FolderOpen className="w-8 h-8 text-[#FF9F0A]" />
        </div>
        <h2 className="text-lg font-bold text-white">Moje knihovna vyžaduje přihlášení</h2>
        <p className="text-sm text-neutral-400">
          Nahrávejte a spravujte vlastní samply, nahrávky, MIDI, Guitar Pro soubory, noty a další materiály — přihlaste se pro přístup.
        </p>
        <button
          onClick={onOpenLoginModal}
          className="inline-flex items-center gap-2 bg-[#FF9F0A] hover:bg-[#ffb03a] text-black font-bold px-5 py-2.5 rounded-xl text-sm cursor-pointer transition-all"
        >
          <LogIn className="w-4 h-4" />
          <span>Přihlásit se</span>
        </button>
      </div>
    );
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      const categoryDef = ASSET_CATEGORIES.find((c) => c.value === uploadCategory) || ASSET_CATEGORIES[0];
      await assetLibraryService.upload(file, categoryDef.value, categoryDef.assetType, uploadAsGlobal ? 'global' : 'private');
      await loadAssets();
    } catch (e: any) {
      setError(e.message || 'Upload selhal.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (asset: LibraryAsset) => {
    const url = await assetLibraryService.getDownloadUrl(asset.id);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setError('Nepodařilo se získat odkaz ke stažení.');
  };

  const handleDelete = async (asset: LibraryAsset) => {
    if (!confirm(`Opravdu smazat "${asset.name}"?`)) return;
    try {
      await assetLibraryService.remove(asset.id);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (e: any) {
      setError(e.message || 'Nepodařilo se smazat asset.');
    }
  };

  const startRename = (asset: LibraryAsset) => {
    setRenamingId(asset.id);
    setRenameValue(asset.name);
  };

  const submitRename = async (asset: LibraryAsset) => {
    const newName = renameValue.trim();
    setRenamingId(null);
    if (!newName || newName === asset.name) return;
    try {
      const updated = await assetLibraryService.rename(asset.id, newName);
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? updated : a)));
    } catch (e: any) {
      setError(e.message || 'Nepodařilo se přejmenovat asset.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 p-4 sm:p-6">
      {/* Header + Upload */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 rounded-2xl">
            <FolderOpen className="w-6 h-6 text-[#FF9F0A]" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight">Moje knihovna</h2>
            <p className="text-xs text-neutral-400">
              Vlastní samply, nahrávky, MIDI, Guitar Pro, noty a další soubory — uložené bezpečně v cloudu.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <select
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value)}
            className="bg-black/40 text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/10 outline-none cursor-pointer focus:border-[#FF9F0A]"
          >
            {ASSET_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>

          {isAdmin && (
            <label className="flex items-center gap-1.5 text-xs text-neutral-300 font-semibold bg-black/40 px-3 py-2 rounded-xl border border-white/10 cursor-pointer">
              <input
                type="checkbox"
                checked={uploadAsGlobal}
                onChange={(e) => setUploadAsGlobal(e.target.checked)}
                className="accent-[#FF9F0A]"
              />
              <span>Nahrát jako globální (pro všechny)</span>
            </label>
          )}

          <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 bg-[#FF9F0A] hover:bg-[#ffb03a] disabled:opacity-60 disabled:cursor-wait text-black font-bold px-4 py-2 rounded-xl text-xs cursor-pointer transition-all"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            <span>{isUploading ? 'Nahrávám…' : 'Nahrát soubor'}</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-2xl text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl border border-white/10">
          {(['all', 'mine', 'global'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setOwnerFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                ownerFilter === f ? 'bg-white/15 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'Vše' : f === 'mine' ? 'Moje' : 'Globální'}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={hledat}
          onChange={(e) => setHledat(e.target.value)}
          placeholder="Hledat v knihovně…"
          className="flex-1 min-w-[180px] bg-black/40 text-white text-xs font-medium px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-[#FF9F0A] placeholder:text-neutral-500"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-black/40 text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/10 outline-none cursor-pointer focus:border-[#FF9F0A]"
        >
          <option value="">Všechny kategorie</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Asset list */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-4 sm:p-5 shadow-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-neutral-400 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Načítám…
          </div>
        ) : zobrazene.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-sm">
            {dotaz
              ? `Pro „${hledat.trim()}" se nic nenašlo — z ${assets.length} souborů.`
              : 'Zatím žádné soubory. Nahrajte první výše.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {zobrazene.map((asset) => {
              const categoryDef = ASSET_CATEGORIES.find((c) => c.value === asset.category);
              const isOwner = asset.owner_id === currentUser.id;
              const canManage = isOwner || isAdmin;

              return (
                <div
                  key={asset.id}
                  className="bg-black/40 border border-white/10 rounded-2xl p-3.5 space-y-2.5 hover:border-white/20 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{categoryDef?.icon || '📁'}</span>
                      {renamingId === asset.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(asset);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="bg-black/60 border border-[#FF9F0A]/50 rounded-lg px-2 py-1 text-xs text-white outline-none w-full"
                        />
                      ) : (
                        <span className="text-sm font-bold text-white truncate" title={asset.name}>
                          {asset.name}
                        </span>
                      )}
                    </div>
                    {asset.owner_id === null ? (
                      <span title="Globální" className="shrink-0 text-[#30D158]">
                        <Globe2 className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span title="Soukromé" className="shrink-0 text-neutral-500">
                        <UserIcon className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] text-neutral-500 flex items-center justify-between font-mono">
                    <span>{categoryDef?.label || asset.category}</span>
                    <span>{formatBytes(asset.size_bytes)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => handleDownload(asset)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 text-[11px] font-bold py-1.5 rounded-lg cursor-pointer transition-all"
                    >
                      <Download className="w-3.5 h-3.5" /> Stáhnout
                    </button>
                    {canManage &&
                      (renamingId === asset.id ? (
                        <>
                          <button
                            onClick={() => submitRename(asset)}
                            className="p-1.5 bg-[#30D158]/15 hover:bg-[#30D158]/25 text-[#30D158] rounded-lg cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setRenamingId(null)}
                            className="p-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startRename(asset)}
                            className="p-1.5 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg cursor-pointer"
                            title="Přejmenovat"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(asset)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg cursor-pointer"
                            title="Smazat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
