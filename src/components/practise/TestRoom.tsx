import React, { useEffect, useState } from 'react';
import { Brain, Check, X, Timer, Trophy } from 'lucide-react';
import { Chord, Scale, Note, Key } from 'tonal';

/**
 * Zkoušení teorie.
 *
 * Otázky se skládají pokaždé znovu z knihovny `tonal`, ne z hotového
 * seznamu: hotový seznam se po pár večerech naučí nazpaměť a přestane
 * zkoušet znalost.
 */

type Druh = 'akord' | 'stupnice' | 'interval' | 'hmatnik' | 'tonina';

interface Otazka {
  druh: Druh;
  zadani: string;
  napoveda: string;
  moznosti: string[];
  spravne: string;
}

const TONY = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const STRUNY = [
  { nazev: 'E (1)', midi: 64 }, { nazev: 'B (2)', midi: 59 }, { nazev: 'G (3)', midi: 55 },
  { nazev: 'D (4)', midi: 50 }, { nazev: 'A (5)', midi: 45 }, { nazev: 'E (6)', midi: 40 },
];

const nahodne = <T,>(pole: T[]): T => pole[Math.floor(Math.random() * pole.length)];

/** Zamíchá a doplní na čtyři možnosti. */
function moznosti(spravne: string, ostatni: string[]): string[] {
  const jine = [...new Set(ostatni.filter((x) => x !== spravne))];
  const vybrane = [spravne];
  while (vybrane.length < 4 && jine.length) {
    vybrane.push(jine.splice(Math.floor(Math.random() * jine.length), 1)[0]);
  }
  return vybrane.sort(() => Math.random() - 0.5);
}

function slozOtazku(druh: Druh): Otazka {
  if (druh === 'akord') {
    const ton = nahodne(TONY);
    const typ = nahodne(['maj7', 'm7', '7', 'm', 'dim', 'aug', 'sus4', '6']);
    const nazev = `${ton}${typ}`;
    const tony = Chord.get(nazev).notes;
    return {
      druh,
      zadani: `Které tóny má akord ${nazev}?`,
      napoveda: 'Od základního tónu nahoru.',
      moznosti: moznosti(
        tony.join(' – '),
        Array.from({ length: 8 }, () =>
          Chord.get(`${nahodne(TONY)}${nahodne(['maj7', 'm7', '7', 'm', 'dim'])}`).notes.join(' – '),
        ).filter((x) => x.length > 2),
      ),
      spravne: tony.join(' – '),
    };
  }

  if (druh === 'stupnice') {
    const ton = nahodne(TONY);
    const typ = nahodne(['major', 'minor', 'minor pentatonic', 'dorian', 'mixolydian', 'blues']);
    const tony = Scale.get(`${ton} ${typ}`).notes;
    return {
      druh,
      zadani: `Kolikátý stupeň chybí: ${ton} ${typ}?`,
      napoveda: tony.slice(0, -1).join(' – ') + ' – ?',
      moznosti: moznosti(tony[tony.length - 1], TONY),
      spravne: tony[tony.length - 1],
    };
  }

  if (druh === 'interval') {
    const zaklad = nahodne(TONY);
    const interval = nahodne(['3M', '3m', '5P', '4P', '7m', '7M', '2M', '6M']);
    const cil = Note.transpose(zaklad, interval);
    const nazvy: Record<string, string> = {
      '3M': 'velká tercie', '3m': 'malá tercie', '5P': 'čistá kvinta', '4P': 'čistá kvarta',
      '7m': 'malá septima', '7M': 'velká septima', '2M': 'velká sekunda', '6M': 'velká sexta',
    };
    return {
      druh,
      zadani: `Jaký tón je ${nazvy[interval]} nad ${zaklad}?`,
      napoveda: 'Počítej půltóny od základu.',
      moznosti: moznosti(cil, TONY),
      spravne: cil,
    };
  }

  if (druh === 'hmatnik') {
    const struna = nahodne(STRUNY);
    const prazec = 1 + Math.floor(Math.random() * 12);
    const ton = Note.pitchClass(Note.fromMidi(struna.midi + prazec));
    return {
      druh,
      zadani: `Jaký tón je na ${prazec}. pražci struny ${struna.nazev}?`,
      napoveda: 'Prázdná struna je nula.',
      moznosti: moznosti(ton, TONY),
      spravne: ton,
    };
  }

  // tónina
  const ton = nahodne(TONY);
  const dur = Math.random() > 0.5;
  const akordy = dur ? Key.majorKey(ton).chords : Key.minorKey(ton).natural.chords;
  const stupen = 1 + Math.floor(Math.random() * 6);
  const spravne = String(akordy[stupen]).replace(/M(?![a-z0-9])/, '');
  return {
    druh: 'tonina',
    zadani: `Který akord je ${stupen + 1}. stupeň v ${ton} ${dur ? 'dur' : 'moll'}?`,
    napoveda: 'První stupeň je základní akord tóniny.',
    moznosti: moznosti(spravne, akordy.map((a) => String(a).replace(/M(?![a-z0-9])/, ''))),
    spravne,
  };
}

const DRUHY: { id: Druh; nazev: string }[] = [
  { id: 'akord', nazev: 'Akordy' },
  { id: 'stupnice', nazev: 'Stupnice' },
  { id: 'interval', nazev: 'Intervaly' },
  { id: 'hmatnik', nazev: 'Hmatník' },
  { id: 'tonina', nazev: 'Tóniny' },
];

const KLIC_REKORD = 'neverlate_test_rekord';

export const TestRoom: React.FC = () => {
  const [vybrane, setVybrane] = useState<Druh[]>(['akord', 'hmatnik']);
  const [otazka, setOtazka] = useState<Otazka | null>(null);
  const [odpoved, setOdpoved] = useState<string | null>(null);
  const [skore, setSkore] = useState(0);
  const [chyb, setChyb] = useState(0);
  const [naCas, setNaCas] = useState(false);
  const [zbyva, setZbyva] = useState(60);
  const [rekord, setRekord] = useState(() => Number(localStorage.getItem(KLIC_REKORD) || 0));

  const dalsi = () => {
    setOdpoved(null);
    setOtazka(slozOtazku(nahodne(vybrane.length ? vybrane : DRUHY.map((d) => d.id))));
  };

  useEffect(() => {
    if (!naCas) return;
    if (zbyva <= 0) {
      setNaCas(false);
      if (skore > rekord) {
        setRekord(skore);
        localStorage.setItem(KLIC_REKORD, String(skore));
      }
      return;
    }
    const t = window.setTimeout(() => setZbyva((z) => z - 1), 1000);
    return () => window.clearTimeout(t);
  }, [naCas, zbyva, skore, rekord]);

  const odpovez = (m: string) => {
    if (odpoved) return;
    setOdpoved(m);
    if (m === otazka?.spravne) setSkore((s) => s + 1);
    else setChyb((c) => c + 1);
    // Chvíle na to, aby si člověk stihl přečíst, jak to bylo správně.
    window.setTimeout(dalsi, m === otazka?.spravne ? 500 : 1600);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Brain className="w-5 h-5 text-[#BF5AF2]" />
          <div className="flex-1 min-w-[200px]">
            <h3 className="text-sm font-bold text-white">Zkoušení</h3>
            <p className="text-[11px] text-neutral-400">
              Otázky se skládají pokaždé znovu, takže se nedají naučit nazpaměť.
            </p>
          </div>
          <div className="flex items-center gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-[#30D158] tabular-nums">{skore}</div>
              <div className="text-[10px] text-neutral-500">správně</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#FF453A] tabular-nums">{chyb}</div>
              <div className="text-[10px] text-neutral-500">chyb</div>
            </div>
            {rekord > 0 && (
              <div>
                <div className="text-lg font-bold text-[#FF9F0A] tabular-nums flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> {rekord}
                </div>
                <div className="text-[10px] text-neutral-500">rekord</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DRUHY.map((d) => {
            const je = vybrane.includes(d.id);
            return (
              <button
                key={d.id}
                onClick={() =>
                  setVybrane((v) => (je ? v.filter((x) => x !== d.id) : [...v, d.id]))
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  je ? 'bg-[#BF5AF2] text-white' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
                }`}
              >
                {d.nazev}
              </button>
            );
          })}

          <button
            onClick={() => {
              setSkore(0); setChyb(0); setZbyva(60); setNaCas(true); dalsi();
            }}
            className="ml-auto px-3 py-1.5 rounded-xl bg-[#FF9F0A] text-black text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            <Timer className="w-3.5 h-3.5" /> Minuta na čas
          </button>
          <button
            onClick={() => { setNaCas(false); dalsi(); }}
            className="px-3 py-1.5 rounded-xl bg-white/[0.06] text-neutral-200 text-xs font-bold cursor-pointer"
          >
            Bez času
          </button>
        </div>

        {naCas && (
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF9F0A] transition-[width] duration-1000 ease-linear"
              style={{ width: `${(zbyva / 60) * 100}%` }}
            />
          </div>
        )}
      </div>

      {otazka ? (
        <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-6 space-y-4">
          <div>
            <h4 className="text-lg font-bold text-white">{otazka.zadani}</h4>
            <p className="text-[11px] text-neutral-500 mt-1">{otazka.napoveda}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {otazka.moznosti.map((m) => {
              const je = odpoved === m;
              const spravna = m === otazka.spravne;
              return (
                <button
                  key={m}
                  onClick={() => odpovez(m)}
                  disabled={!!odpoved}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold text-left cursor-pointer transition-all flex items-center gap-2 ${
                    odpoved && spravna
                      ? 'bg-[#30D158]/20 border border-[#30D158] text-[#30D158]'
                      : je
                      ? 'bg-[#FF453A]/20 border border-[#FF453A] text-[#FF453A]'
                      : 'bg-white/[0.05] text-neutral-200 hover:bg-white/[0.10] disabled:opacity-50'
                  }`}
                >
                  {odpoved && spravna && <Check className="w-4 h-4 shrink-0" />}
                  {je && !spravna && <X className="w-4 h-4 shrink-0" />}
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-[#16161A]/50 border border-white/[0.06] rounded-2xl p-8 text-center">
          <p className="text-sm text-neutral-400">
            Vyber okruhy a spusť zkoušení — na čas, nebo v klidu.
          </p>
        </div>
      )}
    </div>
  );
};
