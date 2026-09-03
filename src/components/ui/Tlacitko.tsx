import React from 'react';

/**
 * Tlačítko.
 *
 * Do téhle chvíle si každá sekce psala vlastní — proto v aplikaci
 * existovalo šest zaoblení a sto barev. Tady je jedno místo, kde se
 * to rozhoduje.
 *
 * Dotykový rozměr je vázaný na šířku okna, ne na velikost tlačítka:
 * pod 1024px má být cíl aspoň 44px vysoký i u drobného tlačítka.
 * Naměřeno bylo 95 % prvků pod limitem, nejmenší 13×13px.
 */

export type DruhTlacitka = 'hlavni' | 'vedlejsi' | 'tichy' | 'nebezpecny';
export type VelikostTlacitka = 'drobne' | 'bezne' | 'velke';

const DRUHY: Record<DruhTlacitka, string> = {
  hlavni: 'bg-znacka text-podklad font-semibold hover:brightness-110 active:brightness-95',
  vedlejsi: 'bg-plocha-3 text-pismo border border-kresba hover:border-kresba-silna hover:bg-plocha-nad',
  tichy: 'text-pismo-tlum hover:text-pismo hover:bg-plocha-2',
  nebezpecny: 'bg-transparent text-chyba border border-chyba/35 hover:bg-chyba/10',
};

const VELIKOSTI: Record<VelikostTlacitka, string> = {
  drobne: 'text-stitek px-2.5 py-1.5 gap-1',
  bezne: 'text-drobne px-3.5 py-2 gap-1.5',
  velke: 'text-zaklad px-5 py-2.5 gap-2',
};

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  druh?: DruhTlacitka;
  velikost?: VelikostTlacitka;
  /** Ikona vlevo. Samotná ikona bez popisku potřebuje `aria-label`. */
  ikona?: React.ReactNode;
  /** Roztáhne na celou šířku rodiče. */
  celaSirka?: boolean;
}

export const Tlacitko: React.FC<Props> = ({
  druh = 'vedlejsi', velikost = 'bezne', ikona, celaSirka, className = '', children, ...zbytek
}) => (
  <button
    {...zbytek}
    className={[
      'inline-flex items-center justify-center rounded-prvek cursor-pointer',
      'transition-colors duration-150 whitespace-nowrap',
      // Dotyk: na úzkých oknech vždy aspoň 44px, na širokých ať si
      // tlačítko určí výšku samo — jinak by lišty zbytečně nabobtnaly.
      'min-h-dotyk lg:min-h-0',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-znacka',
      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-inherit',
      DRUHY[druh], VELIKOSTI[velikost],
      celaSirka ? 'w-full' : '',
      className,
    ].filter(Boolean).join(' ')}
  >
    {ikona}
    {children}
  </button>
);
