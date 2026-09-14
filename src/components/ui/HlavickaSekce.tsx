import React from 'react';

/**
 * Hlavička sekce.
 *
 * Nahrazuje dekorativní hero bloky, které si každá sekce psala zvlášť
 * a které tlačily pracovní plochu pod ohyb — na mixážním pultu se při
 * otevření nedal vidět jediný fader. Jen název a ovládání, žádné
 * vysvětlování.
 */

interface Props {
  /** Krátký název sekce. */
  nazev: string;
  /** Ovládání, které patří k celé sekci — vpravo v řádku. */
  akce?: React.ReactNode;
}

export const HlavickaSekce: React.FC<Props> = ({ nazev, akce }) => (
  <header className="mb-4">
    <div className="flex items-center gap-3 flex-wrap">
      <h1 className="text-nadpis-2 font-semibold text-pismo tracking-tight">{nazev}</h1>
      {akce && <div className="ml-auto flex items-center gap-2">{akce}</div>}
    </div>
  </header>
);
