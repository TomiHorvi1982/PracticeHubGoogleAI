import React, { useState, useEffect } from 'react';
import { CHORDS_DATABASE, SCALES_DATABASE } from '../data/chordsAndScales';
import { audioSynth, midiToNoteName, InstrumentProfile } from '../services/audioSynth';
import { ALL_INSTRUMENTS } from '../data/instrumentPresets';
import { midiService } from '../services/midiService';
import { Grid, Volume2, Info, BookOpen, Zap } from 'lucide-react';
import { useMusicalContext } from '../context/MusicalContext';
import { eventBus } from '../services/eventBus';
import { findOrGenerateChord } from '../utils/chordUtils';

const ROOT_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const GUITAR_STRINGS = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];
const STRING_BASE_MIDIS = [64, 59, 55, 50, 45, 40];

interface ChordScaleExplorerProps {
  /**
   * Když si režim řídí stránka nad průzkumníkem — hmatník má Akordy a
   * Stupnice jako vlastní podsekce — předá se sem. Bez toho si ho drží
   * komponenta sama a chová se přesně jako dřív.
   */
  mode?: 'chord' | 'scale';
  onModeChange?: (m: 'chord' | 'scale') => void;
  /** Skryje vlastní hlavičku i přepínač, když je přepínač už nad ním. */
  compact?: boolean;
  /**
   * Stupnice nalezená jinde — třeba poslechem kytary z mikrofonu.
   *
   * Průzkumník si výběr jinak drží sám; tohle je způsob, jak mu ho
   * podat zvenčí, aniž by o poslechu cokoli věděl. Mění se s každým
   * nálezem, proto nese i pořadové číslo — jinak by druhý nález téže
   * stupnice nic nepřepnul.
   */
  navrh?: { ton: string; stupnice: string; poradi: number };
  /**
   * Tón, který zrovna zní — z mikrofonu, s oktávou (třeba „E4").
   *
   * Vyznačí se na hmatníku, aby bylo z monitoru vidět, co se zrovna
   * mačká. Výška sama neurčí strunu: tentýž tón se dá zahrát na několika
   * místech, takže se označí všechna a nelže se o tom, které to bylo.
   */
  znejiciTon?: string | null;
}

export const ChordScaleExplorer: React.FC<ChordScaleExplorerProps> = ({
  mode,
  onModeChange,
  compact,
  navrh,
  znejiciTon,
}) => {
  const { activeChord, key } = useMusicalContext();
  const [selectedRoot, setSelectedRoot] = useState('C');

  /**
   * Kterou kytarou hmatník zní.
   *
   * Dřív se sáhlo po starém označení `acoustic_guitar`, které v katalogu
   * není — a syntetizátor kvůli tomu spadl na výchozí zvuk, tedy klavír.
   * Katalog jich má čtrnáct od španělky po palm mute, tak ať jde vybrat.
   */
  const KYTARY = ALL_INSTRUMENTS.filter((i) => i.category === 'guitars_plucked');
  const [zvukKytary, setZvukKytary] = useState<InstrumentProfile>(() => {
    const ulozeny = localStorage.getItem('neverlate_zvuk_hmatniku');
    return (ulozeny && KYTARY.some((k) => k.id === ulozeny)
      ? ulozeny
      : 'acoustic_dreadnought') as InstrumentProfile;
  });
  const [vlastniRezim, setVlastniRezim] = useState<'chord' | 'scale'>('chord');
  const explorerMode = mode ?? vlastniRezim;
  const setExplorerMode = (m: 'chord' | 'scale') => (onModeChange ? onModeChange(m) : setVlastniRezim(m));
  const [selectedChordType, setSelectedChordType] = useState('Major');
  const [selectedScaleName, setSelectedScaleName] = useState('Minor Pentatonic');
  const [enableMidiScaleFilter, setEnableMidiScaleFilter] = useState(true);

  // Sync with global activeChord from context
  useEffect(() => {
    if (activeChord) {
      const def = findOrGenerateChord(activeChord);
      if (def && def.root) {
        let normRoot = def.root;
        if (normRoot === 'D#') normRoot = 'Eb';
        if (normRoot === 'A#') normRoot = 'Bb';
        if (ROOT_NOTES.includes(normRoot)) {
          setSelectedRoot(normRoot);
        }
        if (def.type) setSelectedChordType(def.type);
      }
    }
  }, [activeChord]);

  // Sync with eventBus CHORD_SELECTED
  useEffect(() => {
    const unsub = eventBus.on('CHORD_SELECTED', (data) => {
      if (data && data.chordName) {
        const def = findOrGenerateChord(data.chordName);
        if (def && def.root) {
          let normRoot = def.root;
          if (normRoot === 'D#') normRoot = 'Eb';
          if (normRoot === 'A#') normRoot = 'Bb';
          if (ROOT_NOTES.includes(normRoot)) {
            setSelectedRoot(normRoot);
          }
          if (def.type) setSelectedChordType(def.type);
        }
      }
    });
    return unsub;
  }, []);

  /**
   * Názvy stupnic z `tonal` na názvy v naší databázi.
   *
   * `tonal` vrací „E minor" nebo „E major pentatonic"; průzkumník zná
   * „Natural Minor (Eolská)". Bez převodu by se nález nedal ukázat.
   */
  React.useEffect(() => {
    if (!navrh) return;
    const n = navrh.stupnice.toLowerCase();
    const nazev =
      n.includes('minor pentatonic') ? 'Minor Pentatonic'
      : n.includes('major pentatonic') ? 'Major Pentatonic'
      : n.includes('blues') ? 'Blues Scale'
      : n.includes('harmonic minor') ? 'Harmonic Minor'
      : n.includes('dorian') ? 'Dorian Mode'
      : n.includes('mixolydian') ? 'Mixolydian Mode'
      : n.includes('minor') ? 'Natural Minor (Eolská)'
      : n.includes('major') || n.includes('ionian') ? 'Major (Ionská)'
      : null;
    // Stupnici, kterou průzkumník nezná, radši nechá být, než aby ukázal
    // jinou — chybný hmat je horší než žádný.
    if (!nazev) return;
    setSelectedRoot(navrh.ton);
    setSelectedScaleName(nazev);
    setExplorerMode('scale');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navrh?.poradi]);

  /**
   * Zahraje jeden tón z hmatníku.
   *
   * Bere skutečnou výšku podle struny a pražce, ne jen název tónu —
   * E na prázdné šesté struně a E na dvanáctém pražci první jsou dvě
   * oktávy od sebe a hmatník by bez toho zněl celý stejně.
   */
  const zahrajPrazec = (zakladStruny: number, prazec: number) => {
    audioSynth.playNote(midiToNoteName(zakladStruny + prazec), zvukKytary, 1.6, 0.7, 0.85);
  };

  /** Znějící tón jako číslo MIDI; `null`, když nic nezní. */
  const znejiciMidi = React.useMemo(() => {
    if (!znejiciTon) return null;
    const m = /^([A-G])(#|b)?(-?\d+)$/.exec(znejiciTon.trim());
    if (!m) return null;
    const zaklad: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const posun = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return (Number(m[3]) + 1) * 12 + zaklad[m[1]] + posun;
  }, [znejiciTon]);

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
    // Zvuk se bere z výběru nad hmatníkem, aby akord i jednotlivé tóny
    // zněly týmž nástrojem — jinak by hmatník hrál jednou španělku
    // a podruhé něco jiného.
    if (explorerMode === 'chord' && chordDef) {
      const struny = [64, 59, 55, 50, 45, 40];
      chordDef.frets.forEach((prazec, i) => {
        if (prazec < 0) return;
        const zaklad = struny[5 - i];
        setTimeout(() => {
          audioSynth.playNote(midiToNoteName(zaklad + prazec), zvukKytary, 2.2, 0.6, 0.8);
        }, i * 45);
      });
    } else {
      scaleMidiNotes.forEach((midiOffset, idx) => {
        setTimeout(() => {
          audioSynth.playNote(midiToNoteName(midiOffset + 60), zvukKytary, 1.2, 0.5, 0.8);
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
    <div className={`w-full space-y-4 font-sans ${compact ? "" : "pb-16"}`}>
      
      {/* Control Panel: Header & Mode Selection */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
        
        <div className={`flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-4 ${compact ? "hidden" : "flex"}`}>
          {!compact && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-znacka text-black font-semibold px-2 py-0.5 text-stitek rounded-md uppercase tracking-wide">
                Harmonie & Teorie
              </span>
              <span className="text-xs text-neutral-400 font-medium">Interaktivní průzkumník</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Knihovna Akordů & Stupnic
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Hmatník kytary, klaviatura a zvukové ukázky s podporou filtru tónin pro hardware MIDI klávesy.
            </p>
          </div>
          )}

          {/* Mode Switcher */}
          <div className={`items-center bg-white/[0.04] p-1 rounded-2xl border border-white/[0.06] self-start md:self-auto ${compact ? 'hidden' : 'flex'}`}>
            <button
              onClick={() => setExplorerMode('chord')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                explorerMode === 'chord'
                  ? 'bg-white/15 text-white shadow-sm border border-white/10'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Akordy
            </button>
            <button
              onClick={() => setExplorerMode('scale')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                explorerMode === 'scale'
                  ? 'bg-white/15 text-white shadow-sm border border-white/10'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Stupnice & Sóla
            </button>
          </div>
        </div>

        {/* Root Note Picker */}
        <div>
          <label className="block text-drobne font-semibold text-neutral-400 mb-2 uppercase tracking-wider">
            Základní tón (Root Note)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ROOT_NOTES.map((note) => (
              <button
                key={note}
                onClick={() => setSelectedRoot(note)}
                className={`w-10 h-10 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center ${
                  selectedRoot === note
                    ? 'bg-znacka text-black font-extrabold shadow-md shadow-orange-500/20 scale-105'
                    : 'bg-black/40 hover:bg-white/10 text-white border border-white/10'
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
            <label className="block text-drobne font-semibold text-neutral-400 mb-2 uppercase tracking-wider">
              Typ akordu
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['Major', 'Minor', 'Dom 7', 'Maj 7', 'Min 7', 'Sus4', 'Sus2', 'Power'].map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedChordType(type)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    selectedChordType === type
                      ? 'bg-uspech/20 border border-uspech text-uspech shadow-sm'
                      : 'bg-black/40 hover:bg-white/10 text-neutral-300 border border-white/10'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-drobne font-semibold text-neutral-400 uppercase tracking-wider">
                Vybrat stupnici
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableMidiScaleFilter}
                  onChange={(e) => setEnableMidiScaleFilter(e.target.checked)}
                  className="accent-znacka rounded"
                />
                <span>Filtrovat hardware MIDI klávesy podle stupnice</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              {SCALES_DATABASE.map((sc) => (
                <button
                  key={sc.name}
                  onClick={() => setSelectedScaleName(sc.name)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    selectedScaleName === sc.name
                      ? 'bg-uspech/15 border-uspech text-white shadow-sm'
                      : 'bg-black/40 hover:bg-white/10 border-white/10 text-neutral-300'
                  }`}
                >
                  <p className="font-bold text-xs text-white">{sc.czName}</p>
                  <p className="text-stitek text-neutral-400 font-mono mt-0.5">{sc.name}</p>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Main Interactive Guitar Fretboard */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              {explorerMode === 'chord'
                ? `Hmatník: Akord ${selectedRoot} ${selectedChordType}`
                : `Hmatník: Stupnice ${selectedRoot} ${currentScale.czName}`}
            </h3>
            <p className="text-drobne text-neutral-400 mt-0.5">
              Pozice 0 až 14 na kytarovém krku (oranžový bod = kořenový tón)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Výběr kytary. Patří k tlačítkům pro přehrání, protože
                rozhoduje o tom, co se zrovna ozve. */}
            <select
              value={zvukKytary}
              onChange={(e) => {
                const v = e.target.value as InstrumentProfile;
                setZvukKytary(v);
                localStorage.setItem('neverlate_zvuk_hmatniku', v);
                // Zvuky se stahují po prvním použití; předběžné načtení
                // ušetří ticho při prvním kliknutí na pražec.
                void audioSynth.preloadInstrument(v);
              }}
              className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-neutral-200 cursor-pointer max-w-[220px]"
              title="Kterou kytarou hmatník zní"
            >
              {KYTARY.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.czName}
                </option>
              ))}
            </select>
            <button
              onClick={playGuitarAudio}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-uspech border border-uspech/40 font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
              title="Přehrát akord na kytaru"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Přehrát kytaru</span>
            </button>
            <button
              onClick={playPianoAudio}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-uspech hover:bg-uspech/90 text-black font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
              title="Přehrát akord na piano (reálný klavírní zvuk)"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Přehrát klavír</span>
            </button>
          </div>
        </div>

        {/* Fretboard Graphic Box */}
        <div className="bg-black/50 p-4 rounded-2xl border border-white/10 overflow-x-auto shadow-inner">
          
          {/* Fret Numbers Header */}
          <div className="grid grid-cols-16 min-w-[700px] text-center text-stitek font-mono text-neutral-400 font-bold mb-2">
            <span>STRUNA</span>
            <span>0</span>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className={i + 1 === 3 || i + 1 === 5 || i + 1 === 7 || i + 1 === 9 || i + 1 === 12 ? 'text-znacka font-extrabold' : ''}>
                {i + 1}
              </span>
            ))}
          </div>

          {/* 6 Guitar Strings Fretboard Grid */}
          <div className="space-y-1.5 min-w-[700px]">
            {GUITAR_STRINGS.map((stringLabel, stringIdx) => {
              const baseMidi = STRING_BASE_MIDIS[stringIdx];

              return (
                <div key={stringIdx} className="grid grid-cols-16 items-center gap-0 border-b border-white/[0.04] pb-1">
                  
                  {/* String Label */}
                  <span className="font-mono text-xs font-semibold text-neutral-400 w-10">
                    {stringLabel}
                  </span>

                  {/* Frets 0 to 14 */}
                  {Array.from({ length: 15 }).map((_, fret) => {
                    const noteMidi = (baseMidi + fret) % 12;
                    const noteName = ROOT_NOTES[noteMidi];
                    const isRoot = noteName === selectedRoot;
                    // Přesná shoda výšky, ne jen názvu tónu — jinak by se
                    // rozsvítil celý hmatník od prázdné struny po dvanáctý
                    // pražec a nebylo by z toho nic poznat.
                    const zrovnaZni = znejiciMidi !== null && baseMidi + fret === znejiciMidi;

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
                        className={`h-8 border-r border-white/10 flex items-center justify-center relative ${
                          fret === 0 ? 'bg-white/[0.04] border-r-2 border-znacka' : ''
                        } ${zrovnaZni ? 'bg-uspech/20' : ''}`}
                      >
                        {/* String Line Background */}
                        <div className="absolute inset-x-0 h-[1.5px] bg-white/20 z-0"></div>

                        {/* Co zrovna zní. Ukazuje se i mimo stupnici —
                            když člověk sáhne vedle, má to být vidět. */}
                        {zrovnaZni && !isHighlighted && (
                          <div
                            className="w-5 h-5 rounded-full border-2 border-uspech z-10 animate-pulse"
                            title={`Zrovna zní ${znejiciTon}`}
                          />
                        )}

                        {/* Note Marker */}
                        {isHighlighted && (
                          <button
                            onClick={() => zahrajPrazec(baseMidi, fret)}
                            className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-stitek font-mono z-10 shadow-md cursor-pointer transition-transform hover:scale-125 active:scale-95 ${
                              zrovnaZni
                                ? 'bg-uspech text-black ring-2 ring-white scale-125'
                                : isRoot
                                ? 'bg-znacka text-black shadow-[0_0_10px_#FF9F0A]'
                                : isChordFret
                                ? 'bg-uspech text-black shadow-[0_0_8px_#30D158]'
                                : 'bg-white text-black'
                            }`}
                            title={`Zahrát ${noteName} na ${fret}. pražci`}
                          >
                            {noteName}
                          </button>
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
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-znacka" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Klávesnice Klavíru (2 Oktávy)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {explorerMode === 'chord' && chordDef && (
              <span className="text-drobne text-neutral-400 bg-white/[0.04] px-3 py-1 rounded-xl border border-white/[0.06]">
                Tóny: <strong className="text-uspech">{chordDef.pianoKeys.map((k) => ROOT_NOTES[k % 12]).join(' - ')}</strong>
              </span>
            )}
            <button
              onClick={playPianoAudio}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-uspech hover:bg-uspech/90 text-black font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
              title="Přehrát kompletní akord na reálné piano"
            >
              <Volume2 className="w-3.5 h-3.5 text-black" />
              <span>Přehrát akord</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-neutral-400">
          Klikněte na libovolnou klávesu pro zahrání tónu nebo použijte tlačítko vpravo pro přehrání celého akordu.
        </p>

        <div className="flex justify-center overflow-x-auto py-2 scrollbar-thin">
          <div className="relative flex h-36 bg-black/40 p-3 rounded-2xl border border-white/10 shadow-inner">
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
                    className={`w-6 h-20 -mx-3 z-10 rounded-b-md border border-black/80 flex flex-col justify-end items-center pb-1.5 transition-all active:scale-95 cursor-pointer ${
                      isHighlighted
                        ? isRoot
                          ? 'bg-znacka text-black font-extrabold shadow-[0_0_10px_#FF9F0A]'
                          : 'bg-uspech text-black font-extrabold shadow-[0_0_10px_#30D158]'
                        : 'bg-plocha-3 hover:bg-plocha-nad text-neutral-400 hover:text-white'
                    }`}
                    title={`Přehrát tón ${noteName} na piano`}
                  >
                    {isHighlighted && <span className="text-stitek font-mono font-bold">{noteName}</span>}
                  </button>
                );
              }

              return (
                <button
                  key={keyIdx}
                  onClick={() => handlePianoKeyClick(keyIdx)}
                  className={`w-9 h-32 rounded-b-lg border border-neutral-700/50 flex flex-col justify-end items-center pb-2.5 font-mono text-stitek font-bold transition-all active:scale-95 cursor-pointer ${
                    isHighlighted
                      ? isRoot
                        ? 'bg-znacka text-black font-extrabold shadow-[0_0_10px_#FF9F0A]'
                        : 'bg-uspech text-black font-extrabold shadow-[0_0_10px_#30D158]'
                      : 'bg-neutral-200 hover:bg-white text-black'
                  }`}
                  title={`Přehrát tón ${noteName} na piano`}
                >
                  <span className="text-stitek uppercase font-bold">{noteName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Scale Info & Practical Usage in Band */}
      {explorerMode === 'scale' && (
        <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 shadow-xl flex items-start gap-4">
          <div className="p-2.5 bg-znacka/10 border border-znacka/30 text-znacka rounded-2xl shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
              Použití v kapele & sólo hře ({currentScale.czName})
            </h4>
            <p className="text-xs text-neutral-300 leading-relaxed mb-2">
              {currentScale.description}
            </p>
            <p className="text-xs text-uspech font-mono bg-black/40 px-3 py-1.5 rounded-xl border border-white/[0.06] inline-block">
              Tóny stupnice: <strong>{currentScale.intervals.map((inv) => ROOT_NOTES[(rootIndex + inv) % 12]).join(' - ')}</strong>
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
