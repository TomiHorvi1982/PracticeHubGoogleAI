import React from 'react';
import {
  FileCode, Piano, Sliders, Settings, Clock, Mic, Maximize2, Compass, FolderOpen, Users,
  Bookmark, GraduationCap, FileText,
} from 'lucide-react';
import { MainTabType } from './sekce';

interface Props {
  activeTab: MainTabType;
  onSelectTab: (tab: MainTabType) => void;
}

/**
 * Nástroje ve vrchní liště.
 *
 * Boční panel zabíral pruh obrazovky u každé sekce, včetně těch, kde je
 * plocha to hlavní. Nahoře zaberou tytéž položky jeden řádek a hlavní
 * stránka dostane celou šířku.
 *
 * Seznam je záměrně krátký. Knihovna skladeb je sama hlavní stránkou a
 * playlist se přesunul do přehrávače dole, takže sem nepatří — to, co
 * zbylo, jsou nástroje, které si k písni otevřeš, když je potřebuješ.
 *
 * Media Center a YouTube Jam odešly do „Objevit novou skladbu". Nejsou to
 * nástroje k písni, ale způsoby, jak hudbu najít venku — a to teď dělá
 * jedno místo na hlavní stránce, ne tři sekce na přeskáčku.
 *
 * Teorie & trénink zmizela úplně: byla to tatáž komponenta, jakou má
 * Hmatník ve Virtual Instruments pod záložkami Akordy a Stupnice. Dvě
 * cesty k jedné obrazovce jen nutily hádat, která z nich je ta správná.
 */
const POLOZKY: { id: MainTabType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'alphatab', label: 'Guitar Pro', icon: FileCode },
  { id: 'alphatabhriste', label: 'AlphaTab', icon: FileCode },
  { id: 'instruments', label: 'Virtual Instruments', icon: Piano },
  { id: 'stemmixer', label: 'Mixážní pult', icon: Sliders },
  // AI Band je odložený, ne smazaný: komponenta, služba i trasa v App
  // zůstávají na místě. Vrátí se odkomentováním tohohle řádku a aliasu
  // v `sekce.ts`.
  // { id: 'aikapela', label: 'AI Band', icon: Users },
  { id: 'liveamp', label: 'Live Guitar Amp', icon: Mic },
  { id: 'practise', label: 'Practise Hub', icon: GraduationCap },
  { id: 'texty', label: 'Texty', icon: FileText },
  { id: 'practice', label: 'Metronom', icon: Clock },
  { id: 'tuner', label: 'Ladička', icon: Mic },
  // Katalog souborů. Bez něj se ke knihovně dá dostat jen přes písničku,
  // takže 17 tisíc souborů nemá kde procházet ani mazat.
  { id: 'library', label: 'Soubory', icon: FolderOpen },
  { id: 'zalozky', label: 'Záložky', icon: Bookmark },
  { id: 'settings', label: 'Nastavení', icon: Settings },
  // Rozcestník až na konci: hledá se jen když člověk neví kudy dál, a
  // vedle nastavení je po ruce, aniž by zabíral místo těm, kdo to vědí.
  { id: 'vitejte', label: 'Rozcestník', icon: Compass },
];

export const HorniNavigace: React.FC<Props> = ({ activeTab, onSelectTab }) => (
  <nav className="h-11 bg-[#0C1424] border-b border-slate-800/80 px-3 sm:px-4 flex items-center gap-1 overflow-x-auto scrollbar-thin shrink-0">
    {/* Zpět na hlavní stránku. Oddělené mezerou, protože to není nástroj
        jako ostatní, ale cesta domů. */}
    <button
      onClick={() => onSelectTab('songbook')}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
        activeTab === 'songbook'
          ? 'bg-amber-500 text-slate-950 shadow-sm'
          : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      Knihovna skladeb
    </button>

    {/* Pódium vedle knihovny: dvě cesty domů, jedna k hledání a druhá
        ke hraní. Set se skládá v knihovně, chystá a hraje se tady. */}
    <button
      onClick={() => onSelectTab('podium')}
      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
        activeTab === 'podium'
          ? 'bg-amber-500 text-slate-950 shadow-sm'
          : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
      title="Příprava oken ke skladbám a pódiový režim"
    >
      <Maximize2 className={`w-3.5 h-3.5 ${activeTab === 'podium' ? '' : 'text-amber-400'}`} />
      Pódium
    </button>

    <span className="w-px h-5 bg-slate-800 mx-1.5 shrink-0" />

    {POLOZKY.map((p) => {
      const Icon = p.icon;
      const aktivni = activeTab === p.id;
      return (
        <button
          key={p.id}
          onClick={() => onSelectTab(p.id)}
          title={p.label}
          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
            aktivni
              ? 'bg-white/15 text-white border border-white/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Icon className={`w-3.5 h-3.5 shrink-0 ${aktivni ? 'text-amber-400' : ''}`} />
          {/* Na úzké obrazovce zůstanou jen ikony, ať se řádek nezalomí. */}
          <span className="hidden lg:inline">{p.label}</span>
        </button>
      );
    })}
  </nav>
);
