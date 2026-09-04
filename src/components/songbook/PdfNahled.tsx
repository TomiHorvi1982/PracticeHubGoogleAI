import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, ZoomIn, ZoomOut, ExternalLink } from 'lucide-react';

interface Props {
  url: string;
  nazev: string;
}

/**
 * Náhled PDF vykreslený do plátna.
 *
 * Dřív se spoléhalo na vestavěný prohlížeč PDF přes `<iframe>`. Ten ale
 * nefunguje všude — v zabudovaném okně appky zůstal rám prázdný, přestože
 * soubor dorazil celý a se správným typem. Ověřeno: blob měl 69 kB a
 * začínal `%PDF-1.4`, jen ho neměl kdo zobrazit.
 *
 * Vykreslení vlastní knihovnou na tom nezávisí a chová se všude stejně.
 */
export const PdfNahled: React.FC<Props> = ({ url, nazev }) => {
  const [stran, setStran] = useState(0);
  const [strana, setStrana] = useState(1);
  const [zvetseni, setZvetseni] = useState(1.2);
  const [chyba, setChyba] = useState<string | null>(null);
  const [nacitam, setNacitam] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dokumentRef = useRef<any>(null);
  /** Poslední rozdělaná kresba, aby ji šlo při rychlém listování zrušit. */
  const kresbaRef = useRef<any>(null);

  useEffect(() => {
    let zruseno = false;
    setNacitam(true);
    setChyba(null);
    setStrana(1);

    (async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist');
        // Rozebírání běží ve vlastním vlákně; bez nastavené cesty by si ho
        // knihovna hledala sama a v sestavené appce by ji netrefila.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const doc = await pdfjs.getDocument({ url }).promise;
        if (zruseno) return;
        dokumentRef.current = doc;
        setStran(doc.numPages);
        setNacitam(false);
      } catch (e: any) {
        if (!zruseno) {
          setChyba(e?.message || 'PDF se nepodařilo otevřít.');
          setNacitam(false);
        }
      }
    })();

    return () => {
      zruseno = true;
      dokumentRef.current?.destroy?.();
      dokumentRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const doc = dokumentRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    let zruseno = false;
    (async () => {
      try {
        const page = await doc.getPage(strana);
        if (zruseno) return;

        const pomer = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: zvetseni * pomer });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / pomer}px`;
        canvas.style.height = `${viewport.height / pomer}px`;

        // Rozdělanou kresbu je nutné zrušit, jinak se dvě kreslení do
        // jednoho plátna poperou a knihovna vyhodí chybu.
        kresbaRef.current?.cancel?.();
        const uloha = page.render({ canvasContext: canvas.getContext('2d')!, viewport });
        kresbaRef.current = uloha;
        await uloha.promise;
      } catch (e: any) {
        // Zrušená kresba není chyba — je to jen rychlejší listování.
        if (!zruseno && e?.name !== 'RenderingCancelledException') {
          setChyba(e?.message || 'Stránku se nepodařilo vykreslit.');
        }
      }
    })();

    return () => {
      zruseno = true;
    };
  }, [strana, zvetseni, stran]);

  if (chyba) {
    return (
      <div className="bg-chyba/10 border border-chyba/30 rounded-2xl p-4 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-chyba shrink-0 mt-0.5" />
        <div>
          <p className="text-drobne text-chyba font-semibold">PDF se nepodařilo zobrazit</p>
          <p className="text-drobne text-neutral-400 mt-0.5">{chyba}</p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-drobne text-znacka hover:underline inline-flex items-center gap-1 mt-1.5"
          >
            <ExternalLink className="w-3 h-3" /> Otevřít v novém okně
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5">
        <button
          onClick={() => setStrana((s) => Math.max(1, s - 1))}
          disabled={strana <= 1}
          className="p-1 rounded-lg hover:bg-white/10 text-neutral-300 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-drobne font-mono text-neutral-300 min-w-[64px] text-center">
          {nacitam ? '…' : `${strana} / ${stran}`}
        </span>
        <button
          onClick={() => setStrana((s) => Math.min(stran, s + 1))}
          disabled={strana >= stran}
          className="p-1 rounded-lg hover:bg-white/10 text-neutral-300 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setZvetseni((z) => Math.max(0.5, z - 0.2))}
            className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-stitek font-mono text-neutral-500 w-9 text-center">
            {Math.round(zvetseni * 100)}%
          </span>
          <button
            onClick={() => setZvetseni((z) => Math.min(3, z + 0.2))}
            className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 cursor-pointer"
            title={`Otevřít ${nazev} v novém okně`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="bg-black/40 rounded-2xl border border-white/10 overflow-auto max-h-[560px] flex justify-center p-3">
        {nacitam ? (
          <div className="flex items-center gap-2 text-drobne text-neutral-400 py-16">
            <Loader2 className="w-4 h-4 animate-spin" /> Otevírám PDF…
          </div>
        ) : (
          <canvas ref={canvasRef} className="rounded-lg shadow-lg" />
        )}
      </div>
    </div>
  );
};
