import React, { useState, useEffect } from 'react';
import { Song, YouTubeVideo } from '../types';
import { searchYouTubeForSong } from '../services/onlineSongSearch';
import {
  Video, Play, Volume2, VolumeX, Plus, RefreshCw, Trash2, ExternalLink,
  Search, Check, Music, Youtube, Sparkles, AlertCircle, Link as LinkIcon
} from 'lucide-react';

interface YouTubeSectionProps {
  activeSong: Song | null;
  songs: Song[];
  onSelectSong: (song: Song) => void;
  onUpdateSongVideos: (songId: string, videos: YouTubeVideo[]) => void;
}

export const YouTubeSection: React.FC<YouTubeSectionProps> = ({
  activeSong,
  songs,
  onSelectSong,
  onUpdateSongVideos,
}) => {
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Manual Add Form States
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoTitle, setNewVideoTitle] = useState('');
  const [newVideoType, setNewVideoType] = useState<YouTubeVideo['type']>('backingtrack');

  // Volume & Player state
  const [volumeLevel, setVolumeLevel] = useState<number>(100);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Helper to extract YouTube Video ID from any link
  const extractYouTubeId = (input: string): string | null => {
    if (!input) return null;
    const clean = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;

    const match =
      clean.match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/) ||
      clean.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);

    return match ? match[1] : null;
  };

  // Synchronize default selected video when activeSong changes
  useEffect(() => {
    if (activeSong) {
      if (activeSong.youtubeVideos && activeSong.youtubeVideos.length > 0) {
        setSelectedVideo(activeSong.youtubeVideos[0]);
      } else {
        setSelectedVideo(null);
      }
    }
  }, [activeSong?.id, activeSong?.youtubeVideos]);

  if (!activeSong) {
    return (
      <div className="bg-[#0F0F0F] border-2 border-[#222] p-8 text-center font-mono">
        <Youtube className="w-12 h-12 text-[#FF0000] mx-auto mb-3 animate-pulse" />
        <h2 className="text-base font-black text-white uppercase">NEBYLA VYBRÁNA ŽÁDNÁ PÍSEŇ</h2>
        <p className="text-xs text-[#888] mt-1 uppercase">
          Vyberte písničku ze zpěvníku pro zobrazení oficiálního klipu a backing tracků z YouTube.
        </p>
      </div>
    );
  }

  const videos = activeSong.youtubeVideos || [];

  // Handle Auto Search from YouTube for current active song
  const handleAutoSearchYouTube = async () => {
    setIsSearching(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const foundVideos = await searchYouTubeForSong(activeSong.title, activeSong.artist);
      if (foundVideos.length === 0) {
        setError('Pro tuto píseň nebyly nalezeny žádné odpovědi na YouTube.');
      } else {
        // Merge with existing videos avoiding duplicates by ID
        const existingMap = new Map((activeSong.youtubeVideos || []).map((v) => [v.id, v]));
        for (const fv of foundVideos) {
          if (!existingMap.has(fv.id)) {
            existingMap.set(fv.id, fv);
          }
        }
        const updated = Array.from(existingMap.values());
        onUpdateSongVideos(activeSong.id, updated);
        if (updated.length > 0) {
          setSelectedVideo(updated[0]);
        }
        setSuccessMsg(`Úspěšně načteno ${foundVideos.length} YouTube videí a backing tracků!`);
      }
    } catch (err: any) {
      setError('Vyhledávání na YouTube selhalo.');
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Add Manual YouTube Link
  const handleAddManualVideo = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const vidId = extractYouTubeId(newVideoUrl);
    if (!vidId) {
      setError('Neplatná YouTube URL adresa nebo ID videa.');
      return;
    }

    const newVid: YouTubeVideo = {
      id: vidId,
      title: newVideoTitle.trim() || `${activeSong.title} - ${activeSong.artist}`,
      url: `https://www.youtube.com/watch?v=${vidId}`,
      type: newVideoType,
      addedAt: Date.now(),
    };

    const existingMap = new Map((activeSong.youtubeVideos || []).map((v) => [v.id, v]));
    existingMap.set(vidId, newVid);
    const updated = Array.from(existingMap.values());

    onUpdateSongVideos(activeSong.id, updated);
    setSelectedVideo(newVid);

    setNewVideoUrl('');
    setNewVideoTitle('');
    setIsAddFormOpen(false);
    setSuccessMsg('Nové YouTube video bylo úspěšně přidáno k písni!');
  };

  // Delete Video
  const handleDeleteVideo = (vidId: string) => {
    const updated = videos.filter((v) => v.id !== vidId);
    onUpdateSongVideos(activeSong.id, updated);
    if (selectedVideo?.id === vidId) {
      setSelectedVideo(updated[0] || null);
    }
  };

  return (
    <div className="space-y-4 font-mono text-[#D1D1D1]">
      
      {/* Top Header Bar */}
      <div className="bg-[#0F0F0F] border-2 border-[#222] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-[#FF0000] text-white p-2 border border-black shadow-[2px_2px_0px_#000]">
            <Youtube className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#FF0000] text-white text-[9px] font-black px-1.5 py-0.5 uppercase">
                YOUTUBE_HUB
              </span>
              <h2 className="text-base font-black text-white uppercase tracking-wider">
                YOUTUBE KLIPY &amp; BACKING TRACKY
              </h2>
            </div>
            <p className="text-xs text-[#888] mt-0.5 uppercase">
              AKTUÁLNÍ PÍSEŇ: <span className="text-[#00FF41] font-bold">{activeSong.title}</span> – {activeSong.artist}
            </p>
          </div>
        </div>

        {/* Controls / Song Switcher & Auto Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Song Select Dropdown */}
          <select
            value={activeSong.id}
            onChange={(e) => {
              const found = songs.find((s) => s.id === e.target.value);
              if (found) onSelectSong(found);
            }}
            className="bg-[#050505] border border-[#333] text-white px-3 py-1.5 text-xs font-bold uppercase focus:outline-none focus:border-[#FF0000]"
          >
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.artist})
              </option>
            ))}
          </select>

          {/* Auto Search Button */}
          <button
            onClick={handleAutoSearchYouTube}
            disabled={isSearching}
            className="bg-[#FF0000] hover:bg-white text-white hover:text-black px-3 py-1.5 text-xs font-extrabold uppercase border border-black flex items-center gap-1.5 transition-none"
            title="Vyhledat oficiální video a backing track s textem na YouTube pro tuto píseň"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
            <span>{isSearching ? 'VYHLEDÁVÁM YOUTUBE...' : 'NAČÍST VYHLEDANÁ VIDEA'}</span>
          </button>

          {/* Add Custom Video Toggle Button */}
          <button
            onClick={() => setIsAddFormOpen(!isAddFormOpen)}
            className="bg-[#1A1A1A] hover:bg-[#222] text-[#00FF41] border border-[#333] px-3 py-1.5 text-xs font-bold uppercase flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>PŘIDAT ODKAZ</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-[#2B0000] border border-[#FF3E00] p-3 text-[#FF3E00] text-xs font-bold uppercase flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-[#0F1E13] border border-[#00FF41] p-3 text-[#00FF41] text-xs font-bold uppercase flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Manual Add Form Modal/Panel */}
      {isAddFormOpen && (
        <form onSubmit={handleAddManualVideo} className="bg-[#0A0A0A] border-2 border-[#00FF41] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#222] pb-2">
            <span className="text-xs font-black text-[#00FF41] uppercase flex items-center gap-1.5">
              <LinkIcon className="w-4 h-4" /> VLOŽIT VLASTNÍ ODKAZ NA YOUTUBE
            </span>
            <button
              type="button"
              onClick={() => setIsAddFormOpen(false)}
              className="text-xs text-[#888] hover:text-white"
            >
              ZAVŘÍT [X]
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] uppercase font-bold text-[#AAA]">
                YOUTUBE URL ADRESA NEBO ID VIDEA:
              </label>
              <input
                type="text"
                placeholder="NAPR. https://www.youtube.com/watch?v=6hzrDeceEKc..."
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                required
                className="w-full bg-[#050505] border border-[#333] text-white px-3 py-1.5 text-xs focus:outline-none focus:border-[#00FF41]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[#AAA]">
                TYP VIDEA:
              </label>
              <select
                value={newVideoType}
                onChange={(e) => setNewVideoType(e.target.value as any)}
                className="w-full bg-[#050505] border border-[#333] text-white px-3 py-1.5 text-xs focus:outline-none focus:border-[#00FF41] uppercase font-bold"
              >
                <option value="official">🎬 OFICIÁLNÍ KLIP</option>
                <option value="backingtrack">🎤 BACKING TRACK S TEXTEM</option>
                <option value="karaoke">🎸 KARAOKE / DOPROVOD</option>
                <option value="cover">🎵 COVER / LEKCE</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[#AAA]">
              NÁZEV VIDEA (VOLITELNÉ):
            </label>
            <input
              type="text"
              placeholder={`PŘ. ${activeSong.title} - Backing track s akordy`}
              value={newVideoTitle}
              onChange={(e) => setNewVideoTitle(e.target.value)}
              className="w-full bg-[#050505] border border-[#333] text-white px-3 py-1.5 text-xs focus:outline-none focus:border-[#00FF41]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              className="bg-[#00FF41] hover:bg-white text-black font-extrabold px-4 py-2 text-xs uppercase flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> ULOŽIT VIDEO K PÍSNI
            </button>
          </div>
        </form>
      )}

      {/* Main Player & Video Browser Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Left Column: Active Embedded Video Player (2 cols on large) */}
        <div className="lg:col-span-2 space-y-3">
          {selectedVideo ? (
            <div className="bg-[#0F0F0F] border-2 border-[#333] p-3 space-y-3">
              
              {/* Active Video Title & Meta Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] pb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 uppercase border ${
                    selectedVideo.type === 'official'
                      ? 'bg-[#FF0000] text-white border-black'
                      : selectedVideo.type === 'backingtrack'
                      ? 'bg-[#00FF41] text-black border-black'
                      : 'bg-[#FF3E00] text-black border-black'
                  }`}>
                    {selectedVideo.type === 'official'
                      ? '🎬 OFICIÁLNÍ KLIP'
                      : selectedVideo.type === 'backingtrack'
                      ? '🎤 BACKING TRACK S TEXTEM'
                      : '🎸 KARAOKE / DOPROVOD'}
                  </span>
                  <h3 className="text-sm font-black text-white uppercase truncate max-w-md">
                    {selectedVideo.title}
                  </h3>
                </div>

                {/* External Link Action */}
                <a
                  href={selectedVideo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-[#1A1A1A] hover:bg-[#222] text-[#888] hover:text-white px-2.5 py-1 border border-[#333] flex items-center gap-1.5 uppercase font-bold"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#00FF41]" />
                  <span>OTEVŘÍT NA YOUTUBE</span>
                </a>
              </div>

              {/* YouTube Video Embedded Iframe */}
              <div className="relative aspect-video bg-black border border-[#222] overflow-hidden">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${selectedVideo.id}?autoplay=1&enablejsapi=1&rel=0`}
                  title={selectedVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full border-0"
                ></iframe>
              </div>

              {/* Player Audio & Volume Quick Assistant */}
              <div className="bg-[#050505] border border-[#222] p-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-[#888]">
                  <Volume2 className="w-4 h-4 text-[#00FF41]" />
                  <span className="font-bold text-white text-[11px] uppercase">
                    PŘEHRÁVAČ OBSAHUJE ZVUK A OVLÁDÁNÍ HLASITOSTI PŘÍMO V OVLÁDACÍM PANELU VIDEA
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#888] uppercase">ID: {selectedVideo.id}</span>
                  <button
                    onClick={() => handleDeleteVideo(selectedVideo.id)}
                    className="p-1 text-[#FF3E00] hover:text-white hover:bg-[#2B0000] border border-transparent hover:border-[#FF3E00]"
                    title="Odstranit toto video z písně"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-[#0A0A0A] border-2 border-dashed border-[#333] p-12 text-center space-y-3">
              <Youtube className="w-12 h-12 text-[#444] mx-auto" />
              <p className="text-xs font-bold text-[#888] uppercase">
                ŽÁDNÉ AKTIVNÍ VIDEO K PŘEHRÁNÍ
              </p>
              <p className="text-[10px] text-[#666] max-w-md mx-auto">
                Klikněte na tlačítko „NAČÍST VYHLEDANÁ VIDEA“ výše pro automatické stažení klipů a backing tracků z YouTube, nebo přidejte odkaz ručně.
              </p>
              <button
                onClick={handleAutoSearchYouTube}
                disabled={isSearching}
                className="mt-2 px-4 py-2 bg-[#FF0000] hover:bg-white text-white hover:text-black font-extrabold text-xs uppercase inline-flex items-center gap-1.5 border border-black"
              >
                <Search className="w-4 h-4" />
                <span>VYHLEDAT NALEZENÁ VIDEA A BACKING TRACKY</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Playlist / List of saved YouTube videos for active song */}
        <div className="space-y-3">
          <div className="bg-[#0F0F0F] border-2 border-[#222] p-3">
            <div className="flex items-center justify-between border-b border-[#222] pb-2 mb-3">
              <span className="text-xs font-black text-white uppercase flex items-center gap-1.5">
                <Youtube className="w-4 h-4 text-[#FF0000]" />
                SEZNAM VIDEÍ K PÍSNI ({videos.length})
              </span>
              <button
                onClick={handleAutoSearchYouTube}
                className="text-[10px] text-[#00FF41] hover:underline uppercase font-bold"
              >
                OBNOVIT
              </button>
            </div>

            {videos.length === 0 ? (
              <div className="p-4 text-center text-[#666] text-xs uppercase border border-dashed border-[#222]">
                Zatím nebyly uloženy žádné odkazy.
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {videos.map((vid) => {
                  const isSelected = selectedVideo?.id === vid.id;
                  return (
                    <div
                      key={vid.id}
                      onClick={() => setSelectedVideo(vid)}
                      className={`p-2.5 border cursor-pointer transition-none flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-[#1F0000] border-[#FF0000] text-white shadow-[2px_2px_0px_#FF0000]'
                          : 'bg-[#0A0A0A] hover:bg-[#141414] border-[#222] text-[#AAA]'
                      }`}
                    >
                      <div className="space-y-1 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[8px] font-black px-1.5 py-0.2 uppercase ${
                            vid.type === 'official'
                              ? 'bg-[#FF0000] text-white'
                              : vid.type === 'backingtrack'
                              ? 'bg-[#00FF41] text-black'
                              : 'bg-[#FF3E00] text-black'
                          }`}>
                            {vid.type === 'official' ? 'KLIP' : vid.type === 'backingtrack' ? 'BACKING' : 'KARAOKE'}
                          </span>
                          <span className="text-[10px] font-bold text-[#888] truncate">
                            ID: {vid.id}
                          </span>
                        </div>

                        <p className="text-xs font-bold text-white line-clamp-2 leading-tight">
                          {vid.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isSelected && (
                          <span className="text-[10px] bg-[#FF0000] text-white px-1.5 py-0.5 font-bold uppercase animate-pulse">
                            HRAJE
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteVideo(vid.id);
                          }}
                          className="p-1 text-[#666] hover:text-[#FF3E00]"
                          title="Smazat video"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Help Box */}
          <div className="bg-[#050505] border border-[#222] p-3 text-[11px] text-[#888] space-y-1.5">
            <span className="text-[#00FF41] font-bold uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#00FF41]" /> YOUTUBE INTEGRACE:
            </span>
            <p>
              Videa z YouTube se automaticky ukládají k vybrané písni a zůstávají zachována i při příštím otevření zpěvníku nebo při sdílení s kapelou.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};
