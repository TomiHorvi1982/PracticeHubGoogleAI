import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, Loader2 } from 'lucide-react';
import { authService } from '../../services/authService';
import { nazevKategorie } from '../../services/knihovnaStrom';

interface Kus {
  nazev: string;
  bajtu: number;
  souboru: number;
}

interface Stav {
  celkem: number;
  limit: number;
  uloziste: string;
  kategorie: Kus[];
}

/** Barvy dílků. Pořadí je stálé, ať se graf nepřebarvuje po každém nahrání. */
const BARVY = ['#FF9F0A', '#5AC8FA', '#30D158', '#BF5AF2', '#FF453A', '#FFD60A', '#64D2FF', '#AC8E68'];

function velikost(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
  if (b >= 1048576) return `${Math.round(b / 1048576)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} kB`;
}

/**
 * Kolik místa co zabírá.
 *
 * Bydlelo v Nastavení, tedy jinde, než kde se soubory přidávají a mažou.
 * Vidět po nahrání, kolik místa ubylo, znamenalo přepnout sekci — a než
 * tam člověk došel, nahrál mezitím další.
 */
export const MistoVUlozisti: React.FC = () => {
  const [stav, setStav] = useState<Stav | null>(null);
  const [nacitam, setNacitam] = useState(true);

  const nacti = useCallback(async () => {
    const token = authService.getCurrentSession()?.token;
    if (!token) return;
    try {
      const r = await fetch('/api/storage/usage', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setStav(await r.json());
    } catch {
      /* výpadek sítě není důvod ukazovat chybu místo čísla */
    } finally {
      setNacitam(false);
    }
  }, []);

  useEffect(() => {
    void nacti();
    // Po nahrání souboru se přepočítá samo.
    const znovu = () => void nacti();
    window.addEventListener('neverlate:soubor-nahran', znovu);
    return () => window.removeEventListener('neverlate:soubor-nahran', znovu);
  }, [nacti]);

  if (nacitam && !stav) {
    return (
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-4 text-[11px] text-neutral-500 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Počítám místo…
      </div>
    );
  }
  if (!stav) return null;

  const volno = Math.max(0, stav.limit - stav.celkem);
  const procent = Math.min(100, (stav.celkem / stav.limit) * 100);
  const kusy = stav.kategorie.filter((k) => k.bajtu > 0);

  return (
    <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <HardDrive className="w-4 h-4 text-[#FF9F0A] shrink-0 self-center" />
        <span className="text-lg font-bold text-white tabular-nums">{velikost(stav.celkem)}</span>
        <span className="text-[12px] text-neutral-500">z {velikost(stav.limit)}</span>
        <span className="ml-auto text-[11px] text-neutral-500">
          volných <strong className="text-neutral-300 tabular-nums">{velikost(volno)}</strong> · {stav.uloziste}
        </span>
      </div>

      <div
        className="flex h-5 rounded-lg overflow-hidden bg-black/40 border border-white/[0.08]"
        role="img"
        aria-label={`Zabráno ${velikost(stav.celkem)} z ${velikost(stav.limit)}.`}
      >
        {kusy.map((k, i) => (
          <div
            key={k.nazev}
            style={{ width: `${(k.bajtu / stav.limit) * 100}%`, background: BARVY[i % BARVY.length] }}
            title={`${nazevKategorie(k.nazev)}: ${velikost(k.bajtu)}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {kusy.map((k, i) => (
          <div key={k.nazev} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
              style={{ background: BARVY[i % BARVY.length] }}
            />
            <span className="text-neutral-300">{nazevKategorie(k.nazev)}</span>
            <span className="text-neutral-500 tabular-nums">{velikost(k.bajtu)}</span>
            <span className="text-neutral-600 tabular-nums">· {k.souboru.toLocaleString('cs')}</span>
          </div>
        ))}
      </div>

      {/* Sbírka tabulatur zabírá místo, ale ve složkách níž není — leží ve
          vlastní tabulce a slouží automatickému dohledávání, ne ručnímu
          třídění. Bez téhle věty nesedí součet v grafu se stromem. */}
      {kusy.some((k) => k.nazev === 'sbírka tabulatur') && (
        <p className="text-[11px] text-neutral-500">
          Sbírka tabulatur se ve složkách níž neukazuje — appka v ní hledá sama a ručně
          se netřídí.
        </p>
      )}

      {procent > 85 && (
        <p className="text-[11px] text-[#FF453A]">
          Přes {Math.round(procent)} % limitu. Nad deset gigabajtů se za úložiště platí.
        </p>
      )}
    </div>
  );
};
