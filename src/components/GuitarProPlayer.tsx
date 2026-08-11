import React, { useEffect, useRef, useState } from 'react';
import * as alphaTab from '@coderline/alphatab';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Music,
  Sliders,
  Settings,
  Download,
  Gauge,
  Layers,
  Repeat,
  Sparkles,
  HelpCircle,
} from 'lucide-react';

interface GuitarProPlayerProps {
  dataUrl: string;
  filename: string;
  artist?: string;
  bpm?: number;
}

export const GuitarProPlayer: React.FC<GuitarProPlayerProps> = ({
  dataUrl,
  filename,
  artist,
  bpm: initialBpm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [staveProfile, setStaveProfile] = useState<'default' | 'tab' | 'score'>('default');
  const [isLooping, setIsLooping] = useState(false);
  const [isMetronome, setIsMetronome] = useState(false);

  // Time & Position State
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [songBpm, setSongBpm] = useState(initialBpm || 120);

  // Track info
  const [tracks, setTracks] = useState<alphaTab.model.Track[]>([]);
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(0);
  const [trackMutes, setTrackMutes] = useState<{ [index: number]: boolean }>({});
  const [trackSolos, setTrackSolos] = useState<{ [index: number]: boolean }>({});

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);

    try {
      // Decode dataUrl to Uint8Array
      const base64 = dataUrl.split(',')[1] || dataUrl;
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Settings setup
      const settings = new alphaTab.Settings();
      settings.player.enablePlayer = true;
      settings.player.soundFont =
        'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2';

      const api = new alphaTab.AlphaTabApi(containerRef.current, settings);
      apiRef.current = api;

      // Event listeners
      api.scoreLoaded.on((score) => {
        setIsLoading(false);
        if (score.tracks && score.tracks.length > 0) {
          setTracks(score.tracks);
          setActiveTrackIndex(score.tracks[0].index);
        }
        if (score.tempo > 0) {
          setSongBpm(score.tempo);
        }
      });

      api.renderFinished.on(() => {
        setIsLoading(false);
      });

      api.playerStateChanged.on((args) => {
        setIsPlaying(args.state === alphaTab.synth.PlayerState.Playing);
      });

      api.playerPositionChanged.on((args) => {
        setCurrentTime(args.currentTime / 1000);
        setTotalTime(args.endTime / 1000);
      });

      // Load score bytes
      api.load(bytes);

      return () => {
        api.destroy();
        apiRef.current = null;
      };
    } catch (err) {
      console.error('Failed to initialize alphaTab player:', err);
      setIsLoading(false);
    }
  }, [dataUrl]);

  // Handle Play/Pause
  const handlePlayPause = () => {
    if (!apiRef.current) return;
    apiRef.current.playPause();
  };

  // Handle Stop
  const handleStop = () => {
    if (!apiRef.current) return;
    apiRef.current.stop();
  };

  // Handle Speed Change
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (apiRef.current) {
      apiRef.current.playbackSpeed = speed;
    }
  };

  // Handle Zoom Change
  const handleZoomChange = (delta: number) => {
    const newZoom = Math.max(0.6, Math.min(2.0, zoomScale + delta));
    setZoomScale(newZoom);
    if (apiRef.current) {
      apiRef.current.settings.display.scale = newZoom;
      apiRef.current.updateSettings();
    }
  };

  // Handle Stave Profile Change (Score + Tab / Tab Only / Score Only)
  const handleStaveProfileChange = (profile: 'default' | 'tab' | 'score') => {
    setStaveProfile(profile);
    if (!apiRef.current) return;

    if (profile === 'tab') {
      apiRef.current.settings.display.staveProfile = alphaTab.StaveProfile.Tab;
    } else if (profile === 'score') {
      apiRef.current.settings.display.staveProfile = alphaTab.StaveProfile.Score;
    } else {
      apiRef.current.settings.display.staveProfile = alphaTab.StaveProfile.Default;
    }
    apiRef.current.updateSettings();
  };

  // Handle Loop Toggle
  const handleToggleLoop = () => {
    const next = !isLooping;
    setIsLooping(next);
    if (apiRef.current) {
      apiRef.current.isLooping = next;
    }
  };

  // Handle Metronome Toggle
  const handleToggleMetronome = () => {
    const next = !isMetronome;
    setIsMetronome(next);
    if (apiRef.current) {
      apiRef.current.metronomeVolume = next ? 1 : 0;
    }
  };

  // Handle Active Track Selection (renders selected track in tab canvas)
  const handleSelectTrack = (track: alphaTab.model.Track) => {
    setActiveTrackIndex(track.index);
    if (apiRef.current) {
      apiRef.current.renderTracks([track]);
    }
  };

  // Handle Mute Toggle for Track
  const handleToggleMuteTrack = (track: alphaTab.model.Track) => {
    if (!apiRef.current) return;
    const isMuted = !trackMutes[track.index];
    setTrackMutes((prev) => ({ ...prev, [track.index]: isMuted }));
    apiRef.current.changeTrackMute([track], isMuted);
  };

  // Handle Solo Toggle for Track
  const handleToggleSoloTrack = (track: alphaTab.model.Track) => {
    if (!apiRef.current) return;
    const isSolo = !trackSolos[track.index];
    setTrackSolos((prev) => ({ ...prev, [track.index]: isSolo }));
    apiRef.current.changeTrackSolo([track], isSolo);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="bg-[#0A0A0A] border-2 border-[#FFD700] p-3 font-mono text-white space-y-3 shadow-[0_0_20px_rgba(255,215,0,0.15)] rounded-xs">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] pb-2">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-[#FFD700]" />
          <div>
            <h3 className="text-xs font-black uppercase text-[#FFD700] tracking-wide">
              INTERAKTIVNÍ GUITAR PRO TABULATURA &amp; PŘEHRÁVAČ
            </h3>
            <p className="text-[10px] text-[#AAA] uppercase">
              {filename} {artist && `• ${artist}`} • {Math.round(songBpm * playbackSpeed)} BPM
            </p>
          </div>
        </div>

        {/* Download GP button */}
        <a
          href={dataUrl}
          download={filename}
          className="px-2.5 py-1 bg-[#1A1A1A] hover:bg-[#FFD700] text-[#FFD700] hover:text-black border border-[#FFD700]/40 text-[10px] font-bold uppercase flex items-center gap-1 transition-colors"
        >
          <Download className="w-3 h-3" /> STÁHNOUT .GP SOUBOR
        </a>
      </div>

      {/* Main Interactive Controls Toolbar */}
      <div className="bg-[#111] border border-[#333] p-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Playback Transport Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePlayPause}
            className={`px-3 py-1.5 font-black uppercase flex items-center gap-1 text-xs transition-all ${
              isPlaying
                ? 'bg-[#FF3E00] text-black shadow-[0_0_10px_#FF3E00]'
                : 'bg-[#FFD700] hover:bg-white text-black shadow-[0_0_10px_rgba(255,215,0,0.4)]'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" /> PAUSA
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> PŘEHRÁT
              </>
            )}
          </button>

          <button
            onClick={handleStop}
            className="p-1.5 bg-[#1C1C1C] hover:bg-[#333] text-white border border-[#444]"
            title="Stop / Zpět na začátek"
          >
            <Square className="w-4 h-4" />
          </button>

          {/* Time Display */}
          <div className="bg-[#050505] px-2.5 py-1 border border-[#333] font-mono text-[11px] font-bold text-[#00FF41]">
            {formatTime(currentTime)} / {formatTime(totalTime)}
          </div>
        </div>

        {/* Speed / Tempo Controls */}
        <div className="flex items-center gap-1">
          <Gauge className="w-3.5 h-3.5 text-[#FFD700]" />
          <span className="text-[10px] text-[#888] uppercase mr-1">RYCHLOST:</span>
          {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${
                playbackSpeed === speed
                  ? 'bg-[#FFD700] text-black border-[#FFD700]'
                  : 'bg-[#050505] border-[#333] text-[#AAA] hover:text-white'
              }`}
            >
              {speed * 100}%
            </button>
          ))}
        </div>

        {/* Looping & Metronome */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleLoop}
            className={`px-2 py-1 text-[10px] font-bold uppercase flex items-center gap-1 border ${
              isLooping
                ? 'bg-[#00FF41] text-black border-[#00FF41]'
                : 'bg-[#050505] border-[#333] text-[#AAA] hover:text-white'
            }`}
            title="Smyčka přehrávání"
          >
            <Repeat className="w-3 h-3" /> SMYČKA
          </button>

          <button
            onClick={handleToggleMetronome}
            className={`px-2 py-1 text-[10px] font-bold uppercase flex items-center gap-1 border ${
              isMetronome
                ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                : 'bg-[#050505] border-[#333] text-[#AAA] hover:text-white'
            }`}
            title="Metronom doprovod"
          >
            <Sparkles className="w-3 h-3" /> METRONOM
          </button>
        </div>

        {/* Display Profile & Zoom */}
        <div className="flex items-center gap-1.5">
          <div className="flex border border-[#333]">
            <button
              onClick={() => handleStaveProfileChange('default')}
              className={`px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                staveProfile === 'default' ? 'bg-[#333] text-white' : 'bg-[#050505] text-[#888]'
              }`}
              title="Noty + Tabulatura"
            >
              NOTY+TAB
            </button>
            <button
              onClick={() => handleStaveProfileChange('tab')}
              className={`px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                staveProfile === 'tab' ? 'bg-[#333] text-white' : 'bg-[#050505] text-[#888]'
              }`}
              title="Pouze Tabulatura"
            >
              JEN TAB
            </button>
            <button
              onClick={() => handleStaveProfileChange('score')}
              className={`px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                staveProfile === 'score' ? 'bg-[#333] text-white' : 'bg-[#050505] text-[#888]'
              }`}
              title="Pouze Noty"
            >
              JEN NOTY
            </button>
          </div>

          <div className="flex items-center border border-[#333]">
            <button
              onClick={() => handleZoomChange(-0.1)}
              className="p-1 bg-[#050505] hover:bg-[#222] text-[#AAA]"
              title="Zmenšit"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] px-1 font-bold text-[#FFD700]">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => handleZoomChange(0.1)}
              className="p-1 bg-[#050505] hover:bg-[#222] text-[#AAA]"
              title="Zvětšit"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Track Mixer / Multi-Track Selector Bar */}
      {tracks.length > 0 && (
        <div className="bg-[#050505] border border-[#222] p-2 space-y-1 text-xs">
          <div className="flex items-center justify-between border-b border-[#222] pb-1">
            <span className="text-[10px] font-bold text-[#888] uppercase flex items-center gap-1">
              <Sliders className="w-3 h-3 text-[#FFD700]" />
              STOPY A MÍCHÁNÍ NÁSTROJŮ ({tracks.length}):
            </span>
            <span className="text-[9px] text-[#666] uppercase">
              KLIKNĚTE NA STOPU PRO ZOBRAZENÍ V TABULATUŘE
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {tracks.map((track) => {
              const isActive = track.index === activeTrackIndex;
              const isMuted = !!trackMutes[track.index];
              const isSolo = !!trackSolos[track.index];

              return (
                <div
                  key={track.index}
                  className={`flex items-center gap-1.5 px-2 py-1 border transition-all ${
                    isActive
                      ? 'bg-[#262000] border-[#FFD700] text-white'
                      : 'bg-[#111] border-[#333] text-[#AAA] hover:border-[#666]'
                  }`}
                >
                  <button
                    onClick={() => handleSelectTrack(track)}
                    className="font-bold text-xs uppercase hover:text-[#FFD700] text-left"
                  >
                    🎸 {track.name || `Stopa ${track.index + 1}`}
                  </button>

                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      onClick={() => handleToggleMuteTrack(track)}
                      className={`px-1 text-[9px] font-extrabold uppercase border ${
                        isMuted ? 'bg-[#FF3E00] text-black border-[#FF3E00]' : 'bg-[#222] text-[#888]'
                      }`}
                      title="Mute (Ztišit)"
                    >
                      M
                    </button>
                    <button
                      onClick={() => handleToggleSoloTrack(track)}
                      className={`px-1 text-[9px] font-extrabold uppercase border ${
                        isSolo ? 'bg-[#00FF41] text-black border-[#00FF41]' : 'bg-[#222] text-[#888]'
                      }`}
                      title="Solo (Sólo)"
                    >
                      S
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Canvas Area */}
      <div className="bg-[#FFFFFF] text-black border-2 border-[#333] p-4 min-h-[350px] max-h-[550px] overflow-auto relative rounded-xs">
        {isLoading && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20 text-white font-mono">
            <Music className="w-8 h-8 text-[#FFD700] animate-bounce" />
            <span className="text-xs font-bold text-[#FFD700] uppercase tracking-wider">
              NAČÍTÁM A GENERUJI NOTY &amp; TABULATURU GUITAR PRO...
            </span>
          </div>
        )}

        {/* AlphaTab Container */}
        <div ref={containerRef} className="alphatab w-full" />
      </div>
    </div>
  );
};
