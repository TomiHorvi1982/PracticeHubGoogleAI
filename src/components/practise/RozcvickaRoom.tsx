import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Check, SkipForward, Flame } from 'lucide-react';
import { ROZCVICKA, delkaProgramu, Cvik } from '../../data/rozcvicka';
import { metronomService } from '../../services/metronomService';

/**
 * Rozcvička před hraním.
 *
 * Program jde v pořadí, ne na přeskáčku: studená ruka hraje nepřesně
 * a přesnost levé ruky nemá cenu cvičit, dokud pravá nedrží tempo sama.
 * Odškrtává se, co je hotové, aby bylo vidět, kde člověk skončil.
 */

const KLIC = 'neverlate_rozcvicka_hotovo';

export const RozcvickaRoom: React.FC = () => {
  const [hotove, setHotove] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(KLIC) || '[]'));
    } catch {
      return new Set();
    }
  });
  const [bezici, setBezici] = useState<Cvik | null>(null);
  const [zbyva, setZbyva] = useState(0);
  const [bpm, setBpm] = useState(80);
  const casovac = useRef<number | null>(null);

  // Metronom nesmí tikat po odchodu ze sekce.
  useEffect(() => () => {
    metronomService.stop();
    if (casovac.current !== null) window.clearInterval(casovac.current);
  }, []);

  const uloz = (s: Set<string>) => {
    setHotove(new Set(s));
    localStorage.setItem(KLIC, JSON.stringify([...s]));
  };

  const spust = (c: Cvik) => {
    if (casovac.current !== null) window.clearInterval(casovac.current);
    setBezici(c);
    setZbyva(c.vteriny);
    const tempo = c.bpmOd || bpm;
    setBpm(tempo);
    if (c.bpmOd) metronomService.start(tempo);

    casovac.current = window.setInterval(() => {
      setZbyva((z) => {
        if (z <= 1) {
          window.clearInterval(casovac.current!);
          casovac.current = null;
          metronomService.stop();
          setBezici(null);
          // Hotové se odškrtne samo — kdo cvik odcvičil, nemá ho ještě
          // odklikávat.
          setHotove((h) => {
            const n = new Set(h).add(c.id);
            localStorage.setItem(KLIC, JSON.stringify([...n]));
            return n;
          });
          return 0;
        }
        return z - 1;
      });
    }, 1000);
  };

  const zastav = () => {
    if (casovac.current !== null) window.clearInterval(casovac.current);
    casovac.current = null;
    metronomService.stop();
    setBezici(null);
    setZbyva(0);
  };

  const celkem = ROZCVICKA.reduce((s, b) => s + b.cviky.length, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <Flame className="w-5 h-5 text-[#FF9F0A]" />
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-bold text-white">Rozcvička před hraním</h3>
          <p className="text-[11px] text-neutral-400">
            {delkaProgramu()} minut, {celkem} cviků. Jde se odshora — přesnost levé ruky
            nemá cenu cvičit, dokud pravá nedrží tempo sama.
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-[#30D158] tabular-nums">
            {hotove.size}/{celkem}
          </div>
          <button
            onClick={() => uloz(new Set())}
            className="text-[10px] text-neutral-500 hover:text-white cursor-pointer"
          >
            začít znovu
          </button>
        </div>
      </div>

      {/* Právě běžící cvik */}
      {bezici && (
        <div className="bg-[#FF9F0A]/10 border border-[#FF9F0A]/40 rounded-2xl p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl font-black text-[#FF9F0A] tabular-nums w-16">{zbyva}</span>
            <div className="flex-1 min-w-[180px]">
              <div className="text-sm font-bold text-white">{bezici.nazev}</div>
              <div className="text-[11px] text-neutral-300">{bezici.pozor}</div>
            </div>
            {bezici.bpmOd > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={bezici.bpmOd}
                  max={bezici.bpmDo}
                  value={bpm}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setBpm(t);
                    metronomService.start(t);
                  }}
                  className="w-28 accent-[#FF9F0A] cursor-pointer"
                />
                <span className="text-sm font-mono font-bold text-[#FF9F0A] w-14 tabular-nums">
                  {bpm}
                </span>
              </div>
            )}
            <button
              onClick={zastav}
              className="px-3 py-1.5 rounded-xl bg-white/[0.08] text-neutral-200 text-xs font-bold cursor-pointer flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" /> Stop
            </button>
          </div>

          {bezici.vzor && (
            <div className="flex gap-1">
              {bezici.vzor.map((zni, i) => (
                <div
                  key={i}
                  className={`flex-1 h-7 rounded ${
                    zni ? 'bg-[#FF9F0A]' : 'bg-white/[0.06]'
                  } ${i % 4 === 0 ? 'ring-1 ring-white/25' : ''}`}
                  title={`${Math.floor(i / 4) + 1}. doba`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Program */}
      {ROZCVICKA.map((blok) => (
        <div key={blok.id} className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-2">
          <div>
            <h4 className="text-sm font-bold text-white">{blok.nazev}</h4>
            <p className="text-[11px] text-neutral-500">{blok.popis}</p>
          </div>

          <div className="space-y-1.5">
            {blok.cviky.map((c) => {
              const je = hotove.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${
                    je ? 'bg-[#30D158]/10 border border-[#30D158]/25' : 'bg-white/[0.03]'
                  }`}
                >
                  <button
                    onClick={() => {
                      const n = new Set(hotove);
                      je ? n.delete(c.id) : n.add(c.id);
                      uloz(n);
                    }}
                    className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center cursor-pointer ${
                      je ? 'bg-[#30D158] text-black' : 'border border-white/20'
                    }`}
                    title={je ? 'Odškrtnout' : 'Označit jako hotové'}
                  >
                    {je && <Check className="w-3 h-3" />}
                  </button>

                  <div className="flex-1 min-w-[180px]">
                    <div className="text-xs font-semibold text-white">{c.nazev}</div>
                    <div className="text-[11px] text-neutral-400">{c.popis}</div>
                  </div>

                  <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                    {c.bpmOd ? `${c.bpmOd}–${c.bpmDo} BPM` : 'bez tempa'} · {c.vteriny}s
                  </span>

                  <button
                    onClick={() => spust(c)}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-neutral-200 hover:text-white text-[11px] font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" /> Cvičit
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
