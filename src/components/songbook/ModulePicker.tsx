import React, { useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Song } from '../../types';
import { prehledModulu } from './moduleRegistry';

interface Props {
  song: Song;
  /** Moduly, které plocha zná — nabízí se jen ty. */
  dostupneId: string[];
  onPotvrdit: (vybraneId: string[]) => void;
}

/**
 * Co chceš u téhle písně vidět.
 *
 * Ukazuje se jen při prvním otevření písně; jakmile je sestava uložená,
 * obnoví se rovnou a tahle nabídka zůstane pod tlačítkem. Ptát se pokaždé
 * by z každého otevření udělalo formulář.
 *
 * U každého modulu je vidět, jestli k němu data jsou — bez toho by se
 * vybíralo poslepu a půlka plochy by se otevřela prázdná.
 */
export const ModulePicker: React.FC<Props> = ({ song, dostupneId, onPotvrdit }) => {
  const prehled = useMemo(
    () => prehledModulu(song).filter((p) => dostupneId.includes(p.smlouva.id)),
    [song, dostupneId]
  );

  // Předvybrané je to, k čemu data jsou. Text je vždy — je to jádro písně
  // a když chybí, je vkládací plocha to první, co má člověk vidět.
  const [vybrane, setVybrane] = useState<Set<string>>(() => {
    const v = new Set(prehled.filter((p) => p.data.jsouData).map((p) => p.smlouva.id));
    v.add('text_chords');
    // Nástroje jsou „vždy k dispozici", ale nabízet je předvybrané by
    // znamenalo otevřít ladičku, hmatník i klavír u každé písně.
    for (const id of ['tuner', 'fretboard', 'keyboard'] as const) v.delete(id);
    return v;
  });

  const prepni = (id: string) => {
    const n = new Set(vybrane);
    n.has(id) ? n.delete(id) : n.add(id);
    setVybrane(n);
  };

  // Nástroje umí hrát u každé písně, takže se do počtu „má data" nepočítají —
  // jinak by i úplně prázdná píseň hlásila tři naplněné moduly.
  const sDaty = prehled.filter(
    (p) => p.data.jsouData && !['tuner', 'fretboard', 'keyboard'].includes(p.smlouva.id)
  ).length;

  /**
   * Píseň, ke které zatím nic není, nemá co nabízet.
   *
   * Vybírat z dvanácti prázdných modulů je horší než nevybírat nic — plocha
   * se otevře poloprázdná a vypadá jako rozbitá. Místo nabídky se proto
   * ukáže, že se materiály teprve shánějí.
   */
  if (sDaty === 0) {
    return (
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 shadow-xl text-center space-y-3">
        <div className="text-3xl">🔎</div>
        <h2 className="text-lg font-bold text-white tracking-tight">
          K téhle písni zatím nic není
        </h2>
        <p className="text-xs text-neutral-400 max-w-md mx-auto">
          Appka se pokouší sehnat text, akordy, tabulaturu a další materiály.
          Jakmile něco najde, nabídne se tady, co z toho chceš vidět.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button
            onClick={() => onPotvrdit(['text_chords'])}
            className="px-4 py-2 bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 text-black text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            Otevřít prázdnou plochu
          </button>
          <button
            onClick={() => onPotvrdit(prehled.map((p) => p.smlouva.id))}
            className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-neutral-300 text-xs font-semibold rounded-xl cursor-pointer transition-all"
          >
            Přesto ukázat všechny moduly
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#FF9F0A] text-black font-semibold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
              Nová píseň
            </span>
            <span className="text-xs text-neutral-400 font-medium">{song.title}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Co chceš u téhle písně vidět?
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Předvybráno je {sDaty === 0 ? 'jen to nejnutnější' : `to, k čemu data jsou (${sDaty})`}.
            Výběr se uloží k písni a příště se načte sám.
          </p>
        </div>

        <button
          onClick={() => onPotvrdit([...vybrane])}
          disabled={vybrane.size === 0}
          className="px-4 py-2 bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4" /> Otevřít ({vybrane.size})
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {prehled.map(({ smlouva, data }) => {
          const zvolen = vybrane.has(smlouva.id);
          return (
            <button
              key={smlouva.id}
              onClick={() => prepni(smlouva.id)}
              className={`flex items-start gap-2.5 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                zvolen
                  ? 'bg-[#FF9F0A]/15 border-[#FF9F0A]/50'
                  : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20'
              }`}
            >
              <span className="text-lg shrink-0 leading-none mt-0.5">{smlouva.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold truncate ${zvolen ? 'text-white' : 'text-neutral-300'}`}>
                    {smlouva.title}
                  </span>
                  {data.jsouData ? (
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#30D158]/20 text-[#30D158]">
                      má data
                    </span>
                  ) : (
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.06] text-neutral-500">
                      prázdné
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500 mt-0.5 truncate">{data.souhrn}</p>
              </div>
              <span
                className={`w-4 h-4 rounded-md border shrink-0 flex items-center justify-center mt-0.5 ${
                  zvolen ? 'bg-[#FF9F0A] border-[#FF9F0A]' : 'border-white/20'
                }`}
              >
                {zvolen && <Check className="w-3 h-3 text-black" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-white/[0.06]">
        <button
          onClick={() => setVybrane(new Set(prehled.filter((p) => p.data.jsouData).map((p) => p.smlouva.id)))}
          className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-[11px] font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#FF9F0A]" /> Jen to, k čemu jsou data
        </button>
        <button
          onClick={() => setVybrane(new Set(prehled.map((p) => p.smlouva.id)))}
          className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-300 text-[11px] font-semibold rounded-xl cursor-pointer transition-all"
        >
          Vybrat vše
        </button>
        <button
          onClick={() => setVybrane(new Set(['text_chords']))}
          className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-300 text-[11px] font-semibold rounded-xl cursor-pointer transition-all"
        >
          Jen text
        </button>
      </div>
    </div>
  );
};
