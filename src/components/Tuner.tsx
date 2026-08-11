import React, { useState, useEffect, useRef } from 'react';
import { PitchDetector, PitchData } from '../services/tuner';
import { TUNING_PRESETS } from '../data/chordsAndScales';
import { audioSynth } from '../services/audioSynth';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  AlertCircle,
  Play,
  Pause,
  Zap,
  Activity,
  RotateCcw
} from 'lucide-react';

export const Tuner: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [pitch, setPitch] = useState<PitchData | null>(null);
  const [selectedTuning, setSelectedTuning] = useState(TUNING_PRESETS[0]);
  const [micError, setMicError] = useState<string | null>(null);
  const pitchDetectorRef = useRef<PitchDetector | null>(null);

  // --- METRONOME STATE ---
  const [metroBpm, setMetroBpm] = useState(120);
  const [isMetroPlaying, setIsMetroPlaying] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [tapFeedback, setTapFeedback] = useState<string | null>(null);

  const tapTimesRef = useRef<number[]>([]);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pitchDetectorRef.current) {
        pitchDetectorRef.current.stop();
      }
    };
  }, []);

  // --- METRONOME TICK LOOP ---
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isMetroPlaying) {
      const ms = (60 / metroBpm) * 1000;
      interval = setInterval(() => {
        setCurrentBeat((prev) => {
          const next = (prev + 1) % beatsPerBar;
          if (!isMuted) {
            audioSynth.playMetronomeClick(next === 0);
          }
          return next;
        });
      }, ms);
    } else {
      setCurrentBeat(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isMetroPlaying, metroBpm, beatsPerBar, isMuted]);

  // --- TAP TEMPO FUNCTIONALITY ---
  const handleTapTempo = () => {
    const now = Date.now();
    tapTimesRef.current.push(now);

    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }

    // Reset tap timestamps if user pauses tapping for > 2.2 seconds
    tapTimeoutRef.current = setTimeout(() => {
      tapTimesRef.current = [];
      setTapFeedback(null);
    }, 2200);

    if (tapTimesRef.current.length > 5) {
      tapTimesRef.current.shift();
    }

    if (tapTimesRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgMs);

      if (calculatedBpm >= 30 && calculatedBpm <= 280) {
        setMetroBpm(calculatedBpm);
        setTapFeedback(`NAMĚŘENO: ${calculatedBpm} BPM`);
      }
    } else {
      setTapFeedback('ŤUKEJTE DÁLE...');
    }
  };

  const toggleListening = async () => {
    setMicError(null);
    if (isListening) {
      if (pitchDetectorRef.current) {
        pitchDetectorRef.current.stop();
        pitchDetectorRef.current = null;
      }
      setIsListening(false);
      setPitch(null);
    } else {
      const detector = new PitchDetector();
      const success = await detector.start((data) => {
        setPitch(data);
      });

      if (success) {
        pitchDetectorRef.current = detector;
        setIsListening(true);
      } else {
        setMicError('Přístup k mikrofonu odepřen nebo zařízení nepodporuje nahrávání zvuku.');
        setIsListening(false);
      }
    }
  };

  const playReferencePitch = (freq: number) => {
    audioSynth.playGuitarNote(freq, 2.5, 0.6);
  };

  const cents = pitch ? pitch.cents : 0;
  const rotationAngle = Math.max(-70, Math.min(70, (cents / 50) * 70));
  const isInTune = pitch ? Math.abs(pitch.cents) <= 5 : false;

  return (
    <div className="max-w-5xl mx-auto space-y-4 font-mono pb-12">
      
      {/* Title & Tuning Selector Bar */}
      <div className="border border-[#333] bg-[#0F0F0F] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-[#FF3E00] text-black font-extrabold px-2 py-0.5 text-[10px] uppercase">
              ANALYSER
            </span>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              LADIČKA & ANALÝZA FREKVENCE
            </h2>
          </div>
          <p className="text-[11px] text-[#666] mt-1">
            Měření kmitočtu v reálném čase přes mikrofonní vstup
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[11px] text-[#888] font-bold uppercase">
            LADĚNÍ:
          </label>
          <select
            value={selectedTuning.name}
            onChange={(e) => {
              const found = TUNING_PRESETS.find((t) => t.name === e.target.value);
              if (found) setSelectedTuning(found);
            }}
            className="bg-[#141414] border border-[#333] text-[#00FF41] text-xs font-bold px-3 py-1.5 focus:outline-none focus:border-[#00FF41] cursor-pointer"
          >
            {TUNING_PRESETS.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {micError && (
        <div className="bg-[#1A0000] border border-[#FF3E00] p-3 text-xs text-[#FF3E00] flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>ERR_MIC: {micError}</span>
        </div>
      )}

      {/* Main Tuner Display */}
      <div className="border border-[#333] bg-[#0F0F0F] p-6 relative overflow-hidden flex flex-col items-center justify-center text-center">
        
        {/* Status Tag */}
        <div className="absolute top-3 right-3 flex gap-2">
          <span className="text-[10px] bg-[#222] px-2 py-1 text-[#888] font-mono">CLEAN_AMP</span>
          <span className={`text-[10px] px-2 py-1 font-mono ${isListening ? 'bg-[#002B0E] text-[#00FF41] border border-[#00FF41]/40' : 'bg-[#222] text-[#666]'}`}>
            SIGNAL: {isListening ? (pitch ? 'LOCK' : 'SEARCHING') : 'OFFLINE'}
          </span>
        </div>

        {/* Cents Meter Gauge */}
        <div className="relative w-80 h-36 mb-4 flex items-end justify-center border-b border-[#222] pb-2">
          {/* Arc / Background ticks */}
          <div className="absolute inset-0 border-t-2 border-[#333] rounded-t-full"></div>

          <div className="absolute inset-x-0 top-3 flex justify-between px-4 text-[10px] font-mono text-[#666]">
            <span>-50c</span>
            <span>-25c</span>
            <span className="text-[#00FF41] font-bold">0</span>
            <span>+25c</span>
            <span>+50c</span>
          </div>

          {/* Needle */}
          <div
            className={`w-1 h-28 origin-bottom transition-transform duration-100 shadow-[0_0_10px_rgba(0,255,65,0.5)] ${
              isInTune
                ? 'bg-[#00FF41]'
                : pitch
                ? 'bg-[#FF3E00]'
                : 'bg-[#333]'
            }`}
            style={{
              transform: `rotate(${rotationAngle}deg)`,
            }}
          >
            <div className="w-3 h-3 bg-[#0A0A0A] border-2 border-current -translate-x-1/2 absolute -top-1 left-1/2"></div>
          </div>
        </div>

        {/* Note Display Box */}
        <div className="relative mb-6 w-full max-w-sm">
          {pitch ? (
            <div className="flex flex-col items-center bg-[#050505] border border-[#222] p-4">
              <div className="flex items-baseline justify-center gap-2">
                <span className={`text-6xl font-black font-mono tracking-tighter ${isInTune ? 'text-[#00FF41]' : 'text-white'}`}>
                  {pitch.note}
                </span>
                <span className="text-2xl font-bold text-[#FF3E00]">{pitch.octave}</span>
              </div>

              <div className="mt-2 text-xs font-mono">
                {isInTune ? (
                  <span className="text-[#00FF41] bg-[#002B0E] px-3 py-1 border border-[#00FF41] font-bold">
                    [ PERFECT MATCH ]
                  </span>
                ) : (
                  <span className="text-[#FF3E00] bg-[#1A0000] px-3 py-1 border border-[#FF3E00] font-bold">
                    {pitch.cents > 0 ? `+${pitch.cents} CENTŮ (VYSOKO)` : `${pitch.cents} CENTŮ (NÍZKO)`}
                  </span>
                )}
              </div>

              <div className="mt-2 text-xs text-[#888] font-mono">
                FREKVENCE: <span className="text-white font-bold">{pitch.frequency} Hz</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 bg-[#050505] border border-dashed border-[#222] text-[#555]">
              <span className="text-xs font-bold uppercase tracking-wider text-[#777]">
                [ ZAHRANÝ TÓN SE ZOBRAZÍ ZDE ]
              </span>
            </div>
          )}
        </div>

        {/* Start / Stop Microphone Button */}
        <button
          onClick={toggleListening}
          className={`flex items-center gap-2 px-6 py-2.5 font-bold text-xs uppercase tracking-wider transition-none ${
            isListening
              ? 'bg-[#FF3E00] text-black border border-black hover:bg-white'
              : 'bg-[#D1D1D1] hover:bg-white text-black border border-white'
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="w-4 h-4" />
              <span>VYPNOUT MIKROFON</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span>SPUSTIT LADIČKU MIKROFONU</span>
            </>
          )}
        </button>

      </div>

      {/* Target Guitar Strings Reference Panel */}
      <div className="border border-[#333] bg-[#0F0F0F] p-4">
        <div className="flex items-center justify-between mb-3 border-b border-[#222] pb-2">
          <h3 className="text-xs font-bold text-white uppercase">
            STRUNY DLE NALADĚNÍ: {selectedTuning.name}
          </h3>
          <span className="text-[10px] text-[#666]">
            KLIKNUTÍM PŘEHRÁT AUDIOGENERÁTOR
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {selectedTuning.notes.map((noteName, idx) => {
            const stringNum = 6 - idx;
            const freq = selectedTuning.frequencies[idx];
            const isMatched = pitch?.stringIndex === idx;

            return (
              <button
                key={idx}
                onClick={() => playReferencePitch(freq)}
                className={`p-3 border text-center transition-none ${
                  isMatched
                    ? 'bg-[#142618] border-[#00FF41] text-[#00FF41]'
                    : 'bg-[#141414] hover:bg-[#1C1C1C] border-[#222] text-[#D1D1D1]'
                }`}
              >
                <div className="text-[9px] uppercase text-[#666] mb-1">
                  STRUNA {stringNum}
                </div>
                <div className="text-xl font-black">{noteName}</div>
                <div className="text-[10px] text-[#888] font-mono mt-1">{freq} Hz</div>
                
                <div className="mt-2 text-[#FF3E00] hover:text-white flex items-center justify-center gap-1 text-[9px] uppercase font-bold">
                  <Volume2 className="w-3 h-3" /> PŘEHRÁT
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ⏱️ VISUAL METRONOME & TEMPO SECTION */}
      <div className="border border-[#333] bg-[#0F0F0F] p-5 space-y-4">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#FF3E00] text-black font-extrabold px-2 py-0.5 text-[10px] uppercase">
                METRONOME
              </span>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                VIZUÁLNÍ METRONOM & TEMPO
              </h3>
            </div>
            <p className="text-[11px] text-[#666] mt-1">
              Optická rytmická indikace pro ladičku a cvičení
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Mute/Unmute Toggle */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-2 border transition-none flex items-center gap-1 text-xs font-bold uppercase ${
                isMuted
                  ? 'bg-[#1A0000] border-[#FF3E00] text-[#FF3E00]'
                  : 'bg-[#050505] border-[#222] text-[#00FF41] hover:border-[#00FF41]'
              }`}
              title={isMuted ? 'Zvuk vypnut (pouze vizuální blikání)' : 'Zvuk zapnut'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="text-[10px] hidden sm:inline">{isMuted ? 'TICHÝ REŽIM' : 'ZVUK ZAPNUT'}</span>
            </button>

            {/* Time Signature Dropdown */}
            <select
              value={beatsPerBar}
              onChange={(e) => setBeatsPerBar(Number(e.target.value))}
              className="bg-[#050505] border border-[#222] text-white text-xs font-bold px-2 py-1.5 focus:border-[#FF3E00] outline-none uppercase cursor-pointer"
            >
              <option value={4}>4/4 TAKT</option>
              <option value={3}>3/4 TAKT</option>
              <option value={2}>2/4 TAKT</option>
              <option value={6}>6/8 TAKT</option>
            </select>
          </div>
        </div>

        {/* Visual Pendulum Sweep Bar & Beat Indicators */}
        <div className="bg-[#050505] p-4 border border-[#222] space-y-4">
          
          {/* Dynamic Light Bar / Pendulum */}
          <div className="relative h-6 bg-[#111] border border-[#222] overflow-hidden flex items-center px-1">
            <div
              className={`h-4 transition-all duration-75 ${
                currentBeat === 0
                  ? 'bg-[#FF3E00] shadow-[0_0_12px_#FF3E00]'
                  : isMetroPlaying
                  ? 'bg-[#00FF41] shadow-[0_0_10px_#00FF41]'
                  : 'bg-[#333]'
              }`}
              style={{
                width: `${100 / beatsPerBar}%`,
                transform: `translateX(${currentBeat * 100}%)`,
              }}
            ></div>
          </div>

          {/* Beat Indicator Dots */}
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: beatsPerBar }).map((_, idx) => {
              const isActive = currentBeat === idx && isMetroPlaying;
              const isAccent = idx === 0;

              return (
                <div
                  key={idx}
                  className={`flex-1 h-12 border flex flex-col items-center justify-center transition-none font-bold font-mono ${
                    isActive
                      ? isAccent
                        ? 'bg-[#FF3E00] border-black text-black scale-105 shadow-[0_0_15px_rgba(255,62,0,0.8)]'
                        : 'bg-[#00FF41] border-black text-black scale-105 shadow-[0_0_15px_rgba(0,255,65,0.8)]'
                      : 'bg-[#0A0A0A] border-[#222] text-[#444]'
                  }`}
                >
                  <span className="text-sm">{idx + 1}</span>
                  <span className="text-[8px] uppercase">
                    {isAccent ? 'AKCENT' : 'DOBA'}
                  </span>
                </div>
              );
            })}
          </div>

        </div>

        {/* BPM Display & Main Play/Tap Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          
          {/* Large Numerical BPM Readout */}
          <div className="bg-[#050505] border border-[#222] p-4 text-center">
            <span className="text-[10px] text-[#666] font-bold uppercase tracking-wider block mb-1">
              TEMPO V RÝCHLOSTI
            </span>
            <div className="text-4xl font-black text-white font-mono tracking-tighter">
              {metroBpm} <span className="text-xs text-[#FF3E00] font-normal">BPM</span>
            </div>
            <p className="text-[10px] text-[#00FF41] font-mono mt-1">
              {metroBpm < 75
                ? 'LARGO / SLOW'
                : metroBpm < 105
                ? 'ANDANTE / MODERATE'
                : metroBpm < 135
                ? 'ALLEGRO / FAST'
                : 'PRESTO / VERY FAST'}
            </p>
          </div>

          {/* Action Buttons: Play/Stop & Tap Tempo */}
          <div className="space-y-2">
            <button
              onClick={() => setIsMetroPlaying(!isMetroPlaying)}
              className={`w-full py-3 px-4 font-black text-xs uppercase border tracking-wider flex items-center justify-center gap-2 transition-none ${
                isMetroPlaying
                  ? 'bg-[#FF3E00] text-black border-black hover:bg-white'
                  : 'bg-[#00FF41] text-black border-black hover:bg-white'
              }`}
            >
              {isMetroPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isMetroPlaying ? 'ZASTAVIT METRONOM' : 'SPUSTIT METRONOM'}</span>
            </button>

            <button
              onClick={handleTapTempo}
              className="w-full py-2.5 px-4 bg-[#141414] hover:bg-[#222] active:bg-[#FF3E00] active:text-black text-[#FF3E00] font-bold text-xs border border-[#333] uppercase flex items-center justify-center gap-1.5 transition-none"
            >
              <Zap className="w-4 h-4" />
              <span>TAP TEMPO (VYŤUKAT)</span>
            </button>

            {tapFeedback && (
              <div className="text-center text-[10px] font-bold text-[#00FF41] font-mono uppercase bg-[#001F09] py-1 border border-[#00FF41]/30">
                {tapFeedback}
              </div>
            )}
          </div>

          {/* Slider & Increment / Decrement Buttons */}
          <div className="space-y-3 bg-[#050505] p-3 border border-[#222]">
            <div className="flex items-center justify-between text-[10px] text-[#888] font-bold uppercase">
              <span>NASTAVENÍ TEMPA:</span>
              <span>{metroBpm} BPM</span>
            </div>

            <input
              type="range"
              min="30"
              max="250"
              value={metroBpm}
              onChange={(e) => setMetroBpm(Number(e.target.value))}
              className="w-full accent-[#FF3E00] bg-[#222] cursor-pointer"
            />

            <div className="flex items-center justify-between gap-1">
              <button
                onClick={() => setMetroBpm((prev) => Math.max(30, prev - 5))}
                className="flex-1 py-1 bg-[#141414] hover:bg-[#222] text-white border border-[#333] text-[10px] font-bold"
              >
                -5
              </button>
              <button
                onClick={() => setMetroBpm((prev) => Math.max(30, prev - 1))}
                className="flex-1 py-1 bg-[#141414] hover:bg-[#222] text-white border border-[#333] text-[10px] font-bold"
              >
                -1
              </button>
              <button
                onClick={() => setMetroBpm((prev) => Math.min(250, prev + 1))}
                className="flex-1 py-1 bg-[#141414] hover:bg-[#222] text-white border border-[#333] text-[10px] font-bold"
              >
                +1
              </button>
              <button
                onClick={() => setMetroBpm((prev) => Math.min(250, prev + 5))}
                className="flex-1 py-1 bg-[#141414] hover:bg-[#222] text-white border border-[#333] text-[10px] font-bold"
              >
                +5
              </button>
            </div>
          </div>

        </div>

        {/* Quick Tempo Preset Chips */}
        <div>
          <span className="block text-[10px] font-bold text-[#666] mb-1.5 uppercase">
            RYCHLÉ PŘEDVOLBY TEMPA:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: '60 LARGO', bpmVal: 60 },
              { label: '80 ANDANTE', bpmVal: 80 },
              { label: '100 MODERATO', bpmVal: 100 },
              { label: '120 ALLEGRO', bpmVal: 120 },
              { label: '140 PRESTO', bpmVal: 140 },
              { label: '160 VIVACE', bpmVal: 160 },
            ].map((preset) => (
              <button
                key={preset.bpmVal}
                onClick={() => setMetroBpm(preset.bpmVal)}
                className={`px-3 py-1 text-[10px] font-bold font-mono uppercase transition-none border ${
                  metroBpm === preset.bpmVal
                    ? 'bg-[#142618] border-[#00FF41] text-[#00FF41]'
                    : 'bg-[#050505] hover:bg-[#1C1C1C] text-[#888] border-[#222]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};

