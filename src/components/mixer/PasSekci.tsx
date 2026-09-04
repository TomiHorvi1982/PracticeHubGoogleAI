import React, { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  Sekce, barvaProPoradi, navrhniNazev, noveId, srovnejSekce,
} from '../../services/sekceSongu';
import { casNaX, xNaCas } from '../../services/mrizkaDob';

/**
 * Pruh se sekcemi skladby.
 *
 * Sedí mezi časovou osou a stopami, protože sekce popisuje čas, ne
 * jednotlivou stopu — refrén platí pro celý pult naráz.
 *
 * Kreslit se dá tažením přes prázdno; hotová sekce se přejmenuje
 * dvojklikem a posune tažením za kraj. Kliknutím se na ni skočí.
 */

interface Props {
  sekce: Sekce[];
  delka: number;
  /** Kus skladby, který je vidět. */
  od: number;
  doKdy: number;
  onZmena: (s: Sekce[]) => void;
  onSkok: (cas: number) => void;
  /** Přehrát jen tuhle sekci dokola. */
  onSmycka: (od: number, doKdy: number) => void;
}

type Tazeni =
  | { druh: 'nova'; od: number; do: number }
  | { druh: 'kraj'; id: string; kraj: 'od' | 'do' }
  | null;

export const PasSekci: React.FC<Props> = ({
  sekce, delka, od, doKdy, onZmena, onSkok, onSmycka,
}) => {
  const pas = useRef<HTMLDivElement>(null);
  const [tazeni, setTazeni] = useState<Tazeni>(null);
  const [prejmenovava, setPrejmenovava] = useState<string | null>(null);

  const sirka = () => pas.current?.getBoundingClientRect().width || 0;
  const casZUdalosti = (clientX: number) => {
    const r = pas.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(delka, xNaCas(clientX - r.left, od, doKdy, r.width)));
  };

  /** Kreslení nové sekce tažením přes volné místo. */
  const zacniKreslit = (e: React.PointerEvent) => {
    if (!(delka > 0) || e.button !== 0) return;
    const zacatek = casZUdalosti(e.clientX);
    setTazeni({ druh: 'nova', od: zacatek, do: zacatek });

    const tahni = (ev: PointerEvent) => {
      setTazeni({ druh: 'nova', od: zacatek, do: casZUdalosti(ev.clientX) });
    };
    const pust = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', tahni);
      window.removeEventListener('pointerup', pust);
      setTazeni(null);
      const konec = casZUdalosti(ev.clientX);
      // Krátké cvaknutí je skok, ne kreslení — jinak by při každém
      // kliknutí do prázdna vznikla nechtěná sekce.
      if (Math.abs(konec - zacatek) < 0.25) { onSkok(zacatek); return; }
      const nova: Sekce = {
        id: noveId(),
        nazev: navrhniNazev(sekce),
        od: Math.min(zacatek, konec),
        do: Math.max(zacatek, konec),
        barva: barvaProPoradi(sekce.length),
      };
      const dalsi = srovnejSekce([...sekce, nova], delka);
      onZmena(dalsi);
      setPrejmenovava(nova.id);
    };
    window.addEventListener('pointermove', tahni);
    window.addEventListener('pointerup', pust);
  };

  /** Posun kraje hotové sekce. */
  const tahniKraj = (e: React.PointerEvent, s: Sekce, kraj: 'od' | 'do') => {
    e.preventDefault();
    e.stopPropagation();
    setTazeni({ druh: 'kraj', id: s.id, kraj });
    const tahni = (ev: PointerEvent) => {
      const cas = casZUdalosti(ev.clientX);
      onZmena(srovnejSekce(
        sekce.map((x) => (x.id === s.id ? { ...x, [kraj]: cas } : x)),
        delka,
      ));
    };
    const pust = () => {
      window.removeEventListener('pointermove', tahni);
      window.removeEventListener('pointerup', pust);
      setTazeni(null);
    };
    window.addEventListener('pointermove', tahni);
    window.addEventListener('pointerup', pust);
  };

  const smaz = (id: string) => onZmena(sekce.filter((x) => x.id !== id));

  const prejmenuj = (id: string, nazev: string) => {
    onZmena(sekce.map((x) => (x.id === id ? { ...x, nazev: nazev.trim().slice(0, 40) || x.nazev } : x)));
    setPrejmenovava(null);
  };

  const w = sirka();
  const naX = (t: number) => casNaX(t, od, doKdy, w);

  return (
    <div
      ref={pas}
      onPointerDown={zacniKreslit}
      title="Tažením nakreslíš sekci"
      className="relative h-6 bg-slate-900/50 border-b border-slate-800/70 overflow-hidden select-none cursor-crosshair"
    >
      {!sekce.length && !tazeni && (
        <span className="absolute inset-0 flex items-center px-2 text-stitek text-slate-600 pointer-events-none">
          Tažením sem nakreslíš sekci — sloku, refrén, sólo
        </span>
      )}

      {sekce.map((s) => {
        const x1 = naX(s.od);
        const x2 = naX(s.do);
        // Sekce mimo výřez se nekreslí — po přiblížení jich je vidět pár.
        if (x2 < 0 || x1 > w) return null;
        const barva = s.barva || barvaProPoradi(0);
        return (
          <div
            key={s.id}
            className="absolute top-0 bottom-0 group"
            style={{ left: x1, width: Math.max(2, x2 - x1) }}
          >
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSkok(s.od)}
              onDoubleClick={() => setPrejmenovava(s.id)}
              title={`${s.nazev} — klikni pro skok, dvojklik přejmenuje`}
              className="absolute inset-0 flex items-center px-1.5 cursor-pointer border-l-2 overflow-hidden"
              style={{ background: `${barva}22`, borderColor: barva }}
            >
              {prejmenovava === s.id ? (
                <input
                  autoFocus
                  defaultValue={s.nazev}
                  // Nabídnutý název je návrh, ne začátek psaní: bez
                  // označení by z „Intro“ a napsaného „Refrén“ vzniklo
                  // „IntroRefrén“.
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => prejmenuj(s.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') prejmenuj(s.id, (e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') setPrejmenovava(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-slate-950 text-stitek text-white px-1 rounded outline-none"
                />
              ) : (
                <span
                  className="text-stitek font-bold truncate"
                  style={{ color: barva }}
                >
                  {s.nazev}
                </span>
              )}
            </div>

            {/* Ovládání se ukazuje až po najetí, ať pruh nezaplevelí. */}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSmycka(s.od, s.do); }}
              title="Přehrávat tuhle sekci dokola"
              className="absolute right-4 top-1/2 -translate-y-1/2 hidden group-hover:block text-stitek text-slate-300 hover:text-white cursor-pointer"
            >
              ⟲
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); smaz(s.id); }}
              title="Smazat sekci"
              className="absolute right-0.5 top-1/2 -translate-y-1/2 hidden group-hover:block text-slate-400 hover:text-rose-400 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>

            {/* Kraje na posun. Uvnitř sekce, aby se nepraly se sousedem. */}
            <div
              onPointerDown={(e) => tahniKraj(e, s, 'od')}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30"
            />
            <div
              onPointerDown={(e) => tahniKraj(e, s, 'do')}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30"
            />
          </div>
        );
      })}

      {/* Náhled kreslené sekce. */}
      {tazeni?.druh === 'nova' && (
        <div
          className="absolute top-0 bottom-0 bg-amber-400/25 border-x border-amber-400 pointer-events-none"
          style={{
            left: naX(Math.min(tazeni.od, tazeni.do)),
            width: Math.max(1, Math.abs(naX(tazeni.do) - naX(tazeni.od))),
          }}
        />
      )}
    </div>
  );
};

/** Tlačítko „sekce ze smyčky“ — sedí k ovládání nad stopami, ne do pruhu. */
export const SekceZeSmycky: React.FC<{
  smycka: { od: number; do: number } | null;
  sekce: Sekce[];
  delka: number;
  onZmena: (s: Sekce[]) => void;
}> = ({ smycka, sekce, delka, onZmena }) => {
  if (!smycka) return null;
  return (
    <button
      onClick={() => onZmena(srovnejSekce([...sekce, {
        id: noveId(),
        nazev: navrhniNazev(sekce),
        od: smycka.od,
        do: smycka.do,
        barva: barvaProPoradi(sekce.length),
      }], delka))}
      title="Ze smyčky udělat sekci"
      className="flex items-center gap-1 text-stitek px-2 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
    >
      <Plus className="w-3 h-3" />Sekce ze smyčky
    </button>
  );
};
