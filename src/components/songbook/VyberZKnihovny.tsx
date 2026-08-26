import React, { useEffect, useState } from 'react';
import { Search, Loader2, Plus, Database } from 'lucide-react';
import { assetLibraryService, LibraryAsset } from '../../services/assetLibraryService';

interface Props {
  /** Kategorie v knihovně; víc se odděluje čárkou. */
  kategorie: string;
  /** Čím se předvyplní hledání — obvykle název písně. */
  vychoziDotaz?: string;
  onVybrat: (a: LibraryAsset) => void;
  /** Co říct, když v knihovně nic není. */
  prazdno?: string;
}

/**
 * Výběr z naší knihovny.
 *
 * Hledá a filtruje databáze, ne prohlížeč. Prohlížeč dostane jen jednu
 * stránku, takže filtrovat až tady by znamenalo, že soubor kus za jejím
 * koncem vypadá, jako by v knihovně nebyl.
 */
export const VyberZKnihovny: React.FC<Props> = ({
  kategorie, vychoziDotaz = '', onVybrat, prazdno,
}) => {
  const [dotaz, setDotaz] = useState(vychoziDotaz);
  const [nalezene, setNalezene] = useState<LibraryAsset[]>([]);
  const [hledam, setHledam] = useState(false);

  useEffect(() => {
    let zivy = true;
    setHledam(true);
    const t = setTimeout(() => {
      void assetLibraryService
        .list({ search: dotaz.trim() || undefined, category: kategorie, limit: 40, sort: 'name' })
        .then((a) => zivy && setNalezene(a))
        .finally(() => zivy && setHledam(false));
    }, 300);
    return () => {
      zivy = false;
      clearTimeout(t);
    };
  }, [dotaz, kategorie]);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={dotaz}
          onChange={(e) => setDotaz(e.target.value)}
          placeholder="Hledat v knihovně…"
          className="w-full bg-black/50 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-[12px] text-white outline-none focus:border-[#FF9F0A]"
        />
      </div>

      <div className="max-h-44 overflow-y-auto space-y-1">
        {hledam && (
          <p className="text-[11px] text-neutral-600 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Hledám…
          </p>
        )}
        {!hledam && nalezene.length === 0 && (
          <p className="text-[11px] text-neutral-600 flex items-center gap-1.5">
            <Database className="w-3 h-3 shrink-0" />
            {prazdno || 'V knihovně nic takového není.'}
          </p>
        )}
        {nalezene.map((a) => (
          <button
            key={a.id}
            onClick={() => onVybrat(a)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] cursor-pointer text-left"
          >
            <span className="text-[11px] text-white truncate flex-1">{a.name}</span>
            <Plus className="w-3.5 h-3.5 text-[#30D158] shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};
