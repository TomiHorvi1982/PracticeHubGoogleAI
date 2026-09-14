import React from 'react';

/**
 * Řádek s ovládáním celé sekce.
 *
 * Dřív tu byl i název sekce, ale ten je vidět v navigaci a místo na
 * obrazovce patří nástroji. Bez ovládání se nevykreslí nic.
 */

interface Props {
  /** Ovládání, které patří k celé sekci — vpravo v řádku. */
  akce?: React.ReactNode;
}

export const HlavickaSekce: React.FC<Props> = ({ akce }) =>
  akce ? (
    <header className="mb-4 flex items-center justify-end gap-2">{akce}</header>
  ) : null;
