import React, { useEffect, useState } from 'react';
import { midiService, MidiDevice } from '../../services/midiService';
import { usePamet } from '../../hooks/usePamet';
import { ObrazekKlavir, ObrazekBici, ObrazekHmatnik } from './ObrazekNastroje';

export type Nastroj = 'piano' | 'drums' | 'fretboard';

/**
 * Volba nástroje.
 *
 * Dřív to byla řádka drobných přepínačů, ve které se nedalo poznat, co
 * která otevře. Karta s kresbou se pozná dřív, než se stačí přečíst
 * popisek — a je v ní místo na to, co k nástroji patří: čím se hraje.
 *
 * Vstup si drží každý nástroj svůj. Zvuk je vždycky jen jeden nástroj,
 * takže se volba uplatní ve chvíli, kdy se na něj přepne; nastavuje se
 * ale jednou a pamatuje se.
 */

const NASTROJE: {
  id: Nastroj;
  nazev: string;
  popis: string;
  Obrazek: React.FC<{ className?: string }>;
  barva: string;
}[] = [
  { id: 'piano', nazev: 'Klavír', popis: 'Klaviatura, akordy a stupnice', Obrazek: ObrazekKlavir, barva: '#FF9F0A' },
  { id: 'drums', nazev: 'Samples', popis: 'Skládačka ze samplů', Obrazek: ObrazekBici, barva: '#30D158' },
  { id: 'fretboard', nazev: 'Hmatník', popis: 'Akordy, stupnice a poslech kytary', Obrazek: ObrazekHmatnik, barva: '#BF5AF2' },
];

/** Klávesnice počítače je vždycky po ruce, i bez jediného MIDI zařízení. */
const KLAVESNICE = 'klavesnice';

export const VyberNastroje: React.FC<{
  vybrany: Nastroj;
  onVybrat: (n: Nastroj) => void;
}> = ({ vybrany, onVybrat }) => {
  const [zarizeni, setZarizeni] = useState<MidiDevice[]>([]);
  const [vstupy, setVstupy] = usePamet<Record<string, string>>('nastroje_vstupy', {});

  useEffect(() => {
    let zivy = true;
    void midiService.initMidi()
      .then((d) => { if (zivy) setZarizeni(d.filter((x) => x.state === 'connected')); })
      .catch(() => { /* bez MIDI zůstane klávesnice počítače */ });
    return () => { zivy = false; };
  }, []);

  /**
   * Přepnutí nástroje zapne i jeho vstup.
   *
   * Bez toho by si člověk vstup nastavil, přepnul jinam a po návratu
   * hrál na to, co zbylo po jiném nástroji.
   */
  useEffect(() => {
    const vstup = vstupy[vybrany];
    if (vstup && vstup !== KLAVESNICE) midiService.setSelectedInput(vstup);
  }, [vybrany, vstupy]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {NASTROJE.map((n) => {
        const aktivni = vybrany === n.id;
        const vstup = vstupy[n.id] || KLAVESNICE;
        return (
          <div
            key={n.id}
            onClick={() => onVybrat(n.id)}
            className={`rounded-3xl border p-3 cursor-pointer transition-all ${
              aktivni
                ? 'bg-white/[0.07] border-white/25 shadow-lg'
                : 'bg-plocha-2 border-white/[0.07] hover:border-white/20 hover:bg-white/[0.04]'
            }`}
            style={aktivni ? { borderColor: `${n.barva}80`, boxShadow: `0 0 0 1px ${n.barva}30` } : undefined}
          >
            <div
              className="rounded-2xl mb-2.5 flex items-center justify-center py-2"
              style={{ backgroundColor: `${n.barva}${aktivni ? '22' : '10'}`, color: n.barva }}
            >
              <n.Obrazek className="w-full h-14 px-4" />
            </div>

            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`text-sm font-bold ${aktivni ? 'text-white' : 'text-neutral-300'}`}>
                {n.nazev}
              </span>
              {aktivni && (
                <span
                  className="text-stitek font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${n.barva}25`, color: n.barva }}
                >
                  hraje
                </span>
              )}
            </div>
            <p className="text-drobne text-neutral-500 leading-tight mb-2.5">{n.popis}</p>

            <label className="block">
              <span className="text-stitek uppercase tracking-widest text-neutral-600">Vstup</span>
              <select
                value={vstup}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const nova = e.target.value;
                  setVstupy((p) => ({ ...p, [n.id]: nova }));
                  if (aktivni && nova !== KLAVESNICE) midiService.setSelectedInput(nova);
                }}
                className="w-full mt-0.5 min-h-dotyk lg:min-h-0 bg-black/40 border border-white/10 rounded-xl px-2 py-1.5 text-drobne text-white outline-none focus:border-white/30 cursor-pointer"
              >
                <option value={KLAVESNICE}>Klávesnice počítače</option>
                {zarizeni.length > 0 && <option value="all">Všechny MIDI vstupy</option>}
                {zarizeni.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </label>
          </div>
        );
      })}
    </div>
  );
};
