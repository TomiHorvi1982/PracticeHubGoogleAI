import React from 'react';

interface Props {
  /** Čísla MIDI, která mají svítit. */
  tony: number[];
  /** Kliknutí na klávesu — jen v režimu ťukání. */
  onKlik?: (midi: number) => void;
  oktavy?: number;
  /** Od kterého C se kreslí. 60 je střední C. */
  od?: number;
  sirka?: number;
}

const BILE = [0, 2, 4, 5, 7, 9, 11];
const CERNE: Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

/**
 * Malá klaviatura pro akordy.
 *
 * Kreslí se ručně místo hotové komponenty, protože jde o dvě věci naráz:
 * ukázat, které tóny v akordu jsou, a nechat si je naťukat. Klávesy se
 * porovnávají podle tónu bez oktávy — akord zahraný o oktávu výš je
 * pořád tentýž akord.
 */
export const KlavirDiagram: React.FC<Props> = ({
  tony, onKlik, oktavy = 2, od = 60, sirka = 200,
}) => {
  const pocetBilych = oktavy * 7;
  const sirkaBile = sirka / pocetBilych;
  const vyska = sirka * 0.42;
  const tridy = new Set(tony.map((t) => ((t % 12) + 12) % 12));

  const bile: { midi: number; x: number }[] = [];
  const cerne: { midi: number; x: number }[] = [];

  for (let o = 0; o < oktavy; o++) {
    BILE.forEach((p, i) => bile.push({ midi: od + o * 12 + p, x: (o * 7 + i) * sirkaBile }));
    Object.entries(CERNE).forEach(([p, i]) => {
      cerne.push({
        midi: od + o * 12 + Number(p),
        x: (o * 7 + Number(i) + 1) * sirkaBile - sirkaBile * 0.3,
      });
    });
  }

  return (
    <svg width={sirka} height={vyska} viewBox={`0 0 ${sirka} ${vyska}`} className="select-none">
      {bile.map((k) => {
        const sviti = tridy.has(k.midi % 12);
        return (
          <rect
            key={k.midi}
            x={k.x}
            y={0}
            width={sirkaBile - 1}
            height={vyska}
            rx={2}
            fill={sviti ? '#FF9F0A' : '#F2F2F2'}
            stroke="#1a1a1a"
            strokeWidth={0.6}
            onClick={onKlik ? () => onKlik(k.midi) : undefined}
            className={onKlik ? 'cursor-pointer' : ''}
          />
        );
      })}
      {cerne.map((k) => {
        const sviti = tridy.has(k.midi % 12);
        return (
          <rect
            key={k.midi}
            x={k.x}
            y={0}
            width={sirkaBile * 0.6}
            height={vyska * 0.62}
            rx={1.5}
            fill={sviti ? '#C67A00' : '#101014'}
            stroke="#000"
            strokeWidth={0.5}
            onClick={onKlik ? () => onKlik(k.midi) : undefined}
            className={onKlik ? 'cursor-pointer' : ''}
          />
        );
      })}
    </svg>
  );
};
