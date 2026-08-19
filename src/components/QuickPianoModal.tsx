import React, { useState } from 'react';
import { X, Volume2, Music, Sparkles, Piano } from 'lucide-react';
import { audioSynth } from '../services/audioSynth';

interface QuickPianoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickPianoModal: React.FC<QuickPianoModalProps> = ({ isOpen, onClose }) => {
  const [octave, setOctave] = useState(4);
  const [instrument, setInstrument] = useState<'grand_piano' | 'rhodes_ep' | 'analog_synth'>('grand_piano');
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const BLACK_KEYS: { note: string; leftOffset: number }[] = [
    { note: 'C#', leftOffset: 1 },
    { note: 'D#', leftOffset: 2 },
    { note: 'F#', leftOffset: 4 },
    { note: 'G#', leftOffset: 5 },
    { note: 'A#', leftOffset: 6 },
  ];

  const playKey = (noteWithOctave: string) => {
    audioSynth.playNote(noteWithOctave, instrument, 2.0, 0.7);
    setPressedKeys((prev) => new Set([...prev, noteWithOctave]));
    setTimeout(() => {
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(noteWithOctave);
        return next;
      });
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#16161C] border border-white/15 rounded-3xl p-5 sm:p-6 w-full max-w-4xl shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FF9F0A]/20 border border-[#FF9F0A]/40 flex items-center justify-center">
              <Piano className="w-4 h-4 text-[#FF9F0A]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Rychlý Klavír & Pomůcka</h2>
              <p className="text-xs text-neutral-400">Přehrajte si melodie, tóny nebo akordy přímo z lišty</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl text-xs">
          {/* Instrument switcher */}
          <div className="flex items-center gap-2">
            <span className="text-neutral-400 font-medium">Nástroj:</span>
            <select
              value={instrument}
              onChange={(e) => setInstrument(e.target.value as any)}
              className="bg-black/60 border border-white/10 text-white rounded-xl px-2.5 py-1 outline-none text-xs cursor-pointer"
            >
              <option value="grand_piano">🎹 Křídlo (Grand Piano)</option>
              <option value="rhodes_ep">✨ Rhodes Piano</option>
              <option value="analog_synth">⚡ Analog Synth</option>
            </select>
          </div>

          {/* Octave Selector */}
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-xl border border-white/10">
            <span className="text-neutral-400 font-medium">Základní oktáva:</span>
            <button
              onClick={() => setOctave((o) => Math.max(1, o - 1))}
              className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg cursor-pointer"
            >
              -
            </button>
            <span className="font-bold text-[#FF9F0A] px-2 font-mono text-sm">{octave}</span>
            <button
              onClick={() => setOctave((o) => Math.min(6, o + 1))}
              className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* 3-Octave Interactive Piano Keyboard */}
        <div className="bg-black/50 border border-white/10 rounded-2xl p-4 flex justify-center items-center overflow-x-auto min-h-[220px]">
          <div className="flex relative select-none">
            {[octave, octave + 1, octave + 2].map((oct) => (
              <div key={oct} className="flex relative">
                {/* White Keys */}
                {WHITE_KEYS.map((k) => {
                  const noteName = `${k}${oct}`;
                  const isDown = pressedKeys.has(noteName);
                  return (
                    <button
                      key={noteName}
                      onClick={() => playKey(noteName)}
                      className={`w-9 sm:w-11 h-40 sm:h-44 rounded-b-xl border border-neutral-700 font-bold text-xs flex items-end justify-center pb-3 cursor-pointer transition-all ${
                        isDown
                          ? 'bg-[#FF9F0A] text-black translate-y-1.5 shadow-inner'
                          : 'bg-white hover:bg-neutral-100 text-neutral-800 active:bg-neutral-200'
                      }`}
                    >
                      {noteName}
                    </button>
                  );
                })}

                {/* Black Keys */}
                {BLACK_KEYS.map(({ note, leftOffset }) => {
                  const noteName = `${note}${oct}`;
                  const isDown = pressedKeys.has(noteName);
                  const leftPx = (leftOffset - 1) * 44 + 30;

                  return (
                    <button
                      key={noteName}
                      onClick={(e) => {
                        e.stopPropagation();
                        playKey(noteName);
                      }}
                      style={{ left: `${leftPx}px` }}
                      className={`absolute top-0 w-7 h-24 sm:h-28 rounded-b-lg font-bold text-[10px] flex items-end justify-center pb-2 cursor-pointer z-10 transition-all ${
                        isDown
                          ? 'bg-[#FF9F0A] text-black translate-y-1'
                          : 'bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-700 shadow-md'
                      }`}
                    >
                      {note}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
          <span>Stisknutím klávesy se přehraje tón v reálném čase.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl cursor-pointer"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};
