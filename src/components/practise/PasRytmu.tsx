import React, { useEffect, useRef } from 'react';
import { metronomService } from '../../services/metronomService';
import { useKreslit } from '../../hooks/useKreslit';

/**
 * Rytmický vzor s běžcem.
 *
 * Šestnáct políček je takt; svítí ta, kde se hraje. Přes ně jede čára
 * podle metronomu, takže je vidět nejen CO hrát, ale i KDY to přijde —
 * statický pruh říkal jen to první a u rychlých šestnáctek se z něj
 * nedalo poznat, kde zrovna jsi.
 *
 * Poloha se počítá z času metronomu, ne z počitadla jeho tiků:
 * `setInterval` se v prohlížeči opožďuje a po pár desítkách taktů by
 * se čára rozešla se zvukem.
 */

interface Props {
  /** Šestnáct kroků taktu; `true` znamená úder. */
  vzor: boolean[];
  /** Běží metronom? Bez něj čára stojí na začátku. */
  bezi: boolean;
  /** Kolik dob má takt. Šestnáctinový vzor se dělí na tolik dílů. */
  dobVTaktu?: number;
}

export const PasRytmu: React.FC<Props> = ({ vzor, bezi, dobVTaktu = 4 }) => {
  const obal = useRef<HTMLDivElement>(null);
  const bezec = useRef<HTMLDivElement>(null);
  const zvyraznene = useRef<HTMLDivElement[]>([]);
  // Na pruh, který není vidět, se čára počítat nemusí — metronom hraje
  // dál a po návratu se dopočítá z jeho času, ne z počitadla snímků.
  const kreslit = useKreslit(obal);

  useEffect(() => {
    if (!bezi || !kreslit) {
      if (bezec.current) bezec.current.style.transform = 'translateX(0)';
      zvyraznene.current.forEach((e) => e?.classList.remove('ring-2', 'ring-white'));
      return;
    }
    let id = 0;
    const krok = () => {
      id = requestAnimationFrame(krok);
      const doby = metronomService.pozice();
      // Zbytek po taktu, převedený na díl 0–1.
      const vTaktu = ((doby % dobVTaktu) + dobVTaktu) % dobVTaktu / dobVTaktu;
      if (bezec.current) bezec.current.style.transform = `translateX(${vTaktu * 100}%)`;

      // Políčko, na kterém běžec zrovna stojí, dostane obrys.
      const i = Math.min(vzor.length - 1, Math.floor(vTaktu * vzor.length));
      zvyraznene.current.forEach((e, j) => {
        if (!e) return;
        e.classList.toggle('ring-2', j === i);
        e.classList.toggle('ring-white', j === i);
      });
    };
    krok();
    return () => cancelAnimationFrame(id);
  }, [bezi, vzor, dobVTaktu, kreslit]);

  return (
    <div className="relative" ref={obal}>
      <div className="flex gap-1">
        {vzor.map((zni, i) => (
          <div
            key={i}
            ref={(el) => { if (el) zvyraznene.current[i] = el; }}
            className={`flex-1 h-7 rounded transition-colors ${
              zni ? 'bg-znacka' : 'bg-white/[0.06]'
            } ${i % 4 === 0 ? 'ring-1 ring-white/25' : ''}`}
            title={`${Math.floor(i / 4) + 1}. doba, ${(i % 4) + 1}. šestnáctina`}
          />
        ))}
      </div>

      {/* Čára jede přes celý pruh; `left: 0` a posun v procentech, aby
          nezáleželo na tom, jak je pruh široký. */}
      <div
        ref={bezec}
        className={`absolute top-0 bottom-0 left-0 w-0.5 bg-white pointer-events-none ${
          bezi ? '' : 'opacity-0'
        }`}
        style={{ willChange: 'transform' }}
      />

      <div className="flex justify-between mt-0.5">
        {Array.from({ length: dobVTaktu }, (_, i) => (
          <span key={i} className="text-stitek text-pismo-slaby tabular-nums">{i + 1}</span>
        ))}
      </div>
    </div>
  );
};
