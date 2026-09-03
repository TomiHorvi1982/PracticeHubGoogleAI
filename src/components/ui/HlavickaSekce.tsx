import React, { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { klicNapovedy, maBytRozbalena, hodnotaProUlozeni } from './napoveda';

/**
 * Hlavička sekce.
 *
 * Nahrazuje dekorativní hero bloky, které si každá sekce psala zvlášť
 * a které tlačily pracovní plochu pod ohyb — na mixážním pultu se při
 * otevření nedal vidět jediný fader.
 *
 * Vysvětlení nezmizí, jen se sbalí pod otazník a pamatuje si to.
 * Kdo přijde poprvé, přečte si ho; kdo tam chodí denně, vidí rovnou
 * nástroj.
 */

interface Props {
  /** Krátký název sekce. */
  nazev: string;
  /** Identifikátor pro zapamatování sbalení. */
  klic: string;
  /** K čemu sekce je. Zobrazí se pod otazníkem. */
  napoveda?: React.ReactNode;
  /** Ovládání, které patří k celé sekci — vpravo v řádku. */
  akce?: React.ReactNode;
}

export const HlavickaSekce: React.FC<Props> = ({ nazev, klic, napoveda, akce }) => {
  const [rozbalena, setRozbalena] = useState(false);

  useEffect(() => {
    if (!napoveda) return;
    try {
      setRozbalena(maBytRozbalena(localStorage.getItem(klicNapovedy(klic))));
    } catch {
      setRozbalena(true);
    }
  }, [klic, napoveda]);

  const prepni = () => {
    const nova = !rozbalena;
    setRozbalena(nova);
    try {
      localStorage.setItem(klicNapovedy(klic), hodnotaProUlozeni(nova));
    } catch { /* bez zapamatování to funguje taky */ }
  };

  return (
    <header className="mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-nadpis-2 font-semibold text-pismo tracking-tight">{nazev}</h1>
        {napoveda && (
          <button
            onClick={prepni}
            aria-expanded={rozbalena}
            aria-label={rozbalena ? 'Skrýt nápovědu' : 'K čemu tahle sekce je'}
            className="shrink-0 p-1.5 rounded-prvek text-pismo-slaby hover:text-pismo hover:bg-plocha-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-znacka"
          >
            {rozbalena ? <X className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
          </button>
        )}
        {akce && <div className="ml-auto flex items-center gap-2">{akce}</div>}
      </div>

      {napoveda && rozbalena && (
        <div className="mt-2 text-drobne text-pismo-tlum max-w-[68ch] leading-relaxed">
          {napoveda}
        </div>
      )}
    </header>
  );
};
