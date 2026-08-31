import React from 'react';

/**
 * Kresby nástrojů.
 *
 * Kreslené, ne stažené: obrázek z internetu by se musel načítat, mohl by
 * zmizet a k tomu má vlastníka. SVG je součástí aplikace, škáluje se do
 * libovolné velikosti a barvu si bere z okolí, takže sedne k jakémukoli
 * podbarvení karty.
 *
 * Jsou to zkratky, ne portréty — v karetní velikosti stejně rozhoduje
 * silueta: klaviatura, blána a činel, mřížka padů, hmatník s pražci.
 */

type Props = { className?: string };

export const ObrazekKlavir: React.FC<Props> = ({ className }) => (
  <svg viewBox="0 0 96 64" className={className} fill="none" aria-hidden="true">
    <rect x="4" y="14" width="88" height="40" rx="4" fill="currentColor" opacity="0.12" />
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
      <rect
        key={i}
        x={7 + i * 8.2}
        y={20}
        width={7.4}
        height={28}
        rx={1.5}
        fill="currentColor"
        opacity="0.85"
      />
    ))}
    {[0, 1, 3, 4, 5, 7, 8].map((i) => (
      <rect key={`b${i}`} x={12.2 + i * 8.2} y={20} width={4.6} height={17} rx={1.2} fill="#0B0B0E" />
    ))}
    <rect x="4" y="10" width="88" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
  </svg>
);

export const ObrazekBici: React.FC<Props> = ({ className }) => (
  <svg viewBox="0 0 96 64" className={className} fill="none" aria-hidden="true">
    {/* velký buben */}
    <ellipse cx="40" cy="42" rx="24" ry="17" fill="currentColor" opacity="0.16" />
    <ellipse cx="40" cy="42" rx="24" ry="17" stroke="currentColor" strokeWidth="2.5" opacity="0.8" />
    <ellipse cx="40" cy="42" rx="13" ry="9" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
    {/* činel */}
    <ellipse cx="74" cy="20" rx="17" ry="4.5" fill="currentColor" opacity="0.75" />
    <path d="M74 20v22" stroke="currentColor" strokeWidth="2.5" opacity="0.6" strokeLinecap="round" />
    {/* paličky */}
    <path d="M12 16l18 16" stroke="currentColor" strokeWidth="2.5" opacity="0.55" strokeLinecap="round" />
    <circle cx="11" cy="15" r="3" fill="currentColor" opacity="0.7" />
  </svg>
);

export const ObrazekPady: React.FC<Props> = ({ className }) => (
  <svg viewBox="0 0 96 64" className={className} fill="none" aria-hidden="true">
    <rect x="8" y="6" width="80" height="52" rx="6" fill="currentColor" opacity="0.1" />
    {[0, 1, 2, 3].map((r) =>
      [0, 1, 2, 3].map((c) => (
        <rect
          key={`${r}-${c}`}
          x={14 + c * 18}
          y={12 + r * 11.5}
          width={14}
          height={8.5}
          rx={2}
          fill="currentColor"
          opacity={(r + c) % 3 === 0 ? 0.85 : 0.35}
        />
      )),
    )}
  </svg>
);

export const ObrazekHmatnik: React.FC<Props> = ({ className }) => (
  <svg viewBox="0 0 96 64" className={className} fill="none" aria-hidden="true">
    <rect x="4" y="16" width="88" height="32" rx="3" fill="currentColor" opacity="0.14" />
    {/* pražce */}
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <path key={i} d={`M${18 + i * 14} 16v32`} stroke="currentColor" strokeWidth="2" opacity="0.5" />
    ))}
    {/* struny */}
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <path
        key={`s${i}`}
        d={`M4 ${19.5 + i * 5.2}h88`}
        stroke="currentColor"
        strokeWidth={0.7 + i * 0.28}
        opacity="0.8"
      />
    ))}
    <circle cx="53" cy="32" r="3.2" fill="currentColor" opacity="0.35" />
  </svg>
);
