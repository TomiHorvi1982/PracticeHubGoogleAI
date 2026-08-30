import React, { useMemo, useRef, useState } from 'react';
import { FolderUp, Loader2, Check, AlertCircle, X, Tag } from 'lucide-react';
import { assetLibraryService } from '../../services/assetLibraryService';
import { BARVY, Sbirka, zalozSbirku, odhadniKategorii } from '../../services/sbirkyService';
import { KATEGORIE } from '../../services/knihovnaStrom';

/**
 * Nahrání celé složky z disku.
 *
 * Po jednom souboru se tisícovka vzorků nenahraje; prohlížeč umí vybrat
 * složku i s podsložkami a odsud se pošlou všechny naráz.
 *
 * Nahrává se s pamětí, odkud to je: sbírka drží celou dávku pohromadě i
 * potom, co se soubory roztřídí do různých kategorií, a podsložka
 * zachová strom, který měly na disku. Bez toho po roztřídění nikdo
 * nezjistí, co spolu bylo staženo a co k sobě ladí.
 */

/** Cesta ke složce, ve které soubor na disku ležel. */
function slozkaSouboru(f: File): string {
  const cesta = (f as any).webkitRelativePath as string | undefined;
  if (!cesta) return '';
  const casti = cesta.split('/');
  casti.pop();
  // První část je vybraná složka sama — ta je názvem sbírky, ne podsložkou.
  casti.shift();
  return casti.join('/');
}

interface Stav {
  hotovo: number;
  celkem: number;
  preskoceno: number;
  chyb: number;
  posledni: string;
}

export const ImportSlozky: React.FC<{
  sbirky: Sbirka[];
  onHotovo: () => void;
}> = ({ sbirky, onHotovo }) => {
  const vstup = useRef<HTMLInputElement>(null);
  const [soubory, setSoubory] = useState<File[]>([]);
  const [korenova, setKorenova] = useState('');
  const [nazev, setNazev] = useState('');
  const [barva, setBarva] = useState(BARVY[0]);
  const [tagy, setTagy] = useState('');
  /** Prázdné = odhadnout podle přípony. */
  const [kategorie, setKategorie] = useState('');
  const [bezi, setBezi] = useState(false);
  const [stav, setStav] = useState<Stav | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const zrusit = useRef(false);

  /** Přehled toho, co se chystá — kolik čeho a z kterých podsložek. */
  const prehled = useMemo(() => {
    const pripony: Record<string, number> = {};
    const slozky = new Set<string>();
    let bajtu = 0;
    for (const f of soubory) {
      const p = (f.name.split('.').pop() || '?').toLowerCase();
      pripony[p] = (pripony[p] || 0) + 1;
      slozky.add(slozkaSouboru(f) || '(kořen)');
      bajtu += f.size;
    }
    return {
      pripony: Object.entries(pripony).sort((a, b) => b[1] - a[1]),
      slozek: slozky.size,
      bajtu,
    };
  }, [soubory]);

  const vyber = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vsechny = Array.from(e.target.files || []);
    // Skryté soubory systému — .DS_Store a spol. do knihovny nepatří.
    const cisté = vsechny.filter((f) => !f.name.startsWith('.') && f.size > 0);
    setSoubory(cisté);
    setStav(null);
    setChyba(null);

    const prvni = (cisté[0] as any)?.webkitRelativePath as string | undefined;
    const koren = prvni ? prvni.split('/')[0] : '';
    setKorenova(koren);
    if (!nazev) setNazev(koren);
  };

  const nahraj = async () => {
    if (!soubory.length) return;
    setBezi(true);
    setChyba(null);
    zrusit.current = false;

    const s: Stav = { hotovo: 0, celkem: soubory.length, preskoceno: 0, chyb: 0, posledni: '' };
    setStav({ ...s });

    try {
      const sbirka = await zalozSbirku(nazev.trim() || korenova || 'Bez názvu', barva, korenova);
      const stitky = tagy.split(',').map((t) => t.trim()).filter(Boolean);

      for (const f of soubory) {
        if (zrusit.current) break;
        const odhad = odhadniKategorii(f.name);
        const kat = kategorie || odhad.kategorie;
        const typ = (kategorie ? odhadniKategorii(f.name).typ : odhad.typ) as any;

        try {
          await assetLibraryService.upload(f, kat, typ, 'global', null, {
            sbirka: sbirka.id,
            zdrojovaSlozka: slozkaSouboru(f),
            tagy: stitky,
          });
          s.hotovo++;
        } catch (e: any) {
          // Duplicita není chyba nahrávání — soubor v knihovně prostě už je.
          if (/už v knihovně je/.test(e?.message || '')) s.preskoceno++;
          else s.chyb++;
        }
        s.posledni = f.name;
        setStav({ ...s });
      }
      onHotovo();
    } catch (e: any) {
      setChyba(e?.message || 'Nahrávání selhalo.');
    } finally {
      setBezi(false);
    }
  };

  const velikost = (b: number) =>
    b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${(b / 1048576).toFixed(1)} MB`;

  return (
    <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FolderUp className="w-5 h-5 text-[#0A84FF]" />
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-bold text-white">Nahrát celou složku</h3>
          <p className="text-[11px] text-neutral-400">
            I s podsložkami. Zapamatuje si, odkud co je, takže po roztřídění poznáš, co spolu ladí.
          </p>
        </div>
        <input
          ref={vstup}
          type="file"
          multiple
          // @ts-expect-error — nestandardní, ale umí to všechny prohlížeče, kde appka běží
          webkitdirectory=""
          directory=""
          onChange={vyber}
          className="hidden"
        />
        <button
          onClick={() => vstup.current?.click()}
          disabled={bezi}
          className="px-3 py-1.5 rounded-xl bg-[#0A84FF] text-white text-xs font-bold cursor-pointer disabled:opacity-40"
        >
          Vybrat složku
        </button>
      </div>

      {soubory.length > 0 && (
        <>
          <div className="bg-black/25 rounded-xl p-3 space-y-2">
            <p className="text-[12px] text-white">
              <strong>{korenova || 'složka'}</strong> — {soubory.length} souborů,{' '}
              {velikost(prehled.bajtu)}, {prehled.slozek} podsložek
            </p>
            <div className="flex flex-wrap gap-1">
              {prehled.pripony.slice(0, 10).map(([p, n]) => (
                <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400">
                  .{p} × {n}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Název sbírky</span>
              <input
                value={nazev}
                onChange={(e) => setNazev(e.target.value)}
                placeholder={korenova}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-[#0A84FF]"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Kategorie
              </span>
              <select
                value={kategorie}
                onChange={(e) => setKategorie(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-[#0A84FF]"
              >
                <option value="">Odhadnout podle přípony</option>
                {KATEGORIE.map((k) => (
                  <option key={k.id} value={k.id}>{k.ikona} {k.nazev}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Štítky pro celou dávku, oddělené čárkou
            </span>
            <input
              value={tagy}
              onChange={(e) => setTagy(e.target.value)}
              placeholder="temné, metal, akustické"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-[#0A84FF]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Barva</span>
            {BARVY.map((b) => (
              <button
                key={b}
                onClick={() => setBarva(b)}
                style={{ background: b }}
                className={`w-5 h-5 rounded-full cursor-pointer ${
                  barva === b ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'
                }`}
                title={b}
              />
            ))}

            <button
              onClick={() => void nahraj()}
              disabled={bezi}
              className="ml-auto px-4 py-2 rounded-xl bg-[#30D158] text-black text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              {bezi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderUp className="w-3.5 h-3.5" />}
              {bezi ? 'Nahrávám…' : `Nahrát ${soubory.length} souborů`}
            </button>
            {bezi && (
              <button
                onClick={() => { zrusit.current = true; }}
                className="px-3 py-2 rounded-xl bg-white/[0.06] text-neutral-300 text-xs font-bold cursor-pointer"
              >
                Zastavit
              </button>
            )}
            {!bezi && (
              <button
                onClick={() => { setSoubory([]); setStav(null); }}
                className="p-2 rounded-xl text-neutral-600 hover:text-white cursor-pointer"
                title="Zahodit výběr"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </>
      )}

      {stav && (
        <div className="space-y-1.5">
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#30D158] transition-[width] duration-200"
              style={{ width: `${((stav.hotovo + stav.preskoceno + stav.chyb) / stav.celkem) * 100}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-400 flex flex-wrap items-center gap-2">
            <Check className="w-3.5 h-3.5 text-[#30D158]" />
            {stav.hotovo} nahráno
            {stav.preskoceno > 0 && (
              <span className="text-neutral-500">· {stav.preskoceno} už v knihovně bylo</span>
            )}
            {stav.chyb > 0 && <span className="text-[#FF453A]">· {stav.chyb} selhalo</span>}
            <span className="text-neutral-600 truncate">{stav.posledni}</span>
          </p>
        </div>
      )}

      {chyba && (
        <p className="text-[11px] text-[#FF453A] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
        </p>
      )}

      {sbirky.length > 0 && !soubory.length && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500 self-center">
            Sbírky v knihovně
          </span>
          {sbirky.slice(0, 12).map((s) => (
            <span
              key={s.id}
              className="text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-1"
              style={{ background: `${s.barva}22`, color: s.barva }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: s.barva }} />
              {s.nazev} · {s.souboru}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
