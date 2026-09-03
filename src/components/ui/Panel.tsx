import React from 'react';

/**
 * Panel — základní plocha, na které něco leží.
 *
 * Hloubka se dělá odstupňovaným pozadím a kresbou okraje, ne stínem:
 * stín na tmavém podkladu není vidět. Původní karty měly pozadí
 * `white/[0.03]` na `#0A0A0C`, takže jejich hranice mizela a hierarchie
 * se nedala přečíst.
 */

interface Props {
  /** `1` splývá s pozadím, `3` je nejvýš. */
  uroven?: 1 | 2 | 3;
  /** Bez vnitřního odsazení — pro tabulky a seznamy, které si ho řeší samy. */
  bezOdsazeni?: boolean;
  className?: string;
  children: React.ReactNode;
}

const UROVNE = {
  1: 'bg-plocha-1 border-kresba-jemna',
  2: 'bg-plocha-2 border-kresba',
  3: 'bg-plocha-3 border-kresba-silna',
} as const;

export const Panel: React.FC<Props> = ({ uroven = 2, bezOdsazeni, className = '', children }) => (
  <div className={`rounded-panel border ${UROVNE[uroven]} ${bezOdsazeni ? '' : 'p-4'} ${className}`}>
    {children}
  </div>
);
