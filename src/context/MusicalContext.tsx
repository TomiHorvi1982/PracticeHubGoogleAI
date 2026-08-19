import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Song } from '../types';
import { eventBus } from '../services/eventBus';
import { songDatabaseService } from '../services/songDatabaseService';

export type DockToolId = 'fretboard' | 'scales' | 'chords' | 'tuner' | 'metronome' | 'looper' | 'drums' | 'keyboard' | null;

export interface MusicalContextType {
  // Active Project Context
  activeSong: Song | null;
  activeSongId: string | null;
  setActiveSong: (song: Song | null) => void;
  selectSongById: (id: string | null) => void;

  // Musical Attributes
  key: string;
  setKey: (key: string) => void;
  transposeSemitones: number;
  setTransposeSemitones: (semitones: number | ((prev: number) => number)) => void;
  bpm: number;
  setBpm: (bpm: number) => void;
  tuning: string;
  setTuning: (tuning: string) => void;
  capo: number;
  setCapo: (capo: number) => void;

  // Harmony Context
  activeChord: string | null;
  setActiveChord: (chord: string | null) => void;
  activeScale: string | null;
  setActiveScale: (scale: string | null) => void;

  // Transport State
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  isMetronomeActive: boolean;
  setIsMetronomeActive: (active: boolean) => void;
  toggleMetronome: () => void;

  // Instrument Selection
  selectedInstrument: 'guitar' | 'bass' | 'keys' | 'drums';
  setSelectedInstrument: (inst: 'guitar' | 'bass' | 'keys' | 'drums') => void;

  // Dock Tools State
  activeDockTool: DockToolId;
  setActiveDockTool: (tool: DockToolId) => void;
  toggleDockTool: (tool: NonNullable<DockToolId>) => void;

  // Gig / Focus Mode State
  isGigMode: boolean;
  setIsGigMode: (gig: boolean) => void;
}

const MusicalContext = createContext<MusicalContextType | undefined>(undefined);

export const MusicalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeSong, setActiveSongState] = useState<Song | null>(null);
  const [key, setKeyState] = useState<string>('C');
  const [transposeSemitones, setTransposeSemitonesState] = useState<number>(0);
  const [bpm, setBpmState] = useState<number>(120);
  const [tuning, setTuningState] = useState<string>('E Standard');
  const [capo, setCapoState] = useState<number>(0);

  const [activeChord, setActiveChordState] = useState<string | null>(null);
  const [activeScale, setActiveScaleState] = useState<string | null>(null);

  const [isPlaying, setIsPlayingState] = useState<boolean>(false);
  const [isMetronomeActive, setIsMetronomeActiveState] = useState<boolean>(false);

  const [selectedInstrument, setSelectedInstrumentState] = useState<'guitar' | 'bass' | 'keys' | 'drums'>('guitar');
  const [activeDockTool, setActiveDockToolState] = useState<DockToolId>(null);
  const [isGigMode, setIsGigModeState] = useState<boolean>(false);

  // Set Active Song and sync default attributes
  const setActiveSong = useCallback((song: Song | null) => {
    setActiveSongState(song);
    if (song) {
      if (song.key) setKeyState(song.key);
      if (song.bpm) setBpmState(song.bpm);
      if (song.tuning) setTuningState(song.tuning);
      if (song.capo !== undefined) setCapoState(song.capo);
      setTransposeSemitonesState(0);
      eventBus.emit('SONG_CHANGED', { songId: song.id, song });
    } else {
      eventBus.emit('SONG_CHANGED', { songId: null });
    }
  }, []);

  const selectSongById = useCallback((id: string | null) => {
    if (!id) {
      setActiveSong(null);
      return;
    }
    const songs = songDatabaseService.getSongs();
    const found = songs.find((s) => s.id === id);
    if (found) {
      setActiveSong(found);
    }
  }, [setActiveSong]);

  const setKey = useCallback((newKey: string) => {
    setKeyState(newKey);
    eventBus.emit('KEY_CHANGED', { key: newKey });
  }, []);

  const setTransposeSemitones = useCallback((semitonesOrFn: number | ((prev: number) => number)) => {
    setTransposeSemitonesState((prev) => {
      const nextVal = typeof semitonesOrFn === 'function' ? semitonesOrFn(prev) : semitonesOrFn;
      eventBus.emit('TRANSPOSE_CHANGED', { semitones: nextVal });
      return nextVal;
    });
  }, []);

  const setBpm = useCallback((newBpm: number) => {
    const clamped = Math.max(30, Math.min(300, Math.round(newBpm)));
    setBpmState(clamped);
    eventBus.emit('BPM_CHANGED', { bpm: clamped });
  }, []);

  const setTuning = useCallback((newTuning: string) => {
    setTuningState(newTuning);
    eventBus.emit('TUNING_CHANGED', { tuning: newTuning });
  }, []);

  const setCapo = useCallback((newCapo: number) => {
    setCapoState(newCapo);
    eventBus.emit('CAPO_CHANGED', { capo: newCapo });
  }, []);

  const setActiveChord = useCallback((chord: string | null) => {
    setActiveChordState(chord);
    eventBus.emit('CHORD_SELECTED', { chordName: chord });
  }, []);

  const setActiveScale = useCallback((scale: string | null) => {
    setActiveScaleState(scale);
    eventBus.emit('SCALE_SELECTED', { scaleName: scale });
  }, []);

  const setIsPlaying = useCallback((playing: boolean) => {
    setIsPlayingState(playing);
    if (playing) {
      eventBus.emit('TRANSPORT_PLAY');
    } else {
      eventBus.emit('TRANSPORT_PAUSE');
    }
  }, []);

  const setIsMetronomeActive = useCallback((active: boolean) => {
    setIsMetronomeActiveState(active);
    eventBus.emit('METRONOME_TOGGLE', { isRunning: active, bpm });
  }, [bpm]);

  const toggleMetronome = useCallback(() => {
    setIsMetronomeActiveState((prev) => {
      const next = !prev;
      eventBus.emit('METRONOME_TOGGLE', { isRunning: next, bpm });
      return next;
    });
  }, [bpm]);

  const setSelectedInstrument = useCallback((inst: 'guitar' | 'bass' | 'keys' | 'drums') => {
    setSelectedInstrumentState(inst);
    eventBus.emit('INSTRUMENT_CHANGED', { instrument: inst });
  }, []);

  const setActiveDockTool = useCallback((tool: DockToolId) => {
    setActiveDockToolState(tool);
    if (tool) {
      eventBus.emit('DOCK_OPEN_TOOL', { toolId: tool });
    }
  }, []);

  const toggleDockTool = useCallback((tool: NonNullable<DockToolId>) => {
    setActiveDockToolState((prev) => {
      const next = prev === tool ? null : tool;
      if (next) {
        eventBus.emit('DOCK_OPEN_TOOL', { toolId: next });
      }
      return next;
    });
  }, []);

  // Listen for eventBus events to sync state from external tools
  useEffect(() => {
    const unsubChord = eventBus.on('CHORD_SELECTED', (payload) => {
      if (payload.chordName !== activeChord) {
        setActiveChordState(payload.chordName);
      }
    });
    const unsubDock = eventBus.on('DOCK_OPEN_TOOL', (payload) => {
      if (payload.toolId !== activeDockTool) {
        setActiveDockToolState(payload.toolId);
      }
    });

    return () => {
      unsubChord();
      unsubDock();
    };
  }, [activeChord, activeDockTool]);

  return (
    <MusicalContext.Provider
      value={{
        activeSong,
        activeSongId: activeSong?.id || null,
        setActiveSong,
        selectSongById,
        key,
        setKey,
        transposeSemitones,
        setTransposeSemitones,
        bpm,
        setBpm,
        tuning,
        setTuning,
        capo,
        setCapo,
        activeChord,
        setActiveChord,
        activeScale,
        setActiveScale,
        isPlaying,
        setIsPlaying,
        isMetronomeActive,
        setIsMetronomeActive,
        toggleMetronome,
        selectedInstrument,
        setSelectedInstrument,
        activeDockTool,
        setActiveDockTool,
        toggleDockTool,
        isGigMode,
        setIsGigMode: setIsGigModeState,
      }}
    >
      {children}
    </MusicalContext.Provider>
  );
};

export const useMusicalContext = (): MusicalContextType => {
  const ctx = useContext(MusicalContext);
  if (!ctx) {
    throw new Error('useMusicalContext must be used within a MusicalProvider');
  }
  return ctx;
};
