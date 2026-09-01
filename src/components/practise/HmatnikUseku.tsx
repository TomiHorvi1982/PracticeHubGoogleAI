import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Repeat, Volume2 } from 'lucide-react';
import { Usek, UsekNota, poDobach, tikyNaVteriny } from '../../services/gpUsek';
import { audioSynth, InstrumentProfile } from '../../services/audioSynth';
import { TONY } from '../../services/akordy';

/**
 * Úsek tabulatury na hmatníku, ve smyčce a s metronomem.
 *
 * Ukazuje, kde se právě hraje — strunu a pražec, ne notu. To je jediné,
 * co kytarista při cvičení potřebuje vidět, a zároveň jediné, co notový
 * zápis neřekne.
 */

const PRAZCU = 16;
/** Značky na krku, jak je má kytara. */
const ZNACKY = [3, 5, 7, 9, 12, 15];

const nazevTonu = (midi: number) => `${TONY[midi % 12]}${Math.floor(midi / 12) - 1}`;

interface Props {
  usek: Usek;
  bpm: number;
  nastroj?: InstrumentProfile;
}

export const HmatnikUseku: React.FC<Props> = ({ usek, bpm, nastroj = 'electric_lespaul_crunch' }) => {
  const [hraje, setHraje] = useState(false);
  const [dokola, setDokola] = useState(true);
  const [metronom, setMetronom] = useState(true);
  const [rychlost, setRychlost] = useState(1);
  const [ktera, setKtera] = useState(-1);

  const casovace = useRef<ReturnType<typeof setTimeout>[]>([]);
  const doby = useMemo(() => poDobach(usek.noty), [usek]);

  const zastav = () => {
    casovace.current.forEach(clearTimeout);
    casovace.current = [];
    setHraje(false);
    setKtera(-1);
  };

  useEffect(() => zastav, []);
  // Jiný úsek nebo tempo znamená jiné časování; stará smyčka by hrála podle starého.
  useEffect(() => { if (hraje) zastav(); }, [usek, bpm]);

  /**
   * Naplánuje jedno kolo smyčky.
   *
   * Plánuje se dopředu celé kolo, ne tón po tónu: časovač spouštěný
   * z předchozího tónu by nabíral zpoždění a úsek by se postupně
   * rozjížděl vůči metronomu.
   */
  const naplanujKolo = (odVteriny: number) => {
    const tempo = bpm * rychlost;

    doby.forEach((d, i) => {
      const kdy = odVteriny + tikyNaVteriny(d.cas, tempo);
      casovace.current.push(setTimeout(() => {
        setKtera(i);
        for (const n of d.noty) {
          audioSynth.playNote(
            nazevTonu(n.midi),
            nastroj,
            Math.max(0.25, tikyNaVteriny(n.delka, tempo)),
            0.7,
          );
        }
      }, kdy * 1000));
    });

    if (metronom) {
      // Doba je čtvrťka; klik na každou, ať je slyšet, kde je puls.
      const dob = Math.max(1, Math.round(usek.delka / 960));
      for (let i = 0; i < dob; i += 1) {
        const kdy = odVteriny + tikyNaVteriny(i * 960, tempo);
        casovace.current.push(setTimeout(() => {
          audioSynth.playNote(i === 0 ? 'C6' : 'C5', 'woodblock' as InstrumentProfile, 0.08, 0.35);
        }, kdy * 1000));
      }
    }

    const koloVterin = tikyNaVteriny(usek.delka, tempo);
    if (dokola) {
      casovace.current.push(setTimeout(() => naplanujKolo(0), (odVteriny + koloVterin) * 1000));
    } else {
      casovace.current.push(setTimeout(zastav, (odVteriny + koloVterin) * 1000));
    }
  };

  const spust = () => {
    if (hraje || !doby.length) return;
    setHraje(true);
    casovace.current = [];
    naplanujKolo(0);
  };

  /** Které pozice zrovna svítí. */
  const sviti = new Set(
    (doby[ktera]?.noty || []).map((n: UsekNota) => `${n.struna}-${n.prazec}`),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => (hraje ? zastav() : spust())}
          disabled={!doby.length}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 ${
            hraje ? 'bg-[#FF453A] text-white' : 'bg-[#FF9F0A] text-black hover:bg-[#ffb03a]'
          }`}
        >
          {hraje ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {hraje ? 'Zastavit' : 'Cvičit úsek'}
        </button>

        <button
          onClick={() => setDokola((d) => !d)}
          className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border cursor-pointer flex items-center gap-1.5 ${
            dokola ? 'bg-[#30D158]/15 border-[#30D158]/40 text-[#30D158]' : 'bg-white/[0.06] border-white/10 text-neutral-400'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" /> smyčka
        </button>

        <button
          onClick={() => setMetronom((m) => !m)}
          className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border cursor-pointer flex items-center gap-1.5 ${
            metronom ? 'bg-[#FF9F0A]/15 border-[#FF9F0A]/40 text-[#FF9F0A]' : 'bg-white/[0.06] border-white/10 text-neutral-400'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" /> metronom
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Rychlost</span>
          {[0.5, 0.75, 1].map((r) => (
            <button
              key={r}
              onClick={() => setRychlost(r)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                rychlost === r ? 'bg-[#FF9F0A] text-black' : 'bg-white/[0.06] text-neutral-400'
              }`}
            >
              {r * 100} %
            </button>
          ))}
          <span className="text-[10px] text-neutral-500 tabular-nums">
            {Math.round(bpm * rychlost)} BPM
          </span>
        </div>
      </div>

      {/* Hmatník. Struna 1 je nejvyšší, kreslí se proto nahoře. */}
      <div className="bg-[#2A1F17] border border-white/10 rounded-2xl p-3 overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="flex mb-1 pl-8">
            {Array.from({ length: PRAZCU }, (_, p) => (
              <div key={p} className="flex-1 text-center text-[9px] text-neutral-500 tabular-nums">
                {ZNACKY.includes(p) ? p : p === 0 ? '0' : ''}
              </div>
            ))}
          </div>

          {[1, 2, 3, 4, 5, 6].map((struna) => (
            <div key={struna} className="flex items-center h-7">
              <span className="w-8 text-[9px] text-neutral-500 shrink-0">
                {['e', 'B', 'G', 'D', 'A', 'E'][struna - 1]}
              </span>
              {Array.from({ length: PRAZCU }, (_, prazec) => {
                const svit = sviti.has(`${struna}-${prazec}`);
                return (
                  <div
                    key={prazec}
                    className={`flex-1 h-full flex items-center justify-center relative ${
                      prazec === 0 ? '' : 'border-l border-neutral-600/50'
                    }`}
                  >
                    <div className="absolute inset-x-0 top-1/2 h-px bg-neutral-500/40" />
                    {svit && (
                      <span className="relative z-10 w-5 h-5 rounded-full bg-[#FF9F0A] text-black text-[9px] font-bold flex items-center justify-center">
                        {prazec}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-neutral-500">
        {doby.length
          ? `Úsek má ${doby.length} dob a ${usek.noty.length} tónů.`
          : 'Vyber v tabulatuře takty, které chceš cvičit.'}
      </p>
    </div>
  );
};
