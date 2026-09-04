import React, { useState } from 'react';
import { PlaylistItem, Song, UserAccount } from '../types';
import { searchYouTubeDirect } from '../services/onlineSongSearch';
import {
  Play, Pause, Plus, Trash2, ArrowUp, ArrowDown, Search, Youtube,
  Music, Sparkles, Radio, ListMusic, Shuffle, Repeat, AlertCircle, Link as LinkIcon, X
} from 'lucide-react';

interface PlaylistSectionProps {
  playlist: PlaylistItem[];
  currentTrackIndex: number;
  isPlaying: boolean;
  onSelectTrackIndex: (index: number) => void;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  playbackMode: 'normal' | 'loop-one' | 'loop-all' | 'shuffle';
  onChangePlaybackMode: (mode: 'normal' | 'loop-one' | 'loop-all' | 'shuffle') => void;
  onAddItem: (item: Partial<PlaylistItem>) => void;
  onRemoveItem: (id: string) => void;
  onReorderItems: (items: PlaylistItem[]) => void;
  songs: Song[];
  currentUser: UserAccount | null;
}

export const PlaylistSection: React.FC<PlaylistSectionProps> = ({
  playlist,
  currentTrackIndex,
  isPlaying,
  onSelectTrackIndex,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  playbackMode,
  onChangePlaybackMode,
  onAddItem,
  onRemoveItem,
  onReorderItems,
  songs,
  currentUser,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [isUrlAddOpen, setIsUrlAddOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');
  const [urlAddError, setUrlAddError] = useState<string | null>(null);

  const [isSongbookPickerOpen, setIsSongbookPickerOpen] = useState(false);

  const extractYouTubeId = (input: string): string | null => {
    if (!input) return null;
    const clean = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
    const match =
      clean.match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/) ||
      clean.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const results = await searchYouTubeDirect(searchQuery.trim());
      if (results.length === 0) {
        setSearchError('Nebyly nalezeny žádné výsledky. Zkuste jiná klíčová slova.');
      } else {
        setSearchResults(results);
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Vyhledávání na YouTube selhalo.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSearchResult = (video: any, playImmediately = false) => {
    const newItem: Partial<PlaylistItem> = {
      youtubeId: video.id,
      title: video.title,
      artist: video.artist || '',
      thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
      duration: '3:30',
      addedBy: currentUser?.id || 'anonymous',
      addedByName: currentUser?.displayName || 'Člen kapely',
    };
    onAddItem(newItem);

    if (playImmediately) {
      setTimeout(() => {
        onSelectTrackIndex(playlist.length);
        if (!isPlaying) onTogglePlay();
      }, 100);
    }
  };

  const handleAddManualUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlAddError(null);

    const vidId = extractYouTubeId(manualUrl);
    if (!vidId) {
      setUrlAddError('Zadejte platnou YouTube URL nebo 11-místné ID videa.');
      return;
    }

    const newItem: Partial<PlaylistItem> = {
      youtubeId: vidId,
      title: manualTitle.trim() || `YouTube Video (${vidId})`,
      artist: manualArtist.trim() || '',
      thumbnail: `https://img.youtube.com/vi/${vidId}/mqdefault.jpg`,
      duration: '3:30',
      addedBy: currentUser?.id || 'anonymous',
      addedByName: currentUser?.displayName || 'Člen kapely',
    };

    onAddItem(newItem);
    setManualUrl('');
    setManualTitle('');
    setManualArtist('');
    setIsUrlAddOpen(false);
  };

  const handleAddFromSong = (song: Song) => {
    const ytId = song.youtubeVideos && song.youtubeVideos.length > 0 ? song.youtubeVideos[0].id : null;
    if (!ytId) {
      alert(`Píseň "${song.title}" nemá uložené žádné YouTube video. Přidejte video nejdříve v sekci Song Library.`);
      return;
    }

    const newItem: Partial<PlaylistItem> = {
      youtubeId: ytId,
      title: song.title,
      artist: song.artist,
      thumbnail: `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`,
      songId: song.id,
      duration: '3:30',
      addedBy: currentUser?.id || 'anonymous',
      addedByName: currentUser?.displayName || 'Člen kapely',
    };

    onAddItem(newItem);
    setIsSongbookPickerOpen(false);
  };

  const handleMoveUp = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index === 0) return;
    const newItems = [...playlist];
    const temp = newItems[index];
    newItems[index] = newItems[index - 1];
    newItems[index - 1] = temp;
    onReorderItems(newItems);
  };

  const handleMoveDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index === playlist.length - 1) return;
    const newItems = [...playlist];
    const temp = newItems[index];
    newItems[index] = newItems[index + 1];
    newItems[index + 1] = temp;
    onReorderItems(newItems);
  };

  return (
    <div className="w-full space-y-4 font-sans pb-16">
      
      {/* Top Header Banner */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="bg-znacka text-black font-semibold px-2 py-0.5 text-stitek rounded-md uppercase tracking-wide">
                Společný Playlist
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Kapelní Playlist & Přehrávač
            </h1>
            <p className="text-xs text-neutral-400 mt-1 max-w-xl">
              Přehrává se automaticky bez přerušení i při přepínání záložek. Synchronizováno pro celou kapelu.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setIsSearchOpen(true);
                setIsUrlAddOpen(false);
                setIsSongbookPickerOpen(false);
              }}
              className="bg-znacka hover:bg-znacka/90 text-black font-semibold px-3.5 py-2 text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Hledat na YouTube</span>
            </button>

            <button
              onClick={() => {
                setIsUrlAddOpen(true);
                setIsSearchOpen(false);
                setIsSongbookPickerOpen(false);
              }}
              className="bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.08] px-3.5 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5 text-znacka" />
              <span>Vložit odkaz</span>
            </button>

            <button
              onClick={() => {
                setIsSongbookPickerOpen(true);
                setIsSearchOpen(false);
                setIsUrlAddOpen(false);
              }}
              className="bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white border border-white/[0.08] px-3.5 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-uspech" />
              <span>Ze zpěvníku</span>
            </button>
          </div>
        </div>

        {/* Live Band Broadcast & Mode Bar */}
        <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Playback Mode Selectors */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.06]">
            <span className="text-drobne text-neutral-400 font-medium px-2">Režim:</span>
            
            <button
              onClick={() => onChangePlaybackMode('normal')}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                playbackMode === 'normal'
                  ? 'bg-white/20 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              V pořadí
            </button>
            <button
              onClick={() => onChangePlaybackMode('loop-all')}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                playbackMode === 'loop-all'
                  ? 'bg-znacka text-black font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span>Smyčka vše</span>
            </button>
            <button
              onClick={() => onChangePlaybackMode('loop-one')}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                playbackMode === 'loop-one'
                  ? 'bg-znacka text-black font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Repeat className="w-3 h-3" />
              <span>Smyčka 1</span>
            </button>
            <button
              onClick={() => onChangePlaybackMode('shuffle')}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                playbackMode === 'shuffle'
                  ? 'bg-uspech text-black font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Shuffle className="w-3 h-3" />
              <span>Náhodně</span>
            </button>
          </div>

          {/* Stats & Live Status */}
          <div className="flex items-center gap-4 text-neutral-400 text-xs">
            <div className="flex items-center gap-1.5">
              <ListMusic className="w-3.5 h-3.5 text-znacka" />
              <span>Celkem: <strong className="text-white">{playlist.length} skladeb</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-uspech animate-pulse" />
              <span>Synchronizace: <strong className="text-uspech">Aktivní</strong></span>
            </div>
          </div>

        </div>
      </div>

      {/* SEARCH ON YOUTUBE MODAL / DRAWER */}
      {isSearchOpen && (
        <div className="bg-plocha-2 border border-white/15 rounded-3xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-chyba" />
              <span className="text-white font-semibold text-xs uppercase tracking-wider">
                Vyhledávání na YouTube
              </span>
            </div>
            <button
              onClick={() => setIsSearchOpen(false)}
              className="text-neutral-400 hover:text-white text-xs p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zadejte název písničky nebo interpreta..."
              className="flex-1 bg-black/60 border border-white/10 text-white rounded-2xl px-4 py-2.5 text-xs focus:outline-none focus:border-znacka"
              autoFocus
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="bg-znacka hover:bg-znacka/90 disabled:opacity-50 text-black font-semibold px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isSearching ? 'Hledám...' : 'Hledat'}</span>
            </button>
          </form>

          {searchError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {/* Results list */}
          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              <div className="text-xs text-neutral-400 font-medium">Nalezeno {searchResults.length} výsledků:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {searchResults.map((video) => (
                  <div
                    key={video.id}
                    className="bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] rounded-2xl p-2.5 flex items-center justify-between gap-3 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-16 h-11 object-cover rounded-xl shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{video.title}</div>
                        <div className="text-stitek text-neutral-400 truncate">{video.artist || 'YouTube Video'}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddSearchResult(video)}
                      className="px-2.5 py-1.5 bg-white/10 hover:bg-znacka hover:text-black text-white text-xs font-medium rounded-xl shrink-0 transition-all cursor-pointer"
                    >
                      + Přidat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANUAL URL ADD MODAL */}
      {isUrlAddOpen && (
        <form onSubmit={handleAddManualUrl} className="bg-plocha-2 border border-white/15 rounded-3xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-znacka" />
              <span className="text-white font-semibold text-xs uppercase tracking-wider">
                Vložit přímý odkaz na YouTube
              </span>
            </div>
            <button
              onClick={() => setIsUrlAddOpen(false)}
              className="text-neutral-400 hover:text-white text-xs p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {urlAddError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{urlAddError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs text-neutral-400 mb-1">YouTube URL nebo ID videa *</label>
            <input
              type="text"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... nebo youtu.be/..."
              className="w-full bg-black/60 border border-white/10 rounded-2xl text-white px-3.5 py-2.5 text-xs focus:outline-none focus:border-znacka"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Název skladby (volitelné)</label>
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Např. Wonderwall"
                className="w-full bg-black/60 border border-white/10 rounded-2xl text-white px-3.5 py-2 text-xs focus:outline-none focus:border-znacka"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Interpret (volitelné)</label>
              <input
                type="text"
                value={manualArtist}
                onChange={(e) => setManualArtist(e.target.value)}
                placeholder="Např. Oasis"
                className="w-full bg-black/60 border border-white/10 rounded-2xl text-white px-3.5 py-2 text-xs focus:outline-none focus:border-znacka"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-znacka hover:bg-znacka/90 text-black font-semibold py-2.5 text-xs rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Přidat do společného playlistu</span>
          </button>
        </form>
      )}

      {/* SONGBOOK PICKER */}
      {isSongbookPickerOpen && (
        <div className="bg-plocha-2 border border-white/15 rounded-3xl p-5 shadow-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-uspech" />
              <span className="text-white font-semibold text-xs uppercase tracking-wider">
                Vybrat píseň ze zpěvníku
              </span>
            </div>
            <button
              onClick={() => setIsSongbookPickerOpen(false)}
              className="text-neutral-400 hover:text-white text-xs p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
            {songs.map((song) => (
              <button
                key={song.id}
                onClick={() => handleAddFromSong(song)}
                className="bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] rounded-2xl p-3 text-left flex items-center justify-between gap-2 cursor-pointer transition-all"
              >
                <div>
                  <div className="text-xs font-semibold text-white">{song.title}</div>
                  <div className="text-drobne text-neutral-400">{song.artist} ({song.key})</div>
                </div>
                <Plus className="w-4 h-4 text-uspech shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PLAYLIST ITEMS TABLE / LIST */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl overflow-hidden shadow-xl">
        
        {/* Table Header */}
        <div className="bg-white/[0.02] border-b border-white/[0.06] px-5 py-3 flex items-center justify-between text-xs font-semibold text-neutral-400">
          <div className="flex items-center gap-4">
            <span className="w-6 text-center">#</span>
            <span>Skladba v playlistu</span>
          </div>
          <div className="flex items-center gap-8">
            <span className="hidden sm:inline">Přidal</span>
            <span>Akce</span>
          </div>
        </div>

        {/* Empty State */}
        {playlist.length === 0 && (
          <div className="p-16 text-center space-y-3">
            <Youtube className="w-12 h-12 text-neutral-600 mx-auto" />
            <div className="text-sm font-semibold text-neutral-300">
              Váš playlist je zatím prázdný
            </div>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Vyhledejte skladby na YouTube nebo vložte odkaz a vytvořte nepřetržitý kapelní set.
            </p>
            <button
              onClick={() => setIsSearchOpen(true)}
              className="bg-znacka hover:bg-znacka/90 text-black font-semibold px-4 py-2 text-xs rounded-xl cursor-pointer shadow-sm"
            >
              Hledat skladby
            </button>
          </div>
        )}

        {/* Playlist Items */}
        <div className="divide-y divide-white/[0.04]">
          {playlist.map((item, index) => {
            const isCurrent = currentTrackIndex === index;

            return (
              <div
                key={item.id}
                className={`flex items-center justify-between px-4 sm:px-5 py-3 transition-all ${
                  isCurrent
                    ? 'bg-white/10 border-l-4 border-l-znacka'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                {/* Left: Index, Thumbnail, Title */}
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  
                  {/* Track Number / Equalizer */}
                  <div className="w-6 text-center shrink-0">
                    {isCurrent && isPlaying ? (
                      <div className="flex items-center justify-center gap-0.5 h-3.5">
                        <span className="w-1 bg-znacka h-full animate-bounce rounded-full"></span>
                        <span className="w-1 bg-znacka h-2/3 animate-bounce [animation-delay:0.2s] rounded-full"></span>
                        <span className="w-1 bg-znacka h-4/5 animate-bounce [animation-delay:0.4s] rounded-full"></span>
                      </div>
                    ) : (
                      <span className={`text-xs font-semibold ${isCurrent ? 'text-znacka' : 'text-neutral-500'}`}>
                        {index + 1}
                      </span>
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div
                    onClick={() => onSelectTrackIndex(index)}
                    className="relative w-14 sm:w-16 h-10 bg-black rounded-xl border border-white/10 shrink-0 cursor-pointer overflow-hidden group shadow-sm"
                  >
                    <img
                      src={item.thumbnail || `https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg`}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                  </div>

                  {/* Title & Artist */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectTrackIndex(index)}
                        className={`text-xs sm:text-sm font-semibold text-left truncate hover:underline cursor-pointer ${
                          isCurrent ? 'text-znacka' : 'text-white'
                        }`}
                      >
                        {item.title}
                      </button>
                      {isCurrent && (
                        <span className="text-stitek bg-znacka text-black font-bold px-1.5 py-0.5 rounded-md uppercase shrink-0">
                          Hraje
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5 truncate">
                      {item.artist && <span className="text-neutral-300 font-medium">{item.artist}</span>}
                    </div>
                  </div>
                </div>

                {/* Right: Added by & Control Buttons */}
                <div className="flex items-center gap-2 sm:gap-4 shrink-0 pl-2">
                  <span className="text-xs text-neutral-400 hidden sm:inline truncate max-w-[100px]">
                    {item.addedByName || 'Kapela'}
                  </span>

                  {/* Move Up/Down */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => handleMoveUp(index, e)}
                      disabled={index === 0}
                      className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded-lg cursor-pointer"
                      title="Posunout nahoru"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleMoveDown(index, e)}
                      disabled={index === playlist.length - 1}
                      className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded-lg cursor-pointer"
                      title="Posunout dolů"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveItem(item.id);
                    }}
                    className="p-1.5 text-neutral-400 hover:text-chyba hover:bg-red-500/10 rounded-lg cursor-pointer"
                    title="Odebrat z playlistu"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>

      </div>

    </div>
  );
};
