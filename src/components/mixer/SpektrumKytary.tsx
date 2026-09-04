import React, { useEffect, useRef } from 'react';
import { Pasmo, novaSpicka, pasma, popisHz, vyskaPasma } from '../../services/pasmaSpektra';

/**
 * Spektrum kytary — sloupcový analyzér, jaký bývá na aparátu.
 *
 * Kreslí se ručně do plátna proti `AnalyserNode`. Hotové knihovny na
 * tohle existují, ale ta nejlepší (audioMotion-analyzer) je pod AGPL,
 * což by znamenalo zveřejnit zdroják celé appky; zbylé řeší něco jiného.
 * Vlastní kód je tu navíc doma — vlnovky stop se kreslí stejně.
 *
 * Běží na `requestAnimationFrame`, ne na časovači: prohlížeč ho sám
 * uspí, když se na kartu nikdo nedívá, takže to nežere v pozadí.
 */

interface Props {
  /** Odkud číst. `null`, dokud kytara neběží. */
  analyzer: AnalyserNode | null;
  /** Kreslit? Když ne, plátno se vyčistí a smyčka se zastaví. */
  bezi: boolean;
  vyska?: number;
}

/** Kolik sloupců. Dost na to, aby to vypadalo plynule, ne jako pixely. */
const PASEM = 56;

export const SpektrumKytary: React.FC<Props> = ({ analyzer, bezi, vyska = 120 }) => {
  const platno = useRef<HTMLCanvasElement>(null);
  const obal = useRef<HTMLDivElement>(null);
  const spicky = useRef<number[]>([]);

  useEffect(() => {
    const c = platno.current;
    const box = obal.current;
    if (!c || !box) return;

    let bezec = 0;
    let sirka = 0;
    const hustota = window.devicePixelRatio || 1;

    const zmer = () => {
      const w = Math.floor(box.getBoundingClientRect().width);
      if (w === sirka) return;
      sirka = w;
      c.width = Math.floor(w * hustota);
      c.height = Math.floor(vyska * hustota);
      c.style.width = `${w}px`;
      c.style.height = `${vyska}px`;
    };
    zmer();
    const pozorovatel = new ResizeObserver(zmer);
    pozorovatel.observe(box);

    const ctx = c.getContext('2d');
    if (!ctx) return () => pozorovatel.disconnect();

    let rozdeleni: Pasmo[] = [];
    let data = new Uint8Array(0);

    const kresli = () => {
      bezec = requestAnimationFrame(kresli);
      ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
      ctx.clearRect(0, 0, sirka, vyska);

      if (!analyzer || !bezi) {
        spicky.current = [];
        // Klidová linka, ať políčko nevypadá rozbitě, když se nehraje.
        ctx.fillStyle = 'rgba(148,163,184,0.18)';
        ctx.fillRect(0, vyska - 1, sirka, 1);
        return;
      }

      if (rozdeleni.length !== PASEM || data.length !== analyzer.frequencyBinCount) {
        rozdeleni = pasma(PASEM, analyzer.frequencyBinCount, analyzer.context.sampleRate);
        data = new Uint8Array(analyzer.frequencyBinCount);
        spicky.current = new Array(rozdeleni.length).fill(0);
      }
      analyzer.getByteFrequencyData(data);

      const mezera = 2;
      const sirkaSloupce = Math.max(1, (sirka - mezera * (rozdeleni.length - 1)) / rozdeleni.length);

      rozdeleni.forEach((p, i) => {
        const v = vyskaPasma(data, p);
        spicky.current[i] = novaSpicka(spicky.current[i] ?? 0, v);
        const x = i * (sirkaSloupce + mezera);
        const h = Math.max(1, v * (vyska - 10));

        // Barva podle výšky: klidné pásmo zeleně, špička k oranžové
        // a do červené — stejná řeč jako měřáky na faderech.
        const pruh = ctx.createLinearGradient(0, vyska, 0, vyska - h);
        pruh.addColorStop(0, '#30D158');
        pruh.addColorStop(0.65, '#FF9F0A');
        pruh.addColorStop(1, '#FF453A');
        ctx.fillStyle = pruh;
        ctx.fillRect(x, vyska - h, sirkaSloupce, h);

        // Čepička drží špičku, aby bylo vidět, kam to vyskočilo.
        const ys = vyska - Math.max(2, spicky.current[i] * (vyska - 10));
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(x, ys - 2, sirkaSloupce, 2);
      });

      // Popisky frekvencí. Jen několik, jinak by se slily.
      ctx.fillStyle = 'rgba(148,163,184,0.55)';
      ctx.font = '9px ui-monospace, monospace';
      const krok = Math.max(1, Math.floor(rozdeleni.length / 6));
      for (let i = 0; i < rozdeleni.length; i += krok) {
        ctx.fillText(popisHz(rozdeleni[i].stred), i * (sirkaSloupce + mezera), 9);
      }
    };

    kresli();
    return () => {
      cancelAnimationFrame(bezec);
      pozorovatel.disconnect();
    };
  }, [analyzer, bezi, vyska]);

  return (
    <div
      ref={obal}
      className="relative rounded-prvek bg-vhloubeni border border-kresba overflow-hidden"
    >
      <canvas ref={platno} className="block" />
      {!bezi && (
        <span className="absolute inset-0 flex items-center justify-center text-stitek text-pismo-slaby pointer-events-none">
          spustí se se vstupem
        </span>
      )}
    </div>
  );
};
