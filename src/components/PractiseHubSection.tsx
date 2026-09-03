import React, { useState } from 'react';
import { Flame, Target, Brain, GraduationCap } from 'lucide-react';
import { RozcvickaRoom } from './practise/RozcvickaRoom';
import { SoloRoom } from './practise/SoloRoom';
import { TestRoom } from './practise/TestRoom';

/**
 * Practise Hub — čtyři místnosti, každá na jinou část cvičení.
 *
 * Dělené podle toho, co člověk zrovna dělá, ne podle nástroje: rozcvička
 * před hraním, pilování kusu, sólo a zkoušení teorie. Jinak by z toho
 * byla jedna dlouhá stránka, kde se nedá začít.
 */

type Mistnost = 'rozcvicka' | 'sola' | 'test';

const MISTNOSTI: { id: Mistnost; nazev: string; popis: string; ikona: typeof Flame; barva: string }[] = [
  {
    id: 'rozcvicka', nazev: 'Heating Room',
    popis: 'Rozehřát ruce a projít rytmy, než se začne hrát',
    ikona: Flame, barva: '#FF9F0A',
  },
  {
    // Riffstation byl samostatnou mistnosti, prestoze SoloGuitar Room
    // uz ho cely obsahoval — vedly do teze veci dvoje dvere.
    id: 'sola', nazev: 'SoloGuitar & Riffstation',
    popis: 'Sóla i riffy: úseky z tabulatury, smyčka, zpomalení a kontrola tóniny',
    ikona: Target, barva: '#30D158',
  },
  {
    id: 'test', nazev: 'Testing Room',
    popis: 'Kvíz, trefování tónů podle detekce a zkoušení rytmu',
    ikona: Brain, barva: '#BF5AF2',
  },
];

export const PractiseHubSection: React.FC = () => {
  const [mistnost, setMistnost] = useState<Mistnost>('rozcvicka');
  const aktivni = MISTNOSTI.find((m) => m.id === mistnost)!;

  return (
    <div className="space-y-4 font-sans text-white pb-12">
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-center gap-3.5 mb-4">
          <div className="p-3 bg-[#30D158]/10 border border-[#30D158]/30 text-[#30D158] rounded-2xl">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="bg-[#30D158] text-black font-bold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
              Practise Hub
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
              Zkušebna pro jednoho
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Čtyři místnosti podle toho, co zrovna děláš — od rozehřátí po zkoušení teorie.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {MISTNOSTI.map((m) => {
            const Ikona = m.ikona;
            const je = mistnost === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMistnost(m.id)}
                className={`text-left p-3 rounded-2xl cursor-pointer transition-all border ${
                  je ? 'bg-white/[0.08] border-white/20' : 'bg-white/[0.03] border-transparent hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Ikona className="w-4 h-4 shrink-0" style={{ color: je ? m.barva : '#8e8e93' }} />
                  <span className={`text-xs font-bold ${je ? 'text-white' : 'text-neutral-400'}`}>
                    {m.nazev}
                  </span>
                </div>
                <p className="text-[10px] text-neutral-500 leading-snug">{m.popis}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 px-1">
        <aktivni.ikona className="w-4 h-4" style={{ color: aktivni.barva }} />
        <h3 className="text-sm font-bold text-white">{aktivni.nazev}</h3>
      </div>

      {mistnost === 'rozcvicka' && <RozcvickaRoom />}
      {mistnost === 'sola' && <SoloRoom />}
      {mistnost === 'test' && <TestRoom />}
    </div>
  );
};
