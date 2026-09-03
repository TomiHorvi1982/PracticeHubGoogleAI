import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight, Star, Layers } from 'lucide-react';
import { authorizedFetch } from '../services/assetLibraryService';

/**
 * Presety ze Soundshedu u nás v appce.
 *
 * Streamovat jeho okno sem nejde: rozhraní si načítá vlastním protokolem
 * `juce://` z nitra nativní aplikace, žádný port neposlouchá, a i kdyby
 * se obrázek přenesl, knoflíky by pod sebou neměly zvukové jádro.
 *
 * Presety si ale ukládá jako obyčejný JSON na disk, takže se dají přečíst
 * a ukázat — včetně scén a celého řetězce efektů. Slouží to k přehledu
 * a k hledání: co který preset obsahuje, se tady zjistí rychleji než
 * proklikáváním. Přepnout ho je pak potřeba v Soundshedu.
 */

interface Clanek { kategorie: string; nazev: string; zdroje: string[] }
interface Scena { id: string; nazev: string; retezec: Clanek[] }
interface Preset {
  id: string;
  nazev: string;
  kategorie: string;
  znacky: string[];
  sceny: Scena[];
}

/** Barva podle role článku, ať je řetězec čitelný na první pohled. */
const BARVA: Record<string, string> = {
  amp: 'text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10',
  cab: 'text-[#FF375F] border-[#FF375F]/30 bg-[#FF375F]/10',
  reverb: 'text-[#0A84FF] border-[#0A84FF]/30 bg-[#0A84FF]/10',
  delay: 'text-[#5E5CE6] border-[#5E5CE6]/30 bg-[#5E5CE6]/10',
  dynamics: 'text-[#30D158] border-[#30D158]/30 bg-[#30D158]/10',
  modulation: 'text-[#BF5AF2] border-[#BF5AF2]/30 bg-[#BF5AF2]/10',
};
const barvaClanku = (k: string) => BARVA[k] || 'text-neutral-400 border-white/10 bg-white/5';

export const SoundshedPresety: React.FC = () => {
  const [presety, setPresety] = useState<Preset[]>([]);
  const [aktivni, setAktivni] = useState<string | undefined>();
  const [duvod, setDuvod] = useState<string | null>(null);
  const [hledani, setHledani] = useState('');
  const [rozbaleny, setRozbaleny] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await (await authorizedFetch('/api/soundshed/presety')).json();
        setPresety(d.presety || []);
        setAktivni(d.aktivni);
        setDuvod(d.dostupne ? null : (d.duvod || 'Presety se nepodařilo načíst.'));
      } catch {
        setDuvod('Presety se nepodařilo načíst.');
      }
    })();
  }, []);

  /**
   * Hledá se i podle článků řetězce.
   *
   * Nejčastější otázka není „jak se ten preset jmenuje", ale „ve kterém
   * mám tuhle bednu / tenhle delay" — proto se prohledává i obsah scén.
   */
  const nalezene = useMemo(() => {
    const q = hledani.trim().toLowerCase();
    if (!q) return presety;
    return presety.filter((p) =>
      p.nazev.toLowerCase().includes(q)
      || p.kategorie.toLowerCase().includes(q)
      || p.znacky.some((z) => z.toLowerCase().includes(q))
      || p.sceny.some((s) =>
        s.nazev.toLowerCase().includes(q)
        || s.retezec.some((c) => c.nazev.toLowerCase().includes(q))),
    );
  }, [presety, hledani]);

  const skupiny = useMemo(() => {
    const m = new Map<string, Preset[]>();
    for (const p of nalezene) {
      if (!m.has(p.kategorie)) m.set(p.kategorie, []);
      m.get(p.kategorie)!.push(p);
    }
    return [...m.entries()];
  }, [nalezene]);

  if (duvod) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
        <h3 className="text-xs font-bold text-white mb-1.5">Presety ze Soundshedu</h3>
        <p className="text-[11px] text-neutral-400">{duvod}</p>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#BF5AF2]" />
          Presety ze Soundshedu
        </h3>
        <span className="text-[10px] text-neutral-500 shrink-0">
          {presety.length} presetů
        </span>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={hledani}
          onChange={(e) => setHledani(e.target.value)}
          placeholder="Hledat podle jména, scény nebo efektu…"
          className="w-full bg-black/30 border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-[11px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/25"
        />
      </div>

      {!nalezene.length && (
        <p className="text-[11px] text-neutral-500">Nic takového tu není.</p>
      )}

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {skupiny.map(([kategorie, vSkupine]) => (
          <div key={kategorie} className="space-y-1">
            <p className="text-[9px] uppercase tracking-wider text-neutral-500 sticky top-0 bg-[#0d0d0f] py-1">
              {kategorie} · {vSkupine.length}
            </p>
            {vSkupine.map((p) => {
              const otevreny = rozbaleny === p.id;
              return (
                <div key={p.id} className="rounded-xl border border-white/[0.08] bg-black/20 overflow-hidden">
                  <button
                    onClick={() => setRozbaleny(otevreny ? null : p.id)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <ChevronRight
                      className={`w-3 h-3 text-neutral-500 shrink-0 transition-transform ${otevreny ? 'rotate-90' : ''}`}
                    />
                    <span className="text-[11px] text-neutral-200 truncate flex-1">{p.nazev}</span>
                    {/* Který preset má Soundshed zrovna nahraný. */}
                    {p.id === aktivni && (
                      <Star className="w-3 h-3 text-[#FFD60A] shrink-0" aria-label="Právě vybraný v Soundshedu" />
                    )}
                    <span className="text-[9px] text-neutral-600 shrink-0">
                      {p.sceny.length > 1 ? `${p.sceny.length} scény` : ''}
                    </span>
                  </button>

                  {otevreny && (
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/[0.06]">
                      {p.znacky.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {p.znacky.map((z) => (
                            <span key={z} className="text-[9px] text-neutral-400 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5">
                              {z}
                            </span>
                          ))}
                        </div>
                      )}
                      {p.sceny.map((s) => (
                        <div key={s.id} className="space-y-1">
                          <p className="text-[10px] text-neutral-400">{s.nazev}</p>
                          <div className="flex flex-wrap items-center gap-1">
                            {s.retezec.length === 0 && (
                              <span className="text-[9px] text-neutral-600">prázdný řetězec</span>
                            )}
                            {s.retezec.map((c, i) => (
                              <React.Fragment key={`${s.id}-${i}`}>
                                {i > 0 && <span className="text-neutral-700 text-[9px]">→</span>}
                                <span className={`text-[9px] border rounded-md px-1.5 py-0.5 ${barvaClanku(c.kategorie)}`}>
                                  {c.nazev}
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-neutral-600 leading-relaxed">
        Přehled se čte ze Soundshedu na disku. Přepnout preset jde v samotném
        Soundshedu — jeho rozhraní běží v nativním okně a odsud se ovládat nedá.
      </p>
    </div>
  );
};
