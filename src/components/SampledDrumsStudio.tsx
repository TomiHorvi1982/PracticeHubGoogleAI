import React, { useEffect, useState, useCallback } from 'react';
import { Play, Square, Loader2, Search, Volume2, VolumeX, Music4, AlertCircle } from 'lucide-react';
import { drumLoopService, Smycka, StavSmycky } from '../services/drumLoopService';
import { authService } from '../services/authService';
import { WaveformPrehravac } from './songbook/WaveformPrehravac';

interface Props {
  onNavigateToLibrary?: () => void;
}

/**
 * Bicí: knihovna WAV smyček.
 *
 * Dřív tu byly pady, fadery a přehrávač MIDI grooves. Znělo to jen tak
 * dobře, jak dobrou sadu vzorků k tomu appka měla, a namapovat ji dalo
 * práci. Hotová nahrávka zní tak, jak ji zahrál bubeník, a jediné, co se
 * na ní řeší, je tempo a hlasitost.
 */
export const SampledDrumsStudio: React.FC<Props> = ({ onNavigateToLibrary }) => {
  const [stav, setStav] = useState<StavSmycky>(drumLoopService.getState());
  const [smycky, setSmycky] = useState<Smycka[]>([]);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hledat, setHledat] = useState('');
  const [ciloveTempo, setCiloveTempo] = useState<number | ''>('');

  useEffect(() => drumLoopService.subscribe(setStav), []);
  // Odchod ze sekce nesmí nechat smyčku hrát na pozadí.
  useEffect(() => () => drumLoopService.stop(), []);

  const nacti = useCallback(async () => {
    setNacitam(true);
    setChyba(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const q = new URLSearchParams();
      if (hledat.trim()) q.set('search', hledat.trim());
      if (ciloveTempo) q.set('bpm', String(ciloveTempo));
      const res = await fetch(`/api/drum-loops?${q}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Nejste přihlášeni.' : `Server vrátil ${res.status}.`);
      const d = await res.json();
      setSmycky(d.smycky || []);
    } catch (e: any) {
      setChyba(e?.message || 'Smyčky se nepodařilo načíst.');
      setSmycky([]);
    } finally {
      setNacitam(false);
    }
  }, [hledat, ciloveTempo]);

  useEffect(() => {
    // Čeká se, až člověk dopíše — dotaz na každé písmeno by poslal pět
    // požadavků na slovo a seznam by pod rukama poskakoval.
    const t = setTimeout(() => void nacti(), 250);
    return () => clearTimeout(t);
  }, [nacti]);

  return (
    <div className="space-y-4">
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Music4 className="w-4 h-4 text-[#FF9F0A]" /> Bicí smyčky
            </h3>
            <p className="text-[11px] text-neutral-400">
              {smycky.length > 0
                ? `${smycky.length} smyček. Vyber a hraje dokola — tempo si nastavíš.`
                : 'Nahrávky bicích, které hrají ve smyčce.'}
            </p>
          </div>
          {onNavigateToLibrary && (
            <button
              onClick={onNavigateToLibrary}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-bold text-neutral-300 cursor-pointer transition-all"
            >
              Knihovna
            </button>
          )}
        </div>

        {/* Přehrávání */}
        <div className="bg-black/50 border border-white/10 rounded-2xl p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => drumLoopService.toggle()}
              disabled={!stav.smycka || stav.nacita}
              className={`p-3 rounded-2xl cursor-pointer shadow-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                stav.hraje ? 'bg-red-500 text-white' : 'bg-[#30D158] text-black'
              }`}
              title={stav.hraje ? 'Zastavit' : 'Přehrát'}
            >
              {stav.nacita ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : stav.hraje ? (
                <Square className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-white truncate">
                {stav.smycka ? stav.smycka.nazev : 'Nic nevybráno'}
              </div>
              <div className="text-[10px] text-neutral-400 truncate">
                {stav.smycka ? `${stav.smycka.balik} · původně ${stav.puvodniTempo} BPM` : 'Vyber smyčku ze seznamu.'}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-[10px] font-bold text-neutral-400">Tempo</span>
              <input
                type="number"
                min={40}
                max={300}
                value={stav.tempo}
                onChange={(e) => drumLoopService.setTempo(parseInt(e.target.value, 10) || stav.tempo)}
                className="w-14 bg-[#1C1C1E] text-white font-mono font-bold text-xs p-1 rounded-lg border border-white/10 text-center outline-none"
              />
              {stav.tempo !== stav.puvodniTempo && (
                <button
                  onClick={() => drumLoopService.setTempo(stav.puvodniTempo)}
                  className="text-[9px] font-mono text-[#FF9F0A] hover:underline cursor-pointer"
                  title="Zpět na tempo nahrávky"
                >
                  ↺ {stav.puvodniTempo}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => drumLoopService.setHlasitost(stav.hlasitost > 0 ? 0 : 0.8)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                {stav.hlasitost > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-[#FF453A]" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={stav.hlasitost}
                onChange={(e) => drumLoopService.setHlasitost(parseFloat(e.target.value))}
                className="w-20 h-1 cursor-pointer accent-[#FF9F0A]"
              />
            </div>
          </div>

          {stav.chyba && (
            <p className="text-[11px] text-[#FF453A] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {stav.chyba}
            </p>
          )}

          {/* Křivka ukazuje, kde je náraz a kde doznívá — u smyčky se z ní
              pozná, jestli sedne k písni, dřív než doběhne celá. */}
          {stav.smycka && (
            <WaveformPrehravac
              url={`/api/assets/${stav.smycka.id}/content`}
              nazev={stav.smycka.nazev}
            />
          )}
        </div>

        {/* Výběr */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={hledat}
              onChange={(e) => setHledat(e.target.value)}
              placeholder="Hledat smyčku…"
              className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-[12px] text-white placeholder-neutral-500 outline-none focus:border-[#FF9F0A]/50"
            />
          </div>
          <div className="flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-xl border border-white/10">
            <span className="text-[10px] font-bold text-neutral-400">Kolem tempa</span>
            <input
              type="number"
              min={40}
              max={300}
              value={ciloveTempo}
              onChange={(e) => setCiloveTempo(e.target.value ? parseInt(e.target.value, 10) : '')}
              placeholder="—"
              className="w-14 bg-[#1C1C1E] text-white font-mono text-xs p-1 rounded-lg border border-white/10 text-center outline-none"
            />
          </div>
        </div>

        <div className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto divide-y divide-white/[0.04]">
            {nacitam && (
              <div className="p-6 text-center text-[12px] text-neutral-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Načítám…
              </div>
            )}
            {chyba && !nacitam && (
              <div className="p-6 text-center text-[12px] text-[#FF453A]">{chyba}</div>
            )}
            {!nacitam && !chyba && smycky.length === 0 && (
              <div className="p-6 text-center text-[12px] text-neutral-500">Nic neodpovídá.</div>
            )}

            {smycky.map((s) => {
              const aktivni = stav.smycka?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => void drumLoopService.nacti(s)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer transition-all ${
                    aktivni ? 'bg-[#FF9F0A]/15' : 'hover:bg-white/5'
                  }`}
                >
                  <div
                    className={`w-1 h-8 rounded-full shrink-0 ${
                      aktivni && stav.hraje ? 'bg-[#30D158] animate-pulse' : aktivni ? 'bg-[#FF9F0A]' : 'bg-white/10'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12px] font-bold truncate ${aktivni ? 'text-[#FF9F0A]' : 'text-white'}`}>
                      {s.nazev}
                    </div>
                    <div className="text-[10px] text-neutral-500 truncate">{s.balik}</div>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400 shrink-0">{s.bpm} BPM</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
