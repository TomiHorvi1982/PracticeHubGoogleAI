import React from 'react';
import { Note } from 'tonal';
import { stejnyTon } from '../../../services/hraniTestu';
import { BASE_PIANO_LAYOUT } from '../../../data/pcKlavesnice';

/**
 * Klaviatura ke cvičení.
 *
 * Totéž co hmatník, jen pro toho, kdo hraje na klávesy — a zároveň
 * legenda k počítačové klávesnici: na každé klávese je napsáno, čím se
 * mačká, takže se dá cvičit i bez nástroje.
 */
export const KlavesyTestu: React.FC<{
  cilove: string[];
  trefene: string[];
  chyba?: { trida: string; minulO: number } | null;
  zniciTon?: string | null;
  /** Od které oktávy klávesnice hraje. */
  oktava: number;
  /** Ukázat zkratky počítačové klávesnice. */
  seZkratkami?: boolean;
  onKlik?: (ton: string) => void;
}> = ({ cilove, trefene, chyba, zniciTon, oktava, seZkratkami, onKlik }) => {
  const zniciTrida = zniciTon ? Note.pitchClass(zniciTon) : null;
  const bile = BASE_PIANO_LAYOUT.filter((k) => !k.isBlack);

  const stavKlavesy = (root: string) => {
    if (chyba && stejnyTon(chyba.trida, root)) return 'chyba';
    if (trefene.some((t) => stejnyTon(t, root))) return 'trefeny';
    if (cilove.some((c) => stejnyTon(c, root))) return 'cil';
    if (zniciTrida && stejnyTon(zniciTrida, root)) return 'zni';
    return 'nic';
  };

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[420px] h-24 flex gap-[2px]">
        {bile.map((k, i) => {
          const stav = stavKlavesy(k.root);
          const ton = `${k.root}${oktava + k.relOctave}`;
          // Černá klávesa patří k té bílé, po které následuje.
          const cerna = BASE_PIANO_LAYOUT.find(
            (c) => c.isBlack && c.relOctave === k.relOctave && Note.chroma(c.root) === (Note.chroma(k.root)! + 1) % 12
          );
          const stavCerne = cerna ? stavKlavesy(cerna.root) : null;

          return (
            <div key={`${k.root}${k.relOctave}${i}`} className="relative flex-1 min-w-[26px]">
              <button
                onClick={() => onKlik?.(ton)}
                className={`w-full h-24 rounded-b-md border text-stitek font-bold flex flex-col justify-end items-center pb-1 cursor-pointer transition-colors ${
                  stav === 'chyba' ? 'bg-[#FF453A] border-[#FF453A] text-white'
                    : stav === 'trefeny' ? 'bg-[#30D158] border-[#30D158] text-black'
                    : stav === 'cil' ? 'bg-[#30D158]/25 border-[#30D158] text-[#30D158]'
                    : stav === 'zni' ? 'bg-white border-white text-black'
                    : 'bg-neutral-200 border-neutral-400 text-neutral-500 hover:bg-white'
                }`}
              >
                <span>{k.root}</span>
                {seZkratkami && <span className="opacity-60 uppercase">{k.keyShortcut}</span>}
              </button>

              {cerna && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onKlik?.(`${cerna.root}${oktava + cerna.relOctave}`);
                  }}
                  className={`absolute top-0 -right-[7px] w-[14px] h-14 rounded-b-sm z-10 text-stitek font-bold text-center cursor-pointer border ${
                    stavCerne === 'chyba' ? 'bg-[#FF453A] border-[#FF453A] text-white'
                      : stavCerne === 'trefeny' ? 'bg-[#30D158] border-[#30D158] text-black'
                      : stavCerne === 'cil' ? 'bg-[#0d5a25] border-[#30D158] text-[#30D158]'
                      : stavCerne === 'zni' ? 'bg-white border-white text-black'
                      : 'bg-neutral-900 border-black text-neutral-500'
                  }`}
                  title={cerna.root}
                >
                  {seZkratkami ? cerna.keyShortcut.toUpperCase() : ''}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
