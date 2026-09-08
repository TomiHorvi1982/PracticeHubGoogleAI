import React, { useMemo, useRef, useState } from 'react';
import { Play, Square, Music4, Guitar } from 'lucide-react';
import {
  CvikTechniky, NAZVY_SEKVENCI, NAZVY_TECHNIK, STANDARDNI_LADENI, STUPNICE, Sekvence,
  TONY, Tonu, cvikyTechnik, midiNaPrazci, naTabulaturu, poSekvenci, polohyStupnice,
  stupniceVPoloze,
} from '../../services/cvikyTechnik';
import { audioSynth } from '../../services/audioSynth';
import { metronomService } from '../../services/metronomService';

/**
 * Stupnice a technická cvičení.
 *
 * Nic se nestahuje: stupnice se počítají z intervalů a technické vzory
 * jsou tradiční. Zásoba je proto neomezená — každá stupnice v každé
 * poloze a v pěti sekvencích, místo pár opsaných stránek.
 *
 * Tabulatura je textová, ne AlphaTab: ten čte hotové soubory Guitar Pro,
 * kdežto tohle vzniká až v prohlížeči. Přehrává se vlastní hlavou, která
 * jede po tónech v tempu metronomu.
 */

/** Jméno tónu i s oktávou, jak ho chce syntéza. */
function tonSOktavou(midi: number): string {
  return `${TONY[((midi % 12) + 12) % 12].replace('H', 'B')}${Math.floor(midi / 12) - 1}`;
}

export const StupniceRoom: React.FC = () => {
  const [rezim, setRezim] = useState<'stupnice' | 'techniky'>('stupnice');

  const [zaklad, setZaklad] = useState(48 + 9);          // A
  const [stupniceId, setStupniceId] = useState('pentatonika_moll');
  const [poloha, setPoloha] = useState(5);
  const [sekvence, setSekvence] = useState<Sekvence>('rovne');
  const [polohaTechnik, setPolohaTechnik] = useState(5);
  const [cvikId, setCvikId] = useState('chromatika');

  const [bpm, setBpm] = useState(70);
  const [hraje, setHraje] = useState(false);
  const [ktery, setKtery] = useState(-1);
  const casovace = useRef<number[]>([]);

  const stupnice = STUPNICE.find((s) => s.id === stupniceId) || STUPNICE[0];
  const techniky = useMemo(() => cvikyTechnik(polohaTechnik), [polohaTechnik]);
  const cvik: CvikTechniky = techniky.find((c) => c.id === cvikId) || techniky[0];

  const tony: Tonu[] = useMemo(() => (
    rezim === 'stupnice'
      ? poSekvenci(stupniceVPoloze(zaklad, stupnice.kroky, poloha), sekvence)
      : cvik.tony
  ), [rezim, zaklad, stupnice, poloha, sekvence, cvik]);

  const tab = useMemo(() => naTabulaturu(tony), [tony]);

  const zastav = () => {
    casovace.current.forEach(clearTimeout);
    casovace.current = [];
    metronomService.stop();
    setHraje(false);
    setKtery(-1);
  };

  /**
   * Přehraje cvik v tempu metronomu.
   *
   * Tóny jdou po osminách: čtvrtka na dobu je na cvičení moc pomalá a
   * šestnáctky se při učení nedají sledovat očima.
   */
  const prehraj = () => {
    if (hraje) { zastav(); return; }
    if (!tony.length) return;
    setHraje(true);
    metronomService.start(bpm);
    const krok = 30 / bpm;   // osmina ve vteřinách
    tony.forEach((t, i) => {
      casovace.current.push(window.setTimeout(() => {
        setKtery(i);
        audioSynth.playNote(
          tonSOktavou(midiNaPrazci(t.struna, t.prazec, STANDARDNI_LADENI)),
          'acoustic_guitar_steel' as never,
          Math.max(0.2, krok * 1.6),
          0.6,
        );
        if (i === tony.length - 1) {
          casovace.current.push(window.setTimeout(zastav, krok * 1000 + 300));
        }
      }, i * krok * 1000));
    });
  };

  const polohy = polohyStupnice(zaklad);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {([['stupnice', 'Stupnice', Music4], ['techniky', 'Techniky', Guitar]] as const).map(
          ([id, popis, Ikona]) => (
            <button
              key={id}
              onClick={() => { zastav(); setRezim(id); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-drobne font-bold cursor-pointer transition-colors ${
                rezim === id ? 'bg-znacka text-black' : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
              }`}
            >
              <Ikona className="w-3.5 h-3.5" />{popis}
            </button>
          ),
        )}
      </div>

      <div className="bg-plocha-2 border border-kresba rounded-2xl p-4 space-y-3">
        {rezim === 'stupnice' ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <label className="space-y-1">
              <span className="stitek-pole block">Základní tón</span>
              <select
                value={zaklad}
                onChange={(e) => setZaklad(Number(e.target.value))}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {/* MIDI 48 je C, a `TONY` začínají na C — čtyřicítka
                    je E, takže by jméno v nabídce nesedělo na výšku. */}
                {TONY.map((t, i) => <option key={t} value={48 + i}>{t}</option>)}
              </select>
            </label>

            <label className="space-y-1">
              <span className="stitek-pole block">Stupnice</span>
              <select
                value={stupniceId}
                onChange={(e) => setStupniceId(e.target.value)}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {STUPNICE.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
              </select>
            </label>

            <label className="space-y-1">
              <span className="stitek-pole block">Poloha na krku</span>
              <select
                value={poloha}
                onChange={(e) => setPoloha(Number(e.target.value))}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {/* Nabízejí se polohy, kde leží základní tón, i každý
                    třetí pražec — tak se stupnice po krku doopravdy posouvá. */}
                {[...new Set([...polohy, 0, 3, 5, 7, 9, 12])].sort((a, b) => a - b).map((p) => (
                  <option key={p} value={p}>
                    {p}. pražec{polohy.includes(p) ? ' — základní tón' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="stitek-pole block">Sekvence</span>
              <select
                value={sekvence}
                onChange={(e) => setSekvence(e.target.value as Sekvence)}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {(Object.keys(NAZVY_SEKVENCI) as Sekvence[]).map((s) => (
                  <option key={s} value={s}>{NAZVY_SEKVENCI[s]}</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="stitek-pole block">Cvik</span>
              <select
                value={cvikId}
                onChange={(e) => setCvikId(e.target.value)}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {techniky.map((c) => <option key={c.id} value={c.id}>{c.nazev}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="stitek-pole block">Od pražce</span>
              <input
                type="number"
                min={1}
                max={18}
                value={polohaTechnik}
                onChange={(e) => setPolohaTechnik(Number(e.target.value))}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              />
            </label>
          </div>
        )}

        <p className="text-drobne text-pismo-tlum">
          {rezim === 'stupnice' ? stupnice.popis : cvik.popis}
        </p>
        {rezim === 'techniky' && (
          <p className="text-drobne text-pozor">
            <span className="stitek-pole mr-1">pozor</span>{cvik.pozor}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={prehraj}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-drobne font-bold cursor-pointer ${
              hraje ? 'bg-chyba text-white' : 'bg-uspech text-black'
            }`}
          >
            {hraje ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {hraje ? 'Stop' : 'Přehrát'}
          </button>

          <input
            type="range"
            min={40}
            max={220}
            value={bpm}
            onChange={(e) => {
              const t = Number(e.target.value);
              setBpm(t);
              if (hraje) metronomService.nastavTempo(t);
            }}
            className="w-32 accent-znacka cursor-pointer"
          />
          <span className="text-drobne font-mono font-bold text-znacka tabular-nums w-12">{bpm}</span>
          <span className="text-stitek text-pismo-slaby">
            {tony.length} tónů · {(bpm * 2 / 60).toFixed(1)} osmin/s
          </span>
        </div>
      </div>

      {/* Tabulatura. Vysází se z tónů, takže sedí na to, co se přehrává. */}
      <div className="bg-vhloubeni border border-kresba rounded-2xl p-3 overflow-x-auto">
        <pre className="text-stitek font-mono text-pismo-tlum leading-relaxed whitespace-pre">
{tab}
        </pre>
      </div>

      {/* Hmatník: kde ty tóny leží. Hraný tón svítí. */}
      <div className="bg-plocha-2 border border-kresba rounded-2xl p-3 overflow-x-auto">
        <div className="min-w-[520px] space-y-1">
          {[5, 4, 3, 2, 1, 0].map((struna) => (
            <div key={struna} className="flex items-center gap-0.5">
              <span className="stitek-pole w-4 shrink-0">
                {['E', 'A', 'D', 'G', 'H', 'e'][struna]}
              </span>
              {Array.from({ length: 16 }, (_, p) => {
                const je = tony.findIndex((t) => t.struna === struna && t.prazec === p);
                const hraneTeď = je >= 0 && je === ktery;
                const vCviku = tony.some((t) => t.struna === struna && t.prazec === p);
                return (
                  <div
                    key={p}
                    className={`flex-1 h-5 rounded-sm border text-stitek flex items-center justify-center tabular-nums ${
                      hraneTeď
                        ? 'bg-znacka text-black border-znacka font-bold'
                        : vCviku
                          ? 'bg-znacka/20 border-znacka-okraj text-znacka'
                          : 'bg-transparent border-kresba-jemna text-transparent'
                    }`}
                    title={`${['E', 'A', 'D', 'G', 'H', 'e'][struna]} struna, ${p}. pražec`}
                  >
                    {p}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-0.5">
            <span className="w-4 shrink-0" />
            {Array.from({ length: 16 }, (_, p) => (
              <span key={p} className="flex-1 text-stitek text-pismo-slaby text-center tabular-nums">
                {[0, 3, 5, 7, 9, 12, 15].includes(p) ? p : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {rezim === 'techniky' && (
        <p className="text-stitek text-pismo-slaby">
          Technika: {NAZVY_TECHNIK[cvik.technika]} · doporučené tempo {cvik.bpmOd}–{cvik.bpmDo} BPM
        </p>
      )}
    </div>
  );
};
