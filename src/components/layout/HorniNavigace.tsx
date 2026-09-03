import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Settings, Compass, Maximize2 } from 'lucide-react';
import { MainTabType } from './sekce';
import { PRIME, SKUPINY, STRANOU, skupinaSekce, viditelnePolozky, Skupina } from './skupiny';

interface Props {
  activeTab: MainTabType;
  onSelectTab: (tab: MainTabType) => void;
}

/**
 * Vrchní navigace.
 *
 * Bývalo tu devatenáct sekcí v jedné ploché řadě, všechny stejnou vahou.
 * Do lišty se jich vešlo čtrnáct, poslední useknutá, a na mobilu jich
 * bylo osm mimo obrazovku bez náznaku, že se dá posouvat.
 *
 * Teď jsou v liště dva cíle a čtyři rozbalovátka. Které je otevřené, se
 * pozná i podle skupiny — kdo je v mixážním pultu, vidí zvýrazněné
 * „Zvuk", takže po kliknutí neztratí stopu, kde vlastně je.
 *
 * Rozbalovátka jdou ovládat klávesnicí; předchozí lišta byla jen řada
 * tlačítek bez jakéhokoli zacházení se šipkami nebo Escapem.
 */

const ZAKLAD_TLACITKA = 'inline-flex items-center gap-1.5 rounded-prvek text-drobne font-medium '
  + 'whitespace-nowrap transition-colors cursor-pointer shrink-0 px-3 '
  + 'min-h-dotyk lg:min-h-0 lg:py-1.5 '
  + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-znacka';

const Rozbalovatko: React.FC<{
  skupina: Skupina;
  activeTab: MainTabType;
  onSelectTab: (t: MainTabType) => void;
}> = ({ skupina, activeTab, onSelectTab }) => {
  const [otevrene, setOtevrene] = useState(false);
  // Pozice se počítá při otevření a menu se kreslí mimo tok.
  // Lišta má `overflow-x: auto` kvůli posouvání na úzkých oknech, což
  // vytváří ořezávací kontext — absolutně pozicované menu se v ní celé
  // schovalo za obsah stránky a nebylo vidět, přestože v DOM bylo.
  const [pozice, setPozice] = useState<{ left: number; top: number } | null>(null);
  const obal = useRef<HTMLDivElement>(null);
  const spoust = useRef<HTMLButtonElement>(null);
  const polozkyRef = useRef<(HTMLButtonElement | null)[]>([]);
  const maAktivni = skupinaSekce(activeTab) === skupina.id;
  const polozky = viditelnePolozky(skupina);

  // Kliknutí mimo a Escape zavírají. Bez toho zůstane nabídka viset
  // přes obsah a překáží tomu, kvůli čemu si ji člověk otevřel.
  useEffect(() => {
    if (!otevrene) return;
    const mimo = (e: MouseEvent) => {
      if (!obal.current?.contains(e.target as Node)) setOtevrene(false);
    };
    const klavesa = (e: KeyboardEvent) => { if (e.key === 'Escape') setOtevrene(false); };
    // Menu drží spočítanou pozici, takže by při posunutí zůstalo viset
    // vedle tlačítka. Radši se zavře.
    const zavri = () => setOtevrene(false);
    document.addEventListener('mousedown', mimo);
    document.addEventListener('keydown', klavesa);
    window.addEventListener('resize', zavri);
    window.addEventListener('scroll', zavri, true);
    return () => {
      document.removeEventListener('mousedown', mimo);
      document.removeEventListener('keydown', klavesa);
      window.removeEventListener('resize', zavri);
      window.removeEventListener('scroll', zavri, true);
    };
  }, [otevrene]);

  /**
   * Otevře a spočítá, kam menu patří.
   *
   * Když by přeteklo pravý okraj, zarovná se doprava — jinak by na
   * úzkém okně vyjelo mimo obrazovku.
   */
  const otevri = () => {
    const r = spoust.current?.getBoundingClientRect();
    if (!r) return;
    const SIRKA = 220;
    setPozice({
      left: Math.max(8, Math.min(r.left, window.innerWidth - SIRKA - 8)),
      top: r.bottom + 4,
    });
    setOtevrene(true);
  };

  /** Šipkami se přejíždí po položkách a na koncích se to otočí. */
  const posun = (od: number, smer: 1 | -1) => {
    const n = polozky.length;
    polozkyRef.current[(od + smer + n) % n]?.focus();
  };

  return (
    <div ref={obal} className="relative shrink-0">
      <button
        ref={spoust}
        onClick={() => (otevrene ? setOtevrene(false) : otevri())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); otevri(); setTimeout(() => polozkyRef.current[0]?.focus(), 0); }
        }}
        aria-expanded={otevrene}
        aria-haspopup="menu"
        className={`${ZAKLAD_TLACITKA} ${
          maAktivni
            ? 'bg-znacka-tlum text-znacka border border-znacka-okraj'
            : 'text-pismo-tlum hover:text-pismo hover:bg-plocha-2 border border-transparent'
        }`}
      >
        {skupina.nazev}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${otevrene ? 'rotate-180' : ''}`} />
      </button>

      {otevrene && (
        <div
          role="menu"
          aria-label={skupina.nazev}
          style={{ left: pozice?.left, top: pozice?.top }}
          className="fixed z-50 w-[220px] rounded-panel border border-kresba-silna bg-plocha-3 p-1 shadow-lg shadow-black/40"
        >
          {polozky.map((p, i) => {
            const aktivni = activeTab === p.id;
            return (
              <button
                key={p.id}
                ref={(el) => { polozkyRef.current[i] = el; }}
                role="menuitem"
                onClick={() => { onSelectTab(p.id); setOtevrene(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); posun(i, 1); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); posun(i, -1); }
                }}
                className={`w-full text-left px-3 py-2.5 rounded-prvek text-drobne transition-colors cursor-pointer
                  flex items-center min-h-dotyk lg:min-h-0
                  focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-znacka ${
                  aktivni ? 'bg-znacka-tlum text-znacka font-semibold' : 'text-pismo-tlum hover:bg-plocha-nad hover:text-pismo'
                }`}
              >
                {p.nazev}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const HorniNavigace: React.FC<Props> = ({ activeTab, onSelectTab }) => (
  <nav
    aria-label="Hlavní navigace"
    className="bg-plocha-1 border-b border-kresba px-3 sm:px-4 flex items-center gap-1.5 overflow-x-auto shrink-0"
  >
    {PRIME.map((p) => {
      const aktivni = activeTab === p.id;
      return (
        <button
          key={p.id}
          onClick={() => onSelectTab(p.id)}
          aria-current={aktivni ? 'page' : undefined}
          className={`${ZAKLAD_TLACITKA} font-semibold ${
            aktivni
              ? 'bg-znacka text-podklad'
              : 'bg-plocha-3 text-pismo border border-kresba hover:border-kresba-silna'
          }`}
        >
          {p.id === 'podium' && <Maximize2 className="w-3.5 h-3.5" />}
          {p.nazev}
        </button>
      );
    })}

    <span className="w-px h-5 bg-kresba mx-1 shrink-0" aria-hidden="true" />

    {SKUPINY.map((s) => (
      <Rozbalovatko key={s.id} skupina={s} activeTab={activeTab} onSelectTab={onSelectTab} />
    ))}

    {/* Zázemí vpravo: nejsou to nástroje, ale nemají kam jinam. */}
    <div className="ml-auto flex items-center gap-1 shrink-0 pl-2">
      {STRANOU.map((p) => {
        const Ikona = p.id === 'settings' ? Settings : Compass;
        const aktivni = activeTab === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelectTab(p.id)}
            title={p.nazev}
            aria-label={p.nazev}
            aria-current={aktivni ? 'page' : undefined}
            className={`${ZAKLAD_TLACITKA} lg:px-2 ${
              aktivni ? 'bg-znacka-tlum text-znacka' : 'text-pismo-slaby hover:text-pismo hover:bg-plocha-2'
            }`}
          >
            <Ikona className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  </nav>
);
