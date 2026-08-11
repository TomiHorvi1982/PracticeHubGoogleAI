import React, { useState, useEffect, useRef } from 'react';
import { audioSynth, INSTRUMENT_PROFILES, InstrumentProfile } from '../services/audioSynth';
import { midiService } from '../services/midiService';
import { SCALES_DATABASE } from '../data/chordsAndScales';
import { DrumPad } from '../types';
import { MidiToolsModal } from './MidiToolsModal';
import {
  Play, Pause, Volume2, Music, Disc, Filter, Zap,
  Layers, VolumeX, RotateCcw, ChevronLeft, ChevronRight, Sliders, Laptop, Radio
} from 'lucide-react';

const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const DRUM_PADS: DrumPad[] = [
  { id: 'kick', name: 'Kopák (Kick)', keyLabel: 'Q', soundType: 'kick' },
  { id: 'snare', name: 'Virbl (Snare)', keyLabel: 'W', soundType: 'snare' },
  { id: 'hihat_closed', name: 'Hi-Hat Zavřená', keyLabel: 'E', soundType: 'hihat_closed' },
  { id: 'hihat_open', name: 'Hi-Hat Otevřená', keyLabel: 'R', soundType: 'hihat_open' },
  { id: 'tom_low', name: 'Tom Nízký', keyLabel: 'A', soundType: 'tom_low' },
  { id: 'tom_high', name: 'Tom Vysoký', keyLabel: 'S', soundType: 'tom_high' },
  { id: 'crash', name: 'Činel Crash', keyLabel: 'D', soundType: 'crash' },
  { id: 'ride', name: 'Činel Ride', keyLabel: 'F', soundType: 'ride' },
];

const PRESET_LOOPS: Record<string, { name: string; bpm: number; grid: Record<string, boolean[]> }> = {
  rock: {
    name: 'Rock 4/4 Classic',
    bpm: 110,
    grid: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    },
  },
  pop: {
    name: 'Pop Dance Beat',
    bpm: 120,
    grid: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    },
  },
  funk: {
    name: 'Funk Groove',
    bpm: 102,
    grid: {
      kick: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, true, false, false, false, false, true, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    },
  },
  metal: {
    name: 'Metal Double Kick',
    bpm: 135,
    grid: {
      kick: [true, true, false, true, true, true, false, true, true, true, false, true, true, true, false, true],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      ride: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    },
  },
};

// Base layout relative notes for two full octaves (25 keys total)
const BASE_PIANO_LAYOUT = [
  // Octave 1 relative (0..11)
  { root: 'C', relOctave: 0, keyShortcut: 'a', isBlack: false },
  { root: 'C#', relOctave: 0, keyShortcut: 'w', isBlack: true },
  { root: 'D', relOctave: 0, keyShortcut: 's', isBlack: false },
  { root: 'D#', relOctave: 0, keyShortcut: 'e', isBlack: true },
  { root: 'E', relOctave: 0, keyShortcut: 'd', isBlack: false },
  { root: 'F', relOctave: 0, keyShortcut: 'f', isBlack: false },
  { root: 'F#', relOctave: 0, keyShortcut: 't', isBlack: true },
  { root: 'G', relOctave: 0, keyShortcut: 'g', isBlack: false },
  { root: 'G#', relOctave: 0, keyShortcut: 'y', isBlack: true },
  { root: 'A', relOctave: 0, keyShortcut: 'h', isBlack: false },
  { root: 'A#', relOctave: 0, keyShortcut: 'u', isBlack: true },
  { root: 'B', relOctave: 0, keyShortcut: 'j', isBlack: false },
  // Octave 2 relative (12..23)
  { root: 'C', relOctave: 1, keyShortcut: 'k', isBlack: false },
  { root: 'C#', relOctave: 1, keyShortcut: 'o', isBlack: true },
  { root: 'D', relOctave: 1, keyShortcut: 'l', isBlack: false },
  { root: 'D#', relOctave: 1, keyShortcut: 'p', isBlack: true },
  { root: 'E', relOctave: 1, keyShortcut: ';', isBlack: false },
  { root: 'F', relOctave: 1, keyShortcut: "'", isBlack: false },
  { root: 'F#', relOctave: 1, keyShortcut: ']', isBlack: true },
  { root: 'G', relOctave: 1, keyShortcut: 'z', isBlack: false },
  { root: 'G#', relOctave: 1, keyShortcut: 'x', isBlack: true },
  { root: 'A', relOctave: 1, keyShortcut: 'c', isBlack: false },
  { root: 'A#', relOctave: 1, keyShortcut: 'v', isBlack: true },
  { root: 'B', relOctave: 1, keyShortcut: 'b', isBlack: false },
  // Ending C
  { root: 'C', relOctave: 2, keyShortcut: 'n', isBlack: false },
];

export const VirtualInstruments: React.FC = () => {
  const [activeInstTab, setActiveInstTab] = useState<'piano' | 'drums' | 'guitar'>('piano');
  const [isMidiModalOpen, setIsMidiModalOpen] = useState(false);

  // --- SOUND PROFILE STATES ---
  const [pianoSoundProfile, setPianoSoundProfile] = useState<InstrumentProfile>('grand_piano');
  const [guitarSoundProfile, setGuitarSoundProfile] = useState<InstrumentProfile>('acoustic_guitar');

  // --- PIANO STATES ---
  const [octaveShift, setOctaveShift] = useState<number>(0); // -2, -1, 0, +1, +2
  const [selectedRoot, setSelectedRoot] = useState<string>('C');
  const [selectedScaleIndex, setSelectedScaleIndex] = useState<number | null>(0); // 0 = Durová, null = Všechny tóny
  const [onlyScaleKeysMode, setOnlyScaleKeysMode] = useState<boolean>(true);
  const [activePianoNote, setActivePianoNote] = useState<string | null>(null);

  // --- DRUMS STATES ---
  const [bpm, setBpm] = useState(115);
  const [isPlayingSeq, setIsPlayingSeq] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeDrumPad, setActiveDrumPad] = useState<string | null>(null);

  const [seqGrid, setSeqGrid] = useState<Record<string, boolean[]>>(() => {
    const initial: Record<string, boolean[]> = {};
    DRUM_PADS.forEach((pad) => {
      initial[pad.soundType] = Array(16).fill(false);
    });
    PRESET_LOOPS.rock.grid.kick.forEach((v, i) => (initial.kick[i] = v));
    PRESET_LOOPS.rock.grid.snare.forEach((v, i) => (initial.snare[i] = v));
    PRESET_LOOPS.rock.grid.hihat_closed.forEach((v, i) => (initial.hihat_closed[i] = v));
    return initial;
  });

  // --- GUITAR STATES ---
  const [activeGuitarChord, setActiveGuitarChord] = useState<string | null>(null);

  const stepRef = useRef(0);

  // Subscribe to MIDI Service for live hardware key visual feedback
  useEffect(() => {
    const unsubscribe = midiService.subscribe((event) => {
      if (event.type === 'noteon' && event.noteName && !event.isFilteredOut) {
        setActivePianoNote(event.noteName);
        setTimeout(() => {
          setActivePianoNote(null);
        }, 300);
      }
    });
    return unsubscribe;
  }, []);

  // Calculate active scale notes array (e.g. ['C', 'D', 'E', 'F', 'G', 'A', 'B'])
  const activeScaleDefinition = selectedScaleIndex !== null ? SCALES_DATABASE[selectedScaleIndex] : null;
  const activeScaleNotes = React.useMemo(() => {
    if (!activeScaleDefinition) return CHROMATIC_NOTES;
    const rootIndex = CHROMATIC_NOTES.indexOf(selectedRoot);
    if (rootIndex === -1) return CHROMATIC_NOTES;

    return activeScaleDefinition.intervals.map(
      (interval) => CHROMATIC_NOTES[(rootIndex + interval) % 12]
    );
  }, [selectedRoot, activeScaleDefinition]);

  // Sync scale filter to hardware MIDI service so darkened keys do not sound on MIDI controllers
  useEffect(() => {
    if (selectedScaleIndex !== null) {
      midiService.setScaleFilter({
        enabled: onlyScaleKeysMode,
        allowedNoteRoots: activeScaleNotes,
        rootNote: selectedRoot,
        scaleName: activeScaleDefinition?.name,
      });
    } else {
      midiService.setScaleFilter({
        enabled: false,
        allowedNoteRoots: CHROMATIC_NOTES,
      });
    }
  }, [selectedScaleIndex, selectedRoot, onlyScaleKeysMode, activeScaleNotes, activeScaleDefinition]);

  // Sequencer playback loop
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlayingSeq) {
      const stepDuration = (60 / bpm / 4) * 1000;
      interval = setInterval(() => {
        const step = stepRef.current;
        setCurrentStep(step);

        DRUM_PADS.forEach((pad) => {
          if (seqGrid[pad.soundType]?.[step]) {
            audioSynth.playDrumSound(pad.soundType, 0.8);
          }
        });

        stepRef.current = (step + 1) % 16;
      }, stepDuration);
    } else {
      stepRef.current = 0;
      setCurrentStep(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingSeq, bpm, seqGrid]);

  // Trigger piano note sound & visual state
  const handlePlayPianoNote = (noteName: string) => {
    audioSynth.playNote(noteName, pianoSoundProfile, 2.2, 0.8);
    setActivePianoNote(noteName);
    setTimeout(() => {
      setActivePianoNote(null);
    }, 200);
  };

  // Trigger drum sound
  const handlePlayDrum = (soundType: string, padId: string) => {
    audioSynth.playDrumSound(soundType);
    setActiveDrumPad(padId);
    setTimeout(() => {
      setActiveDrumPad(null);
    }, 150);
  };

  // Trigger guitar chord strum
  const handlePlayGuitarChord = (name: string, frets: number[]) => {
    audioSynth.playGuitarChord(frets, [82.41, 110.0, 146.83, 196.0, 246.94, 329.63], guitarSoundProfile);
    setActiveGuitarChord(name);
    setTimeout(() => {
      setActiveGuitarChord(null);
    }, 400);
  };

  // Global Keyboard listener for piano and drum triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();

      // Drum pads keyboard shortcuts
      const foundPad = DRUM_PADS.find((p) => p.keyLabel.toLowerCase() === key);
      if (foundPad) {
        handlePlayDrum(foundPad.soundType, foundPad.id);
        return;
      }

      // Piano keyboard shortcuts
      const baseOctave = 4 + octaveShift;
      const foundPianoKey = BASE_PIANO_LAYOUT.find((p) => p.keyShortcut === key);
      if (foundPianoKey) {
        const noteOctave = baseOctave + foundPianoKey.relOctave;
        const noteFull = `${foundPianoKey.root}${noteOctave}`;
        handlePlayPianoNote(noteFull);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [octaveShift]);

  const toggleGridCell = (soundType: string, stepIdx: number) => {
    setSeqGrid((prev) => {
      const newGrid = { ...prev };
      const arr = [...(newGrid[soundType] || Array(16).fill(false))];
      arr[stepIdx] = !arr[stepIdx];
      newGrid[soundType] = arr;
      return newGrid;
    });
  };

  const loadPresetLoop = (presetKey: string) => {
    const preset = PRESET_LOOPS[presetKey];
    if (!preset) return;
    setBpm(preset.bpm);

    const newGrid: Record<string, boolean[]> = {};
    DRUM_PADS.forEach((pad) => {
      newGrid[pad.soundType] = preset.grid[pad.soundType] || Array(16).fill(false);
    });
    setSeqGrid(newGrid);
  };

  // Helper for quick song key presets
  const applySongKeyPreset = (root: string, scaleIdx: number) => {
    setSelectedRoot(root);
    setSelectedScaleIndex(scaleIdx);
  };

  const baseOctaveNumber = 4 + octaveShift;

  return (
    <div className="max-w-[1400px] mx-auto space-y-4 font-mono pb-12">
      
      {/* Header & Instrument Selector Tabs */}
      <div className="border border-[#333] bg-[#0F0F0F] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-[#FF3E00] text-black font-black px-2 py-0.5 text-[10px] uppercase tracking-wider">
              WORKSTATION
            </span>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              VIRTUÁLNÍ NÁSTROJE & HARDWARE MIDI
            </h2>
          </div>
          <p className="text-[11px] text-[#888] mt-1">
            Zobrazte noty vybrané stupnice, posouvejte oktávy, připojte MIDI klávesy a přehrajte reálné zvuky.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* MIDI Tools Modal Trigger */}
          <button
            onClick={() => setIsMidiModalOpen(true)}
            className="px-3 py-1.5 bg-[#0F1E13] hover:bg-[#00FF41] text-[#00FF41] hover:text-black font-extrabold text-xs uppercase border border-[#00FF41] flex items-center gap-1.5 transition-none shadow-md"
            title="Otevřít nastavení MIDI klávesnice a mapování zvuků"
          >
            <Laptop className="w-4 h-4" />
            <span>MIDI NÁSTROJE & HARDWARE</span>
          </button>

          {/* Tab Switcher */}
          <div className="flex items-center bg-[#050505] p-1 border border-[#222]">
            <button
              onClick={() => setActiveInstTab('piano')}
              className={`px-3 py-1.5 text-xs font-black uppercase transition-none flex items-center gap-1.5 ${
                activeInstTab === 'piano'
                  ? 'bg-[#00FF41] text-black shadow-md'
                  : 'text-[#AAA] hover:text-white'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>KLAVÍR</span>
            </button>
            <button
              onClick={() => setActiveInstTab('drums')}
              className={`px-3 py-1.5 text-xs font-black uppercase transition-none flex items-center gap-1.5 ${
                activeInstTab === 'drums'
                  ? 'bg-[#00FF41] text-black shadow-md'
                  : 'text-[#AAA] hover:text-white'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
              <span>BICÍ</span>
            </button>
            <button
              onClick={() => setActiveInstTab('guitar')}
              className={`px-3 py-1.5 text-xs font-black uppercase transition-none flex items-center gap-1.5 ${
                activeInstTab === 'guitar'
                  ? 'bg-[#00FF41] text-black shadow-md'
                  : 'text-[#AAA] hover:text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>KYTARA</span>
            </button>
          </div>
        </div>
      </div>

      {/* 🎹 PIANO TAB */}
      {activeInstTab === 'piano' && (
        <div className="space-y-4">

          {/* Scale Selector & Octave Shift Panel */}
          <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-3">
            
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222] pb-3">
              {/* Scale Title */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#00FF41]" />
                <span className="text-xs font-black uppercase text-white tracking-wider">
                  FILTR STUPNICE PÍSNIČKY (ZOBRAZENÍ NOT NA KLÁVESÁCH)
                </span>
              </div>

              {/* Preset Quick Buttons for Song Keys */}
              <div className="flex items-center gap-1 overflow-x-auto text-[10px]">
                <span className="text-[#666] uppercase font-bold mr-1">TÓNINA PÍSNĚ:</span>
                <button
                  onClick={() => applySongKeyPreset('C', 0)}
                  className={`px-2 py-0.5 border uppercase font-bold ${
                    selectedRoot === 'C' && selectedScaleIndex === 0
                      ? 'bg-[#00FF41] text-black border-black'
                      : 'bg-[#141414] text-[#AAA] border-[#333] hover:text-white'
                  }`}
                >
                  C dur
                </button>
                <button
                  onClick={() => applySongKeyPreset('G', 0)}
                  className={`px-2 py-0.5 border uppercase font-bold ${
                    selectedRoot === 'G' && selectedScaleIndex === 0
                      ? 'bg-[#00FF41] text-black border-black'
                      : 'bg-[#141414] text-[#AAA] border-[#333] hover:text-white'
                  }`}
                >
                  G dur
                </button>
                <button
                  onClick={() => applySongKeyPreset('D', 0)}
                  className={`px-2 py-0.5 border uppercase font-bold ${
                    selectedRoot === 'D' && selectedScaleIndex === 0
                      ? 'bg-[#00FF41] text-black border-black'
                      : 'bg-[#141414] text-[#AAA] border-[#333] hover:text-white'
                  }`}
                >
                  D dur
                </button>
                <button
                  onClick={() => applySongKeyPreset('A', 1)}
                  className={`px-2 py-0.5 border uppercase font-bold ${
                    selectedRoot === 'A' && selectedScaleIndex === 1
                      ? 'bg-[#00FF41] text-black border-black'
                      : 'bg-[#141414] text-[#AAA] border-[#333] hover:text-white'
                  }`}
                >
                  A moll
                </button>
                <button
                  onClick={() => applySongKeyPreset('E', 1)}
                  className={`px-2 py-0.5 border uppercase font-bold ${
                    selectedRoot === 'E' && selectedScaleIndex === 1
                      ? 'bg-[#00FF41] text-black border-black'
                      : 'bg-[#141414] text-[#AAA] border-[#333] hover:text-white'
                  }`}
                >
                  E moll
                </button>
                <button
                  onClick={() => applySongKeyPreset('F', 0)}
                  className={`px-2 py-0.5 border uppercase font-bold ${
                    selectedRoot === 'F' && selectedScaleIndex === 0
                      ? 'bg-[#00FF41] text-black border-black'
                      : 'bg-[#141414] text-[#AAA] border-[#333] hover:text-white'
                  }`}
                >
                  F dur
                </button>
                <button
                  onClick={() => setSelectedScaleIndex(null)}
                  className={`px-2 py-0.5 border uppercase font-bold ${
                    selectedScaleIndex === null
                      ? 'bg-[#FF3E00] text-black border-black'
                      : 'bg-[#141414] text-[#AAA] border-[#333] hover:text-white'
                  }`}
                >
                  Vypnout filtr
                </button>
              </div>
            </div>

            {/* Custom Scale & Octave Shift Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              
              {/* Sound Profile Selector */}
              <div className="bg-[#050505] p-2 border border-[#222] space-y-1">
                <span className="text-[10px] text-[#888] font-bold uppercase block">ZVUK KLÁVES:</span>
                <select
                  value={pianoSoundProfile}
                  onChange={(e) => setPianoSoundProfile(e.target.value as InstrumentProfile)}
                  className="w-full bg-[#111] text-[#00FF41] font-bold text-xs p-1.5 border border-[#333]"
                >
                  <option value="grand_piano">🎹 Akustické Křídlo (Grand Piano)</option>
                  <option value="rhodes_ep">🎷 Rhodes Electric Piano</option>
                  <option value="analog_synth">⚡ Analog Synth Lead</option>
                  <option value="acoustic_guitar">🎸 Akustický Pluck</option>
                </select>
              </div>

              {/* Root Note Picker */}
              <div className="bg-[#050505] p-2 border border-[#222] space-y-1">
                <span className="text-[10px] text-[#888] font-bold uppercase block">Základní tón (Tónina):</span>
                <div className="flex flex-wrap gap-1">
                  {CHROMATIC_NOTES.map((note) => (
                    <button
                      key={note}
                      onClick={() => setSelectedRoot(note)}
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase border transition-none ${
                        selectedRoot === note
                          ? 'bg-[#FF3E00] text-black border-black font-extrabold'
                          : 'bg-[#111] text-[#AAA] border-[#222] hover:text-white'
                      }`}
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scale Type Picker */}
              <div className="bg-[#050505] p-2 border border-[#222] space-y-1">
                <span className="text-[10px] text-[#888] font-bold uppercase block">Typ stupnice:</span>
                <select
                  value={selectedScaleIndex === null ? 'none' : selectedScaleIndex}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedScaleIndex(val === 'none' ? null : Number(val));
                  }}
                  className="w-full bg-[#111] text-[#00FF41] font-bold text-xs p-1.5 border border-[#333]"
                >
                  <option value="none">-- Všechny tóny (Bez filtru) --</option>
                  {SCALES_DATABASE.map((scale, idx) => (
                    <option key={scale.name} value={idx}>
                      {scale.czName} ({scale.name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Octave Shift Controls */}
              <div className="bg-[#050505] p-2 border border-[#222] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#888] font-bold uppercase">POSUN OKTÁV:</span>
                  <span className="text-[10px] font-black text-[#00FF41] bg-[#111] px-2 py-0.5 border border-[#333]">
                    C{baseOctaveNumber} – C{baseOctaveNumber + 2}
                  </span>
                </div>

                <div className="flex items-center gap-1 justify-between">
                  <button
                    onClick={() => setOctaveShift((prev) => Math.max(-2, prev - 1))}
                    disabled={octaveShift <= -2}
                    className="px-2 py-1 bg-[#141414] hover:bg-[#222] disabled:opacity-30 text-white font-bold border border-[#333] text-xs uppercase flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> -1
                  </button>

                  <div className="flex items-center gap-1">
                    {[-2, -1, 0, 1, 2].map((shift) => (
                      <button
                        key={shift}
                        onClick={() => setOctaveShift(shift)}
                        className={`w-6 h-6 text-[10px] font-extrabold border ${
                          octaveShift === shift
                            ? 'bg-[#FF3E00] text-black border-black'
                            : 'bg-[#111] text-[#888] border-[#333] hover:text-white'
                        }`}
                        title={`Oktáva C${4 + shift}`}
                      >
                        {shift > 0 ? `+${shift}` : shift}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setOctaveShift((prev) => Math.min(2, prev + 1))}
                    disabled={octaveShift >= 2}
                    className="px-2 py-1 bg-[#141414] hover:bg-[#222] disabled:opacity-30 text-white font-bold border border-[#333] text-xs uppercase flex items-center gap-1"
                  >
                    +1 <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>

            {/* Active Scale Info Banner */}
            {selectedScaleIndex !== null && activeScaleDefinition && (
              <div className="bg-[#051A0B] border border-[#00FF41]/40 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-[#00FF41] text-black font-black text-[10px] px-2 py-0.5 uppercase">
                    AKTIVNÍ STUPNICE
                  </span>
                  <span className="font-bold text-white">
                    {selectedRoot} {activeScaleDefinition.czName}
                  </span>
                  <span className="text-[#888] text-[11px]">
                    ({activeScaleNotes.join(' - ')})
                  </span>
                  {onlyScaleKeysMode && (
                    <span className="bg-[#112616] text-[#00FF41] border border-[#00FF41]/50 text-[9px] font-black px-2 py-0.5 uppercase flex items-center gap-1">
                      <Zap className="w-3 h-3" /> HARDWARE MIDI FILTR AKTIVNÍ (ZTMAVENÉ TÓNY SOUČASNĚ BLOKOVÁNY NA VAŠEM MIDI NÁSTROJI)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[10px] uppercase font-bold text-[#AAA] hover:text-white flex items-center gap-1.5 cursor-pointer bg-[#0A180E] px-2 py-1 border border-[#00FF41]/30">
                    <input
                      type="checkbox"
                      checked={onlyScaleKeysMode}
                      onChange={(e) => setOnlyScaleKeysMode(e.target.checked)}
                      className="accent-[#00FF41]"
                    />
                    <span>Ztmavit nezařazené klávesy &amp; mútovat na MIDI</span>
                  </label>
                </div>
              </div>
            )}

          </div>

          {/* Interactive Keyboard Canvas (2 Full Octaves - 25 Keys) */}
          <div className="border border-[#333] bg-[#050505] p-4 text-center space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-[#1C1C1C] text-[10px] text-[#666]">
              <span>KLIKNĚTE NA KLÁVESY NEBO POUŽIJTE KLÁVESNICI POČÍTAČE (A, W, S, E, D, F...)</span>
              <span className="text-[#00FF41] font-bold">REÁLNÝ AUDIO ZVUK ZAPNUT</span>
            </div>

            <div className="flex justify-center overflow-x-auto py-4 scrollbar-thin scrollbar-thumb-[#333]">
              <div className="relative flex h-48 bg-[#000] p-2 border border-[#222]">
                {BASE_PIANO_LAYOUT.map((keyObj, idx) => {
                  const keyNoteOctave = baseOctaveNumber + keyObj.relOctave;
                  const fullNoteName = `${keyObj.root}${keyNoteOctave}`;
                  const isScaleNote = activeScaleNotes.includes(keyObj.root);
                  const scaleDegree = isScaleNote ? activeScaleNotes.indexOf(keyObj.root) + 1 : null;
                  const isActivePressed = activePianoNote === fullNoteName;

                  if (keyObj.isBlack) {
                    const isDisabledByFilter = onlyScaleKeysMode && !isScaleNote;

                    return (
                      <button
                        key={`${fullNoteName}-${idx}`}
                        onClick={() => handlePlayPianoNote(fullNoteName)}
                        disabled={isDisabledByFilter}
                        className={`w-8 h-28 -mx-4 z-10 flex flex-col justify-end items-center pb-1.5 border transition-none ${
                          isActivePressed
                            ? 'bg-[#FF3E00] text-black border-black shadow-[0_0_15px_#FF3E00]'
                            : isScaleNote && selectedScaleIndex !== null
                            ? 'bg-[#002B0E] hover:bg-[#004D1A] text-[#00FF41] border-[#00FF41]'
                            : isDisabledByFilter
                            ? 'bg-[#050505] text-[#222] border-[#111] opacity-20'
                            : 'bg-[#111] hover:bg-[#222] text-[#888] hover:text-white border-black'
                        }`}
                        title={`${fullNoteName} [Klávesa ${keyObj.keyShortcut.toUpperCase()}]`}
                      >
                        {isScaleNote && selectedScaleIndex !== null && (
                          <span className="text-[8px] font-black bg-[#00FF41] text-black px-1 rounded-full mb-1">
                            {scaleDegree}.
                          </span>
                        )}
                        <span className="text-[8px] font-bold font-mono uppercase">{keyObj.root}</span>
                        <span className="text-[7px] text-[#555] font-mono uppercase">[{keyObj.keyShortcut}]</span>
                      </button>
                    );
                  }

                  const isDisabledByFilter = onlyScaleKeysMode && !isScaleNote;

                  return (
                    <button
                      key={`${fullNoteName}-${idx}`}
                      onClick={() => handlePlayPianoNote(fullNoteName)}
                      disabled={isDisabledByFilter}
                      className={`w-11 h-44 flex flex-col justify-end items-center pb-2 border transition-none ${
                        isActivePressed
                          ? 'bg-[#FF3E00] text-black border-black shadow-[0_0_15px_#FF3E00]'
                          : isScaleNote && selectedScaleIndex !== null
                          ? 'bg-[#E6FFE9] hover:bg-white text-black border-2 border-[#00FF41] shadow-[0_0_8px_rgba(0,255,65,0.4)]'
                          : isDisabledByFilter
                          ? 'bg-[#1A1A1A] text-[#444] border-[#222] opacity-20'
                          : 'bg-[#D1D1D1] hover:bg-white text-black border-[#222]'
                      }`}
                      title={`${fullNoteName} [Klávesa ${keyObj.keyShortcut.toUpperCase()}]`}
                    >
                      {isScaleNote && selectedScaleIndex !== null && (
                        <span className="text-[9px] font-black bg-[#00FF41] text-black px-1.5 py-0.2 mb-1 border border-black">
                          {scaleDegree}. stupeň
                        </span>
                      )}
                      <span className="text-[11px] font-extrabold font-mono">{fullNoteName}</span>
                      <span className="text-[8px] text-[#666] font-mono uppercase">[{keyObj.keyShortcut}]</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 🥁 DRUMS TAB */}
      {activeInstTab === 'drums' && (
        <div className="space-y-4">
          
          {/* Interactive Drum Pads */}
          <div className="border border-[#333] bg-[#0F0F0F] p-4">
            <h3 className="text-xs font-bold text-white mb-3 uppercase flex items-center justify-between border-b border-[#222] pb-2">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#FF3E00]" /> BICÍ PODLOŽKY (KLIKNĚTE NEBO STISKNĚTE Q, W, E, R, A, S, D, F)
              </span>
              <span className="text-[10px] text-[#00FF41] font-bold">REÁLNÝ AKUSTICKÝ ZVUK</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DRUM_PADS.map((pad) => {
                const isPadActive = activeDrumPad === pad.id;
                return (
                  <button
                    key={pad.id}
                    onClick={() => handlePlayDrum(pad.soundType, pad.id)}
                    className={`p-4 flex flex-col items-center justify-center text-center border transition-none active:scale-95 ${
                      isPadActive
                        ? 'bg-[#FF3E00] text-black border-black shadow-[0_0_15px_#FF3E00]'
                        : 'bg-[#050505] hover:bg-[#141414] text-white border-[#222] hover:border-[#FF3E00]'
                    }`}
                  >
                    <span className="text-[10px] font-mono font-bold text-[#FF3E00] bg-[#111] px-1.5 py-0.5 border border-[#222] mb-1">
                      [{pad.keyLabel}]
                    </span>
                    <span className="font-bold text-xs uppercase">{pad.name}</span>
                    <span className="text-[9px] text-[#00FF41] mt-1 font-mono uppercase">🔊 ZAHRAJE ZVUK</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 16-Step Beat Sequencer */}
          <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-4">
            
            {/* Sequencer Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#222]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlayingSeq(!isPlayingSeq)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 font-bold text-xs uppercase transition-none ${
                    isPlayingSeq
                      ? 'bg-[#FF3E00] text-black'
                      : 'bg-[#00FF41] text-black'
                  }`}
                >
                  {isPlayingSeq ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlayingSeq ? 'ZASTAVIT AUTOMAT' : 'SPUSTIT BEAT LOOPER'}</span>
                </button>

                <div className="flex items-center gap-2 bg-[#050505] px-2.5 py-1 border border-[#222]">
                  <span className="text-[10px] font-bold text-[#666] uppercase">TEMPO:</span>
                  <input
                    type="number"
                    min="50"
                    max="220"
                    value={bpm}
                    onChange={(e) => setBpm(Number(e.target.value))}
                    className="w-12 bg-[#111] text-[#00FF41] font-bold font-mono text-xs text-center border border-[#333] py-0.5"
                  />
                  <span className="text-[10px] text-[#888] font-mono">BPM</span>
                </div>
              </div>

              {/* Loop Presets */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] text-[#666] uppercase">BEAT PRESETS:</span>
                {Object.keys(PRESET_LOOPS).map((presetKey) => (
                  <button
                    key={presetKey}
                    onClick={() => loadPresetLoop(presetKey)}
                    className="px-2.5 py-1 bg-[#141414] hover:bg-[#222] text-white border border-[#333] text-[10px] font-bold uppercase"
                  >
                    {presetKey}
                  </button>
                ))}
              </div>
            </div>

            {/* 16 Step Grid Matrix */}
            <div className="overflow-x-auto">
              <div className="min-w-[650px] space-y-1">
                
                {/* Step Numbers Header */}
                <div className="grid grid-cols-17 gap-1 text-center font-mono text-[9px] text-[#666] font-bold mb-1">
                  <span className="text-left pl-1">NÁSTROJ</span>
                  {Array.from({ length: 16 }).map((_, i) => (
                    <span
                      key={i}
                      className={`py-0.5 ${
                        currentStep === i && isPlayingSeq ? 'bg-[#FF3E00] text-black font-black' : ''
                      }`}
                    >
                      {i + 1}
                    </span>
                  ))}
                </div>

                {/* Pads Grid Rows */}
                {DRUM_PADS.map((pad) => (
                  <div key={pad.id} className="grid grid-cols-17 gap-1 items-center">
                    <span className="text-[10px] font-bold text-[#888] uppercase truncate pl-1">
                      {pad.name.split(' ')[0]}
                    </span>

                    {Array.from({ length: 16 }).map((_, stepIdx) => {
                      const isActive = seqGrid[pad.soundType]?.[stepIdx] || false;
                      const isCurrent = currentStep === stepIdx && isPlayingSeq;

                      return (
                        <button
                          key={stepIdx}
                          onClick={() => {
                            toggleGridCell(pad.soundType, stepIdx);
                            audioSynth.playDrumSound(pad.soundType, 0.6);
                          }}
                          className={`h-7 border transition-none ${
                            isActive
                              ? isCurrent
                                ? 'bg-[#00FF41] border-[#00FF41]'
                                : 'bg-[#FF3E00] border-black'
                              : isCurrent
                              ? 'bg-[#222] border-[#00FF41]'
                              : stepIdx % 4 === 0
                              ? 'bg-[#050505] border-[#333]'
                              : 'bg-[#050505] border-[#1C1C1C]'
                          }`}
                        ></button>
                      );
                    })}
                  </div>
                ))}

              </div>
            </div>

          </div>

        </div>
      )}

      {/* 🎸 GUITAR TAB */}
      {activeInstTab === 'guitar' && (
        <div className="space-y-4">
          
          <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between border-b border-[#222] pb-2 gap-2">
              <h3 className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-[#FF3E00]" /> STRUNNÉ NÁSTROJE - BRNKÁNÍ AKORDŮ
              </h3>

              {/* Guitar Sound Profile Selector */}
              <div className="flex items-center gap-2 bg-[#050505] p-1 border border-[#222]">
                <span className="text-[10px] text-[#888] font-bold uppercase">TYP ZVUKU:</span>
                <select
                  value={guitarSoundProfile}
                  onChange={(e) => setGuitarSoundProfile(e.target.value as InstrumentProfile)}
                  className="bg-[#111] text-[#00FF41] font-bold text-xs p-1 border border-[#333]"
                >
                  <option value="acoustic_guitar">🎸 Akustická Kytara (Karplus-Strong)</option>
                  <option value="electric_guitar">⚡ Elektrická Kytara (Overdrive/Distortion)</option>
                  <option value="nylon_guitar">🪕 Španělka (Nylon Strings)</option>
                  <option value="bass_guitar">🎸 Baskytara (Bass Guitar)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { name: 'C Major', frets: [-1, 3, 2, 0, 1, 0] },
                { name: 'G Major', frets: [3, 2, 0, 0, 0, 3] },
                { name: 'A Minor', frets: [-1, 0, 2, 2, 1, 0] },
                { name: 'E Minor', frets: [0, 2, 2, 0, 0, 0] },
                { name: 'D Major', frets: [-1, -1, 0, 2, 3, 2] },
                { name: 'F Major', frets: [1, 3, 3, 2, 1, 1] },
                { name: 'D Minor', frets: [-1, -1, 0, 2, 3, 1] },
                { name: 'A Major', frets: [-1, 0, 2, 2, 2, 0] },
              ].map((ch) => {
                const isChActive = activeGuitarChord === ch.name;
                return (
                  <button
                    key={ch.name}
                    onClick={() => handlePlayGuitarChord(ch.name, ch.frets)}
                    className={`p-4 flex flex-col items-center justify-center border transition-none active:scale-95 ${
                      isChActive
                        ? 'bg-[#FF3E00] text-black border-black shadow-[0_0_15px_#FF3E00]'
                        : 'bg-[#050505] hover:bg-[#141414] text-white border-[#222] hover:border-[#FF3E00]'
                    }`}
                  >
                    <span className="text-xl font-black text-[#FF3E00] mb-0.5">
                      {ch.name.split(' ')[0]}
                    </span>
                    <span className="text-[10px] text-[#888] uppercase">{ch.name.split(' ')[1]}</span>
                    <span className="text-[9px] text-[#00FF41] font-mono mt-1.5 uppercase">🔊 BRNKNUTÍ</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Single String Pluck Fretboard */}
          <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-2">
            <span className="text-xs font-bold text-white uppercase block border-b border-[#222] pb-2">
              JEDNOTLIVÉ STRUNY KYTARY (VYZKOUŠEJTE BRNKÁNÍ PO STRUNÁCH)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
              {[
                { name: 'E (1. Struna)', freq: 329.63 },
                { name: 'B (2. Struna)', freq: 246.94 },
                { name: 'G (3. Struna)', freq: 196.00 },
                { name: 'D (4. Struna)', freq: 146.83 },
                { name: 'A (5. Struna)', freq: 110.00 },
                { name: 'E (6. Struna)', freq: 82.41 },
              ].map((str) => (
                <button
                  key={str.name}
                  onClick={() => audioSynth.playNote(str.freq, guitarSoundProfile, 2.2, 0.7)}
                  className="bg-[#050505] hover:bg-[#141414] active:bg-[#00FF41] active:text-black border border-[#222] hover:border-[#00FF41] p-3 text-center transition-none"
                >
                  <span className="block text-xs font-bold text-white">{str.name}</span>
                  <span className="text-[9px] text-[#666] font-mono">{str.freq} Hz</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* MIDI Tools & Sound Mapping Modal */}
      <MidiToolsModal
        isOpen={isMidiModalOpen}
        onClose={() => setIsMidiModalOpen(false)}
      />

    </div>
  );
};
