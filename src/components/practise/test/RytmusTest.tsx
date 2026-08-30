import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, Activity, Gauge } from 'lucide-react';
import { vstupHrace, UderHrace, ZdrojVstupu } from '../../../services/vstupHrace';
import {
  rytmusTestu, vyhodnot, VYCHOZI, MIN_UDERU, Doba, Hodnoceni, NastaveniRytmu, StavRytmu,
} from '../../../services/rytmusTestu';
import { VstupPanel } from './VstupPanel';

/**
 * Jak jsi na tom s rytmem.
 *
 * Dvě cvičení. „Drž tempo" nechá metronom pár taktů klepat, pak ho vypne
 * a nakonec zase zapne — v tichu se ukáže, jestli tempo držíš, nebo se
 * jen vezeš. „Trefa do tempa" dá čtyři doby a zbytek je na tobě.
 *
 * Systematický posun se hlásí zvlášť od rozptylu, protože v něm je i
 * zpoždění mikrofonu a zvukové karty. Rovnoměrně opožděné hraní je pořád
 * v rytmu; rozházené není.
 */

type Cviceni = 'udrzeni' | 'tempo';

const CVICENI: Record<Cviceni, { nazev: string; popis: string; nastaveni: (bpm: number) => NastaveniRytmu }> = {
  udrzeni: {
    nazev: 'Drž tempo',
    popis: 'Dva takty s metronomem, dva bez — a tak čtyřikrát.',
    nastaveni: (bpm) => ({ ...VYCHOZI, bpm }),
  },
  tempo: {
    nazev: 'Trefa do tempa',
    popis: 'Jeden takt napovím, sedm si musíš udržet sám.',
    nastaveni: (bpm) => ({ bpm, dobVTaktu: 4, taktuSKlepanim: 1, taktuBezKlepani: 7, kol: 1 }),
  },
};

export const RytmusTest: React.FC = () => {
  const [cviceni, setCviceni] = useState<Cviceni>('udrzeni');
  const [bpm, setBpm] = useState(90);
  const [zdroje, setZdroje] = useState<ZdrojVstupu[]>([]);
  const [stav, setStav] = useState<StavRytmu>(rytmusTestu.getStav());
  const [hodnoceni, setHodnoceni] = useState<Hodnoceni | null>(null);

  const plan = useRef<Doba[]>([]);
  const udery = useRef<number[]>([]);
  const sbira = useRef(false);

  useEffect(() => rytmusTestu.subscribe(setStav), []);
  useEffect(() => () => { rytmusTestu.stop(); vstupHrace.vypniVse(); }, []);

  useEffect(
    () =>
      vstupHrace.subscribe((u: UderHrace) => {
        if (sbira.current) udery.current.push(u.cas);
      }),
    []
  );

  // Konec cvičení pozná stav služby — vyhodnotí se, až doklepe.
  useEffect(() => {
    if (stav.bezi || !sbira.current) return;
    sbira.current = false;
    setHodnoceni(vyhodnot(plan.current, udery.current, bpm));
  }, [stav.bezi, bpm]);

  const spust = useCallback(async () => {
    setHodnoceni(null);
    udery.current = [];
    plan.current = await rytmusTestu.start(CVICENI[cviceni].nastaveni(bpm));
    // Prázdný plán znamená, že se cvičení nerozjelo — pak není co sbírat.
    sbira.current = plan.current.length > 0;
  }, [cviceni, bpm]);

  const rozdilTempa = hodnoceni?.vlastniBpm != null ? hodnoceni.vlastniBpm - bpm : null;

  return (
    <div className="space-y-4">
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Activity className="w-5 h-5 text-[#0A84FF]" />
          <div className="flex-1 min-w-[220px]">
            <h3 className="text-sm font-bold text-white">Rytmus</h3>
            <p className="text-[11px] text-neutral-400">{CVICENI[cviceni].popis}</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Tempo</span>
            <input
              type="number"
              min={40}
              max={220}
              value={bpm}
              onChange={(e) => setBpm(Math.max(40, Math.min(220, Number(e.target.value) || 90)))}
              className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-sm text-white tabular-nums outline-none focus:border-[#0A84FF]"
            />
          </div>

          <button
            onClick={() => (stav.bezi ? rytmusTestu.stop() : void spust())}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
              stav.bezi ? 'bg-[#FF453A] text-white' : 'bg-[#0A84FF] text-white'
            }`}
          >
            {stav.bezi ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            {stav.bezi ? 'Stop' : 'Spustit'}
          </button>
        </div>

        {stav.chyba && (
          <p className="text-[11px] text-[#FF453A]">{stav.chyba}</p>
        )}

        <VstupPanel zdroje={zdroje} onZmena={setZdroje} />

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CVICENI) as Cviceni[]).map((c) => (
            <button
              key={c}
              onClick={() => { rytmusTestu.stop(); setCviceni(c); setHodnoceni(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                cviceni === c ? 'bg-[#0A84FF] text-white' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
              }`}
            >
              {CVICENI[c].nazev}
            </button>
          ))}
        </div>
      </div>

      {/* Mřížka dob: co zní, co mlčí a kde jsme. */}
      {(stav.bezi || plan.current.length > 0) && (
        <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-white">
              {stav.ticho ? 'Metronom mlčí — drž tempo sám' : 'Metronom klepe'}
            </span>
            <span className="ml-auto text-[10px] text-neutral-500 tabular-nums">
              {Math.max(0, stav.doba + 1)} / {stav.celkem || plan.current.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-[3px]">
            {plan.current.map((d) => (
              <div
                key={d.index}
                className={`h-5 flex-1 min-w-[8px] rounded-sm ${
                  d.index === stav.doba
                    ? 'bg-[#FF9F0A]'
                    : d.index < stav.doba
                      ? d.ticho ? 'bg-[#0A84FF]/30' : 'bg-[#0A84FF]/70'
                      : d.ticho ? 'bg-white/[0.04]' : 'bg-white/[0.12]'
                } ${d.duraz ? 'ring-1 ring-white/20' : ''}`}
                title={`${d.index + 1}. doba${d.ticho ? ' — ticho' : ''}`}
              />
            ))}
          </div>
        </div>
      )}

      {hodnoceni && hodnoceni.uderu > 0 ? (
        <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Cislo
              hodnota={`± ${hodnoceni.rozptyl} ms`}
              popis="rozkolísanost"
              barva={hodnoceni.rozptyl < 25 ? '#30D158' : hodnoceni.rozptyl < 50 ? '#FF9F0A' : '#FF453A'}
            />
            <Cislo hodnota={hodnoceni.sMetronomem != null ? `± ${hodnoceni.sMetronomem} ms` : '—'} popis="s metronomem" />
            <Cislo hodnota={hodnoceni.bezMetronomu != null ? `± ${hodnoceni.bezMetronomu} ms` : '—'} popis="bez metronomu" />
            <Cislo hodnota={`${hodnoceni.uderu}`} popis="započítaných úderů" />
          </div>

          <div className="space-y-1.5 text-[12px] text-neutral-300">
            {hodnoceni.uderu < MIN_UDERU && (
              <p className="text-[#FF9F0A]">
                Zachytilo se jen {hodnoceni.uderu} úderů — na hodnocení je to málo. Hraj do každé doby,
                ať je z čeho měřit.
              </p>
            )}
            {hodnoceni.vlastniBpm != null && (
              <p className="flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0" />
                Hrál jsi <strong className="text-white tabular-nums">{hodnoceni.vlastniBpm} BPM</strong>
                {rozdilTempa !== null && rozdilTempa !== 0 && (
                  <> — o {Math.abs(rozdilTempa)} {rozdilTempa > 0 ? 'rychleji' : 'pomaleji'}, než bylo zadané.</>
                )}
                {rozdilTempa === 0 && <> — přesně podle zadání.</>}
              </p>
            )}

            {hodnoceni.ujizdeni != null && (
              <p>
                {Math.abs(hodnoceni.ujizdeni) < 5
                  ? 'V tichu tempo drží — bez metronomu se nikam neujíždí.'
                  : hodnoceni.ujizdeni < 0
                    ? `Jakmile metronom zmlkne, zrychluješ — asi o ${Math.abs(hodnoceni.ujizdeni)} ms na takt.`
                    : `Jakmile metronom zmlkne, zpomaluješ — asi o ${hodnoceni.ujizdeni} ms na takt.`}
              </p>
            )}

            <p>
              {hodnoceni.rozptyl < 25
                ? 'Údery sedí přesně na sebe — tohle je rytmus, na kterém se dá stavět.'
                : hodnoceni.rozptyl < 50
                  ? 'Rytmus drží, ale jednotlivé údery se rozcházejí. Zkus pomalejší tempo a hraj do klepnutí, ne vedle něj.'
                  : 'Údery jsou rozházené. Vrať se o dvacet BPM níž — v pomalém tempu je slyšet, kde to ujíždí.'}
            </p>

            <p className="text-neutral-500 text-[11px]">
              Celý výkon je posunutý o {hodnoceni.posun > 0 ? '+' : ''}{hodnoceni.posun} ms proti klepnutí. Z toho
              je velká část zpoždění mikrofonu a zvukové karty, takže se do hodnocení nepočítá —
              rovnoměrně opožděné hraní je pořád v rytmu. Rozhoduje rozkolísanost a ujíždění.
            </p>
          </div>

          {/*
            Odchylky po dobách kolem vlastního posunu — ne od doby samotné.
            Kdyby se kreslely syrové, celý graf by u zpožděného vstupu ležel
            na jedné straně a nebylo by z něj vidět to podstatné: jestli se
            údery rozcházejí.
          */}
          {(() => {
            const hodnoty = hodnoceni.odchylky.map((o) => o.ms - hodnoceni.posun);
            // Měřítko podle devadesátého percentilu, ne podle nejhoršího
            // úderu: jedna ujetá nota jinak zmáčkne celý graf k čáře a
            // z ostatních není vidět nic. Co přeteče, dorazí na kraj.
            const serazene = hodnoty.map(Math.abs).sort((a, b) => a - b);
            const percentil = serazene[Math.floor(serazene.length * 0.9)] ?? 0;
            const max = Math.max(40, percentil);
            return (
              <div className="relative h-24 bg-black/30 rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
                {hodnoceni.odchylky.map((o, i) => {
                  const v = hodnoty[i];
                  const podil = Math.max(0, Math.min(1, Math.abs(v) / max));
                  return (
                    <div
                      key={i}
                      className={`absolute w-1.5 rounded-full ${o.ticho ? 'bg-[#BF5AF2]' : 'bg-[#0A84FF]'}`}
                      style={{
                        left: `${(i / Math.max(1, hodnoceni.odchylky.length - 1)) * 97}%`,
                        // Pozdě roste nahoru, brzy dolů — jako popisky po stranách.
                        [v >= 0 ? 'bottom' : 'top']: '50%',
                        height: `${Math.max(2, podil * 46)}%`,
                      }}
                      title={`${v > 0 ? '+' : ''}${Math.round(v)} ms proti vlastnímu posunu${
                        o.ticho ? ' (bez metronomu)' : ''
                      }`}
                    />
                  );
                })}
                <span className="absolute left-2 top-1 text-[9px] text-neutral-600">pozdě</span>
                <span className="absolute left-2 bottom-1 text-[9px] text-neutral-600">brzy</span>
                <span className="absolute right-2 top-1 text-[9px] text-[#BF5AF2]">
                  fialová = bez metronomu · měřítko ±{Math.round(max)} ms
                </span>
              </div>
            );
          })()}
        </div>
      ) : hodnoceni ? (
        <div className="bg-[#16161A]/50 border border-white/[0.06] rounded-2xl p-6 text-center">
          <p className="text-sm text-neutral-400">
            Žádný úder se nezachytil. Zkontroluj, že máš zapnutý vstup a že do nástroje jde slyšet.
          </p>
        </div>
      ) : null}
    </div>
  );
};

const Cislo: React.FC<{ hodnota: string; popis: string; barva?: string }> = ({ hodnota, popis, barva }) => (
  <div className="bg-black/25 rounded-xl p-3 text-center">
    <div className="text-xl font-bold tabular-nums" style={{ color: barva || '#fff' }}>
      {hodnota}
    </div>
    <div className="text-[10px] text-neutral-500 mt-0.5">{popis}</div>
  </div>
);
