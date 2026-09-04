import React, { useEffect, useState } from 'react';
import { Library, Search, X, ChevronRight, Download } from 'lucide-react';
import { tabLibraryService, TabLibraryEntry } from '../../services/tabLibraryService';

/**
 * Co ve sbírce tabulatur vlastně je.
 *
 * Hledání odpoví jen na to, na co se člověk zeptá. Sbírka má přes
 * sedmdesát tisíc souborů, takže bez procházení není poznat, koho v ní
 * kapela má — a co si tam admin sám nahrál.
 */

const PISMENA = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const PrehledSbirky: React.FC<{
  onOtevrit?: (e: TabLibraryEntry) => void;
  onImportovat?: (e: TabLibraryEntry) => void;
}> = ({ onOtevrit, onImportovat }) => {
  const [pocty, setPocty] = useState<{ total: number; stored: number } | null>(null);
  const [pismeno, setPismeno] = useState('V');
  const [interpreti, setInterpreti] = useState<{ artist: string; count: number }[]>([]);
  const [vybrany, setVybrany] = useState<string | null>(null);
  const [skladby, setSkladby] = useState<TabLibraryEntry[]>([]);
  const [nacitam, setNacitam] = useState(false);
  const [hledani, setHledani] = useState('');
  const [nalezene, setNalezene] = useState<TabLibraryEntry[] | null>(null);
  const [hledam, setHledam] = useState(false);

  useEffect(() => { void tabLibraryService.count().then(setPocty); }, []);

  useEffect(() => {
    let zruseno = false;
    setNacitam(true);
    setVybrany(null);
    setSkladby([]);
    void tabLibraryService.artistsByLetter(pismeno).then((v) => {
      if (!zruseno) { setInterpreti(v); setNacitam(false); }
    });
    return () => { zruseno = true; };
  }, [pismeno]);

  /**
   * Hledá se při psaní, ale ne po každém písmenu.
   *
   * Sbírka má přes sedmdesát tisíc záznamů a dotaz jde do databáze;
   * bez prodlevy by se při psaní „metallica" odeslalo devět dotazů,
   * z nichž osm je k zahození, a výsledky by naskakovaly na přeskáčku
   * podle toho, který se vrátí dřív.
   */
  useEffect(() => {
    const q = hledani.trim();
    if (q.length < 2) {
      setNalezene(null);
      setHledam(false);
      return;
    }
    setHledam(true);
    let platne = true;
    const casovac = setTimeout(() => {
      void tabLibraryService.search(q, 60).then((v) => {
        // Odpověď na dotaz, který už neplatí, se zahodí — jinak by
        // pomalejší starší výsledek přepsal ten správný.
        if (!platne) return;
        setNalezene(v);
        setHledam(false);
      });
    }, 250);
    return () => { platne = false; clearTimeout(casovac); };
  }, [hledani]);

  const otevriInterpreta = async (artist: string) => {
    setVybrany(artist);
    setNacitam(true);
    setSkladby(await tabLibraryService.byArtist(artist));
    setNacitam(false);
  };

  return (
    <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-znacka/10 border border-znacka/30 text-znacka rounded-xl">
          <Library className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Sbírka tabulatur</h3>
          <p className="text-drobne text-neutral-400 tabular-nums">
            {pocty
              ? `${pocty.total.toLocaleString('cs')} záznamů, z toho ${pocty.stored.toLocaleString('cs')} s nahraným souborem`
              : 'Zjišťuji, co ve sbírce je…'}
          </p>
        </div>
      </div>

      {/* Hledá v interpretovi i v názvu skladby zároveň — to, co člověk
          zrovna má v hlavě, bývá jedno nebo druhé. */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={hledani}
          onChange={(e) => setHledani(e.target.value)}
          placeholder="Hledat kapelu, interpreta nebo skladbu…"
          className="w-full bg-black/30 border border-kresba rounded-xl pl-9 pr-9 py-2 text-drobne text-white placeholder:text-neutral-600 focus:outline-none focus:border-znacka/60"
        />
        {hledani && (
          <button
            onClick={() => setHledani('')}
            aria-label="Zrušit hledání"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Písmena se při hledání schovají — míchat dvě cesty k témuž
          seznamu jen mate. */}
      <div className={`flex flex-wrap gap-1 ${nalezene !== null ? 'hidden' : ''}`}>
        {PISMENA.map((p) => (
          <button
            key={p}
            onClick={() => setPismeno(p)}
            className={`w-7 h-7 rounded-lg text-drobne font-bold transition-colors cursor-pointer ${
              pismeno === p ? 'bg-znacka text-black' : 'bg-white/[0.04] text-neutral-400 hover:text-white'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {hledam && <div className="text-xs text-neutral-500 py-3">Hledám…</div>}

      {/* Výsledky hledání. Ukazuje se interpret i název, protože podle
          jednoho z nich se hledalo a podle druhého se to pozná. */}
      {nalezene !== null && !hledam && (
        nalezene.length === 0 ? (
          <div className="text-xs text-neutral-500 py-4">
            Ve sbírce nic takového není. Zkus vedle „Nativní vyhledávač" —
            ten hledá venku na Ultimate Guitar.
          </div>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto divide-y divide-white/[0.04]">
            <p className="text-stitek text-neutral-600 py-1.5 tabular-nums">
              {nalezene.length} {nalezene.length === 1 ? 'nález' : nalezene.length < 5 ? 'nálezy' : 'nálezů'}
              {nalezene.length === 60 ? ' (zobrazeno prvních 60)' : ''}
            </p>
            {nalezene.map((e) => (
              <button
                key={e.id}
                onClick={() => onOtevrit?.(e)}
                className="w-full flex items-center gap-2 py-2 text-left hover:bg-white/[0.04] rounded-lg px-1 cursor-pointer min-h-dotyk lg:min-h-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-drobne text-neutral-200">{e.title}</span>
                  <span className="block truncate text-stitek text-neutral-500">{e.artist}</span>
                </span>
              </button>
            ))}
          </div>
        )
      )}

      {nacitam && nalezene === null && <div className="text-xs text-neutral-500 py-3">Načítám…</div>}

      {nalezene === null && !nacitam && !vybrany && (
        <div className="max-h-[40vh] overflow-y-auto divide-y divide-white/[0.04]">
          {interpreti.length === 0 && (
            <div className="text-xs text-neutral-500 py-4">Na tohle písmeno ve sbírce nikdo není.</div>
          )}
          {interpreti.map((i) => (
            <button
              key={i.artist}
              onClick={() => otevriInterpreta(i.artist)}
              className="w-full flex items-center gap-2 py-2 text-left hover:bg-white/[0.03] px-2 rounded-lg cursor-pointer"
            >
              <span className="flex-1 truncate text-xs text-neutral-200">{i.artist}</span>
              <span className="text-stitek font-mono tabular-nums text-neutral-500">{i.count}</span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />
            </button>
          ))}
        </div>
      )}

      {nalezene === null && !nacitam && vybrany && (
        <div className="space-y-2">
          <button
            onClick={() => { setVybrany(null); setSkladby([]); }}
            className="text-drobne text-znacka hover:underline cursor-pointer"
          >
            ← zpět na interprety
          </button>
          <div className="text-xs font-bold text-white">{vybrany}</div>
          <div className="max-h-[40vh] overflow-y-auto divide-y divide-white/[0.04]">
            {skladby.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-2 group">
                <span className={`flex-1 truncate text-xs ${s.stored ? 'text-neutral-200' : 'text-neutral-500'}`}>
                  {s.title}
                  {/* Rejstřík obsahuje i to, co nahrané není — bez téhle
                      poznámky vypadá takový řádek jako rozbitý odkaz. */}
                  {!s.stored && <span className="ml-2 text-stitek text-neutral-600">jen v rejstříku</span>}
                </span>
                <span className="text-stitek font-mono uppercase text-neutral-600">{s.format}</span>
                {s.stored && onOtevrit && (
                  <button
                    onClick={() => onOtevrit(s)}
                    className="text-stitek px-2 py-1 rounded-lg bg-white/[0.06] text-neutral-300 hover:text-white cursor-pointer"
                  >
                    Zobrazit
                  </button>
                )}
                {s.stored && onImportovat && (
                  <button
                    onClick={() => onImportovat(s)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-uspech cursor-pointer"
                    title="Přidat do zpěvníku"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
