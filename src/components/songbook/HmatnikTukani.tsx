import React from 'react';
import { STRUNY_STANDARD } from '../../services/akordy';

interface Props {
  /** Praha na každé struně; -1 je dusená, 0 prázdná. */
  prahy: number[];
  onZmena: (prahy: number[]) => void;
  pocetPrahu?: number;
  sirka?: number;
  /** Ladění v číslech MIDI, odspodu nahoru. */
  struny?: number[];
  /** Jména strun k popiskům — ať je vidět, v čem se hraje. */
  jmenaStrun?: string[];
}

/**
 * Hmatník, na kterém se akord naťuká.
 *
 * Struny jsou vodorovně a nejnižší dole — tak, jak kytara leží v klíně,
 * ne jak se kreslí do zpěvníků. Kliknutí na tutéž pozici ji zase zruší,
 * takže se nikam nemusí chodit mazat.
 */
export const HmatnikTukani: React.FC<Props> = ({
  prahy, onZmena, pocetPrahu = 5, sirka = 300, struny = STRUNY_STANDARD, jmenaStrun,
}) => {
  const okraj = 40;
  const rozestup = (sirka - okraj - 10) / pocetPrahu;
  const vyska = 6 * 16 + 16;

  const nastav = (struna: number, praha: number) => {
    const nove = [...prahy];
    nove[struna] = nove[struna] === praha ? -1 : praha;
    onZmena(nove);
  };

  return (
    <svg width={sirka} height={vyska} viewBox={`0 0 ${sirka} ${vyska}`} className="select-none">
      {/* Pražce */}
      {Array.from({ length: pocetPrahu + 1 }, (_, i) => (
        <line
          key={i}
          x1={okraj + i * rozestup}
          y1={12}
          x2={okraj + i * rozestup}
          y2={vyska - 12}
          stroke={i === 0 ? '#E5E5EA' : '#3a3a42'}
          strokeWidth={i === 0 ? 3 : 1}
        />
      ))}

      {struny.map((_, si) => {
        // Nejnižší struna dole: v poli je první, na obrázku poslední.
        const y = 12 + (5 - si) * 16;
        return (
          <g key={si}>
            <line x1={okraj} y1={y} x2={sirka - 10} y2={y} stroke="#5a5a66" strokeWidth={0.8 + si * 0.15} />

            {/* Jméno struny — v jiném ladění je to jediné, podle čeho
                se pozná, co se vlastně mačká. */}
            {jmenaStrun?.[si] && (
              <text x={4} y={y + 3} fontSize={8} fill="#6a6a76" className="font-mono">
                {jmenaStrun[si].replace(/\d/, '')}
              </text>
            )}

            {/* Dusit / prázdná struna */}
            <text
              x={26}
              y={y + 3.5}
              fontSize={10}
              textAnchor="middle"
              fill={prahy[si] === 0 ? '#30D158' : prahy[si] < 0 ? '#FF453A' : '#6a6a76'}
              className="cursor-pointer font-mono"
              onClick={() => onZmena(prahy.map((p, i) => (i === si ? (p === 0 ? -1 : 0) : p)))}
            >
              {prahy[si] === 0 ? 'o' : prahy[si] < 0 ? '×' : '·'}
            </text>

            {Array.from({ length: pocetPrahu }, (_, pi) => {
              const praha = pi + 1;
              const cx = okraj + pi * rozestup + rozestup / 2;
              const aktivni = prahy[si] === praha;
              return (
                <circle
                  key={praha}
                  cx={cx}
                  cy={y}
                  r={6}
                  fill={aktivni ? '#FF9F0A' : 'transparent'}
                  stroke={aktivni ? '#FF9F0A' : '#ffffff14'}
                  strokeWidth={1}
                  className="cursor-pointer"
                  onClick={() => nastav(si, praha)}
                />
              );
            })}
          </g>
        );
      })}

      {Array.from({ length: pocetPrahu }, (_, i) => (
        <text
          key={i}
          x={okraj + i * rozestup + rozestup / 2}
          y={vyska - 1}
          fontSize={8}
          textAnchor="middle"
          fill="#6a6a76"
          className="font-mono"
        >
          {i + 1}
        </text>
      ))}
    </svg>
  );
};
