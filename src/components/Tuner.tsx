import React, { useState, useEffect, useRef } from 'react';
import { PitchDetector, PitchData, REFERENCE_A_RANGE } from '../services/tuner';
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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function getNoteFromMidi(midi: number): { name: string; frequency: number } {
  const noteName = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  const frequency = Math.round(440 * Math.pow(2, (midi - 69) / 12) * 100) / 100;
  return {
    name: `${noteName}${octave}`,
    frequency
  };
}

export const Tuner: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [pitch, setPitch] = useState<PitchData | null>(null);
  const [selectedTuning, setSelectedTuning] = useState(TUNING_PRESETS[0]);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customMidis, setCustomMidis] = useState<number[]>([40, 45, 50, 55, 59, 64]);
  const [micError, setMicError] = useState<string | null>(null);
  const [referenceA, setReferenceA] = useState<number>(REFERENCE_A_RANGE.default);
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
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);

      if (calculatedBpm >= 30 && calculatedBpm <= 300) {
        setMetroBpm(calculatedBpm);
        setTapFeedback(`${calculatedBpm} BPM`);
      }
    } else {
      setTapFeedback('Ťukněte znovu...');
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      if (pitchDetectorRef.current) {
        pitchDetectorRef.current.stop();
      }
      setIsListening(false);
      setPitch(null);
      setMicError(null);
    } else {
      setMicError(null);
      const detector = new PitchDetector();

      const success = await detector.start((data) => {
        setPitch(data);
      });
      if (success) {
        pitchDetectorRef.current = detector;
        setIsListening(true);
      } else {
        setMicError('Přístup k mikrofonu byl zamítnut nebo mikrofon není k dispozici.');
      }
    }
  };

  // Referenci je potřeba předat i běžícímu detektoru — jinak by se změna
  // projevila až po vypnutí a zapnutí mikrofonu.
  useEffect(() => {
    pitchDetectorRef.current?.setReferenceA(referenceA);
  }, [referenceA]);

  /** Kmitočty strun platí pro A = 440 Hz; při jiné referenci se posunou se stejným poměrem. */
  const naReferenci = (freq440: number) => (freq440 * referenceA) / REFERENCE_A_RANGE.default;

  const playReferencePitch = (freq: number) => {
    audioSynth.playNote(freq, 'acoustic_guitar', 2.0, 0.8);
  };

  const activeTuning = isCustomMode
    ? {
        name: 'Vlastní ladění',
        notes: customMidis.map((m) => getNoteFromMidi(m).name),
        frequencies: customMidis.map((m) => getNoteFromMidi(m).frequency)
      }
    : selectedTuning;

  // Porovnává se v centech, ne v hertzech. Pevná mez 15 Hz znamenala u
  // hlubokého E skoro tři půltóny, kdežto u vysokého sotva půl — na basových
  // strunách chytala i sousední tón, na vysokých nechytala ani rozladěnou
  // strunu. Sto centů je půltón, tedy „nejbližší struna, a to jednoznačně".
  let activeStringIndex = -1;
  if (pitch) {
    let minCents = Infinity;
    activeTuning.frequencies.forEach((freq440, idx) => {
      const cil = naReferenci(freq440);
      const rozdil = Math.abs(1200 * Math.log2(pitch.frequency / cil));
      if (rozdil < minCents && rozdil < 100) {
        minCents = rozdil;
        activeStringIndex = idx;
      }
    });
  }

  const cents = pitch ? pitch.cents : 0;
  const rotationAngle = Math.max(-50, Math.min(50, cents)) * 0.9;
  const isInTune = pitch && Math.abs(pitch.cents) <= 4;

  return (
    <div className="w-full space-y-4 font-sans pb-16">
      
      {/* Header & Tuning Selection */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="bg-znacka text-black font-semibold px-2 py-0.5 text-stitek rounded-md uppercase tracking-wide">
              Přesná Ladička
            </span>
            <span className="text-xs text-neutral-400 font-medium">Autodetekce frekvence</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Chromatická Ladička & Metronom
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Spusťte mikrofon a zahrajte na libovolnou strunu pro rychlé naladění s přesností na centy.
          </p>
        </div>

        {/* Referenční A */}
        <div className="flex items-center gap-2 bg-white/[0.04] p-1.5 rounded-2xl border border-white/[0.06]">
          <span className="text-xs text-neutral-400 font-medium px-2">Referenční A:</span>
          <input
            type="range"
            min={REFERENCE_A_RANGE.min}
            max={REFERENCE_A_RANGE.max}
            step={1}
            value={referenceA}
            onChange={(e) => setReferenceA(parseInt(e.target.value, 10))}
            className="w-24 accent-znacka cursor-pointer"
            title={`${referenceA} Hz`}
          />
          <span className="text-xs font-mono font-bold text-white w-14 text-right">{referenceA} Hz</span>
          {referenceA !== REFERENCE_A_RANGE.default && (
            <button
              onClick={() => setReferenceA(REFERENCE_A_RANGE.default)}
              className="text-stitek font-bold text-neutral-400 hover:text-white px-1.5 cursor-pointer"
              title="Zpět na 440 Hz"
            >
              ↺
            </button>
          )}
        </div>

        {/* Tuning Preset Selector */}
        <div className="flex items-center gap-2 bg-white/[0.04] p-1.5 rounded-2xl border border-white/[0.06]">
          <span className="text-xs text-neutral-400 font-medium px-2">Ladění:</span>
          <select
            value={isCustomMode ? 'custom' : selectedTuning.name}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setIsCustomMode(true);
              } else {
                setIsCustomMode(false);
                const found = TUNING_PRESETS.find((t) => t.name === e.target.value);
                if (found) setSelectedTuning(found);
              }
            }}
            className="bg-black/60 border border-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-xl outline-none cursor-pointer"
          >
            {TUNING_PRESETS.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
            <option value="custom">-- Vlastní ladění --</option>
          </select>
        </div>
      </div>

      {isCustomMode && (
        <div className="bg-plocha-2 border border-znacka/30 rounded-3xl p-5 text-xs space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <h4 className="text-white font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-znacka" /> Vlastní ladění jednotlivých strun (6. až 1.)
            </h4>
            <button
              onClick={() => setCustomMidis([40, 45, 50, 55, 59, 64])}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-neutral-300 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Resetovat na E Standard
            </button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {customMidis.map((midi, idx) => {
              const stringNum = 6 - idx;
              const noteInfo = getNoteFromMidi(midi);
              return (
                <div key={idx} className="bg-black/40 border border-white/10 p-3 rounded-2xl flex flex-col items-center">
                  <span className="text-stitek text-neutral-400 mb-1">{stringNum}. struna</span>
                  <span className="text-base font-bold text-znacka">{noteInfo.name}</span>
                  <span className="text-stitek text-neutral-400 font-mono mb-2">{noteInfo.frequency} Hz</span>
                  
                  <div className="flex gap-1 w-full">
                    <button
                      onClick={() => {
                        const next = [...customMidis];
                        next[idx] = Math.max(24, midi - 1);
                        setCustomMidis(next);
                      }}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white py-1 font-bold rounded-lg text-center cursor-pointer"
                    >
                      -
                    </button>
                    <button
                      onClick={() => {
                        const next = [...customMidis];
                        next[idx] = Math.min(84, midi + 1);
                        setCustomMidis(next);
                      }}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white py-1 font-bold rounded-lg text-center cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {micError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-3xl text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{micError}</span>
        </div>
      )}

      {/* Main Tuner Display & Gauge */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-8 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
        
        {/* Status Tag */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <span className={`text-stitek font-medium px-2.5 py-1 rounded-lg border ${
            isListening 
              ? 'bg-uspech/10 text-uspech border-uspech/30' 
              : 'bg-white/[0.04] text-neutral-400 border-white/[0.06]'
          }`}>
            {isListening ? (pitch ? 'PŘIJÍMÁM SIGNÁL' : 'POSLOUCHÁM...') : 'MIKROFON VYPNUT'}
          </span>
        </div>

        {/* Cents Meter Gauge */}
        <div className="relative w-80 h-36 mb-4 flex items-end justify-center border-b border-white/10 pb-2">
          <div className="absolute inset-0 border-t-2 border-white/10 rounded-t-full"></div>

          <div className="absolute inset-x-0 top-3 flex justify-between px-6 text-drobne font-mono text-neutral-400">
            <span>-50c</span>
            <span>-25c</span>
            <span className="text-uspech font-bold">0</span>
            <span>+25c</span>
            <span>+50c</span>
          </div>

          {/* Needle */}
          <div
            className={`w-1 h-28 origin-bottom transition-transform duration-100 rounded-full shadow-lg ${
              isInTune
                ? 'bg-uspech shadow-[0_0_12px_#30D158]'
                : pitch
                ? 'bg-znacka shadow-[0_0_12px_#FF9F0A]'
                : 'bg-white/20'
            }`}
            style={{
              transform: `rotate(${rotationAngle}deg)`,
            }}
          >
            <div className="w-3 h-3 bg-white rounded-full -translate-x-1/2 absolute -top-1 left-1/2 shadow-md"></div>
          </div>
        </div>

        {/* Note Display Box */}
        <div className="relative mb-6 w-full max-w-sm">
          {pitch ? (
            <div className="flex flex-col items-center bg-black/40 border border-white/10 p-5 rounded-2xl shadow-inner">
              <div className="flex items-baseline justify-center gap-1.5">
                <span className={`text-6xl font-bold font-mono tracking-tight ${isInTune ? 'text-uspech' : 'text-white'}`}>
                  {pitch.note}
                </span>
                <span className="text-2xl font-semibold text-znacka">{pitch.octave}</span>
              </div>

              <div className="mt-2 text-xs">
                {isInTune ? (
                  <span className="text-uspech bg-uspech/10 px-3 py-1 rounded-lg font-semibold border border-uspech/30">
                    PERFEKTNĚ NALADĚNO
                  </span>
                ) : (
                  <span className="text-znacka bg-znacka/10 px-3 py-1 rounded-lg font-semibold border border-znacka/30">
                    {pitch.cents > 0 ? `+${pitch.cents} centů (vysoko)` : `${pitch.cents} centů (nízko)`}
                  </span>
                )}
              </div>

              <div className="mt-2 text-xs text-neutral-400 font-mono">
                Frekvence: <span className="text-white font-semibold">{pitch.frequency} Hz</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 bg-black/30 border border-dashed border-white/10 rounded-2xl text-neutral-400">
              <span className="text-xs font-medium">
                Zahrajte tón na kytaru pro detekci výšky
              </span>
            </div>
          )}
        </div>

        {/* Start / Stop Microphone Button */}
        <button
          onClick={toggleListening}
          className={`flex items-center gap-2 px-6 py-3 font-semibold text-xs rounded-2xl transition-all cursor-pointer shadow-md ${
            isListening
              ? 'bg-chyba hover:bg-chyba/90 text-white'
              : 'bg-znacka hover:bg-znacka/90 text-black'
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="w-4 h-4" />
              <span>Vypnout mikrofon</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span>Spustit ladičku mikrofonu</span>
            </>
          )}
        </button>

      </div>

      {/* Target Guitar Strings Reference Panel */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3 border-b border-white/[0.06] pb-2.5">
          <h3 className="text-xs font-semibold text-white">
            Referenční tóny strun ({activeTuning.name})
          </h3>
          <span className="text-drobne text-neutral-400">
            Kliknutím přehrajte referenční tón
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          {activeTuning.notes.map((noteName, idx) => {
            const stringNum = 6 - idx;
            const freq = naReferenci(activeTuning.frequencies[idx]);
            const isMatched = activeStringIndex === idx;

            return (
              <button
                key={idx}
                onClick={() => playReferencePitch(freq)}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                  isMatched
                    ? 'bg-uspech/20 border-uspech text-white shadow-lg shadow-green-500/10'
                    : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06] text-neutral-300'
                }`}
              >
                <div className="text-stitek text-neutral-400 mb-1">{stringNum}. struna</div>
                <div className="text-lg font-bold text-white mb-0.5">{noteName}</div>
                <div className="text-stitek text-neutral-400 font-mono">{freq} Hz</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Metronome Tool Panel */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-znacka" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Metronom & Tap Tempo
            </h3>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              title={isMuted ? 'Zapnout zvuk metronomu' : 'Ztlumit zvuk metronomu'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* BPM Display & Tap Button */}
          <div className="flex items-center gap-3">
            <div className="bg-black/40 border border-white/10 px-4 py-2 rounded-2xl text-center min-w-[100px]">
              <div className="text-2xl font-bold text-white font-mono">{metroBpm}</div>
              <div className="text-stitek text-neutral-400 font-medium">BPM</div>
            </div>

            <button
              onClick={handleTapTempo}
              className="px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-semibold rounded-2xl transition-all cursor-pointer active:scale-95"
            >
              TAP TEMPO
            </button>

            {tapFeedback && (
              <span className="text-xs text-znacka font-semibold animate-pulse">
                {tapFeedback}
              </span>
            )}
          </div>

          {/* Slider BPM */}
          <div className="flex-1 w-full sm:max-w-xs px-2">
            <input
              type="range"
              min="40"
              max="240"
              value={metroBpm}
              onChange={(e) => setMetroBpm(parseInt(e.target.value, 10))}
              className="w-full accent-znacka cursor-pointer"
            />
          </div>

          {/* Play / Pause Metronome */}
          <button
            onClick={() => setIsMetroPlaying(!isMetroPlaying)}
            className={`px-5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
              isMetroPlaying
                ? 'bg-chyba text-white'
                : 'bg-znacka hover:bg-znacka/90 text-black'
            }`}
          >
            {isMetroPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isMetroPlaying ? 'Zastavit metronom' : 'Spustit metronom'}</span>
          </button>

        </div>

        {/* Visual Beats Indicator */}
        <div className="flex justify-center gap-2 pt-2">
          {Array.from({ length: beatsPerBar }).map((_, idx) => {
            const isCurrent = isMetroPlaying && currentBeat === idx;
            const isFirst = idx === 0;

            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-100 ${
                  isCurrent
                    ? isFirst
                      ? 'bg-chyba scale-125 shadow-[0_0_10px_#FF453A]'
                      : 'bg-znacka scale-110 shadow-[0_0_8px_#FF9F0A]'
                    : 'bg-white/10'
                }`}
              />
            );
          })}
        </div>

      </div>

    </div>
  );
};
