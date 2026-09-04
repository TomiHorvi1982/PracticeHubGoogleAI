import React, { useEffect, useState } from 'react';
import { Mic, Plus, Trash2, Check, X, Loader2, ShieldAlert, CircleDot, Circle, Wand2 } from 'lucide-react';
import { AKCE, Akce, HlasovyPrikaz, Krok, SEKCE } from '../../services/hlas/katalog';
import { prikazyService } from '../../services/hlas/prikazyService';
import { dostupneAkce } from '../../services/hlas/vykonavac';
import { Moznosti, poslouchej, zjistiMoznosti } from '../../services/hlas/poslech';
import { authService } from '../../services/authService';
import { nactiNastaveni, ulozNastaveni, NastaveniHlasu } from '../../services/hlas/nastaveni';

/**
 * Správa hlasového ovládání.
 *
 * Dvě části, obě si o to řekly samy: katalog, ze kterého je vidět, co
 * appka umí a co zatím ne, a editor vlastních příkazů. Frázi jde napsat
 * i nadiktovat — nadiktovaná projde stejným přepisem jako ostrý příkaz,
 * takže se uloží přesně to, co appka doopravdy uslyší, ne to, co si
 * člověk myslí, že říká.
 */

/**
 * Nový příkaz začíná bez vybrané akce.
 *
 * Dřív tu stála první akce z katalogu, a kdo se výběru nedotkl, uložil
 * si příkaz, který dělá něco úplně jiného, než čekal — a nedalo se to
 * poznat jinak než tím, že „nic nereaguje". Prázdná volba přinutí
 * vybrat.
 */
const prazdny = (): { nazev: string; fraze: string[]; kroky: Krok[]; spolecny: boolean } => ({
  nazev: '',
  fraze: [''],
  kroky: [{ akce: '', hodnoty: {} }],
  spolecny: false,
});

export const HlasovyPanel: React.FC<{ jsemSpravce?: boolean }> = ({ jsemSpravce }) => {
  const [moznosti, setMoznosti] = useState<Moznosti | null>(null);
  const [prikazy, setPrikazy] = useState<HlasovyPrikaz[]>([]);
  const [zapojene, setZapojene] = useState<string[]>([]);
  const [navrh, setNavrh] = useState<ReturnType<typeof prazdny> | null>(null);
  const [nahravaFrazi, setNahravaFrazi] = useState<number | null>(null);
  const [hlaseni, setHlaseni] = useState<{ text: string; dobre: boolean } | null>(null);
  const [popis, setPopis] = useState('');
  const [prekladaSe, setPrekladaSe] = useState(false);
  const [nastaveni, setNastaveni] = useState<NastaveniHlasu>(() => nactiNastaveni());

  const zmen = (zmena: Partial<NastaveniHlasu>) => {
    const nove = { ...nastaveni, ...zmena };
    setNastaveni(nove);
    ulozNastaveni(nove);
  };

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

  /**
   * Nechá popis přeložit na kroky.
   *
   * Výsledek se jen předvyplní do editoru — spustit ho nemá kdo, dokud
   * to člověk neuloží. Co model navrhl mimo katalog, zahodí už server a
   * pošle o tom výhradu, ať je vidět, že se něco nepovedlo.
   */
  const prelozPopis = async () => {
    if (!popis.trim()) return;
    setPrekladaSe(true);
    try {
      const token = authService.getCurrentSession()?.token;
      const r = await fetch('/api/hlas/preloz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ popis }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Překlad selhal.');
      if (!d.kroky?.length) {
        setHlaseni({
          text: d.vyhrady?.length
            ? `Z popisu nic použitelného nevzniklo: ${d.vyhrady.join(' ')}`
            : 'Popisu neodpovídá žádná akce, kterou appka umí.',
          dobre: false,
        });
        return;
      }
      setNavrh((n) => (n ? { ...n, kroky: d.kroky } : n));
      setHlaseni({
        text: d.vyhrady?.length
          ? `Kroky doplněné — část návrhu jsem zahodil: ${d.vyhrady.join(' ')}`
          : 'Kroky doplněné. Projdi je a ulož.',
        dobre: !d.vyhrady?.length,
      });
    } catch (e: any) {
      setHlaseni({ text: e?.message || 'Překlad selhal.', dobre: false });
    } finally {
      setPrekladaSe(false);
    }
  };

  const uloz = async () => {
    if (!navrh) return;
    if (navrh.kroky.some((k) => !k.akce)) {
      setHlaseni({ text: 'U každého kroku vyber, co se má stát.', dobre: false });
      return;
    }
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
              : 'bg-uspech/[0.06] border-uspech/30 text-uspech'
          }`}
        >
          {moznosti.odesilaVen ? <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" /> : <Check className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{moznosti.duvod}</span>
        </div>
      )}

      {hlaseni && (
        <div className={`rounded-2xl border p-3 text-xs ${
          hlaseni.dobre ? 'bg-uspech/10 border-uspech/30 text-uspech' : 'bg-chyba/10 border-chyba/30 text-chyba'
        }`}>
          {hlaseni.text}
        </div>
      )}

      {/* Nastavení rozpoznávání.
          Přísnost se hodí jinak doma a jinak v hlučné zkušebně, takže
          to nemá být zadrátované číslo. */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-znacka">Nastavení</h3>

        <div>
          <div className="flex items-center justify-between text-drobne mb-1">
            <span className="text-neutral-300">Přísnost rozpoznávání</span>
            <span className="font-mono text-znacka tabular-nums">
              {Math.round(nastaveni.prah * 100)} %
            </span>
          </div>
          <input
            type="range"
            min={30}
            max={95}
            value={Math.round(nastaveni.prah * 100)}
            onChange={(e) => zmen({ prah: Number(e.target.value) / 100 })}
            className="w-full accent-znacka cursor-pointer"
          />
          <p className="text-stitek text-neutral-500 leading-relaxed mt-1">
            Níž znamená ochotnější rozpoznávání za cenu občasného omylu, výš naopak.
            Na pódiu bývá lepší nerozumět než udělat něco jiného.
          </p>
        </div>

        <label className="flex items-start gap-2 text-drobne text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={nastaveni.potvrzovatHlasem}
            onChange={(e) => zmen({ potvrzovatHlasem: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            Potvrzovat nahlas
            <span className="block text-stitek text-neutral-500">
              Appka řekne, co spustila. Na pódiu, kde se na obrazovku nedíváš.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-drobne text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={nastaveni.ukazovatSlysene}
            onChange={(e) => zmen({ ukazovatSlysene: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            Ukazovat, co jsem slyšel
            <span className="block text-stitek text-neutral-500">
              I když příkaz nenajdu. Bez toho není poznat, jestli jsi špatně vyslovil,
              nebo takový příkaz není.
            </span>
          </span>
        </label>
      </div>

      {/* Katalog — co appka umí a co zatím ne */}
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-4">
        <h3 className="text-sm font-bold text-znacka mb-1">Co hlasem jde</h3>
        <p className="text-drobne text-neutral-400 mb-3">
          Nezapojené akce zná katalog, ale zatím je nikdo neobsluhuje — hlasem nic neudělají.
        </p>
        <div className="space-y-3">
          {skupiny.map((s) => (
            <div key={s}>
              <div className="text-stitek uppercase tracking-widest text-neutral-500 mb-1.5">{s}</div>
              <div className="space-y-1">
                {AKCE.filter((a) => a.skupina === s).map((a: Akce) => {
                  const zapojena = zapojene.includes(a.id);
                  return (
                    <div key={a.id} className="flex items-start gap-2 text-xs">
                      {zapojena
                        ? <CircleDot className="w-3.5 h-3.5 text-uspech mt-0.5 shrink-0" />
                        : <Circle className="w-3.5 h-3.5 text-neutral-600 mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <span className={zapojena ? 'text-white' : 'text-neutral-500'}>{a.nazev}</span>
                        <span className="text-neutral-500"> — {a.popis}</span>
                        <div className="text-drobne text-neutral-600 truncate">
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
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-znacka">Vlastní příkazy</h3>
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
            <p className="text-drobne text-neutral-500">Zatím žádný vlastní příkaz — appka zná jen ty vestavěné.</p>
          )}
          {prikazy.filter((p) => p.vlastni).map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate">{p.nazev}</div>
                <div className="text-drobne text-neutral-500 truncate">„{p.fraze.join('", „')}" · {p.kroky.length} krok(y)</div>
              </div>
              <button
                onClick={() => void smaz(p)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-chyba cursor-pointer shrink-0"
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
              <div className="text-stitek uppercase tracking-widest text-neutral-500">Fráze</div>
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
                      className="p-2 rounded-xl text-neutral-500 hover:text-chyba cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setNavrh({ ...navrh, fraze: [...navrh.fraze, ''] })}
                className="text-drobne text-neutral-400 hover:text-white cursor-pointer"
              >
                + další způsob, jak to říct
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-stitek uppercase tracking-widest text-neutral-500">
                Nebo popiš, co má dělat
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  value={popis}
                  onChange={(e) => setPopis(e.target.value)}
                  placeholder="otevři pódium a nastav tempo na 140"
                  className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-xs"
                />
                <button
                  onClick={() => void prelozPopis()}
                  disabled={prekladaSe || !popis.trim()}
                  title="Přeložit popis na kroky"
                  className="p-2 rounded-xl bg-white/[0.06] border border-white/10 hover:bg-white/[0.12] cursor-pointer disabled:opacity-40"
                >
                  {prekladaSe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-stitek text-amber-500/70">
                Popis se posílá Googlu k překladu. Nahrávky ani hotové příkazy ven nechodí.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="text-stitek uppercase tracking-widest text-neutral-500">Kroky</div>
              {navrh.kroky.map((k, i) => {
                const akce = AKCE.find((a) => a.id === k.akce);
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <select
                      value={k.akce}
                      onChange={(e) => upravKrok(i, { akce: e.target.value, hodnoty: {} })}
                      className={`flex-1 bg-white/[0.06] border rounded-xl px-2 py-2 text-xs ${
                        k.akce ? 'border-white/10' : 'border-znacka/50 text-znacka'
                      }`}
                    >
                      <option value="">— vyber, co se má stát —</option>
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
                        className="p-2 rounded-xl text-neutral-500 hover:text-chyba cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => setNavrh({ ...navrh, kroky: [...navrh.kroky, { akce: '', hodnoty: {} }] })}
                className="text-drobne text-neutral-400 hover:text-white cursor-pointer"
              >
                + další krok
              </button>
            </div>

            {jsemSpravce && (
              <label className="flex items-center gap-2 text-drobne text-neutral-300 cursor-pointer">
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
                className="flex-1 bg-uspech hover:bg-uspech-svetla text-black py-2 text-xs font-bold rounded-xl cursor-pointer"
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
