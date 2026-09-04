import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authorizedFetch } from '../../services/assetLibraryService';
import { authService } from '../../services/authService';

interface Tip {
  jmeno: string;
  zeme: string;
  zacatek: string;
  popis: string;
}

interface Stav {
  tipy: Tip[];
  celkem: number;
  nacita: boolean;
  chyba: string | null;
}

const PRAZDNY: Stav = { tipy: [], celkem: 0, nacita: false, chyba: null };

const OBLASTI = [
  { id: 'cesko', popis: 'Česko' },
  { id: 'svet', popis: 'Svět' },
] as const;

export type IdOblasti = (typeof OBLASTI)[number]['id'];

const DEKADY = [
  { rok: 1990, popis: '90. léta' },
  { rok: 2000, popis: '2000+' },
  { rok: 2010, popis: '2010+' },
  { rok: 2020, popis: '2020+' },
];

/** Kolik jmen se dotáhne najednou. */
const NA_STRANU = 25;

/**
 * Pruh tipů na kapely a interprety.
 *
 * Jména se berou z MusicBrainzu podle země a roku vzniku, ne z ručního
 * seznamu — v každé dekádě jich tam jsou stovky a vypsat je do kódu by
 * znamenalo osm set řádků, které by hned zestárly.
 *
 * Načítá se po pětadvaceti a další přibývají, jak se pruhem roluje.
 * Naráz by to byl jeden pomalý dotaz na dekádu a většinu z něj by nikdo
 * neviděl.
 */
export const TipyKapel: React.FC<{
  onVybrat: (jmeno: string) => void;
  /**
   * Které řady ukázat. V Guitar Pru dává smysl jen svět: tabulatury
   * k českým kapelám na Freetaru ani Ultimate Guitaru skoro nejsou,
   * takže by řada tipů vedla na prázdné výsledky.
   */
  oblasti?: readonly IdOblasti[];
}> = ({ onVybrat, oblasti }) => {
  const zobrazene = oblasti
    ? OBLASTI.filter((o) => oblasti.includes(o.id))
    : OBLASTI;
  const [dekada, setDekada] = useState(1990);
  /**
   * Jestli už je koho se ptát.
   *
   * Přihlášení se obnovuje ze storage až po prvním vykreslení, takže
   * dotaz poslaný rovnou při připojení komponenty odešel bez tokenu a
   * server ho odmítl. Čeká se, až session dorazí.
   */
  const [prihlasen, setPrihlasen] = useState(() => !!authService.getCurrentSession());
  /** Stav pro každou dvojici oblast+dekáda, ať se přepínáním nic neztrácí. */
  const [stavy, setStavy] = useState<Record<string, Stav>>({});
  const nactene = useRef<Set<string>>(new Set());

  const klic = (oblast: string) => `${oblast}:${dekada}`;

  const nacti = useCallback(async (oblast: string, dek: number, od: number) => {
    const k = `${oblast}:${dek}`;
    const zamek = `${k}:${od}`;
    // Rolování spustí událost mnohokrát za vteřinu; bez zámku by se
    // stejná stránka natáhla několikrát a jména by se zdvojila.
    if (nactene.current.has(zamek)) return;
    nactene.current.add(zamek);

    setStavy((p) => ({ ...p, [k]: { ...(p[k] || PRAZDNY), nacita: true, chyba: null } }));
    try {
      const r = await authorizedFetch(
        `/api/tipy?oblast=${oblast}&dekada=${dek}&od=${od}&kolik=${NA_STRANU}`,
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Tipy se nepodařilo načíst.');
      setStavy((p) => {
        const stary = p[k] || PRAZDNY;
        // Jméno se může opakovat napříč stránkami, tak se filtruje i tady.
        const uz = new Set(stary.tipy.map((t) => t.jmeno.toLowerCase()));
        const nove = (d.tipy as Tip[]).filter((t) => !uz.has(t.jmeno.toLowerCase()));
        return {
          ...p,
          [k]: { tipy: [...stary.tipy, ...nove], celkem: d.celkem, nacita: false, chyba: null },
        };
      });
    } catch (e: any) {
      nactene.current.delete(zamek);
      setStavy((p) => ({
        ...p,
        [k]: { ...(p[k] || PRAZDNY), nacita: false, chyba: e?.message || 'Nepovedlo se.' },
      }));
    }
  }, []);

  useEffect(() => authService.subscribe((s) => setPrihlasen(!!s)), []);

  useEffect(() => {
    if (!prihlasen) return;
    for (const o of zobrazene) nacti(o.id, dekada, 0);
    // `zobrazene` se odvozuje z `oblasti`, které se v běhu nemění.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dekada, prihlasen, nacti]);

  return (
    <div className="space-y-2 py-1 text-xs">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-neutral-500 shrink-0 mr-1">Doporučeno</span>
        {DEKADY.map((d) => (
          <button
            key={d.rok}
            type="button"
            onClick={() => setDekada(d.rok)}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              dekada === d.rok
                ? 'bg-znacka text-black'
                : 'bg-white/5 hover:bg-white/10 text-neutral-400 border border-white/10'
            }`}
          >
            {d.popis}
          </button>
        ))}
      </div>

      {zobrazene.map((o) => {
        const s = stavy[klic(o.id)] || PRAZDNY;
        const jeVic = s.tipy.length < s.celkem;
        return (
          <div key={o.id} className="flex items-center gap-1.5">
            {zobrazene.length > 1 && (
              <span className="text-neutral-400 font-medium shrink-0 w-12">{o.popis}</span>
            )}
            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                // Doplňuje se s předstihem, aby na konci pruhu nebyla díra.
                if (el.scrollLeft + el.clientWidth < el.scrollWidth - 240) return;
                if (s.nacita || !jeVic) return;
                nacti(o.id, dekada, s.tipy.length);
              }}
              className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-1"
            >
              {s.tipy.map((t) => (
                <button
                  key={`${t.jmeno}-${t.zacatek}`}
                  type="button"
                  onClick={() => onVybrat(t.jmeno)}
                  title={[t.popis, t.zacatek && `od ${t.zacatek}`].filter(Boolean).join(' · ') || undefined}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 rounded-xl whitespace-nowrap font-medium transition-all cursor-pointer shrink-0"
                >
                  {t.jmeno}
                </button>
              ))}

              {s.nacita && (
                <span className="flex items-center gap-1.5 text-neutral-500 shrink-0 px-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> hledám…
                </span>
              )}
              {!s.nacita && s.chyba && (
                <span className="text-chyba shrink-0 px-2">{s.chyba}</span>
              )}
              {!s.nacita && !s.chyba && s.tipy.length > 0 && !jeVic && (
                <span className="text-neutral-600 shrink-0 px-2">to je z téhle dekády vše</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
