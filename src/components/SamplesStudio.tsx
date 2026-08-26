import React, { useCallback, useEffect, useState } from 'react';
import {
  Play, Square, Loader2, Search, Plus, Trash2, Volume2, VolumeX, Layers, Repeat, ListMusic, AlertCircle,
} from 'lucide-react';
import { authService } from '../services/authService';
import { skladackaService, StavSkladacky, Sampl } from '../services/skladackaService';
import { drumLoopService } from '../services/drumLoopService';
import { useMusicalContext } from '../context/MusicalContext';

type Nastroj = 'bicí' | 'basa' | 'kytara' | 'vokal';
type Razeni = 'tempo' | 'tonina' | 'takt' | 'nazev';

const NASTROJE: { id: Nastroj; popis: string; ikona: string }[] = [
  { id: 'bicí', popis: 'Bicí', ikona: '🥁' },
  { id: 'basa', popis: 'Basa', ikona: '🎸' },
  { id: 'kytara', popis: 'Kytara', ikona: '🎸' },
  { id: 'vokal', popis: 'Vokály', ikona: '🎤' },
];

const RAZENI: { id: Razeni; popis: string }[] = [
  { id: 'tempo', popis: 'Tempo' },
  { id: 'tonina', popis: 'Tónina' },
  { id: 'takt', popis: 'Takt' },
  { id: 'nazev', popis: 'Název' },
];

/**
 * Samply a skládání.
 *
 * Nahradilo to sekci Bicí. Smyčka sama je jen podklad — teprve když se
 * jich pár naskládá pod sebe, dá se z toho složit celá skladba: intro,
 * sloka, refrén. Řadí se podle tempa a tóniny, protože podle abecedy se
 * sampl nehledá; hledá se „něco kolem 120 v Am".
 */
export const SamplesStudio: React.FC = () => {
  const [nastroj, setNastroj] = useState<Nastroj>('bicí');
  const [samply, setSamply] = useState<Sampl[]>([]);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hledat, setHledat] = useState('');
  const [razeni, setRazeni] = useState<Razeni>('tempo');
  // Tempo řídí vrchní lišta — jedno pro metronom i pro smyčku.
  const { setBpm } = useMusicalContext();
  const [stav, setStav] = useState<StavSkladacky>(skladackaService.getState());
  /** Do kterého políčka se vloží kliknutý sampl. */
  const [cil, setCil] = useState<{ stopa: string; cast: string } | null>(null);

  useEffect(() => skladackaService.subscribe(setStav), []);
  // Odchod ze sekce nesmí nechat nic hrát na pozadí.
  useEffect(() => () => {
    skladackaService.stop();
    drumLoopService.stop();
  }, []);

  const nacti = useCallback(async () => {
    setNacitam(true);
    setChyba(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const q = new URLSearchParams({ nastroj });
      if (hledat.trim()) q.set('search', hledat.trim());
      const res = await fetch(`/api/samples?${q}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Nejsi přihlášený.' : `Server vrátil ${res.status}.`);
      const d = await res.json();
      setSamply(d.samply || []);
    } catch (e: any) {
      setChyba(e?.message || 'Samply se nepodařilo načíst.');
      setSamply([]);
    } finally {
      setNacitam(false);
    }
  }, [nastroj, hledat]);

  useEffect(() => {
    const t = setTimeout(() => void nacti(), 250);
    return () => clearTimeout(t);
  }, [nacti]);

  // Řadí se v prohlížeči: seznam je nejvýš pár set položek a přepnutí
  // kritéria má být okamžité, ne další dotaz na server.
  const serazene = [...samply].sort((a, b) => {
    // Prázdný údaj patří nakonec bez ohledu na kritérium — jinak by
    // sampl bez tempa obsadil začátek, kde se hledá „něco kolem 100".
    const prazdnyA = razeni === 'tempo' ? !a.bpm : !(a as any)[razeni === 'nazev' ? 'nazev' : razeni];
    const prazdnyB = razeni === 'tempo' ? !b.bpm : !(b as any)[razeni === 'nazev' ? 'nazev' : razeni];
    if (prazdnyA !== prazdnyB) return prazdnyA ? 1 : -1;
    if (razeni === 'tempo') return (a.bpm - b.bpm) || a.nazev.localeCompare(b.nazev, 'cs');
    if (razeni === 'nazev') return a.nazev.localeCompare(b.nazev, 'cs');
    const x = String((a as any)[razeni] || '');
    const y = String((b as any)[razeni] || '');
    return x.localeCompare(y, 'cs') || a.nazev.localeCompare(b.nazev, 'cs');
  });

  const vloz = (s: Sampl) => {
    if (!cil) return;
    skladackaService.vloz(cil.stopa, cil.cast, s);
    setCil(null);
  };

  const udaj = (t: string, hodnota: string) =>
    hodnota ? (
      <span className="text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-neutral-400 shrink-0">
        {t}
        {hodnota}
      </span>
    ) : null;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* SKLÁDAČKA */}
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="w-4 h-4 text-[#FF9F0A] shrink-0" />
          <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Skládačka</h2>
          <span className="text-[10px] text-neutral-500">stopy pod sebou, části za sebou</span>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 bg-black/50 border border-white/10 rounded-lg px-2 py-1">
              <span className="text-[9px] uppercase tracking-wider text-neutral-500">Tempo</span>
              <input
                type="number"
                value={stav.bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-12 bg-transparent text-[12px] font-bold text-white text-center outline-none tabular-nums"
              />
            </div>

            {([
              { id: 'cast', popis: 'Část dokola', ikona: Repeat },
              { id: 'stavba', popis: 'Celá stavba', ikona: ListMusic },
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

            <button
              onClick={() => (stav.hraje ? skladackaService.stop() : void skladackaService.prehraj())}
              disabled={stav.nacita}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 ${
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
          </div>
        </div>

        {stav.chyba && (
          <p className="text-[11px] text-[#FF453A] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {stav.chyba}
          </p>
        )}

        {/* Mřížka stopa × část. */}
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div
              className="grid gap-1 mb-1"
              style={{ gridTemplateColumns: `150px repeat(${stav.casti.length}, minmax(0,1fr))` }}
            >
              <span />
              {stav.casti.map((c) => (
                <button
                  key={c.id}
                  onClick={() => skladackaService.vyberCast(c.id)}
                  className={`px-1.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                    stav.aktivniCast === c.id
                      ? 'bg-[#FF9F0A] text-black'
                      : 'bg-white/[0.05] text-neutral-400 hover:text-white'
                  }`}
                  title={`${c.nazev} — ${c.opakovani}×`}
                >
                  {c.nazev}
                  <span className="ml-1 opacity-60">{c.opakovani}×</span>
                </button>
              ))}
            </div>

            {stav.stopy.length === 0 ? (
              <p className="text-[11px] text-neutral-600 py-3">
                Zatím žádná stopa. Přidej ji tlačítkem níž a pak klikni do políčka, kam chceš sampl vložit.
              </p>
            ) : (
              stav.stopy.map((stopa) => (
                <div
                  key={stopa.id}
                  className="grid gap-1 mb-1 items-center"
                  style={{ gridTemplateColumns: `150px repeat(${stav.casti.length}, minmax(0,1fr))` }}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      onClick={() => skladackaService.nastavStopu(stopa.id, { ztlumena: !stopa.ztlumena })}
                      className={`p-1 rounded cursor-pointer ${
                        stopa.ztlumena ? 'text-[#FF453A]' : 'text-neutral-500 hover:text-white'
                      }`}
                      title={stopa.ztlumena ? 'Zapnout stopu' : 'Ztlumit stopu'}
                    >
                      {stopa.ztlumena ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-[11px] font-semibold text-white truncate flex-1">{stopa.nazev}</span>
                    <button
                      onClick={() => skladackaService.smazStopu(stopa.id)}
                      className="p-1 rounded text-neutral-600 hover:text-[#FF453A] cursor-pointer"
                      title="Smazat stopu"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {stav.casti.map((c) => {
                    const s = stopa.vCastech[c.id];
                    const vybrane = cil?.stopa === stopa.id && cil?.cast === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() =>
                          s
                            ? skladackaService.vloz(stopa.id, c.id, null)
                            : setCil(vybrane ? null : { stopa: stopa.id, cast: c.id })
                        }
                        className={`px-1.5 py-1.5 rounded-lg text-[10px] truncate border cursor-pointer transition-all ${
                          s
                            ? 'bg-[#30D158]/15 border-[#30D158]/40 text-[#30D158]'
                            : vybrane
                              ? 'bg-[#FF9F0A]/20 border-[#FF9F0A] text-[#FF9F0A]'
                              : 'bg-white/[0.03] border-white/[0.08] text-neutral-600 hover:border-white/25'
                        }`}
                        title={s ? `${s.nazev} — kliknutím vyprázdníš` : 'Klikni a pak vyber sampl níž'}
                      >
                        {s ? s.nazev : vybrane ? 'vyber sampl ↓' : '+'}
                      </button>
                    );
                  })}
                </div>
              ))
            )}

            <div className="flex flex-wrap gap-1.5 mt-2">
              {NASTROJE.map((n) => (
                <button
                  key={n.id}
                  onClick={() => skladackaService.pridejStopu(n.popis)}
                  className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/[0.05] text-neutral-300 hover:bg-white/[0.12] cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> {n.ikona} {n.popis}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* KNIHOVNA SAMPLŮ */}
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {NASTROJE.map((n) => (
            <button
              key={n.id}
              onClick={() => setNastroj(n.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                nastroj === n.id
                  ? 'bg-[#FF9F0A] text-black'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white'
              }`}
            >
              <span>{n.ikona}</span> {n.popis}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-wider text-neutral-500">Řadit</span>
            {RAZENI.map((r) => (
              <button
                key={r.id}
                onClick={() => setRazeni(r.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
                  razeni === r.id ? 'bg-white/[0.14] text-white' : 'text-neutral-500 hover:text-white'
                }`}
              >
                {r.popis}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={hledat}
            onChange={(e) => setHledat(e.target.value)}
            placeholder="Hledat sampl…"
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-[13px] text-white placeholder-neutral-600 outline-none focus:border-[#FF9F0A]"
          />
        </div>

        {cil && (
          <p className="text-[11px] text-[#FF9F0A]">
            Vyber sampl — vloží se do označeného políčka.
          </p>
        )}

        {chyba && (
          <p className="text-[11px] text-[#FF453A] flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
          </p>
        )}

        <div className="max-h-[38vh] overflow-y-auto space-y-1 pr-1">
          {nacitam && (
            <p className="text-[11px] text-neutral-600 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Načítám…
            </p>
          )}

          {!nacitam && serazene.length === 0 && (
            <p className="text-[11px] text-neutral-600">
              Pro tenhle nástroj zatím v knihovně žádné samply nejsou. Nahraj je v sekci Knihovna.
            </p>
          )}

          {serazene.map((s) => (
            <button
              key={s.id}
              onClick={() => vloz(s)}
              disabled={!cil}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-all ${
                cil
                  ? 'bg-white/[0.03] border-white/[0.08] hover:border-[#FF9F0A]/60 cursor-pointer'
                  : 'bg-white/[0.02] border-white/[0.05] cursor-default'
              }`}
              title={cil ? 'Vložit do označeného políčka' : 'Nejdřív klikni do políčka ve skládačce'}
            >
              <span className="text-[12px] text-white truncate flex-1">{s.nazev}</span>
              {udaj('', s.bpm ? `${s.bpm} BPM` : '')}
              {udaj('', s.tonina)}
              {udaj('', s.takt)}
              {cil && <Plus className="w-3.5 h-3.5 text-[#30D158] shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
