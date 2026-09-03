import React from 'react';
import { Note } from 'tonal';
import { stejnyTon } from '../../../services/hraniTestu';

/**
 * Hmatník, na kterém je vidět, jak cvičení dopadá.
 *
 * Seznam tónů pod sebou hráči nepomůže — na kytaru se hraje po pražcích.
 * Zelené kroužky ukazují, kam se má sáhnout, plné kolečko to, co už
 * padlo, a červená poslední chybu i s tím, o kolik byla vedle.
 */

const STRUNY = [
  { nazev: 'e', midi: 64 },
  { nazev: 'B', midi: 59 },
  { nazev: 'G', midi: 55 },
  { nazev: 'D', midi: 50 },
  { nazev: 'A', midi: 45 },
  { nazev: 'E', midi: 40 },
];
const PRAZCU = 15;
/** Pražce s tečkou — bez nich se na hmatníku ztratí i ten, kdo hraje. */
const ZNACKY = [3, 5, 7, 9, 12, 15];

export const HmatnikTestu: React.FC<{
  /** Co se má zahrát. */
  cilove: string[];
  /** Co už padlo. */
  trefene: string[];
  /** Poslední chybný tón a o kolik byl vedle. */
  chyba?: { trida: string; minulO: number } | null;
  /** Co zrovna zní — svítí i mimo zadání. */
  zniciTon?: string | null;
}> = ({ cilove, trefene, chyba, zniciTon }) => {
  const zniciTrida = zniciTon ? Note.pitchClass(zniciTon) : null;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px] select-none">
        <div
          className="grid gap-[3px] mb-1"
          style={{ gridTemplateColumns: `26px repeat(${PRAZCU + 1}, minmax(0,1fr))` }}
        >
          <span />
          {Array.from({ length: PRAZCU + 1 }, (_, p) => (
            <span
              key={p}
              className={`text-center text-stitek tabular-nums ${
                ZNACKY.includes(p) ? 'text-[#FF9F0A] font-bold' : 'text-neutral-600'
              }`}
            >
              {p}
            </span>
          ))}
        </div>

        {STRUNY.map((s) => (
          <div
            key={s.nazev}
            className="grid gap-[3px] mb-[3px]"
            style={{ gridTemplateColumns: `26px repeat(${PRAZCU + 1}, minmax(0,1fr))` }}
          >
            <span className="text-stitek font-bold text-neutral-500 self-center">{s.nazev}</span>
            {Array.from({ length: PRAZCU + 1 }, (_, prazec) => {
              const trida = Note.pitchClass(Note.fromMidi(s.midi + prazec));
              const jeCil = cilove.some((c) => stejnyTon(c, trida));
              const jeTrefeny = trefene.some((t) => stejnyTon(t, trida));
              const jeChyba = !!chyba && stejnyTon(chyba.trida, trida);
              const zni = !!zniciTrida && stejnyTon(zniciTrida, trida);

              return (
                <div
                  key={prazec}
                  className={`h-6 rounded flex items-center justify-center text-stitek font-bold border ${
                    jeChyba
                      ? 'bg-[#FF453A] border-[#FF453A] text-white'
                      : jeTrefeny
                        ? 'bg-[#30D158] border-[#30D158] text-black'
                        : jeCil
                          ? 'border-[#30D158] text-[#30D158] bg-[#30D158]/10'
                          : zni
                            ? 'border-white/40 text-white bg-white/10'
                            : 'border-white/[0.06] text-neutral-700 bg-white/[0.02]'
                  }`}
                  title={`${trida} — ${prazec}. pražec`}
                >
                  {jeCil || jeChyba || zni ? trida : ''}
                </div>
              );
            })}
          </div>
        ))}

        {chyba && chyba.minulO > 0 && (
          <p className="text-drobne text-[#FF453A] mt-2">
            {chyba.trida} — vedle o {chyba.minulO}{' '}
            {chyba.minulO === 1 ? 'půltón' : chyba.minulO < 5 ? 'půltóny' : 'půltónů'}
          </p>
        )}
      </div>
    </div>
  );
};
