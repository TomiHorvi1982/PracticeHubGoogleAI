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
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  AlertTriangle,
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
  const [loadError, setLoadError] = useState<string | null>(null);

  // Maximization state
  const [isMaximized, setIsMaximized] = useState(false);

  // Time & Position State
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [songBpm, setSongBpm] = useState(initialBpm || 120);

  // Track info
  const [tracks, setTracks] = useState<alphaTab.model.Track[]>([]);
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(0);
  const [trackMutes, setTrackMutes] = useState<{ [index: number]: boolean }>({});
  const [trackSolos, setTrackSolos] = useState<{ [index: number]: boolean }>({});

  // Voice Command State
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceCommandStatus, setVoiceCommandStatus] = useState<string>('Vypnuto');
  const [lastHeardCommand, setLastHeardCommand] = useState<string>('');
  const recognitionRef = useRef<any>(null);

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

  // Handle Manual Seeking via Slider
  const handleSeek = (timeInSeconds: number) => {
    setCurrentTime(timeInSeconds);
    if (apiRef.current) {
      apiRef.current.timePosition = timeInSeconds * 1000;
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);
    setLoadError(null);

    // CRITICAL: Clear out previous container contents before initializing.
    // This resolves the double-mounting blank screen / silent fail in React 18 & 19
    containerRef.current.innerHTML = '';

    try {
      // Decode and sanitize base64 dataUrl to Uint8Array
      let cleanBase64 = dataUrl;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }
      cleanBase64 = cleanBase64.trim().replace(/\s/g, '');
      if (cleanBase64.includes('%')) {
        cleanBase64 = decodeURIComponent(cleanBase64);
      }

      const binaryString = atob(cleanBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (bytes.length === 0) {
        throw new Error('Nahrávaná tabulatura je prázdná nebo poškozená (0 bajtů).');
      }

      // Settings setup
      const settings = new alphaTab.Settings();
      settings.core.fontDirectory = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/font/';
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

      api.error.on((err) => {
        console.error('alphaTab load/render error:', err);
        setLoadError('Chyba při parsování tabulatury: ' + (err.message || String(err)));
        setIsLoading(false);
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
        try {
          api.destroy();
        } catch (e) {
          // ignore destroy errors
        }
        apiRef.current = null;
      };
    } catch (err: any) {
      console.error('Failed to initialize alphaTab player:', err);
      setLoadError(err?.message || String(err));
      setIsLoading(false);
    }
  }, [dataUrl]);

  // Speech Recognition hook for Voice commands
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceCommandStatus('Nepodporováno v tomto prohlížeči');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'cs-CZ'; // Czech language triggers

    recognition.onstart = () => {
      setVoiceCommandStatus('Poslouchám hlasové příkazy...');
    };

    recognition.onresult = (event: any) => {
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript.toLowerCase().trim();
      console.log('Hlasový příkaz:', transcript);
      setLastHeardCommand(transcript);

      // Trigger matching
      // "taby na max" -> Maximizes window
      // "hrej" / "hraj" -> plays
      // "ticho" / "pauza" / "stop" -> pauses
      // "pokračuj" -> resumes
      if (transcript.includes('taby na max') || transcript.includes('maximalizuj') || transcript.includes('taby na maximum')) {
        setIsMaximized(true);
      } else if (transcript.includes('taby zpět') || transcript.includes('normalizuj') || transcript.includes('taby na min') || transcript.includes('zmenši')) {
        setIsMaximized(false);
      } else if (transcript.includes('hrej') || transcript.includes('spusť') || transcript.includes('hraj') || transcript.includes('přehrát')) {
        if (apiRef.current && !isPlaying) {
          apiRef.current.play();
          setIsPlaying(true);
        }
      } else if (transcript.includes('ticho') || transcript.includes('pauza') || transcript.includes('stop') || transcript.includes('zastav') || transcript.includes('ticho')) {
        if (apiRef.current && isPlaying) {
          apiRef.current.pause();
          setIsPlaying(false);
        }
      } else if (transcript.includes('pokračuj') || transcript.includes('dál')) {
        if (apiRef.current && !isPlaying) {
          apiRef.current.play();
          setIsPlaying(true);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition status/error:', event.error);
      if (event.error === 'aborted') {
        // 'aborted' is standard when recognition is stopped or restarted, ignore it gracefully
        return;
      }
      if (event.error === 'not-allowed') {
        setVoiceCommandStatus('Chyba: Mikrofon zakázán');
        setIsVoiceListening(false);
      } else if (event.error === 'no-speech') {
        // quiet room, standard behavior
      } else {
        setVoiceCommandStatus(`Chyba: ${event.error}`);
      }
    };

    let restartTimeout: any = null;

    recognition.onend = () => {
      // Keep listening with a gentle delay to prevent immediate re-abort loops
      if (isVoiceListening) {
        restartTimeout = setTimeout(() => {
          if (isVoiceListening) {
            try {
              recognition.start();
            } catch (e) {
              // already running
            }
          }
        }, 1000);
      } else {
        setVoiceCommandStatus('Vypnuto');
      }
    };

    recognitionRef.current = recognition;

    if (isVoiceListening) {
      try {
        recognition.start();
      } catch (e) {
        console.warn('Failed to start speech recognition:', e);
      }
    } else {
      try {
        recognition.abort();
      } catch (e) {
        // already stopped
      }
    }

    return () => {
      if (restartTimeout) {
        clearTimeout(restartTimeout);
      }
      try {
        recognition.abort();
      } catch (e) {}
    };
  }, [isVoiceListening]);

  const toggleVoiceControl = () => {
    setIsVoiceListening(!isVoiceListening);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const renderContent = () => {
    return (
      <div className={`font-sans text-white space-y-4 bg-[#16161A]/90 backdrop-blur-2xl p-5 border border-white/[0.1] rounded-3xl shadow-2xl ${isMaximized ? 'shadow-[#FF9F0A]/10' : ''}`}>
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-xl">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Guitar Pro Tablatura &amp; Přehrávač
                {isMaximized && (
                  <span className="bg-[#30D158] text-black px-2 py-0.5 text-[9px] font-bold uppercase rounded-md">
                    Maximalizováno
                  </span>
                )}
              </h3>
              <p className="text-xs text-neutral-400">
                {filename} {artist && `• ${artist}`} • <span className="text-[#FF9F0A] font-semibold">{Math.round(songBpm * playbackSpeed)} BPM</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Voice Control Indicator / Switch */}
            <button
              onClick={toggleVoiceControl}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all border cursor-pointer ${
                isVoiceListening
                  ? 'bg-[#30D158]/20 border-[#30D158] text-[#30D158] shadow-[0_0_12px_rgba(48,209,88,0.25)]'
                  : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title="Zapnout hlasové ovládání příkazy (Hrej, Ticho, Pokračuj, Taby na max)"
            >
              {isVoiceListening ? <Mic className="w-3.5 h-3.5 animate-pulse text-[#30D158]" /> : <MicOff className="w-3.5 h-3.5 text-neutral-500" />}
              <span>Hlas: {isVoiceListening ? 'Aktivní' : 'Vypnut'}</span>
            </button>

            {/* Maximize Toggle Button */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 hover:text-white border border-white/10 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              title={isMaximized ? "Minimalizovat zpět do panelu" : "Maximalizovat taby na celou obrazovku"}
            >
              {isMaximized ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Zmenšit</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Na celou obrazovku</span>
                </>
              )}
            </button>

            {/* Download GP button */}
            <a
              href={dataUrl}
              download={filename}
              className="px-3 py-1.5 bg-[#FF9F0A]/10 hover:bg-[#FF9F0A] text-[#FF9F0A] hover:text-black border border-[#FF9F0A]/30 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> <span>Stáhnout .GP</span>
            </a>
          </div>
        </div>

        {/* Voice Recognition Command Feedback bar */}
        {isVoiceListening && (
          <div className="bg-[#30D158]/10 border border-[#30D158]/30 p-2 px-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#30D158] rounded-2xl">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#30D158] animate-ping" />
              <span className="font-semibold">{voiceCommandStatus}</span>
            </span>
            <span className="text-neutral-300">
              Příkazy: <strong className="text-white">"hrej"</strong> | <strong className="text-white">"ticho"</strong> | <strong className="text-white">"pokračuj"</strong> | <strong className="text-white">"taby na max"</strong>
            </span>
            {lastHeardCommand && (
              <span className="text-white">
                Slyšeno: <strong className="text-[#FF9F0A]">"{lastHeardCommand}"</strong>
              </span>
            )}
          </div>
        )}

        {/* Main Interactive Controls Toolbar */}
        <div className="bg-black/40 border border-white/5 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Playback Transport Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              className={`px-4 py-2 font-bold flex items-center gap-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-[#FF453A] text-white shadow-lg shadow-red-500/30 hover:bg-red-600'
                  : 'bg-[#FF9F0A] hover:bg-[#ffb038] text-black shadow-lg shadow-amber-500/20'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" /> Pauza
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Přehrát
                </>
              )}
            </button>

            <button
              onClick={handleStop}
              className="p-2 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 rounded-xl transition-all cursor-pointer"
              title="Stop / Zpět na začátek"
            >
              <Square className="w-4 h-4" />
            </button>

            {/* Time Display */}
            <div className="bg-black/60 px-3 py-1.5 rounded-xl border border-white/10 font-mono text-xs font-semibold text-[#30D158]">
              {formatTime(currentTime)} / {formatTime(totalTime)}
            </div>
          </div>

          {/* Positional Playing Seekbar Slider */}
          <div className="flex-1 min-w-[150px] flex items-center gap-2 px-2">
            <span className="text-[11px] text-neutral-400 font-semibold uppercase whitespace-nowrap">Pozice:</span>
            <input
              type="range"
              min={0}
              max={totalTime || 1}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-full h-2 accent-[#FF9F0A] bg-white/10 hover:bg-white/20 rounded-lg appearance-none cursor-pointer transition-colors"
            />
          </div>

          {/* Speed / Tempo Controls */}
          <div className="flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-[#FF9F0A] mr-1" />
            <span className="text-[11px] text-neutral-400 uppercase mr-1">Rychlost:</span>
            {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  playbackSpeed === speed
                    ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] font-bold'
                    : 'bg-white/5 border-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {speed * 100}%
              </button>
            ))}
          </div>

          {/* Looping & Metronome */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToggleLoop}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 border transition-all cursor-pointer ${
                isLooping
                  ? 'bg-[#30D158] text-black border-[#30D158] font-bold'
                  : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
              }`}
              title="Smyčka přehrávání"
            >
              <Repeat className="w-3.5 h-3.5" /> Smyčka
            </button>

            <button
              onClick={handleToggleMetronome}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 border transition-all cursor-pointer ${
                isMetronome
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF] font-bold'
                  : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
              }`}
              title="Metronom doprovod"
            >
              <Sparkles className="w-3.5 h-3.5" /> Metronom
            </button>
          </div>

          {/* Display Profile & Zoom */}
          <div className="flex items-center gap-2">
            <div className="flex bg-black/40 border border-white/10 rounded-xl p-0.5">
              <button
                onClick={() => handleStaveProfileChange('default')}
                className={`px-2 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                  staveProfile === 'default' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                }`}
                title="Noty + Tabulatura"
              >
                Noty+Tab
              </button>
              <button
                onClick={() => handleStaveProfileChange('tab')}
                className={`px-2 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                  staveProfile === 'tab' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                }`}
                title="Pouze Tabulatura"
              >
                Jen tab
              </button>
              <button
                onClick={() => handleStaveProfileChange('score')}
                className={`px-2 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                  staveProfile === 'score' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                }`}
                title="Pouze Noty"
              >
                Jen noty
              </button>
            </div>

            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5">
              <button
                onClick={() => handleZoomChange(-0.1)}
                className="p-1.5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition-all cursor-pointer"
                title="Zmenšit"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs px-1.5 font-semibold text-[#FF9F0A]">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={() => handleZoomChange(0.1)}
                className="p-1.5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition-all cursor-pointer"
                title="Zvětšit"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Track Mixer / Multi-Track Selector Bar */}
        {tracks.length > 0 && (
          <div className="bg-black/30 border border-white/5 p-3 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#FF9F0A]" />
                Stopy a míchání nástrojů ({tracks.length}):
              </span>
              <span className="text-[11px] text-neutral-400">
                Klikněte na stopu pro zobrazení
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-0.5">
              {tracks.map((track) => {
                const isActive = track.index === activeTrackIndex;
                const isMuted = !!trackMutes[track.index];
                const isSolo = !!trackSolos[track.index];

                return (
                  <div
                    key={track.index}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-[#FF9F0A]/15 border-[#FF9F0A]/50 text-white shadow-sm'
                        : 'bg-black/40 border-white/5 text-neutral-300 hover:border-white/20'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectTrack(track)}
                      className="font-semibold text-xs hover:text-[#FF9F0A] text-left cursor-pointer"
                    >
                      🎸 {track.name || `Stopa ${track.index + 1}`}
                    </button>

                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() => handleToggleMuteTrack(track)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase cursor-pointer transition-all ${
                          isMuted ? 'bg-[#FF453A] text-white' : 'bg-white/10 text-neutral-400 hover:text-white'
                        }`}
                        title="Mute (Ztišit)"
                      >
                        M
                      </button>
                      <button
                        onClick={() => handleToggleSoloTrack(track)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase cursor-pointer transition-all ${
                          isSolo ? 'bg-[#30D158] text-black' : 'bg-white/10 text-neutral-400 hover:text-white'
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
        <div className={`bg-[#FFFFFF] text-black border border-white/10 p-5 overflow-auto relative rounded-2xl shadow-inner ${isMaximized ? 'h-[70vh] min-h-[500px]' : 'min-h-[350px] max-h-[550px]'}`}>
          {isLoading && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2.5 z-20 text-white">
              <Music className="w-8 h-8 text-[#FF9F0A] animate-bounce" />
              <span className="text-xs font-bold text-white tracking-wide">
                Načítám a vykresluji tabulaturu Guitar Pro...
              </span>
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 text-white space-y-3">
              <AlertTriangle className="w-10 h-10 text-[#FF453A] animate-pulse" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#FF453A]">
                  Načítání tabulatury selhalo
                </p>
                <p className="text-xs text-neutral-400 max-w-md">
                  {loadError}
                </p>
              </div>
              <p className="text-xs text-neutral-400 max-w-sm">
                Zkuste soubor nahrát znovu nebo zkontrolujte, zda se jedná o korektní soubor Guitar Pro verze 3, 4, 5 nebo GPX.
              </p>
            </div>
          )}

          {/* AlphaTab Container */}
          <div ref={containerRef} className="alphatab w-full" />
        </div>
      </div>
    );
  };

  if (isMaximized) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[9999] p-6 overflow-y-auto flex flex-col justify-start">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          <div className="flex justify-between items-center bg-[#16161A]/90 border border-white/10 rounded-2xl p-4 shadow-xl">
            <span className="text-xs font-bold text-white tracking-wide flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#30D158]" /> Pódium: Celoobrazovkový režim čtení tabulatur
            </span>
            <button
              onClick={() => setIsMaximized(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Zavřít celou obrazovku ✕
            </button>
          </div>
          {renderContent()}
        </div>
      </div>
    );
  }

  return renderContent();
};
