import React, { useState, useEffect } from 'react';
import { CHORDS_DATABASE, SCALES_DATABASE } from '../data/chordsAndScales';
import { audioSynth } from '../services/audioSynth';
import { midiService } from '../services/midiService';
import { Grid, Volume2, Info, BookOpen, Zap } from 'lucide-react';

const ROOT_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const GUITAR_STRINGS = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];
const STRING_BASE_MIDIS = [64, 59, 55, 50, 45, 40];

export const ChordScaleExplorer: React.FC = () => {
  const [selectedRoot, setSelectedRoot] = useState('C');
  const [explorerMode, setExplorerMode] = useState<'chord' | 'scale'>('chord');
  const [selectedChordType, setSelectedChordType] = useState('Major');
  const [selectedScaleName, setSelectedScaleName] = useState('Minor Pentatonic');
  const [enableMidiScaleFilter, setEnableMidiScaleFilter] = useState(true);

  const currentScale = SCALES_DATABASE.find((s) => s.name === selectedScaleName) || SCALES_DATABASE[2];
  const rootIndex = ROOT_NOTES.indexOf(selectedRoot);

  const scaleMidiNotes = currentScale.intervals.map((interval) => (rootIndex + interval) % 12);

  // Sync active scale to MIDI Hardware Service when exploring scales
  useEffect(() => {
    if (explorerMode === 'scale' && enableMidiScaleFilter) {
      const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const normalizedRoot = selectedRoot === 'Eb' ? 'D#' : selectedRoot === 'Bb' ? 'A#' : selectedRoot;
      const rIdx = chromaticNotes.indexOf(normalizedRoot);
      const allowedRoots = currentScale.intervals.map(
        (interval) => chromaticNotes[((rIdx >= 0 ? rIdx : 0) + interval) % 12]
      );

      midiService.setScaleFilter({
        enabled: true,
        allowedNoteRoots: allowedRoots,
        rootNote: selectedRoot,
        scaleName: currentScale.name,
      });
    }
  }, [explorerMode, enableMidiScaleFilter, selectedRoot, currentScale]);

  const chordDef = CHORDS_DATABASE.find(
    (c) => c.root === selectedRoot && c.type === selectedChordType
  ) || CHORDS_DATABASE.find((c) => c.root === selectedRoot) || CHORDS_DATABASE[0];

  const playGuitarAudio = () => {
    if (explorerMode === 'chord' && chordDef) {
      audioSynth.playGuitarChord(chordDef.frets);
    } else {
      scaleMidiNotes.forEach((midiOffset, idx) => {
        setTimeout(() => {
          const freq = 440 * Math.pow(2, (midiOffset + 60 - 69) / 12);
          audioSynth.playGuitarNote(freq, 1.2, 0.5);
        }, idx * 180);
      });
    }
  };

  const playPianoAudio = () => {
    if (explorerMode === 'chord' && chordDef) {
      audioSynth.playPianoChord(chordDef.pianoKeys, 4);
    } else {
      scaleMidiNotes.forEach((midiOffset, idx) => {
        setTimeout(() => {
          const freq = 440 * Math.pow(2, (midiOffset + 60 - 69) / 12);
          audioSynth.playPianoNote(freq, 1.5, 0.5);
        }, idx * 180);
      });
    }
  };

  const handlePianoKeyClick = (keyIdx: number) => {
    const midi = 60 + keyIdx; // C4 is MIDI 60
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    audioSynth.playPianoNote(freq, 1.8, 0.6);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-4 font-mono pb-12">
      
      {/* Control Panel: Root Note & Mode Selection */}
      <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#222] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#FF3E00] text-black font-black px-2 py-0.5 text-[10px] uppercase">
                EXPLORER
              </span>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                KNIHOVNA AKORDŮ & STUPNIC
              </h2>
            </div>
            <p className="text-[11px] text-[#666] mt-1">
              Interaktivní hmatník kytary a klávesnice s audio simulací
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-[#050505] p-0.5 border border-[#222]">
            <button
              onClick={() => setExplorerMode('chord')}
              className={`px-3 py-1 text-xs font-bold uppercase transition-none ${
                explorerMode === 'chord'
                  ? 'bg-[#D1D1D1] text-black'
                  : 'text-[#888] hover:text-white'
              }`}
            >
              AKORDY
            </button>
            <button
              onClick={() => setExplorerMode('scale')}
              className={`px-3 py-1 text-xs font-bold uppercase transition-none ${
                explorerMode === 'scale'
                  ? 'bg-[#D1D1D1] text-black'
                  : 'text-[#888] hover:text-white'
              }`}
            >
              STUPNICE & SÓLA
            </button>
          </div>
        </div>

        {/* Root Note Picker */}
        <div>
          <label className="block text-[10px] font-bold text-[#666] mb-1.5 uppercase">
            ZÁKLADNÍ TÓN (ROOT NOTE):
          </label>
          <div className="flex flex-wrap gap-1">
            {ROOT_NOTES.map((note) => (
              <button
                key={note}
                onClick={() => setSelectedRoot(note)}
                className={`w-9 h-9 font-bold text-xs transition-none border ${
                  selectedRoot === note
                    ? 'bg-[#FF3E00] text-black border-black font-black'
                    : 'bg-[#050505] hover:bg-[#1A1A1A] text-[#D1D1D1] border-[#222]'
                }`}
              >
                {note}
              </button>
            ))}
          </div>
        </div>

        {/* Type Picker */}
        {explorerMode === 'chord' ? (
          <div>
            <label className="block text-[10px] font-bold text-[#666] mb-1.5 uppercase">
              TYP AKORDU:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['Major', 'Minor', 'Dom 7', 'Maj 7', 'Min 7', 'Sus4', 'Sus2', 'Power'].map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedChordType(type)}
                  className={`px-3 py-1 text-xs font-bold uppercase transition-none border ${
                    selectedChordType === type
                      ? 'bg-[#142618] border-[#00FF41] text-[#00FF41]'
                      : 'bg-[#050505] hover:bg-[#1A1A1A] text-[#D1D1D1] border-[#222]'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[10px] font-bold text-[#666] mb-1.5 uppercase">
              VYBRAT STUPNICI:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1.5">
              {SCALES_DATABASE.map((sc) => (
                <button
                  key={sc.name}
                  onClick={() => setSelectedScaleName(sc.name)}
                  className={`p-2 border text-left transition-none ${
                    selectedScaleName === sc.name
                      ? 'bg-[#142618] border-[#00FF41] text-[#00FF41]'
                      : 'bg-[#050505] hover:bg-[#1A1A1A] border-[#222] text-[#888]'
                  }`}
                >
                  <p className="font-bold text-xs text-white uppercase">{sc.czName}</p>
                  <p className="text-[9px] text-[#666]">{sc.name}</p>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Main Interactive Guitar Fretboard Canvas */}
      <div className="border border-[#333] bg-[#0F0F0F] p-4">
        <div className="flex items-center justify-between mb-3 border-b border-[#222] pb-2">
          <div>
            <h3 className="text-xs font-bold text-white uppercase">
              {explorerMode === 'chord'
                ? `HMATNÍK: AKORD ${selectedRoot} ${selectedChordType}`
                : `HMATNÍK: STUPNICE ${selectedRoot} ${currentScale.czName}`}
            </h3>
            <p className="text-[10px] text-[#666]">
              POZICE 0 AŽ 14 NA KYTAROVÉM KRKU
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={playGuitarAudio}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#141414] hover:bg-[#222] text-[#00FF41] border border-[#00FF41] font-extrabold text-xs uppercase transition-none"
              title="Přehrát akord na kytaru"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>PŘEHRÁT KYTARU</span>
            </button>
            <button
              onClick={playPianoAudio}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#00FF41] hover:bg-white text-black font-black text-xs uppercase transition-none shadow-md"
              title="Přehrát akord na piano (reálný klavírní zvuk)"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>PŘEHRÁT KLAVÍR</span>
            </button>
          </div>
        </div>

        {/* Fretboard Graphic Box */}
        <div className="bg-[#050505] p-3 border border-[#222] overflow-x-auto">
          
          {/* Fret Numbers Header */}
          <div className="grid grid-cols-16 min-w-[700px] text-center text-[10px] font-mono text-[#666] font-bold mb-2">
            <span>STRUNA</span>
            <span>O</span>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className={i + 1 === 3 || i + 1 === 5 || i + 1 === 7 || i + 1 === 9 || i + 1 === 12 ? 'text-[#FF3E00] font-black' : ''}>
                {i + 1}
              </span>
            ))}
          </div>

          {/* 6 Guitar Strings Fretboard Grid */}
          <div className="space-y-1.5 min-w-[700px]">
            {GUITAR_STRINGS.map((stringLabel, stringIdx) => {
              const baseMidi = STRING_BASE_MIDIS[stringIdx];

              return (
                <div key={stringIdx} className="grid grid-cols-16 items-center gap-0 border-b border-[#1A1A1A] pb-1">
                  
                  {/* String Label */}
                  <span className="font-mono text-xs font-bold text-[#666] w-10">
                    {stringLabel}
                  </span>

                  {/* Frets 0 to 14 */}
                  {Array.from({ length: 15 }).map((_, fret) => {
                    const noteMidi = (baseMidi + fret) % 12;
                    const noteName = ROOT_NOTES[noteMidi];
                    const isRoot = noteName === selectedRoot;

                    let isHighlighted = false;
                    let isChordFret = false;

                    if (explorerMode === 'chord' && chordDef) {
                      const chordFretIdx = 5 - stringIdx;
                      const activeFret = chordDef.frets[chordFretIdx];
                      if (activeFret === fret) {
                        isHighlighted = true;
                        isChordFret = true;
                      }
                    } else {
                      if (scaleMidiNotes.includes(noteMidi)) {
                        isHighlighted = true;
                      }
                    }

                    return (
                      <div
                        key={fret}
                        className={`h-7 border-r border-[#222] flex items-center justify-center relative ${
                          fret === 0 ? 'bg-[#111] border-r-2 border-[#FF3E00]' : ''
                        }`}
                      >
                        {/* String Line Background */}
                        <div className="absolute inset-x-0 h-[1px] bg-[#333] z-0"></div>

                        {/* Note Marker */}
                        {isHighlighted && (
                          <div
                            className={`w-5 h-5 flex items-center justify-center font-bold text-[9px] font-mono z-10 ${
                              isRoot
                                ? 'bg-[#FF3E00] text-black font-black'
                                : isChordFret
                                ? 'bg-[#00FF41] text-black'
                                : 'bg-[#D1D1D1] text-black'
                            }`}
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

      {/* Piano Keyboard Visualizer */}
      <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] pb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#00FF41]" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              KLÁVESNICE KLAVÍRU (2 OKTÁVY) - ZOBRAZENÍ AKORDU
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {explorerMode === 'chord' && chordDef && (
              <span className="text-[10px] text-[#AAA] bg-[#050505] px-2 py-0.5 border border-[#222]">
                TÓNY: <strong className="text-[#00FF41]">{chordDef.pianoKeys.map((k) => ROOT_NOTES[k % 12]).join(' - ')}</strong>
              </span>
            )}
            <button
              onClick={playPianoAudio}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#00FF41] hover:bg-white text-black font-extrabold text-xs uppercase transition-none shadow-md"
              title="Přehrát kompletní akord na reálné piano"
            >
              <Volume2 className="w-3.5 h-3.5 text-black" />
              <span>PŘEHRÁT AKORD NA KLAVÍR</span>
            </button>
          </div>
        </div>

        <p className="text-[10px] text-[#666]">
          KLIKNĚTE NA LIBOVOLNOU KLÁVESU PRO SÓLO TÓN NEBO STISKNĚTE TLAČÍTKO VPRAVO PRO PŘEHRÁNÍ CELÉHO AKORDU PRO AKUSTICKÉ PIANO.
        </p>

        <div className="flex justify-center overflow-x-auto py-2 scrollbar-thin scrollbar-thumb-[#333]">
          <div className="relative flex h-36 bg-[#050505] p-2 border border-[#222]">
            {Array.from({ length: 24 }).map((_, keyIdx) => {
              const noteMidi = keyIdx % 12;
              const noteName = ROOT_NOTES[noteMidi];
              const isBlackKey = noteName.includes('#') || noteName.includes('b');
              const isRoot = noteName === selectedRoot;

              const isHighlighted = explorerMode === 'chord'
                ? chordDef?.pianoKeys.includes(noteMidi)
                : scaleMidiNotes.includes(noteMidi);

              if (isBlackKey) {
                return (
                  <button
                    key={keyIdx}
                    onClick={() => handlePianoKeyClick(keyIdx)}
                    className={`w-6 h-20 -mx-3 z-10 border border-black flex flex-col justify-end items-center pb-1 transition-none active:scale-95 ${
                      isHighlighted
                        ? isRoot
                          ? 'bg-[#FF3E00] text-black font-black shadow-[0_0_8px_#FF3E00]'
                          : 'bg-[#00FF41] text-black font-black shadow-[0_0_8px_#00FF41]'
                        : 'bg-[#111] hover:bg-[#222] text-[#555] hover:text-white'
                    }`}
                    title={`Přehrát tón ${noteName} na piano`}
                  >
                    {isHighlighted && <span className="text-[8px] font-mono font-bold">{noteName}</span>}
                  </button>
                );
              }

              return (
                <button
                  key={keyIdx}
                  onClick={() => handlePianoKeyClick(keyIdx)}
                  className={`w-9 h-32 border border-[#222] flex flex-col justify-end items-center pb-2 font-mono text-[9px] font-bold transition-none active:scale-95 ${
                    isHighlighted
                      ? isRoot
                        ? 'bg-[#FF3E00] text-black font-black border-2 border-black shadow-[0_0_8px_#FF3E00]'
                        : 'bg-[#00FF41] text-black font-black border-2 border-black shadow-[0_0_8px_#00FF41]'
                      : 'bg-[#D1D1D1] hover:bg-white text-black'
                  }`}
                  title={`Přehrát tón ${noteName} na piano`}
                >
                  <span className="text-[10px] uppercase font-extrabold">{noteName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scale Info & Practical Usage in Band */}
      {explorerMode === 'scale' && (
        <div className="border border-[#333] bg-[#0F0F0F] p-4 flex items-start gap-3">
          <div className="p-2 bg-[#FF3E00] text-black font-black text-xs shrink-0">
            INFO
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase mb-1">
              POUŽITÍ V KAPELA & SÓLO HŘE
            </h4>
            <p className="text-[11px] text-[#888] leading-relaxed mb-1">
              {currentScale.description}
            </p>
            <p className="text-xs text-[#00FF41] font-mono">
              TÓNY STUPNICE: {currentScale.intervals.map((inv) => ROOT_NOTES[(rootIndex + inv) % 12]).join(' - ')}
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
