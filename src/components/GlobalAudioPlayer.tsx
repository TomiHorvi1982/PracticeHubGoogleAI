import React, { useState, useEffect, useRef } from 'react';
import { audioBus } from '../services/audioBus';
import { nactiYouTubeApi } from '../services/youtubeApi';
import { PlaylistItem, UserAccount } from '../types';
import { eventBus } from '../services/eventBus';
import { fileUrlService } from '../services/fileUrlService';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Repeat, Shuffle,
  ListMusic, Maximize2, Minimize2, Pin, PinOff, GripHorizontal,
  PanelBottom, Move, Users, Sparkles, ChevronUp, ExternalLink
} from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export type PlayerMode = 'dock' | 'floating' | 'minimized';

interface GlobalAudioPlayerProps {
  playlist: PlaylistItem[];
  currentTrackIndex: number;
  onSelectTrackIndex: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  playbackMode: 'normal' | 'loop-one' | 'loop-all' | 'shuffle';
  onChangePlaybackMode: (mode: 'normal' | 'loop-one' | 'loop-all' | 'shuffle') => void;
  onOpenPlaylistTab: () => void;
  currentUser: UserAccount | null;
  onOpenOnlineUsersModal?: () => void;
}

export const GlobalAudioPlayer: React.FC<GlobalAudioPlayerProps> = ({
  playlist,
  currentTrackIndex,
  onSelectTrackIndex,
  isPlaying,
  onTogglePlay,
  onNextTrack,
  onPrevTrack,
  playbackMode,
  onChangePlaybackMode,
  onOpenPlaylistTab,
  currentUser,
}) => {
  const currentTrack = playlist[currentTrackIndex] || null;
  const playerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeContainerId = 'global-youtube-player-iframe';

  /** Hraje se ze souboru v knihovně, ne z YouTube. */
  const jeSoubor = !!currentTrack && !currentTrack.youtubeId;
  const [odkazSouboru, setOdkazSouboru] = useState<string | null>(null);
  const [chybaSouboru, setChybaSouboru] = useState<string | null>(null);

  /**
   * Jedno ovládání pro oba zdroje zvuku.
   *
   * Přehrávač uměl jen YouTube a volal jeho API přímo. Se soubory z
   * knihovny by se každé takové místo muselo větvit zvlášť — a stačí
   * zapomenout na jedno, aby tlačítko u jednoho druhu položky tiše
   * nedělalo nic. Tohle je jediné místo, kde se ten rozdíl řeší.
   */
  const motor = () => {
    if (jeSoubor) {
      const a = audioRef.current;
      return {
        play: () => { void a?.play().catch(() => {}); },
        pause: () => a?.pause(),
        seekTo: (s: number) => { if (a) a.currentTime = s; },
        cas: () => a?.currentTime || 0,
        delka: () => (Number.isFinite(a?.duration) ? a!.duration : 0),
        hlasitost: (v: number) => { if (a) a.volume = Math.max(0, Math.min(1, v / 100)); },
      };
    }
    const p = playerRef.current;
    return {
      play: () => { try { p?.playVideo?.(); } catch { /* ještě není hotový */ } },
      pause: () => { try { p?.pauseVideo?.(); } catch { /* ještě není hotový */ } },
      seekTo: (s: number) => { try { p?.seekTo?.(s, true); } catch { /* ještě není hotový */ } },
      cas: () => { try { return p?.getCurrentTime?.() || 0; } catch { return 0; } },
      delka: () => { try { return p?.getDuration?.() || 0; } catch { return 0; } },
      hlasitost: (v: number) => { try { p?.setVolume?.(v); } catch { /* ještě není hotový */ } },
    };
  };

  // Registrace u sběrnice: jiný zdroj zvuku tímhle tenhle přehrávač zastaví.
  // Musí se registrovat při připojení, ne až při přehrávání — zastavit ho
  // potřebují i ve chvíli, kdy si o slovo řekne někdo jiný.
  useEffect(() => {
    return audioBus.register('global-player', () => {
      try {
        playerRef.current?.pauseVideo?.();
      } catch {
        /* přehrávač ještě nemusí být připravený */
      }
    });
  }, []);

  const [isApiReady, setIsApiReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoFloatingOpen, setIsVideoFloatingOpen] = useState(false);

  // --- PLAYER MODES & AUTO-HIDE STATES ---
  const [playerMode, setPlayerMode] = useState<PlayerMode>(() => {
    return (localStorage.getItem('strum_player_mode') as PlayerMode) || 'dock';
  });

  const [isDockPinned, setIsDockPinned] = useState<boolean>(() => {
    return localStorage.getItem('strum_dock_pinned') === 'true';
  });

  const [isDockHovered, setIsDockHovered] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Floating Position & Dragging State
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('strum_player_floating_pos');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 400),
      y: Math.max(16, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220),
    };
  });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number }>({ x: 0, y: 0, posX: 0, posY: 0 });

  // Save Player Mode
  const updatePlayerMode = (mode: PlayerMode) => {
    setPlayerMode(mode);
    localStorage.setItem('strum_player_mode', mode);
  };

  // Toggle Pin
  const toggleDockPinned = () => {
    const next = !isDockPinned;
    setIsDockPinned(next);
    localStorage.setItem('strum_dock_pinned', String(next));
  };

  // Bottom Hover Auto-Hide Handlers
  const handleMouseEnterZone = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setIsDockHovered(true);
  };

  const handleMouseLeaveZone = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setIsDockHovered(false);
    }, 1500); // 1.5s delay before hiding
  };

  // Draggable Window Handler for Floating & Minimized Modes
  const handleMouseDownDrag = (e: React.MouseEvent) => {
    // Only left click
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: floatingPos.x,
      posY: floatingPos.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;
      const newX = Math.min(Math.max(10, dragStartRef.current.posX + dx), window.innerWidth - 120);
      const newY = Math.min(Math.max(10, dragStartRef.current.posY + dy), window.innerHeight - 80);

      const pos = { x: newX, y: newY };
      setFloatingPos(pos);
      localStorage.setItem('strum_player_floating_pos', JSON.stringify(pos));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Načtení YouTube API přes společný zavaděč. Vlastní `onYouTubeIframeAPIReady`
  // tady přepisovalo tu, kterou si nastavil Media Center — a ten pak čekal na
  // ohlášení, které už nikdy nepřišlo.
  useEffect(() => {
    let zivy = true;
    void nactiYouTubeApi()
      .then(() => zivy && setIsApiReady(true))
      .catch((e) => console.warn('[GlobalAudioPlayer] YouTube API:', e?.message));
    return () => {
      zivy = false;
    };
  }, []);

  // Initialize or update YouTube Player singleton
  useEffect(() => {
    if (!isApiReady || !currentTrack?.youtubeId) return;

    if (!playerRef.current) {
      playerRef.current = new window.YT.Player(iframeContainerId, {
        height: '100%',
        width: '100%',
        videoId: currentTrack.youtubeId,
        playerVars: {
          autoplay: isPlaying ? 1 : 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            event.target.setVolume(volume);
            if (isPlaying) {
              try { event.target.playVideo(); } catch (e) {}
            }
          },
          onStateChange: (event: any) => {
            // Jakmile tenhle přehrávač začne hrát, ostatní zdroje zvuku se
            // zastaví — jinak by hrály současně.
            if (event.data === 1)
              audioBus.claim('global-player', currentTrack?.title || '', 'Přehrávač');
            if (event.data === 2 || event.data === 0) audioBus.release('global-player');
            if (event.data === 0) { // ENDED
              if (playbackMode === 'loop-one') {
                event.target.seekTo(0);
                event.target.playVideo();
              } else {
                onNextTrack();
              }
            }
          },
        },
      });
    } else {
      try {
        const currentVideoUrl = playerRef.current.getVideoUrl?.() || '';
        if (!currentVideoUrl.includes(currentTrack.youtubeId)) {
          if (isPlaying) {
            playerRef.current.loadVideoById(currentTrack.youtubeId);
          } else {
            playerRef.current.cueVideoById(currentTrack.youtubeId);
          }
        }
      } catch (e) {
        console.warn('Error loading video by ID', e);
      }
    }
  }, [isApiReady, currentTrack?.youtubeId]);

  /**
   * Podepsaný odkaz na soubor z knihovny.
   *
   * Soubory leží v R2 a `<audio>` neumí poslat přihlašovací hlavičku,
   * takže se odkaz musí nechat podepsat serverem. Podpis platí omezeně,
   * proto se žádá až ve chvíli, kdy je položka na řadě.
   */
  useEffect(() => {
    if (!jeSoubor) {
      setOdkazSouboru(null);
      setChybaSouboru(null);
      return;
    }
    if (!currentTrack?.storageBucket || !currentTrack?.storagePath) {
      setOdkazSouboru(null);
      setChybaSouboru('Tahle položka nemá zvukový soubor — přidej ji znovu z knihovny.');
      return;
    }

    let zivy = true;
    setChybaSouboru(null);
    fileUrlService
      .getMany([{ bucket: currentTrack.storageBucket, path: currentTrack.storagePath }])
      .then((mapa) => {
        if (!zivy) return;
        const url = mapa.get(`${currentTrack.storageBucket}/${currentTrack.storagePath}`);
        if (url) setOdkazSouboru(url);
        else setChybaSouboru('Soubor se nepodařilo otevřít z úložiště.');
      })
      .catch((e) => {
        if (zivy) setChybaSouboru(e?.message || 'Soubor se nepodařilo otevřít.');
      });

    return () => {
      zivy = false;
    };
  }, [jeSoubor, currentTrack?.assetId, currentTrack?.storagePath]);

  // Handle Play/Pause state change & Master Transport Bus Events
  useEffect(() => {
    if (isPlaying) motor().play();
    else motor().pause();
  }, [isPlaying, jeSoubor, odkazSouboru]);

  useEffect(() => {
    const unsubPlay = eventBus.on('TRANSPORT_PLAY', () => motor().play());
    const unsubPause = eventBus.on('TRANSPORT_PAUSE', () => motor().pause());
    const unsubSeek = eventBus.on('TRANSPORT_SEEK', (payload) => motor().seekTo(payload.positionMs / 1000));

    return () => {
      unsubPlay();
      unsubPause();
      unsubSeek();
    };
  }, []);

  // Track progress timer
  useEffect(() => {
    const interval = setInterval(() => {
      const m = motor();
      setCurrentTime(m.cas());
      const dur = m.delka();
      if (dur > 0) setDuration(dur);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Handle seeking
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTo = Number(e.target.value);
    setCurrentTime(seekTo);
    motor().seekTo(seekTo);
  };

  // Handle Volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = Number(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    motor().hlasitost(newVol);
    if (newVol > 0) {
      try { playerRef.current?.unMute?.(); } catch { /* ještě není hotový */ }
      if (audioRef.current) audioRef.current.muted = false;
    }
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const zticha = !isMuted;
    setIsMuted(zticha);
    if (audioRef.current) audioRef.current.muted = zticha;
    try {
      if (zticha) playerRef.current?.mute?.();
      else {
        playerRef.current?.unMute?.();
        playerRef.current?.setVolume?.(volume || 50);
      }
    } catch { /* ještě není hotový */ }
  };

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Cycle playback mode
  const cycleMode = () => {
    if (playbackMode === 'normal') onChangePlaybackMode('loop-all');
    else if (playbackMode === 'loop-all') onChangePlaybackMode('loop-one');
    else if (playbackMode === 'loop-one') onChangePlaybackMode('shuffle');
    else onChangePlaybackMode('normal');
  };

  if (!currentTrack) {
    return (
      <div className="hidden">
        <div id={iframeContainerId}></div>
      </div>
    );
  }

  const isDockVisible = isDockPinned || isDockHovered;

  return (
    <>
      {/* 1. SINGLETON YOUTUBE IFRAME CONTAINER - ALWAYS MOUNTED & PRESERVED ACROSS ALL MODES */}
      <div
        className={`fixed z-50 transition-all duration-300 ${
          isVideoFloatingOpen
            ? 'bottom-24 right-6 w-80 sm:w-96 h-48 sm:h-56 bg-[#1C1C1E] rounded-2xl overflow-hidden border border-white/20 shadow-2xl shadow-black/80 pointer-events-auto'
            : 'pointer-events-none opacity-0 w-1 h-1 bottom-0 left-0 overflow-hidden'
        }`}
      >
        {isVideoFloatingOpen && (
          <div className="bg-[#2C2C2E] px-3 py-2 flex items-center justify-between border-b border-white/10 text-xs font-medium text-white">
            <span className="truncate max-w-[220px]">{currentTrack.title}</span>
            <button
              onClick={() => setIsVideoFloatingOpen(false)}
              className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>
        )}
        <div className="w-full h-full">
          <div id={iframeContainerId} className="w-full h-full"></div>
        </div>
      </div>

      {/**
   * Zvuk ze souboru v knihovně. Leží mimo plovoucí okno videa, protože
   * to se dá zavřít — a hudba by se zavřením okna zastavila.
   */}
      <audio
        ref={audioRef}
        src={odkazSouboru || undefined}
        preload="metadata"
        onPlay={() => audioBus.claim('global-player', currentTrack.title || '', 'Přehrávač')}
        onPause={() => audioBus.release('global-player')}
        onEnded={() => {
          if (playbackMode === 'loop-one') {
            motor().seekTo(0);
            motor().play();
          } else {
            onNextTrack();
          }
        }}
        className="hidden"
      />
      

      {/* 2. AUTO-HIDE BOTTOM REVEAL TRIGGER ZONE (ACTIVE ONLY IN DOCK MODE) */}
      {playerMode === 'dock' && (
        <div
          onMouseEnter={handleMouseEnterZone}
          onMouseLeave={handleMouseLeaveZone}
          className="fixed bottom-0 left-0 right-0 h-6 z-40 cursor-pointer group flex items-end justify-center"
        >
          {/* Subtle floating visual glow indicator when dock is auto-hidden */}
          {!isDockVisible && (
            <div className="mb-1.5 px-4 py-0.5 bg-znacka/90 hover:bg-znacka text-black font-bold text-stitek rounded-full shadow-lg shadow-znacka/30 transition-all transform hover:scale-105 flex items-center gap-1">
              <ChevronUp className="w-3 h-3 animate-bounce" />
              <span>Přehrávač</span>
            </div>
          )}
        </div>
      )}

      {/* 3. MODE 1: BOTTOM AUTO-HIDE DOCK PLAYER */}
      {playerMode === 'dock' && (
        <div
          onMouseEnter={handleMouseEnterZone}
          onMouseLeave={handleMouseLeaveZone}
          className={`fixed bottom-0 left-0 right-0 z-40 bg-[#141418]/95 backdrop-blur-2xl border-t border-white/[0.1] shadow-[0_-8px_32px_rgba(0,0,0,0.6)] select-none transition-transform duration-300 ease-in-out ${
            isDockVisible ? 'translate-y-0 opacity-100' : 'translate-y-[calc(100%-4px)] opacity-95 hover:translate-y-0'
          }`}
        >
          {/* Top Progress bar line */}
          <div className="relative w-full h-1 bg-white/[0.08] cursor-pointer group">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div
              className="h-full bg-gradient-to-r from-znacka to-chyba transition-all relative rounded-r-full"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="hidden group-hover:block absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,159,10,0.8)]"></div>
            </div>
          </div>

          <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 sm:gap-6">
            
            {/* Left: Track Info & Band Presence */}
            <div className="flex items-center gap-3 min-w-0 flex-1 sm:max-w-md">
              <div className="relative w-11 h-11 sm:w-12 sm:h-12 bg-neutral-900 rounded-xl border border-white/10 shrink-0 overflow-hidden group shadow-md">
                <img
                  src={currentTrack.thumbnail || `https://img.youtube.com/vi/${currentTrack.youtubeId}/mqdefault.jpg`}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => setIsVideoFloatingOpen(!isVideoFloatingOpen)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                  title="Zobrazit / Skrýt video"
                >
                  {isVideoFloatingOpen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-drobne sm:text-zaklad font-semibold text-white truncate">
                    {currentTrack.title}
                  </span>
                  <span className="text-stitek font-medium px-1.5 py-0.5 rounded-md bg-white/[0.08] text-neutral-300 shrink-0">
                    {isPlaying ? 'Hraje' : 'Pozastaveno'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400 truncate mt-0.5">
                  {currentTrack.artist && <span>{currentTrack.artist}</span>}
                </div>
              </div>
            </div>

            {/* Center: Playback Controls */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="flex items-center gap-3 sm:gap-5">
                
                {/* Mode button */}
                <button
                  onClick={cycleMode}
                  className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${
                    playbackMode === 'normal' ? 'text-neutral-400' : 'text-znacka'
                  }`}
                  title={`Režim přehrávání: ${playbackMode}`}
                >
                  {playbackMode === 'shuffle' ? (
                    <Shuffle className="w-4 h-4" />
                  ) : (
                    <Repeat className="w-4 h-4" />
                  )}
                </button>

                {/* Previous */}
                <button
                  onClick={onPrevTrack}
                  className="p-1.5 text-neutral-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  title="Předchozí skladba"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                {/* Play / Pause Primary Button */}
                <button
                  onClick={onTogglePlay}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white text-black flex items-center justify-center font-bold hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-white/10 cursor-pointer"
                  title={isPlaying ? 'Pozastavit' : 'Přehrát'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                {/* Next */}
                <button
                  onClick={onNextTrack}
                  className="p-1.5 text-neutral-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                  title="Následující skladba"
                >
                  <SkipForward className="w-5 h-5" />
                </button>

                {/* Video toggle button */}
                <button
                  onClick={() => setIsVideoFloatingOpen(!isVideoFloatingOpen)}
                  className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${
                    isVideoFloatingOpen ? 'text-uspech' : 'text-neutral-400'
                  }`}
                  title="Zobrazit video okno"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {/* Time display */}
              <div className="text-drobne text-neutral-400 flex items-center gap-1.5 font-medium tabular-nums">
                <span className="text-white">{formatTime(currentTime)}</span>
                <span className="text-neutral-600">/</span>
                <span>{formatTime(duration)}</span>
                <span className="hidden sm:inline text-neutral-500 ml-1">
                  ({currentTrackIndex + 1} z {playlist.length})
                </span>
              </div>
            </div>

            {/* Right: Volume, Mode Switchers & Pin */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              
              {/* Volume slider */}
              <div className="hidden md:flex items-center gap-2 border-r border-white/10 pr-3">
                <button
                  onClick={handleToggleMute}
                  className="text-neutral-400 hover:text-white p-1 rounded-lg transition-colors"
                  title={isMuted ? 'Zrušit ztlumení' : 'Ztlumit'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-chyba" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-20 h-1.5 bg-white/20 rounded-full accent-white cursor-pointer"
                />
              </div>

              {/* Open Playlist Button */}
              <button
                onClick={onOpenPlaylistTab}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.08] rounded-xl text-xs font-medium transition-all shadow-sm"
                title="Otevřít playlist"
              >
                <ListMusic className="w-4 h-4 text-znacka" />
                <span className="hidden sm:inline">Playlist</span>
              </button>

              {/* Pin / Lock Dock Toggle */}
              <button
                onClick={toggleDockPinned}
                className={`p-1.5 rounded-xl border transition-all ${
                  isDockPinned
                    ? 'bg-znacka/20 text-znacka border-znacka/40'
                    : 'bg-white/[0.04] text-neutral-400 hover:text-white border-white/10'
                }`}
                title={isDockPinned ? 'Přehrávač je připnutý (stále viditelný)' : 'Přehrávač se automaticky skrývá'}
              >
                {isDockPinned ? <Pin className="w-4 h-4 fill-current" /> : <PinOff className="w-4 h-4" />}
              </button>

              {/* Switch to Floating Mode */}
              <button
                onClick={() => updatePlayerMode('floating')}
                className="p-1.5 bg-white/[0.08] hover:bg-white/[0.16] text-white rounded-xl border border-white/10 transition-all flex items-center gap-1 text-xs"
                title="Přepnout do plovoucího okna"
              >
                <Move className="w-4 h-4 text-uspech" />
              </button>

            </div>

          </div>
        </div>
      )}

      {/* 4. MODE 2: FLOATING DETACHED DRAGGABLE PLAYER */}
      {playerMode === 'floating' && (
        <div
          style={{ left: `${floatingPos.x}px`, top: `${floatingPos.y}px` }}
          className="fixed z-50 w-[360px] sm:w-[400px] bg-[#16161A]/95 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Header Drag Bar */}
          <div
            onMouseDown={handleMouseDownDrag}
            className="bg-white/[0.04] border-b border-white/10 px-4 py-2.5 flex items-center justify-between cursor-move group hover:bg-white/[0.08] transition-colors"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-4 h-4 text-neutral-400 group-hover:text-white" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Floating Player
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => updatePlayerMode('minimized')}
                className="p-1 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Minimalizovat do pilulky"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => updatePlayerMode('dock')}
                className="p-1 text-neutral-400 hover:text-uspech hover:bg-white/10 rounded-lg transition-colors"
                title="Přípnout zpět dolů do docku"
              >
                <PanelBottom className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Floating Player Body */}
          <div className="p-4 space-y-3">
            {/* Artwork + Title */}
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 bg-neutral-900 rounded-2xl border border-white/10 shrink-0 overflow-hidden shadow-lg group">
                <img
                  src={currentTrack.thumbnail || `https://img.youtube.com/vi/${currentTrack.youtubeId}/mqdefault.jpg`}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={() => setIsVideoFloatingOpen(!isVideoFloatingOpen)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                  title="Zobrazit / Skrýt video"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-white truncate">{currentTrack.title}</h4>
                <p className="text-xs text-neutral-400 truncate mt-0.5">{currentTrack.artist || 'Neznámý umělec'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-stitek font-semibold px-2 py-0.5 rounded-full bg-znacka/20 text-znacka border border-znacka/30">
                    {isPlaying ? 'Přehrává se' : 'Pozastaveno'}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Slider */}
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-white/10 rounded-full accent-znacka cursor-pointer"
              />
              <div className="flex justify-between text-drobne text-neutral-400 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={cycleMode}
                className={`p-1.5 rounded-lg transition-colors ${
                  playbackMode === 'normal' ? 'text-neutral-400' : 'text-znacka'
                }`}
              >
                {playbackMode === 'shuffle' ? <Shuffle className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>

              <div className="flex items-center gap-3">
                <button onClick={onPrevTrack} className="p-1.5 text-neutral-300 hover:text-white">
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={onTogglePlay}
                  className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center font-bold hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-white/20"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                <button onClick={onNextTrack} className="p-1.5 text-neutral-300 hover:text-white">
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleToggleMute}
                  className="text-neutral-400 hover:text-white p-1"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-chyba" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODE 3: MINIMIZED FLOATING PILL PLAYER */}
      {playerMode === 'minimized' && (
        <div
          style={{ left: `${floatingPos.x}px`, top: `${floatingPos.y}px` }}
          className="fixed z-50 bg-[#16161A]/95 backdrop-blur-2xl border border-white/20 rounded-full shadow-2xl p-1.5 pl-2 flex items-center gap-3 select-none cursor-move animate-in fade-in zoom-in-90 duration-200"
          onMouseDown={handleMouseDownDrag}
        >
          {/* Track Thumbnail */}
          <img
            src={currentTrack.thumbnail || `https://img.youtube.com/vi/${currentTrack.youtubeId}/mqdefault.jpg`}
            alt={currentTrack.title}
            className="w-8 h-8 rounded-full object-cover border border-white/20 shrink-0"
            referrerPolicy="no-referrer"
          />

          {/* Track Name */}
          <div className="max-w-[140px] truncate">
            <p className="text-xs font-bold text-white truncate">{currentTrack.title}</p>
            <p className="text-stitek text-neutral-400 truncate">{formatTime(currentTime)} / {formatTime(duration)}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 pr-1">
            <button
              onClick={onTogglePlay}
              className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => updatePlayerMode('floating')}
              className="p-1 text-neutral-400 hover:text-white rounded-full transition-colors"
              title="Zvětšit okno"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
