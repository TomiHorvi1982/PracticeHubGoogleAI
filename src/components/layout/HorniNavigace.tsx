import React from 'react';
import {
  Library, Maximize2, FileCode, FileText, GraduationCap, Piano, Clock, Mic,
  Sliders, Guitar, FolderOpen, Bookmark, Settings, Compass, LayoutGrid, Globe,
} from 'lucide-react';
import { MainTabType } from './sekce';
import { PRIME, SKUPINY, STRANOU } from './skupiny';

interface Props {
  activeTab: MainTabType;
  onSelectTab: (tab: MainTabType) => void;
  /** Plocha s okny místo jedné sekce. */
  rezimPlochy?: boolean;
  onPrepnoutPlochu?: () => void;
}

/**
 * Vrchní navigace.
 *
 * Sekce jsou v jedné řadě a dělí se o šířku rovným dílem. Zkoušel jsem
 * je seskupit do rozbalovátek, aby jich v liště bylo míň, ale ukázalo
 * se to jako horší: co je schované, se nehledá, a otevřít nabídku kvůli
 * jednomu kliknutí je krok navíc pokaždé.
 *
 * Popisek se schová dřív než ikona. Na úzkém okně tak zůstane řada
 * ikon — pořád je vidět, kolik sekcí je a kde která leží, což je pro
 * orientaci víc než čitelný název u poloviny z nich.
 */

const IKONY: Partial<Record<MainTabType, React.FC<{ className?: string }>>> = {
  songbook: Library,
  podium: Maximize2,
  alphatab: FileCode,
  texty: FileText,
  practise: GraduationCap,
  instruments: Piano,
  practice: Clock,
  tuner: Mic,
  stemmixer: Sliders,
  liveamp: Guitar,
  tone3000: Globe,
  library: FolderOpen,
  zalozky: Bookmark,
  settings: Settings,
  vitejte: Compass,
};

/** Všechny sekce v jedné řadě, v pořadí, v jakém se do nich chodí. */
const VSE = [
  ...PRIME,
  ...SKUPINY.flatMap((s) => s.polozky.filter((p) => !p.jenHlasem)),
];

export const HorniNavigace: React.FC<Props> = ({
  activeTab, onSelectTab, rezimPlochy = false, onPrepnoutPlochu,
}) => (
  <nav
    aria-label="Hlavní navigace"
    className="bg-plocha-1/70 backdrop-blur-xl border-b border-kresba px-2 sm:px-3 flex items-stretch gap-0.5 shrink-0"
  >
    {VSE.map((p) => {
      const Ikona = IKONY[p.id] || Compass;
      const aktivni = !rezimPlochy && activeTab === p.id;
      return (
        <button
          key={p.id}
          onClick={() => onSelectTab(p.id)}
          title={p.nazev}
          aria-current={aktivni ? 'page' : undefined}
          className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-prvek
            px-1.5 py-1.5 min-h-dotyk lg:min-h-0 text-drobne font-medium transition-colors cursor-pointer
            focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-znacka ${
            aktivni
              ? 'bg-znacka-tlum text-znacka ring-1 ring-znacka-okraj'
              : 'text-pismo-tlum hover:text-pismo hover:bg-plocha-2'
          }`}
        >
          <Ikona className="w-4 h-4 shrink-0" />
          {/* Popisek jen tam, kde se čtrnáct jmen do řádky vejde. */}
          <span className="hidden xl:inline truncate">{p.kratky || p.nazev}</span>
        </button>
      );
    })}

    {/* Zázemí vpravo: nejsou to nástroje k písni, tak nedělí šířku s nimi. */}
    <span className="w-px my-2 bg-kresba shrink-0 mx-1" aria-hidden="true" />

    {/* Plocha s okny. Není to sekce, ale jiný způsob, jak je ukázat —
        proto stojí stranou od řady a nedělí s ní šířku. */}
    {onPrepnoutPlochu && (
      <button
        onClick={onPrepnoutPlochu}
        title={rezimPlochy ? 'Zpátky na jednu sekci' : 'Plocha s okny — otevři si víc sekcí naráz'}
        aria-label="Plocha s okny"
        aria-pressed={rezimPlochy}
        className={`shrink-0 inline-flex items-center justify-center rounded-prvek px-2
          min-h-dotyk lg:min-h-0 lg:py-1.5 transition-colors cursor-pointer
          focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-znacka ${
          rezimPlochy ? 'bg-znacka-tlum text-znacka ring-1 ring-znacka-okraj' : 'text-pismo-slaby hover:text-pismo hover:bg-plocha-2'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    )}
    {STRANOU.map((p) => {
      const Ikona = p.id === 'settings' ? Settings : Compass;
      const aktivni = !rezimPlochy && activeTab === p.id;
      return (
        <button
          key={p.id}
          onClick={() => onSelectTab(p.id)}
          title={p.nazev}
          aria-label={p.nazev}
          aria-current={aktivni ? 'page' : undefined}
          className={`shrink-0 inline-flex items-center justify-center rounded-prvek px-2
            min-h-dotyk lg:min-h-0 lg:py-1.5 transition-colors cursor-pointer
            focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-znacka ${
            aktivni ? 'bg-znacka-tlum text-znacka ring-1 ring-znacka-okraj' : 'text-pismo-slaby hover:text-pismo hover:bg-plocha-2'
          }`}
        >
          <Ikona className="w-4 h-4" />
        </button>
      );
    })}
  </nav>
);
