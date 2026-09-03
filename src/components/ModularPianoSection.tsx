import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Piano, 
  Play, 
  Volume2, 
  Music, 
  Sparkles, 
  RotateCcw, 
  Layers, 
  Eye, 
  VolumeX, 
  ChevronLeft, 
  ChevronRight,
  Radio
} from 'lucide-react';
import { useMusicalContext } from '../context/MusicalContext';
import { audioSynth } from '../services/audioSynth';
import { findOrGenerateChord } from '../utils/chordUtils';

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface ModularPianoSectionProps {
  songChords?: string[];
  activeChord?: string | null;
  onSelectChord?: (chord: string) => void;
  songKey?: string;
}

interface KeyInfo {
  note: string;
  noteName: string; // e.g. "C", "C#"
  octave: number;
  pitchClass: number; // 0 to 11
  isBlack: boolean;
  leftOffset?: number; // relative to white keys index
}

export const ModularPianoSection: React.FC<ModularPianoSectionProps> = ({
  songChords = [],
  activeChord: propActiveChord,
  onSelectChord,
  songKey,
}) => {
  const musicalCtx = useMusicalContext();
  const currentActiveChord = propActiveChord !== undefined ? propActiveChord : musicalCtx?.activeChord;

  const [selectedChord, setSelectedChord] = useState<string | null>(currentActiveChord || songChords[0] || 'C');
  const [baseOctave, setBaseOctave] = useState<number>(4);
  const [octaveSpan, setOctaveSpan] = useState<number>(2); // 2 or 3 octaves
  const [displayMode, setDisplayMode] = useState<'intervals' | 'notes' | 'both'>('both');
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [isPlayingArp, setIsPlayingArp] = useState<boolean>(false);
  const [sustainPedal, setSustainPedal] = useState<boolean>(true);

  // Sync with global active chord if it changes externally
  useEffect(() => {
    if (currentActiveChord && currentActiveChord !== selectedChord) {
      setSelectedChord(currentActiveChord);
    }
  }, [currentActiveChord]);

  // Sync if songChords change and no chord is active
  useEffect(() => {
    if (!selectedChord && songChords.length > 0) {
      setSelectedChord(songChords[0]);
    }
  }, [songChords, selectedChord]);

  // Analyze active chord definition and intervals
  const chordDef = useMemo(() => {
    if (!selectedChord) return null;
    return findOrGenerateChord(selectedChord);
  }, [selectedChord]);

  // Map active pitch classes for the chord
  const activePitchClasses = useMemo(() => {
    if (!chordDef) return new Set<number>();
    return new Set(chordDef.pianoKeys);
  }, [chordDef]);

  // Calculate interval role name for each pitch class relative to chord root
  const getIntervalRole = useCallback((pitchClass: number): { label: string; role: string; color: string } => {
    if (!chordDef) return { label: '', role: '', color: '' };
    const rootIdx = CHROMATIC_SCALE.indexOf(chordDef.root);
    if (rootIdx === -1) return { label: '', role: '', color: '' };

    const interval = (pitchClass - rootIdx + 12) % 12;

    switch (interval) {
      case 0:
        return { label: 'R', role: 'Základní tón (Root)', color: 'bg-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.8)] border-amber-300' };
      case 1:
        return { label: 'b9', role: 'Malá nona (b9)', color: 'bg-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.6)] border-rose-300' };
      case 2:
        return { label: '9', role: 'Velká nona / sekunda (9)', color: 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(6,182,212,0.6)] border-cyan-300' };
      case 3:
        return { label: 'm3', role: 'Malá tercie (m3)', color: 'bg-emerald-500 text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.7)] border-emerald-300' };
      case 4:
        return { label: '3', role: 'Velká tercie (3)', color: 'bg-emerald-400 text-slate-950 shadow-[0_0_10px_rgba(52,211,153,0.7)] border-emerald-200' };
      case 5:
        return { label: '4', role: 'Kvarty / Sus4 (4)', color: 'bg-teal-500 text-slate-950 shadow-[0_0_8px_rgba(20,184,166,0.6)] border-teal-300' };
      case 6:
        return { label: 'b5', role: 'Zmenšená kvinta (b5 / #11)', color: 'bg-rose-600 text-white shadow-[0_0_8px_rgba(225,29,72,0.6)] border-rose-400' };
      case 7:
        return { label: '5', role: 'Čistá kvinta (5)', color: 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.7)] border-blue-300' };
      case 8:
        return { label: '#5', role: 'Zvětšená kvinta (#5 / b13)', color: 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.6)] border-purple-300' };
      case 9:
        return { label: '6', role: 'Sexta / 13 (6)', color: 'bg-indigo-400 text-slate-950 shadow-[0_0_8px_rgba(129,140,248,0.6)] border-indigo-200' };
      case 10:
        return { label: 'b7', role: 'Malá septima (b7)', color: 'bg-fuchsia-500 text-white shadow-[0_0_10px_rgba(217,70,239,0.7)] border-fuchsia-300' };
      case 11:
        return { label: '7', role: 'Velká septima (maj7)', color: 'bg-violet-500 text-white shadow-[0_0_10px_rgba(139,92,246,0.7)] border-violet-300' };
      default:
        return { label: '', role: '', color: '' };
    }
  }, [chordDef]);

  // Select a chord
  const handleSelectChord = (chordName: string) => {
    setSelectedChord(chordName);
    if (musicalCtx?.setActiveChord) {
      musicalCtx.setActiveChord(chordName);
    }
    if (onSelectChord) {
      onSelectChord(chordName);
    }
    // Sound preview of chord
    playChordPreview(chordName);
  };

  // Play piano key note
  const playKey = (noteWithOctave: string) => {
    audioSynth.playNote(noteWithOctave, 'grand_piano', sustainPedal ? 2.5 : 1.2, 0.85);
    setPressedKeys((prev) => new Set([...prev, noteWithOctave]));

    setTimeout(() => {
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(noteWithOctave);
        return next;
      });
    }, 280);
  };

  // Play chord as smooth block voicing
  const playChordPreview = (chordName: string = selectedChord || 'C') => {
    const cDef = findOrGenerateChord(chordName);
    if (!cDef) return;

    cDef.pianoKeys.forEach((pitchClass, idx) => {
      // Choose octave for realistic voicing (root at baseOctave, higher notes appropriately)
      const noteName = CHROMATIC_SCALE[pitchClass];
      const oct = pitchClass < cDef.pianoKeys[0] ? baseOctave + 1 : baseOctave;
      const fullNote = `${noteName}${oct}`;

      // Slight humanization delay
      setTimeout(() => {
        audioSynth.playNote(fullNote, 'grand_piano', sustainPedal ? 3.0 : 1.6, 0.85);
        setPressedKeys((prev) => new Set([...prev, fullNote]));

        setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(fullNote);
            return next;
          });
        }, 500);
      }, idx * 25);
    });
  };

  // Play chord notes as sequential upward arpeggio
  const playChordArpeggio = () => {
    if (!chordDef || isPlayingArp) return;
    setIsPlayingArp(true);

    const keys = [...chordDef.pianoKeys];
    // Add octave root on top
    keys.push(chordDef.pianoKeys[0]);

    keys.forEach((pitchClass, idx) => {
      const noteName = CHROMATIC_SCALE[pitchClass];
      const isTopRoot = idx === keys.length - 1;
      const oct = isTopRoot ? baseOctave + 1 : pitchClass < chordDef.pianoKeys[0] ? baseOctave + 1 : baseOctave;
      const fullNote = `${noteName}${oct}`;

      setTimeout(() => {
        audioSynth.playNote(fullNote, 'grand_piano', 2.0, 0.9);
        setPressedKeys((prev) => new Set([...prev, fullNote]));

        setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(fullNote);
            return next;
          });
        }, 350);

        if (idx === keys.length - 1) {
          setTimeout(() => setIsPlayingArp(false), 400);
        }
      }, idx * 160);
    });
  };

  // Build key array structure for octaves
  const WHITE_NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const BLACK_NOTE_SPECS: { note: string; leftOffset: number; pitchClass: number }[] = [
    { note: 'C#', leftOffset: 1, pitchClass: 1 },
    { note: 'D#', leftOffset: 2, pitchClass: 3 },
    { note: 'F#', leftOffset: 4, pitchClass: 6 },
    { note: 'G#', leftOffset: 5, pitchClass: 8 },
    { note: 'A#', leftOffset: 6, pitchClass: 10 },
  ];

  const octavesList = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < octaveSpan; i++) {
      list.push(baseOctave + i);
    }
    return list;
  }, [baseOctave, octaveSpan]);

  // Formatted list of notes in the active chord for header banner
  const chordNotesFormatted = useMemo(() => {
    if (!chordDef) return [];
    return chordDef.pianoKeys.map((pc) => ({
      note: CHROMATIC_SCALE[pc],
      ...getIntervalRole(pc),
    }));
  }, [chordDef, getIntervalRole]);

  return (
    <div className="flex-1 flex flex-col gap-3.5 text-slate-100 select-none">
      {/* 1. CHORD QUICK SELECTOR STRIP */}
      {songChords.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-drobne font-bold text-amber-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Music className="w-3 h-3" /> Akordy písně:
          </span>
          <div className="flex items-center gap-1.5 flex-nowrap">
            {songChords.map((chordName) => {
              const isSelected = selectedChord === chordName;
              return (
                <button
                  key={chordName}
                  onClick={() => handleSelectChord(chordName)}
                  className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30 scale-105'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border-white/10 hover:border-white/20'
                  }`}
                  title={`Zobrazit akord ${chordName} na klaviatuře`}
                >
                  {chordName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. CHORD ANALYSIS & PLAYBACK TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-inner">
        {/* Left: Active Chord Info & Notes */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-mono font-black text-base shadow-sm">
            {selectedChord || '—'}
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>{chordDef ? `${chordDef.name} (${chordDef.type})` : 'Zvolte akord'}</span>
              {songKey && (
                <span className="text-stitek px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  Tónina: {songKey}
                </span>
              )}
            </div>
            {/* Chord tones pills */}
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {chordNotesFormatted.map((n, idx) => (
                <span
                  key={idx}
                  className={`text-stitek px-1.5 py-0.5 rounded-md font-mono font-bold border ${n.color}`}
                  title={n.role}
                >
                  {n.note} ({n.label})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Sound Controls & Octave Config */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Play Chord Button */}
          <button
            onClick={() => playChordPreview(selectedChord || 'C')}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            title="Přehrát akord"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Akord</span>
          </button>

          {/* Play Arpeggio Button */}
          <button
            onClick={playChordArpeggio}
            disabled={isPlayingArp}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Přehrát rozložený akord (arpeggio)"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isPlayingArp ? 'animate-spin' : ''}`} />
            <span>Arpeggio</span>
          </button>

          {/* Octave Range Selector */}
          <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-drobne text-slate-400 font-medium">Oktáva:</span>
            <button
              onClick={() => setBaseOctave((o) => Math.max(2, o - 1))}
              className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white font-bold rounded cursor-pointer"
            >
              -
            </button>
            <span className="font-mono font-bold text-amber-400 w-4 text-center">{baseOctave}</span>
            <button
              onClick={() => setBaseOctave((o) => Math.min(6, o + 1))}
              className="w-5 h-5 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white font-bold rounded cursor-pointer"
            >
              +
            </button>
          </div>

          {/* Display Mode Toggle */}
          <div className="flex items-center bg-black/40 p-0.5 rounded-xl border border-slate-800 text-drobne">
            <button
              onClick={() => setDisplayMode('both')}
              className={`px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                displayMode === 'both' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
              title="Zobrazit tóny i intervaly"
            >
              Tóny &amp; R
            </button>
            <button
              onClick={() => setDisplayMode('notes')}
              className={`px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                displayMode === 'notes' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
              title="Zobrazit pouze názvy tónů"
            >
              Pouze tóny
            </button>
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE PIANO KEYBOARD STAGE */}
      <div className="bg-[#0b0f19] border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col items-center justify-center overflow-x-auto min-h-[220px] relative">
        <div className="flex relative select-none shadow-2xl rounded-2xl overflow-hidden p-1 bg-[#151b2b] border border-slate-800">
          {octavesList.map((oct) => (
            <div key={oct} className="flex relative">
              {/* WHITE KEYS */}
              {WHITE_NOTE_NAMES.map((k) => {
                const noteName = `${k}${oct}`;
                const pitchClass = CHROMATIC_SCALE.indexOf(k);
                const isChordNote = activePitchClasses.has(pitchClass);
                const isDown = pressedKeys.has(noteName);
                const intervalInfo = isChordNote ? getIntervalRole(pitchClass) : null;
                const isRoot = intervalInfo?.label === 'R';

                return (
                  <button
                    key={noteName}
                    onClick={() => playKey(noteName)}
                    className={`w-10 sm:w-12 h-40 sm:h-44 rounded-b-xl border border-neutral-800/80 font-bold flex flex-col justify-between items-center pb-2.5 pt-2 cursor-pointer transition-all duration-75 relative group ${
                      isDown
                        ? 'bg-amber-400 text-slate-950 translate-y-1.5 shadow-inner'
                        : isChordNote
                        ? isRoot
                          ? 'bg-gradient-to-b from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200 text-slate-950 border-amber-400 shadow-[0_4px_15px_rgba(245,158,11,0.25)] ring-2 ring-amber-400/40'
                          : 'bg-gradient-to-b from-slate-100 to-amber-50/70 hover:from-white hover:to-amber-100 text-slate-900 border-amber-300/60 shadow-[0_4px_10px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/30'
                        : 'bg-gradient-to-b from-white via-slate-100 to-slate-200 hover:bg-slate-100 text-neutral-700'
                    }`}
                  >
                    {/* Top Active LED bar */}
                    <div className="w-full px-1">
                      {isChordNote ? (
                        <div className={`h-1.5 rounded-full ${isRoot ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : 'bg-emerald-500'}`} />
                      ) : (
                        <div className="h-1.5 opacity-0" />
                      )}
                    </div>

                    {/* Middle Interval Badge */}
                    <div className="flex flex-col items-center gap-1">
                      {isChordNote && intervalInfo && (
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-black text-stitek border shadow-md transition-transform group-hover:scale-110 ${intervalInfo.color}`}
                        >
                          {intervalInfo.label}
                        </div>
                      )}
                    </div>

                    {/* Bottom Key Note Name */}
                    <span className="font-mono text-drobne font-bold tracking-tight">
                      {displayMode === 'intervals' && intervalInfo ? intervalInfo.label : `${k}${oct}`}
                    </span>
                  </button>
                );
              })}

              {/* BLACK KEYS */}
              {BLACK_NOTE_SPECS.map(({ note, leftOffset, pitchClass }) => {
                const noteName = `${note}${oct}`;
                const isChordNote = activePitchClasses.has(pitchClass);
                const isDown = pressedKeys.has(noteName);
                const intervalInfo = isChordNote ? getIntervalRole(pitchClass) : null;
                const isRoot = intervalInfo?.label === 'R';

                // Calculate horizontal position relative to white keys (w-10 = 40px, sm:w-12 = 48px)
                // Responsive calculation:
                const leftPercent = ((leftOffset) / 7) * 100;

                return (
                  <button
                    key={noteName}
                    onClick={(e) => {
                      e.stopPropagation();
                      playKey(noteName);
                    }}
                    style={{
                      left: `calc(${leftPercent}% - 14px)`,
                    }}
                    className={`absolute top-0 w-7 sm:w-8 h-26 sm:h-28 rounded-b-lg font-bold flex flex-col justify-between items-center pb-2 pt-1.5 cursor-pointer z-10 transition-all duration-75 shadow-2xl group ${
                      isDown
                        ? 'bg-amber-400 text-slate-950 translate-y-1 shadow-inner'
                        : isChordNote
                        ? isRoot
                          ? 'bg-gradient-to-b from-amber-600 via-amber-700 to-amber-950 text-white border-2 border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.6)] ring-2 ring-amber-400/50'
                          : 'bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 text-amber-400 border border-amber-400/80 shadow-[0_0_12px_rgba(245,158,11,0.4)] ring-1 ring-amber-400/40'
                        : 'bg-gradient-to-b from-neutral-800 via-neutral-900 to-black text-slate-400 border border-neutral-700 hover:bg-neutral-800'
                    }`}
                  >
                    {/* Top Glow Bar */}
                    <div className="w-full px-1">
                      {isChordNote ? (
                        <div className={`h-1 rounded-full ${isRoot ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : 'bg-emerald-400'}`} />
                      ) : (
                        <div className="h-1 opacity-0" />
                      )}
                    </div>

                    {/* Middle Interval Badge */}
                    <div className="flex flex-col items-center">
                      {isChordNote && intervalInfo && (
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-black text-stitek border shadow-md transition-transform group-hover:scale-110 ${intervalInfo.color}`}
                        >
                          {intervalInfo.label}
                        </div>
                      )}
                    </div>

                    {/* Bottom Note Name */}
                    <span className="font-mono text-stitek font-bold text-center tracking-tighter">
                      {displayMode === 'intervals' && intervalInfo ? intervalInfo.label : note}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend Footnote */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-drobne text-slate-400 border-t border-slate-800/80 pt-3 w-full">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 border border-amber-300 inline-block"></span>
            <span className="font-semibold text-slate-300">Základní tón (Root)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border border-emerald-300 inline-block"></span>
            <span className="font-semibold text-slate-300">Tercie (3 / m3)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-blue-500 border border-blue-300 inline-block"></span>
            <span className="font-semibold text-slate-300">Kvinta (5)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-fuchsia-500 border border-fuchsia-300 inline-block"></span>
            <span className="font-semibold text-slate-300">Septima &amp; Rozšíření (7 / 9)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
