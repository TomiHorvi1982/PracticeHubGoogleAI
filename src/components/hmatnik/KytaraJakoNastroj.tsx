import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2, AlertCircle, Headphones } from 'lucide-react';
import { vstupHrace, UderHrace } from '../../services/vstupHrace';
import { audioSynth, INSTRUMENT_PROFILES, InstrumentProfile } from '../../services/audioSynth';
import { AparatOvladani } from './AparatOvladani';

/**
 * Kytara znějící jiným nástrojem.
 *
 * Zahraješ na kytaru, detekce z toho vyčte tón a ten se ozve zvoleným
 * nástrojem — kytara tak hraje jako klavír, varhany nebo cokoli dalšího
 * z knihovny zvuků.
 *
 * Údery si neřešíme sami: detekce už hlásí jednotlivé tóny, ne souvislý
 * proud, takže se hraje jeden tón na jeden ohlášený úder.
 */

/** Jak dlouho zvolený nástroj drží tón. Kytarový úder doznívá kolem dvou vteřin. */
const DELKA_S = 2.2;

export const KytaraJakoNastroj: React.FC = () => {
  const [hraje, setHraje] = useState(false);
  const [zapina, setZapina] = useState(false);
  const [nastroj, setNastroj] = useState<InstrumentProfile>('electric_strat_clean');
  const [hlasitost, setHlasitost] = useState(0.7);
  const [posledni, setPosledni] = useState<string[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitaZvuk, setNacitaZvuk] = useState(false);

  const nastrojRef = useRef(nastroj);
  nastrojRef.current = nastroj;
  const hlasitostRef = useRef(hlasitost);
  hlasitostRef.current = hlasitost;

  /**
   * Zvuk se dotahuje předem.
   *
   * Bez toho by první zahraný tón zněl náhradní syntézou, než se stihne
   * stáhnout vzorek — a to je právě ten tón, podle kterého člověk soudí,
   * jestli to vůbec funguje.
   */
  useEffect(() => {
    let zivy = true;
    setNacitaZvuk(true);
    void audioSynth
      .preloadInstrument(nastroj)
      .catch(() => { /* náhradní syntéza zahraje i bez vzorků */ })
      .finally(() => { if (zivy) setNacitaZvuk(false); });
    return () => { zivy = false; };
  }, [nastroj]);

  useEffect(() => {
    if (!hraje) return;
    return vstupHrace.subscribe((u: UderHrace) => {
      audioSynth.playNote(u.ton, nastrojRef.current, DELKA_S, hlasitostRef.current);
      // Posledních pár tónů na obrazovce: bez nich není poznat, jestli
      // appka slyší to, co se hraje, nebo něco úplně jiného.
      setPosledni((p) => [u.ton, ...p].slice(0, 8));
    });
  }, [hraje]);

  const prepni = async () => {
    setChyba(null);
    if (hraje) {
      vstupHrace.vypniMikrofon();
      setHraje(false);
      setPosledni([]);
      return;
    }
    setZapina(true);
    try {
      await vstupHrace.zapniMikrofon();
      setHraje(true);
    } catch (e: any) {
      setChyba(e?.message || 'Mikrofon se nepodařilo zapnout.');
    } finally {
      setZapina(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void prepni()}
          disabled={zapina}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 ${
            hraje ? 'bg-[#FF453A] text-white' : 'bg-[#BF5AF2] text-white hover:bg-[#c96ff5]'
          }`}
        >
          {zapina ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : hraje ? <MicOff className="w-3.5 h-3.5" />
            : <Mic className="w-3.5 h-3.5" />}
          {hraje ? 'Zastavit' : 'Hrát kytarou'}
        </button>

        <select
          value={nastroj}
          onChange={(e) => setNastroj(e.target.value as InstrumentProfile)}
          className="flex-1 min-w-[200px] bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#BF5AF2] cursor-pointer"
        >
          {INSTRUMENT_PROFILES.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>

        {nacitaZvuk && <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">Hlasitost</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(hlasitost * 100)}
          onChange={(e) => setHlasitost(Number(e.target.value) / 100)}
          className="flex-1 max-w-[220px] accent-[#BF5AF2] cursor-pointer"
        />
        <span className="text-xs font-mono text-[#BF5AF2] tabular-nums w-10">
          {Math.round(hlasitost * 100)} %
        </span>
      </div>

      <AparatOvladani />

      {/* Zpětná vazba přes reproduktory je tady horší než jinde: nástroj
          hraje tóny, které mikrofon zase uslyší a zahraje znovu. */}
      <p className="text-[11px] text-amber-500/80 flex items-start gap-1.5 leading-relaxed">
        <Headphones className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Pusť si to do sluchátek. Z reproduktorů mikrofon uslyší i zvolený nástroj a bude ho
        hrát znovu dokola.
      </p>

      {chyba && (
        <p className="text-[11px] text-[#FF453A] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
        </p>
      )}

      {hraje && (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-3">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5">
            Co slyším
          </div>
          {posledni.length === 0 ? (
            <p className="text-[11px] text-neutral-600">Zatím ticho — zahraj tón.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {posledni.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold tabular-nums ${
                    i === 0 ? 'bg-[#BF5AF2] text-white' : 'bg-white/[0.06] text-neutral-400'
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
