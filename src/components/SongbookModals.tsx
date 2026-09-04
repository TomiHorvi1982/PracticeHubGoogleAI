import React, { useState } from 'react';
import { Song } from '../types';
import { ListPlus, Check, X, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { playlistService } from '../services/playlistService';

interface AddToPlaylistModalProps {
  isOpen: boolean;
  song: Song | null;
  playlists: { id: string; name: string; songIds: string[] }[];
  onClose: () => void;
  onToggleSongInPlaylist: (playlistId: string, songId: string) => void;
  onCreateNewPlaylist: (name: string) => void;
  onAddedSuccessToast: (msg: string) => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  isOpen,
  song,
  playlists,
  onClose,
  onToggleSongInPlaylist,
  onCreateNewPlaylist,
  onAddedSuccessToast,
}) => {
  const [newPlName, setNewPlName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  if (!isOpen || !song) return null;

  const handleAddGlobalAudio = () => {
    playlistService.addItem({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      youtubeId: song.youtubeVideos?.[0]?.id || '',
    });
    onAddedSuccessToast(`Skladba "${song.title}" byla přidána do globálního audio přehrávače.`);
    onClose();
  };

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlName.trim()) return;
    onCreateNewPlaylist(newPlName.trim());
    setNewPlName('');
    setShowNewInput(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-[#1C1C1E] border border-white/15 text-white max-w-md w-full p-6 rounded-3xl shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-znacka" />
            <h3 className="font-bold text-sm text-white">Přidat skladbu do playlistu</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs space-y-1">
          <p className="font-semibold text-white">{song.title}</p>
          <p className="text-neutral-400">{song.artist}</p>
        </div>

        {/* Global Player Quick Add */}
        <button
          onClick={handleAddGlobalAudio}
          className="w-full p-3 bg-znacka/15 hover:bg-znacka/25 border border-znacka/30 text-white rounded-2xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer"
        >
          <span>🎵 Hlavní Audio Přehrávač</span>
          <Plus className="w-4 h-4 text-znacka" />
        </button>

        {/* Local Setlists List */}
        <div className="space-y-2 pt-2">
          <span className="text-drobne font-bold uppercase tracking-wider text-neutral-400 block">
            Moje setlisty a playlisty:
          </span>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {playlists
              .filter((p) => p.id !== 'all')
              .map((pl) => {
                const isIncluded = pl.songIds.includes(song.id);
                return (
                  <button
                    key={pl.id}
                    onClick={() => {
                      onToggleSongInPlaylist(pl.id, song.id);
                      onAddedSuccessToast(
                        isIncluded
                          ? `Odebráno z playlistu "${pl.name}"`
                          : `Přidáno do playlistu "${pl.name}"`
                      );
                    }}
                    className={`w-full p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      isIncluded
                        ? 'bg-uspech/15 border-uspech/40 text-uspech'
                        : 'bg-white/[0.04] border-white/[0.08] text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    <span>{pl.name}</span>
                    {isIncluded ? <Check className="w-4 h-4 text-uspech" /> : <Plus className="w-4 h-4 text-neutral-400" />}
                  </button>
                );
              })}
          </div>
        </div>

        {/* Create new playlist input */}
        {showNewInput ? (
          <form onSubmit={handleCreateAndAdd} className="flex gap-1.5 pt-2">
            <input
              type="text"
              placeholder="Název nového playlistu..."
              value={newPlName}
              onChange={(e) => setNewPlName(e.target.value)}
              className="flex-1 bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-znacka"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-znacka text-black font-bold text-xs rounded-xl cursor-pointer"
            >
              Vytvořit
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowNewInput(true)}
            className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-znacka" /> Vytvořit nový playlist
          </button>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold"
          >
            Hotovo
          </button>
        </div>
      </div>
    </div>
  );
};

interface DeleteSongConfirmModalProps {
  isOpen: boolean;
  song: Song | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteSongConfirmModal: React.FC<DeleteSongConfirmModalProps> = ({
  isOpen,
  song,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !song) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#1C1C1E] border border-red-500/30 text-white max-w-md w-full p-6 rounded-3xl shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Smazat skladbu ze zpěvníku</h3>
              <p className="text-drobne text-neutral-400">Tato akce je nevratná</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] p-3.5 rounded-2xl space-y-1">
          <p className="font-bold text-sm text-white">{song.title}</p>
          <p className="text-xs text-neutral-400">{song.artist || 'Neznámý interpret'}</p>
          {song.tuning && (
            <p className="text-stitek text-neutral-500 font-mono pt-1">🎸 Ladění: {song.tuning}</p>
          )}
        </div>

        <p className="text-xs text-neutral-300 leading-relaxed">
          Opravdu chcete tuto skladbu trvale smazat? Skladba bude odebrána ze zpěvníku, z knihovny i ze všech vytvořených playlistů.
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Smazat skladbu</span>
          </button>
        </div>
      </div>
    </div>
  );
};

