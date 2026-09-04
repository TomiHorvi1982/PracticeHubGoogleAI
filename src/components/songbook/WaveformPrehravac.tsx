import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  url: string;
  nazev: string;
}

/**
 * Přehrávač zvukového vzorku s vykreslenou křivkou.
 *
 * Vzorek bicích trvá zlomek sekundy. Posuvník, který u něj jen jede zleva
 * doprava, neřekne nic — zato z křivky je vidět, kde je náraz a kde jen
 * doznívá, takže se dá poznat useknutý konec nebo ticho na začátku.
 *
 * Křivka se počítá z dekódovaného zvuku jednou a kreslí do canvasu; ukazatel
 * pozice se překresluje zvlášť, aby se kvůli němu nemusela počítat znovu.
 */
export const WaveformPrehravac: React.FC<Props> = ({ url, nazev }) => {
  const [obalky, setObalky] = useState<{ min: number; max: number }[] | null>(null);
  const [delka, setDelka] = useState(0);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hraje, setHraje] = useState(false);
  const [pozice, setPozice] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const zdrojRef = useRef<AudioBufferSourceNode | null>(null);
  const zacatekRef = useRef(0);
  const snimekRef = useRef(0);

  /** Kolik sloupců křivky se počítá. Víc než šířka v pixelech nemá smysl. */
  const SLOUPCU = 420;

  useEffect(() => {
    let zruseno = false;
    setObalky(null);
    setChyba(null);
    setPozice(0);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`úložiště vrátilo ${res.status}`);
        const bajty = await res.arrayBuffer();

        const ctx = ctxRef.current || new AudioContext();
        ctxRef.current = ctx;
        const buffer = await ctx.decodeAudioData(bajty.slice(0));
        if (zruseno) return;

        bufferRef.current = buffer;
        setDelka(buffer.duration);

        // Obálka: pro každý sloupec nejnižší a nejvyšší vzorek v jeho úseku.
        // Průměr by špičky srovnal a z ostrého úderu by udělal hrbolek.
        const data = buffer.getChannelData(0);
        const naSloupec = Math.max(1, Math.floor(data.length / SLOUPCU));
        const out: { min: number; max: number }[] = [];
        for (let i = 0; i < SLOUPCU; i++) {
          let min = 1;
          let max = -1;
          const od = i * naSloupec;
          for (let j = od; j < od + naSloupec && j < data.length; j++) {
            if (data[j] < min) min = data[j];
            if (data[j] > max) max = data[j];
          }
          out.push({ min: min === 1 ? 0 : min, max: max === -1 ? 0 : max });
        }
        setObalky(out);
      } catch (e: any) {
        if (!zruseno) setChyba(e?.message || 'Zvuk se nepodařilo načíst.');
      }
    })();

    return () => {
      zruseno = true;
    };
  }, [url]);

  // Vykreslení křivky i ukazatele.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !obalky) return;

    const sirka = canvas.clientWidth || 420;
    const vyska = canvas.clientHeight || 88;
    // Bez přepočtu na poměr obrazovky je křivka na retině rozmazaná.
    const pomer = window.devicePixelRatio || 1;
    canvas.width = sirka * pomer;
    canvas.height = vyska * pomer;

    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(pomer, 0, 0, pomer, 0, 0);
    g.clearRect(0, 0, sirka, vyska);

    const stred = vyska / 2;
    const krok = sirka / obalky.length;
    const podil = delka > 0 ? pozice / delka : 0;

    obalky.forEach((o, i) => {
      const x = i * krok;
      // Část, která už zazněla, je zvýrazněná — to je ten posuvník.
      g.fillStyle = x / sirka <= podil ? '#FF9F0A' : 'rgba(255,255,255,0.28)';
      const y1 = stred - o.max * stred * 0.92;
      const y2 = stred - o.min * stred * 0.92;
      g.fillRect(x, y1, Math.max(1, krok - 0.5), Math.max(1, y2 - y1));
    });

    // Osa ticha.
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, stred, sirka, 1);

    if (hraje) {
      g.fillStyle = '#30D158';
      g.fillRect(podil * sirka, 0, 1.5, vyska);
    }
  }, [obalky, pozice, delka, hraje]);

  const zastav = () => {
    zdrojRef.current?.stop();
    zdrojRef.current = null;
    cancelAnimationFrame(snimekRef.current);
    setHraje(false);
    setPozice(0);
  };

  const prehraj = () => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;
    if (hraje) {
      zastav();
      return;
    }
    if (ctx.state === 'suspended') void ctx.resume();

    const zdroj = ctx.createBufferSource();
    zdroj.buffer = buffer;
    zdroj.connect(ctx.destination);
    zdroj.onended = () => {
      if (zdrojRef.current === zdroj) zastav();
    };
    zdroj.start();
    zdrojRef.current = zdroj;
    zacatekRef.current = ctx.currentTime;
    setHraje(true);

    const tik = () => {
      if (!ctxRef.current || zdrojRef.current !== zdroj) return;
      setPozice(ctxRef.current.currentTime - zacatekRef.current);
      snimekRef.current = requestAnimationFrame(tik);
    };
    snimekRef.current = requestAnimationFrame(tik);
  };

  /** Kliknutím do křivky se přehraje od toho místa. */
  const klikDoKrivky = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const buffer = bufferRef.current;
    const ctx = ctxRef.current;
    if (!buffer || !ctx) return;
    const box = e.currentTarget.getBoundingClientRect();
    const od = Math.max(0, Math.min(buffer.duration, ((e.clientX - box.left) / box.width) * buffer.duration));

    zdrojRef.current?.stop();
    if (ctx.state === 'suspended') void ctx.resume();
    const zdroj = ctx.createBufferSource();
    zdroj.buffer = buffer;
    zdroj.connect(ctx.destination);
    zdroj.onended = () => {
      if (zdrojRef.current === zdroj) zastav();
    };
    zdroj.start(0, od);
    zdrojRef.current = zdroj;
    zacatekRef.current = ctx.currentTime - od;
    setHraje(true);
    const tik = () => {
      if (!ctxRef.current || zdrojRef.current !== zdroj) return;
      setPozice(ctxRef.current.currentTime - zacatekRef.current);
      snimekRef.current = requestAnimationFrame(tik);
    };
    snimekRef.current = requestAnimationFrame(tik);
  };

  useEffect(() => () => zastav(), []);

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={prehraj}
          disabled={!obalky}
          className={`p-2 rounded-xl transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
            hraje ? 'bg-red-500 text-white' : 'bg-uspech text-black'
          }`}
          title={hraje ? 'Zastavit' : 'Přehrát'}
        >
          {hraje ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-drobne font-bold text-white truncate">{nazev}</div>
          <div className="text-stitek font-mono text-neutral-500">
            {delka > 0 ? `${pozice.toFixed(2)} / ${delka.toFixed(2)} s` : '—'}
          </div>
        </div>
      </div>

      {chyba ? (
        <div className="flex items-center gap-1.5 text-stitek text-chyba">
          <AlertCircle className="w-3 h-3 shrink-0" /> {chyba}
        </div>
      ) : !obalky ? (
        <div className="flex items-center gap-1.5 text-stitek text-neutral-500 h-[88px]">
          <Loader2 className="w-3 h-3 animate-spin" /> Počítám křivku…
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          onClick={klikDoKrivky}
          className="w-full h-[88px] cursor-pointer"
          title="Kliknutím přehraješ od tohohle místa"
        />
      )}
    </div>
  );
};
