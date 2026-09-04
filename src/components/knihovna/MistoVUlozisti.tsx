import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, Loader2, Copy } from 'lucide-react';
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
interface Duplicity {
  smazatelnych: number;
  bajtuNavic: number;
  /** Kopie, které používá píseň nebo bicí sada — ty zůstávají. */
  chranenych: number;
}

export const MistoVUlozisti: React.FC<{ jsemSpravce?: boolean }> = ({ jsemSpravce }) => {
  const [stav, setStav] = useState<Stav | null>(null);
  const [nacitam, setNacitam] = useState(true);
  const [duplicity, setDuplicity] = useState<Duplicity | null>(null);
  const [uklizim, setUklizim] = useState(false);
  // Rozpis kategorii je schvalne sbaleny: nad stromem slozek zabiral
  // pres dve ste pixelu pri kazdem otevreni sekce.
  const [rozpis, setRozpis] = useState(false);
  const [vysledek, setVysledek] = useState<string | null>(null);

  const nacti = useCallback(async () => {
    const token = authService.getCurrentSession()?.token;
    if (!token) return;
    try {
      const r = await fetch('/api/storage/usage', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setStav(await r.json());

      const d = await fetch('/api/assets/duplicity', { headers: { Authorization: `Bearer ${token}` } });
      if (d.ok) {
        const data = await d.json();
        setDuplicity(data.smazatelnych > 0 ? data : null);
      }
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
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-4 text-drobne text-neutral-500 flex items-center gap-2">
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
        <HardDrive className="w-4 h-4 text-znacka shrink-0 self-center" />
        <span className="text-lg font-bold text-white tabular-nums">{velikost(stav.celkem)}</span>
        <span className="text-drobne text-neutral-500">z {velikost(stav.limit)}</span>
        <span className="ml-auto text-drobne text-neutral-500">
          volných <strong className="text-neutral-300 tabular-nums">{velikost(volno)}</strong> · {stav.uloziste}
        </span>
        {/* Rozpis zabíral přes dvě stě pixelů nad stromem složek při
            každém otevření sekce. Pruh a varování o limitu zůstávají
            vidět — to je to, kvůli čemu se sem člověk podívá letmo;
            devět kategorií a úklid kopií je detail na vyžádání. */}
        <button
          onClick={() => setRozpis((r) => !r)}
          aria-expanded={rozpis}
          className="text-drobne text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer px-2 rounded-prvek focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-znacka"
        >
          {rozpis ? 'Skrýt rozpis' : 'Rozpis'}
        </button>
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

      {rozpis && (
      <>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {kusy.map((k, i) => (
          <div key={k.nazev} className="flex items-center gap-1.5 text-drobne">
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
        <p className="text-drobne text-neutral-500">
          Sbírka tabulatur se ve složkách níž neukazuje — appka v ní hledá sama a ručně
          se netřídí.
        </p>
      )}

      {/* Kopie téhož souboru pod jiným názvem. Bez tohohle řádku by se
          na ně nepřišlo — v seznamu vypadají jako dva různé soubory. */}
      {duplicity && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.06]">
          <Copy className="w-3.5 h-3.5 text-pozor shrink-0" />
          <span className="text-drobne text-neutral-300">
            {duplicity.smazatelnych.toLocaleString('cs')} souborů leží v knihovně víckrát,
            jen pod jiným názvem — zabírají {velikost(duplicity.bajtuNavic)} navíc.
          </span>
          {jsemSpravce && (
            <button
              disabled={uklizim}
              onClick={async () => {
                if (!window.confirm(
                  `Smazat ${duplicity.smazatelnych} kopií a uvolnit ${velikost(duplicity.bajtuNavic)}?\n\n`
                  + 'Z každé dvojice zůstane ten starší soubor. Kopie, kterou používá píseň nebo bicí sada, se nemaže.'
                )) return;
                setUklizim(true);
                setVysledek(null);
                const token = authService.getCurrentSession()?.token;
                const r = await fetch('/api/assets/duplicity/uklidit', {
                  method: 'POST',
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const d = await r.json().catch(() => ({}));
                setUklizim(false);
                setVysledek(
                  r.ok
                    ? `Smazáno ${d.smazano}, uvolněno ${velikost(d.uvolneno || 0)}`
                      + (d.ponechano ? `, ${d.ponechano} zůstalo (používá je píseň nebo sada).` : '.')
                    : d.error || 'Úklid selhal.',
                );
                void nacti();
              }}
              className="text-drobne px-2.5 py-1 rounded-lg bg-white/[0.06] text-neutral-200 hover:bg-white/[0.12] cursor-pointer disabled:opacity-50"
            >
              {uklizim ? 'Uklízím…' : 'Uklidit kopie'}
            </button>
          )}
          {vysledek && <span className="text-drobne text-uspech">{vysledek}</span>}
        </div>
      )}
      </>
      )}

      {procent > 85 && (
        <p className="text-drobne text-chyba">
          Přes {Math.round(procent)} % limitu. Nad deset gigabajtů se za úložiště platí.
        </p>
      )}
    </div>
  );
};
