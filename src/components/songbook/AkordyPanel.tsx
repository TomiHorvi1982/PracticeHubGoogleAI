import React, { useMemo, useState } from 'react';
import { Plus, Volume2, Guitar, Piano, Check, X, Trash2 } from 'lucide-react';
import { Song, ChordDefinition } from '../../types';
import { GuitarChordDiagram } from '../GuitarChordDiagram';
import { KlavirDiagram } from './KlavirDiagram';
import { HmatnikTukani } from './HmatnikTukani';
import { audioSynth, midiToNoteName } from '../../services/audioSynth';
import {
  pojmenujAkord, tonyZHmatu, tonyZNazvu, hmatProTony, strunyZNot, STRUNY_STANDARD, Rozpoznany,
} from '../../services/akordy';
import { TUNING_PRESETS } from '../../data/chordsAndScales';

interface VlastniAkord {
  nazev: string;
  /** Hmat, pokud se ťukal na hmatníku. */
  prahy?: number[];
  /** Tóny, pokud se ťukal na klaviatuře. */
  tony?: number[];
}

interface Props {
  song: Song;
  songChords: string[];
  najdiAkord: (nazev: string) => ChordDefinition;
  onUpdateSong: (s: Song) => void;
  onOtevritDetail?: (nazev: string) => void;
}

type Zobrazeni = 'hmatnik' | 'klavir' | 'oboji';

/**
 * Akordy k písni.
 *
 * Ukazuje, co se v písni hraje, a nechá si přidat další — buď podle názvu,
 * nebo naťukáním na hmatník či klaviaturu. Naťukaný akord si appka
 * pojmenuje sama z tónů, které v něm zazní; poslouchat k tomu nic nemusí,
 * protože akord je tóny dané.
 *
 * Zobrazení je na výběr, protože kytarista a klávesák čtou jiný obrázek —
 * a na zkoušce sedí u jedné obrazovky.
 */
export const AkordyPanel: React.FC<Props> = ({
  song, songChords, najdiAkord, onUpdateSong, onOtevritDetail,
}) => {
  const [zobrazeni, setZobrazeni] = useState<Zobrazeni>(() => {
    try {
      return (localStorage.getItem('neverlate_akordy_zobrazeni') as Zobrazeni) || 'hmatnik';
    } catch {
      return 'hmatnik';
    }
  });
  const [pridavam, setPridavam] = useState(false);
  const [naCem, setNaCem] = useState<'hmatnik' | 'klavir'>('hmatnik');
  const [prahy, setPrahy] = useState<number[]>([-1, -1, -1, -1, -1, -1]);
  const [tonyKlavir, setTonyKlavir] = useState<number[]>([]);
  const [nazevRucne, setNazevRucne] = useState('');
  /**
   * V jakém ladění se hmat vyhodnocuje.
   *
   * Předvolí se ladění písně. Kdo hraje v Drop C a naťuká svůj hmat,
   * dostal by ve standardním E jméno akordu, který nehraje — a klavírista
   * podle něj zmáčkl špatné klávesy.
   */
  const [ladeni, setLadeni] = useState<string>(
    () => TUNING_PRESETS.find((t) => t.name === song.tuning)?.name || TUNING_PRESETS[0].name
  );
  const preset = TUNING_PRESETS.find((t) => t.name === ladeni) || TUNING_PRESETS[0];
  const struny = strunyZNot(preset.notes);

  const vlastni: VlastniAkord[] = (song as any).vlastniAkordy || [];

  const nastavZobrazeni = (z: Zobrazeni) => {
    setZobrazeni(z);
    try {
      localStorage.setItem('neverlate_akordy_zobrazeni', z);
    } catch {
      /* plné úložiště nesmí zabránit přepnutí */
    }
  };

  /** Tóny právě ťukaného akordu. */
  const tukane = naCem === 'hmatnik' ? tonyZHmatu(prahy, struny) : tonyKlavir;
  const rozpoznany: Rozpoznany | null = useMemo(
    () => (tukane.length ? pojmenujAkord(tukane) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tukane.join(',')]
  );

  /**
   * Zahraje akord.
   *
   * Kytara rozloží tóny za sebou, klavír je vezme naráz — brnknutí přes
   * struny a stisk akordu na klávesách zní jinak a poznat to je půlka
   * důvodu, proč si ho člověk pouští.
   */
  const zahraj = (midi: number[], jakoKytara: boolean) => {
    if (!midi.length) return;
    const serazene = [...midi].sort((a, b) => a - b);
    serazene.forEach((m, i) => {
      const nota = midiToNoteName(m);
      if (jakoKytara) {
        setTimeout(() => audioSynth.playGuitarNote(nota, 2.2, 0.42), i * 45);
      } else {
        audioSynth.playNote(nota, 'acoustic_grand_piano_sf', 2.2, 0.4);
      }
    });
  };

  /** Tóny akordu podle jména nebo uloženého hmatu. */
  const tonyAkordu = (nazev: string): number[] => {
    const v = vlastni.find((x) => x.nazev === nazev);
    if (v?.tony?.length) return v.tony;
    if (v?.prahy) return tonyZHmatu(v.prahy);
    return tonyZNazvu(nazev) || [];
  };

  /** Hmat akordu — buď uložený, nebo dopočítaný z tónů. */
  const hmatAkordu = (nazev: string): ChordDefinition => {
    const v = vlastni.find((x) => x.nazev === nazev);
    if (v?.prahy) {
      return { name: nazev, root: nazev[0], type: 'vlastní', frets: v.prahy, fingers: v.prahy.map(() => 0), pianoKeys: [] };
    }
    if (v?.tony?.length) {
      const p = hmatProTony(v.tony, struny);
      if (p) {
        return { name: nazev, root: nazev[0], type: 'vlastní', frets: p, fingers: p.map(() => 0), pianoKeys: [] };
      }
    }
    return najdiAkord(nazev);
  };

  const uloz = (nazev: string) => {
    const jmeno = nazev.trim();
    if (!jmeno) return;
    const zaznam: VlastniAkord =
      naCem === 'hmatnik' ? { nazev: jmeno, prahy: [...prahy] } : { nazev: jmeno, tony: [...tonyKlavir] };
    const bezStareho = vlastni.filter((x) => x.nazev !== jmeno);
    onUpdateSong({ ...song, vlastniAkordy: [...bezStareho, zaznam], updatedAt: Date.now() } as Song);
    setPridavam(false);
    setPrahy([-1, -1, -1, -1, -1, -1]);
    setTonyKlavir([]);
    setNazevRucne('');
  };

  const smaz = (nazev: string) => {
    onUpdateSong({
      ...song,
      vlastniAkordy: vlastni.filter((x) => x.nazev !== nazev),
      updatedAt: Date.now(),
    } as Song);
  };

  // Akordy z textu písně plus vlastní přidané. Pořadí zachovává text —
  // v jakém jdou v písni za sebou, v takovém je nejsnáz najít.
  const vsechny = [...songChords, ...vlastni.map((v) => v.nazev).filter((n) => !songChords.includes(n))];

  const karta = (nazev: string) => {
    const midi = tonyAkordu(nazev);
    const jeVlastni = vlastni.some((x) => x.nazev === nazev);
    return (
      <div
        key={nazev}
        className={`bg-white/[0.04] border p-2 rounded-2xl flex flex-col items-center gap-1 transition-all shadow-sm ${
          jeVlastni ? 'border-[#30D158]/40' : 'border-white/[0.08]'
        }`}
      >
        {zobrazeni !== 'klavir' && (
          <div
            onClick={() => onOtevritDetail?.(nazev)}
            className="cursor-pointer"
            title={`Zobrazit akord ${nazev}`}
          >
            <GuitarChordDiagram chord={hmatAkordu(nazev)} size="sm" showTitle={false} showPlayButton={false} />
          </div>
        )}
        {zobrazeni !== 'hmatnik' && <KlavirDiagram tony={midi} sirka={112} oktavy={2} />}

        <div className="flex items-center gap-1">
          <span className="text-xs font-bold text-[#FF9F0A] font-mono">{nazev}</span>
          <button
            onClick={() => zahraj(midi, true)}
            className="p-1 rounded-md hover:bg-white/10 text-neutral-500 hover:text-[#FF9F0A] cursor-pointer"
            title="Zahrát na kytaru"
          >
            <Guitar className="w-3 h-3" />
          </button>
          <button
            onClick={() => zahraj(midi, false)}
            className="p-1 rounded-md hover:bg-white/10 text-neutral-500 hover:text-[#FF9F0A] cursor-pointer"
            title="Zahrát na klavír"
          >
            <Piano className="w-3 h-3" />
          </button>
          {jeVlastni && (
            <button
              onClick={() => smaz(nazev)}
              className="p-1 rounded-md hover:bg-[#FF453A]/20 text-neutral-600 hover:text-[#FF453A] cursor-pointer"
              title="Odebrat vlastní akord"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {([
          { id: 'hmatnik', popis: 'Hmatník', ikona: Guitar },
          { id: 'klavir', popis: 'Klavír', ikona: Piano },
          { id: 'oboji', popis: 'Obojí', ikona: Check },
        ] as const).map((z) => {
          const Ikona = z.ikona;
          return (
            <button
              key={z.id}
              onClick={() => nastavZobrazeni(z.id)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                zobrazeni === z.id
                  ? 'bg-[#FF9F0A] text-black'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white'
              }`}
            >
              <Ikona className="w-3 h-3" /> {z.popis}
            </button>
          );
        })}

        <button
          onClick={() => setPridavam((v) => !v)}
          className="ml-auto px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 bg-[#30D158]/15 text-[#30D158] hover:bg-[#30D158]/30 cursor-pointer transition-all"
        >
          {pridavam ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {pridavam ? 'Zrušit' : 'Přidat akord'}
        </button>
      </div>

      {pridavam && (
        <div className="bg-black/40 border border-white/[0.08] rounded-2xl p-3 space-y-2 shrink-0">
          <div className="flex items-center gap-1.5">
            {([
              { id: 'hmatnik', popis: 'Naťukat na hmatník' },
              { id: 'klavir', popis: 'Naťukat na klavír' },
            ] as const).map((n) => (
              <button
                key={n.id}
                onClick={() => setNaCem(n.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
                  naCem === n.id ? 'bg-white/[0.14] text-white' : 'text-neutral-500 hover:text-white'
                }`}
              >
                {n.popis}
              </button>
            ))}
          </div>

          {naCem === 'hmatnik' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] uppercase tracking-wider text-neutral-500">Ladění</span>
              <select
                value={ladeni}
                onChange={(e) => setLadeni(e.target.value)}
                className="bg-black/50 border border-white/10 text-white text-[11px] rounded-lg px-2 py-1 outline-none focus:border-[#FF9F0A] cursor-pointer max-w-[220px]"
              >
                {TUNING_PRESETS.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Hmatník a klaviatura vedle sebe. Kytarista chytne akord a
              klávesák rovnou vidí, co zmáčknout — u divokých hmatů je to
              jediný způsob, jak si to sdělit, aniž by se to muselo
              přeříkávat po tónech. */}
          <div className="flex flex-wrap gap-3 items-start">
            {naCem === 'hmatnik' ? (
              <HmatnikTukani
                prahy={prahy}
                onZmena={setPrahy}
                sirka={300}
                struny={struny}
                jmenaStrun={preset.notes}
              />
            ) : (
              <KlavirDiagram
                tony={tonyKlavir}
                sirka={300}
                oktavy={2}
                onKlik={(m) =>
                  setTonyKlavir((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))
                }
              />
            )}

            <div className="space-y-1">
              <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                {naCem === 'hmatnik' ? 'Na klavíru' : 'Na hmatníku'}
              </div>
              {naCem === 'hmatnik' ? (
                <KlavirDiagram tony={tukane} sirka={220} oktavy={2} />
              ) : (
                <HmatnikTukani
                  prahy={hmatProTony(tonyKlavir, struny) || [-1, -1, -1, -1, -1, -1]}
                  onZmena={() => {
                    /* jen k nahlédnutí — mění se to na klaviatuře vedle */
                  }}
                  sirka={220}
                  struny={struny}
                  jmenaStrun={preset.notes}
                />
              )}
              {tukane.length > 0 && (
                <div className="text-[10px] text-neutral-400 font-mono">
                  {[...new Set(tukane.map((m) => ((m % 12) + 12) % 12))]
                    .sort((a, b) => a - b)
                    .map((t) => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][t])
                    .join(' · ')}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Název se nabídne sám z tónů. Přepsat ho jde — appka pozná
                akord, ale ne to, jak mu v kapele říkáte. */}
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-neutral-500">Rozpoznáno</div>
              {rozpoznany ? (
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-sm font-bold font-mono ${
                      rozpoznany.jistota === 'presne' ? 'text-[#30D158]' : 'text-[#FF9F0A]'
                    }`}
                  >
                    {rozpoznany.nazev}
                  </span>
                  <span className="text-[10px] text-neutral-500">{rozpoznany.popis}</span>
                </div>
              ) : (
                <span className="text-[11px] text-neutral-600">Naťukej aspoň dva tóny.</span>
              )}
            </div>

            {rozpoznany && (
              <button
                onClick={() => zahraj(tukane, naCem === 'hmatnik')}
                className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] text-neutral-300 cursor-pointer"
                title="Poslechnout"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            )}

            <input
              value={nazevRucne}
              onChange={(e) => setNazevRucne(e.target.value)}
              placeholder={rozpoznany?.nazev || 'Vlastní název'}
              className="w-28 bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-[#FF9F0A] font-mono"
            />

            <button
              onClick={() => uloz(nazevRucne || rozpoznany?.nazev || '')}
              disabled={!rozpoznany && !nazevRucne.trim()}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#30D158] text-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Uložit k písni
            </button>
          </div>
        </div>
      )}

      {vsechny.length > 0 ? (
        <div className="flex flex-wrap gap-2 p-1">{vsechny.map(karta)}</div>
      ) : (
        <div className="text-center py-8 text-neutral-400 text-xs">
          V textu nebyly rozpoznány žádné akordy. Přidej si je tlačítkem nahoře.
        </div>
      )}
    </div>
  );
};
