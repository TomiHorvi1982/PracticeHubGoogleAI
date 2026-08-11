import React, { useState, useRef } from 'react';
import { Volume2, Zap, Music } from 'lucide-react';
import { findOrGenerateChord, generateChordVariations } from '../utils/chordUtils';
import { audioSynth } from '../services/audioSynth';
import { GuitarChordDiagram } from './GuitarChordDiagram';

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

  const baseChord = findOrGenerateChord(chordName);
  const variations = generateChordVariations(chordName).slice(0, 3);

  const updatePosition = () => {
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    const placeAbove = rect.top > 230;
    const popupWidth = 310;

    let left = rect.left + rect.width / 2 - popupWidth / 2;
    if (left < 10) left = 10;
    if (left + popupWidth > window.innerWidth - 10) {
      left = window.innerWidth - popupWidth - 10;
    }

    const top = placeAbove ? rect.top - 8 : rect.bottom + 8;
    setPopupPos({ top, left, placeAbove });
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsHovered(true);
    audioSynth.playGuitarChord(baseChord.frets);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    updatePosition();
    setIsHovered(true);
    audioSynth.playGuitarChord(baseChord.frets);
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
        className={`inline-block font-extrabold font-mono px-2 py-0.5 mx-0.5 cursor-pointer border border-black shadow-md transition-all select-none ${
          isActiveLine
            ? 'bg-[#00FF41] text-black scale-110 animate-chord-pop shadow-[0_0_15px_#00FF41] z-10'
            : 'bg-[#FF3E00] text-black hover:bg-[#00FF41]'
        }`}
        style={{ fontSize: `${Math.max(12, fontSize * 0.9)}px` }}
        title="Najetí/kliknutí přehraje akord a zobrazí 3 variace"
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
          className="bg-[#0A0A0A] border-2 border-[#FF3E00] p-2.5 shadow-[0_0_30px_rgba(255,62,0,0.5)] z-[9999] font-mono w-[310px] rounded-xs animate-in fade-in zoom-in-95 duration-100 pointer-events-auto"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Popup Header */}
          <div className="flex items-center justify-between border-b border-[#222] pb-1.5 mb-2">
            <span className="text-[10px] font-black uppercase text-[#FF3E00] flex items-center gap-1">
              <Music className="w-3.5 h-3.5" /> AKORD {chordName} (3 VARIACE)
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                audioSynth.playGuitarChord(baseChord.frets);
              }}
              className="text-[9px] bg-[#00FF41] text-black font-black px-1.5 py-0.5 uppercase hover:bg-white flex items-center gap-1 shadow-sm transition-colors"
              title="Přehrát základní hmat"
            >
              <Volume2 className="w-2.5 h-2.5 text-black" /> PŘEHRÁT
            </button>
          </div>

          {/* 3 Variations Grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {variations.map((v, i) => (
              <div
                key={v.id || i}
                onClick={(e) => {
                  e.stopPropagation();
                  audioSynth.playGuitarChord(v.chord.frets);
                }}
                className="flex flex-col items-center bg-[#111] hover:bg-[#1F1F1F] border border-[#333] hover:border-[#FF3E00] p-1 cursor-pointer transition-all rounded-2xs group"
                title={`Přehrát ${v.label}`}
              >
                <span className="text-[8px] font-black uppercase text-[#FFD700] mb-1 text-center truncate w-full">
                  {i === 0 ? 'Otevřený' : i === 1 ? 'Barre E' : 'Barre A'}
                </span>
                <GuitarChordDiagram
                  chord={v.chord}
                  size="sm"
                  showTitle={false}
                  showPlayButton={false}
                />
                <span className="text-[8px] text-[#888] group-hover:text-[#00FF41] mt-1 uppercase font-bold text-center flex items-center gap-0.5">
                  <Volume2 className="w-2 h-2" /> HRA
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
            className="w-full mt-2 py-1 bg-[#1A1A1A] hover:bg-[#FF3E00] text-[#FF3E00] hover:text-black text-[9px] font-extrabold uppercase flex items-center justify-center gap-1 transition-colors border border-[#333]"
          >
            <Zap className="w-2.5 h-2.5 text-[#FFD700]" /> VŠECHNY HMATY &amp; DETAIL 🎸
          </button>
        </div>
      )}
    </div>
  );
};
