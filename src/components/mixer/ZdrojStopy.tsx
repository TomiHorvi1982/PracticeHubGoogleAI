import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, Library, X, ChevronDown } from 'lucide-react';

/**
 * Pole pod faderem: co na něm visí a odkud to vzít.
 *
 * Dřív se soubory vybíraly nahoře v jednom společném panelu a fader se
 * k nim volil zvlášť. Vedle osmi faderů se tak muselo pamatovat, který
 * je zrovna terč — a při rychlém skládání mixu se lehko sáhlo vedle.
 * Tady je zdroj u toho faderu, ke kterému patří.
 */

export interface MistniPolozka {
  jmeno: string;
  cesta: string;
  velikost: number;
}

interface Props {
  /** Jméno souboru, který na faderu visí. */
  naNem: string | null;
  mistni: MistniPolozka[];
  mistniDostupne: boolean;
  slozka: string;
  onZMistnich: (p: MistniPolozka) => void;
  /**
   * Výběr z databáze přímo tady.
   *
   * Dřív na to byl společný panel nahoře a fader se k němu volil
   * zvlášť. Dostat výběr pod fader znamená, že se nedá splést, komu
   * soubor patří — dostane ho ten, u kterého se vybíralo.
   */
  knihovna: (onHotovo: () => void) => React.ReactNode;
  onOdebrat?: () => void;
}

const mb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} kB`);

export const ZdrojStopy: React.FC<Props> = ({
  naNem, mistni, mistniDostupne, slozka, onZMistnich, knihovna, onOdebrat,
}) => {
  const [otevrene, setOtevrene] = useState(false);
  const [hledani, setHledani] = useState('');
  const [zalozka, setZalozka] = useState<'knihovna' | 'pocitac'>('knihovna');
  const obal = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!otevrene) return;
    const mimo = (e: MouseEvent) => {
      if (!obal.current?.contains(e.target as Node)) setOtevrene(false);
    };
    const klavesa = (e: KeyboardEvent) => { if (e.key === 'Escape') setOtevrene(false); };
    document.addEventListener('mousedown', mimo);
    document.addEventListener('keydown', klavesa);
    return () => {
      document.removeEventListener('mousedown', mimo);
      document.removeEventListener('keydown', klavesa);
    };
  }, [otevrene]);

  const nalezene = hledani.trim()
    ? mistni.filter((m) => m.jmeno.toLowerCase().includes(hledani.trim().toLowerCase()))
    : mistni;

  return (
    <div ref={obal} className="relative mt-1.5">
      {naNem ? (
        <div className="flex items-center gap-1 bg-black/40 border border-kresba rounded-prvek px-1.5 py-1">
          <span className="flex-1 min-w-0 truncate text-stitek text-neutral-300" title={naNem}>
            {naNem}
          </span>
          {onOdebrat && (
            <button
              onClick={onOdebrat}
              title="Sundat z faderu"
              aria-label={`Sundat ${naNem} z faderu`}
              className="p-0.5 rounded text-neutral-600 hover:text-chyba cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOtevrene((o) => !o)}
          aria-expanded={otevrene}
          className="w-full flex items-center justify-center gap-1 bg-black/30 border border-dashed border-kresba rounded-prvek px-1.5 py-1 text-stitek text-neutral-500 hover:text-neutral-200 hover:border-kresba-silna cursor-pointer transition-colors"
        >
          Načíst stopu <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {naNem && (
        <button
          onClick={() => setOtevrene((o) => !o)}
          aria-expanded={otevrene}
          className="mt-1 w-full flex items-center justify-center gap-1 text-stitek text-neutral-600 hover:text-neutral-300 cursor-pointer"
        >
          Vyměnit <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {otevrene && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[320px] max-w-[80vw] rounded-panel border border-kresba-silna bg-plocha-3 p-2 shadow-lg shadow-black/50">
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setZalozka('knihovna')}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-prvek text-stitek font-semibold cursor-pointer transition-colors ${
                zalozka === 'knihovna' ? 'bg-znacka text-podklad' : 'text-neutral-400 hover:bg-plocha-nad'
              }`}
            >
              <Library className="w-3 h-3" /> Z databáze
            </button>
            <button
              onClick={() => setZalozka('pocitac')}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-prvek text-stitek font-semibold cursor-pointer transition-colors ${
                zalozka === 'pocitac' ? 'bg-znacka text-podklad' : 'text-neutral-400 hover:bg-plocha-nad'
              }`}
            >
              <FolderOpen className="w-3 h-3" /> Z počítače
            </button>
          </div>

          {zalozka === 'knihovna' && (
            <div className="max-h-72 overflow-y-auto">
              {knihovna(() => setOtevrene(false))}
            </div>
          )}

          {zalozka === 'pocitac' && (
            !mistniDostupne ? (
              <p className="px-1 py-2 text-stitek text-neutral-500">
                Appka běží na serveru, kde tvůj disk není. Stopy z počítače
                se načtou, když ji spustíš u sebe.
              </p>
            ) : (
              <>
                <p className="px-1 pb-1.5 text-stitek text-neutral-600 truncate" title={slozka}>
                  {slozka}
                </p>
                {mistni.length > 8 && (
                  <input
                    value={hledani}
                    onChange={(e) => setHledani(e.target.value)}
                    placeholder="Hledat ve složce…"
                    className="w-full bg-black/40 border border-kresba rounded-prvek px-2 py-1 mb-1 text-stitek text-white placeholder:text-neutral-600 focus:outline-none focus:border-znacka/60"
                  />
                )}
                <div className="max-h-64 overflow-y-auto">
                  {nalezene.length === 0 && (
                    <p className="px-1 py-1.5 text-stitek text-neutral-600">
                      {mistni.length ? 'Nic takového tu není.' : 'Ve složce nejsou žádné stopy.'}
                    </p>
                  )}
                  {nalezene.slice(0, 80).map((m) => (
                    <button
                      key={m.cesta}
                      onClick={() => { onZMistnich(m); setOtevrene(false); }}
                      className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-prvek text-left hover:bg-plocha-nad cursor-pointer"
                      title={m.cesta}
                    >
                      <span className="flex-1 min-w-0 truncate text-stitek text-neutral-300">{m.jmeno}</span>
                      <span className="text-stitek text-neutral-600 tabular-nums shrink-0">{mb(m.velikost)}</span>
                    </button>
                  ))}
                </div>
              </>
            )
          )}
        </div>
      )}

    </div>
  );
};
