import React from 'react';
import { ChordDefinition } from '../types';
import { audioSynth } from '../services/audioSynth';
import { Volume2 } from 'lucide-react';

interface GuitarChordDiagramProps {
  chord: ChordDefinition;
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
  showPlayButton?: boolean;
  className?: string;
  onClick?: () => void;
}

export const GuitarChordDiagram: React.FC<GuitarChordDiagramProps> = ({
  chord,
  size = 'md',
  showTitle = true,
  showPlayButton = true,
  className = '',
  onClick,
}) => {
  const { frets, fingers, barreFret, name } = chord;

  // Calculate starting fret
  const activeFrets = frets.filter((f) => f > 0);
  const minFret = activeFrets.length > 0 ? Math.min(...activeFrets) : 1;
  const maxFret = activeFrets.length > 0 ? Math.max(...activeFrets) : 1;

  // If chord is played high up the neck (> 3rd fret)
  let baseFret = 1;
  if (maxFret > 4) {
    baseFret = minFret;
  }

  // Dimensions based on size
  const config = {
    sm: { width: 90, height: 110, fretHeight: 18, stringSpacing: 12, dotRadius: 5, fontSize: '9px', paddingX: 15, paddingY: 20 },
    md: { width: 130, height: 160, fretHeight: 26, stringSpacing: 18, dotRadius: 7, fontSize: '11px', paddingX: 20, paddingY: 28 },
    lg: { width: 180, height: 210, fretHeight: 34, stringSpacing: 25, dotRadius: 10, fontSize: '13px', paddingX: 28, paddingY: 36 },
  }[size];

  const numFrets = 4;
  const numStrings = 6;

  const startX = config.paddingX;
  const startY = config.paddingY;
  const endX = startX + (numStrings - 1) * config.stringSpacing;
  const endY = startY + numFrets * config.fretHeight;

  const handlePlaySound = (e: React.MouseEvent) => {
    e.stopPropagation();
    audioSynth.playGuitarChord(frets);
  };

  return (
    <div
      onClick={onClick}
      className={`inline-flex flex-col items-center bg-[#0C0C0C] border border-[#222] p-2 font-mono transition-all ${
        onClick ? 'cursor-pointer hover:border-[#FF3E00] hover:bg-[#141414]' : ''
      } ${className}`}
    >
      {/* Title & Play Header */}
      {showTitle && (
        <div className="flex items-center justify-between w-full mb-1 px-1">
          <span className="font-extrabold text-white text-xs sm:text-sm tracking-wide">
            {name}
          </span>
          {showPlayButton && (
            <button
              onClick={handlePlaySound}
              className="p-1 text-[#FF3E00] hover:text-[#00FF41] hover:bg-[#222] transition-colors"
              title="Přehrát akord"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* SVG Fretboard Canvas */}
      <svg
        width={config.width}
        height={config.height}
        viewBox={`0 0 ${config.width} ${config.height}`}
        className="select-none"
      >
        {/* Nut (Thick line if baseFret === 1) */}
        {baseFret === 1 ? (
          <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={startY}
            stroke="#D1D1D1"
            strokeWidth={size === 'sm' ? 3 : 5}
            strokeLinecap="square"
          />
        ) : (
          /* Base Fret Indicator on left */
          <text
            x={startX - 6}
            y={startY + config.fretHeight / 1.5}
            fill="#FF3E00"
            fontSize={config.fontSize}
            fontWeight="bold"
            textAnchor="end"
            dominantBaseline="middle"
          >
            {baseFret}fr
          </text>
        )}

        {/* Frets (Horizontal Lines) */}
        {Array.from({ length: numFrets + 1 }).map((_, i) => {
          const y = startY + i * config.fretHeight;
          return (
            <line
              key={`fret-${i}`}
              x1={startX}
              y1={y}
              x2={endX}
              y2={y}
              stroke="#333"
              strokeWidth={i === 0 && baseFret === 1 ? 0 : 1}
            />
          );
        })}

        {/* Strings (Vertical Lines: String 6 to 1 left to right) */}
        {Array.from({ length: numStrings }).map((_, i) => {
          const x = startX + i * config.stringSpacing;
          return (
            <line
              key={`string-${i}`}
              x1={x}
              y1={startY}
              x2={x}
              y2={endY}
              stroke="#555"
              strokeWidth={1 + (numStrings - 1 - i) * 0.25} // Thick bass strings
            />
          );
        })}

        {/* Barre Line Indicator */}
        {barreFret && barreFret >= baseFret && barreFret < baseFret + numFrets && (
          <rect
            x={startX}
            y={startY + (barreFret - baseFret) * config.fretHeight + config.fretHeight * 0.25}
            width={endX - startX}
            height={config.fretHeight * 0.5}
            rx={config.dotRadius * 0.5}
            fill="#FF3E00"
            opacity={0.8}
          />
        )}

        {/* String Indicators (Open string 'O' or Muted 'X' above nut) */}
        {frets.map((fret, strIdx) => {
          const x = startX + strIdx * config.stringSpacing;
          const y = startY - (size === 'sm' ? 6 : 10);

          if (fret === -1) {
            // Muted 'X'
            return (
              <text
                key={`mute-${strIdx}`}
                x={x}
                y={y}
                fill="#888"
                fontSize={config.fontSize}
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                ✕
              </text>
            );
          } else if (fret === 0) {
            // Open 'O'
            return (
              <circle
                key={`open-${strIdx}`}
                cx={x}
                cy={y}
                r={config.dotRadius * 0.6}
                fill="none"
                stroke="#00FF41"
                strokeWidth={1.5}
              />
            );
          }
          return null;
        })}

        {/* Finger Dots on Frets */}
        {frets.map((fret, strIdx) => {
          if (fret <= 0) return null;

          const relativeFret = fret - baseFret + 1;
          if (relativeFret < 1 || relativeFret > numFrets) return null;

          const x = startX + strIdx * config.stringSpacing;
          const y = startY + (relativeFret - 0.5) * config.fretHeight;
          const fingerNum = fingers && fingers[strIdx] ? fingers[strIdx] : null;

          return (
            <g key={`dot-${strIdx}`}>
              <circle
                cx={x}
                cy={y}
                r={config.dotRadius}
                fill="#FF3E00"
                stroke="#FFFFFF"
                strokeWidth={1}
              />
              {fingerNum && fingerNum > 0 && (
                <text
                  x={x}
                  y={y}
                  fill="#000000"
                  fontSize={config.fontSize}
                  fontWeight="black"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {fingerNum}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
