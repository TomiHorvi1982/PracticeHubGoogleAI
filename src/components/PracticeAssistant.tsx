import React, { useState, useEffect, useRef } from 'react';
import { audioSynth } from '../services/audioSynth';
import { findOrGenerateChord } from '../utils/chordUtils';
import { MidiPlayer } from './MidiPlayer';
import {
  Play, Pause, Zap, Music, Volume2, VolumeX, Plus, Trash2, Sliders,
  Check, ChevronRight, Activity, Repeat, Grid
} from 'lucide-react';

import { parseSongSections, SongSection } from '../utils/songSectionUtils';
import { useMusicalContext } from '../context/MusicalContext';

const QUICK_CHORDS = ['C', 'G', 'Am', 'F', 'Em', 'D', 'Dm', 'A', 'E', 'B7', 'F#m', 'Cadd9', 'G7'];

const TEMPO_PRESETS = [
  { name: 'LARGO', bpm: 50 },
  { name: 'ANDANTE', bpm: 72 },
  { name: 'MODERATO', bpm: 96 },
  { name: 'ALLEGRO', bpm: 120 },
  { name: 'PRESTO', bpm: 144 },
  { name: 'PRESTISSIMO', bpm: 180 },
];

// Strumming preset patterns (8 beat sub-steps)
const STRUM_PATTERNS = [
  { id: 'folk_4_4', name: 'STANDARD 4/4 FOLK', pattern: ['D', '.', 'D', 'U', '.', 'U', 'D', 'U'], desc: 'Klasický táborákový doprovod (D-DU-UDU)' },
  { id: 'pop_ballad', name: 'POP BALADA', pattern: ['D', '.', '.', '.', 'D', '.', 'D', 'U'], desc: 'Pomalý baladický rytmus' },
  { id: 'rock_drive', name: 'ROCK DRIVER', pattern: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D'], desc: 'Rychlé osminové rockové údery dolů' },
  { id: 'reggae', name: 'REGGAE OFFBEAT', pattern: ['.', 'U', '.', 'U', '.', 'U', '.', 'U'], desc: 'Synkopické údery na lehkou dobu' },
];

// Fingerpicking preset patterns (string indices 1 to 6)
const PICKING_PATTERNS = [
  { id: 'arpeggio_6_8', name: 'KLASICKÉ ARPEGGIO 6/8', sequence: [6, 3, 2, 1, 2, 3], desc: 'Rozkládání akordů od basu k nejvyšší struně (6-3-2-1-2-3)' },
  { id: 'travis', name: 'FOLK TRAVIS PICKING', sequence: [6, 3, 4, 2, 5, 3, 4, 2], desc: 'Střídavý palcový bas s ukazováčkem a prostředníčkem' },
  { id: 'ballad_3_4', name: 'VALČÍKOVÉ VYDRNKÁVÁNÍ 3/4', sequence: [6, 3, 2, 1, 3, 2], desc: 'Tříčtvrteční rytmus balad' },
  { id: 'alternating', name: 'STŘÍDAVÝ BAS', sequence: [6, 3, 2, 1], desc: 'Rychlé přímé vybrnkávání' },
];

export const PracticeAssistant: React.FC = () => {
  const {
    bpm: globalBpm,
    setBpm: setGlobalBpm,
    isMetronomeActive,
    toggleMetronome,
    setActiveChord,
  } = useMusicalContext();

  // Metronome State
  const bpm = globalBpm;
  const setBpm = (val: number | ((prev: number) => number)) => {
    if (typeof val === 'function') {
      setGlobalBpm(val(globalBpm));
    } else {
      setGlobalBpm(val);
    }
  };

  const isPlayingMetro = isMetronomeActive;
  const setIsPlayingMetro = (_val?: boolean) => {
    toggleMetronome();
  };

  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isMetroMuted, setIsMetroMuted] = useState(false);
  const [flashTick, setFlashTick] = useState(false);
  const [accentBeats, setAccentBeats] = useState<boolean[]>([true, false, false, false]);

  // Tap Tempo State
  const tapTimesRef = useRef<number[]>([]);

  // Chord Backing Loop State
  const [isPlayingBacking, setIsPlayingBacking] = useState(false);
  const [backingStyle, setBackingStyle] = useState<'pop' | 'blues' | 'rock' | 'folk' | 'jazz' | 'custom'>('pop');
  const [chordSequence, setChordSequence] = useState<string[]>(['C', 'G', 'Am', 'F']);
  const [newChordInput, setNewChordInput] = useState('');
  const [activeChordIdx, setActiveChordIdx] = useState(0);

  // Playback Mode: Strumming vs Fingerpicking vs Piano
  const [backingMode, setBackingMode] = useState<'strum' | 'picking' | 'piano'>('strum');
  const [selectedStrumId, setSelectedStrumId] = useState('folk_4_4');
  const [selectedPickingId, setSelectedPickingId] = useState('arpeggio_6_8');
  const [selectedInstrument, setSelectedInstrument] = useState<'guitar' | 'piano' | 'both'>('guitar');

  // Custom Strumming Grid State (8 steps)
  const [customStrum, setCustomStrum] = useState<string[]>(['D', '.', 'D', 'U', '.', 'U', 'D', 'U']);

  // Sync accentBeats array with beatsPerBar
  useEffect(() => {
    setAccentBeats((prev) => {
      const arr = Array.from({ length: beatsPerBar }, (_, i) => {
        if (i < prev.length) return prev[i];
        return i === 0; // Beat 1 accented by default
      });
      return arr;
    });
  }, [beatsPerBar]);

  // Metronome Loop
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlayingMetro) {
      const ms = (60 / bpm) * 1000;
      interval = setInterval(() => {
        setCurrentBeat((prev) => {
          const next = (prev + 1) % beatsPerBar;
          // Zvuk obstarává metronomová služba — ta běží i mimo tuhle
          // sekci. Klepat i tady by znamenalo dvě klepnutí na dobu.
          // Zdejší smyčka zůstává kvůli blikání a počítání dob.
          setFlashTick(true);
          setTimeout(() => setFlashTick(false), 120);
          return next;
        });
      }, ms);
    } else {
      setCurrentBeat(0);
      setFlashTick(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingMetro, bpm, beatsPerBar, isMetroMuted, accentBeats]);

  // Update preset chord sequences
  useEffect(() => {
    if (backingStyle === 'pop') {
      setChordSequence(['C', 'G', 'Am', 'F']);
    } else if (backingStyle === 'blues') {
      setChordSequence(['A7', 'D7', 'A7', 'E7']);
    } else if (backingStyle === 'rock') {
      setChordSequence(['E5', 'G5', 'A5', 'C5']);
    } else if (backingStyle === 'folk') {
      setChordSequence(['G', 'Em', 'C', 'D']);
    } else if (backingStyle === 'jazz') {
      setChordSequence(['Dm7', 'G7', 'Cmaj7', 'A7']);
    }
  }, [backingStyle]);

  // Rhythm Backing Loop Engine
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isPlayingBacking && chordSequence.length > 0) {
      let currentChordPos = 0;
      let currentStep = 0;

      // Base timing: 8 steps per bar (8th notes)
      const stepMs = ((60 / bpm) * 1000) / 2;

      // Active strumming or picking pattern
      const activeStrum = STRUM_PATTERNS.find((s) => s.id === selectedStrumId)?.pattern || customStrum;
      const activePicking = PICKING_PATTERNS.find((p) => p.id === selectedPickingId)?.sequence || [6, 3, 2, 1];

      const playStep = () => {
        const chordName = chordSequence[currentChordPos % chordSequence.length];
        const chordDef = findOrGenerateChord(chordName);
        setActiveChordIdx(currentChordPos % chordSequence.length);

        if (backingMode === 'strum') {
          const stroke = activeStrum[currentStep % activeStrum.length];
          if (stroke === 'D' || stroke === 'U') {
            if (selectedInstrument === 'guitar' || selectedInstrument === 'both') {
              audioSynth.playGuitarChord(chordDef.frets);
            }
            if (selectedInstrument === 'piano' || selectedInstrument === 'both') {
              audioSynth.playPianoChord(chordDef.pianoKeys, 4);
            }
          } else if (stroke === 'M') {
            audioSynth.playDrumSound('snare', 0.4);
          }
        } else if (backingMode === 'picking') {
          const stringNum = activePicking[currentStep % activePicking.length];
          // Guitar tuning base frequencies: E2, A2, D3, G3, B3, E4
          const baseTuning = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
          const stringIdx = 6 - stringNum;
          const fret = chordDef.frets[stringIdx];

          if (fret >= 0) {
            const freq = baseTuning[stringIdx] * Math.pow(2, fret / 12);
            if (selectedInstrument === 'guitar' || selectedInstrument === 'both') {
              audioSynth.playGuitarNote(freq, 1.8, 0.5);
            }
            if (selectedInstrument === 'piano' || selectedInstrument === 'both') {
              audioSynth.playPianoNote(freq, 1.8, 0.5);
            }
          }
        } else if (backingMode === 'piano') {
          // Play piano chord on beat 1 and beat 3
          if (currentStep === 0 || currentStep === 4) {
            audioSynth.playPianoChord(chordDef.pianoKeys, 4, 2.2, 0.6);
          }
        }

        // Advance steps
        currentStep++;
        const totalStepsInBar = backingMode === 'picking' ? activePicking.length : 8;
        if (currentStep >= totalStepsInBar) {
          currentStep = 0;
          currentChordPos++;
        }
      };

      playStep();
      interval = setInterval(playStep, stepMs);
    } else {
      setActiveChordIdx(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingBacking, bpm, chordSequence, backingMode, selectedStrumId, selectedPickingId, selectedInstrument, customStrum]);

  const handleTapTempo = () => {
    const now = Date.now();
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > 4) {
      tapTimesRef.current.shift();
    }
    if (tapTimesRef.current.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      if (calculatedBpm >= 40 && calculatedBpm <= 250) {
        setBpm(calculatedBpm);
      }
    }
  };

  const handleSelectTimeSignature = (beats: number) => {
    setBeatsPerBar(beats);
    setCurrentBeat(0);
  };

  const toggleBeatAccent = (beatIdx: number) => {
    setAccentBeats((prev) => {
      const copy = [...prev];
      copy[beatIdx] = !copy[beatIdx];
      return copy;
    });
  };

  const handleAddCustomChord = (chordToAdd?: string) => {
    const name = (chordToAdd || newChordInput).trim();
    if (!name) return;
    setChordSequence((prev) => [...prev, name]);
    setNewChordInput('');
    setBackingStyle('custom');
  };

  const handleRemoveChord = (idx: number) => {
    setChordSequence((prev) => prev.filter((_, i) => i !== idx));
    setBackingStyle('custom');
  };

  const toggleCustomStrumStep = (stepIdx: number) => {
    const options = ['D', 'U', 'M', '.'];
    setCustomStrum((prev) => {
      const copy = [...prev];
      const curIdx = options.indexOf(copy[stepIdx]);
      copy[stepIdx] = options[(curIdx + 1) % options.length];
      return copy;
    });
    setSelectedStrumId('custom');
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 font-sans text-white pb-12">
      
      {/* 🥁 VISUAL METRONOME SECTION */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl">
        
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#FF9F0A] text-black font-bold px-2 py-0.5 text-stitek rounded-md uppercase tracking-wide">
                  Vizuální Metronom
                </span>
                <span className="text-xs text-neutral-400 font-medium">{bpm} BPM • {beatsPerBar}/4 takt</span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
                Přesný Metronom s Nastavením Akcentů
              </h2>
            </div>
          </div>

          {/* Sound / Visual Only Toggle */}
          <button
            onClick={() => setIsMetroMuted(!isMetroMuted)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isMetroMuted
                ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                : 'bg-[#30D158]/10 text-[#30D158] border-[#30D158]/30 hover:bg-[#30D158]/20'
            }`}
          >
            {isMetroMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isMetroMuted ? 'Tichý režim (pouze blikání)' : 'Zvuk metronomu: Zapnuto'}</span>
          </button>
        </div>

        {/* Central Visual Metronome Stage: Pendulum + Flashing Beacon Light */}
        <div className="bg-black/40 border border-white/5 rounded-2xl p-6 relative overflow-hidden flex flex-col items-center justify-center space-y-6">
          
          {/* Pendulum Swinging Arm Visual */}
          <div className="relative w-full max-w-md h-24 flex items-center justify-center border-b border-white/10">
            {/* Arc Scale Markers */}
            <div className="absolute top-2 left-0 right-0 flex justify-between px-6 text-stitek text-neutral-500 font-semibold">
              <span>◄ 1. Doba</span>
              <span>Střed</span>
              <span>{beatsPerBar}. Doba ►</span>
            </div>

            {/* Pendulum Pivot Point */}
            <div className="absolute bottom-0 w-3 h-3 bg-neutral-600 rounded-full z-10" />

            {/* Pendulum Needle Arm */}
            <div
              className="absolute bottom-0 w-1 bg-[#FF9F0A] origin-bottom transition-all duration-100 ease-out z-20 flex flex-col items-center"
              style={{
                height: '80px',
                transform: `rotate(${isPlayingMetro ? (-35 + (currentBeat / Math.max(1, beatsPerBar - 1)) * 70) : 0}deg)`,
              }}
            >
              {/* Pendulum Weight Ball */}
              <div
                className={`w-5 h-5 -mt-2 rounded-full border border-black shadow-lg transition-all ${
                  flashTick
                    ? accentBeats[currentBeat]
                      ? 'bg-[#FF453A] shadow-[0_0_15px_#FF453A]'
                      : 'bg-[#30D158] shadow-[0_0_12px_#30D158]'
                    : 'bg-white'
                }`}
              />
            </div>
          </div>

          {/* Central Flashing Light Beacon Display */}
          <div className="flex flex-col items-center space-y-3">
            <div
              className={`w-32 h-32 rounded-3xl border-2 flex flex-col items-center justify-center transition-all duration-100 ${
                isPlayingMetro && flashTick
                  ? accentBeats[currentBeat]
                    ? 'bg-[#FF453A] border-white text-white scale-105 shadow-[0_0_40px_rgba(255,69,58,0.8)]'
                    : 'bg-[#30D158] border-white text-black scale-105 shadow-[0_0_35px_rgba(48,209,88,0.8)]'
                  : isPlayingMetro
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/[0.02] border-white/10 text-neutral-500'
              }`}
            >
              <span className="text-5xl font-bold font-mono tracking-tighter">
                {isPlayingMetro ? currentBeat + 1 : '-'}
              </span>
              <span className="text-stitek font-bold uppercase tracking-wider mt-1">
                {isPlayingMetro
                  ? accentBeats[currentBeat]
                    ? '⚡ Akcent'
                    : 'Doba'
                  : 'Připraveno'}
              </span>
            </div>

            {/* Status description text */}
            <div className="text-center">
              <span className="text-xs font-semibold text-white block">
                {isPlayingMetro
                  ? `Doba ${currentBeat + 1} z ${beatsPerBar} (${accentBeats[currentBeat] ? 'Přízvuk / Akcent' : 'Běžná doba'})`
                  : 'Metronom je připraven ke spuštění'}
              </span>
              <span className="text-xs text-neutral-400 block mt-0.5">
                Tempo: <strong className="text-[#30D158]">{bpm} BPM</strong> | Takt: <strong className="text-white">{beatsPerBar}/4</strong>
              </span>
            </div>
          </div>

        </div>

        {/* Beats Per Measure Settings & Interactive Beat Cards */}
        <div className="bg-black/40 p-3 sm:p-5 rounded-2xl border border-white/5 space-y-4">
          
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-[#FF9F0A]" />
              <span className="text-xs font-bold text-white">
                Nastavení počtu dob v taktu &amp; akcentů:
              </span>
            </div>

            {/* Time Signature Presets */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              <span className="text-stitek text-neutral-400 font-semibold px-1.5 uppercase">Takt:</span>
              {[
                { label: '2/4', beats: 2 },
                { label: '3/4', beats: 3 },
                { label: '4/4', beats: 4 },
                { label: '5/4', beats: 5 },
                { label: '6/8', beats: 6 },
                { label: '7/8', beats: 7 },
              ].map((sig) => (
                <button
                  key={sig.label}
                  onClick={() => handleSelectTimeSignature(sig.beats)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    beatsPerBar === sig.beats
                      ? 'bg-white text-black shadow-md font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {sig.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stepper for custom beat count */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] p-3 rounded-xl border border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400 font-medium">Počet dob v taktu:</span>
              <span className="text-base font-bold text-[#30D158] px-2">{beatsPerBar} dob</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setBeatsPerBar((prev) => Math.max(1, prev - 1))}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 text-xs font-semibold cursor-pointer"
              >
                -1 doba
              </button>
              <button
                onClick={() => setBeatsPerBar((prev) => Math.min(12, prev + 1))}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 text-xs font-semibold cursor-pointer"
              >
                +1 doba
              </button>
            </div>
          </div>

          {/* Interactive Beat Cards Grid */}
          <div className="space-y-1.5">
            <span className="text-xs text-neutral-400 font-medium block">
              Mřížka dob (klikněte pro zapnutí/vypnutí akcentu):
            </span>
            <div className="flex flex-wrap items-center gap-2 py-1">
              {Array.from({ length: beatsPerBar }).map((_, i) => {
                const isActive = isPlayingMetro && currentBeat === i;
                const isAccented = accentBeats[i];

                return (
                  <button
                    key={i}
                    onClick={() => toggleBeatAccent(i)}
                    className={`flex-1 min-w-[60px] h-16 rounded-xl border p-1.5 flex flex-col justify-between items-center transition-all cursor-pointer font-sans ${
                      isActive
                        ? isAccented
                          ? 'bg-[#FF453A] text-white border-white scale-105 shadow-[0_0_15px_#FF453A]'
                          : 'bg-[#30D158] text-black border-white scale-105 shadow-[0_0_12px_#30D158]'
                        : isAccented
                        ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/40 hover:bg-[#FF9F0A]/25'
                        : 'bg-black/30 text-neutral-400 border-white/5 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="text-stitek opacity-70 font-semibold">Doba {i + 1}</span>
                    <span className="text-base font-bold">{i + 1}</span>
                    <span className="text-stitek font-bold uppercase">
                      {isAccented ? '⚡ Akcent' : 'Běžná'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* BPM Tempo Controls & Tap Tempo */}
        <div className="bg-black/40 p-3 sm:p-5 rounded-2xl border border-white/5 space-y-4">
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            
            {/* BPM Display Box */}
            <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-3 min-w-[180px] text-center shadow-inner">
              <div className="text-4xl font-bold font-mono text-white tracking-tight">
                {bpm} <span className="text-xs text-neutral-400 font-normal">BPM</span>
              </div>
              <span className="text-drobne text-[#30D158] font-semibold block mt-1">
                {bpm < 60
                  ? 'Largo (Pomalé)'
                  : bpm < 90
                  ? 'Andante (Mírné)'
                  : bpm < 120
                  ? 'Moderato (Střední)'
                  : bpm < 150
                  ? 'Allegro (Rychlé)'
                  : 'Presto (Velmi rychlé)'}
              </span>
            </div>

            {/* Stepper Buttons & Slider */}
            <div className="flex-1 max-w-md space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400 font-medium">
                <span>30 BPM</span>
                <span>Nastavení tempa</span>
                <span>280 BPM</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBpm((prev) => Math.max(30, prev - 5))}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 text-xs font-semibold cursor-pointer"
                >
                  -5
                </button>
                <button
                  onClick={() => setBpm((prev) => Math.max(30, prev - 1))}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 text-xs font-semibold cursor-pointer"
                >
                  -1
                </button>

                <input
                  type="range"
                  min="30"
                  max="280"
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="flex-1 accent-[#FF9F0A] cursor-pointer"
                />

                <button
                  onClick={() => setBpm((prev) => Math.min(280, prev + 1))}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 text-xs font-semibold cursor-pointer"
                >
                  +1
                </button>
                <button
                  onClick={() => setBpm((prev) => Math.min(280, prev + 5))}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 text-xs font-semibold cursor-pointer"
                >
                  +5
                </button>
              </div>
            </div>

            {/* Play & Tap Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsPlayingMetro(!isPlayingMetro)}
                className={`px-5 py-3 rounded-2xl font-bold text-xs uppercase flex items-center gap-2 shadow-lg cursor-pointer transition-all active:scale-95 ${
                  isPlayingMetro
                    ? 'bg-[#FF453A] text-white hover:bg-[#ff5b52]'
                    : 'bg-[#30D158] text-black hover:bg-[#34e260]'
                }`}
              >
                {isPlayingMetro ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{isPlayingMetro ? 'Zastavit metronom' : 'Spustit metronom'}</span>
              </button>

              <button
                onClick={handleTapTempo}
                className="px-4 py-3 bg-white/5 hover:bg-white/10 text-[#FF9F0A] font-semibold text-xs border border-white/10 rounded-2xl flex items-center gap-1.5 cursor-pointer transition-all"
                title="Vyťukejte tempo klikáním"
              >
                <Zap className="w-4 h-4 text-[#FF9F0A]" />
                <span>Tap Tempo</span>
              </button>
            </div>

          </div>

          {/* Quick Tempo Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-white/5">
            <span className="text-xs text-neutral-400 font-medium mr-1">Rychlé tempo:</span>
            {TEMPO_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setBpm(preset.bpm)}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  bpm === preset.bpm
                    ? 'bg-white text-black font-bold shadow-md'
                    : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
                }`}
              >
                {preset.name} ({preset.bpm})
              </button>
            ))}
          </div>

        </div>

      </div>

      {/* 🎸 VLASTNÍ AKORDY A PATERNY DOPROVODU (CHORD PROGRESSION & RHYTHM TRAINER) */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
        
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#30D158]/10 border border-[#30D158]/30 text-[#30D158] rounded-2xl">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#30D158] text-black font-bold px-2 py-0.5 text-stitek rounded-md uppercase tracking-wide">
                  Doprovodný trenér
                </span>
                <span className="text-xs text-neutral-400 font-medium">{chordSequence.length} akordů ve smyčce</span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight mt-0.5">
                Vlastní Akordy &amp; Paterny Strummingu a Vybrnkávání
              </h3>
            </div>
          </div>

          <button
            onClick={() => setIsPlayingBacking(!isPlayingBacking)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs uppercase shadow-lg cursor-pointer transition-all active:scale-95 ${
              isPlayingBacking
                ? 'bg-[#FF453A] text-white hover:bg-[#ff5b52]'
                : 'bg-[#30D158] text-black hover:bg-[#34e260]'
            }`}
          >
            {isPlayingBacking ? <Pause className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isPlayingBacking ? 'Zastavit doprovod' : 'Spustit doprovod'}</span>
          </button>
        </div>

        {/* 1. CHORD PROGRESSION BUILDER (VLASTNÍ AKORDY) */}
        <div className="bg-black/40 p-3 sm:p-5 rounded-2xl border border-white/5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Music className="w-4 h-4 text-[#30D158]" /> 1. Akordová posloupnost:
            </span>

            {/* Presets dropdown */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-neutral-400 font-medium">Presety:</span>
              <select
                value={backingStyle}
                onChange={(e) => setBackingStyle(e.target.value as any)}
                /* `min-w-0` a `max-w-full`: rozbalovátko se roztahuje podle
                   nejdelší položky („Pop Classic (C - G - Am - F)"), takže
                   mělo 283px v kontejneru širokém 267 a přetékalo. */
                className="min-w-0 max-w-full truncate bg-white/5 border border-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-xl outline-none cursor-pointer"
              >
                <option value="pop" className="bg-[#16161A]">Pop Classic (C - G - Am - F)</option>
                <option value="blues" className="bg-[#16161A]">12-Bar Blues (A7 - D7 - A7 - E7)</option>
                <option value="rock" className="bg-[#16161A]">Hard Rock (E5 - G5 - A5 - C5)</option>
                <option value="folk" className="bg-[#16161A]">Folk (G - Em - C - D)</option>
                <option value="jazz" className="bg-[#16161A]">Jazz Turnaround (Dm7 - G7 - Cmaj7 - A7)</option>
                <option value="custom" className="bg-[#16161A]">✏️ Vlastní posloupnost</option>
              </select>
            </div>
          </div>

          {/* Active Chord Badges List */}
          <div className="flex flex-wrap items-center gap-2 py-1">
            {chordSequence.map((chord, idx) => {
              const isActive = isPlayingBacking && activeChordIdx === idx;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#0A84FF] text-white border-[#0A84FF] scale-105 shadow-md font-bold'
                      : 'bg-white/5 text-white border-white/10'
                  }`}
                >
                  <span className="text-stitek opacity-60">#{idx + 1}</span>
                  <span className="text-sm font-bold">{chord}</span>
                  <button
                    onClick={() => handleRemoveChord(idx)}
                    className="hover:text-red-400 text-neutral-400 ml-1 p-0.5 cursor-pointer"
                    title="Odebrat akord"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {chordSequence.length === 0 && (
              <span className="text-xs text-red-400 font-medium">
                Žádné akordy! Přidejte akord níže.
              </span>
            )}
          </div>

          {/* Quick Chord Selector & Custom Chord Input */}
          <div className="space-y-2 pt-3 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-neutral-400 font-medium mr-1">Rychlé přidání:</span>
              {QUICK_CHORDS.map((qChord) => (
                <button
                  key={qChord}
                  onClick={() => handleAddCustomChord(qChord)}
                  className="px-2.5 py-1 bg-white/5 hover:bg-[#30D158] hover:text-black text-[#30D158] border border-white/10 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  +{qChord}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-sm pt-1">
              <input
                type="text"
                placeholder="Vlastní akord (např. Dm, F#m, Cadd9, G7)..."
                value={newChordInput}
                onChange={(e) => setNewChordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomChord()}
                className="flex-1 bg-black/40 border border-white/10 text-white px-3 py-2 rounded-xl text-xs font-semibold outline-none focus:border-[#30D158] transition-colors"
              />
              <button
                onClick={() => handleAddCustomChord()}
                className="px-3.5 py-2 bg-[#30D158] hover:bg-[#34e260] text-black font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-md"
              >
                <Plus className="w-3.5 h-3.5" /> Přidat
              </button>
            </div>
          </div>
        </div>

        {/* 2. MODE & PATTERN SELECTOR (STRUMMING VS VYDRNKÁVÁNÍ VS KLAVÍR) */}
        <div className="bg-black/40 p-3 sm:p-5 rounded-2xl border border-white/5 space-y-4">
          
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#30D158]" />
              <span className="text-xs font-bold text-white">
                2. Typ doprovodu &amp; rytmický patern:
              </span>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setBackingMode('strum')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  backingMode === 'strum' ? 'bg-white text-black font-bold shadow-md' : 'text-neutral-400 hover:text-white'
                }`}
              >
                🎸 Strumming (Brnkání)
              </button>
              <button
                onClick={() => setBackingMode('picking')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  backingMode === 'picking' ? 'bg-white text-black font-bold shadow-md' : 'text-neutral-400 hover:text-white'
                }`}
              >
                🪕 Vybrnkávání (Arpeggio)
              </button>
              <button
                onClick={() => setBackingMode('piano')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  backingMode === 'piano' ? 'bg-white text-black font-bold shadow-md' : 'text-neutral-400 hover:text-white'
                }`}
              >
                🎹 Klavírní doprovod
              </button>
            </div>
          </div>

          {/* Instrument Sound Selection */}
          <div className="flex items-center gap-4 text-xs bg-white/[0.02] p-3 rounded-xl border border-white/5">
            <span className="text-xs text-neutral-400 font-medium">Zvuk nástroje:</span>
            <label className="flex items-center gap-2 cursor-pointer text-white">
              <input
                type="radio"
                name="inst"
                checked={selectedInstrument === 'guitar'}
                onChange={() => setSelectedInstrument('guitar')}
                className="accent-[#30D158]"
              />
              <span>Kytara</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-white">
              <input
                type="radio"
                name="inst"
                checked={selectedInstrument === 'piano'}
                onChange={() => setSelectedInstrument('piano')}
                className="accent-[#30D158]"
              />
              <span>Klavír (Piano)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-white">
              <input
                type="radio"
                name="inst"
                checked={selectedInstrument === 'both'}
                onChange={() => setSelectedInstrument('both')}
                className="accent-[#30D158]"
              />
              <span>Kytara + Klavír</span>
            </label>
          </div>

          {/* Mode 1: Strumming Patterns */}
          {backingMode === 'strum' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {STRUM_PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedStrumId(p.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedStrumId === p.id
                        ? 'bg-[#30D158]/15 border-[#30D158]/50 text-[#30D158] shadow-md'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300'
                    }`}
                  >
                    <span className="font-bold text-xs text-white block">{p.name}</span>
                    <span className="text-xs font-mono font-bold text-[#30D158] tracking-widest block my-1">
                      {p.pattern.join(' ')}
                    </span>
                    <span className="text-drobne text-neutral-400 block">{p.desc}</span>
                  </button>
                ))}
              </div>

              {/* Custom Strum Grid */}
              <div className="bg-white/[0.02] p-3.5 rounded-xl border border-white/5 space-y-2">
                <span className="text-xs text-neutral-400 font-medium block">
                  Interaktivní mřížka brnkání (klikněte pro změnu: D=dolů, U=nahoru, M=tlumení, .=pauza):
                </span>
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {customStrum.map((stroke, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={() => toggleCustomStrumStep(sIdx)}
                      className={`w-10 h-12 flex flex-col items-center justify-center rounded-xl border font-mono font-bold text-sm transition-all cursor-pointer ${
                        selectedStrumId === 'custom'
                          ? 'border-[#30D158] bg-[#30D158]/20 text-[#30D158]'
                          : 'border-white/10 bg-black/40 text-white hover:border-[#30D158]'
                      }`}
                    >
                      <span className="text-stitek text-neutral-500">#{sIdx + 1}</span>
                      <span>{stroke}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: Fingerpicking Patterns */}
          {backingMode === 'picking' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {PICKING_PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPickingId(p.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedPickingId === p.id
                        ? 'bg-[#30D158]/15 border-[#30D158]/50 text-[#30D158] shadow-md'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300'
                    }`}
                  >
                    <span className="font-bold text-xs text-white block">{p.name}</span>
                    <span className="text-xs font-mono font-bold text-[#30D158] tracking-widest block my-1">
                      Struny: {p.sequence.join('-')}
                    </span>
                    <span className="text-drobne text-neutral-400 block">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode 3: Piano Accompaniment */}
          {backingMode === 'piano' && (
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-xs space-y-1">
              <span className="font-bold text-[#0A84FF] block">
                Klavírní doprovod (Reálné Piano Chord Voicing)
              </span>
              <p className="text-neutral-400">
                Automaticky přehrává harmonické klavírní akordy ve zvoleném tempu BPM s autentickým akustickým zvukem.
              </p>
            </div>
          )}

        </div>

      </div>

      {/* 🎹 MIDI SOUBORY PLAYER SECTION */}
      <MidiPlayer />

    </div>
  );
};
