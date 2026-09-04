import React, { useState } from 'react';
import { GuitarChordDiagram } from './GuitarChordDiagram';
import { findOrGenerateChord, generateChordVariations } from '../utils/chordUtils';
import { audioSynth } from '../services/audioSynth';
import { X, Volume2, Music, BookOpen, Zap } from 'lucide-react';

const ROOT_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

interface ChordDetailModalProps {
  chordName: string | null;
  onClose: () => void;
}

export const ChordDetailModal: React.FC<ChordDetailModalProps> = ({
  chordName,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'guitar' | 'variations' | 'piano'>('guitar');

  if (!chordName) return null;

  const chordDef = findOrGenerateChord(chordName);
  const variations = generateChordVariations(chordName);

  const handlePlayGuitar = (frets = chordDef.frets) => {
    audioSynth.playGuitarChord(frets);
  };

  const handlePlayPiano = () => {
    audioSynth.playPianoChord(chordDef.pianoKeys, 4);
  };

  const handlePlayPianoNote = (keyIdx: number) => {
    const midi = 60 + keyIdx;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    audioSynth.playPianoNote(freq, 1.8, 0.6);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#0A0A0A] border-2 border-[#FF3E00] w-full max-w-xl p-4 sm:p-5 space-y-4 font-mono shadow-2xl relative my-auto max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222] pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="bg-[#FF3E00] text-black font-extrabold px-2 py-0.5 text-stitek uppercase">
              DETAIL AKORDU
            </span>
            <h3 className="text-lg font-black text-white tracking-wider">
              {chordDef.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#888] hover:text-white hover:bg-[#222] transition-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instrument & Variations Switcher Tabs */}
        <div className="flex items-center bg-[#050505] p-1 border border-[#222] gap-1 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('guitar')}
            className={`flex-1 py-1.5 px-2 text-drobne font-extrabold uppercase transition-none flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'guitar'
                ? 'bg-[#FF3E00] text-black'
                : 'text-[#888] hover:text-white'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>KYTARA</span>
          </button>
          <button
            onClick={() => setActiveTab('variations')}
            className={`flex-1 py-1.5 px-2 text-drobne font-extrabold uppercase transition-none flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'variations'
                ? 'bg-[#FFD700] text-black'
                : 'text-[#888] hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-black" />
            <span>VARIACE &amp; BARRE</span>
          </button>
          <button
            onClick={() => setActiveTab('piano')}
            className={`flex-1 py-1.5 px-2 text-drobne font-extrabold uppercase transition-none flex items-center justify-center gap-1.5 whitespace-nowrap ${
              activeTab === 'piano'
                ? 'bg-[#00FF41] text-black'
                : 'text-[#888] hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>KLAVÍR</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-[#333]">
          {activeTab === 'guitar' && (
            <div className="flex flex-col items-center justify-center bg-[#050505] p-4 border border-[#222] space-y-3">
              <GuitarChordDiagram
                chord={chordDef}
                size="lg"
                showTitle={false}
                showPlayButton={false}
              />
              <p className="text-stitek text-[#888] text-center uppercase font-bold">
                ZÁKLADNÍ POLOHA AKORDU NA KYTAROVÉM HMATNÍKU
              </p>
            </div>
          )}

          {activeTab === 'variations' && (
            <div className="space-y-3 bg-[#050505] p-3 border border-[#222]">
              <div className="border-b border-[#222] pb-2">
                <h4 className="text-xs font-black uppercase text-[#FFD700] flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-[#FFD700]" />
                  POMŮCKA PRO KYTARISTY: VARIACE &amp; BARRE HMATY PRO {chordDef.name}
                </h4>
                <p className="text-stitek text-[#888] mt-0.5">
                  Vyberte si alternativní pozici na hmatníku kytary, abyste nehráli stále stejné základní akordy.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {variations.map((v) => (
                  <div
                    key={v.id}
                    className="bg-[#111] border border-[#222] hover:border-[#FFD700] p-2.5 flex flex-col justify-between space-y-2 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-[#222] pb-1 mb-1.5">
                        <span className="text-stitek font-black uppercase text-[#FFD700]">
                          {v.label}
                        </span>
                        {v.chord.barreFret && (
                          <span className="text-stitek bg-[#FF3E00] text-black font-extrabold px-1.5 py-0.2 uppercase">
                            BARRE {v.chord.barreFret}. FR
                          </span>
                        )}
                      </div>
                      <p className="text-stitek text-[#AAA] mb-2 leading-tight">
                        {v.description}
                      </p>
                      <div className="flex justify-center my-1">
                        <GuitarChordDiagram
                          chord={v.chord}
                          size="sm"
                          showTitle={false}
                          showPlayButton={false}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => handlePlayGuitar(v.chord.frets)}
                      className="w-full py-1.5 bg-[#1C1A00] hover:bg-[#FFD700] text-[#FFD700] hover:text-black border border-[#FFD700] text-stitek font-black uppercase flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>PŘEHRÁT VARIACI</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'piano' && (
            <div className="bg-[#050505] p-3 border border-[#222] space-y-2">
              <div className="flex items-center justify-between text-stitek text-[#AAA] font-bold uppercase border-b border-plocha-2 pb-1">
                <span>KLÁVESNICE PIANA (1.5 OKTÁVY)</span>
                <span className="text-[#00FF41]">
                  TÓNY: {chordDef.pianoKeys.map((k) => ROOT_NOTES[k % 12]).join(' - ')}
                </span>
              </div>

              <div className="flex justify-center py-2 overflow-x-auto">
                <div className="relative flex h-28 bg-[#000] p-1.5 border border-[#333]">
                  {Array.from({ length: 16 }).map((_, keyIdx) => {
                    const noteMidi = keyIdx % 12;
                    const noteName = ROOT_NOTES[noteMidi];
                    const isBlackKey = noteName.includes('#') || noteName.includes('b');
                    const isHighlighted = chordDef.pianoKeys.includes(noteMidi);
                    const isRoot = noteName === chordDef.root;

                    if (isBlackKey) {
                      return (
                        <button
                          key={keyIdx}
                          onClick={() => handlePlayPianoNote(keyIdx)}
                          className={`w-5 h-16 -mx-2.5 z-10 border border-black flex flex-col justify-end items-center pb-1 transition-none active:scale-95 ${
                            isHighlighted
                              ? isRoot
                                ? 'bg-[#FF3E00] text-black font-black'
                                : 'bg-[#00FF41] text-black font-black'
                              : 'bg-[#111] text-[#444]'
                          }`}
                          title={`Tón ${noteName}`}
                        >
                          {isHighlighted && <span className="text-stitek font-mono">{noteName}</span>}
                        </button>
                      );
                    }

                    return (
                      <button
                        key={keyIdx}
                        onClick={() => handlePlayPianoNote(keyIdx)}
                        className={`w-7 h-24 border border-[#222] flex flex-col justify-end items-center pb-1 font-mono text-stitek font-bold transition-none active:scale-95 ${
                          isHighlighted
                            ? isRoot
                              ? 'bg-[#FF3E00] text-black font-black'
                              : 'bg-[#00FF41] text-black font-black'
                            : 'bg-[#D1D1D1] text-black'
                        }`}
                        title={`Tón ${noteName}`}
                      >
                        {noteName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Details */}
        <div className="space-y-1 text-xs text-[#AAA] border-t border-[#222] pt-2 shrink-0">
          <div className="flex justify-between border-b border-plocha-2 py-0.5">
            <span className="text-[#666] uppercase text-stitek">Základní tón:</span>
            <span className="text-white font-bold">{chordDef.root}</span>
          </div>
          <div className="flex justify-between border-b border-plocha-2 py-0.5">
            <span className="text-[#666] uppercase text-stitek">Typ akordu:</span>
            <span className="text-white font-bold">{chordDef.type}</span>
          </div>
          <div className="flex justify-between border-b border-plocha-2 py-0.5">
            <span className="text-[#666] uppercase text-stitek">Tóny:</span>
            <span className="text-[#00FF41] font-mono font-bold">
              {chordDef.pianoKeys.map((k) => ROOT_NOTES[k % 12]).join(', ')}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1 shrink-0">
          <button
            onClick={() => handlePlayGuitar()}
            className="py-2 px-2 bg-[#FF3E00] hover:bg-white text-black font-extrabold text-drobne uppercase flex items-center justify-center gap-1.5 transition-none"
          >
            <Volume2 className="w-3.5 h-3.5 text-black" />
            <span>KYTARA AKORD</span>
          </button>

          <button
            onClick={handlePlayPiano}
            className="py-2 px-2 bg-[#00FF41] hover:bg-white text-black font-black text-drobne uppercase flex items-center justify-center gap-1.5 transition-none"
          >
            <Volume2 className="w-3.5 h-3.5 text-black" />
            <span>KLAVÍR AKORD</span>
          </button>
        </div>
      </div>
    </div>
  );
};
