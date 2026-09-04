import { spustDoplneni } from '../services/enrichmentClient';
import React, { useState, useEffect } from 'react';
import { Song, YouTubeVideo } from '../types';
import { searchYouTubeDirect, searchYouTubeForSong } from '../services/onlineSongSearch';
import { TipyKapel } from './youtube/TipyKapel';
import {
  Video, Play, Volume2, Plus, RefreshCw, Trash2, ExternalLink,
  Search, Check, Music, Youtube, Sparkles, AlertCircle, Link as LinkIcon,
  Globe, Loader2, Eye, Layout, Type
} from 'lucide-react';

interface YouTubeSectionProps {
  activeSong: Song | null;
  songs: Song[];
  onSelectSong: (song: Song) => void;
  onUpdateSongVideos: (songId: string, videos: YouTubeVideo[]) => void;
  onAddSong?: (song: Song) => void;
}

/**
 * Doporučené kapely do hledání.
 *
 * Devadesátková kytarová muzika, u které je největší šance, že ji tady
 * někdo bude chtít hrát. Domácí a světové zvlášť — hledá se jinak a
 * pomíchané v jedné řadě by se v tom nedalo vyznat.
 *
 * Kliknutí jen předvyplní pole; co se hledá, si člověk dopíše sám.
 */

export const YouTubeSection: React.FC<YouTubeSectionProps> = ({
  activeSong,
  songs,
  onSelectSong,
  onUpdateSongVideos,
  onAddSong,
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

  // Direct YouTube Search States
  const [youtubeQuery, setYoutubeQuery] = useState('');
  const [isDirectSearching, setIsDirectSearching] = useState(false);
  const [directYtResults, setDirectYtResults] = useState<YouTubeVideo[]>([]);
  const [importingVideo, setImportingVideo] = useState<YouTubeVideo | null>(null);
  const [importSongTitle, setImportSongTitle] = useState('');
  const [importSongArtist, setImportSongArtist] = useState('');

  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(true);

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

  const videos = activeSong?.youtubeVideos || [];

  // Handle Direct YouTube Search (Fetches ~10-15 top videos with title and thumbnails)
  const handleDirectSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeQuery.trim()) return;

    setIsDirectSearching(true);
    setError(null);
    setSuccessMsg(null);
    setDirectYtResults([]);

    try {
      const results = await searchYouTubeDirect(youtubeQuery.trim());
      if (results.length === 0) {
        setError('Nebyly nalezeny žádné YouTube výsledky pro váš dotaz. Zkuste upřesnit hledání.');
      } else {
        setDirectYtResults(results);
      }
    } catch (err: any) {
      setError(err?.message || 'Vyhledávání na YouTube selhalo.');
    } finally {
      setIsDirectSearching(false);
    }
  };

  // Open import prompt for a video
  const triggerImportPrompt = (video: YouTubeVideo) => {
    setImportingVideo(video);
    // Clean up title for the input fields
    let suggestedTitle = video.title;
    let suggestedArtist = 'Neznámý interpret';

    // Try to split common patterns (e.g. "Artist - Title", "Artist: Title")
    const splitters = [' - ', ' | ', ' : ', ' – '];
    for (const splitter of splitters) {
      if (video.title.includes(splitter)) {
        const parts = video.title.split(splitter);
        suggestedArtist = parts[0].trim();
        suggestedTitle = parts.slice(1).join(splitter).trim();
        break;
      }
    }

    // Strip common tags
    suggestedTitle = suggestedTitle
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/lyrics/gi, '')
      .replace(/chords/gi, '')
      .replace(/backing track/gi, '')
      .replace(/karaoke/gi, '')
      .replace(/official video/gi, '')
      .replace(/acoustic/gi, '')
      .trim();

    setImportSongTitle(suggestedTitle || 'Nově vyhledaná píseň');
    setImportSongArtist(suggestedArtist);
  };

  // Confirm import and create songbook entry
  const confirmImportSong = async () => {
    if (!onAddSong || !importingVideo) return;

    // Standardized instruction template encouraging they paste chords and load local tabs
    const contentTemplate = `[C] Zde klikněte na EDITOVAT AKORDY vpravo nahoře a vložte text s akordy z jiné stránky.
[Am] Pod tímto oknem pak můžete nahrát jakýkoliv .gp soubor (Guitar Pro) ze svého PC.
[F] Všechna tři okna (Video, Akordy, Tabulatura) si pak rozložíte a přizpůsobíte velikost.

[C] Refrén:
[G] Moje nově stažená píseň s doprovodem [Am] funguje skvěle!`;

    // Automatically scrape and associate backing track, karaoke, tutorials etc
    let scrapedCompanionVideos: YouTubeVideo[] = [
      { ...importingVideo, type: 'original' }
    ];

    try {
      const companions = await searchYouTubeForSong(importSongTitle, importSongArtist);
      if (companions && companions.length > 0) {
        // filter out the original one
        const extra = companions.filter(c => c.id !== importingVideo.id);
        scrapedCompanionVideos = [...scrapedCompanionVideos, ...extra];
      }
    } catch (e) {
      console.warn('Failed to scrape companions, continuing with primary video:', e);
    }

    const newSong: Song = {
      id: crypto.randomUUID(),
      title: importSongTitle.trim() || 'Importovaná Píseň',
      artist: importSongArtist.trim() || 'Neznámý interpret',
      key: 'G',
      content: contentTemplate,
      chordsUsed: ['C', 'Am', 'F', 'G'],
      youtubeVideos: scrapedCompanionVideos,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notes: `Vytvořeno z YouTube videa: ${importingVideo.title}`
    };

    onAddSong(newSong);

    // Appka se rovnou pustí do shánění textu, akordů, tabulatur a tempa.
    // Běží to na pozadí — píseň je uložená hned a materiály k ní přibývají
    // samy, takže se u přidávání nečeká.
    spustDoplneni(newSong.id);

    setSuccessMsg(
      `Píseň „${newSong.title}" je v Mojich skladbách i s odkazem na video. `
      + 'Zkouším k ní sehnat text, akordy a tabulatury — objeví se samy. '
      + 'Nahrávku pro poslech bez internetu k ní přidáš v Souborech, ve složce Moje skladby.'
    );
    setDirectYtResults([]);
    setYoutubeQuery('');
    setImportingVideo(null);
    setSelectedVideo(importingVideo);
  };

  // Handle Auto Search from YouTube for current active song
  const handleAutoSearchYouTube = async () => {
    if (!activeSong) return;
    setIsSearching(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const foundVideos = await searchYouTubeForSong(activeSong.title, activeSong.artist);
      if (foundVideos.length === 0) {
        setError('Pro tuto píseň nebyly nalezeny žádné nové doprovody na YouTube.');
      } else {
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
        setSuccessMsg(`Úspěšně staženo ${foundVideos.length} doprovodných video stop, lekcí a tónin!`);
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
    if (!activeSong) return;
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
    if (!activeSong) return;
    const updated = videos.filter((v) => v.id !== vidId);
    onUpdateSongVideos(activeSong.id, updated);
    if (selectedVideo?.id === vidId) {
      setSelectedVideo(updated[0] || null);
    }
  };

  return (
    <div className="space-y-6 font-sans text-white pb-12">
      
      {/* 1. DIRECT YOUTUBE SEARCH TERMINAL */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-chyba/10 border border-chyba/30 text-chyba rounded-2xl">
              <Youtube className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-chyba text-white font-bold px-2 py-0.5 text-stitek rounded-md uppercase tracking-wide">
                  YouTube
                </span>
                <span className="text-xs text-neutral-400 font-medium">Vyhledávač &amp; Importér</span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight mt-0.5">
                Kytarová videa, backing tracky a tutoriály
              </h3>
            </div>
          </div>
          <button
            onClick={() => setIsSearchPanelOpen(!isSearchPanelOpen)}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white cursor-pointer transition-all"
          >
            {isSearchPanelOpen ? 'Skrýt panel' : 'Zobrazit panel'}
          </button>
        </div>

        {isSearchPanelOpen && (
          <div className="space-y-3">
            <form onSubmit={handleDirectSearch} className="flex gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Zadejte dotaz pro vyhledání videa na YouTube (např. Coldplay Yellow acoustic, Kabát Pohoda)..."
                  value={youtubeQuery}
                  onChange={(e) => setYoutubeQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl text-white pl-10 pr-4 py-3 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-chyba transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isDirectSearching || !youtubeQuery.trim()}
                className="px-6 py-3 bg-chyba hover:bg-[#ff5b52] text-white font-bold text-xs uppercase rounded-2xl flex items-center gap-2 transition-all shadow-lg shrink-0 disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {isDirectSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Hledám...</span>
                  </>
                ) : (
                  <>
                    <Youtube className="w-4 h-4" />
                    <span>Vyhledat videa</span>
                  </>
                )}
              </button>
            </form>

            {/* Doporučeno.
                Jména se berou z MusicBrainzu podle země a roku vzniku;
                ručně vypsaný seznam měl patnáct kapel na dekádu a hned
                zestárl. Kliknutí jen předvyplní hledání, zbytek dopíšeš
                sám: „live", „tutorial", „backing track". */}
            <TipyKapel onVybrat={setYoutubeQuery} />
          </div>
        )}

        {/* Modal for Renaming/Editing details during video import */}
        {importingVideo && (
          <div className="bg-plocha-2 border border-chyba/40 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
            <h4 className="text-sm font-bold text-chyba uppercase border-b border-white/5 pb-2 flex items-center gap-2">
              <Type className="w-4 h-4" /> Pojmenujte novou skladbu v Song Library
            </h4>
            <p className="text-xs text-neutral-400">
              Tato skladba bude uložena do vaší kytarové knihovny. Později si pod ní můžete nahrát vlastní akordy a GP tabulatury.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Název písně:</label>
                <input
                  type="text"
                  value={importSongTitle}
                  onChange={(e) => setImportSongTitle(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-sm focus:border-chyba focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Interpret / Kapela:</label>
                <input
                  type="text"
                  value={importSongArtist}
                  onChange={(e) => setImportSongArtist(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-sm focus:border-chyba focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setImportingVideo(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white cursor-pointer transition-all"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={confirmImportSong}
                className="px-5 py-2 bg-uspech hover:bg-[#34e260] text-black font-bold text-xs uppercase rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
              >
                Potvrdit &amp; uložit píseň
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Video Results Row/List */}
        {directYtResults.length > 0 && (
          <div className="space-y-3 bg-black/40 border border-white/5 rounded-2xl p-4 max-h-[440px] overflow-y-auto">
            <h4 className="text-xs font-bold text-white uppercase border-b border-white/5 pb-2 flex items-center justify-between">
              <span className="text-chyba">Nalezené video výsledky ({directYtResults.length}):</span>
              <span className="text-drobne text-neutral-400 font-normal lowercase">klikněte pro přehrání náhledu nebo uložte do zpěvníku</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {directYtResults.map((video) => (
                <div
                  key={video.id}
                  className="bg-white/5 border border-white/10 rounded-2xl p-3 flex gap-3 hover:border-chyba/50 hover:bg-white/[0.08] transition-all cursor-pointer group"
                  onClick={() => {
                    setSelectedVideo(video);
                    setSuccessMsg(`Přehrávám náhled videa z vyhledávání: ${video.title}`);
                  }}
                >
                  {/* Thumbnail */}
                  <div className="relative w-28 h-20 bg-black shrink-0 rounded-xl border border-white/5 overflow-hidden">
                    <img
                      src={(video as any).thumbnail || (video as any).thumbnailUrl || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                      alt="thumbnail"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Play className="w-5 h-5 text-white fill-current drop-shadow-md" />
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-col justify-between overflow-hidden flex-1">
                    <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                      {video.title}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-stitek text-neutral-400 font-mono">ID: {video.id}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerImportPrompt(video);
                        }}
                        className="px-3 py-1 bg-chyba hover:bg-[#ff5b52] text-white font-bold text-stitek uppercase rounded-lg flex items-center gap-1 transition-all shadow-md active:scale-95"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Do Mojich skladeb</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. PLAYER WORKSPACE HEADER */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-chyba/10 border border-chyba/30 text-chyba rounded-2xl">
            <Youtube className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-chyba text-white text-stitek font-bold px-2 py-0.5 rounded-md uppercase">
                Přehrávač
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Interaktivní YouTube Studio
              </h2>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Vybraná píseň:{' '}
              {activeSong ? (
                <span className="text-uspech font-semibold">
                  {activeSong.title} – {activeSong.artist}
                </span>
              ) : (
                <span className="text-znacka font-medium">Žádná vybraná píseň (vyberte níže)</span>
              )}
            </p>
          </div>
        </div>

        {/* Dropdown switcher & Custom Video Trigger */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={activeSong?.id || ''}
            onChange={(e) => {
              const found = songs.find((s) => s.id === e.target.value);
              if (found) onSelectSong(found);
            }}
            className="bg-black/40 border border-white/10 text-white rounded-2xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:border-chyba transition-colors cursor-pointer"
          >
            <option value="" disabled>-- Vybrat píseň --</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.artist})
              </option>
            ))}
          </select>

          {activeSong && (
            <button
              onClick={handleAutoSearchYouTube}
              disabled={isSearching}
              className="bg-chyba hover:bg-[#ff5b52] text-white px-4 py-2.5 text-xs font-bold uppercase rounded-2xl flex items-center gap-2 shadow-md transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
              <span>Stáhnout variace doprovodu</span>
            </button>
          )}

          {activeSong && (
            <button
              onClick={() => setIsAddFormOpen(!isAddFormOpen)}
              className="bg-white/5 hover:bg-white/10 text-uspech border border-white/10 px-4 py-2.5 text-xs font-semibold rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ruční odkaz</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-xs font-semibold flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-uspech/10 border border-uspech/30 rounded-2xl p-4 text-uspech text-xs font-semibold flex items-center gap-2.5">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Manual Link Input Form */}
      {isAddFormOpen && activeSong && (
        <form onSubmit={handleAddManualVideo} className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <span className="text-sm font-bold text-white flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-chyba" /> Vložit vlastní odkaz na YouTube
            </span>
            <button
              type="button"
              onClick={() => setIsAddFormOpen(false)}
              className="text-xs text-neutral-400 hover:text-white cursor-pointer"
            >
              ✕ Zavřít
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300">YouTube URL nebo ID videa:</label>
              <input
                type="text"
                placeholder="Např. https://www.youtube.com/watch?v=6hzrDeceEKc..."
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-sm focus:outline-none focus:border-chyba"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300">Typ stopy:</label>
              <select
                value={newVideoType}
                onChange={(e) => setNewVideoType(e.target.value as any)}
                className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-sm focus:outline-none focus:border-chyba"
              >
                <option value="official">🎬 Oficiální klip</option>
                <option value="backingtrack">🎤 Backing track s textem</option>
                <option value="karaoke">🎸 Karaoke / Doprovod</option>
                <option value="cover">🎵 Cover / Tutoriál</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300">Název odkazu (volitelné):</label>
            <input
              type="text"
              placeholder={`Př. ${activeSong.title} - Akustický cover`}
              value={newVideoTitle}
              onChange={(e) => setNewVideoTitle(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-sm focus:outline-none focus:border-chyba"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="submit"
              className="bg-chyba hover:bg-[#ff5b52] text-white font-bold px-5 py-2.5 text-xs uppercase rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
            >
              Uložit k písni
            </button>
          </div>
        </form>
      )}

      {/* Embedded Player + Videos Playlist Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Playback Window */}
        <div className="lg:col-span-2 space-y-4">
          {selectedVideo ? (
            <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`text-stitek font-bold px-2.5 py-1 rounded-lg uppercase ${
                    selectedVideo.type === 'official' ? 'bg-chyba/20 text-chyba border border-chyba/30' : 'bg-uspech/20 text-uspech border border-uspech/30'
                  }`}>
                    {selectedVideo.type}
                  </span>
                  <h3 className="text-sm font-bold text-white truncate max-w-md">
                    {selectedVideo.title}
                  </h3>
                </div>

                <a
                  href={selectedVideo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-xl flex items-center gap-1.5 font-medium transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-chyba" />
                  <span>Otevřít na YouTube</span>
                </a>
              </div>

              <div className="relative aspect-video bg-black rounded-2xl border border-white/10 overflow-hidden shadow-xl">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${selectedVideo.id}?autoplay=1&enablejsapi=1&rel=0`}
                  title={selectedVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full border-0"
                ></iframe>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-2xl p-3 flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-mono">ID: {selectedVideo.id}</span>
                {activeSong && (
                  <button
                    onClick={() => handleDeleteVideo(selectedVideo.id)}
                    className="p-1.5 text-red-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-all cursor-pointer"
                    title="Smazat video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-12 text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 rounded-full bg-chyba/10 border border-chyba/20 flex items-center justify-center mx-auto text-chyba">
                <Youtube className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-white">Žádné aktivní video k přehrání</p>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Zadejte dotaz nahoře, spusťte náhled, uložte si píseň s videem nebo zvolte píseň ze seznamu.
              </p>
            </div>
          )}
        </div>

        {/* Playlist of Companion Backing Tracks */}
        <div className="space-y-4">
          <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs font-bold text-white uppercase flex items-center gap-2">
                <Youtube className="w-4 h-4 text-chyba" />
                Doprovody písně ({videos.length})
              </span>
            </div>

            {videos.length === 0 ? (
              <div className="p-6 text-center text-neutral-400 text-xs border border-dashed border-white/10 rounded-2xl">
                Žádná uložená kytarová videa. Použijte automatické vyhledání výše.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {videos.map((vid) => {
                  const isSelected = selectedVideo?.id === vid.id;
                  return (
                    <div
                      key={vid.id}
                      onClick={() => setSelectedVideo(vid)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-2.5 ${
                        isSelected ? 'bg-chyba/10 border-chyba/40 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <span className="text-stitek font-bold px-2 py-0.5 bg-chyba text-white uppercase rounded-md inline-block mb-1.5">
                          {vid.type}
                        </span>
                        <p className="text-xs font-semibold text-white line-clamp-2 leading-tight">
                          {vid.title}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVideo(vid.id);
                        }}
                        className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition-all"
                        title="Smazat video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
