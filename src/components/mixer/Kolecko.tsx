import React, { useRef } from 'react';

/**
 * Otočné kolečko.
 *
 * Jako na aparátu: chytneš a táhneš. Svisle, ne po kruhu — kroužit myší
 * kolem středu je přesně tak nepřesné, jak to zní, a všechny hardwarové
 * ovladače i pluginy to dělají svisle.
 *
 * Vodorovné tažení jde taky, aby to fungovalo i na úzkém prstu na
 * dotyku, kde se svislý pohyb plete s rolováním stránky.
 */

interface Props {
  hodnota: number;
  min: number;
  max: number;
  onZmena: (v: number) => void;
  popis: string;
  /** Co se ukáže pod kolečkem — jednotka si formátuje volající. */
  text: string;
  /** Barva ukazatele. Výchozí je značková zlatá. */
  barva?: string;
  /** Vypnuté kolečko jde vidět, ale nehne se s ním. */
  vypnuto?: boolean;
  velikost?: number;
}

/** Kolik pixelů tažení znamená celý rozsah. */
const DRAHA = 140;

export const Kolecko: React.FC<Props> = ({
  hodnota, min, max, onZmena, popis, text,
  barva = 'var(--color-znacka)', vypnuto = false, velikost = 44,
}) => {
  const tah = useRef<{ y: number; x: number; od: number } | null>(null);

  const podil = Math.max(0, Math.min(1, (hodnota - min) / (max - min || 1)));
  // Mrtvý úhel dole: ukazatel jde od sedmi do pěti hodin, jako na
  // skutečném potenciometru. Celých 360° by nešlo poznat, kde je nula.
  const uhel = -135 + podil * 270;

  const zacni = (e: React.PointerEvent) => {
    if (vypnuto || e.button !== 0) return;
    tah.current = { y: e.clientY, x: e.clientX, od: hodnota };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const pohyb = (ev: PointerEvent) => {
      const t = tah.current;
      if (!t) return;
      // Nahoru přidává, dolů ubírá; vodorovně doprava přidává.
      const posun = (t.y - ev.clientY) + (ev.clientX - t.x);
      // Se shiftem jemněji — na doladění prahu brány o kousek.
      const citlivost = ev.shiftKey ? 4 : 1;
      const nova = t.od + (posun / (DRAHA * citlivost)) * (max - min);
      onZmena(Math.max(min, Math.min(max, nova)));
    };
    const konec = () => {
      tah.current = null;
      window.removeEventListener('pointermove', pohyb);
      window.removeEventListener('pointerup', konec);
    };
    window.addEventListener('pointermove', pohyb);
    window.addEventListener('pointerup', konec);
  };

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        role="slider"
        tabIndex={vypnuto ? -1 : 0}
        aria-label={popis}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(hodnota * 100) / 100}
        aria-valuetext={text}
        aria-disabled={vypnuto}
        onPointerDown={zacni}
        // Klávesnice pro ty, kdo myš nepoužívají — a taky na doladění
        // po jednom kroku, což se tažením netrefí.
        onKeyDown={(e) => {
          if (vypnuto) return;
          const krok = (max - min) / (e.shiftKey ? 100 : 20);
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onZmena(Math.min(max, hodnota + krok));
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onZmena(Math.max(min, hodnota - krok));
          }
        }}
        title={`${popis}: ${text}`}
        style={{ width: velikost, height: velikost }}
        className={`relative rounded-full border border-kresba bg-vhloubeni
          focus-visible:outline-2 focus-visible:outline-znacka focus-visible:outline-offset-2
          ${vypnuto ? 'opacity-40' : 'cursor-ns-resize hover:border-znacka-okraj'}`}
      >
        {/* Oblouk projeté dráhy. Kreslí se kuželem, ne obrázkem —
            u čtyřiceti pixelů je to ostřejší než jakákoli grafika. */}
        <span
          aria-hidden="true"
          className="absolute inset-[3px] rounded-full"
          style={{
            background: `conic-gradient(from 225deg, ${barva} 0turn ${(podil * 270) / 360}turn, transparent ${(podil * 270) / 360}turn 0.75turn, transparent 0.75turn 1turn)`,
            opacity: 0.75,
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-[7px] rounded-full bg-plocha-2 border border-kresba-jemna"
        />
        {/* Ryska. */}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 origin-bottom rounded-full"
          style={{
            width: 2,
            height: velikost * 0.28,
            marginLeft: -1,
            marginTop: -velikost * 0.28,
            background: vypnuto ? 'var(--color-pismo-slaby)' : barva,
            transform: `rotate(${uhel}deg)`,
          }}
        />
      </div>
      <span className="stitek-pole leading-none">{popis}</span>
      <span className="text-stitek font-mono text-pismo-tlum tabular-nums leading-none">{text}</span>
    </div>
  );
};
