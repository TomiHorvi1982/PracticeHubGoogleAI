import React, { useEffect, useState } from 'react';
import { Play, Square, Loader2, Layers, Repeat, ListMusic, VolumeX, Volume2 } from 'lucide-react';
import { skladackaService, StavSkladacky, pozadiPolicka } from '../../services/skladackaService';
import { useMusicalContext } from '../../context/MusicalContext';

/**
 * Skládačka ze samplů na Pódiu.
 *
 * Ukazuje totéž, co se poskládalo ve Virtual Instruments — je to jedna a
 * táž skládačka, ne kopie. Skládá se tam, kde je na to místo a knihovna
 * samplů po ruce; na pódiu už jde jen o to ji pustit, takže tady zůstalo
 * ovládání a přehled, ne vybírání.
 */
export const SamplyModul: React.FC = () => {
  // Tempo řídí vrchní lišta — jedno pro metronom i pro smyčku.
  const { setBpm } = useMusicalContext();
  const [stav, setStav] = useState<StavSkladacky>(skladackaService.getState());
  useEffect(() => skladackaService.subscribe(setStav), []);

  const prazdna = stav.stopy.every((s) => Object.values(s.vCastech).every((x) => !x));

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        <button
          onClick={() => (stav.hraje ? skladackaService.stop() : void skladackaService.prehraj())}
          disabled={stav.nacita || prazdna}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            stav.hraje ? 'bg-[#FF453A] text-white' : 'bg-[#FF9F0A] text-black hover:bg-[#FF9F0A]/85'
          }`}
        >
          {stav.nacita ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : stav.hraje ? (
            <Square className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          {stav.hraje ? 'Stop' : 'Přehrát'}
        </button>

        <div className="flex items-center gap-1 bg-black/50 border border-white/10 rounded-lg px-2 py-1">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">Tempo</span>
          <input
            type="number"
            value={stav.bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="bez-sipek w-11 bg-transparent text-[12px] font-bold text-white text-center outline-none tabular-nums"
          />
        </div>

        {([
          { id: 'cast', ikona: Repeat, popis: 'Část' },
          { id: 'stavba', ikona: ListMusic, popis: 'Stavba' },
        ] as const).map((r) => {
          const Ikona = r.ikona;
          return (
            <button
              key={r.id}
              onClick={() => skladackaService.nastavRezim(r.id)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                stav.rezim === r.id ? 'bg-white/[0.14] text-white' : 'text-neutral-500 hover:text-white'
              }`}
            >
              <Ikona className="w-3 h-3" /> {r.popis}
            </button>
          );
        })}
      </div>

      {prazdna ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-neutral-600 text-[11px] text-center px-4">
          <Layers className="w-5 h-5 text-neutral-700" />
          Skládačka je prázdná. Poskládej si ji ve Virtual Instruments → Samples; objeví se tady.
        </div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0">
          <div
            className="grid gap-1 mb-1 min-w-[320px]"
            style={{ gridTemplateColumns: `92px repeat(${stav.casti.length}, minmax(0,1fr))` }}
          >
            <span />
            {stav.casti.map((c) => (
              <button
                key={c.id}
                onClick={() => skladackaService.vyberCast(c.id)}
                className={`px-1 py-0.5 rounded text-[9px] font-bold cursor-pointer truncate ${
                  stav.aktivniCast === c.id
                    ? 'bg-[#FF9F0A] text-black'
                    : 'bg-white/[0.05] text-neutral-400 hover:text-white'
                }`}
              >
                {c.nazev}
              </button>
            ))}
          </div>

          {stav.stopy.map((stopa) => (
            <div
              key={stopa.id}
              className="grid gap-1 mb-1 items-center min-w-[320px]"
              style={{ gridTemplateColumns: `92px repeat(${stav.casti.length}, minmax(0,1fr))` }}
            >
              <div className="flex items-center gap-1 min-w-0">
                <button
                  onClick={() => skladackaService.nastavStopu(stopa.id, { ztlumena: !stopa.ztlumena })}
                  className={`p-0.5 rounded cursor-pointer ${
                    stopa.ztlumena ? 'text-[#FF453A]' : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  {stopa.ztlumena ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
                <span className="text-[10px] font-semibold text-white truncate">{stopa.nazev}</span>
              </div>
              {stav.casti.map((c) => {
                const s = stopa.vCastech[c.id];
                return (
                  <div
                    key={c.id}
                    style={pozadiPolicka(!!s, stav.hraje && stav.aktivniCast === c.id, stav.postup)}
                    className={`px-1 py-1 rounded text-[9px] truncate border ${
                      s
                        ? `border-[#30D158]/40 text-[#30D158] ${
                            stav.hraje && stav.aktivniCast === c.id ? '' : 'bg-[#30D158]/15'
                          }`
                        : 'bg-white/[0.02] border-white/[0.06] text-neutral-700'
                    }`}
                    title={s?.nazev}
                  >
                    {s ? s.nazev : '—'}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
