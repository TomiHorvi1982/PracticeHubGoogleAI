import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, Headphones } from 'lucide-react';
import { stemAudioService, ChannelState } from '../../services/stemAudioService';
import { casNaX as casNaXVyrez, xNaCas as xNaCasVyrez } from '../../services/mrizkaDob';

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
  stemId, barva, verze, sirka, vyskaPruhu, od, doKdy,
}: {
  stemId: string; barva: string; verze: string; sirka: number; vyskaPruhu: number;
  od: number; doKdy: number;
}) {
  const platno = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = platno.current;
    if (!c || sirka <= 0) return;
    // Na retina displeji by plátno v logických pixelech bylo rozmazané.
    const hustota = window.devicePixelRatio || 1;
    const vyska = vyskaPruhu - 16;
    c.width = Math.floor(sirka * hustota);
    c.height = Math.floor(vyska * hustota);
    c.style.width = `${sirka}px`;
    c.style.height = `${vyska}px`;

    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(hustota, 0, 0, hustota, 0, 0);
    ctx.clearRect(0, 0, sirka, vyska);

    // Při přiblížení se počítá jen z toho, co je vidět — roztažené
    // vrcholy celé skladby by daly schodovitou čáru z pár hodnot.
    const v = stemAudioService.vrcholyUseku(stemId, Math.floor(sirka), od, doKdy);
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
  }, [stemId, barva, verze, sirka, vyskaPruhu, od, doKdy]);

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
  /** Kus skladby, který je vidět — mění se přiblížením. */
  od: number;
  doKdy: number;
  jeCil: boolean;
  /** Mění se, když se vymění zvuk — plátno podle toho pozná, že má překreslit. */
  verze: string;
  /** Výška pruhu. Táhne se za spodní hranu sloupce s názvem. */
  vyska: number;
  onUpdate: (u: Partial<ChannelState>) => void;
  onVybrat: () => void;
  /** Průběžně při tažení; nadřazená sekce si výšku drží za všechny stopy. */
  onVyska: (v: number) => void;
}

/**
 * Jeden vodorovný pruh: vlevo ovládání, vpravo průběh v čase.
 *
 * Levý sloupec má pevnou šířku, aby stopy pod sebou lícovaly s časovou
 * osou nad nimi — kdyby se přizpůsoboval obsahu, každý pruh by začínal
 * jinde a osa by nad ničím neseděla.
 */
export const StopaVodorovne: React.FC<Props> = ({
  stemId, popis, naNem, barva, channel, delka, cas, od, doKdy, jeCil, verze, vyska,
  onUpdate, onVybrat, onVyska,
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

  const x = useMemo(() => casNaXVyrez(cas, od, doKdy, sirka), [cas, od, doKdy, sirka]);
  const obsazeno = !!naNem;

  // Vybrat jde kliknutím kamkoli do stopy, ne jen na její název:
  // do vlnovky se kliká nejčastěji a fader se má označit i tak.
  return (
    <div
      onPointerDownCapture={onVybrat}
      className="flex items-stretch border-t border-slate-800/70"
      style={{ height: vyska }}
    >
      {/* OVLÁDÁNÍ */}
      <div
        className={`relative shrink-0 px-3 py-2 flex flex-col justify-center gap-1.5 overflow-hidden border-r border-slate-800/70 ${
          jeCil ? 'bg-amber-500/[0.07]' : ''
        }`}
        style={{ width: SIRKA_OVLADANI }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: obsazeno ? barva : '#475569' }} />
          <button
            onClick={onVybrat}
            title={naNem || 'Vyber sem soubor'}
            className={`text-drobne font-bold truncate cursor-pointer text-left flex-1 min-w-0 ${
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
          <span className="text-stitek font-mono text-slate-400 w-12 text-right tabular-nums shrink-0">
            {channel.volume <= -60 ? '−∞' : `${channel.volume > 0 ? '+' : ''}${channel.volume.toFixed(1)}`} dB
          </span>
        </div>

        <div className="text-stitek text-slate-600 truncate">{naNem || 'prázdný'}</div>

        {/* ÚCHYT VÝŠKY

            Vlnovka na sedmdesáti pixelech ukáže, že tam něco je, ale ne
            už tvar úderu. Tažením za spodní hranu se pruh roztáhne —
            u všech stop naráz, jinak by přestaly lícovat s osou.

            Sedí uvnitř sloupce s názvem, kde se nic jiného netáhne:
            přes vlnovku se posouvá pohled a přes jezdec hlasitost. */}
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const zacatekY = e.clientY;
            const zacatekV = vyska;
            const tahni = (ev: PointerEvent) => onVyska(zacatekV + (ev.clientY - zacatekY));
            const pust = () => {
              window.removeEventListener('pointermove', tahni);
              window.removeEventListener('pointerup', pust);
            };
            window.addEventListener('pointermove', tahni);
            window.addEventListener('pointerup', pust);
          }}
          onDoubleClick={() => onVyska(VYSKA_STOPY)}
          title="Tažením změníš výšku stop, dvojklikem ji vrátíš"
          className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize group"
        >
          <div className="absolute inset-x-3 bottom-0 h-px bg-transparent group-hover:bg-amber-400/60 transition-colors" />
        </div>
      </div>

      {/* PRŮBĚH V ČASE */}
      <div
        ref={pas}
        onClick={(e) => {
          if (!(delka > 0)) return;
          const r = e.currentTarget.getBoundingClientRect();
          stemAudioService.seek(xNaCasVyrez(e.clientX - r.left, od, doKdy, r.width));
        }}
        className="flex-1 relative min-w-0 cursor-pointer px-0 py-2"
        title={delka > 0 ? 'Klikni, kam chceš skočit' : undefined}
      >
        <Vlnovka
          stemId={stemId}
          barva={barva}
          verze={verze}
          sirka={sirka}
          vyskaPruhu={vyska}
          od={od}
          doKdy={doKdy}
        />
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
