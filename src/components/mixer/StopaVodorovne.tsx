import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, Headphones } from 'lucide-react';
import { stemAudioService, ChannelState } from '../../services/stemAudioService';
import { casNaX, xNaCas } from '../../services/vlnovka';

/** Šířka levého sloupce s ovládáním. Musí být stejná u osy i u stop. */
export const SIRKA_OVLADANI = 236;
/** Výška jednoho pruhu se stopou. */
export const VYSKA_STOPY = 72;

/**
 * Vlnovka jedné stopy.
 *
 * Vlastní komponenta a `memo` schválně: přehrávací čára se hýbe dvacetkrát
 * za vteřinu a bez toho by se při každém posunu překresľovalo všech osm
 * pláten. Takhle se plátno dotkne jen při změně šířky nebo stopy.
 */
const Vlnovka = React.memo(function Vlnovka({
  stemId, barva, verze, sirka,
}: { stemId: string; barva: string; verze: string; sirka: number }) {
  const platno = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = platno.current;
    if (!c || sirka <= 0) return;
    // Na retina displeji by plátno v logických pixelech bylo rozmazané.
    const hustota = window.devicePixelRatio || 1;
    const vyska = VYSKA_STOPY - 16;
    c.width = Math.floor(sirka * hustota);
    c.height = Math.floor(vyska * hustota);
    c.style.width = `${sirka}px`;
    c.style.height = `${vyska}px`;

    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
    ctx.clearRect(0, 0, sirka, vyska);

    const v = stemAudioService.vrcholyStopy(stemId, Math.floor(sirka));
    const stred = vyska / 2;

    if (!v) {
      // Prázdná stopa dostane jen tenkou čáru — je vidět, že tam je,
      // ale nepředstírá, že hraje ticho.
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, stred);
      ctx.lineTo(sirka, stred);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = barva;
    for (let i = 0; i < v.length; i++) {
      // Aspoň jeden pixel, ať v tichých místech stopa nezmizí úplně.
      const h = Math.max(1, v[i] * stred);
      ctx.fillRect(i, stred - h, 1, h * 2);
    }
  }, [stemId, barva, verze, sirka]);

  return <canvas ref={platno} className="block" />;
});

interface Props {
  stemId: string;
  popis: string;
  /** Co je na faderu pověšené; `null`, když nic. */
  naNem: string | null;
  barva: string;
  channel: ChannelState;
  delka: number;
  cas: number;
  jeCil: boolean;
  /** Mění se, když se vymění zvuk — plátno podle toho pozná, že má překreslit. */
  verze: string;
  onUpdate: (u: Partial<ChannelState>) => void;
  onVybrat: () => void;
}

/**
 * Jeden vodorovný pruh: vlevo ovládání, vpravo průběh v čase.
 *
 * Levý sloupec má pevnou šířku, aby stopy pod sebou lícovaly s časovou
 * osou nad nimi — kdyby se přizpůsoboval obsahu, každý pruh by začínal
 * jinde a osa by nad ničím neseděla.
 */
export const StopaVodorovne: React.FC<Props> = ({
  stemId, popis, naNem, barva, channel, delka, cas, jeCil, verze, onUpdate, onVybrat,
}) => {
  const pas = useRef<HTMLDivElement | null>(null);
  const [sirka, setSirka] = useState(0);

  useEffect(() => {
    const el = pas.current;
    if (!el) return;
    const o = new ResizeObserver(([z]) => setSirka(Math.floor(z.contentRect.width)));
    o.observe(el);
    setSirka(Math.floor(el.getBoundingClientRect().width));
    return () => o.disconnect();
  }, []);

  const x = useMemo(() => casNaX(cas, delka, sirka), [cas, delka, sirka]);
  const obsazeno = !!naNem;

  return (
    <div className="flex items-stretch border-t border-slate-800/70" style={{ height: VYSKA_STOPY }}>
      {/* OVLÁDÁNÍ */}
      <div
        className={`shrink-0 px-3 py-2 flex flex-col justify-center gap-1.5 border-r border-slate-800/70 ${
          jeCil ? 'bg-amber-500/[0.07]' : ''
        }`}
        style={{ width: SIRKA_OVLADANI }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: obsazeno ? barva : '#475569' }} />
          <button
            onClick={onVybrat}
            title={naNem || 'Vyber sem soubor'}
            className={`text-[11px] font-bold truncate cursor-pointer text-left flex-1 min-w-0 ${
              jeCil ? 'text-amber-400' : obsazeno ? 'text-white' : 'text-slate-500'
            }`}
          >
            {popis}
          </button>
          <button
            onClick={() => onUpdate({ isMuted: !channel.isMuted })}
            title={channel.isMuted ? 'Zrušit ztlumení' : 'Ztlumit'}
            className={`p-1 rounded cursor-pointer ${
              channel.isMuted ? 'bg-rose-500/25 text-rose-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {channel.isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
          <button
            onClick={() => onUpdate({ isSolo: !channel.isSolo })}
            title="Pustit jen tuhle stopu"
            className={`p-1 rounded cursor-pointer ${
              channel.isSolo ? 'bg-amber-500/25 text-amber-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Headphones className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="range"
            min={-60}
            max={6}
            step={0.5}
            value={channel.volume}
            onChange={(e) => onUpdate({ volume: Number(e.target.value) })}
            className="flex-1 h-1 cursor-pointer"
            style={{ accentColor: barva }}
            title="Hlasitost"
          />
          <span className="text-[10px] font-mono text-slate-400 w-12 text-right tabular-nums shrink-0">
            {channel.volume <= -60 ? '−∞' : `${channel.volume > 0 ? '+' : ''}${channel.volume.toFixed(1)}`} dB
          </span>
        </div>

        <div className="text-[9px] text-slate-600 truncate">{naNem || 'prázdný'}</div>
      </div>

      {/* PRŮBĚH V ČASE */}
      <div
        ref={pas}
        onClick={(e) => {
          if (!(delka > 0)) return;
          const r = e.currentTarget.getBoundingClientRect();
          stemAudioService.seek(xNaCas(e.clientX - r.left, delka, r.width));
        }}
        className="flex-1 relative min-w-0 cursor-pointer px-0 py-2"
        title={delka > 0 ? 'Klikni, kam chceš skočit' : undefined}
      >
        <Vlnovka stemId={stemId} barva={barva} verze={verze} sirka={sirka} />
        {delka > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-amber-400/80 pointer-events-none"
            style={{ left: x }}
          />
        )}
      </div>
    </div>
  );
};
