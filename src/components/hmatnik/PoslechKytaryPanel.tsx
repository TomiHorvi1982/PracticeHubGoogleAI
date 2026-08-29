import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Eraser, ArrowRight } from 'lucide-react';
import { Key, Note } from 'tonal';
import { poslechKytary, StavPoslechu } from '../../services/poslechKytary';
import { audioSynth, InstrumentProfile } from '../../services/audioSynth';
import { ALL_INSTRUMENTS } from '../../data/instrumentPresets';

/**
 * Co zrovna hraješ — a co k tomu sedí.
 *
 * Ladička říká, jestli je struna naladěná; tohle říká, v čem hraješ.
 * Z posledních zahraných tónů vyjde stupnice a z ní akordy, které do ní
 * patří — a jedním tlačítkem se to přenese do hmatníku, aby se to nemuselo
 * hledat ručně.
 */

export const PoslechKytaryPanel: React.FC<{
  onUkazNaHmatniku?: (ton: string, stupnice: string) => void;
  /** Hlásí ven, co zrovna zní — hmatník to podle toho rozsvítí. */
  onTon?: (ton: string | null) => void;
}> = ({ onUkazNaHmatniku, onTon }) => {
  const [stav, setStav] = useState<StavPoslechu>({
    ozvena: false, poslouchá: false, ton: null, centy: 0, frekvence: 0,
    historie: [], stupnice: [], akord: [], chyba: null,
  });

  /**
   * Nástroj, kterým se ozývá to, co se slyší.
   *
   * Na výběr je celá banka, ne jen kytary: rozpoznaná je výška tónu, a tu
   * zahraje cokoli. Zahraješ na kytaru a z beden jdou housle — a taky je
   * to jediný způsob, jak si zkusit, jak by ta linka zněla na jiný nástroj.
   *
   * Seskupené po kategoriích, protože dvě stě položek v jednom seznamu
   * se nedá projít.
   */
  const SKUPINY = (() => {
    const m = new Map<string, typeof ALL_INSTRUMENTS>();
    for (const i of ALL_INSTRUMENTS) {
      const k = i.czCategory || 'Ostatní';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    return [...m.entries()];
  })();
  const KYTARY = ALL_INSTRUMENTS.filter((i) => i.category === 'guitars_plucked');
  const [nastroj, setNastroj] = useState<InstrumentProfile>(() => {
    const ulozeny = localStorage.getItem('neverlate_zvuk_hmatniku');
    return (ulozeny && ALL_INSTRUMENTS.some((k) => k.id === ulozeny)
      ? ulozeny
      : 'acoustic_dreadnought') as InstrumentProfile;
  });

  useEffect(() => poslechKytary.subscribe(setStav), []);
  useEffect(() => { onTon?.(stav.ton); }, [stav.ton, onTon]);
  // Mikrofon nesmí zůstat zapnutý po odchodu ze sekce.
  useEffect(() => () => poslechKytary.stop(), []);

  /** Akordy, které do nalezené stupnice patří. */
  const akordyStupnice = (() => {
    const prvni = stav.stupnice[0];
    if (!prvni) return [];
    const [ton, ...zbytek] = prvni.split(' ');
    const nazev = zbytek.join(' ');
    try {
      return nazev.includes('minor')
        ? Key.minorKey(ton).natural.chords.slice(0, 7)
        : Key.majorKey(ton).chords.slice(0, 7);
    } catch {
      return [];
    }
  })();

  const ladeni = Math.abs(stav.centy) <= 8;

  return (
    <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => (stav.poslouchá ? poslechKytary.stop() : void poslechKytary.start())}
          className={`px-4 py-2 rounded-2xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
            stav.poslouchá ? 'bg-[#FF453A] text-white' : 'bg-white text-black hover:bg-neutral-200'
          }`}
        >
          {stav.poslouchá ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {stav.poslouchá ? 'Přestat poslouchat' : 'Poslouchat kytaru'}
        </button>

        <div>
          <div className="text-xs font-bold text-white">Co hraješ</div>
          <p className="text-[11px] text-neutral-400">
            Zahraj pár taktů a appka pozná stupnici i akordy, které do ní patří.
          </p>
        </div>

        {/* Ozvěna: co mikrofon slyší, to zahraje vybraný nástroj.
            Kytara se tím dá poslouchat jako klavír nebo mandolína. */}
        <label
          className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer"
          title="Zahraje vybraným nástrojem, co zrovna slyší"
        >
          <input
            type="checkbox"
            checked={stav.ozvena}
            onChange={(e) => poslechKytary.nastavOzvenu(e.target.checked, nastroj)}
            className="accent-[#30D158] cursor-pointer"
          />
          Přehrávat, co slyším
        </label>
        <select
          value={nastroj}
          disabled={!stav.ozvena}
          onChange={(e) => {
            const v = e.target.value as InstrumentProfile;
            setNastroj(v);
            localStorage.setItem('neverlate_zvuk_hmatniku', v);
            poslechKytary.nastavNastroj(v);
            void audioSynth.preloadInstrument(v);
          }}
          className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-neutral-200 cursor-pointer disabled:opacity-40 max-w-[190px]"
        >
          {SKUPINY.map(([kategorie, nastroje]) => (
            <optgroup key={kategorie} label={kategorie}>
              {nastroje.map((n) => (
                <option key={n.id} value={n.id}>{n.icon} {n.czName}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {stav.historie.length > 0 && (
          <button
            onClick={() => poslechKytary.vymazHistorii()}
            className="ml-auto text-[11px] text-neutral-500 hover:text-white cursor-pointer flex items-center gap-1.5"
          >
            <Eraser className="w-3.5 h-3.5" /> Zapomenout
          </button>
        )}
      </div>

      {stav.chyba && <div className="text-[11px] text-[#FF453A]">{stav.chyba}</div>}

      {/* Právě znějící tón */}
      <div className="flex items-center gap-5">
        <div className="w-24 text-center">
          <div className={`text-4xl font-black tabular-nums ${stav.ton ? 'text-white' : 'text-neutral-700'}`}>
            {stav.ton ? Note.pitchClass(stav.ton) : '—'}
          </div>
          <div className="text-[10px] font-mono text-neutral-500">
            {stav.ton ? `${stav.ton} · ${stav.frekvence.toFixed(1)} Hz` : 'ticho'}
          </div>
        </div>

        {/* Odchylka v centech: střed je čistý tón. */}
        <div className="flex-1">
          <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="absolute left-1/2 top-0 w-px h-full bg-white/40" />
            {stav.ton && (
              <div
                className={`absolute top-0 h-full w-1.5 rounded-full ${ladeni ? 'bg-[#30D158]' : 'bg-[#FF9F0A]'}`}
                style={{ left: `calc(${50 + Math.max(-50, Math.min(50, stav.centy))}% - 3px)` }}
              />
            )}
          </div>
          <div className="flex justify-between text-[9px] text-neutral-600 mt-1">
            <span>-50 c</span>
            <span className={ladeni ? 'text-[#30D158]' : 'text-neutral-400'}>
              {stav.ton ? `${stav.centy > 0 ? '+' : ''}${stav.centy} centů` : ''}
            </span>
            <span>+50 c</span>
          </div>
        </div>
      </div>

      {/* Co zaznělo */}
      <div className="flex flex-wrap gap-1.5">
        {stav.historie.length === 0 && (
          <span className="text-[11px] text-neutral-500">Zatím nic — zahraj pár tónů.</span>
        )}
        {stav.historie.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="px-2 py-0.5 rounded-lg text-[11px] font-mono border border-white/10 text-neutral-300"
            style={{ opacity: 1 - i * 0.03 }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* Nález */}
      {(stav.stupnice.length > 0 || stav.akord.length > 0) && (
        <div className="border-t border-white/[0.06] pt-3 space-y-2">
          {stav.akord.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-20">Akord</span>
              {stav.akord.map((a) => (
                <span key={a} className="px-2 py-1 rounded-lg bg-[#0A84FF]/15 text-[#0A84FF] text-xs font-bold">
                  {a}
                </span>
              ))}
            </div>
          )}

          {stav.stupnice.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-20">Stupnice</span>
              {stav.stupnice.map((s, i) => (
                <button
                  key={s}
                  onClick={() => {
                    const [ton, ...zbytek] = s.split(' ');
                    onUkazNaHmatniku?.(ton, zbytek.join(' '));
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${
                    i === 0
                      ? 'bg-[#FF9F0A]/20 text-[#FF9F0A] hover:bg-[#FF9F0A]/30'
                      : 'bg-white/[0.05] text-neutral-400 hover:text-white'
                  }`}
                  title="Ukázat na hmatníku"
                >
                  {s}
                  <ArrowRight className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}

          {akordyStupnice.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-20">Sedí k tomu</span>
              {akordyStupnice.map((a) => (
                <span key={a} className="px-2 py-1 rounded-lg bg-white/[0.05] text-neutral-300 text-xs font-mono">
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
