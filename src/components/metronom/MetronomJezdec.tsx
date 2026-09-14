import React, { useEffect, useRef } from 'react';
import { metronomService } from '../../services/metronomService';
import { dobaVTaktu, polohaJezdce, zaUderem } from '../../services/metronomPohyb';

/**
 * Jezdec metronomu — ve stylu ladičky.
 *
 * Jezdí zleva doprava a zpátky a na každé klepnutí stojí na kraji.
 * Čas bere z `metronomService`, tedy z hodin, podle kterých se kliká;
 * vlastní časovač by se se zvukem po chvíli rozešel.
 *
 * Hýbe se mimo React: smyčka zapisuje přímo do SVG. Překreslovat kvůli
 * tomu sekci šedesátkrát za vteřinu by bylo stejně trhané jako dřív
 * ručička ladičky.
 */

const LEVY = 24;
const PRAVY = 336;
const OSA_Y = 58;
/** Jak dlouho po úderu svítí značka na kraji, v dobách. */
const ZABLESK = 0.18;

const ZELENA = '#00B878';
const ZLUTA = '#FFD166';

interface Props {
  bezi: boolean;
  bpm: number;
  dobVTaktu: number;
  /** Která doba se má ozvat akcentem — rozsvítí se zeleně. */
  akcenty: boolean[];
  /** Zavolá se jen při změně doby, ne každý snímek. */
  onDoba?: (doba: number) => void;
}

export const MetronomJezdec: React.FC<Props> = ({ bezi, bpm, dobVTaktu, akcenty, onDoba }) => {
  const jezdec = useRef<SVGGElement | null>(null);
  const jezdecTvar = useRef<SVGRectElement | null>(null);
  const levaZnacka = useRef<SVGCircleElement | null>(null);
  const pravaZnacka = useRef<SVGCircleElement | null>(null);
  const tecky = useRef<(HTMLSpanElement | null)[]>([]);
  const akcentyRef = useRef(akcenty);
  akcentyRef.current = akcenty;
  const onDobaRef = useRef(onDoba);
  onDobaRef.current = onDoba;

  useEffect(() => {
    const posun = (x: number) =>
      jezdec.current?.setAttribute('transform', `translate(${(LEVY + x * (PRAVY - LEVY)).toFixed(2)} 0)`);

    if (!bezi) {
      posun(0);
      levaZnacka.current?.setAttribute('fill-opacity', '0.15');
      pravaZnacka.current?.setAttribute('fill-opacity', '0.15');
      jezdecTvar.current?.setAttribute('fill', '#ffffff');
      jezdecTvar.current?.setAttribute('fill-opacity', '0.3');
      tecky.current.forEach((t) => t?.removeAttribute('data-ted'));
      return;
    }

    let id = 0;
    let posledniDoba = -1;
    const krok = () => {
      const p = metronomService.pozice();
      const doba = dobaVTaktu(p, dobVTaktu);
      const cerstvy = zaUderem(p) < ZABLESK;
      const akcent = !!akcentyRef.current[doba];
      const barva = akcent ? ZELENA : ZLUTA;

      posun(polohaJezdce(p));
      jezdecTvar.current?.setAttribute('fill', cerstvy ? barva : ZLUTA);
      jezdecTvar.current?.setAttribute('fill-opacity', '1');

      // Úder padá střídavě vlevo a vpravo — rozsvítí se ten kraj, kde je jezdec.
      const vlevo = Math.floor(p) % 2 === 0;
      for (const [znacka, jeTady] of [[levaZnacka.current, vlevo], [pravaZnacka.current, !vlevo]] as const) {
        if (!znacka) continue;
        znacka.setAttribute('fill', jeTady && cerstvy ? barva : '#ffffff');
        znacka.setAttribute('fill-opacity', jeTady && cerstvy ? '1' : '0.15');
      }

      if (doba !== posledniDoba) {
        posledniDoba = doba;
        tecky.current.forEach((t, i) => {
          if (!t) return;
          if (i === doba) t.setAttribute('data-ted', ''); else t.removeAttribute('data-ted');
        });
        onDobaRef.current?.(doba);
      }
      id = requestAnimationFrame(krok);
    };
    id = requestAnimationFrame(krok);
    return () => cancelAnimationFrame(id);
  }, [bezi, dobVTaktu]);

  // Rysky po osminách cesty, delší na krajích a uprostřed.
  const rysky = Array.from({ length: 17 }, (_, i) => {
    const x = LEVY + (i / 16) * (PRAVY - LEVY);
    const hlavni = i % 8 === 0;
    return { x, hlavni, i };
  });

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <svg viewBox="0 0 360 100" className="w-full max-w-[520px] block" role="img" aria-label="Jezdec metronomu">
        <line x1={LEVY} y1={OSA_Y} x2={PRAVY} y2={OSA_Y} stroke="#ffffff" strokeOpacity={0.15} strokeWidth={2} strokeLinecap="round" />
        {rysky.map((r) => (
          <line
            key={r.i}
            x1={r.x}
            x2={r.x}
            y1={OSA_Y + (r.hlavni ? 10 : 6)}
            y2={OSA_Y + (r.hlavni ? 22 : 13)}
            stroke="#ffffff"
            strokeOpacity={r.hlavni ? 0.5 : 0.2}
            strokeWidth={r.hlavni ? 2 : 1}
            strokeLinecap="round"
          />
        ))}

        <circle ref={levaZnacka} cx={LEVY} cy={OSA_Y} r={9} fill="#ffffff" fillOpacity={0.15} />
        <circle ref={pravaZnacka} cx={PRAVY} cy={OSA_Y} r={9} fill="#ffffff" fillOpacity={0.15} />

        <g ref={jezdec} transform={`translate(${LEVY} 0)`}>
          <rect ref={jezdecTvar} x={-5} y={OSA_Y - 30} width={10} height={44} rx={5} fill="#ffffff" fillOpacity={0.3} />
        </g>
      </svg>

      <div className="flex items-baseline gap-2 tabular-nums">
        <span className={`text-6xl font-bold font-mono tracking-tight leading-none ${bezi ? 'text-white' : 'text-white/40'}`}>
          {bpm}
        </span>
        <span className="text-2xl font-semibold text-znacka">BPM</span>
      </div>

      <div className="flex items-center gap-2.5 h-5">
        {Array.from({ length: dobVTaktu }, (_, i) => (
          <span
            key={i}
            ref={(el) => { tecky.current[i] = el; }}
            className={`rounded-full bg-white/15 transition-transform duration-75 data-[ted]:scale-125 ${
              akcenty[i]
                ? 'w-4 h-4 data-[ted]:bg-[#00B878] data-[ted]:shadow-[0_0_12px_#00B878]'
                : 'w-3 h-3 data-[ted]:bg-[#FFD166] data-[ted]:shadow-[0_0_10px_#FFD166]'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
