import React, { useRef } from 'react';
import { casNaX, xNaCas, dobyVRozsahu, dobaVTaktu, srovnejSmycku, PRAH_MRIZKY } from '../../services/mrizkaDob';

/**
 * Časová osa nad stopami: čas, doby a smyčka.
 *
 * Tři vrstvy nad sebou, protože každá odpovídá na jinou otázku:
 * popisky říkají „kolikátá vteřina", mřížka dob „kde je rytmus"
 * a úchyty smyčky „co se opakuje".
 *
 * Doby se kreslí jen tehdy, když mřížka na nahrávku opravdu sedí.
 * Čára uprostřed tónu je horší než žádná — člověk podle ní míří
 * a pak se diví, proč mu to nesedí.
 */

interface Props {
  delka: number;
  od: number;
  doKdy: number;
  cas: number;
  bpm: number;
  faze: number;
  /** 0–1; pod prahem se mřížka nekreslí. */
  shodaMrizky: number;
  dobVTaktu?: number;
  smycka: { od: number; do: number } | null;
  onSmycka: (s: { od: number; do: number } | null) => void;
  onSeek: (cas: number) => void;
}

const cas2 = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const v = Math.floor(s % 60);
  return `${m}:${String(v).padStart(2, '0')}`;
};

/** Kolik vteřin mezi popisky, aby se nepřekrývaly. */
function krokPopisku(rozsah: number, sirka: number): number {
  const MIN_PX = 64;
  for (const k of [1, 2, 5, 10, 15, 30, 60, 120, 300]) {
    if ((k / rozsah) * sirka >= MIN_PX) return k;
  }
  return 600;
}

export const CasovaOsa: React.FC<Props> = ({
  delka, od, doKdy, cas, bpm, faze, shodaMrizky, dobVTaktu = 4,
  smycka, onSmycka, onSeek,
}) => {
  const pruh = useRef<HTMLDivElement | null>(null);
  const tahne = useRef<'od' | 'do' | 'novy' | null>(null);
  const zacatek = useRef(0);

  const sirka = pruh.current?.clientWidth || 0;
  const rozsah = doKdy - od;
  const krok = krokPopisku(rozsah || 1, sirka || 1);

  const popisky: number[] = [];
  if (rozsah > 0) {
    for (let t = Math.ceil(od / krok) * krok; t <= doKdy; t += krok) popisky.push(t);
  }

  // Mřížce se věří až od dvou třetin shody. Níž bývá tempo odhadnuté
  // ze skladby, která pravidelný rytmus nemá.
  const doby = shodaMrizky >= PRAH_MRIZKY ? dobyVRozsahu(bpm, faze, od, doKdy) : [];

  const casZUdalosti = (e: React.PointerEvent | PointerEvent) => {
    const r = pruh.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(delka, xNaCas((e as any).clientX - r.left, od, doKdy, r.width)));
  };

  const zacniTah = (co: 'od' | 'do' | 'novy') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    tahne.current = co;
    zacatek.current = casZUdalosti(e);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const pohyb = (e: React.PointerEvent) => {
    if (!tahne.current) return;
    const t = casZUdalosti(e);
    if (tahne.current === 'novy') onSmycka(srovnejSmycku(zacatek.current, t, delka));
    else if (smycka) {
      onSmycka(srovnejSmycku(tahne.current === 'od' ? t : smycka.od, tahne.current === 'do' ? t : smycka.do, delka));
    }
  };

  const konec = () => { tahne.current = null; };

  return (
    <div
      ref={pruh}
      className="relative h-9 select-none touch-none cursor-crosshair"
      onPointerDown={zacniTah('novy')}
      onPointerMove={pohyb}
      onPointerUp={konec}
      onPointerCancel={konec}
      onDoubleClick={() => onSmycka(null)}
      title="Tažením vyznačíš smyčku, dvojklikem ji zrušíš"
    >
      {/* Doby. Přízvučná je výraznější, ať je poznat začátek taktu. */}
      {doby.map((t) => {
        const prvni = dobaVTaktu(t, bpm, faze, dobVTaktu) === 0;
        return (
          <span
            key={t}
            className={`absolute bottom-0 w-px ${prvni ? 'h-4 bg-white/25' : 'h-2 bg-white/10'}`}
            style={{ left: casNaX(t, od, doKdy, sirka) }}
            aria-hidden="true"
          />
        );
      })}

      {/* Smyčka */}
      {smycka && (
        <>
          <span
            className="absolute inset-y-0 bg-znacka/15 border-x border-znacka/60"
            style={{
              left: casNaX(smycka.od, od, doKdy, sirka),
              width: Math.max(2, casNaX(smycka.do, od, doKdy, sirka) - casNaX(smycka.od, od, doKdy, sirka)),
            }}
          />
          {(['od', 'do'] as const).map((k) => (
            <span
              key={k}
              onPointerDown={zacniTah(k)}
              role="slider"
              tabIndex={0}
              aria-label={k === 'od' ? 'Začátek smyčky' : 'Konec smyčky'}
              aria-valuenow={Math.round(smycka[k])}
              aria-valuemin={0}
              aria-valuemax={Math.round(delka)}
              className="absolute inset-y-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center"
              style={{ left: casNaX(smycka[k], od, doKdy, sirka) }}
            >
              <span className="w-1 h-5 rounded-full bg-znacka shadow" />
            </span>
          ))}
        </>
      )}

      {/* Popisky času */}
      {popisky.map((t) => (
        <span
          key={t}
          className="absolute top-0 text-stitek text-slate-500 tabular-nums pl-1 border-l border-slate-700/60 h-4"
          style={{ left: casNaX(t, od, doKdy, sirka) }}
        >
          {cas2(t)}
        </span>
      ))}

      {/* Přehrávací hlava */}
      <span
        className="absolute inset-y-0 w-px bg-chyba pointer-events-none"
        style={{ left: casNaX(cas, od, doKdy, sirka) }}
        aria-hidden="true"
      />
    </div>
  );
};
