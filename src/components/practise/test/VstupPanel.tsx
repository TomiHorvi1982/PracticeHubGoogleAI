import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Piano, Keyboard, AlertCircle } from 'lucide-react';
import { vstupHrace, ZdrojVstupu } from '../../../services/vstupHrace';
import { poslechKytary } from '../../../services/poslechKytary';
import { KytaraFader } from '../../mixer/KytaraFader';

/**
 * Odkud se bere, co hráč hraje.
 *
 * Tři cesty, protože zkušebna vypadá pokaždé jinak: kytara do mikrofonu,
 * MIDI klaviatura, nebo počítačová klávesnice, když u sebe člověk nemá
 * nic. Zapínají se zvlášť a dají se kombinovat.
 */
export const VstupPanel: React.FC<{
  zdroje: ZdrojVstupu[];
  onZmena: (z: ZdrojVstupu[]) => void;
}> = ({ zdroje, onZmena }) => {
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => poslechKytary.subscribe((s) => setChyba(s.chyba)), []);

  const prepni = async (z: ZdrojVstupu) => {
    const zapnuto = zdroje.includes(z);
    if (z === 'mikrofon') {
      if (zapnuto) vstupHrace.vypniMikrofon();
      else await vstupHrace.zapniMikrofon();
    }
    if (z === 'midi') {
      if (zapnuto) vstupHrace.vypniMidi();
      else await vstupHrace.zapniMidi();
    }
    if (z === 'klavesnice') {
      if (zapnuto) vstupHrace.vypniKlavesnici();
      else vstupHrace.zapniKlavesnici();
    }
    onZmena(zapnuto ? zdroje.filter((x) => x !== z) : [...zdroje, z]);
  };

  const TLACITKA: { id: ZdrojVstupu; nazev: string; ikona: typeof Mic }[] = [
    { id: 'mikrofon', nazev: 'Kytara / mikrofon', ikona: Mic },
    { id: 'midi', nazev: 'MIDI klaviatura', ikona: Piano },
    { id: 'klavesnice', nazev: 'Klávesnice', ikona: Keyboard },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {TLACITKA.map((t) => {
          const je = zdroje.includes(t.id);
          const Ikona = je && t.id === 'mikrofon' ? Mic : t.id === 'mikrofon' ? MicOff : t.ikona;
          return (
            <button
              key={t.id}
              onClick={() => void prepni(t.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                je ? 'bg-[#30D158] text-black' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
              }`}
            >
              <Ikona className="w-3.5 h-3.5" /> {t.nazev}
            </button>
          );
        })}
      </div>

      {chyba && zdroje.includes('mikrofon') && (
        <p className="text-[11px] text-[#FF453A] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
        </p>
      )}

      {/* Když se hraje na nástroj, má být vidět, jak silný signál chodí —
          slabý vstup detekce tónů nepozná a přebuzený jí lže. */}
      {zdroje.includes('mikrofon') && (
        <div className="pt-1">
          <KytaraFader />
        </div>
      )}
    </div>
  );
};
