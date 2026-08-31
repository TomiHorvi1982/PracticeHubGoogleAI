import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Tag, Palette, Trash2, Check, FolderTree, AlertCircle } from 'lucide-react';
import { assetLibraryService, LibraryAsset } from '../../services/assetLibraryService';
import { KATEGORIE } from '../../services/knihovnaStrom';
import {
  BARVY, Sbirka, nactiSbirky, nactiTagy, upravSbirku, smazSbirku, hromadneUprav,
} from '../../services/sbirkyService';


/**
 * Sbírky: co odkud je.
 *
 * Strom kategorií říká, co soubor je. Tady se drží to druhé — z které
 * banky nebo složky přišel. Po roztřídění je to jediné, co spolu drží
 * věci, které byly stažené společně a ladí spolu, i když skončily každá
 * v jiné kategorii.
 *
 * Třídí se po dávkách. Kdo přehazuje pět set vzorků po jednom, to
 * nedodělá.
 */
export const SbirkyPanel: React.FC = () => {
  const [sbirky, setSbirky] = useState<Sbirka[]>([]);
  const [tagy, setTagy] = useState<{ tag: string; pocet: number }[]>([]);
  const [vybranaSbirka, setVybranaSbirka] = useState<string | null>(null);
  const [vybranyTag, setVybranyTag] = useState<string | null>(null);
  const [soubory, setSoubory] = useState<LibraryAsset[]>([]);
  const [celkem, setCelkem] = useState(0);
  const [nacitam, setNacitam] = useState(false);
  const [oznacene, setOznacene] = useState<Set<string>>(new Set());
  const [chyba, setChyba] = useState<string | null>(null);
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [novyTag, setNovyTag] = useState('');
  const [cilovaKategorie, setCilovaKategorie] = useState('');
  const [pracuju, setPracuju] = useState(false);

  const obnovSeznamy = useCallback(async () => {
    const [s, t] = await Promise.all([nactiSbirky(), nactiTagy()]);
    setSbirky(s);
    setTagy(t);
  }, []);

  useEffect(() => { void obnovSeznamy(); }, [obnovSeznamy]);

  const nactiSoubory = useCallback(async () => {
    if (!vybranaSbirka && !vybranyTag) {
      setSoubory([]);
      setCelkem(0);
      return;
    }
    setNacitam(true);
    try {
      const { assets, total } = await assetLibraryService.listPage({
        sbirka: vybranaSbirka || undefined,
        tag: vybranyTag || undefined,
        limit: 200,
        sort: 'name',
      });
      setSoubory(assets);
      setCelkem(total);
    } finally {
      setNacitam(false);
    }
  }, [vybranaSbirka, vybranyTag]);

  useEffect(() => { void nactiSoubory(); }, [nactiSoubory]);
  // Změna výběru zahodí označení — jinak by hromadná úprava sáhla na
  // soubory, které už nejsou vidět.
  useEffect(() => { setOznacene(new Set()); }, [vybranaSbirka, vybranyTag]);

  /** Podsložky, ve kterých soubory na disku ležely. */
  const podleSlozek = useMemo(() => {
    const m = new Map<string, LibraryAsset[]>();
    for (const a of soubory) {
      const k = String((a.metadata as any)?.zdrojovaSlozka || '') || '(kořen)';
      m.set(k, [...(m.get(k) || []), a]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'cs'));
  }, [soubory]);

  const prepni = (id: string) => {
    setOznacene((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const oznacSkupinu = (polozky: LibraryAsset[]) => {
    const vsechny = polozky.every((a) => oznacene.has(a.id));
    setOznacene((p) => {
      const n = new Set(p);
      for (const a of polozky) {
        if (vsechny) n.delete(a.id);
        else n.add(a.id);
      }
      return n;
    });
  };

  const proved = async (zmena: Parameters<typeof hromadneUprav>[0], popis: string) => {
    setPracuju(true);
    setChyba(null);
    setHlaska(null);
    try {
      const n = await hromadneUprav(zmena);
      setHlaska(`${popis} — ${n} souborů.`);
      await Promise.all([nactiSoubory(), obnovSeznamy()]);
      setOznacene(new Set());
    } catch (e: any) {
      setChyba(e?.message || 'Úprava se nepovedla.');
    } finally {
      setPracuju(false);
    }
  };

  const ids = [...oznacene];

  return (
    <div className="space-y-4">
      {/* Nahrávat se chodí do Souborů — jedno místo, ne dvě. Sbírky
          zůstávají na to, co se s dávkou dělá potom. */}
      <p className="text-[11px] text-neutral-500 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2">
        Nahrát složku nebo jednotlivé soubory a rovnou je zařadit do sbírky se dá v záložce{' '}
        <strong className="text-neutral-300">Soubory</strong> — pod polem hledání, v části „Kam a odkud".
        Tady se pak dávka třídí, štítkuje a přebarvuje.
      </p>

      {/* Sbírky */}
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Palette className="w-4 h-4 text-[#BF5AF2]" /> Sbírky
          <span className="text-[11px] text-neutral-500">({sbirky.length})</span>
        </h3>

        {sbirky.length === 0 ? (
          <p className="text-[11px] text-neutral-600">
            Zatím žádná. Nahraj složku výš a sbírka vznikne sama.
          </p>
        ) : (
          <div className="space-y-1">
            {sbirky.map((s) => (
              <div
                key={s.id}
                className={`flex flex-wrap items-center gap-2 px-2.5 py-1.5 rounded-xl border cursor-pointer ${
                  vybranaSbirka === s.id
                    ? 'bg-white/[0.06] border-white/25'
                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20'
                }`}
                onClick={() => { setVybranaSbirka(vybranaSbirka === s.id ? null : s.id); setVybranyTag(null); }}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.barva }} />
                <input
                  value={s.nazev}
                  onChange={(e) => {
                    const nazev = e.target.value;
                    setSbirky((p) => p.map((x) => (x.id === s.id ? { ...x, nazev } : x)));
                  }}
                  onBlur={(e) => void upravSbirku(s.id, { nazev: e.target.value }).catch(() => {})}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent text-[12px] text-white outline-none flex-1 min-w-[120px] focus:bg-black/40 rounded px-1"
                />
                <span className="text-[10px] text-neutral-500 tabular-nums">{s.souboru} souborů</span>

                <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                  {BARVY.slice(0, 6).map((b) => (
                    <button
                      key={b}
                      onClick={() => {
                        setSbirky((p) => p.map((x) => (x.id === s.id ? { ...x, barva: b } : x)));
                        void upravSbirku(s.id, { barva: b }).catch(() => {});
                      }}
                      style={{ background: b }}
                      className="w-3 h-3 rounded-full opacity-50 hover:opacity-100 cursor-pointer"
                    />
                  ))}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Sbírka zmizí, soubory zůstanou — jen ztratí zařazení.
                    if (!confirm(`Zrušit sbírku „${s.nazev}"? Soubory v knihovně zůstanou.`)) return;
                    void smazSbirku(s.id).then(obnovSeznamy).catch(() => {});
                  }}
                  className="p-1 rounded text-neutral-600 hover:text-[#FF453A] cursor-pointer"
                  title="Zrušit sbírku (soubory zůstanou)"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tagy.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.06]">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Štítky
            </span>
            {tagy.map((t) => (
              <button
                key={t.tag}
                onClick={() => { setVybranyTag(vybranyTag === t.tag ? null : t.tag); setVybranaSbirka(null); }}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold cursor-pointer ${
                  vybranyTag === t.tag ? 'bg-[#BF5AF2] text-white' : 'bg-white/[0.06] text-neutral-400 hover:text-white'
                }`}
              >
                {t.tag} · {t.pocet}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Třídění */}
      {(vybranaSbirka || vybranyTag) && (
        <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FolderTree className="w-4 h-4 text-[#FF9F0A]" />
            <h3 className="text-sm font-bold text-white flex-1">
              {nacitam ? 'Načítám…' : `${soubory.length} z ${celkem} souborů`}
              {oznacene.size > 0 && (
                <span className="text-[#30D158] ml-2">· {oznacene.size} označeno</span>
              )}
            </h3>
            {celkem > soubory.length && (
              <span className="text-[10px] text-neutral-600">
                Ukazuje se prvních {soubory.length} — třiď po dávkách.
              </span>
            )}
          </div>

          {/* Hromadné akce */}
          <div className="flex flex-wrap items-center gap-2 bg-black/25 rounded-xl p-2.5">
            <select
              value={cilovaKategorie}
              onChange={(e) => setCilovaKategorie(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none"
            >
              <option value="">Přesunout do kategorie…</option>
              {KATEGORIE.map((k) => (
                <option key={k.id} value={k.id}>{k.ikona} {k.nazev}</option>
              ))}
            </select>
            <button
              onClick={() => void proved({ ids, category: cilovaKategorie }, 'Přesunuto')}
              disabled={!ids.length || !cilovaKategorie || pracuju}
              className="px-2.5 py-1.5 rounded-lg bg-[#0A84FF] text-white text-[11px] font-bold cursor-pointer disabled:opacity-30"
            >
              Přesunout
            </button>

            <input
              value={novyTag}
              onChange={(e) => setNovyTag(e.target.value)}
              placeholder="štítek"
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none w-28"
            />
            <button
              onClick={() => void proved({ ids, pridatTagy: [novyTag.trim()] }, 'Oštítkováno')}
              disabled={!ids.length || !novyTag.trim() || pracuju}
              className="px-2.5 py-1.5 rounded-lg bg-[#BF5AF2] text-white text-[11px] font-bold cursor-pointer disabled:opacity-30"
            >
              Přidat štítek
            </button>
            {vybranyTag && (
              <button
                onClick={() => void proved({ ids, odebratTagy: [vybranyTag] }, 'Štítek odebrán')}
                disabled={!ids.length || pracuju}
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-neutral-300 text-[11px] font-bold cursor-pointer disabled:opacity-30"
              >
                Odebrat „{vybranyTag}"
              </button>
            )}

            <button
              onClick={() => setOznacene(new Set(soubory.map((a) => a.id)))}
              className="ml-auto px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-neutral-300 text-[11px] font-bold cursor-pointer"
            >
              Označit vše
            </button>
            {oznacene.size > 0 && (
              <button
                onClick={() => setOznacene(new Set())}
                className="px-2.5 py-1.5 rounded-lg text-neutral-500 hover:text-white text-[11px] cursor-pointer"
              >
                Zrušit označení
              </button>
            )}
          </div>

          {hlaska && (
            <p className="text-[11px] text-[#30D158] flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> {hlaska}
            </p>
          )}
          {chyba && (
            <p className="text-[11px] text-[#FF453A] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {chyba}
            </p>
          )}

          {/* Soubory po podsložkách, jak ležely na disku. */}
          <div className="max-h-[46vh] overflow-y-auto space-y-2 pr-1">
            {nacitam && <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />}
            {podleSlozek.map(([slozka, polozky]) => (
              <div key={slozka}>
                <button
                  onClick={() => oznacSkupinu(polozky)}
                  className="text-[11px] font-bold text-neutral-300 hover:text-white cursor-pointer flex items-center gap-1.5 mb-1"
                  title="Označit nebo odznačit celou podsložku"
                >
                  <FolderTree className="w-3 h-3 text-[#FF9F0A]" />
                  {slozka}
                  <span className="text-neutral-600 font-normal">({polozky.length})</span>
                </button>
                <div className="space-y-0.5 pl-4">
                  {polozky.map((a) => {
                    const tagyAssetu: string[] = Array.isArray((a.metadata as any)?.tagy)
                      ? (a.metadata as any).tagy
                      : [];
                    return (
                      <label
                        key={a.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer ${
                          oznacene.has(a.id) ? 'bg-[#30D158]/10' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={oznacene.has(a.id)}
                          onChange={() => prepni(a.id)}
                          className="accent-[#30D158] cursor-pointer"
                        />
                        <span className="text-[11px] text-neutral-200 truncate flex-1">{a.name}</span>
                        {tagyAssetu.map((t) => (
                          <span key={t} className="text-[9px] px-1 rounded bg-[#BF5AF2]/20 text-[#BF5AF2] shrink-0">
                            {t}
                          </span>
                        ))}
                        <span className="text-[9px] text-neutral-600 shrink-0">{a.category}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
