import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Repeat } from 'lucide-react';
import { SCALES_DATABASE } from '../../data/chordsAndScales';
import { CVICENI, tonyCviceni } from '../../services/cviceniStupnic';
import { audioSynth, InstrumentProfile } from '../../services/audioSynth';
import { TONY } from '../../services/akordy';

/**
 * Cvičení na stupnice.
 *
 * Vybere se stupnice, tónina a vzorec; appka z toho vyrobí posloupnost
 * tónů a přehraje ji v zadaném tempu. Právě znějící tón svítí, takže je
 * vidět, kde v sekvenci člověk je — bez toho se u delších vzorců ztratí.
 */

const nazevTonu = (midi: number) => `${TONY[midi % 12]}${Math.floor(midi / 12) - 1}`;

export const CviceniStupnic: React.FC = () => {
  const [stupnice, setStupnice] = useState(SCALES_DATABASE[0]?.name || '');
  const [zaklad, setZaklad] = useState(60);
  const [cviceni, setCviceni] = useState(CVICENI[0].id);
  const [oktav, setOktav] = useState(1);
  const [tempo, setTempo] = useState(80);
  const [dokola, setDokola] = useState(true);
  const [nastroj, setNastroj] = useState<InstrumentProfile>('acoustic_dreadnought');

  const [hraje, setHraje] = useState(false);
  const [kde, setKde] = useState(-1);
  const casovac = useRef<ReturnType<typeof setInterval> | null>(null);

  const vybrana = SCALES_DATABASE.find((s) => s.name === stupnice);
  const vzorec = CVICENI.find((c) => c.id === cviceni);

  const tony = useMemo(() => {
    if (!vybrana || !vzorec) return [];
    return tonyCviceni(zaklad, vybrana.intervals, vzorec.stupne(vybrana.intervals.length, oktav));
  }, [vybrana, vzorec, zaklad, oktav]);

  const zastav = () => {
    if (casovac.current) clearInterval(casovac.current);
    casovac.current = null;
    setHraje(false);
    setKde(-1);
  };

  useEffect(() => zastav, []);
  // Změna vzorce nebo stupnice za běhu by hrála podle starého seznamu.
  useEffect(() => { if (hraje) zastav(); }, [stupnice, cviceni, zaklad, oktav]);

  const spust = () => {
    if (hraje || !tony.length) return;
    setHraje(true);
    let i = 0;
    const krok = () => {
      if (i >= tony.length) {
        if (!dokola) { zastav(); return; }
        i = 0;
      }
      setKde(i);
      audioSynth.playNote(nazevTonu(tony[i]), nastroj, 0.7, 0.7);
      i += 1;
    };
    krok();
    // Osminy: dvě noty na dobu, jak se stupnice běžně cvičí.
    casovac.current = setInterval(krok, 30000 / tempo);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Stupnice</span>
          <select
            value={stupnice}
            onChange={(e) => setStupnice(e.target.value)}
            className="w-full mt-0.5 bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none focus:border-[#BF5AF2] cursor-pointer"
          >
            {SCALES_DATABASE.map((s) => (
              <option key={s.name} value={s.name}>{s.czName}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Základní tón</span>
          <select
            value={zaklad}
            onChange={(e) => setZaklad(Number(e.target.value))}
            className="w-full mt-0.5 bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none focus:border-[#BF5AF2] cursor-pointer"
          >
            {TONY.map((t, i) => (
              <option key={t} value={60 + i}>{t}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Vzorec</span>
          <select
            value={cviceni}
            onChange={(e) => setCviceni(e.target.value)}
            className="w-full mt-0.5 bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none focus:border-[#BF5AF2] cursor-pointer"
          >
            {CVICENI.map((c) => (
              <option key={c.id} value={c.id}>{c.nazev}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Oktávy</span>
          <select
            value={oktav}
            onChange={(e) => setOktav(Number(e.target.value))}
            className="w-full mt-0.5 bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none focus:border-[#BF5AF2] cursor-pointer"
          >
            {[1, 2, 3].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      </div>

      {vybrana && <p className="text-[11px] text-neutral-500">{vybrana.description}</p>}
      {vzorec && <p className="text-[11px] text-neutral-400">{vzorec.popis}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => (hraje ? zastav() : spust())}
          disabled={!tony.length}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 ${
            hraje ? 'bg-[#FF453A] text-white' : 'bg-[#BF5AF2] text-white hover:bg-[#c96ff5]'
          }`}
        >
          {hraje ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {hraje ? 'Zastavit' : 'Přehrát'}
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Tempo</span>
          <input
            type="range"
            min={40}
            max={200}
            value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
            className="w-28 accent-[#BF5AF2] cursor-pointer"
          />
          <span className="text-xs font-mono text-[#BF5AF2] tabular-nums w-14">{tempo} BPM</span>
        </div>

        <button
          onClick={() => setDokola((d) => !d)}
          className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border cursor-pointer flex items-center gap-1.5 ${
            dokola
              ? 'bg-[#30D158]/15 border-[#30D158]/40 text-[#30D158]'
              : 'bg-white/[0.06] border-white/10 text-neutral-400'
          }`}
        >
          <Repeat className="w-3.5 h-3.5" /> dokola
        </button>

        <select
          value={nastroj}
          onChange={(e) => setNastroj(e.target.value as InstrumentProfile)}
          className="bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-[11px] text-white outline-none cursor-pointer"
        >
          <option value="acoustic_dreadnought">Akustická kytara</option>
          <option value="grand_piano_steinway">Klavír</option>
          <option value="electric_strat_clean">Elektrická kytara</option>
          <option value="electric_lespaul_crunch">Elektrická — crunch</option>
        </select>
      </div>

      {/* Posloupnost tónů. Právě znějící svítí — u delších vzorců se
          jinak nedá poznat, kde v sekvenci člověk je. */}
      <div className="bg-black/40 border border-white/10 rounded-2xl p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">
            Posloupnost ({tony.length} tónů)
          </span>
        </div>
        <div className="flex flex-wrap gap-1 max-h-[130px] overflow-y-auto">
          {tony.map((m, i) => (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                i === kde ? 'bg-[#BF5AF2] text-white' : 'bg-white/[0.06] text-neutral-400'
              }`}
            >
              {nazevTonu(m)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
