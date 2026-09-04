import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Target, BookOpen, Sliders } from 'lucide-react';
import { Scale, Note } from 'tonal';
import { poslechKytary, StavPoslechu } from '../../services/poslechKytary';
import { prehravacCviceni, StavCviceni } from '../../services/prehravacCviceni';
import { FaderKanalu } from '../mixer/FaderKanalu';
import { KytaraFader } from '../mixer/KytaraFader';
import { RiffRoom } from './RiffRoom';
import { UsekZTabulatury } from './UsekZTabulatury';
import { KytaraJakoNastroj } from '../hmatnik/KytaraJakoNastroj';

/**
 * Sólová místnost.
 *
 * Nad pilováním úseku je navíc kontrola: mikrofon poslouchá, co se hraje,
 * a porovnává to s vybranou stupnicí. Ne aby to známkovalo, ale aby bylo
 * vidět, kdy člověk vypadl z tóniny — to se při hraní pozná těžko,
 * protože ucho si na vlastní chybu zvykne.
 */

const TONY = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const STUPNICE = [
  { id: 'minor pentatonic', nazev: 'Molová pentatonika', popis: 'Základ rocku a blues. Pět tónů, těžko se s nimi trefit vedle.' },
  { id: 'blues', nazev: 'Bluesová', popis: 'Pentatonika plus blue note — ta rozhoduje o výrazu.' },
  { id: 'minor', nazev: 'Přirozená moll', popis: 'Sedm tónů, temnější. Hodí se na metal i baladu.' },
  { id: 'harmonic minor', nazev: 'Harmonická moll', popis: 'Zvýšený sedmý stupeň. Odsud zní neoklasika.' },
  { id: 'major', nazev: 'Dur', popis: 'Jasná a otevřená. Těžší na sólo, než se zdá.' },
  { id: 'dorian', nazev: 'Dórský modus', popis: 'Moll s velkou sextou — jazzovější barva.' },
  { id: 'phrygian dominant', nazev: 'Frygická dominanta', popis: 'Malá sekunda a velká tercie. Orientální zvuk metalu.' },
];

export const SoloRoom: React.FC = () => {
  const [stav, setStav] = useState<StavPoslechu>(poslechKytary.getStavVerejny());
  const [ton, setTon] = useState('A');
  const [stupnice, setStupnice] = useState('minor pentatonic');
  /** Posledních pár tónů s tím, jestli patřily do stupnice. */
  const [historie, setHistorie] = useState<{ ton: string; sedi: boolean }[]>([]);
  const posledni = useRef<string | null>(null);
  const [cviceni, setCviceni] = useState<StavCviceni>(prehravacCviceni.subscribeStav());

  useEffect(() => poslechKytary.subscribe(setStav), []);
  useEffect(() => prehravacCviceni.subscribe(setCviceni), []);
  useEffect(() => () => poslechKytary.stop(), []);

  const tonyStupnice = Scale.get(`${ton} ${stupnice}`).notes;
  /** Třídy tónů jako čísla — porovnávat názvy by neuspělo na F# vs Gb. */
  const tridyStupnice = new Set(
    tonyStupnice.map((n) => (Note.chroma(n) ?? -1)).filter((c) => c >= 0),
  );

  useEffect(() => {
    if (!stav.ton) return;
    const trida = Note.chroma(Note.pitchClass(stav.ton));
    const jmeno = Note.pitchClass(stav.ton);
    if (!jmeno || jmeno === posledni.current) return;
    posledni.current = jmeno;
    setHistorie((h) => [{ ton: jmeno, sedi: trida !== null && tridyStupnice.has(trida) }, ...h].slice(0, 24));
  }, [stav.ton, tridyStupnice]);

  const trefy = historie.filter((h) => h.sedi).length;
  const procent = historie.length ? Math.round((trefy / historie.length) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Úsek přenesený z tabulatury. Nahoře schválně: když si ho člověk
          poslal, přišel sem právě kvůli němu. */}
      <UsekZTabulatury />

      {/* Kontrola hraní */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Target className="w-5 h-5 text-uspech" />
          <div className="flex-1 min-w-[200px]">
            <h3 className="text-sm font-bold text-white">Hraju v tónině?</h3>
            <p className="text-drobne text-neutral-400">
              Mikrofon poslouchá a porovnává s vybranou stupnicí. Ucho si na vlastní chybu
              zvykne — oko ne.
            </p>
          </div>
          <button
            onClick={() => (stav.poslouchá ? poslechKytary.stop() : void poslechKytary.start())}
            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer ${
              stav.poslouchá ? 'bg-chyba text-white' : 'bg-white text-black'
            }`}
          >
            {stav.poslouchá ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {stav.poslouchá ? 'Přestat' : 'Poslouchat'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ton}
            onChange={(e) => { setTon(e.target.value); setHistorie([]); }}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs cursor-pointer"
          >
            {TONY.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={stupnice}
            onChange={(e) => { setStupnice(e.target.value); setHistorie([]); }}
            className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs cursor-pointer"
          >
            {STUPNICE.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
          </select>
          {procent !== null && (
            <span
              className={`text-sm font-bold tabular-nums px-3 py-1.5 rounded-xl ${
                procent >= 85 ? 'bg-uspech/20 text-uspech'
                : procent >= 60 ? 'bg-znacka/20 text-znacka'
                : 'bg-chyba/20 text-chyba'
              }`}
            >
              {procent} % v tónině
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-stitek uppercase tracking-wider text-neutral-500 mr-1">Stupnice</span>
          {tonyStupnice.map((n) => (
            <span
              key={n}
              className={`px-2 py-1 rounded-lg text-xs font-mono font-bold ${
                Note.pitchClass(stav.ton || '') === n
                  ? 'bg-uspech text-black'
                  : 'bg-white/[0.06] text-neutral-300'
              }`}
            >
              {n}
            </span>
          ))}
        </div>

        <p className="text-drobne text-neutral-500">
          {STUPNICE.find((s) => s.id === stupnice)?.popis}
        </p>

        {historie.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {historie.map((h, i) => (
              <span
                key={i}
                className={`px-2 py-0.5 rounded-lg text-drobne font-mono ${
                  h.sedi ? 'bg-uspech/15 text-uspech' : 'bg-chyba/15 text-chyba'
                }`}
                style={{ opacity: 1 - i * 0.03 }}
              >
                {h.ton}
              </span>
            ))}
          </div>
        )}
      </div>

      {/*
        Pult: stopa proti vlastnímu nástroji.
        Cvičí se do nahrávky a vlastní kytara musí být slyšet nad ní —
        bez dvou faderů se jedno přebíjí druhým a slyšet není ani jedno.
      */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-znacka" />
          <h3 className="text-sm font-bold text-white">Pult</h3>
          <span className="text-drobne text-neutral-500">
            stopa proti kytaře — a je vidět, jak silný signál ze zvukovky chodí
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <FaderKanalu
            nazev="Stopa (sólo)"
            barva="#0A84FF"
            hlasitost={cviceni.hlasitost}
            onHlasitost={(v) => prehravacCviceni.nastavHlasitost(v)}
            uroven={cviceni.uroven}
            spicka={cviceni.spicka}
          />
          <KytaraFader
            sNahravanim
            onNahravka={(b) => void prehravacCviceni.nactiZBlobu(b)}
          />
        </div>

        {/* Čím kytara zní. Tóny se poznají ze vstupu a zahrají zvoleným
            nástrojem — na sólo se dá cvičit i proti klavíru nebo smyčcům. */}
        <KytaraJakoNastroj />

        <p className="text-stitek text-neutral-600">
          Nahranou kytaru si „Poslechnout" načte rovnou do přehrávače níž — dá se pak zpomalit a
          projet ve smyčce, takže je vidět, kde to ujíždí.
        </p>
      </div>

      {/* Pilování sóla — stejný nástroj jako u riffů */}
      <div className="flex items-center gap-2 px-1">
        <BookOpen className="w-4 h-4 text-neutral-500" />
        <span className="text-drobne text-neutral-500">
          Níž si sólo ulož, zpomal a nech tempo samo růst — stejně jako u riffů.
        </span>
      </div>
      <RiffRoom typ="solo" />
    </div>
  );
};
