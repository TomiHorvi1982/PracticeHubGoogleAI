import React, { useEffect, useState } from 'react';
import { Search, Loader2, Plus, Database, Eye } from 'lucide-react';
import { assetLibraryService, LibraryAsset, nactiObsahJakoUrl } from '../../services/assetLibraryService';

interface Props {
  /** Kategorie v knihovně; víc se odděluje čárkou. */
  kategorie: string;
  /** Čím se předvyplní hledání — obvykle název písně. */
  vychoziDotaz?: string;
  onVybrat: (a: LibraryAsset) => void;
  /** Co říct, když v knihovně nic není. */
  prazdno?: string;
  /** Nabídnout náhled dřív, než se soubor vloží. */
  sNahledem?: boolean;
  /** Jak náhled vykreslit — dostane adresu obsahu. */
  nahled?: (url: string, a: LibraryAsset) => React.ReactNode;
  /**
   * Kam soubor půjde, řečeno lidsky („na fader Bicí").
   *
   * Píše se přímo k tlačítku. Cíl se u pultu vybírá jinde na obrazovce
   * než se kliká, takže se snadno pošle stopa jinam, než člověk myslel —
   * a pozná to až podle toho, co začne hrát.
   */
  cil?: string;
}

/**
 * Výběr z naší knihovny.
 *
 * Hledá a filtruje databáze, ne prohlížeč. Prohlížeč dostane jen jednu
 * stránku, takže filtrovat až tady by znamenalo, že soubor kus za jejím
 * koncem vypadá, jako by v knihovně nebyl.
 */
export const VyberZKnihovny: React.FC<Props> = ({
  kategorie, vychoziDotaz = '', onVybrat, prazdno, sNahledem, nahled, cil,
}) => {
  const [dotaz, setDotaz] = useState(vychoziDotaz);
  const [nalezene, setNalezene] = useState<LibraryAsset[]>([]);
  /** Kolik jich v knihovně je celkem — v seznamu je vidět jen kus. */
  const [celkem, setCelkem] = useState<number | null>(null);
  const [hledam, setHledam] = useState(false);
  /** Co si člověk zrovna prohlíží, než to vloží. */
  const [nahlizeny, setNahlizeny] = useState<LibraryAsset | null>(null);
  const [urlNahledu, setUrlNahledu] = useState<string | null>(null);
  const [nacitamNahled, setNacitamNahled] = useState(false);

  // Náhled se stahuje přes vlastní server, ne z podepsané adresy — tu by
  // prohlížeč kvůli CORS odmítl načíst.
  useEffect(() => {
    if (!nahlizeny) {
      setUrlNahledu(null);
      return;
    }
    let zivy = true;
    setNacitamNahled(true);
    void nactiObsahJakoUrl(nahlizeny.id)
      .then((u) => zivy && setUrlNahledu(u))
      .catch(() => zivy && setUrlNahledu(null))
      .finally(() => zivy && setNacitamNahled(false));
    return () => {
      zivy = false;
    };
  }, [nahlizeny]);

  useEffect(() => {
    let zivy = true;
    setHledam(true);
    const t = setTimeout(() => {
      void assetLibraryService
        .listPage({ search: dotaz.trim() || undefined, category: kategorie, limit: 40, sort: 'name' })
        .then(({ assets, total }) => {
          if (!zivy) return;
          setNalezene(assets);
          // Kolik jich dotazu odpovídá celkem. Bez toho vypadá seznam
          // čtyřiceti položek jako celá knihovna a soubory za jeho koncem
          // jako by neexistovaly — u sedmi set vzorků bicích to znamená,
          // že člověk devět z deseti nikdy neuvidí.
          setCelkem(total);
        })
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
        {celkem !== null && celkem > nalezene.length && (
          <p className="text-[10px] text-neutral-600 px-1">
            Ukazuje se {nalezene.length} z {celkem} — zbytek najdeš hledáním.
          </p>
        )}
        {nalezene.map((a) => (
          <div
            key={a.id}
            className={`rounded-xl border transition-all ${
              nahlizeny?.id === a.id
                ? 'bg-white/[0.06] border-[#FF9F0A]/50'
                : 'bg-white/[0.03] border-white/[0.06] hover:border-white/25'
            }`}
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              {/* Prohlédnout dřív než vložit: jména souborů jako
                  „-3 Guit L.pdf" o obsahu neřeknou nic a vkládat naslepo
                  znamená pokaždé vložit, otevřít, zjistit, odpojit. */}
              <button
                onClick={() => sNahledem && setNahlizeny(nahlizeny?.id === a.id ? null : a)}
                className={`text-[11px] text-white truncate flex-1 text-left ${
                  sNahledem ? 'cursor-pointer hover:text-[#FF9F0A]' : 'cursor-default'
                }`}
                title={sNahledem ? 'Prohlédnout' : a.name}
              >
                {a.name}
              </button>
              {sNahledem && (
                <button
                  onClick={() => setNahlizeny(nahlizeny?.id === a.id ? null : a)}
                  className="p-1 rounded text-neutral-500 hover:text-white cursor-pointer shrink-0"
                  title="Náhled"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onVybrat(a)}
                className="px-1.5 py-1 rounded flex items-center text-[#30D158] hover:bg-[#30D158]/20 cursor-pointer shrink-0"
                title={cil ? `Vložit ${cil}` : 'Vložit'}
              >
                <Plus className="w-3.5 h-3.5" />
                {cil && <span className="ml-1 text-[10px] font-semibold">{cil}</span>}
              </button>
            </div>

            {nahlizeny?.id === a.id && (
              <div className="px-2 pb-2">
                {nacitamNahled ? (
                  <p className="text-[10px] text-neutral-600 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Načítám náhled…
                  </p>
                ) : urlNahledu ? (
                  nahled ? (
                    nahled(urlNahledu, a)
                  ) : (
                    <img src={urlNahledu} alt="" className="w-full rounded-lg border border-white/10" />
                  )
                ) : (
                  <p className="text-[10px] text-neutral-600">Náhled se nepodařilo načíst.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
