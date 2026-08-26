import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, Play, Pause, RotateCw, Volume2, Music, Radio, Compass,
  Activity, ArrowRight, Zap, RefreshCw, VolumeX, ShieldCheck
} from 'lucide-react';
import { PitchDetector, PitchData } from '../services/tuner';
import { audioSynth } from '../services/audioSynth';
import { TUNING_PRESETS } from '../data/chordsAndScales';
import { findOrGenerateChord } from '../utils/chordUtils';
import { useMusicalContext } from '../context/MusicalContext';

// ==========================================
// 1. MODULAR TUNER & METRONOME SECTION
// ==========================================
interface ModularTunerProps {
  currentTuningName?: string;
  onTuningChange?: (newTuning: string) => void;
}

export const ModularTunerSection: React.FC<ModularTunerProps> = ({
  currentTuningName = 'Standardní E (E A D G B E)',
  onTuningChange,
}) => {
  const musicalCtx = useMusicalContext();
  const activeTuning = musicalCtx?.tuning || currentTuningName;

  const initialPresetIdx = TUNING_PRESETS.findIndex((p) => p.name === activeTuning);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(initialPresetIdx >= 0 ? initialPresetIdx : 0);
  const [isListening, setIsListening] = useState(false);
  const [pitchData, setPitchData] = useState<PitchData | null>(null);
  const [activeStringIndex, setActiveStringIndex] = useState<number | null>(null);

  // Metronome mini sub-state synced with MusicalContext
  const bpm = musicalCtx?.bpm || 120;
  const isMetroRunning = musicalCtx?.isMetronomeActive || false;
  const [beatCount, setBeatCount] = useState(0);

  const pitchDetectorRef = useRef<PitchDetector | null>(null);
  const metroTimerRef = useRef<any>(null);

  // Keep preset in sync if tuning changes from other modules
  useEffect(() => {
    if (musicalCtx?.tuning) {
      const idx = TUNING_PRESETS.findIndex((p) => p.name === musicalCtx.tuning);
      if (idx >= 0 && idx !== selectedPresetIndex) {
        setSelectedPresetIndex(idx);
      }
    }
  }, [musicalCtx?.tuning]);

  const activePreset = TUNING_PRESETS[selectedPresetIndex] || TUNING_PRESETS[0];

  const handleSelectTuning = (idx: number) => {
    setSelectedPresetIndex(idx);
    const preset = TUNING_PRESETS[idx];
    if (preset) {
      if (musicalCtx?.setTuning) {
        musicalCtx.setTuning(preset.name);
      }
      if (onTuningChange) {
        onTuningChange(preset.name);
      }
    }
  };

  useEffect(() => {
    pitchDetectorRef.current = new PitchDetector();
    return () => {
      if (pitchDetectorRef.current) pitchDetectorRef.current.stop();
      if (metroTimerRef.current) clearInterval(metroTimerRef.current);
    };
  }, []);

  // Metronome tick loop
  useEffect(() => {
    if (isMetroRunning) {
      const intervalMs = (60 / bpm) * 1000;
      metroTimerRef.current = setInterval(() => {
        // Klepe metronomová služba, tahle smyčka jen počítá doby na
        // displeji. Dvě klepnutí na dobu by zněla jako rozladěný stroj.
        setBeatCount((prev) => (prev % 4) + 1);
      }, intervalMs);
    } else {
      if (metroTimerRef.current) clearInterval(metroTimerRef.current);
      setBeatCount(0);
    }
    return () => {
      if (metroTimerRef.current) clearInterval(metroTimerRef.current);
    };
  }, [isMetroRunning, bpm]);

  // Tuner Mic Toggle
  const toggleListening = async () => {
    if (isListening) {
      pitchDetectorRef.current?.stop();
      setIsListening(false);
      setPitchData(null);
    } else {
      const success = await pitchDetectorRef.current?.start((data) => {
        setPitchData(data);
      });
      if (success) {
        setIsListening(true);
      }
    }
  };

  const playReferenceTone = (freq: number, strIdx: number) => {
    setActiveStringIndex(strIdx);
    audioSynth.playNote(freq, 'acoustic_guitar', 2.0, 0.7);
    setTimeout(() => setActiveStringIndex(null), 1200);
  };

  // Cents indicator helper
  const cents = pitchData?.cents || 0;
  const inTune = Math.abs(cents) < 5;

  return (
    <div className="flex-1 flex flex-col gap-3">
      {/* Top Selector Bar */}
      <div className="flex items-center justify-between gap-2 p-2 bg-white/[0.03] border border-white/[0.06] rounded-2xl text-xs">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-[#FF9F0A]" />
          <select
            value={selectedPresetIndex}
            onChange={(e) => handleSelectTuning(parseInt(e.target.value, 10))}
            className="bg-black/60 border border-white/10 text-white rounded-xl px-2 py-1 outline-none text-xs cursor-pointer"
          >
            {TUNING_PRESETS.map((p, idx) => (
              <option key={p.name} value={idx}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={toggleListening}
          className={`px-3 py-1 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer text-xs transition-all ${
            isListening
              ? 'bg-[#30D158] text-black shadow-lg shadow-[#30D158]/20 animate-pulse'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>{isListening ? 'Mikrofon aktivní' : 'Zapnout mikrofon'}</span>
        </button>
      </div>

      {/* Visual Needle / Pitch Display */}
      <div className="p-4 bg-black/40 border border-white/10 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden">
        {pitchData ? (
          <div className="text-center space-y-1">
            <div className="text-4xl font-black font-mono text-white flex items-baseline justify-center gap-1">
              <span>{pitchData.note}</span>
              <span className="text-lg text-neutral-400 font-sans font-normal">{pitchData.octave}</span>
            </div>
            <div className="text-xs font-mono text-neutral-400">
              {pitchData.frequency.toFixed(1)} Hz
            </div>

            {/* Gauge bar */}
            <div className="w-48 h-2 bg-neutral-800 rounded-full mt-2 relative overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/40 -translate-x-1/2" />
              <div
                className={`absolute top-0 bottom-0 w-3 rounded-full transition-all ${
                  inTune ? 'bg-[#30D158]' : 'bg-[#FF9F0A]'
                }`}
                style={{
                  left: `calc(50% + ${Math.max(-45, Math.min(45, cents)) * 0.9}%)`,
                  transform: 'translateX(-50%)',
                }}
              />
            </div>
            <p className={`text-[10px] font-bold uppercase mt-1 ${inTune ? 'text-[#30D158]' : 'text-[#FF9F0A]'}`}>
              {inTune ? '✓ Naladěno' : cents > 0 ? `+${cents} centů (Příliš vysoko)` : `${cents} centů (Příliš nízko)`}
            </p>
          </div>
        ) : (
          <div className="text-center py-2 text-neutral-400 text-xs">
            <p className="font-semibold text-neutral-300">Připraveno k ladění ({activePreset.name})</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Klikněte na strunu níže pro referenční tón nebo zapněte mikrofon.
            </p>
          </div>
        )}
      </div>

      {/* String Tones Row */}
      <div className="grid grid-cols-6 gap-1.5">
        {activePreset.notes.map((noteName, idx) => {
          const freq = activePreset.frequencies[idx];
          const isAct = activeStringIndex === idx;

          return (
            <button
              key={idx}
              onClick={() => playReferenceTone(freq, idx)}
              className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                isAct
                  ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] font-bold scale-105 shadow-md'
                  : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] text-white'
              }`}
              title={`Přehrát referenční tón ${noteName}`}
            >
              <div className="text-[10px] text-neutral-400">{idx + 1}. struna</div>
              <div className="text-sm font-bold font-mono text-[#FF9F0A]">{noteName}</div>
            </button>
          );
        })}
      </div>

      {/* Mini Metronome Widget */}
      <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-2xl flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[#FF9F0A]" />
          <span className="font-semibold text-white">Metronom:</span>
          <span className="font-mono font-bold text-[#FF9F0A]">{bpm} BPM</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="range"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => musicalCtx?.setBpm ? musicalCtx.setBpm(parseInt(e.target.value, 10)) : undefined}
            className="w-24 accent-[#FF9F0A] cursor-pointer"
          />
          <button
            onClick={() => musicalCtx?.toggleMetronome ? musicalCtx.toggleMetronome() : undefined}
            className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 cursor-pointer transition-all ${
              isMetroRunning ? 'bg-[#FF453A] text-white' : 'bg-[#30D158] text-black'
            }`}
          >
            {isMetroRunning ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            <span>{isMetroRunning ? 'Stop' : 'Start'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. MODULAR FRETBOARD SECTION
// ==========================================
interface ModularFretboardProps {
  songChords?: string[];
  activeKey?: string;
  onSelectChord?: (chord: string) => void;
}

const ROOT_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const GUITAR_STRINGS = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];
const STRING_BASE_MIDIS = [64, 59, 55, 50, 45, 40];

export const ModularFretboardSection: React.FC<ModularFretboardProps> = ({
  songChords = [],
  activeKey,
  onSelectChord,
}) => {
  const musicalCtx = useMusicalContext();
  const [selectedChordName, setSelectedChordName] = useState<string>(
    musicalCtx?.activeChord || songChords[0] || 'C'
  );
  const [activeFretLimit, setActiveFretLimit] = useState(12);

  // Sync if active chord changes globally
  useEffect(() => {
    if (musicalCtx?.activeChord && musicalCtx.activeChord !== selectedChordName) {
      setSelectedChordName(musicalCtx.activeChord);
    }
  }, [musicalCtx?.activeChord]);

  const chordDef = findOrGenerateChord(selectedChordName);

  const handleChooseChord = (ch: string) => {
    setSelectedChordName(ch);
    if (musicalCtx?.setActiveChord) {
      musicalCtx.setActiveChord(ch);
    }
    if (onSelectChord) {
      onSelectChord(ch);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-3">
      {/* Quick Chord Selector Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white/[0.03] border border-white/[0.06] rounded-2xl text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-neutral-400 font-medium">Akord na hmatníku:</span>
          {songChords.map((ch) => (
            <button
              key={ch}
              onClick={() => handleChooseChord(ch)}
              className={`px-2 py-0.5 rounded-lg font-mono font-bold text-xs transition-all cursor-pointer ${
                selectedChordName === ch
                  ? 'bg-[#FF9F0A] text-black shadow-sm'
                  : 'bg-white/5 hover:bg-white/15 text-white'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>

        {/* Fret count selector & Strum button */}
        <div className="flex items-center gap-2">
          {chordDef && (
            <button
              onClick={() => {
                if (chordDef.frets) {
                  audioSynth.playGuitarChord(chordDef.frets);
                }
              }}
              className="px-2.5 py-1 bg-[#30D158] text-black font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" /> Přehrát
            </button>
          )}

          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-neutral-400">Pražce:</span>
            <select
              value={activeFretLimit}
              onChange={(e) => setActiveFretLimit(parseInt(e.target.value, 10))}
              className="bg-black/60 border border-white/10 text-white rounded-lg px-1.5 py-0.5 outline-none text-[11px] cursor-pointer"
            >
              <option value={12}>12 pražců</option>
              <option value={15}>15 pražců</option>
            </select>
          </div>
        </div>
      </div>

      {/* Interactive Fretboard Graphic Box */}
      <div className="flex-1 bg-black/50 p-3 sm:p-4 rounded-2xl border border-white/10 overflow-x-auto shadow-inner">
        {/* Fret Numbers Header */}
        <div className="flex min-w-[650px] text-center text-[10px] font-mono text-neutral-400 font-bold mb-2">
          <span className="w-12 text-left">STRUNA</span>
          <span className="w-10">0</span>
          {Array.from({ length: activeFretLimit }).map((_, i) => (
            <span
              key={i}
              className={`flex-1 ${
                i + 1 === 3 || i + 1 === 5 || i + 1 === 7 || i + 1 === 9 || i + 1 === 12
                  ? 'text-[#FF9F0A] font-extrabold'
                  : ''
              }`}
            >
              {i + 1}
            </span>
          ))}
        </div>

        {/* 6 Guitar Strings Fretboard Grid */}
        <div className="space-y-1 min-w-[650px]">
          {GUITAR_STRINGS.map((stringLabel, stringIdx) => {
            const baseMidi = STRING_BASE_MIDIS[stringIdx];

            return (
              <div key={stringIdx} className="flex items-center gap-0 border-b border-white/[0.04] pb-1">
                {/* String Label */}
                <span className="font-mono text-xs font-semibold text-neutral-400 w-12 shrink-0">
                  {stringLabel}
                </span>

                {/* Frets 0 to activeFretLimit */}
                {Array.from({ length: activeFretLimit + 1 }).map((_, fret) => {
                  const noteMidi = (baseMidi + fret) % 12;
                  const noteName = ROOT_NOTES[noteMidi];

                  let isChordFret = false;
                  if (chordDef) {
                    const chordFretIdx = 5 - stringIdx;
                    const activeFret = chordDef.frets[chordFretIdx];
                    if (activeFret === fret) {
                      isChordFret = true;
                    }
                  }

                  return (
                    <div
                      key={fret}
                      onClick={() => {
                        const freq = (440 / 32) * Math.pow(2, ((baseMidi + fret) - 9) / 12);
                        audioSynth.playNote(freq, 'electric_guitar', 1.8, 0.7);
                      }}
                      className={`h-7 sm:h-8 border-r border-white/10 flex items-center justify-center relative cursor-pointer hover:bg-white/[0.06] transition-colors ${
                        fret === 0 ? 'w-10 bg-white/[0.04] border-r-2 border-[#FF9F0A]' : 'flex-1'
                      }`}
                    >
                      {/* String Line Background */}
                      <div className="absolute inset-x-0 h-[1.5px] bg-white/20 z-0"></div>

                      {/* Note Marker */}
                      {isChordFret && (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] font-mono z-10 shadow-md bg-[#FF9F0A] text-black shadow-[0_0_10px_#FF9F0A]"
                          title={`Tón ${noteName} na ${fret}. pražci`}
                        >
                          {noteName}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. MODULAR PIANO / KEYBOARD SECTION
// ==========================================
export { ModularPianoSection } from './ModularPianoSection';

