import React, { useEffect, useState } from 'react';
import { Mic, Plus, Trash2, Check, X, Loader2, ShieldAlert, CircleDot, Circle } from 'lucide-react';
import { AKCE, Akce, HlasovyPrikaz, Krok, SEKCE } from '../../services/hlas/katalog';
import { prikazyService } from '../../services/hlas/prikazyService';
import { dostupneAkce } from '../../services/hlas/vykonavac';
import { Moznosti, poslouchej, zjistiMoznosti } from '../../services/hlas/poslech';

/**
 * Správa hlasového ovládání.
 *
 * Dvě části, obě si o to řekly samy: katalog, ze kterého je vidět, co
 * appka umí a co zatím ne, a editor vlastních příkazů. Frázi jde napsat
 * i nadiktovat — nadiktovaná projde stejným přepisem jako ostrý příkaz,
 * takže se uloží přesně to, co appka doopravdy uslyší, ne to, co si
 * člověk myslí, že říká.
 */

const prazdny = (): { nazev: string; fraze: string[]; kroky: Krok[]; spolecny: boolean } => ({
  nazev: '',
  fraze: [''],
  kroky: [{ akce: AKCE[0].id, hodnoty: {} }],
  spolecny: false,
});

export const HlasovyPanel: React.FC<{ jsemSpravce?: boolean }> = ({ jsemSpravce }) => {
  const [moznosti, setMoznosti] = useState<Moznosti | null>(null);
  const [prikazy, setPrikazy] = useState<HlasovyPrikaz[]>([]);
  const [zapojene, setZapojene] = useState<string[]>([]);
  const [navrh, setNavrh] = useState<ReturnType<typeof prazdny> | null>(null);
  const [nahravaFrazi, setNahravaFrazi] = useState<number | null>(null);
  const [hlaseni, setHlaseni] = useState<{ text: string; dobre: boolean } | null>(null);

  const nacti = async () => setPrikazy(await prikazyService.nacti());

  useEffect(() => {
    void zjistiMoznosti().then(setMoznosti);
    void nacti();
    setZapojene(dostupneAkce());
  }, []);

  const nadiktujFrazi = async (index: number) => {
    if (!moznosti || moznosti.cesta === 'zadna' || !navrh) return;
    setNahravaFrazi(index);
    try {
      const text = (await poslouchej(moznosti.cesta).vysledek).trim();
      if (!text) {
        setHlaseni({ text: 'Nic jsem neslyšel — zkus to znovu.', dobre: false });
        return;
      }
      const fraze = [...navrh.fraze];
      fraze[index] = text;
      setNavrh({ ...navrh, fraze });
    } catch (e: any) {
      setHlaseni({ text: e?.message || 'Nahrávání selhalo.', dobre: false });
    } finally {
      setNahravaFrazi(null);
    }
  };

  const uloz = async () => {
    if (!navrh) return;
    try {
      await prikazyService.uloz(navrh);
      setNavrh(null);
      await nacti();
      setHlaseni({ text: 'Příkaz uložený a hned funguje.', dobre: true });
    } catch (e: any) {
      setHlaseni({ text: e?.message || 'Uložit se to nepodařilo.', dobre: false });
    }
  };

  const smaz = async (p: HlasovyPrikaz) => {
    try {
      await prikazyService.smaz(p.id);
      await nacti();
    } catch (e: any) {
      setHlaseni({ text: e?.message || 'Smazat se to nepodařilo.', dobre: false });
    }
  };

  const upravKrok = (i: number, zmena: Partial<Krok>) => {
    if (!navrh) return;
    const kroky = navrh.kroky.map((k, idx) => (idx === i ? { ...k, ...zmena } : k));
    setNavrh({ ...navrh, kroky });
  };

  const skupiny = [...new Set(AKCE.map((a) => a.skupina))];

  return (
    <div className="space-y-4 text-white">
      {/* Kterou cestou se poslouchá */}
      {moznosti && (
        <div
          className={`rounded-2xl border p-3 text-xs flex items-start gap-2 ${
            moznosti.odesilaVen
              ? 'bg-amber-500/[0.08] border-amber-500/30 text-amber-200'
              : 'bg-[#30D158]/[0.06] border-[#30D158]/30 text-[#30D158]'
          }`}
        >
          {moznosti.odesilaVen ? <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" /> : <Check className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{moznosti.duvod}</span>
        </div>
      )}

      {hlaseni && (
        <div className={`rounded-2xl border p-3 text-xs ${
          hlaseni.dobre ? 'bg-[#30D158]/10 border-[#30D158]/30 text-[#30D158]' : 'bg-[#FF453A]/10 border-[#FF453A]/30 text-[#FF453A]'
        }`}>
          {hlaseni.text}
        </div>
      )}

      {/* Katalog — co appka umí a co zatím ne */}
      <div className="bg-[#16161A]/60 border border-white/[0.08] rounded-3xl p-4">
        <h3 className="text-sm font-bold text-[#FF9F0A] mb-1">Co hlasem jde</h3>
        <p className="text-[11px] text-neutral-400 mb-3">
          Nezapojené akce zná katalog, ale zatím je nikdo neobsluhuje — hlasem nic neudělají.
        </p>
        <div className="space-y-3">
          {skupiny.map((s) => (
            <div key={s}>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5">{s}</div>
              <div className="space-y-1">
                {AKCE.filter((a) => a.skupina === s).map((a: Akce) => {
                  const zapojena = zapojene.includes(a.id);
                  return (
                    <div key={a.id} className="flex items-start gap-2 text-xs">
                      {zapojena
                        ? <CircleDot className="w-3.5 h-3.5 text-[#30D158] mt-0.5 shrink-0" />
                        : <Circle className="w-3.5 h-3.5 text-neutral-600 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <span className={zapojena ? 'text-white' : 'text-neutral-500'}>{a.nazev}</span>
                        <span className="text-neutral-500"> — {a.popis}</span>
                        <div className="text-[11px] text-neutral-600 truncate">
                          „{a.vychoziFraze.join('", „')}"
                          {!zapojena && <span className="text-amber-500/80"> · zatím nezapojeno</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vlastní příkazy */}
      <div className="bg-[#16161A]/60 border border-white/[0.08] rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#FF9F0A]">Vlastní příkazy</h3>
          {!navrh && (
            <button
              onClick={() => setNavrh(prazdny())}
              className="flex items-center gap-1.5 text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 px-2.5 py-1.5 rounded-xl cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Nový
            </button>
          )}
        </div>

        <div className="space-y-1.5 mb-3">
          {prikazy.filter((p) => p.vlastni).length === 0 && (
            <p className="text-[11px] text-neutral-500">Zatím žádný vlastní příkaz — appka zná jen ty vestavěné.</p>
          )}
          {prikazy.filter((p) => p.vlastni).map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate">{p.nazev}</div>
                <div className="text-[11px] text-neutral-500 truncate">„{p.fraze.join('", „')}" · {p.kroky.length} krok(y)</div>
              </div>
              <button
                onClick={() => void smaz(p)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-[#FF453A] cursor-pointer shrink-0"
                title="Smazat příkaz"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {navrh && (
          <div className="bg-black/40 border border-white/10 rounded-2xl p-3 space-y-3">
            <input
              value={navrh.nazev}
              onChange={(e) => setNavrh({ ...navrh, nazev: e.target.value })}
              placeholder="Jak se příkaz jmenuje (třeba Začít zkoušku)"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-xs"
            />

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Fráze</div>
              {navrh.fraze.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={f}
                    onChange={(e) => {
                      const fraze = [...navrh.fraze];
                      fraze[i] = e.target.value;
                      setNavrh({ ...navrh, fraze });
                    }}
                    placeholder="co řekneš"
                    className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-xs"
                  />
                  <button
                    onClick={() => void nadiktujFrazi(i)}
                    disabled={nahravaFrazi !== null}
                    title="Nadiktovat — uloží se přesně to, co appka uslyší"
                    className="p-2 rounded-xl bg-white/[0.06] border border-white/10 hover:bg-white/[0.12] cursor-pointer disabled:opacity-40"
                  >
                    {nahravaFrazi === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                  {navrh.fraze.length > 1 && (
                    <button
                      onClick={() => setNavrh({ ...navrh, fraze: navrh.fraze.filter((_, x) => x !== i) })}
                      className="p-2 rounded-xl text-neutral-500 hover:text-[#FF453A] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setNavrh({ ...navrh, fraze: [...navrh.fraze, ''] })}
                className="text-[11px] text-neutral-400 hover:text-white cursor-pointer"
              >
                + další způsob, jak to říct
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Kroky</div>
              {navrh.kroky.map((k, i) => {
                const akce = AKCE.find((a) => a.id === k.akce);
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <select
                      value={k.akce}
                      onChange={(e) => upravKrok(i, { akce: e.target.value, hodnoty: {} })}
                      className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-2 py-2 text-xs"
                    >
                      {AKCE.map((a) => (
                        <option key={a.id} value={a.id}>{a.nazev}</option>
                      ))}
                    </select>

                    {akce?.parametry.map((p) => (
                      p.typ === 'sekce' ? (
                        <select
                          key={p.klic}
                          value={String(k.hodnoty[p.klic] ?? p.vychozi ?? '')}
                          onChange={(e) => upravKrok(i, { hodnoty: { ...k.hodnoty, [p.klic]: e.target.value } })}
                          className="bg-white/[0.06] border border-white/10 rounded-xl px-2 py-2 text-xs"
                        >
                          {SEKCE.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <input
                          key={p.klic}
                          type={p.typ === 'cislo' ? 'number' : 'text'}
                          min={p.od}
                          max={p.do}
                          value={String(k.hodnoty[p.klic] ?? p.vychozi ?? '')}
                          onChange={(e) => upravKrok(i, { hodnoty: { ...k.hodnoty, [p.klic]: e.target.value } })}
                          placeholder={p.nazev}
                          className="w-24 bg-white/[0.06] border border-white/10 rounded-xl px-2 py-2 text-xs"
                        />
                      )
                    ))}

                    {navrh.kroky.length > 1 && (
                      <button
                        onClick={() => setNavrh({ ...navrh, kroky: navrh.kroky.filter((_, x) => x !== i) })}
                        className="p-2 rounded-xl text-neutral-500 hover:text-[#FF453A] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => setNavrh({ ...navrh, kroky: [...navrh.kroky, { akce: AKCE[0].id, hodnoty: {} }] })}
                className="text-[11px] text-neutral-400 hover:text-white cursor-pointer"
              >
                + další krok
              </button>
            </div>

            {jsemSpravce && (
              <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={navrh.spolecny}
                  onChange={(e) => setNavrh({ ...navrh, spolecny: e.target.checked })}
                />
                Společný pro celou kapelu
              </label>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => void uloz()}
                className="flex-1 bg-[#30D158] hover:bg-[#34e260] text-black py-2 text-xs font-bold rounded-xl cursor-pointer"
              >
                Uložit příkaz
              </button>
              <button
                onClick={() => setNavrh(null)}
                className="px-3 py-2 text-xs font-semibold bg-white/[0.06] border border-white/10 rounded-xl cursor-pointer"
              >
                Zrušit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
