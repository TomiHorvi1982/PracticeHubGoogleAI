import React, { useState } from 'react';
import { CheckSquare, Square, Trash2, FolderInput, Tag, Loader2 } from 'lucide-react';
import { assetLibraryService } from '../../services/assetLibraryService';
import { hromadneUprav } from '../../services/sbirkyService';
import { KATEGORIE } from '../../services/knihovnaStrom';

/**
 * Hromadné akce nad označenými soubory.
 *
 * Jeden díl pro všechny pohledy na knihovnu — Soubory, Samples i Sbírky.
 * Ve sbírkách to bylo první a hned se ukázalo, že po jednom se knihovna
 * o osmnácti tisících položkách netřídí vůbec; jinde ale ta možnost
 * nebyla a člověk musel přepnout jinam, aby se k ní dostal.
 *
 * Trojí různě vypadající lišta na totéž by navíc znamenala učit se na
 * každé obrazovce znovu, kde je co.
 */
export const HromadneAkce: React.FC<{
  /** Co je označené. */
  oznacene: Set<string>;
  onZmenaVyberu: (f: (p: Set<string>) => Set<string>) => void;
  /** Identifikátory všeho, co je právě vidět — pro „označit vše". */
  viditelne: string[];
  jsemSpravce: boolean;
  /** Zavolá se po úspěšné změně, ať si pohled načte svoje znovu. */
  onHotovo: (smazane: string[]) => void;
}> = ({ oznacene, onZmenaVyberu, viditelne, jsemSpravce, onHotovo }) => {
  const [kam, setKam] = useState('');
  const [novyTag, setNovyTag] = useState('');
  const [pracuju, setPracuju] = useState(false);
  const [hlaska, setHlaska] = useState<{ text: string; chyba?: boolean } | null>(null);

  if (!jsemSpravce || viditelne.length === 0) return null;

  const ids = [...oznacene];
  const vseOznaceno = viditelne.every((id) => oznacene.has(id));

  const presun = async () => {
    if (!ids.length || !kam) return;
    setPracuju(true);
    setHlaska(null);
    try {
      const n = await hromadneUprav({ ids, category: kam });
      setHlaska({ text: `Přesunuto ${n} souborů.` });
      onZmenaVyberu(() => new Set());
      onHotovo([]);
    } catch (e: any) {
      setHlaska({ text: e?.message || 'Přesun se nepovedl.', chyba: true });
    } finally {
      setPracuju(false);
    }
  };

  const oznackuj = async () => {
    if (!ids.length || !novyTag.trim()) return;
    setPracuju(true);
    setHlaska(null);
    try {
      const n = await hromadneUprav({ ids, pridatTagy: [novyTag.trim()] });
      setHlaska({ text: `Oštítkováno ${n} souborů.` });
      setNovyTag('');
      onHotovo([]);
    } catch (e: any) {
      setHlaska({ text: e?.message || 'Štítek se nepodařilo přidat.', chyba: true });
    } finally {
      setPracuju(false);
    }
  };

  /**
   * Maže soubor po souboru.
   *
   * Server maže po jednom a stovka souběžných požadavků ho jen zdrží.
   * Co selže, zůstane označené — ať je vidět, s čím se má co dělat.
   */
  const smaz = async () => {
    if (!ids.length) return;
    if (!window.confirm(`Smazat ${ids.length} označených souborů? Tohle už nevrátíš.`)) return;

    setPracuju(true);
    setHlaska(null);
    const smazane: string[] = [];
    const selhalo: string[] = [];
    for (const id of ids) {
      try {
        await assetLibraryService.remove(id);
        smazane.push(id);
      } catch {
        selhalo.push(id);
      }
    }
    onZmenaVyberu(() => new Set(selhalo));
    onHotovo(smazane);
    setHlaska(
      selhalo.length
        ? { text: `Smazáno ${smazane.length}, ${selhalo.length} se nepodařilo — zůstávají označené.`, chyba: true }
        : { text: `Smazáno ${smazane.length} souborů.` }
    );
    setPracuju(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onZmenaVyberu((p) => (viditelne.every((id) => p.has(id)) ? new Set() : new Set(viditelne)))}
          className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-neutral-300 hover:text-white text-drobne font-bold cursor-pointer flex items-center gap-1.5"
          title="Označit nebo odznačit všechno, co je vidět"
        >
          {vseOznaceno ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          Označit vše ({viditelne.length})
        </button>

        {ids.length > 0 && (
          <>
            <span className="text-drobne text-uspech font-bold">{ids.length} označeno</span>

            <select
              value={kam}
              onChange={(e) => setKam(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-drobne text-white outline-none cursor-pointer"
            >
              <option value="">Přesunout do…</option>
              {KATEGORIE.map((k) => (
                <option key={k.id} value={k.id}>{k.ikona} {k.nazev}</option>
              ))}
            </select>
            <button
              onClick={() => void presun()}
              disabled={!kam || pracuju}
              className="px-2.5 py-1.5 rounded-lg bg-info text-white text-drobne font-bold cursor-pointer disabled:opacity-30 flex items-center gap-1.5"
            >
              <FolderInput className="w-3.5 h-3.5" /> Přesunout
            </button>

            <input
              value={novyTag}
              onChange={(e) => setNovyTag(e.target.value)}
              placeholder="štítek"
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-drobne text-white outline-none w-24"
            />
            <button
              onClick={() => void oznackuj()}
              disabled={!novyTag.trim() || pracuju}
              className="px-2.5 py-1.5 rounded-lg bg-nastroj text-white text-drobne font-bold cursor-pointer disabled:opacity-30 flex items-center gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" /> Štítek
            </button>

            <button
              onClick={() => void smaz()}
              disabled={pracuju}
              className="px-2.5 py-1.5 rounded-lg bg-chyba text-white text-drobne font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              {pracuju ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Smazat ({ids.length})
            </button>

            <button
              onClick={() => onZmenaVyberu(() => new Set())}
              className="px-2.5 py-1.5 rounded-lg text-neutral-500 hover:text-white text-drobne cursor-pointer"
            >
              Zrušit výběr
            </button>
          </>
        )}
      </div>

      {hlaska && (
        <p className={`text-drobne ${hlaska.chyba ? 'text-chyba' : 'text-uspech'}`}>{hlaska.text}</p>
      )}
    </div>
  );
};
