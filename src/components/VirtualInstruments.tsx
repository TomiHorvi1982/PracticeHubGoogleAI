import React, { useState, useEffect, useRef } from 'react';
import { useMusicalContext } from '../context/MusicalContext';
import { MidiPlayerPanel } from './MidiPlayerPanel';
import { PadyBicich } from './PadyBicich';
import { PoslechKytaryPanel } from './hmatnik/PoslechKytaryPanel';
import { BASE_PIANO_LAYOUT } from '../data/pcKlavesnice';
import { midiPlayerService, MidiSongState, profileForProgram } from '../services/midiPlayerService';
import { ChordScaleExplorer } from './ChordScaleExplorer';
import { audioSynth, INSTRUMENT_PROFILES, DRUM_KITS, InstrumentProfile } from '../services/audioSynth';
import { instrumentFactory } from '../services/instrumentFactory';
import { drumKitFactory } from '../services/drumKitFactory';
import { INSTRUMENT_CATEGORIES, ALL_INSTRUMENTS, InstrumentPreset } from '../data/instrumentPresets';
import { customDrumKitService } from '../services/customDrumKitService';
import { CustomDrumKitModal } from './CustomDrumKitModal';
import { midiService } from '../services/midiService';
import { eventBus } from '../services/eventBus';
import { SCALES_DATABASE } from '../data/chordsAndScales';
import { DrumPad, CustomDrumKit } from '../types';
import { MidiToolsModal } from './MidiToolsModal';
import { SamplesStudio } from './SamplesStudio';
import { AkordovyPrekladac } from './songbook/AkordovyPrekladac';
import { VyberNastroje } from './instruments/VyberNastroje';
import { AkordZKytary } from './hmatnik/AkordZKytary';
import {
  Play, Pause, Volume2, Music, Disc, Filter, Zap,
  Layers, VolumeX, RotateCcw, ChevronLeft, ChevronRight, Sliders, Laptop, Radio,
  Globe, Home, RotateCw, Search, ExternalLink, Sparkles, Check, Loader2, Database, HardDrive, Compass,
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

/**
 * Does this instrument play back real recorded multi-samples?
 *
 * Almost all of them do: audioSynth.preloadInstrument() resolves a preset's
 * `soundfont` field to a real FluidR3_GM sample set and streams it from the
 * midi-js-soundfonts CDN (cached in IndexedDB), falling back to modelled
 * synthesis only while that download is still in flight. This used to be
 * checked as `inst.id.endsWith('_sf')`, which only three legacy profile ids
 * ever satisfied — so the UI mislabelled ~200 sampled instruments "(Synth)".
 */
const usesRealSamples = (inst: { id: string; soundfont?: string }): boolean =>
  Boolean(inst.soundfont) || inst.id.endsWith('_sf');

const PRESET_LOOPS: Record<string, { name: string; bpm: number; kit: InstrumentProfile; grid: Record<string, boolean[]> }> = {
  rock: {
    name: 'Rock Classic 4/4',
    bpm: 112,
    kit: 'drums',
    grid: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      ride: Array(16).fill(false),
      crash: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    },
  },
  heavy_rock: {
    name: 'Hard Rock Punch',
    bpm: 124,
    kit: 'drums_heavy_rock',
    grid: {
      kick: [true, false, false, true, false, false, true, false, true, false, false, true, false, false, true, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      crash: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    },
  },
  metal_thrash: {
    name: 'Metal Thrash Double-Kick',
    bpm: 155,
    kit: 'drums_metal',
    grid: {
      kick: [true, true, false, true, true, true, false, true, true, true, false, true, true, true, false, true],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      ride: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      crash: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    },
  },
  djent_prog: {
    name: 'Djent / Prog Polyrhythm',
    bpm: 130,
    kit: 'drums_djent',
    grid: {
      kick: [true, false, true, false, false, true, false, true, false, false, true, false, true, false, false, true],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, true, false, true, true, false, true, true, false, true, true, false, true, true, true, false],
      ride: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
    },
  },
  arena_80s: {
    name: '80s Arena Gated Power',
    bpm: 96,
    kit: 'drums_80s_arena',
    grid: {
      kick: [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      tom_high: [false, false, false, false, false, false, false, false, false, false, false, false, false, true, false, false],
      tom_low: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true],
    },
  },
  punk_raw: {
    name: 'Punk Rock Fast Garage',
    bpm: 170,
    kit: 'drums_punk',
    grid: {
      kick: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      snare: [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
      hihat_open: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      crash: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    },
  },
  funk: {
    name: 'Funk & Soul Groove',
    bpm: 104,
    kit: 'drums_funk',
    grid: {
      kick: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, true, false, false, false, false, true, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      hihat_open: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
    },
  },
  jazz: {
    name: 'Jazz Swing & Brushes',
    bpm: 118,
    kit: 'drums_jazz',
    grid: {
      kick: [true, false, false, false, false, false, true, false, false, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      ride: [true, false, false, true, true, false, false, true, true, false, false, true, true, false, false, true],
      hihat_closed: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    },
  },
  hiphop_808: {
    name: 'Trap / Roland TR-808',
    bpm: 140,
    kit: 'drums_808',
    grid: {
      kick: [true, false, false, false, false, false, true, false, false, false, true, false, false, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_closed: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      hihat_open: [false, false, false, false, false, false, false, true, false, false, false, false, false, false, true, false],
    },
  },
  dance_909: {
    name: 'Techno 909 4-on-the-Floor',
    bpm: 128,
    kit: 'drums_electronic_909',
    grid: {
      kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
      snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
      hihat_open: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      crash: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    },
  },
};

// Base layout relative notes for two full octaves (25 keys total)

export const VirtualInstruments: React.FC = () => {
  // Hmatník žije v dolním panelu (SmartStudioDock), kde má vlastní přepínač
  // nástrojů. Odsud se jen otevře — duplikovat ho podruhé by znamenalo dvě
  // místa, která se musí držet v souladu.
  const { toggleDockTool } = useMusicalContext();
  const [activeInstTab, setActiveInstTab] = useState<'piano' | 'drums' | 'pady' | 'fretboard'>('piano');
  /** Podsekce hmatníku. Guitar Tools sem přešly z vlastní záložky nahoře. */
  const [hmatnikSekce, setHmatnikSekce] = useState<'chord' | 'scale' | 'poslech' | 'guitar_tools' | 'zKytary'>('chord');
  /** Stupnice nalezená poslechem — předá se hmatníku i filtru kláves. */
  const [navrhZPoslechu, setNavrhZPoslechu] = useState<{ ton: string; stupnice: string; poradi: number } | null>(null);
  /** Tón, který zrovna zní z mikrofonu — svítí na hmatníku. */
  const [znejiciTon, setZnejiciTon] = useState<string | null>(null);

  /**
   * Nastavení nástrojů podle načteného MIDI.
   *
   * Tónina a hlavní nástroj se spočítají z not; tady se z toho udělá
   * stav klavíru i hmatníku. Ruční volbu to přepíše jen při načtení
   * jiného souboru — kdyby se to hlídalo pořád, nešlo by si během
   * poslechu nic přepnout.
   */
  const [midiStav, setMidiStav] = useState<MidiSongState>(midiPlayerService.getState());
  useEffect(() => midiPlayerService.subscribe(setMidiStav), []);
  /** Podle čeho se pozná, že přišel jiný soubor. */
  const poslednÍSoubor = useRef<string | null>(null);
  /** Nastavení se dá vypnout, kdyby chtěl někdo cvičit v jiné tónině. */
  const [ridiSeMidi, setRidiSeMidi] = useState(true);

  useEffect(() => {
    if (!ridiSeMidi) return;
    const klic = midiStav.asset?.id || null;
    if (!klic || klic === poslednÍSoubor.current) return;
    if (!midiStav.tonina || midiStav.tracks.length === 0) return;
    poslednÍSoubor.current = klic;

    // Tónina: durová a molová stupnice jsou v databázi první dvě.
    setSelectedRoot(midiStav.tonina.ton);
    setSelectedScaleIndex(midiStav.tonina.dur ? 0 : 1);
    // Nezařazené klávesy se ztmaví a nezahrají — o to právě jde.
    setOnlyScaleKeysMode(true);

    // Zvuk kláves podle nástroje, kterého je ve skladbě nejvíc.
    if (midiStav.hlavniNastroj) {
      setPianoSoundProfile(profileForProgram(midiStav.hlavniNastroj.program, false));
    }

    // Hmatník dostane tutéž stupnici cestou, kterou už zná z poslechu.
    setNavrhZPoslechu((prev) => ({
      ton: midiStav.tonina!.ton,
      stupnice: midiStav.tonina!.dur ? 'major' : 'minor',
      poradi: (prev?.poradi || 0) + 1,
    }));
  }, [midiStav.asset?.id, midiStav.tonina, midiStav.hlavniNastroj, midiStav.tracks.length, ridiSeMidi]);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState(false);
  const [isSoundLibraryOpen, setIsSoundLibraryOpen] = useState(false);
  const [soundLibCategory, setSoundLibCategory] = useState<string>('all');
  const [soundLibSearch, setSoundLibSearch] = useState<string>('');

  // --- SOUND PROFILE STATES ---
  const [pianoSoundProfile, setPianoSoundProfile] = useState<InstrumentProfile>('acoustic_grand_piano_sf');
  const [drumsSoundProfile, setDrumsSoundProfile] = useState<InstrumentProfile>('drums');
  const [guitarSoundProfile, setGuitarSoundProfile] = useState<InstrumentProfile>('acoustic_guitar');

  // --- SOUNDFONT & SAMPLE PRELOADING (FACTORY PATTERN) ---
  const [sfProgress, setSfProgress] = useState<number | null>(null);
  const [sfError, setSfError] = useState<string | null>(null);
  const [isPianoCached, setIsPianoCached] = useState<boolean>(false);

  const [drumsSfProgress, setDrumsSfProgress] = useState<number | null>(null);
  const [drumsSfError, setDrumsSfError] = useState<string | null>(null);
  const [isDrumsCached, setIsDrumsCached] = useState<boolean>(false);

  const [loadingProgressMap, setLoadingProgressMap] = useState<Record<string, number>>({});

  // Subscribe to instrument loading events from audioSynth
  useEffect(() => {
    const unsub = eventBus.on('INSTRUMENT_LOADING_UPDATE', (payload: any) => {
      if (!payload) return;
      const { profile, progress, isLoading } = payload;
      setLoadingProgressMap((prev) => {
        const next = { ...prev };
        if (isLoading) {
          next[profile] = progress;
        } else {
          delete next[profile];
        }
        return next;
      });
    });
    return () => unsub();
  }, []);

  // Preload Piano soundfont via Instrument Factory Pattern with IndexedDB Cache tracking
  useEffect(() => {
    let isSubscribed = true;

    instrumentFactory.isInstrumentCachedLocally(pianoSoundProfile).then((cached) => {
      if (isSubscribed) setIsPianoCached(cached);
    });

    if (instrumentFactory.isInstrumentLoaded(pianoSoundProfile)) {
      setSfProgress(null);
      setSfError(null);
      return;
    }

    setSfProgress(5);
    setSfError(null);
    instrumentFactory
      .preloadInstrument(pianoSoundProfile, (progress) => {
        if (isSubscribed) {
          setSfProgress(progress === 100 ? null : progress);
        }
      })
      .then(() => {
        if (isSubscribed) {
          setIsPianoCached(true);
          setSfProgress(null);
        }
      })
      .catch((err) => {
        if (isSubscribed) {
          setSfError('Chyba při stahování zvuků klavíru: ' + err.message);
          setSfProgress(null);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [pianoSoundProfile]);

  // Preload Drum kit sample set via Instrument Factory Pattern with IndexedDB Cache tracking
  useEffect(() => {
    let isSubscribed = true;

    instrumentFactory.isInstrumentCachedLocally(drumsSoundProfile).then((cached) => {
      if (isSubscribed) setIsDrumsCached(cached);
    });

    if (instrumentFactory.isInstrumentLoaded(drumsSoundProfile)) {
      setDrumsSfProgress(null);
      setDrumsSfError(null);
      return;
    }

    setDrumsSfProgress(5);
    setDrumsSfError(null);
    instrumentFactory
      .preloadInstrument(drumsSoundProfile, (progress) => {
        if (isSubscribed) {
          setDrumsSfProgress(progress === 100 ? null : progress);
        }
      })
      .then(() => {
        if (isSubscribed) {
          setIsDrumsCached(true);
          setDrumsSfProgress(null);
        }
      })
      .catch((err) => {
        if (isSubscribed) {
          setDrumsSfError('Chyba při stahování bicí sady: ' + err.message);
          setDrumsSfProgress(null);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [drumsSoundProfile]);
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
  const [isCustomDrumKitModalOpen, setIsCustomDrumKitModalOpen] = useState(false);
  const [customKits, setCustomKits] = useState<CustomDrumKit[]>([]);

  useEffect(() => {
    loadCustomKits();
  }, []);

  const loadCustomKits = async () => {
    try {
      const allKits = await customDrumKitService.getAllKits();
      setCustomKits(allKits);
    } catch (err) {
      console.error('Failed to load custom kits in VirtualInstruments:', err);
    }
  };

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

  // --- GUITAR TOOLS STATES ---
  const [guitarCurrentUrl, setGuitarCurrentUrl] = useState<string>('https://www.all-guitar-chords.com/');
  const [guitarIframeKey, setGuitarIframeKey] = useState<number>(0);
  const [isGuitarNavigating, setIsGuitarNavigating] = useState<boolean>(false);
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
            audioSynth.playDrumSound(pad.soundType, 0.8, drumsSoundProfile);
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
  }, [isPlayingSeq, bpm, seqGrid, drumsSoundProfile]);

  // Keep refs up-to-date to avoid stale closures in window event listeners
  const pianoSoundProfileRef = useRef(pianoSoundProfile);
  useEffect(() => {
    pianoSoundProfileRef.current = pianoSoundProfile;
  }, [pianoSoundProfile]);

  const drumsSoundProfileRef = useRef(drumsSoundProfile);
  useEffect(() => {
    drumsSoundProfileRef.current = drumsSoundProfile;
  }, [drumsSoundProfile]);

  const activeInstTabRef = useRef(activeInstTab);
  useEffect(() => {
    activeInstTabRef.current = activeInstTab;
  }, [activeInstTab]);

  const octaveShiftRef = useRef(octaveShift);
  useEffect(() => {
    octaveShiftRef.current = octaveShift;
  }, [octaveShift]);

  const onlyScaleKeysModeRef = useRef(onlyScaleKeysMode);
  useEffect(() => {
    onlyScaleKeysModeRef.current = onlyScaleKeysMode;
  }, [onlyScaleKeysMode]);

  const selectedScaleIndexRef = useRef(selectedScaleIndex);
  useEffect(() => {
    selectedScaleIndexRef.current = selectedScaleIndex;
  }, [selectedScaleIndex]);

  const activeScaleNotesRef = useRef(activeScaleNotes);
  useEffect(() => {
    activeScaleNotesRef.current = activeScaleNotes;
  }, [activeScaleNotes]);

  // Trigger piano note sound & visual state
  const handlePlayPianoNote = (noteName: string) => {
    // Extract root note (e.g. 'C#4' -> 'C#') to check if muted by scale filter
    const rootNote = noteName.replace(/[0-9]/g, '');
    if (
      onlyScaleKeysModeRef.current &&
      selectedScaleIndexRef.current !== null &&
      !activeScaleNotesRef.current.includes(rootNote)
    ) {
      // Muted by active scale filter
      return;
    }

    instrumentFactory.playNote(pianoSoundProfileRef.current, noteName, 2.2, 0.8);
    setActivePianoNote(noteName);
    setTimeout(() => {
      setActivePianoNote(null);
    }, 200);
  };

  // Trigger drum sound
  const handlePlayDrum = (soundType: string, padId: string) => {
    instrumentFactory.playDrumSound(soundType, 1.0, drumsSoundProfileRef.current);
    setActiveDrumPad(padId);
    setTimeout(() => {
      setActiveDrumPad(null);
    }, 150);
  };

  // Trigger guitar chord strum
  const handlePlayGuitarChord = (name: string, frets: number[]) => {
    instrumentFactory.playGuitarChord(frets, [82.41, 110.0, 146.83, 196.0, 246.94, 329.63], guitarSoundProfile);
    setActiveGuitarChord(name);
    setTimeout(() => {
      setActiveGuitarChord(null);
    }, 400);
  };

  // Global Keyboard listener for piano and drum triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      const currentTab = activeInstTabRef.current;

      if (currentTab === 'drums') {
        // Drum pads keyboard shortcuts ONLY when in Drums tab
        const foundPad = DRUM_PADS.find((p) => p.keyLabel.toLowerCase() === key);
        if (foundPad) {
          handlePlayDrum(foundPad.soundType, foundPad.id);
        }
      } else if (currentTab === 'piano') {
        // Piano / Loaded Instrument shortcuts ONLY when in Piano tab
        const baseOctave = 4 + octaveShiftRef.current;
        const foundPianoKey = BASE_PIANO_LAYOUT.find((p) => p.keyShortcut.toLowerCase() === key);
        if (foundPianoKey) {
          const noteOctave = baseOctave + foundPianoKey.relOctave;
          const noteFull = `${foundPianoKey.root}${noteOctave}`;
          handlePlayPianoNote(noteFull);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    if (preset.kit) {
      setDrumsSoundProfile(preset.kit);
      drumsSoundProfileRef.current = preset.kit;
      drumKitFactory.switchKit(preset.kit).catch(() => {});
    }

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
    <div className="w-full space-y-4 font-sans pb-16">
      
      {/* Header & Instrument Selector Tabs */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#FF9F0A] text-black font-semibold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
              Workstation
            </span>
            <span className="text-xs text-neutral-400 font-medium">Virtuální nástroje & MIDI</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Virtuální Nástroje & Hardware MIDI
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Zobrazte noty vybrané stupnice, posouvejte oktávy, připojte MIDI klávesy a hrajte reálné zvuky.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* MIDI Tools Modal Trigger */}
          <button
            onClick={() => setIsMidiModalOpen(true)}
            className="px-3.5 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-[#30D158] hover:text-[#30D158] font-semibold text-xs rounded-2xl border border-[#30D158]/30 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Otevřít nastavení MIDI klávesnice a mapování zvuků"
          >
            <Laptop className="w-4 h-4" />
            <span>MIDI Hardware & Zvuky</span>
          </button>

        </div>
      </div>

      {/**
       * Nástroje jako karty.
       *
       * Řádka drobných přepínačů nedávala poznat, co se pod kterým
       * skrývá, a nebylo v ní místo na to, čím se na nástroj hraje.
       */}
      <VyberNastroje vybrany={activeInstTab} onVybrat={setActiveInstTab} />

      {/* 🎹 PIANO TAB */}
      {activeInstTab === 'piano' && (
        <div className="space-y-4">

          {/* Co se z MIDI vyčetlo a co se podle toho nastavilo. Musí to
              být vidět a jít vypnout — jinak by se klávesy „samy" ztmavily
              a nebylo by zřejmé proč. */}
          {midiStav.tonina && midiStav.tracks.length > 0 && (
            <div className="bg-[#BF5AF2]/10 border border-[#BF5AF2]/30 rounded-2xl px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Ze skladby</span>
              <span className="text-white font-bold">
                {midiStav.tonina.nazev}
                <span className="ml-1.5 font-normal text-neutral-400">
                  ({Math.round(midiStav.tonina.jistota * 100)} % jistota)
                </span>
              </span>
              {midiStav.hlavniNastroj && (
                <span className="text-neutral-300">
                  hlavní nástroj: <strong className="text-white">{midiStav.hlavniNastroj.nazev}</strong>
                  <span className="text-neutral-500"> ({midiStav.hlavniNastroj.not} not)</span>
                </span>
              )}
              <label className="ml-auto flex items-center gap-2 cursor-pointer text-neutral-300">
                <input
                  type="checkbox"
                  checked={ridiSeMidi}
                  onChange={(e) => setRidiSeMidi(e.target.checked)}
                  className="accent-[#BF5AF2] cursor-pointer"
                />
                Nastavit klavír i hmatník podle skladby
              </label>
            </div>
          )}

          {/* MIDI přehrávač je tu, ne ve vlastní záložce: pustit si skladbu
              a zahrát do ní je jedna činnost, ne dvě. Přepínáním záložek
              se přehrávání zastavovalo dřív, než se stihlo dojít ke
              klaviatuře. */}
          <MidiPlayerPanel />

          {/* Scale Selector & Octave Shift Panel */}
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
              {/* Scale Title */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#FF9F0A]" />
                <span className="text-xs font-bold uppercase text-white tracking-wider">
                  Filtr stupnice písničky (zobrazení not na klávesách)
                </span>
              </div>

              {/* Preset Quick Buttons for Song Keys */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                <span className="text-neutral-400 font-medium mr-1">Tónina:</span>
                {[
                  { root: 'C', idx: 0, label: 'C dur' },
                  { root: 'G', idx: 0, label: 'G dur' },
                  { root: 'D', idx: 0, label: 'D dur' },
                  { root: 'A', idx: 1, label: 'A moll' },
                  { root: 'E', idx: 1, label: 'E moll' },
                  { root: 'F', idx: 0, label: 'F dur' },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => applySongKeyPreset(item.root, item.idx)}
                    className={`px-2.5 py-1 rounded-xl font-semibold transition-all cursor-pointer ${
                      selectedRoot === item.root && selectedScaleIndex === item.idx
                        ? 'bg-[#FF9F0A] text-black shadow-sm'
                        : 'bg-white/[0.04] text-neutral-300 border border-white/[0.06] hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedScaleIndex(null)}
                  className={`px-2.5 py-1 rounded-xl font-semibold transition-all cursor-pointer ${
                    selectedScaleIndex === null
                      ? 'bg-white/20 text-white border border-white/20'
                      : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06] hover:bg-white/10'
                  }`}
                >
                  Vypnout filtr
                </button>
              </div>
            </div>

            {/* Custom Scale & Octave Shift Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              
              {/* Sound Profile Selector */}
              <div className="bg-black/40 p-3 rounded-2xl border border-white/10 space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-400 font-semibold uppercase tracking-wider block">Zvuk kláves ({ALL_INSTRUMENTS.length} nástrojů)</span>
                  <button
                    onClick={() => setIsSoundLibraryOpen(true)}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#FF9F0A] hover:text-[#FFB340] transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Otevřít zvukovou knihovnu</span>
                  </button>
                </div>
                
                <select
                  value={pianoSoundProfile}
                  onChange={(e) => setPianoSoundProfile(e.target.value as InstrumentProfile)}
                  className="w-full bg-[#1C1C1E] text-white font-semibold text-xs p-2.5 rounded-xl border border-white/10 outline-none cursor-pointer focus:border-[#FF9F0A]"
                >
                  {INSTRUMENT_CATEGORIES.map((category) => {
                    const categoryInstruments = ALL_INSTRUMENTS.filter(
                      (inst) => inst.category === category.id
                    );
                    if (categoryInstruments.length === 0) return null;
                    return (
                      <optgroup key={category.id} label={`${category.icon} ${category.name}`}>
                        {categoryInstruments.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.icon} {inst.czName || inst.name} {usesRealSamples(inst) ? '(HQ Vzorky)' : '(Synth)'}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>

                {/* Piano Loading State Indicator (Asynchronous Multisample Fetch & IndexedDB Status) */}
                {sfProgress !== null ? (
                  <div className="mt-2 p-2 bg-[#30D158]/10 rounded-xl border border-[#30D158]/30 space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-[10px] text-[#30D158] font-bold">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#30D158]" />
                        <span>
                          {isPianoCached
                            ? 'Bleskové načítání z IndexedDB paměti...'
                            : 'Stahování a dekódování samplů klavíru...'}
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] bg-[#30D158]/20 text-[#30D158] px-1.5 py-0.5 rounded font-mono border border-[#30D158]/30">
                          {isPianoCached ? 'IndexedDB Cache' : 'CDN Stream'}
                        </span>
                        <span className="font-mono">{sfProgress}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden p-0.5 border border-[#30D158]/20">
                      <div 
                        className="bg-gradient-to-r from-[#30D158] to-[#00F5A0] h-full transition-all duration-200 rounded-full shadow-[0_0_8px_#30D158]"
                        style={{ width: `${sfProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-400">
                    <span className="flex items-center gap-1 text-[#30D158]">
                      <Zap className="w-3 h-3" /> Zvukový profil připraven
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[9px] text-neutral-500">
                      <Database className="w-3 h-3 text-[#30D158]" /> Uloženo v IndexedDB
                    </span>
                  </div>
                )}
                {sfError && (
                  <div className="mt-1.5 text-[10px] text-red-400 font-medium leading-tight p-2 bg-red-500/10 rounded-lg border border-red-500/30">
                    {sfError}
                  </div>
                )}
              </div>

              {/* Root Note Picker */}
              <div className="bg-black/40 p-3 rounded-2xl border border-white/10 space-y-1.5">
                <span className="text-[11px] text-neutral-400 font-semibold uppercase tracking-wider block">Základní tón:</span>
                <div className="flex flex-wrap gap-1">
                  {CHROMATIC_NOTES.map((note) => (
                    <button
                      key={note}
                      onClick={() => setSelectedRoot(note)}
                      className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                        selectedRoot === note
                          ? 'bg-[#FF9F0A] text-black font-extrabold shadow-sm'
                          : 'bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/5'
                      }`}
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scale Type Picker */}
              <div className="bg-black/40 p-3 rounded-2xl border border-white/10 space-y-1.5">
                <span className="text-[11px] text-neutral-400 font-semibold uppercase tracking-wider block">Typ stupnice:</span>
                <select
                  value={selectedScaleIndex === null ? 'none' : selectedScaleIndex}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedScaleIndex(val === 'none' ? null : Number(val));
                  }}
                  className="w-full bg-[#1C1C1E] text-white font-semibold text-xs p-2 rounded-xl border border-white/10 outline-none cursor-pointer"
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
              <div className="bg-black/40 p-3 rounded-2xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-400 font-semibold uppercase tracking-wider">Posun oktáv</span>
                  <span className="text-[10px] font-mono font-bold text-[#30D158] bg-[#30D158]/10 px-2 py-0.5 rounded-md border border-[#30D158]/30">
                    C{baseOctaveNumber} – C{baseOctaveNumber + 2}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 justify-between">
                  <button
                    onClick={() => setOctaveShift((prev) => Math.max(-2, prev - 1))}
                    disabled={octaveShift <= -2}
                    className="p-1.5 bg-white/5 hover:bg-white/15 disabled:opacity-30 text-white rounded-xl border border-white/10 text-xs flex items-center gap-0.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1">
                    {[-2, -1, 0, 1, 2].map((shift) => (
                      <button
                        key={shift}
                        onClick={() => setOctaveShift(shift)}
                        className={`w-6 h-6 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          octaveShift === shift
                            ? 'bg-[#FF9F0A] text-black font-extrabold shadow-sm'
                            : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
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
                    className="p-1.5 bg-white/5 hover:bg-white/15 disabled:opacity-30 text-white rounded-xl border border-white/10 text-xs flex items-center gap-0.5 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>

            {/* Active Scale Info Banner */}
            {selectedScaleIndex !== null && activeScaleDefinition && (
              <div className="bg-[#30D158]/10 border border-[#30D158]/30 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-[#30D158] text-black font-semibold text-[10px] px-2 py-0.5 rounded-md uppercase">
                    Aktivní stupnice
                  </span>
                  <span className="font-bold text-white">
                    {selectedRoot} {activeScaleDefinition.czName}
                  </span>
                  <span className="text-neutral-400 text-[11px] font-mono">
                    ({activeScaleNotes.join(' - ')})
                  </span>
                  {onlyScaleKeysMode && (
                    <span className="bg-black/30 text-[#30D158] border border-[#30D158]/40 text-[10px] font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Filtr aktivní (PC klávesnice + MIDI)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-semibold text-neutral-300 hover:text-white flex items-center gap-2 cursor-pointer bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
                    <input
                      type="checkbox"
                      checked={onlyScaleKeysMode}
                      onChange={(e) => setOnlyScaleKeysMode(e.target.checked)}
                      className="accent-[#30D158] rounded"
                    />
                    <span>Ztmavit nezařazené klávesy &amp; mútovat (PC klávesnice + MIDI)</span>
                  </label>
                </div>
              </div>
            )}

          </div>

          {/* Interactive Keyboard Canvas (2 Full Octaves - 25 Keys) */}
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl text-center space-y-4">
            
            {/* PC Keyboard Mapping Legend Bar */}
            <div className="bg-black/50 border border-white/10 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-left">
              <div className="flex items-center gap-2">
                <span className="bg-[#FF9F0A] text-black font-extrabold text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-wide flex items-center gap-1.5 shadow-sm">
                  <Laptop className="w-3.5 h-3.5" /> PC Klávesnice
                </span>
                <span className="text-white font-medium text-xs">
                  Aktivní nástroj: <strong className="text-[#30D158] font-bold">{ALL_INSTRUMENTS.find(i => i.id === pianoSoundProfile)?.czName || pianoSoundProfile}</strong>
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-neutral-300 font-mono flex-wrap">
                <span className="bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                  <span className="text-[#FF9F0A] font-bold">A S D F G H J K L Z X C V B N</span> = Bílé klávesy
                </span>
                <span className="bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                  <span className="text-[#FF9F0A] font-bold">W E T Y U O P 1 2 3</span> = Černé klávesy
                </span>
              </div>
            </div>

            <div className="flex justify-center overflow-x-auto py-3 scrollbar-thin">
              <div className="relative flex h-52 bg-black/60 p-3.5 rounded-2xl border border-white/10 shadow-2xl">
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
                        className={`w-8 h-32 -mx-4 z-10 rounded-b-md flex flex-col justify-between items-center py-2 px-0.5 border transition-all active:scale-95 cursor-pointer shadow-md ${
                          isActivePressed
                            ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] shadow-[0_0_15px_#FF9F0A]'
                            : isScaleNote && selectedScaleIndex !== null
                            ? 'bg-[#1C2E20] hover:bg-[#28422E] text-[#30D158] border-[#30D158]/60 shadow-[0_0_8px_rgba(48,209,88,0.2)]'
                            : isDisabledByFilter
                            ? 'bg-[#0E0E10] text-neutral-700 border-white/5 opacity-20'
                            : 'bg-[#1C1C1E] hover:bg-[#2C2C2E] text-neutral-300 hover:text-white border-black'
                        }`}
                        title={`${fullNoteName} [Klávesa PC: ${keyObj.keyShortcut.toUpperCase()}]`}
                      >
                        {isScaleNote && selectedScaleIndex !== null ? (
                          <span className="text-[8px] font-extrabold bg-[#30D158] text-black px-1 rounded-full">
                            {scaleDegree}.
                          </span>
                        ) : (
                          <span className="h-2" />
                        )}

                        <span className="text-[8px] font-bold font-mono uppercase tracking-tighter">{keyObj.root}</span>

                        {/* Graphical PC Keycap Badge */}
                        <span className="px-1 py-0.5 rounded bg-black/90 text-[#FF9F0A] font-mono text-[9px] font-black border border-[#FF9F0A]/40 uppercase shadow-xs flex items-center justify-center min-w-[18px]">
                          {keyObj.keyShortcut.toUpperCase()}
                        </span>
                      </button>
                    );
                  }

                  const isDisabledByFilter = onlyScaleKeysMode && !isScaleNote;

                  return (
                    <button
                      key={`${fullNoteName}-${idx}`}
                      onClick={() => handlePlayPianoNote(fullNoteName)}
                      disabled={isDisabledByFilter}
                      className={`w-11 h-46 rounded-b-xl flex flex-col justify-between items-center py-3 px-1 border transition-all active:scale-95 cursor-pointer shadow-sm ${
                        isActivePressed
                          ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] shadow-[0_0_15px_#FF9F0A]'
                          : isScaleNote && selectedScaleIndex !== null
                          ? 'bg-[#EDFDF0] hover:bg-white text-black border-2 border-[#30D158] shadow-[0_0_10px_rgba(48,209,88,0.3)]'
                          : isDisabledByFilter
                          ? 'bg-neutral-800/40 text-neutral-600 border-white/5 opacity-20'
                          : 'bg-neutral-200 hover:bg-white text-black border-neutral-700/50'
                      }`}
                      title={`${fullNoteName} [Klávesa PC: ${keyObj.keyShortcut.toUpperCase()}]`}
                    >
                      {isScaleNote && selectedScaleIndex !== null ? (
                        <span className="text-[9px] font-extrabold bg-[#30D158] text-black px-1.5 py-0.5 rounded-md shadow-xs">
                          {scaleDegree}. stupeň
                        </span>
                      ) : (
                        <span className="h-3" />
                      )}

                      <span className="text-[11px] font-black font-mono tracking-tight">{fullNoteName}</span>

                      {/* Graphical PC Keycap Badge */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[7px] text-neutral-500 uppercase font-bold tracking-tighter">PC Klávesa</span>
                        <span className="px-2 py-0.5 rounded-lg bg-[#1C1C1E] text-white font-mono text-[10px] font-extrabold border border-white/20 shadow-md flex items-center justify-center min-w-[22px]">
                          <span className="text-[#FF9F0A] font-black">{keyObj.keyShortcut.toUpperCase()}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Vlastní akord: naťukat a hned vidět, co odpovídá na druhém
              nástroji. Dřív to bylo jen v okně akordů u písně, ale ptají
              se na to právě tady, u nástroje. */}
          <div className="mt-4">
            <AkordovyPrekladac sirka={320} />
          </div>

        </div>
      )}

      {/* 🥁 DRUMS TAB */}
      {activeInstTab === 'drums' && <SamplesStudio />}
      {activeInstTab === 'pady' && <PadyBicich />}

      {/* 🎸 HMATNÍK — samostatná stránka s podsekcemi */}
      {activeInstTab === 'fretboard' && (
        <div className="space-y-4">
          <AkordovyPrekladac sirka={340} />
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 shadow-xl flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-white text-sm block">Hmatník</span>
                <span className="text-[11px] text-neutral-400">Akordy, stupnice a kytarové nástroje na jednom místě.</span>
              </div>
            </div>

            <div className="ml-auto flex items-center bg-white/[0.04] p-1 rounded-2xl border border-white/[0.06]">
              {([
                { id: 'chord', label: 'Akordy' },
                { id: 'scale', label: 'Stupnice' },
                { id: 'poslech', label: 'Poslech kytary' },
                { id: 'zKytary', label: 'Kytara → klavír' },
                { id: 'guitar_tools', label: 'Guitar Tools' },
              ] as const).map((sekce) => (
                <button
                  key={sekce.id}
                  onClick={() => setHmatnikSekce(sekce.id)}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    hmatnikSekce === sekce.id
                      ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {sekce.label}
                </button>
              ))}
            </div>
          </div>

          {/* Akord sebraný z kytary a ukázaný jako hmat na klaviatuře. */}
          {hmatnikSekce === 'zKytary' && (
            <div className="bg-[#16161A]/60 border border-white/[0.08] rounded-3xl p-4">
              <AkordZKytary />
            </div>
          )}

          {hmatnikSekce === 'poslech' && (
            <PoslechKytaryPanel
              onTon={setZnejiciTon}
              onUkazNaHmatniku={(ton, stupnice) => {
                setNavrhZPoslechu((p) => ({ ton, stupnice, poradi: (p?.poradi || 0) + 1 }));
                setHmatnikSekce('scale');
                // Klaviatura se řídí týmž výběrem, takže co se najde na
                // kytaře, svítí i na klávesách.
                setSelectedRoot(ton);
              }}
            />
          )}

          {/* Při poslechu zůstává hmatník na obrazovce a svítí na něm, co
              se zrovna hraje — kdo se dívá na monitor, vidí, co se mačká.
              Režim je „stupnice", protože poloha tónu dává smysl vůči ní. */}
          {hmatnikSekce !== 'guitar_tools' && hmatnikSekce !== 'zKytary' && (
            <ChordScaleExplorer
              compact
              mode={hmatnikSekce === 'poslech' ? 'scale' : hmatnikSekce}
              onModeChange={(m) => setHmatnikSekce(m)}
              navrh={navrhZPoslechu || undefined}
              znejiciTon={hmatnikSekce === 'poslech' ? znejiciTon : null}
            />
          )}
        </div>
      )}

      {/* 🎸 GUITAR TOOLS — podsekce hmatníku */}
      {activeInstTab === 'fretboard' && hmatnikSekce === 'guitar_tools' && (
        <div className="space-y-4">
          
          {/* Information & Controller bar */}
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-white text-sm block">All Guitar Chords — Integrovaná Databáze</span>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Kompletní kytarová databáze akordů, stupnic a prstokladů přímo ve vaší aplikaci.
                </p>
              </div>
            </div>

            {/* Quick Presets within All-Guitar-Chords */}
            <div className="flex flex-wrap items-center gap-1.5 bg-white/[0.04] p-1.5 rounded-2xl border border-white/[0.06]">
              <span className="text-[10px] text-neutral-400 font-semibold uppercase px-1">Rychlé sekce:</span>
              <button
                onClick={() => {
                  setIsGuitarNavigating(true);
                  setGuitarCurrentUrl('https://www.all-guitar-chords.com/');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  guitarCurrentUrl === 'https://www.all-guitar-chords.com/' || guitarCurrentUrl.endsWith('chords.com') || guitarCurrentUrl.endsWith('chords.com/')
                    ? 'bg-white/20 text-white font-bold border border-white/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Akordy
              </button>
              <button
                onClick={() => {
                  setIsGuitarNavigating(true);
                  setGuitarCurrentUrl('https://www.all-guitar-chords.com/scales');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  guitarCurrentUrl.includes('/scales') && !guitarCurrentUrl.includes('identifier') && !guitarCurrentUrl.includes('chords')
                    ? 'bg-white/20 text-white font-bold border border-white/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Stupnice
              </button>
              <button
                onClick={() => {
                  setIsGuitarNavigating(true);
                  setGuitarCurrentUrl('https://www.all-guitar-chords.com/chords/identifier');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  guitarCurrentUrl.includes('/chords/identifier')
                    ? 'bg-white/20 text-white font-bold border border-white/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Hledač akordu
              </button>
              <button
                onClick={() => {
                  setIsGuitarNavigating(true);
                  setGuitarCurrentUrl('https://www.all-guitar-chords.com/chords/arpeggio');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  guitarCurrentUrl.includes('/chords/arpeggio')
                    ? 'bg-white/20 text-white font-bold border border-white/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Arpeggia
              </button>
              <button
                onClick={() => {
                  setIsGuitarNavigating(true);
                  setGuitarCurrentUrl('https://www.all-guitar-chords.com/chords/progressions');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  guitarCurrentUrl.includes('/chords/progressions')
                    ? 'bg-white/20 text-white font-bold border border-white/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Progrese
              </button>
              <button
                onClick={() => {
                  setIsGuitarNavigating(true);
                  setGuitarCurrentUrl('https://www.all-guitar-chords.com/circle-of-fifths');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  guitarCurrentUrl.includes('/circle-of-fifths')
                    ? 'bg-white/20 text-white font-bold border border-white/20'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Kvintový kruh
              </button>
            </div>
          </div>

          {/* Browser Address Bar & Refresh / Navigate Controls */}
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-3 shadow-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setIsGuitarNavigating(true);
                  setGuitarCurrentUrl('https://www.all-guitar-chords.com/');
                }}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white cursor-pointer"
                title="Domů (Akordy & Hmatník)"
              >
                <Home className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setIsGuitarNavigating(true);
                  setGuitarIframeKey((prev) => prev + 1);
                }}
                className={`p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white cursor-pointer ${
                  isGuitarNavigating ? 'animate-spin' : ''
                }`}
                title="Obnovit stránku"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Read-Only Address display to replicate real browser address bar */}
            <div className="flex-1 min-w-[280px] flex items-center bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl">
              <Globe className="w-3.5 h-3.5 text-[#30D158] mr-2" />
              <span className="text-xs text-neutral-200 font-mono truncate">
                {guitarCurrentUrl}
              </span>
            </div>

            {/* External link button */}
            <a
              href={guitarCurrentUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Otevřít v novém okně</span>
            </a>
          </div>

          {/* Embedded Web Page Iframe wrapper */}
          <div className="border border-white/[0.08] bg-black rounded-3xl overflow-hidden shadow-2xl relative">
            <iframe
              key={`${guitarCurrentUrl}_${guitarIframeKey}`}
              src={guitarCurrentUrl}
              className="w-full bg-white h-[750px] sm:h-[820px] md:h-[880px] border-0"
              title="All Guitar Chords Database"
              allow="autoplay; fullscreen"
              onLoad={() => setIsGuitarNavigating(false)}
            />
            {isGuitarNavigating && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-[#1C1C1E] border border-white/10 p-5 rounded-2xl text-center shadow-2xl">
                  <span className="text-xs font-semibold text-[#30D158] animate-pulse">
                    Načítání kytarové databáze...
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* MIDI Tools & Sound Mapping Modal */}
      <MidiToolsModal
        isOpen={isMidiModalOpen}
        onClose={() => setIsMidiModalOpen(false)}
      />

      {/* 🎹 Interactive Sound Library Browser Modal (200+ Instruments) */}
      {isSoundLibraryOpen && (
        <div 
          id="sound-library-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
          onClick={() => setIsSoundLibraryOpen(false)}
        >
          <div
            className="bg-[#16161A] border border-white/10 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#1C1C1E]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-[#FF9F0A] text-black font-extrabold text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Knihovna Zvuků
                  </span>
                  <span className="text-xs text-[#30D158] font-mono font-bold">
                    {ALL_INSTRUMENTS.length} dostupných nástrojů
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Vyberte si virtuální nástroj nebo zvuk kláves
                </h3>
              </div>

              <button
                onClick={() => setIsSoundLibraryOpen(false)}
                className="self-end sm:self-auto px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                Zavřít [Esc]
              </button>
            </div>

            {/* Search and Category Filter Bar */}
            <div className="p-4 sm:p-5 border-b border-white/10 bg-black/40 space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Hledat nástroj (např. saxofon, varhany, basa, flétna, housle, synth...)"
                  value={soundLibSearch}
                  onChange={(e) => setSoundLibSearch(e.target.value)}
                  className="w-full bg-[#1C1C1E] text-white pl-10 pr-4 py-2.5 rounded-xl border border-white/10 text-xs sm:text-sm outline-none focus:border-[#FF9F0A] transition-all placeholder:text-neutral-500"
                />
                {soundLibSearch && (
                  <button
                    onClick={() => setSoundLibSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
                  >
                    Vymazat
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  onClick={() => setSoundLibCategory('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    soundLibCategory === 'all'
                      ? 'bg-[#FF9F0A] text-black font-bold shadow-md'
                      : 'bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  🌟 Všechny ({ALL_INSTRUMENTS.length})
                </button>
                {INSTRUMENT_CATEGORIES.map((cat) => {
                  const count = ALL_INSTRUMENTS.filter((i) => i.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSoundLibCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        soundLibCategory === cat.id
                          ? 'bg-[#FF9F0A] text-black font-bold shadow-md'
                          : 'bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/5'
                      }`}
                    >
                      <span>{cat.icon} {cat.name} ({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instrument Cards Grid */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 max-h-[60vh]">
              {(() => {
                const filtered = ALL_INSTRUMENTS.filter((inst) => {
                  const matchCat = soundLibCategory === 'all' || inst.category === soundLibCategory;
                  const matchQuery =
                    !soundLibSearch ||
                    inst.name.toLowerCase().includes(soundLibSearch.toLowerCase()) ||
                    inst.czCategory.toLowerCase().includes(soundLibSearch.toLowerCase()) ||
                    inst.description.toLowerCase().includes(soundLibSearch.toLowerCase()) ||
                    inst.id.toLowerCase().includes(soundLibSearch.toLowerCase());
                  return matchCat && matchQuery;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-neutral-400 space-y-2">
                      <Music className="w-8 h-8 mx-auto text-neutral-600" />
                      <p className="text-sm font-semibold">Žádný nástroj neodpovídá hledanému výrazu.</p>
                      <button
                        onClick={() => {
                          setSoundLibSearch('');
                          setSoundLibCategory('all');
                        }}
                        className="text-xs text-[#FF9F0A] hover:underline"
                      >
                        Zobrazit všechny nástroje
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map((inst) => {
                      const isSelected = pianoSoundProfile === inst.id;
                      const isLoading = instrumentFactory.isInstrumentLoading(inst.id) || !!loadingProgressMap[inst.id];
                      const progress = loadingProgressMap[inst.id] ?? instrumentFactory.getLoadingProgress(inst.id);
                      const isLoaded = instrumentFactory.isInstrumentLoaded(inst.id);

                      return (
                        <div
                          key={inst.id}
                          className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                            isSelected
                              ? 'bg-[#FF9F0A]/10 border-[#FF9F0A] shadow-[0_0_15px_rgba(255,159,10,0.2)]'
                              : 'bg-black/30 hover:bg-white/[0.04] border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{inst.icon}</span>
                                <div>
                                  <h4 className="text-xs sm:text-sm font-bold text-white leading-tight">
                                    {inst.name}
                                  </h4>
                                  <span className="text-[10px] text-neutral-400 block font-medium">
                                    {inst.czCategory}
                                  </span>
                                </div>
                              </div>

                              {isLoading ? (
                                <span className="text-[9px] font-bold text-[#FF9F0A] bg-[#FF9F0A]/10 px-2 py-0.5 rounded-md border border-[#FF9F0A]/30 flex items-center gap-1 animate-pulse whitespace-nowrap">
                                  <Loader2 className="w-3 h-3 animate-spin text-[#FF9F0A]" />
                                  <span>{progress ? `${progress}%` : 'Načítání...'}</span>
                                </span>
                              ) : isLoaded ? (
                                <span className="text-[9px] font-bold text-[#30D158] bg-[#30D158]/10 px-2 py-0.5 rounded-md border border-[#30D158]/30 flex items-center gap-1 whitespace-nowrap">
                                  <Zap className="w-3 h-3 text-[#30D158]" />
                                  <span>V keši</span>
                                </span>
                              ) : usesRealSamples(inst) ? (
                                <span className="text-[9px] font-bold text-neutral-300 bg-white/5 px-2 py-0.5 rounded-md border border-white/10 whitespace-nowrap">
                                  HQ Vzorky
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-[#FF9F0A] bg-[#FF9F0A]/10 px-2 py-0.5 rounded-md border border-[#FF9F0A]/20 whitespace-nowrap">
                                  Synth
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 line-clamp-2 pt-1">
                              {inst.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => {
                                if (!isLoaded) {
                                  instrumentFactory.preloadInstrument(inst.id);
                                }
                                instrumentFactory.playNote(inst.id, 'C4', 1.4, 0.85);
                              }}
                              className="px-2.5 py-1.5 bg-white/5 hover:bg-white/15 text-neutral-200 hover:text-white rounded-xl text-[11px] font-semibold border border-white/10 flex items-center gap-1 transition-all cursor-pointer"
                              title="Přehrát zkušební tón C4"
                            >
                              {isLoading ? (
                                <Loader2 className="w-3 h-3 text-[#FF9F0A] animate-spin" />
                              ) : (
                                <Play className="w-3 h-3 text-[#30D158]" />
                              )}
                              <span>Zkouška</span>
                            </button>

                            <button
                              onClick={() => {
                                const profile = inst.id as InstrumentProfile;
                                setPianoSoundProfile(profile);
                                instrumentFactory.preloadInstrument(profile);
                                setIsSoundLibraryOpen(false);
                              }}
                              className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                isSelected
                                  ? 'bg-[#30D158] text-black shadow-sm'
                                  : 'bg-[#FF9F0A] text-black hover:bg-[#FFB340]'
                              }`}
                            >
                              {isSelected ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  <span>Vybráno</span>
                                </>
                              ) : (
                                <span>Aktivovat</span>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-[#1C1C1E] flex items-center justify-between text-xs text-neutral-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#FF9F0A]" />
                Všechny zvuky jsou okamžitě připraveny k živému hraní na klávesnici i MIDI.
              </span>
              <button
                onClick={() => setIsSoundLibraryOpen(false)}
                className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all"
              >
                Hotovo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🥁 Custom Drum Kit Designer & Sample Recorder Modal */}
      <CustomDrumKitModal
        isOpen={isCustomDrumKitModalOpen}
        onClose={() => {
          setIsCustomDrumKitModalOpen(false);
          loadCustomKits();
        }}
        currentKitId={drumsSoundProfile}
        onSelectKit={(kitId) => {
          setDrumsSoundProfile(kitId);
          setIsCustomDrumKitModalOpen(false);
          loadCustomKits();
        }}
      />

    </div>
  );
};
