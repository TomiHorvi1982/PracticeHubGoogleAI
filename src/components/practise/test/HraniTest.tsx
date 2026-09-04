import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Ear, Eye, Check, Guitar, Piano as PianoIkona } from 'lucide-react';
import { Chord } from 'tonal';
import { audioSynth } from '../../../services/audioSynth';
import { vstupHrace, UderHrace, ZdrojVstupu } from '../../../services/vstupHrace';
import { poslechKytary } from '../../../services/poslechKytary';
import {
  DruhUkolu, ZpusobZadani, Ukol, StavUkolu, doOktavy,
  vytvorUkol, vyhodnotUder, jeHotovo, pocetChyb, prumerCentu,
} from '../../../services/hraniTestu';
import { HmatnikTestu } from './HmatnikTestu';
import { KlavesyTestu } from './KlavesyTestu';
import { VstupPanel } from './VstupPanel';

/**
 * Zahraj, co ti zadám.
 *
 * Zadání jde ukázat napsané, nebo přehrát — druhá varianta zkouší ucho,
 * ne paměť na názvy. Trefy se ověřují detekcí: co přijde z kytary, z MIDI
 * kláves nebo z počítačové klávesnice, se porovná s úkolem, a na hmatníku
 * i na klaviatuře je vidět, co ještě chybí a o kolik šla chyba vedle.
 */

const DRUHY: { id: DruhUkolu; nazev: string; popis: string }[] = [
  { id: 'ton', nazev: 'Tón', popis: 'Jeden tón, kdekoli na nástroji' },
  { id: 'akord', nazev: 'Akord', popis: 'Všechny tóny akordu' },
  { id: 'stupnice', nazev: 'Stupnice', popis: 'Celá stupnice, pořadí nerozhoduje' },
  { id: 'podklad', nazev: 'Podklad', popis: 'Hraje kadence, ty improvizuješ v tónině' },
];

/** Přehraje zadání. Klavír má rovnou výšku, dá se po něm trefovat. */
function prehrajUkol(u: Ukol): void {
  if (u.druh === 'akord') {
    audioSynth.playPianoChord(u.ukazka);
    return;
  }
  if (u.druh === 'stupnice') {
    u.ukazka.forEach((t, i) =>
      window.setTimeout(() => audioSynth.playNote(t, 'grand_piano_steinway', 0.7, 0.5), i * 320)
    );
    return;
  }
  if (u.druh === 'podklad') {
    u.ukazka.forEach((nazev, i) => {
      const tony = Chord.get(nazev).notes;
      if (!tony.length) return;
      window.setTimeout(() => audioSynth.playPianoChord(doOktavy(tony, 3)), i * 1400);
    });
    return;
  }
  audioSynth.playNote(u.ukazka[0], 'grand_piano_steinway', 1.5, 0.55);
}

const PRAZDNY: StavUkolu = { trefene: [], trefy: [] };

export const HraniTest: React.FC = () => {
  const [druh, setDruh] = useState<DruhUkolu>('akord');
  const [zpusob, setZpusob] = useState<ZpusobZadani>('napsane');
  const [zdroje, setZdroje] = useState<ZdrojVstupu[]>([]);
  const [nastroj, setNastroj] = useState<'kytara' | 'klavesy'>('kytara');
  const [ukol, setUkol] = useState<Ukol | null>(null);
  const [stav, setStav] = useState<StavUkolu>(PRAZDNY);
  const [hotovo, setHotovo] = useState(false);
  const [odhaleno, setOdhaleno] = useState(false);
  const [zniciTon, setZniciTon] = useState<string | null>(null);
  const [splneno, setSplneno] = useState(0);

  // Posluchač úderů se registruje jednou, ale musí vidět aktuální úkol.
  const ukolRef = useRef<Ukol | null>(null);
  const hotovoRef = useRef(false);
  ukolRef.current = ukol;
  hotovoRef.current = hotovo;

  useEffect(() => poslechKytary.subscribe((s) => setZniciTon(s.ton)), []);
  // Odchod z místnosti nesmí nechat běžet mikrofon ani odchytávat klávesy.
  useEffect(() => () => vstupHrace.vypniVse(), []);

  useEffect(() => {
    return vstupHrace.subscribe((u: UderHrace) => {
      const akt = ukolRef.current;
      if (!akt || hotovoRef.current) return;
      setStav((s) => {
        const novy = vyhodnotUder(akt, s, u);
        if (jeHotovo(akt, novy)) {
          setHotovo(true);
          setOdhaleno(true);
          setSplneno((x) => x + 1);
        }
        return novy;
      });
    });
  }, []);

  const zadej = useCallback(
    (d: DruhUkolu = druh, z: ZpusobZadani = zpusob) => {
      const u = vytvorUkol(d, z);
      setUkol(u);
      setStav(PRAZDNY);
      setHotovo(false);
      setOdhaleno(z === 'napsane' || d === 'podklad');
      // Poslechové zadání se musí ozvat, jinak není co hádat.
      if (z === 'poslech' || d === 'podklad') window.setTimeout(() => prehrajUkol(u), 300);
    },
    [druh, zpusob]
  );

  const chyby = pocetChyb(stav);
  const centy = prumerCentu(stav);
  const posledniChyba = [...stav.trefy].reverse().find((t) => !t.spravne && t.minulO > 0) || null;
  const chybi = ukol ? ukol.cilove.filter((c) => !stav.trefene.includes(c)) : [];

  return (
    <div className="space-y-4">
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <h3 className="text-sm font-bold text-white">Zahraj, co ti zadám</h3>
            <p className="text-drobne text-neutral-400">
              Trefu ověří detekce tónu — z kytary, z MIDI kláves i z klávesnice.
            </p>
          </div>
          <div className="flex items-center gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-uspech tabular-nums">{splneno}</div>
              <div className="text-stitek text-neutral-500">splněno</div>
            </div>
            <div>
              <div className="text-lg font-bold text-chyba tabular-nums">{chyby}</div>
              <div className="text-stitek text-neutral-500">chyb</div>
            </div>
            {centy !== null && (
              <div>
                <div className="text-lg font-bold text-znacka tabular-nums">{centy}¢</div>
                <div className="text-stitek text-neutral-500">intonace</div>
              </div>
            )}
          </div>
        </div>

        <VstupPanel zdroje={zdroje} onZmena={setZdroje} />

        <div className="flex flex-wrap gap-1.5">
          {DRUHY.map((d) => (
            <button
              key={d.id}
              onClick={() => { setDruh(d.id); zadej(d.id, zpusob); }}
              title={d.popis}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                druh === d.id ? 'bg-nastroj text-white' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
              }`}
            >
              {d.nazev}
            </button>
          ))}

          <div className="ml-auto flex gap-1.5">
            {/* Podklad se nedá zadat po sluchu — hraje pořád. */}
            {druh !== 'podklad' && (
              <button
                onClick={() => {
                  const z = zpusob === 'napsane' ? 'poslech' : 'napsane';
                  setZpusob(z);
                  zadej(druh, z);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/[0.06] text-neutral-200 cursor-pointer flex items-center gap-1.5"
              >
                {zpusob === 'napsane' ? <Eye className="w-3.5 h-3.5" /> : <Ear className="w-3.5 h-3.5" />}
                {zpusob === 'napsane' ? 'Napsané' : 'Po sluchu'}
              </button>
            )}
            <button
              onClick={() => setNastroj(nastroj === 'kytara' ? 'klavesy' : 'kytara')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/[0.06] text-neutral-200 cursor-pointer flex items-center gap-1.5"
            >
              {nastroj === 'kytara' ? <Guitar className="w-3.5 h-3.5" /> : <PianoIkona className="w-3.5 h-3.5" />}
              {nastroj === 'kytara' ? 'Hmatník' : 'Klávesy'}
            </button>
          </div>
        </div>
      </div>

      {ukol ? (
        <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="text-stitek uppercase tracking-wider text-neutral-500">
                {DRUHY.find((d) => d.id === ukol.druh)?.nazev}
                {ukol.zpusob === 'poslech' && ' po sluchu'}
              </div>
              <h4 className="text-2xl font-bold text-white">
                {odhaleno ? ukol.nazev : '? ? ?'}
              </h4>
              <p className="text-drobne text-neutral-500 mt-0.5">
                {ukol.druh === 'podklad'
                  ? 'Improvizuj do kadence — počítají se tóny mimo tóninu.'
                  : odhaleno
                    ? `Chybí: ${chybi.join(' ') || '—'}`
                    : 'Poslechni si zadání a zahraj ho.'}
              </p>
            </div>

            <button
              onClick={() => prehrajUkol(ukol)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/[0.06] text-neutral-200 cursor-pointer flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Přehrát znovu
            </button>
            {!odhaleno && (
              <button
                onClick={() => setOdhaleno(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/[0.06] text-neutral-200 cursor-pointer"
              >
                Vzdát to
              </button>
            )}
            <button
              onClick={() => zadej()}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-znacka text-black cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Další
            </button>
          </div>

          {hotovo && (
            <div className="flex items-center gap-2 text-uspech text-sm font-bold">
              <Check className="w-4 h-4" /> Sedí — {ukol.nazev}
              {chyby > 0 && <span className="text-neutral-500 font-normal">({chyby}× vedle)</span>}
            </div>
          )}

          {nastroj === 'kytara' ? (
            <HmatnikTestu
              cilove={odhaleno ? ukol.cilove : []}
              trefene={stav.trefene}
              chyba={posledniChyba}
              zniciTon={zniciTon}
            />
          ) : (
            <KlavesyTestu
              cilove={odhaleno ? ukol.cilove : []}
              trefene={stav.trefene}
              chyba={posledniChyba}
              zniciTon={zniciTon}
              oktava={vstupHrace.getOktava()}
              seZkratkami={zdroje.includes('klavesnice')}
              onKlik={(t) => audioSynth.playNote(t, 'grand_piano_steinway', 1.2, 0.5)}
            />
          )}

          {stav.trefy.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {stav.trefy.slice(-24).map((t, i) => (
                <span
                  key={i}
                  className={`text-stitek px-1.5 py-0.5 rounded font-bold ${
                    t.spravne
                      ? 'bg-uspech/20 text-uspech'
                      : t.minulO > 0
                        ? 'bg-chyba/20 text-chyba'
                        : 'bg-white/[0.06] text-neutral-500'
                  }`}
                  title={t.minulO > 0 ? `vedle o ${t.minulO} půltónů` : t.ton}
                >
                  {t.trida}
                  {t.minulO > 0 && <span className="opacity-70"> +{t.minulO}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#16161A]/50 border border-white/[0.06] rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm text-neutral-400">
            Zapni si vstup, vyber druh úkolu a spusť zadání.
          </p>
          <button
            onClick={() => zadej()}
            className="px-4 py-2 rounded-xl bg-nastroj text-white text-sm font-bold cursor-pointer"
          >
            Zadej úkol
          </button>
        </div>
      )}
    </div>
  );
};
