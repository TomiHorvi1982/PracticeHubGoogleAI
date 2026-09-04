import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2, AlertCircle, Piano, Volume2 } from 'lucide-react';
import { vstupHrace, UderHrace } from '../../services/vstupHrace';
import { SberacAkordu, MEZERA_MS } from '../../services/sberAkordu';
import { pojmenujAkord, Rozpoznany, TONY } from '../../services/akordy';
import { audioSynth } from '../../services/audioSynth';

/**
 * Akord z kytary ukázaný na klaviatuře.
 *
 * Zahraješ struny po sobě, tóny se nasbírají do jednoho akordu, ten se
 * pojmenuje a rovnou se ukáže, jak ho vzít na klavír. Kytarista tím
 * dostane hmat, který by jinak hledal v tabulce — a naopak slyší, jak
 * jeho akord zní na jiném nástroji.
 */

/** Kolik oktáv klaviatury se kreslí. Dvě pojmou i široce rozložený akord. */
const OKTAV = 2;
const BILE = [0, 2, 4, 5, 7, 9, 11];
const CERNE_ZA = [0, 1, 3, 4, 5];

const nazevTonu = (midi: number) => `${TONY[midi % 12]}${Math.floor(midi / 12) - 1}`;

export const AkordZKytary: React.FC = () => {
  const [poslouchá, setPoslouchá] = useState(false);
  const [zapina, setZapina] = useState(false);
  const [rozpracovane, setRozpracovane] = useState<number[]>([]);
  const [akord, setAkord] = useState<{ tony: number[]; nalez: Rozpoznany | null } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  const sberac = useRef(new SberacAkordu());
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vyhodnot = (tony: number[]) => {
    if (tony.length < 2) return;
    setAkord({ tony, nalez: pojmenujAkord(tony) });
    setRozpracovane([]);
  };

  useEffect(() => {
    if (!poslouchá) return;

    const odhlas = vstupHrace.subscribe((u: UderHrace) => {
      const hotovy = sberac.current.pridej({ midi: u.midi, cas: u.cas });
      if (hotovy) vyhodnot(hotovy);
      setRozpracovane(sberac.current.rozpracovany());

      /**
       * Doznění uzavře akord i bez dalšího tónu.
       *
       * Poslední akord by jinak zůstal viset — nikdo už nezahraje tón,
       * který by ho uzavřel, a na obrazovce by zůstaly rozehrané tóny
       * bez vyhodnocení.
       */
      if (casovac.current) clearTimeout(casovac.current);
      casovac.current = setTimeout(() => {
        const zbytek = sberac.current.uzavri();
        if (zbytek) vyhodnot(zbytek);
        setRozpracovane([]);
      }, MEZERA_MS + 200);
    });

    return () => {
      odhlas();
      if (casovac.current) clearTimeout(casovac.current);
    };
  }, [poslouchá]);

  const prepni = async () => {
    setChyba(null);
    if (poslouchá) {
      vstupHrace.vypniMikrofon();
      sberac.current.vycisti();
      setRozpracovane([]);
      setPoslouchá(false);
      return;
    }
    setZapina(true);
    try {
      await vstupHrace.zapniMikrofon();
      setPoslouchá(true);
    } catch (e: any) {
      setChyba(e?.message || 'Mikrofon se nepodařilo zapnout.');
    } finally {
      setZapina(false);
    }
  };

  /** Klaviatura začíná od C pod nejnižším tónem akordu, ať se do ní vejde. */
  const zaklad = akord?.tony.length
    ? Math.floor(Math.min(...akord.tony) / 12) * 12
    : 48;
  const zvyraznene = new Set(akord?.tony || rozpracovane);

  const zahraj = () => {
    for (const m of akord?.tony || []) {
      audioSynth.playNote(nazevTonu(m), 'piano', 1.6, 0.6);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void prepni()}
          disabled={zapina}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 ${
            poslouchá ? 'bg-chyba text-white' : 'bg-nastroj text-white hover:bg-nastroj-svetla'
          }`}
        >
          {zapina ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : poslouchá ? <MicOff className="w-3.5 h-3.5" />
            : <Mic className="w-3.5 h-3.5" />}
          {poslouchá ? 'Zastavit poslech' : 'Poslouchat kytaru'}
        </button>

        {akord && (
          <button
            onClick={zahraj}
            className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] border border-white/10 text-neutral-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
            title="Přehrát akord klavírem"
          >
            <Volume2 className="w-3.5 h-3.5" /> Zahrát klavírem
          </button>
        )}
      </div>

      <p className="text-drobne text-neutral-500 leading-relaxed">
        Rozeber akord po strunách. Tóny se nasbírají, akord se pojmenuje a ukáže se, jak ho vzít
        na klavír.
      </p>

      {chyba && (
        <p className="text-drobne text-chyba flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
        </p>
      )}

      {/* Co se právě sbírá — bez toho není poznat, jestli appka vůbec slyší. */}
      {poslouchá && rozpracovane.length > 0 && (
        <div className="flex items-center gap-1.5 text-drobne text-nastroj">
          <span className="w-2 h-2 rounded-full bg-nastroj animate-pulse" />
          slyším: {rozpracovane.map(nazevTonu).join(' · ')}
        </div>
      )}

      {akord && (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-white">
              {akord.nalez ? akord.nalez.nazev : 'neznámý akord'}
            </span>
            {akord.nalez && (
              <>
                <span className="text-drobne text-neutral-400">{akord.nalez.popis}</span>
                {akord.nalez.jistota === 'pribuzne' && (
                  <span className="text-stitek px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                    nejbližší shoda
                  </span>
                )}
              </>
            )}
          </div>

          <div className="text-drobne text-neutral-500">
            zahrané tóny: {akord.tony.map(nazevTonu).join(' · ')}
          </div>

          {/* Klaviatura s hmatem. */}
          <div className="pt-1">
            <div className="text-stitek uppercase tracking-widest text-neutral-500 mb-1.5 flex items-center gap-1.5">
              <Piano className="w-3.5 h-3.5" /> na klavír
            </div>
            <div className="relative h-24 flex select-none">
              {Array.from({ length: OKTAV * 7 }, (_, i) => {
                const midi = zaklad + Math.floor(i / 7) * 12 + BILE[i % 7];
                const svit = zvyraznene.has(midi);
                return (
                  <div
                    key={i}
                    className={`flex-1 border border-black/40 rounded-b-md flex items-end justify-center pb-1 text-stitek font-bold ${
                      svit ? 'bg-nastroj text-white' : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    {svit ? TONY[midi % 12] : ''}
                  </div>
                );
              })}

              {Array.from({ length: OKTAV }, (_, o) =>
                CERNE_ZA.map((b) => {
                  const midi = zaklad + o * 12 + BILE[b] + 1;
                  const svit = zvyraznene.has(midi);
                  const sirkaBile = 100 / (OKTAV * 7);
                  const levo = (o * 7 + b + 1) * sirkaBile;
                  return (
                    <div
                      key={`${o}-${b}`}
                      style={{ left: `calc(${levo}% - ${sirkaBile * 0.3}%)`, width: `${sirkaBile * 0.6}%` }}
                      className={`absolute top-0 h-14 rounded-b-md border border-black/60 flex items-end justify-center pb-1 text-stitek font-bold ${
                        svit ? 'bg-nastroj text-white' : 'bg-neutral-900 text-transparent'
                      }`}
                    >
                      {svit ? TONY[midi % 12] : ''}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
