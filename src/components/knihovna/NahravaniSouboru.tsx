import React, { useMemo, useRef, useState } from 'react';
import { FileUp, FolderUp, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { BARVY, Sbirka, zalozSbirku } from '../../services/sbirkyService';
import { KATEGORIE, nazevKategorie } from '../../services/knihovnaStrom';

/**
 * Jediné místo, kudy se soubory dostávají do knihovny.
 *
 * Dřív byly tři: tlačítko nahoře, plocha na přetažení a zvlášť import
 * složky ve Sbírkách. Dělaly skoro totéž, ale ne úplně — u importu
 * složky se dala zadat sbírka a štítky, u zbytku ne, takže na tom, kde
 * zrovna člověk stál, záviselo, co si o souboru appka zapamatuje.
 *
 * Odsud jde všechno stejnou cestou: přetáhnout, vybrat soubory nebo
 * vybrat celou složku, a k tomu volitelně říct, kam to patří a odkud to
 * je.
 */
export const NahravaniSouboru: React.FC<{
  /** Otevřená složka knihovny — předvyplní cíl. */
  otevrenaKategorie: string | null;
  sbirky: Sbirka[];
  bezi: boolean;
  /** Průběh převodu na MP3, když zrovna běží. */
  prevod?: { nazev: string; procent: number } | null;
  onNahraj: (
    soubory: File[],
    volby: { kategorie?: string; sbirka?: string; tagy?: string[] },
  ) => Promise<void> | void;
  /** Cokoli navíc do lišty — přepínač převodu na MP3 a podobně. */
  children?: React.ReactNode;
}> = ({ otevrenaKategorie, sbirky, bezi, prevod, onNahraj, children }) => {
  const vstupSoubory = useRef<HTMLInputElement>(null);
  const vstupSlozka = useRef<HTMLInputElement>(null);

  const [tahne, setTahne] = useState(false);
  const [rozbaleno, setRozbaleno] = useState(false);
  const [kategorie, setKategorie] = useState('');
  const [tagy, setTagy] = useState('');
  const [novaSbirka, setNovaSbirka] = useState('');
  const [barva, setBarva] = useState(BARVY[0]);
  const [sbirka, setSbirka] = useState('');

  const cil = useMemo(
    () =>
      kategorie
        ? nazevKategorie(kategorie)
        : otevrenaKategorie
          ? nazevKategorie(otevrenaKategorie)
          : 'podle přípony',
    [kategorie, otevrenaKategorie],
  );

  const posli = async (seznam: FileList | null) => {
    const soubory = Array.from(seznam || []).filter((f) => !f.name.startsWith('.') && f.size > 0);
    if (!soubory.length) return;

    // Sbírka se zakládá až tady, ne při psaní názvu — jinak by po každém
    // rozmyšlení zůstala v seznamu prázdná sbírka.
    let idSbirky = sbirka || undefined;
    if (!idSbirky && novaSbirka.trim()) {
      try {
        const s = await zalozSbirku(novaSbirka.trim(), barva);
        idSbirky = s.id;
      } catch {
        /* bez sbírky se nahraje taky — jen se nezapamatuje, odkud to je */
      }
    }

    await onNahraj(soubory, {
      kategorie: kategorie || undefined,
      sbirka: idSbirky,
      tagy: tagy.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setNovaSbirka('');
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setTahne(true);
      }}
      onDragLeave={() => setTahne(false)}
      onDrop={(e) => {
        e.preventDefault();
        setTahne(false);
        void posli(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-3 space-y-2.5 transition-all ${
        tahne ? 'border-info bg-info/10' : 'border-white/10 bg-[#16161A]/40'
      }`}
    >
      <input
        ref={vstupSoubory}
        type="file"
        multiple
        onChange={(e) => void posli(e.target.files)}
        className="hidden"
      />
      <input
        ref={vstupSlozka}
        type="file"
        multiple
        // @ts-expect-error — nestandardní, ale umí to všechny prohlížeče, kde appka běží
        webkitdirectory=""
        directory=""
        onChange={(e) => void posli(e.target.files)}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => vstupSoubory.current?.click()}
          disabled={bezi}
          className="px-3 py-2 rounded-xl bg-white text-black text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
        >
          <FileUp className="w-4 h-4" /> Vybrat soubory
        </button>
        <button
          onClick={() => vstupSlozka.current?.click()}
          disabled={bezi}
          className="px-3 py-2 rounded-xl bg-info text-white text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
        >
          <FolderUp className="w-4 h-4" /> Vybrat složku
        </button>

        <span className="text-drobne text-neutral-500">
          nebo sem přetáhni · zařadí se do <strong className="text-neutral-300">{cil}</strong>
        </span>

        {children}

        <button
          onClick={() => setRozbaleno((r) => !r)}
          className="ml-auto text-drobne text-neutral-400 hover:text-white cursor-pointer flex items-center gap-1"
        >
          {rozbaleno ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Kam a odkud
        </button>
      </div>

      {rozbaleno && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-white/[0.06]">
          <label className="space-y-1">
            <span className="text-stitek uppercase tracking-wider text-neutral-500">Zařadit do</span>
            <select
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-drobne text-white outline-none"
            >
              <option value="">
                {otevrenaKategorie ? `Otevřená složka (${nazevKategorie(otevrenaKategorie)})` : 'Podle přípony'}
              </option>
              {KATEGORIE.map((k) => (
                <option key={k.id} value={k.id}>{k.ikona} {k.nazev}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-stitek uppercase tracking-wider text-neutral-500">Sbírka</span>
            <select
              value={sbirka}
              onChange={(e) => setSbirka(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-drobne text-white outline-none"
            >
              <option value="">Žádná, nebo nová níž</option>
              {sbirky.map((s) => (
                <option key={s.id} value={s.id}>{s.nazev} ({s.souboru})</option>
              ))}
            </select>
          </label>

          {!sbirka && (
            <label className="space-y-1">
              <span className="text-stitek uppercase tracking-wider text-neutral-500">
                Nová sbírka — odkud dávka je
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  value={novaSbirka}
                  onChange={(e) => setNovaSbirka(e.target.value)}
                  placeholder="např. Cymatics Ultimate Drums"
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-drobne text-white outline-none"
                />
                {BARVY.slice(0, 6).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBarva(b)}
                    style={{ background: b }}
                    className={`w-4 h-4 rounded-full cursor-pointer shrink-0 ${
                      barva === b ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </label>
          )}

          <label className="space-y-1">
            <span className="text-stitek uppercase tracking-wider text-neutral-500 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Štítky, oddělené čárkou
            </span>
            <input
              value={tagy}
              onChange={(e) => setTagy(e.target.value)}
              placeholder="temné, metal"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-drobne text-white outline-none"
            />
          </label>
        </div>
      )}

      {prevod && (
        <p className="text-drobne text-info">
          Zmenšuju „{prevod.nazev}" — {prevod.procent} %
        </p>
      )}
    </div>
  );
};
