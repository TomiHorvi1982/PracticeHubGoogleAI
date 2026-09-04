import React, { useState, useRef } from 'react';
import { Volume2, Zap, Music } from 'lucide-react';
import { findOrGenerateChord, generateChordVariations } from '../utils/chordUtils';
import { audioSynth } from '../services/audioSynth';
import { GuitarChordDiagram } from './GuitarChordDiagram';
import { useMusicalContext } from '../context/MusicalContext';
import { eventBus } from '../services/eventBus';

interface ChordHoverPillProps {
  chordName: string;
  isActiveLine?: boolean;
  fontSize: number;
  onSelectModalChord: (chordName: string) => void;
  className?: string;
}

export const ChordHoverPill: React.FC<ChordHoverPillProps> = ({
  chordName,
  isActiveLine = false,
  fontSize,
  onSelectModalChord,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const { setActiveChord } = useMusicalContext();

  const baseChord = findOrGenerateChord(chordName);
  const variations = generateChordVariations(chordName).slice(0, 3);

  const updatePosition = () => {
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    const placeAbove = rect.top > 230;
    const popupWidth = 320;

    let left = rect.left + rect.width / 2 - popupWidth / 2;
    if (left < 12) left = 12;
    if (left + popupWidth > window.innerWidth - 12) {
      left = window.innerWidth - popupWidth - 12;
    }

    const top = placeAbove ? rect.top - 8 : rect.bottom + 8;
    setPopupPos({ top, left, placeAbove });
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsHovered(true);
    audioSynth.playGuitarChord(baseChord.frets);
    setActiveChord(chordName);
    eventBus.emit('CHORD_SELECTED', { chordName });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    updatePosition();
    setIsHovered(true);
    audioSynth.playGuitarChord(baseChord.frets);
    setActiveChord(chordName);
    eventBus.emit('CHORD_SELECTED', { chordName });
  };

  return (
    <div
      ref={pillRef}
      className={`inline-block my-0.5 relative ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        onClick={handleClick}
        className={`inline-block font-semibold px-2.5 py-0.5 mx-0.5 cursor-pointer rounded-lg border transition-all select-none shadow-sm ${
          isActiveLine
            ? 'bg-znacka text-black border-znacka scale-105 shadow-md z-10 font-bold'
            : 'bg-white/10 text-white hover:bg-znacka hover:text-black border-white/15'
        }`}
        style={{ fontSize: `${Math.max(13, fontSize * 0.92)}px` }}
        title="Najetí nebo kliknutí přehraje zvuk akordu a zobrazí varianty hmatů"
      >
        {chordName}
      </span>

      {/* Floating 3-Variation Mini Preview Popup */}
      {isHovered && popupPos && (
        <div
          style={{
            position: 'fixed',
            top: `${popupPos.top}px`,
            left: `${popupPos.left}px`,
            transform: popupPos.placeAbove ? 'translateY(-100%)' : 'none',
          }}
          className="bg-[#1C1C1E]/95 backdrop-blur-2xl border border-white/20 p-3 shadow-2xl z-[9999] w-[320px] rounded-2xl animate-fade-in pointer-events-auto"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Popup Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Music className="w-4 h-4 text-znacka" /> Akord {chordName}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                audioSynth.playGuitarChord(baseChord.frets);
              }}
              className="text-drobne bg-white/15 hover:bg-white/25 text-white font-medium px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              title="Přehrát základní hmat"
            >
              <Volume2 className="w-3 h-3 text-znacka" /> Přehrát
            </button>
          </div>

          {/* 3 Variations Grid */}
          <div className="grid grid-cols-3 gap-2">
            {variations.map((v, i) => (
              <div
                key={v.id || i}
                onClick={(e) => {
                  e.stopPropagation();
                  audioSynth.playGuitarChord(v.chord.frets);
                }}
                className="flex flex-col items-center bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 p-1.5 cursor-pointer transition-all rounded-xl group"
                title={`Přehrát ${v.label}`}
              >
                <span className="text-stitek font-medium text-neutral-400 mb-1 text-center truncate w-full group-hover:text-white">
                  {i === 0 ? 'Základní' : i === 1 ? 'Barre E' : 'Barre A'}
                </span>
                <GuitarChordDiagram
                  chord={v.chord}
                  size="sm"
                  showTitle={false}
                  showPlayButton={false}
                />
                <span className="text-stitek text-neutral-400 group-hover:text-znacka mt-1 font-medium flex items-center gap-0.5">
                  <Volume2 className="w-2.5 h-2.5" /> Hrát
                </span>
              </div>
            ))}
          </div>

          {/* Footer Action */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsHovered(false);
              onSelectModalChord(chordName);
            }}
            className="w-full mt-2.5 py-1.5 bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-white/10 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-znacka" />
            <span>Všechny varianty a tóny</span>
          </button>
        </div>
      )}
    </div>
  );
};
