import React, { useState } from 'react';
import { ChevronDown, ChevronRight, X, SlidersHorizontal } from 'lucide-react';
import {
  SongFilter,
  Fasety,
  ObsahKlic,
  POPIS_OBSAHU,
  PRAZDNY_FILTR,
  jeFiltrPrazdny,
} from '../../services/songFilters';

interface Props {
  filtr: SongFilter;
  fasety: Fasety;
  nalezeno: number;
  celkem: number;
  onZmena: (f: SongFilter) => void;
}

/** Kolik hodnot se ukáže, než se nabídne „zobrazit vše". */
const NAHLED = 8;

export const SongFilterPanel: React.FC<Props> = ({ filtr, fasety, nalezeno, celkem, onZmena }) => {
  const [otevrene, setOtevrene] = useState<Set<string>>(new Set(['obsah']));
  const [rozsirene, setRozsirene] = useState<Set<string>>(new Set());

  const prepni = (klic: string, mnozina: Set<string>, nastav: (s: Set<string>) => void) => {
    const n = new Set(mnozina);
    n.has(klic) ? n.delete(klic) : n.add(klic);
    nastav(n);
  };

  /** Přidá nebo odebere hodnotu ve vícenásobném filtru. */
  const prepniHodnotu = (pole: keyof SongFilter, hodnota: string) => {
    const soucasne = filtr[pole] as string[];
    onZmena({
      ...filtr,
      [pole]: soucasne.includes(hodnota)
        ? soucasne.filter((h) => h !== hodnota)
        : [...soucasne, hodnota],
    });
  };

  /**
   * Obsah má tři stavy, ne dva: nezajímá mě / musí to mít / nesmí to mít.
   * Druhé kliknutí proto nevypíná, ale překlopí na „chybí" — díky tomu jde
   * jedním tlačítkem najít písně, kde teprve práce čeká.
   */
  const prepniObsah = (klic: ObsahKlic) => {
    const má = filtr.obsahuje.includes(klic);
    const nemá = filtr.chybi.includes(klic);
    if (má) {
      onZmena({ ...filtr, obsahuje: filtr.obsahuje.filter((k) => k !== klic), chybi: [...filtr.chybi, klic] });
    } else if (nemá) {
      onZmena({ ...filtr, chybi: filtr.chybi.filter((k) => k !== klic) });
    } else {
      onZmena({ ...filtr, obsahuje: [...filtr.obsahuje, klic] });
    }
  };

  const sekce = (
    id: string,
    nadpis: string,
    hodnoty: { hodnota: string; pocet: number }[],
    pole: keyof SongFilter
  ) => {
    const pouzitelne = hodnoty.filter((h) => h.hodnota);
    if (pouzitelne.length === 0) return null;

    const zavrena = !otevrene.has(id);
    const vybrane = filtr[pole] as string[];
    const vsechny = rozsirene.has(id);
    const zobrazene = vsechny ? pouzitelne : pouzitelne.slice(0, NAHLED);

    return (
      <div className="border-t border-white/[0.06] pt-2">
        <button
          onClick={() => prepni(id, otevrene, setOtevrene)}
          className="w-full flex items-center gap-1.5 text-left cursor-pointer group"
        >
          {zavrena ? (
            <ChevronRight className="w-3 h-3 text-neutral-500 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-neutral-500 shrink-0" />
          )}
          <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 group-hover:text-neutral-200">
            {nadpis}
          </span>
          {vybrane.length > 0 && (
            <span className="text-[9px] font-bold text-black bg-[#FF9F0A] px-1.5 rounded-full">
              {vybrane.length}
            </span>
          )}
          <span className="ml-auto text-[9px] font-mono text-neutral-600">{pouzitelne.length}</span>
        </button>

        {!zavrena && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {zobrazene.map((h) => {
              const aktivni = vybrane.includes(h.hodnota);
              return (
                <button
                  key={h.hodnota}
                  onClick={() => prepniHodnotu(pole, h.hodnota)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${
                    aktivni
                      ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] font-bold'
                      : 'bg-white/[0.04] text-neutral-300 border-white/[0.08] hover:border-white/25'
                  }`}
                  title={`${h.pocet} ${h.pocet === 1 ? 'skladba' : h.pocet < 5 ? 'skladby' : 'skladeb'}`}
                >
                  {h.hodnota.length > 22 ? h.hodnota.slice(0, 21) + '…' : h.hodnota}
                  <span className={aktivni ? 'text-black/60 ml-1' : 'text-neutral-500 ml-1'}>{h.pocet}</span>
                </button>
              );
            })}
            {pouzitelne.length > NAHLED && (
              <button
                onClick={() => prepni(id, rozsirene, setRozsirene)}
                className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-[#FF9F0A] hover:underline cursor-pointer"
              >
                {vsechny ? 'méně' : `+${pouzitelne.length - NAHLED} dalších`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const prazdny = jeFiltrPrazdny(filtr);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3" /> Filtry
        </span>
        {!prazdny && (
          <button
            onClick={() => onZmena({ ...PRAZDNY_FILTR, hledani: filtr.hledani })}
            className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 hover:text-[#FF453A] cursor-pointer"
          >
            <X className="w-3 h-3" /> Zrušit
          </button>
        )}
      </div>

      {!prazdny && (
        <div className="text-[10px] text-neutral-400">
          Vyhovuje <strong className="text-[#FF9F0A]">{nalezeno}</strong> z {celkem}
        </div>
      )}

      {/* Co k písni je — nejužitečnější filtr, proto navrchu a otevřený. */}
      <div className="border-t border-white/[0.06] pt-2">
        <button
          onClick={() => prepni('obsah', otevrene, setOtevrene)}
          className="w-full flex items-center gap-1.5 text-left cursor-pointer group"
        >
          {otevrene.has('obsah') ? (
            <ChevronDown className="w-3 h-3 text-neutral-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-neutral-500 shrink-0" />
          )}
          <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 group-hover:text-neutral-200">
            Co k písni je
          </span>
        </button>

        {otevrene.has('obsah') && (
          <>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {POPIS_OBSAHU.map(({ klic, popis, ikona }) => {
                const pocet = fasety.obsah.find((o) => o.klic === klic)?.pocet ?? 0;
                const má = filtr.obsahuje.includes(klic);
                const nemá = filtr.chybi.includes(klic);
                return (
                  <button
                    key={klic}
                    onClick={() => prepniObsah(klic)}
                    disabled={pocet === 0 && !má && !nemá}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed ${
                      má
                        ? 'bg-[#30D158] text-black border-[#30D158] font-bold'
                        : nemá
                          ? 'bg-[#FF453A]/20 text-[#FF453A] border-[#FF453A]/50 font-bold line-through'
                          : 'bg-white/[0.04] text-neutral-300 border-white/[0.08] hover:border-white/25'
                    }`}
                    title={nemá ? 'Skladby, kterým tohle chybí' : má ? 'Skladby, které tohle mají' : `${pocet} skladeb`}
                  >
                    {ikona} {popis}
                    <span className={má ? 'text-black/60 ml-1' : 'text-neutral-500 ml-1'}>{pocet}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[9px] text-neutral-600">
              Klik = musí mít · druhý klik = <span className="text-[#FF453A]">nesmí mít</span> (najde, kde chybí práce)
            </p>
          </>
        )}
      </div>

      {sekce('interpreti', 'Interpret', fasety.interpreti, 'interpreti')}
      {sekce('toniny', 'Tónina', fasety.toniny, 'toniny')}
      {sekce('akordy', 'Akordy', fasety.akordy, 'akordy')}
      {sekce('ladeni', 'Ladění', fasety.ladeni, 'ladeni')}

      {fasety.tempo && (
        <div className="border-t border-white/[0.06] pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Tempo</span>
            <input
              type="number"
              placeholder={String(fasety.tempo.min)}
              value={filtr.tempoOd ?? ''}
              onChange={(e) => onZmena({ ...filtr, tempoOd: e.target.value ? parseInt(e.target.value, 10) : null })}
              className="w-14 bg-black/40 border border-white/10 rounded-lg px-1.5 py-0.5 text-[10px] text-white text-center outline-none focus:border-[#FF9F0A]"
            />
            <span className="text-[10px] text-neutral-500">–</span>
            <input
              type="number"
              placeholder={String(fasety.tempo.max)}
              value={filtr.tempoDo ?? ''}
              onChange={(e) => onZmena({ ...filtr, tempoDo: e.target.value ? parseInt(e.target.value, 10) : null })}
              className="w-14 bg-black/40 border border-white/10 rounded-lg px-1.5 py-0.5 text-[10px] text-white text-center outline-none focus:border-[#FF9F0A]"
            />
            <span className="text-[9px] font-mono text-neutral-600">BPM</span>
          </div>
        </div>
      )}
    </div>
  );
};
