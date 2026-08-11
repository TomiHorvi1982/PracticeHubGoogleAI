import React, { useState, useEffect, useRef } from 'react';
import { audioSynth } from '../services/audioSynth';
import { findOrGenerateChord } from '../utils/chordUtils';
import { MidiPlayer } from './MidiPlayer';
import {
  Play, Pause, Zap, Music, Volume2, VolumeX, Plus, Trash2, Sliders,
  Check, ChevronRight, Activity, Repeat, Grid
} from 'lucide-react';

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
  // Metronome State
  const [bpm, setBpm] = useState(100);
  const [isPlayingMetro, setIsPlayingMetro] = useState(false);
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
          const isAccented = accentBeats[next] ?? (next === 0);
          if (!isMetroMuted) {
            audioSynth.playMetronomeClick(isAccented);
          }
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
    <div className="max-w-[1400px] mx-auto space-y-6 font-mono pb-12">
      
      {/* 🥁 VISUAL METRONOME SECTION */}
      <div className="border border-[#333] bg-[#0F0F0F] p-4 sm:p-5 space-y-5">
        
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222] pb-3">
          <div className="flex items-center gap-2">
            <span className="bg-[#FF3E00] text-black font-black px-2 py-0.5 text-[10px] uppercase tracking-wider">
              VIZUÁLNÍ METRONOM
            </span>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              PŘESNÝ BLIKAJÍCÍ METRONOM A NASTAVENÍ DOB V TAKTU
            </h2>
          </div>

          {/* Sound / Visual Only Toggle */}
          <button
            onClick={() => setIsMetroMuted(!isMetroMuted)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold uppercase border transition-none ${
              isMetroMuted
                ? 'bg-[#1A0000] text-[#FF3E00] border-[#FF3E00]'
                : 'bg-[#051A0B] text-[#00FF41] border-[#00FF41]'
            }`}
          >
            {isMetroMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isMetroMuted ? 'TICHÝ VIZUÁLNÍ REŽIM (POUZE BLIKÁNÍ)' : 'ZVUK METRONOMU: ZAPNUTO'}</span>
          </button>
        </div>

        {/* Central Visual Metronome Stage: Pendulum + Flashing Beacon Light */}
        <div className="bg-[#050505] border border-[#222] p-6 relative overflow-hidden flex flex-col items-center justify-center space-y-6">
          
          {/* Pendulum Swinging Arm Visual */}
          <div className="relative w-full max-w-md h-24 flex items-center justify-center border-b border-[#1A1A1A]">
            {/* Arc Scale Markers */}
            <div className="absolute top-2 left-0 right-0 flex justify-between px-6 text-[9px] text-[#444] font-bold">
              <span>◄ 1. DOBA</span>
              <span>STŘED</span>
              <span>{beatsPerBar}. DOBA ►</span>
            </div>

            {/* Pendulum Pivot Point */}
            <div className="absolute bottom-0 w-4 h-4 bg-[#222] border border-[#444] rounded-full z-10" />

            {/* Pendulum Needle Arm */}
            <div
              className="absolute bottom-0 w-1 bg-[#FF3E00] origin-bottom transition-all duration-100 ease-out z-20 flex flex-col items-center"
              style={{
                height: '80px',
                transform: `rotate(${isPlayingMetro ? (-35 + (currentBeat / Math.max(1, beatsPerBar - 1)) * 70) : 0}deg)`,
              }}
            >
              {/* Pendulum Weight Ball */}
              <div
                className={`w-5 h-5 -mt-2 rounded-full border border-black shadow-lg ${
                  flashTick
                    ? accentBeats[currentBeat]
                      ? 'bg-[#FF3E00] shadow-[0_0_15px_#FF3E00]'
                      : 'bg-[#00FF41] shadow-[0_0_12px_#00FF41]'
                    : 'bg-white'
                }`}
              />
            </div>
          </div>

          {/* Central Flashing Light Beacon Display */}
          <div className="flex flex-col items-center space-y-3">
            <div
              className={`w-36 h-36 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-75 ${
                isPlayingMetro && flashTick
                  ? accentBeats[currentBeat]
                    ? 'bg-[#FF3E00] border-white text-black scale-105 shadow-[0_0_40px_rgba(255,62,0,0.95)]'
                    : 'bg-[#00FF41] border-white text-black scale-105 shadow-[0_0_35px_rgba(0,255,65,0.9)]'
                  : isPlayingMetro
                  ? 'bg-[#0F0F0F] border-[#333] text-white'
                  : 'bg-[#050505] border-[#1C1C1C] text-[#555]'
              }`}
            >
              <span className="text-5xl font-black font-mono tracking-tighter">
                {isPlayingMetro ? currentBeat + 1 : '-'}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider mt-1">
                {isPlayingMetro
                  ? accentBeats[currentBeat]
                    ? '⚡ AKCENT'
                    : 'DOBA'
                  : 'ZASTAVENO'}
              </span>
            </div>

            {/* Status description text */}
            <div className="text-center">
              <span className="text-xs font-mono font-bold text-white block uppercase">
                {isPlayingMetro
                  ? `DOBA ${currentBeat + 1} Z ${beatsPerBar} (${accentBeats[currentBeat] ? 'PŘÍZVUK / AKCENT' : 'BĚŽNÁ DOBA'})`
                  : 'METRONOM JE PRIPRAVEN'}
              </span>
              <span className="text-[10px] text-[#888] font-mono block mt-0.5">
                TEMPO: <strong className="text-[#00FF41]">{bpm} BPM</strong> | TAKT: <strong className="text-white">{beatsPerBar}/4</strong>
              </span>
            </div>
          </div>

        </div>

        {/* Beats Per Measure (Počet dob v taktu) Settings & Interactive Beat Cards */}
        <div className="bg-[#050505] p-4 border border-[#222] space-y-4">
          
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1A1A] pb-2">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-[#FF3E00]" />
              <span className="text-[10px] font-bold text-white uppercase">
                NASTAVENÍ POČTU DOB V TAKTU &amp; AKCENTŮ:
              </span>
            </div>

            {/* Time Signature Presets */}
            <div className="flex items-center gap-1 bg-[#111] p-1 border border-[#222]">
              <span className="text-[10px] text-[#666] font-bold uppercase px-1">TAKTOVÉ PRESETY:</span>
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
                  className={`px-2.5 py-1 text-[10px] font-extrabold uppercase transition-none ${
                    beatsPerBar === sig.beats
                      ? 'bg-[#FF3E00] text-black'
                      : 'text-[#888] hover:text-white'
                  }`}
                >
                  {sig.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stepper for custom beat count */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111] p-3 border border-[#222]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white font-bold uppercase">POČET DOB V TAKTU:</span>
              <span className="text-lg font-black text-[#00FF41] font-mono px-2">{beatsPerBar} DOB</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setBeatsPerBar((prev) => Math.max(1, prev - 1))}
                className="px-3 py-1 bg-[#181818] hover:bg-[#222] text-white border border-[#333] font-black text-xs uppercase"
              >
                -1 DOBA
              </button>
              <button
                onClick={() => setBeatsPerBar((prev) => Math.min(12, prev + 1))}
                className="px-3 py-1 bg-[#181818] hover:bg-[#222] text-white border border-[#333] font-black text-xs uppercase"
              >
                +1 DOBA
              </button>
            </div>
          </div>

          {/* Interactive Beat Cards Grid */}
          <div className="space-y-1">
            <span className="text-[10px] text-[#666] font-bold uppercase block">
              MŘÍŽKA DOB (KLIKNĚTE NA DOBU PRO PŘEPNUTÍ AKCENTU / SILNÉ DOBY):
            </span>
            <div className="flex flex-wrap items-center gap-2 py-1">
              {Array.from({ length: beatsPerBar }).map((_, i) => {
                const isActive = isPlayingMetro && currentBeat === i;
                const isAccented = accentBeats[i];

                return (
                  <button
                    key={i}
                    onClick={() => toggleBeatAccent(i)}
                    className={`flex-1 min-w-[60px] h-16 border p-1 flex flex-col justify-between items-center transition-none font-mono ${
                      isActive
                        ? isAccented
                          ? 'bg-[#FF3E00] text-black border-white scale-105 shadow-[0_0_12px_#FF3E00]'
                          : 'bg-[#00FF41] text-black border-white scale-105 shadow-[0_0_10px_#00FF41]'
                        : isAccented
                        ? 'bg-[#1A0A00] text-[#FF3E00] border-[#FF3E00]/60'
                        : 'bg-[#111] text-[#888] border-[#222] hover:border-[#444]'
                    }`}
                  >
                    <span className="text-[9px] opacity-70 font-bold">DOBA {i + 1}</span>
                    <span className="text-base font-black">{i + 1}</span>
                    <span className="text-[8px] font-bold uppercase">
                      {isAccented ? '⚡ AKCENT' : 'BĚŽNÁ'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* BPM Tempo Controls & Tap Tempo */}
        <div className="bg-[#050505] p-4 border border-[#222] space-y-4">
          
          <div className="flex flex-wrap items-center justify-between gap-4">
            
            {/* BPM Display Box */}
            <div className="bg-[#111] border border-[#333] px-6 py-3 min-w-[180px] text-center">
              <div className="text-4xl font-black font-mono text-white tracking-tighter">
                {bpm} <span className="text-xs text-[#888] font-normal">BPM</span>
              </div>
              <span className="text-[10px] text-[#00FF41] font-bold uppercase block mt-1">
                {bpm < 60
                  ? 'LARGO / POMALÉ'
                  : bpm < 90
                  ? 'ANDANTE / MÍRNÉ'
                  : bpm < 120
                  ? 'MODERATO / STŘEDNÍ'
                  : bpm < 150
                  ? 'ALLEGRO / RYCHLÉ'
                  : 'PRESTO / VELMI RYCHLÉ'}
              </span>
            </div>

            {/* Stepper Buttons & Slider */}
            <div className="flex-1 max-w-md space-y-2">
              <div className="flex items-center justify-between text-[10px] text-[#666] font-bold uppercase">
                <span>30 BPM</span>
                <span>NASTAVENÍ TEMPA</span>
                <span>280 BPM</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBpm((prev) => Math.max(30, prev - 5))}
                  className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#222] text-white border border-[#333] font-bold text-xs"
                >
                  -5
                </button>
                <button
                  onClick={() => setBpm((prev) => Math.max(30, prev - 1))}
                  className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#222] text-white border border-[#333] font-bold text-xs"
                >
                  -1
                </button>

                <input
                  type="range"
                  min="30"
                  max="280"
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="flex-1 accent-[#FF3E00] cursor-pointer"
                />

                <button
                  onClick={() => setBpm((prev) => Math.min(280, prev + 1))}
                  className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#222] text-white border border-[#333] font-bold text-xs"
                >
                  +1
                </button>
                <button
                  onClick={() => setBpm((prev) => Math.min(280, prev + 5))}
                  className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#222] text-white border border-[#333] font-bold text-xs"
                >
                  +5
                </button>
              </div>
            </div>

            {/* Play & Tap Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsPlayingMetro(!isPlayingMetro)}
                className={`px-6 py-3 font-black text-xs uppercase flex items-center gap-2 border transition-none shadow-md ${
                  isPlayingMetro
                    ? 'bg-[#FF3E00] text-black border-black'
                    : 'bg-[#00FF41] text-black border-black'
                }`}
              >
                {isPlayingMetro ? <Pause className="w-4 h-4 text-black" /> : <Play className="w-4 h-4 text-black" />}
                <span>{isPlayingMetro ? 'ZASTAVIT METRONOM' : 'SPUSTIT METRONOM'}</span>
              </button>

              <button
                onClick={handleTapTempo}
                className="px-4 py-3 bg-[#141414] hover:bg-[#222] text-[#FF3E00] font-extrabold text-xs border border-[#333] uppercase flex items-center gap-1.5"
                title="Vyťukejte tempo klikáním"
              >
                <Zap className="w-4 h-4 text-[#FF3E00]" />
                <span>TAP TEMPO</span>
              </button>
            </div>

          </div>

          {/* Quick Tempo Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#111]">
            <span className="text-[10px] text-[#666] font-bold uppercase mr-1">TEMPO PRESETY:</span>
            {TEMPO_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setBpm(preset.bpm)}
                className={`px-2.5 py-1 text-[10px] font-extrabold uppercase border transition-none ${
                  bpm === preset.bpm
                    ? 'bg-[#00FF41] text-black border-black'
                    : 'bg-[#111] text-[#888] border-[#222] hover:text-white'
                }`}
              >
                {preset.name} ({preset.bpm})
              </button>
            ))}
          </div>

        </div>

      </div>

      {/* 🎸 VLASTNÍ AKORDY A PATERNY DOPROVODU (CHORD PROGRESSION & RHYTHM TRAINER) */}
      <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-4">
        
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#00FF41] text-black font-black px-2 py-0.5 text-[10px] uppercase">
                DOPROVODNÝ TRENÉR
              </span>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                VLASTNÍ AKORDY &amp; PATERNY STRUMMINGU / VYDRNKÁVÁNÍ
              </h3>
            </div>
            <p className="text-[11px] text-[#888] mt-1">
              Sestavte si vlastní akordovou posloupnost, zvolte rytmus brnkání nebo vybrnkávání strun a cvičte doprovod!
            </p>
          </div>

          <button
            onClick={() => setIsPlayingBacking(!isPlayingBacking)}
            className={`flex items-center gap-2 px-6 py-2 font-black text-xs uppercase border transition-none shadow-md ${
              isPlayingBacking
                ? 'bg-[#FF3E00] text-black border-black'
                : 'bg-[#00FF41] text-black border-black'
            }`}
          >
            {isPlayingBacking ? <Pause className="w-4 h-4 text-black" /> : <Volume2 className="w-4 h-4 text-black" />}
            <span>{isPlayingBacking ? 'ZASTAVIT DOPROVOD' : 'SPUSTIT DOPROVOD'}</span>
          </button>
        </div>

        {/* 1. CHORD PROGRESSION BUILDER (VLASTNÍ AKORDY) */}
        <div className="bg-[#050505] p-4 border border-[#222] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A1A1A] pb-2">
            <span className="text-[10px] font-bold text-white uppercase flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-[#00FF41]" /> 1. AKORDOVÁ POSLOUPNOST (TŘÍDA AKORDŮ):
            </span>

            {/* Presets dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#666] font-bold uppercase">PRESETY:</span>
              <select
                value={backingStyle}
                onChange={(e) => setBackingStyle(e.target.value as any)}
                className="bg-[#111] border border-[#333] text-white text-xs font-bold px-2 py-1 outline-none uppercase"
              >
                <option value="pop">POP CLASSIC (C - G - Am - F)</option>
                <option value="blues">12-BAR BLUES (A7 - D7 - A7 - E7)</option>
                <option value="rock">HARD ROCK (E5 - G5 - A5 - C5)</option>
                <option value="folk">TÁBORÁK / FOLK (G - Em - C - D)</option>
                <option value="jazz">JAZZ TURNAROUND (Dm7 - G7 - Cmaj7 - A7)</option>
                <option value="custom">✏️ VLASTNÍ POSLOUPNOST</option>
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
                  className={`flex items-center gap-2 px-3 py-1.5 border font-mono font-bold text-xs uppercase transition-none ${
                    isActive
                      ? 'bg-[#FF3E00] text-black border-black scale-105 shadow-[0_0_10px_#FF3E00]'
                      : 'bg-[#141414] text-white border-[#333]'
                  }`}
                >
                  <span className="text-[10px] opacity-60">#{idx + 1}</span>
                  <span className="text-sm font-black">{chord}</span>
                  <button
                    onClick={() => handleRemoveChord(idx)}
                    className="hover:text-red-400 text-[#888] ml-1 p-0.5"
                    title="Odebrat akord"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {chordSequence.length === 0 && (
              <span className="text-xs text-[#FF3E00] font-bold uppercase">
                ŽÁDNÉ AKORDY! Přidejte akord níže.
              </span>
            )}
          </div>

          {/* Quick Chord Selector & Custom Chord Input */}
          <div className="space-y-2 pt-2 border-t border-[#111]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-[#666] font-bold uppercase mr-1">RYCHLÉ PŘIDÁNÍ:</span>
              {QUICK_CHORDS.map((qChord) => (
                <button
                  key={qChord}
                  onClick={() => handleAddCustomChord(qChord)}
                  className="px-2 py-1 bg-[#141414] hover:bg-[#00FF41] hover:text-black text-[#00FF41] border border-[#222] text-[10px] font-extrabold uppercase transition-none"
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
                className="flex-1 bg-[#111] border border-[#333] text-white px-3 py-1.5 text-xs font-bold uppercase outline-none focus:border-[#00FF41]"
              />
              <button
                onClick={() => handleAddCustomChord()}
                className="px-3 py-1.5 bg-[#00FF41] hover:bg-white text-black font-extrabold text-xs uppercase flex items-center gap-1 transition-none"
              >
                <Plus className="w-3.5 h-3.5" /> PŘIDAT
              </button>
            </div>
          </div>
        </div>

        {/* 2. MODE & PATTERN SELECTOR (STRUMMING VS VYDRNKÁVÁNÍ VS KLAVÍR) */}
        <div className="bg-[#050505] p-4 border border-[#222] space-y-4">
          
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1A1A] pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#00FF41]" />
              <span className="text-[10px] font-bold text-white uppercase">
                2. TYP DOPROVODU &amp; STRUMMING PATERN:
              </span>
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex items-center gap-1 bg-[#111] p-1 border border-[#222]">
              <button
                onClick={() => setBackingMode('strum')}
                className={`px-3 py-1 text-xs font-extrabold uppercase transition-none ${
                  backingMode === 'strum' ? 'bg-[#FF3E00] text-black' : 'text-[#888] hover:text-white'
                }`}
              >
                🎸 STRUMMING (BRNKÁNÍ)
              </button>
              <button
                onClick={() => setBackingMode('picking')}
                className={`px-3 py-1 text-xs font-extrabold uppercase transition-none ${
                  backingMode === 'picking' ? 'bg-[#00FF41] text-black' : 'text-[#888] hover:text-white'
                }`}
              >
                🪕 VYDRNKÁVÁNÍ (ARPEGGIO)
              </button>
              <button
                onClick={() => setBackingMode('piano')}
                className={`px-3 py-1 text-xs font-extrabold uppercase transition-none ${
                  backingMode === 'piano' ? 'bg-[#00E5FF] text-black' : 'text-[#888] hover:text-white'
                }`}
              >
                🎹 KLAVÍRNÍ DOPROVOD
              </button>
            </div>
          </div>

          {/* Instrument Sound Selection */}
          <div className="flex items-center gap-3 text-xs bg-[#111] p-2 border border-[#222]">
            <span className="text-[10px] text-[#888] font-bold uppercase">NÁSTROJOVÝ ZVUK:</span>
            <label className="flex items-center gap-1.5 cursor-pointer text-white">
              <input
                type="radio"
                name="inst"
                checked={selectedInstrument === 'guitar'}
                onChange={() => setSelectedInstrument('guitar')}
                className="accent-[#00FF41]"
              />
              <span>KYTARA</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-white">
              <input
                type="radio"
                name="inst"
                checked={selectedInstrument === 'piano'}
                onChange={() => setSelectedInstrument('piano')}
                className="accent-[#00FF41]"
              />
              <span>KLAVÍR (PIANO)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-white">
              <input
                type="radio"
                name="inst"
                checked={selectedInstrument === 'both'}
                onChange={() => setSelectedInstrument('both')}
                className="accent-[#00FF41]"
              />
              <span>KYTARA + KLAVÍR</span>
            </label>
          </div>

          {/* Mode 1: Strumming Patterns */}
          {backingMode === 'strum' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {STRUM_PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedStrumId(p.id)}
                    className={`p-3 border text-left font-mono transition-none ${
                      selectedStrumId === p.id
                        ? 'bg-[#142618] border-[#00FF41] text-[#00FF41]'
                        : 'bg-[#111] hover:bg-[#1A1A1A] border-[#222] text-[#888]'
                    }`}
                  >
                    <span className="font-extrabold text-xs text-white uppercase block">{p.name}</span>
                    <span className="text-[11px] font-bold text-[#00FF41] tracking-widest block my-1">
                      {p.pattern.join(' ')}
                    </span>
                    <span className="text-[9px] text-[#666] block">{p.desc}</span>
                  </button>
                ))}
              </div>

              {/* Custom Strum Grid */}
              <div className="bg-[#111] p-3 border border-[#222] space-y-2">
                <span className="text-[10px] text-[#AAA] font-bold uppercase block">
                  INTERAKTIVNÍ MŘÍŽKA BRNKÁNÍ (KLIKNĚTE PRO ZMĚNU ÚDERU: D=DOLŮ, U=NAHORU, M=MUTE, .=PAUZA):
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  {customStrum.map((stroke, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={() => toggleCustomStrumStep(sIdx)}
                      className={`w-10 h-12 flex flex-col items-center justify-center border font-mono font-black text-sm uppercase transition-none ${
                        selectedStrumId === 'custom'
                          ? 'border-[#00FF41] bg-[#0A1A0D] text-[#00FF41]'
                          : 'border-[#333] bg-[#050505] text-white hover:border-[#00FF41]'
                      }`}
                    >
                      <span className="text-[8px] text-[#666]">#{sIdx + 1}</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {PICKING_PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPickingId(p.id)}
                    className={`p-3 border text-left font-mono transition-none ${
                      selectedPickingId === p.id
                        ? 'bg-[#142618] border-[#00FF41] text-[#00FF41]'
                        : 'bg-[#111] hover:bg-[#1A1A1A] border-[#222] text-[#888]'
                    }`}
                  >
                    <span className="font-extrabold text-xs text-white uppercase block">{p.name}</span>
                    <span className="text-[11px] font-bold text-[#00FF41] tracking-widest block my-1">
                      STRUNY: {p.sequence.join('-')}
                    </span>
                    <span className="text-[9px] text-[#666] block">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode 3: Piano Accompaniment */}
          {backingMode === 'piano' && (
            <div className="bg-[#111] p-4 border border-[#222] text-xs space-y-1">
              <span className="font-bold text-[#00E5FF] uppercase block">
                KLAVÍRNÍ DOPROVOD (REÁLNÉ PIANO CHORD VOICING)
              </span>
              <p className="text-[#AAA]">
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
