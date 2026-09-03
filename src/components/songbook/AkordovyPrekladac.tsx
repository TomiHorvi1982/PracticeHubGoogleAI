import React, { useMemo, useState } from 'react';
import { Volume2, Guitar, Piano, RotateCcw } from 'lucide-react';
import { KlavirDiagram } from './KlavirDiagram';
import { HmatnikTukani } from './HmatnikTukani';
import { audioSynth, midiToNoteName } from '../../services/audioSynth';
import { pojmenujAkord, tonyZHmatu, hmatProTony, strunyZNot, TONY, Rozpoznany } from '../../services/akordy';
import { TUNING_PRESETS } from '../../data/chordsAndScales';

interface Props {
  /** Ladění, kterým se má začít — obvykle ladění písně. */
  vychoziLadeni?: string;
  /** Uložení akordu, kde to dává smysl. */
  onUlozit?: (nazev: string, prahy: number[], tony: number[]) => void;
  sirka?: number;
}

/**
 * Překladač mezi hmatníkem a klaviaturou.
 *
 * Kytarista chytne akord, klávesák hned vidí, co zmáčknout — a naopak.
 * U divokých hmatů je to jediný způsob, jak si to sdělit, aniž by se to
 * muselo přeříkávat po tónech.
 *
 * Ladění je nahoře schválně: v Drop C dá tentýž hmat jiný akord, a kdyby
 * se počítalo vždycky ve standardním E, dostal by klávesák tóny, které
 * v místnosti nikdo nehraje.
 */
export const AkordovyPrekladac: React.FC<Props> = ({ vychoziLadeni, onUlozit, sirka = 300 }) => {
  const [ladeni, setLadeni] = useState<string>(
    () => TUNING_PRESETS.find((t) => t.name === vychoziLadeni)?.name || TUNING_PRESETS[0].name
  );
  const [naCem, setNaCem] = useState<'hmatnik' | 'klavir'>('hmatnik');
  const [prahy, setPrahy] = useState<number[]>([-1, -1, -1, -1, -1, -1]);
  const [tonyKlavir, setTonyKlavir] = useState<number[]>([]);
  const [nazev, setNazev] = useState('');

  const preset = TUNING_PRESETS.find((t) => t.name === ladeni) || TUNING_PRESETS[0];
  const struny = strunyZNot(preset.notes);
  const tukane = naCem === 'hmatnik' ? tonyZHmatu(prahy, struny) : tonyKlavir;

  const rozpoznany: Rozpoznany | null = useMemo(
    () => (tukane.length ? pojmenujAkord(tukane) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tukane.join(',')]
  );

  const zahraj = (jakoKytara: boolean) => {
    const serazene = [...tukane].sort((a, b) => a - b);
    serazene.forEach((m, i) => {
      const nota = midiToNoteName(m);
      // Kytara brnkne přes struny, klavír stiskne naráz — poznat ten
      // rozdíl je půlka důvodu, proč si člověk akord pouští.
      if (jakoKytara) setTimeout(() => audioSynth.playGuitarNote(nota, 2.2, 0.42), i * 45);
      else audioSynth.playNote(nota, 'acoustic_grand_piano_sf', 2.2, 0.4);
    });
  };

  const vycisti = () => {
    setPrahy([-1, -1, -1, -1, -1, -1]);
    setTonyKlavir([]);
    setNazev('');
  };

  return (
    <div className="bg-black/40 border border-white/[0.08] rounded-2xl p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { id: 'hmatnik', popis: 'Ťukat na hmatník', ikona: Guitar },
          { id: 'klavir', popis: 'Ťukat na klavír', ikona: Piano },
        ] as const).map((n) => {
          const Ikona = n.ikona;
          return (
            <button
              key={n.id}
              onClick={() => setNaCem(n.id)}
              className={`px-2 py-1 rounded-lg text-stitek font-semibold flex items-center gap-1 cursor-pointer ${
                naCem === n.id ? 'bg-white/[0.14] text-white' : 'text-neutral-500 hover:text-white'
              }`}
            >
              <Ikona className="w-3 h-3" /> {n.popis}
            </button>
          );
        })}

        <button
          onClick={vycisti}
          className="p-1 rounded-lg text-neutral-600 hover:text-white cursor-pointer"
          title="Vyčistit"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {naCem === 'hmatnik' && (
          <select
            value={ladeni}
            onChange={(e) => setLadeni(e.target.value)}
            className="ml-auto bg-black/50 border border-white/10 text-white text-drobne rounded-lg px-2 py-1 outline-none focus:border-[#FF9F0A] cursor-pointer max-w-[220px]"
          >
            {TUNING_PRESETS.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-start">
        {naCem === 'hmatnik' ? (
          <HmatnikTukani
            prahy={prahy}
            onZmena={setPrahy}
            sirka={sirka}
            struny={struny}
            jmenaStrun={preset.notes}
          />
        ) : (
          <KlavirDiagram
            tony={tonyKlavir}
            sirka={sirka}
            oktavy={2}
            onKlik={(m) => setTonyKlavir((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))}
          />
        )}

        <div className="space-y-1">
          <div className="text-stitek uppercase tracking-wider text-neutral-500">
            {naCem === 'hmatnik' ? 'Na klavíru' : 'Na hmatníku'}
          </div>
          {naCem === 'hmatnik' ? (
            <KlavirDiagram tony={tukane} sirka={Math.round(sirka * 0.75)} oktavy={2} />
          ) : (
            <HmatnikTukani
              prahy={hmatProTony(tonyKlavir, struny) || [-1, -1, -1, -1, -1, -1]}
              onZmena={() => {
                /* jen k nahlédnutí — ťuká se na klaviatuře vedle */
              }}
              sirka={Math.round(sirka * 0.75)}
              struny={struny}
              jmenaStrun={preset.notes}
            />
          )}
          {tukane.length > 0 && (
            <div className="text-stitek text-neutral-400 font-mono">
              {[...new Set(tukane.map((m) => ((m % 12) + 12) % 12))]
                .sort((a, b) => a - b)
                .map((t) => TONY[t])
                .join(' · ')}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <div className="text-stitek uppercase tracking-wider text-neutral-500">Rozpoznáno</div>
          {rozpoznany ? (
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-sm font-bold font-mono ${
                  rozpoznany.jistota === 'presne' ? 'text-[#30D158]' : 'text-[#FF9F0A]'
                }`}
              >
                {rozpoznany.nazev}
              </span>
              <span className="text-stitek text-neutral-500">{rozpoznany.popis}</span>
            </div>
          ) : (
            <span className="text-drobne text-neutral-600">Naťukej aspoň dva tóny.</span>
          )}
        </div>

        {rozpoznany && (
          <>
            <button
              onClick={() => zahraj(true)}
              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-neutral-300 cursor-pointer"
              title="Zahrát na kytaru"
            >
              <Guitar className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => zahraj(false)}
              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-neutral-300 cursor-pointer"
              title="Zahrát na klavír"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {onUlozit && (
          <>
            <input
              value={nazev}
              onChange={(e) => setNazev(e.target.value)}
              placeholder={rozpoznany?.nazev || 'Vlastní název'}
              className="w-28 bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-drobne text-white outline-none focus:border-[#FF9F0A] font-mono"
            />
            <button
              onClick={() => onUlozit(nazev || rozpoznany?.nazev || '', prahy, tukane)}
              disabled={!rozpoznany && !nazev.trim()}
              className="px-2.5 py-1 rounded-lg text-stitek font-bold bg-[#30D158] text-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Uložit
            </button>
          </>
        )}
      </div>
    </div>
  );
};
