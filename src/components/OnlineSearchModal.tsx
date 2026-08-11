import React, { useState } from 'react';
import { Search, Globe, Plus, Loader2, X, Check, ExternalLink, Music, Sparkles } from 'lucide-react';
import { searchOnlineSongs, OnlineSearchResult } from '../services/onlineSongSearch';
import { Song } from '../types';

interface OnlineSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSongImported: (song: Song) => void;
}

export const OnlineSearchModal: React.FC<OnlineSearchModalProps> = ({
  isOpen,
  onClose,
  onSongImported,
}) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OnlineSearchResult[]>([]);
  const [importedId, setImportedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await searchOnlineSongs(query.trim());
      if (data.length === 0) {
        setError('Pro tento dotaz nebyly nalezeny žádné akordy. Zkuste jiný název nebo vložte přímou URL z freetar.de nebo pisnicky-akordy.cz.');
      } else {
        setResults(data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Vyhledávání selhalo.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSearch = (q: string) => {
    setQuery(q);
    setIsLoading(true);
    setError(null);
    setResults([]);
    searchOnlineSongs(q)
      .then((data) => {
        if (data.length === 0) {
          setError('Nebyly nalezeny žádné výsledky.');
        } else {
          setResults(data);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Vyhledávání selhalo.');
      })
      .finally(() => setIsLoading(false));
  };

  const importSong = (item: OnlineSearchResult) => {
    const newSong: Song = {
      id: 'song_' + Date.now(),
      title: item.title || 'Importovaná Píseň',
      artist: item.artist || 'Neznámý autor',
      key: item.key || 'G',
      content: item.content || '',
      chordsUsed: item.chords || [],
      youtubeVideos: item.youtubeVideos || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notes: item.sourceName
        ? `Importováno online z ${item.sourceName}`
        : 'Importováno online z akordového portálu',
    };

    onSongImported(newSong);
    setImportedId(newSong.id);
    setTimeout(() => {
      onClose();
      setImportedId(null);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 font-mono">
      <div className="bg-[#0F0F0F] border-2 border-[#333] text-[#D1D1D1] max-w-2xl w-full p-5 relative max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-3 border-b border-[#222] pb-2">
          <div className="flex items-center gap-2">
            <span className="bg-[#00FF41] text-black font-black px-2 py-0.5 text-[10px] uppercase">
              ONLINE_API
            </span>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-[#00FF41]" />
              ONLINE HLEDÁNÍ AKORDŮ (FREETAR.DE & PISNICKY-AKORDY.CZ)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#888] hover:text-white hover:bg-[#222]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="space-y-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#666] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ZADEJTE NÁZEV PÍSNĚ NEBO VLOŽTE LINK Z FREETAR.DE / PISNICKY-AKORDY.CZ..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-[#050505] border border-[#222] text-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-[#00FF41] uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="px-4 py-2 bg-[#00FF41] hover:bg-white disabled:opacity-40 text-black font-extrabold text-xs uppercase flex items-center gap-1.5 transition-none shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>NAČÍTÁM...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>VYHLEDAT</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Suggestions / Examples */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-[10px]">
            <span className="text-[#666] uppercase font-bold shrink-0">RYCHLÝ VÝBĚR:</span>
            {[
              'Oasis - Wonderwall',
              'freetar.de',
              'Nedvědi - Stánky',
              'Kabát - Pohoda',
              'Wabi Daněk - Rosa na kolejích',
              'pisnicky-akordy.cz',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleQuickSearch(q)}
                className="px-2 py-0.5 bg-[#141414] hover:bg-[#222] text-[#888] hover:text-white border border-[#222] uppercase whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>
        </form>

        {/* Error Notification */}
        {error && (
          <div className="bg-[#2B0000] border border-[#FF3E00] p-2.5 text-[#FF3E00] text-xs mb-3 font-mono uppercase">
            {error}
          </div>
        )}

        {/* Results / Results Preview */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[250px]">
          {isLoading && (
            <div className="p-8 text-center space-y-3 text-[#888]">
              <Loader2 className="w-8 h-8 text-[#00FF41] animate-spin mx-auto" />
              <p className="text-xs font-mono uppercase">
                PŘIPOJOVÁNÍ K WEBU FREETAR.DE / PISNICKY-AKORDY.CZ A FORMÁTOVÁNÍ AKORDŮ...
              </p>
            </div>
          )}

          {!isLoading && results.length === 0 && !error && (
            <div className="p-8 text-center text-[#555] border border-dashed border-[#222] bg-[#050505]">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#00FF41]" />
              <p className="text-xs uppercase font-bold text-[#888]">
                VYHLEDEJTE PÍSNIČKU NEBO VLOŽTE URL ADRESU S AKORDY
              </p>
              <p className="text-[10px] text-[#555] mt-1">
                Aplikace automaticky stáhne text, vytáhne akordy do [Akord] formátu a uloží přímo do vašeho zpěvníku.
              </p>
            </div>
          )}

          {results.map((song, idx) => (
            <div
              key={idx}
              className="bg-[#050505] border border-[#222] hover:border-[#00FF41] p-4 space-y-3 transition-none"
            >
              {/* Song Title & Meta Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1A1A1A] pb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black text-white uppercase">{song.title}</h3>
                    <span className="text-[10px] font-bold text-[#00FF41] bg-[#002B0E] px-2 py-0.5 border border-[#00FF41]/40 uppercase">
                      TÓNINA: {song.key}
                    </span>
                    {song.youtubeVideos && song.youtubeVideos.length > 0 && (
                      <span className="text-[10px] font-black text-white bg-[#FF0000] px-2 py-0.5 border border-black uppercase flex items-center gap-1">
                        🎬 YOUTUBE ({song.youtubeVideos.length} KLIPŮ / BACKING TRACK)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#888] uppercase mt-0.5">{song.artist}</p>
                </div>

                {/* Import Action Button */}
                <button
                  onClick={() => importSong(song)}
                  className={`px-4 py-2 font-extrabold text-xs uppercase flex items-center gap-1.5 border transition-none shrink-0 ${
                    importedId
                      ? 'bg-[#002B0E] border-[#00FF41] text-[#00FF41]'
                      : 'bg-[#FF3E00] hover:bg-white text-black border-black'
                  }`}
                >
                  {importedId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>{importedId ? 'ULOŽENO DO ZPĚVNÍKU!' : 'ULOŽIT DO ZPĚVNÍKU'}</span>
                </button>
              </div>

              {/* Source Tag */}
              {song.sourceName && (
                <div className="flex items-center gap-1 text-[10px] text-[#666]">
                  <ExternalLink className="w-3 h-3 text-[#00FF41]" />
                  <span>ZDROJ: {song.sourceName}</span>
                  {song.sourceUrl && (
                    <a
                      href={song.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#888] hover:text-[#00FF41] underline ml-1 truncate max-w-xs"
                    >
                      {song.sourceUrl}
                    </a>
                  )}
                </div>
              )}

              {/* Lyrics Preview */}
              <div className="bg-[#0A0A0A] p-3 border border-[#1A1A1A] max-h-48 overflow-y-auto text-xs font-mono text-[#AAA] whitespace-pre-wrap leading-relaxed">
                {song.content}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};
