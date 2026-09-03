import React, { useState, useEffect, useRef } from 'react';
import { audioBus } from '../../services/audioBus';
import { nactiYouTubeApi } from '../../services/youtubeApi';
import { Song, MediaTrack, LyricLine, MediaPlaylist, MediaPlaybackState, YouTubeVideo } from '../../types';
import { mediaCenterService } from '../../services/mediaCenterService';
import { eventBus } from '../../services/eventBus';
import { useMusicalContext } from '../../context/MusicalContext';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Shuffle, Repeat,
  ListMusic, Heart, History, Sparkles, Search, Plus, Trash2, ArrowRight,
  Disc3, ExternalLink, Link2, Music2, Sliders, Clock, Compass, Mic2,
  Maximize2, Minimize2, ChevronRight, Check, Loader2, BookOpen, Layers,
  Radio, Film, RefreshCw, X, Share2, CornerDownRight, Tag
} from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface MediaCenterSectionProps {
  songs: Song[];
  onSelectSong: (song: Song) => void;
  onAddSong?: (song: Song) => void;
  onNavigateToTab?: (tab: string) => void;
}

type MediaViewTab = 'explore' | 'active_song' | 'queue' | 'liked' | 'history' | 'playlists' | 'lyrics';

export const MediaCenterSection: React.FC<MediaCenterSectionProps> = ({
  songs,
  onSelectSong,
  onAddSong,
  onNavigateToTab,
}) => {
  const { activeSong, setBpm, setKey, bpm, key } = useMusicalContext();

  // Media Center State
  const [playbackState, setPlaybackState] = useState<MediaPlaybackState>(() => mediaCenterService.getState());
  const [queue, setQueue] = useState<MediaTrack[]>(() => mediaCenterService.getQueue());
  const [lyrics, setLyrics] = useState<LyricLine[]>(() => mediaCenterService.getCurrentLyrics());
  const [likedTracks, setLikedTracks] = useState<MediaTrack[]>(() => mediaCenterService.getLikedTracks());
  const [history, setHistory] = useState<MediaTrack[]>(() => mediaCenterService.getHistory());
  const [playlists, setPlaylists] = useState<MediaPlaylist[]>(() => mediaCenterService.getPlaylists());

  const [activeSubTab, setActiveSubTab] = useState<MediaViewTab>('explore');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'backingtrack' | 'drumless' | 'bassless' | 'lesson' | 'karaoke' | 'all'>('backingtrack');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MediaTrack[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Full Screen / Stage Mode
  const [isFullStageMode, setIsFullStageMode] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<MediaPlaylist | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);

  // Equalizer Preset State (Web Audio / Tone simulation)
  const [eqPreset, setEqPreset] = useState<'flat' | 'rock' | 'vocal_cut' | 'bass_boost' | 'acoustic'>('rock');

  // YouTube IFrame Player Instance Ref
  const ytPlayerRef = useRef<any>(null);

  // Registrace u sběrnice — viz audioBus. Bez ní by se tenhle přehrávač
  // nedal zastavit, když zvuk spustí spodní lišta.
  useEffect(() => {
    return audioBus.register('media-center', () => {
      try {
        ytPlayerRef.current?.pauseVideo?.();
      } catch {
        /* přehrávač ještě nemusí být připravený */
      }
    });
  }, []);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const [isYtReady, setIsYtReady] = useState(false);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Lyrics Auto-scroll ref
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to MediaCenterService
  useEffect(() => {
    const unsub = mediaCenterService.subscribe((state, q, lyr) => {
      setPlaybackState(state);
      setQueue(q);
      setLyrics(lyr);
      setLikedTracks(mediaCenterService.getLikedTracks());
      setHistory(mediaCenterService.getHistory());
      setPlaylists(mediaCenterService.getPlaylists());
    });
    return unsub;
  }, []);

  // Načtení YouTube API přes společný zavaděč — viz youtubeApi.ts.
  useEffect(() => {
    let zivy = true;
    void nactiYouTubeApi()
      .then(() => zivy && setIsYtReady(true))
      .catch((e) => console.warn('[MediaCenter] YouTube API:', e?.message));
    return () => {
      zivy = false;
    };
  }, []);

  // Initialize or re-cue YouTube Player when currentTrack changes
  useEffect(() => {
    if (!isYtReady || !playbackState.currentTrack) return;
    const currentYtId = playbackState.currentTrack.youtubeId;
    if (!currentYtId) return;

    if (!ytPlayerRef.current) {
      try {
        ytPlayerRef.current = new window.YT.Player('media-center-yt-iframe', {
          height: '100%',
          width: '100%',
          videoId: currentYtId,
          playerVars: {
            autoplay: playbackState.isPlaying ? 1 : 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (playbackState.isPlaying) {
                event.target.playVideo();
              }
              event.target.setVolume(playbackState.isMuted ? 0 : playbackState.volume);
              event.target.setPlaybackRate(playbackState.playbackSpeed);
            },
            onStateChange: (event: any) => {
              // 1: PLAYING, 2: PAUSED, 0: ENDED
              if (event.data === 1) {
                audioBus.claim(
                  'media-center',
                  playbackState.currentTrack?.title || '',
                  'Media Center'
                );
                mediaCenterService.setPlayingState(true);
              } else if (event.data === 2) {
                audioBus.release('media-center');
                mediaCenterService.setPlayingState(false);
              } else if (event.data === 0) {
                if (playbackState.loopMode === 'one') {
                  event.target.seekTo(0);
                  event.target.playVideo();
                } else {
                  mediaCenterService.playNext();
                }
              }
            },
          },
        });
      } catch (err) {
        console.warn('[MediaCenter] YT Player init warning:', err);
      }
    } else {
      try {
        const loadedUrl = ytPlayerRef.current.getVideoUrl?.() || '';
        if (!loadedUrl.includes(currentYtId)) {
          if (playbackState.isPlaying) {
            ytPlayerRef.current.loadVideoById(currentYtId);
          } else {
            ytPlayerRef.current.cueVideoById(currentYtId);
          }
        }
      } catch (e) {}
    }
  }, [isYtReady, playbackState.currentTrack?.id, playbackState.currentTrack?.youtubeId]);

  // Sync Play/Pause with YT Player
  useEffect(() => {
    if (!ytPlayerRef.current || typeof ytPlayerRef.current.getPlayerState !== 'function') return;
    try {
      const state = ytPlayerRef.current.getPlayerState();
      if (playbackState.isPlaying && state !== 1) {
        ytPlayerRef.current.playVideo();
      } else if (!playbackState.isPlaying && state === 1) {
        ytPlayerRef.current.pauseVideo();
      }
    } catch (e) {}
  }, [playbackState.isPlaying]);

  // Sync Volume & Speed
  useEffect(() => {
    if (!ytPlayerRef.current || typeof ytPlayerRef.current.setVolume !== 'function') return;
    try {
      ytPlayerRef.current.setVolume(playbackState.isMuted ? 0 : playbackState.volume);
      ytPlayerRef.current.setPlaybackRate(playbackState.playbackSpeed);
    } catch (e) {}
  }, [playbackState.volume, playbackState.isMuted, playbackState.playbackSpeed]);

  // Timer loop for time update
  useEffect(() => {
    if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);

    if (playbackState.isPlaying) {
      timeUpdateIntervalRef.current = setInterval(() => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
          try {
            const current = ytPlayerRef.current.getCurrentTime() || 0;
            const duration = ytPlayerRef.current.getDuration() || 0;
            mediaCenterService.updateTime(current, duration);
          } catch (e) {}
        }
      }, 400);
    }

    return () => {
      if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
    };
  }, [playbackState.isPlaying]);

  // Global Seek Listener
  useEffect(() => {
    const unsub = eventBus.on('MEDIA_SEEK', ({ time }) => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(time, true);
        } catch (e) {}
      }
    });
    return unsub;
  }, []);

  // Auto-scroll lyrics to active line
  useEffect(() => {
    if (playbackState.lyricsIndex >= 0 && lyricsContainerRef.current) {
      const activeEl = document.getElementById(`lyric-line-${playbackState.lyricsIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [playbackState.lyricsIndex]);

  // Search handler
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const res = await fetch('/api/media/youtube-music-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery.trim(),
          filter: searchFilter,
        }),
      });

      if (!res.ok) {
        throw new Error('Nepodařilo se načíst výsledky vyhledávání');
      }

      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err: any) {
      setSearchError(err?.message || 'Vyhledávání selhalo');
    } finally {
      setIsSearching(false);
    }
  };

  // Helper to format seconds
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Associate track with active song
  const handleAttachToActiveSong = (track: MediaTrack) => {
    if (!activeSong) return;
    mediaCenterService.associateWithSong(track, activeSong.id);
  };

  // Create new songbook song from track
  const handleCreateSongFromTrack = (track: MediaTrack) => {
    if (!onAddSong) return;
    const newSong: Song = {
      id: 's_' + Date.now().toString(36),
      title: track.title,
      artist: track.artist || 'Neznámý interpret',
      key: track.key || 'G',
      bpm: track.bpm || 120,
      tuning: 'Standard (EADGBe)',
      chordsUsed: ['G', 'C', 'D', 'Em'],
      content: `[G] Úvodní sloka pro novou skladbu: ${track.title}
[C] Akordy a text můžete editovat přímo v Song Library.
[D] Přehrávač Media Center je propojen s touto skladbou.`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      youtubeVideos: track.youtubeId
        ? [
            {
              id: track.youtubeId,
              title: track.title,
              url: `https://www.youtube.com/watch?v=${track.youtubeId}`,
              type: 'backingtrack',
            },
          ]
        : [],
    };
    onAddSong(newSong);
    onSelectSong(newSong);
    if (onNavigateToTab) onNavigateToTab('songbook');
  };

  // Active Song Backing Tracks
  const activeSongTracks = activeSong ? mediaCenterService.getTracksForSong(activeSong.id) : [];

  return (
    <div className="flex flex-col h-full bg-[#0B0F19] text-slate-100 overflow-hidden font-sans select-none">
      {/* Hidden YouTube IFrame Container (Keeps audio playing seamlessly in background) */}
      <div
        className={`fixed ${
          isFullStageMode ? 'bottom-6 right-6 w-80 h-48 z-50 rounded-2xl overflow-hidden shadow-2xl border border-white/20' : 'top-[-9999px] left-[-9999px] w-1 h-1 opacity-0 pointer-events-none'
        }`}
      >
        <div id="media-center-yt-iframe" className="w-full h-full" />
      </div>

      {/* --- TOP HEADER & ACTIVE SONG BADGE --- */}
      <header className="px-6 py-4 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Disc3 className={`w-5 h-5 text-black ${playbackState.isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Media Center</h1>
              <span className="px-2 py-0.5 rounded-full text-stitek font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                Kaset Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">YouTube Music, backing tracky, texty & Smart Shuffle</p>
          </div>
        </div>

        {/* Active Song Connector Pill */}
        {activeSong ? (
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/80 rounded-2xl border border-slate-700/80 shadow-sm">
            <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-left">
              <div className="text-stitek uppercase font-bold text-slate-400 tracking-wider">Aktivní skladba</div>
              <div className="text-xs font-semibold text-white truncate max-w-[180px]">
                {activeSong.title} <span className="text-slate-400 font-normal">({activeSong.artist})</span>
              </div>
            </div>
            <div className="flex items-center gap-1 pl-2 border-l border-slate-700">
              <span className="px-1.5 py-0.5 rounded text-stitek font-bold bg-amber-500/20 text-amber-300">
                {activeSong.key || 'G'}
              </span>
              <span className="px-1.5 py-0.5 rounded text-stitek font-bold bg-slate-700 text-slate-300">
                {activeSong.bpm ? `${activeSong.bpm} BPM` : '120 BPM'}
              </span>
            </div>
            <button
              onClick={() => setActiveSubTab('active_song')}
              className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium text-xs transition-colors cursor-pointer"
            >
              Backing tracky ({activeSongTracks.length})
            </button>
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic">Žádná skladba není vybrána jako aktivní</div>
        )}

        {/* Stage Mode Toggle */}
        <button
          onClick={() => setIsFullStageMode(!isFullStageMode)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            isFullStageMode ? 'bg-amber-500 text-black font-bold' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
          }`}
        >
          {isFullStageMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span>{isFullStageMode ? 'Ukončit Stage View' : 'Stage / Full Player'}</span>
        </button>
      </header>

      {/* --- MAIN WORKSPACE CONTENT --- */}
      <div className="flex-1 flex overflow-hidden">
        {/* --- APPLE MUSIC-STYLE SUB-NAV SIDEBAR --- */}
        <nav className="w-56 bg-slate-950/60 border-r border-slate-800/80 p-3 flex flex-col justify-between shrink-0">
          <div className="space-y-4">
            <div>
              <div className="px-3 text-stitek font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Procházet & Hledat
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveSubTab('explore')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    activeSubTab === 'explore' ? 'bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Objevovat & YouTube</span>
                </button>
                <button
                  onClick={() => setActiveSubTab('active_song')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    activeSubTab === 'active_song' ? 'bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Music2 className="w-4 h-4" />
                  <span>Stopy Aktivní Písně</span>
                  {activeSongTracks.length > 0 && (
                    <span className="ml-auto text-stitek px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-bold">
                      {activeSongTracks.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveSubTab('lyrics')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    activeSubTab === 'lyrics' ? 'bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Mic2 className="w-4 h-4" />
                  <span>Texty & Akordy (LRC)</span>
                </button>
              </div>
            </div>

            <div>
              <div className="px-3 text-stitek font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Knihovna & Fronta
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveSubTab('queue')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    activeSubTab === 'queue' ? 'bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <ListMusic className="w-4 h-4" />
                  <span>Fronta (Up Next)</span>
                  {queue.length > 0 && (
                    <span className="ml-auto text-stitek px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-bold">
                      {queue.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveSubTab('liked')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    activeSubTab === 'liked' ? 'bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span>Oblíbené</span>
                  {likedTracks.length > 0 && (
                    <span className="ml-auto text-stitek px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-bold">
                      {likedTracks.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveSubTab('history')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    activeSubTab === 'history' ? 'bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Historie přehrávání</span>
                </button>
                <button
                  onClick={() => setActiveSubTab('playlists')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    activeSubTab === 'playlists' ? 'bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Cvičné Playlisty</span>
                </button>
              </div>
            </div>
          </div>

          {/* Smart Shuffle Mini Status */}
          <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Smart Shuffle</span>
              </div>
              <button
                onClick={() => mediaCenterService.toggleSmartShuffle()}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  playbackState.smartShuffle ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-0.5 ${
                    playbackState.smartShuffle ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <p className="text-drobne text-slate-400 leading-tight">
              Automaticky domíchává doporučené backing tracky dle žánru a tóniny.
            </p>
          </div>
        </nav>

        {/* --- SUB-TAB CONTENT AREA --- */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: EXPLORE & YOUTUBE SEARCH */}
          {activeSubTab === 'explore' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white mb-1">Vyhledávač Backing Tracků & YouTube Music</h2>
                  <p className="text-xs text-slate-400">
                    Najděte kytarové podklady, drumless smyčky, karaoke, originální nahrávky nebo video lekce.
                  </p>
                </div>

                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Vyhledejte interpreta, název písně, žánr nebo tóninu (např. Pink Floyd Comfortably Numb Backing Track)..."
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-bold text-xs rounded-2xl transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span>Hledat</span>
                  </button>
                </form>

                {/* Filter Pills */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { id: 'backingtrack', label: '🎸 Kytarový Backing Track' },
                    { id: 'drumless', label: '🥁 Drumless / Bicí doprovod' },
                    { id: 'bassless', label: '🎻 Bassless / Pro basu' },
                    { id: 'lesson', label: '🎓 Video Lekce & Akordy' },
                    { id: 'karaoke', label: '🎤 Karaoke & Vokály' },
                    { id: 'all', label: '✨ Všechny nahrávky' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSearchFilter(f.id as any);
                        if (searchQuery.trim()) {
                          setTimeout(() => handleSearch(), 50);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        searchFilter === f.id
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 border border-slate-700/50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Error */}
              {searchError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300">
                  {searchError}
                </div>
              )}

              {/* Search Results Grid */}
              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">Výsledky hledání ({searchResults.length})</h3>
                    <button
                      onClick={() => {
                        mediaCenterService.playTrack(searchResults[0], searchResults);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Přehrát vše</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {searchResults.map((track) => {
                      const isCurrent = playbackState.currentTrack?.youtubeId === track.youtubeId;
                      const isLiked = likedTracks.some((t) => t.youtubeId === track.youtubeId);

                      return (
                        <div
                          key={track.id}
                          className={`p-3 rounded-2xl border transition-all flex gap-3 group ${
                            isCurrent
                              ? 'bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5'
                              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                          }`}
                        >
                          <div
                            onClick={() => mediaCenterService.playTrack(track, searchResults)}
                            className="relative w-28 h-18 rounded-xl overflow-hidden bg-slate-950 shrink-0 cursor-pointer group-hover:opacity-90 transition-opacity"
                          >
                            <img
                              src={track.thumbnailUrl || `https://img.youtube.com/vi/${track.youtubeId}/mqdefault.jpg`}
                              alt={track.title}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="w-6 h-6 text-white fill-current" />
                            </div>
                            {isCurrent && playbackState.isPlaying && (
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-amber-500 text-black text-stitek font-bold">
                                Hraje
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div
                                onClick={() => mediaCenterService.playTrack(track, searchResults)}
                                className="text-xs font-bold text-white truncate hover:text-amber-400 transition-colors cursor-pointer"
                                title={track.title}
                              >
                                {track.title}
                              </div>
                              <div className="text-drobne text-slate-400 truncate mt-0.5">{track.artist}</div>
                            </div>

                            <div className="flex items-center gap-1 pt-2">
                              <button
                                onClick={() => mediaCenterService.toggleLike(track)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  isLiked ? 'text-rose-500 hover:bg-rose-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                                title={isLiked ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
                              >
                                <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                onClick={() => mediaCenterService.addToQueue(track, 'next')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Přehrát jako další"
                              >
                                <CornerDownRight className="w-3.5 h-3.5" />
                              </button>
                              {activeSong && (
                                <button
                                  onClick={() => handleAttachToActiveSong(track)}
                                  className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-stitek font-semibold transition-colors cursor-pointer"
                                  title={`Přiřadit k písni ${activeSong.title}`}
                                >
                                  + K písni
                                </button>
                              )}
                              <button
                                onClick={() => handleCreateSongFromTrack(track)}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-stitek font-medium transition-colors cursor-pointer ml-auto"
                                title="Vytvořit novou skladbu v Song Library z tohoto podkladu"
                              >
                                + Song Library
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Suggested Curated Practice Channels */}
              {searchResults.length === 0 && !isSearching && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Doporučené cvičné jam podklady</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { title: 'A Minor Blues Rock Jam Track', artist: 'Guitar Jam Tracks', key: 'Am', bpm: 95 },
                      { title: 'Pink Floyd Style Slow Gilmour Backing', artist: 'Now YOU Shred', key: 'Bm', bpm: 72 },
                      { title: 'Acoustic Campfire Strumming in G Major', artist: 'Acoustic Guitar Club', key: 'G', bpm: 110 },
                    ].map((sample, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setSearchQuery(sample.title);
                          setTimeout(() => handleSearch(), 50);
                        }}
                        className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-amber-500/40 hover:bg-slate-900 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-stitek font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            {sample.key}
                          </span>
                          <span className="text-stitek text-slate-400">{sample.bpm} BPM</span>
                        </div>
                        <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                          {sample.title}
                        </div>
                        <div className="text-drobne text-slate-400 mt-1">{sample.artist}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVE SONG ATTACHED MEDIA */}
          {activeSubTab === 'active_song' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Music2 className="w-5 h-5 text-amber-400" />
                      <span>Backing Tracky pro: {activeSong ? activeSong.title : 'Žádná vybraná píseň'}</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Média a podklady navázané na právě cvičenou skladbu v NeverLate Studio.
                    </p>
                  </div>
                  {activeSong && (
                    <button
                      onClick={() => {
                        setSearchQuery(`${activeSong.artist} ${activeSong.title} backing track`);
                        setActiveSubTab('explore');
                        setTimeout(() => handleSearch(), 50);
                      }}
                      className="px-4 py-2 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Hledat další podklady</span>
                    </button>
                  )}
                </div>
              </div>

              {activeSongTracks.length === 0 ? (
                <div className="p-12 text-center bg-slate-900/30 border border-slate-800/60 rounded-3xl space-y-3">
                  <Film className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">K této skladbě zatím nejsou přiřazena žádná média.</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Přejděte do sekce <b>Objevovat</b> a vyhledejte backing track, nebo klikněte na tlačítko výše pro automatické vyhledání.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeSongTracks.map((track) => {
                    const isCurrent = playbackState.currentTrack?.youtubeId === track.youtubeId;
                    return (
                      <div
                        key={track.id}
                        className={`p-4 rounded-2xl border transition-all flex gap-3 ${
                          isCurrent ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-900/70 border-slate-800'
                        }`}
                      >
                        <div
                          onClick={() => mediaCenterService.playTrack(track, activeSongTracks)}
                          className="relative w-28 h-18 rounded-xl overflow-hidden bg-slate-950 shrink-0 cursor-pointer"
                        >
                          <img
                            src={track.thumbnailUrl || `https://img.youtube.com/vi/${track.youtubeId}/mqdefault.jpg`}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <Play className="w-6 h-6 text-white fill-current" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div
                              onClick={() => mediaCenterService.playTrack(track, activeSongTracks)}
                              className="text-xs font-bold text-white truncate cursor-pointer hover:text-amber-400"
                            >
                              {track.title}
                            </div>
                            <div className="text-drobne text-slate-400 truncate">{track.artist}</div>
                          </div>

                          <div className="flex items-center gap-2 pt-2">
                            <button
                              onClick={() => mediaCenterService.playTrack(track, activeSongTracks)}
                              className="px-3 py-1 bg-amber-500 text-black font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Přehrát</span>
                            </button>
                            <button
                              onClick={() => {
                                if (activeSong) {
                                  mediaCenterService.removeSongAssociation(track.id, activeSong.id);
                                }
                              }}
                              className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer ml-auto"
                              title="Odebrat z této skladby"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: QUEUE & SMART SHUFFLE */}
          {activeSubTab === 'queue' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="flex items-center justify-between p-6 bg-slate-900/70 border border-slate-800 rounded-3xl">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ListMusic className="w-5 h-5 text-amber-400" />
                    <span>Fronta přehrávání (Up Next)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {queue.length} {queue.length === 1 ? 'stopa' : 'stop'} v pořadí
                  </p>
                </div>
                {queue.length > 0 && (
                  <button
                    onClick={() => mediaCenterService.clearQueue()}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
                  >
                    Vyčistit frontu
                  </button>
                )}
              </div>

              {queue.length === 0 ? (
                <div className="p-12 text-center bg-slate-900/30 border border-slate-800/60 rounded-3xl space-y-2">
                  <p className="text-xs text-slate-400">Fronta je prázdná.</p>
                  <p className="text-drobne text-slate-500">
                    Se zapnutým <b>Smart Shuffle</b> se automaticky načtou další vhodné skladby při dohrání.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {queue.map((track, idx) => (
                    <div
                      key={`${track.id}_${idx}`}
                      className="p-3 bg-slate-900/70 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 group hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold text-slate-500 w-5 text-center">{idx + 1}</span>
                        <img
                          src={track.thumbnailUrl || `https://img.youtube.com/vi/${track.youtubeId}/mqdefault.jpg`}
                          alt=""
                          className="w-12 h-9 rounded-lg object-cover bg-slate-950"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{track.title}</div>
                          <div className="text-drobne text-slate-400 truncate">{track.artist}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => mediaCenterService.playTrack(track)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-black text-slate-300 transition-colors cursor-pointer"
                          title="Přehrát ihned"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={() => mediaCenterService.removeFromQueue(track.id)}
                          className="p-2 rounded-xl text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Odebrat z fronty"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LIKED SONGS */}
          {activeSubTab === 'liked' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-3xl flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Heart className="w-5 h-5 text-rose-500 fill-current" />
                    <span>Oblíbené Backing Tracky</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">{likedTracks.length} uložených podkladů</p>
                </div>
                {likedTracks.length > 0 && (
                  <button
                    onClick={() => mediaCenterService.playTrack(likedTracks[0], likedTracks)}
                    className="px-4 py-2 rounded-2xl bg-amber-500 text-black font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Přehrát oblíbené</span>
                  </button>
                )}
              </div>

              {likedTracks.length === 0 ? (
                <div className="p-12 text-center bg-slate-900/30 border border-slate-800/60 rounded-3xl text-xs text-slate-500">
                  Zatím jste si neoblíbili žádné stopy. Klikněte na ikonu srdíčka u libovolného podkladu.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {likedTracks.map((track) => (
                    <div
                      key={track.id}
                      className="p-3 bg-slate-900/70 border border-slate-800 rounded-2xl flex items-center gap-3 group hover:border-slate-700"
                    >
                      <img
                        src={track.thumbnailUrl || `https://img.youtube.com/vi/${track.youtubeId}/mqdefault.jpg`}
                        alt=""
                        className="w-14 h-11 rounded-xl object-cover bg-slate-950 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          onClick={() => mediaCenterService.playTrack(track, likedTracks)}
                          className="text-xs font-bold text-white truncate cursor-pointer hover:text-amber-400"
                        >
                          {track.title}
                        </div>
                        <div className="text-drobne text-slate-400 truncate">{track.artist}</div>
                      </div>
                      <button
                        onClick={() => mediaCenterService.toggleLike(track)}
                        className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                      >
                        <Heart className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: HISTORY */}
          {activeSubTab === 'history' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-3xl">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-amber-400" />
                  <span>Historie cvičení & přehrávání</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Naposledy spuštěné podklady a písně</p>
              </div>

              <div className="space-y-2">
                {history.map((track, idx) => (
                  <div
                    key={`${track.id}_${idx}`}
                    className="p-3 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={track.thumbnailUrl || `https://img.youtube.com/vi/${track.youtubeId}/mqdefault.jpg`}
                        alt=""
                        className="w-12 h-9 rounded-lg object-cover bg-slate-950 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div
                          onClick={() => mediaCenterService.playTrack(track)}
                          className="text-xs font-bold text-white truncate cursor-pointer hover:text-amber-400"
                        >
                          {track.title}
                        </div>
                        <div className="text-drobne text-slate-400 truncate">{track.artist}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => mediaCenterService.playTrack(track)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-black text-slate-300 transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: PLAYLISTS */}
          {activeSubTab === 'playlists' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-3xl flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-400" />
                    <span>Cvičné Setlisty & Playlisty</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Sady podkladů organizované podle žánru a stylu</p>
                </div>
                <button
                  onClick={() => setIsCreatePlaylistOpen(true)}
                  className="px-4 py-2 rounded-2xl bg-amber-500 text-black font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nový Playlist</span>
                </button>
              </div>

              {isCreatePlaylistOpen && (
                <div className="p-4 bg-slate-900 border border-amber-500/40 rounded-2xl flex gap-2">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Název nového cvičebního playlistu..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      if (newPlaylistName.trim()) {
                        mediaCenterService.createPlaylist(newPlaylistName.trim());
                        setNewPlaylistName('');
                        setIsCreatePlaylistOpen(false);
                      }
                    }}
                    className="px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Vytvořit
                  </button>
                  <button
                    onClick={() => setIsCreatePlaylistOpen(false)}
                    className="px-3 py-2 bg-slate-800 text-slate-400 text-xs rounded-xl cursor-pointer"
                  >
                    Zrušit
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {playlists.map((pl) => (
                  <div
                    key={pl.id}
                    className="p-5 bg-slate-900/70 border border-slate-800 rounded-3xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all group"
                  >
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-2xl border border-slate-700">
                        {pl.icon || '🎵'}
                      </div>
                      <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">{pl.name}</h3>
                      <p className="text-xs text-slate-400 line-clamp-2">{pl.description || 'Vlastní cvičný playlist'}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-drobne text-slate-500 font-medium">{pl.trackIds.length} skladeb</span>
                      {pl.isCustom && (
                        <button
                          onClick={() => mediaCenterService.deletePlaylist(pl.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: SYNCHRONIZED LYRICS & CHORDS (LRC) */}
          {activeSubTab === 'lyrics' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-3xl flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Mic2 className="w-5 h-5 text-amber-400" />
                    <span>Synchronizovaný text a akordy (LRC)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {playbackState.currentTrack ? playbackState.currentTrack.title : 'Není spuštěna žádná stopa'}
                  </p>
                </div>
              </div>

              <div
                ref={lyricsContainerRef}
                className="p-8 bg-slate-950/80 border border-slate-800/80 rounded-3xl max-h-[500px] overflow-y-auto space-y-4 text-center backdrop-blur-md"
              >
                {lyrics.length === 0 ? (
                  <div className="py-12 text-slate-500 text-xs italic">
                    Text není k dispozici nebo se nepodařilo načíst synchronizovaný LRC soubor.
                  </div>
                ) : (
                  lyrics.map((line, idx) => {
                    const isActive = idx === playbackState.lyricsIndex;
                    return (
                      <div
                        key={idx}
                        id={`lyric-line-${idx}`}
                        onClick={() => mediaCenterService.seekTo(line.time)}
                        className={`p-3 rounded-2xl transition-all cursor-pointer ${
                          isActive
                            ? 'text-amber-400 font-bold text-lg scale-105 bg-amber-500/10 border border-amber-500/20 shadow-md'
                            : 'text-slate-400 hover:text-slate-200 text-sm'
                        }`}
                      >
                        {line.text}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* --- BOTTOM MASTER MEDIA BAR (Apple / Kaset Style Dock) --- */}
      <footer className="h-24 bg-slate-950/90 backdrop-blur-2xl border-t border-slate-800/90 px-6 flex items-center justify-between gap-6 shrink-0 relative z-30">
        {/* Left Track Info */}
        <div className="flex items-center gap-3.5 w-1/4 min-w-[200px]">
          {playbackState.currentTrack ? (
            <>
              <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0 group">
                <img
                  src={
                    playbackState.currentTrack.thumbnailUrl ||
                    `https://img.youtube.com/vi/${playbackState.currentTrack.youtubeId || 'default'}/mqdefault.jpg`
                  }
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => setIsFullStageMode(!isFullStageMode)}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-white"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate hover:text-amber-400 cursor-pointer">
                  {playbackState.currentTrack.title}
                </div>
                <div className="text-drobne text-slate-400 truncate mt-0.5">
                  {playbackState.currentTrack.artist || 'NeverLate Backing Track'}
                </div>
              </div>

              <button
                onClick={() => {
                  if (playbackState.currentTrack) {
                    mediaCenterService.toggleLike(playbackState.currentTrack);
                  }
                }}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  playbackState.currentTrack.isLiked ? 'text-rose-500' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Heart className={`w-4 h-4 ${playbackState.currentTrack.isLiked ? 'fill-current' : ''}`} />
              </button>
            </>
          ) : (
            <div className="text-xs text-slate-500 italic">Žádná stopa nepřehrává</div>
          )}
        </div>

        {/* Center Transport & Timeline Scrubber */}
        <div className="flex-1 max-w-2xl flex flex-col items-center gap-1.5">
          {/* Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => mediaCenterService.toggleSmartShuffle()}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                playbackState.smartShuffle ? 'text-amber-400 bg-amber-500/15' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Smart Shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={() => mediaCenterService.playPrev()}
              className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Předchozí stopa"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={() => mediaCenterService.togglePlay()}
              className="w-10 h-10 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition-transform active:scale-95 shadow-lg shadow-amber-500/25 cursor-pointer"
            >
              {playbackState.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => mediaCenterService.playNext()}
              className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Další stopa"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={() => {
                const nextMode = playbackState.loopMode === 'off' ? 'all' : playbackState.loopMode === 'all' ? 'one' : 'off';
                mediaCenterService.setLoopMode(nextMode);
              }}
              className={`p-2 rounded-xl transition-colors cursor-pointer relative ${
                playbackState.loopMode !== 'off' ? 'text-amber-400 bg-amber-500/15' : 'text-slate-500 hover:text-slate-300'
              }`}
              title={`Smyčka: ${playbackState.loopMode}`}
            >
              <Repeat className="w-4 h-4" />
              {playbackState.loopMode === 'one' && (
                <span className="absolute text-stitek font-extrabold top-1 right-1">1</span>
              )}
            </button>
          </div>

          {/* Scrubber Timeline */}
          <div className="w-full flex items-center gap-3">
            <span className="text-drobne font-mono text-slate-400 w-10 text-right">
              {formatTime(playbackState.currentTime)}
            </span>
            <div className="flex-1 relative flex items-center">
              <input
                type="range"
                min={0}
                max={playbackState.duration || 100}
                step={0.5}
                value={playbackState.currentTime}
                onChange={(e) => mediaCenterService.seekTo(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>
            <span className="text-drobne font-mono text-slate-400 w-10">
              {formatTime(playbackState.duration)}
            </span>
          </div>
        </div>

        {/* Right Tools: Speed, A-B Loop, Volume */}
        <div className="flex items-center gap-3.5 w-1/4 justify-end min-w-[200px]">
          {/* Speed Selector */}
          <select
            value={playbackState.playbackSpeed}
            onChange={(e) => mediaCenterService.setPlaybackSpeed(parseFloat(e.target.value))}
            className="bg-slate-900 border border-slate-800 text-drobne font-bold text-amber-400 rounded-xl px-2 py-1 outline-none cursor-pointer hover:border-amber-500/40"
            title="Rychlost přehrávání"
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="0.9">0.9x</option>
            <option value="1.0">1.0x</option>
            <option value="1.1">1.1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
          </select>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => mediaCenterService.toggleMute()}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              {playbackState.isMuted || playbackState.volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={playbackState.isMuted ? 0 : playbackState.volume}
              onChange={(e) => mediaCenterService.setVolume(parseInt(e.target.value, 10))}
              className="w-18 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>
      </footer>
    </div>
  );
};
