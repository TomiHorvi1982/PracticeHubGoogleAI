import React, { useEffect, useRef, useState } from 'react';
import { Mic, Loader2, ShieldAlert } from 'lucide-react';
import { Moznosti, Poslouchani, poslouchej, zjistiMoznosti } from '../../services/hlas/poslech';
import { prikazyService } from '../../services/hlas/prikazyService';
import { najdiPrikaz } from '../../services/hlas/shoda';
import { spustPrikaz } from '../../services/hlas/vykonavac';
import { HlasovyPrikaz } from '../../services/hlas/katalog';

type Stav = 'klid' | 'poslouchá' | 'přepisuje';

/**
 * Mikrofon pro hlasové příkazy.
 *
 * Sedí v horní liště, takže je po ruce ze všech sekcí — o to ostatně
 * šlo. Sám nic neumí: přepis obstará server nebo prohlížeč, akci provede
 * ten, kdo si ji zaregistroval.
 *
 * Vždycky ukáže, co slyšel, i když tomu nerozuměl. Bez toho člověk jen
 * vidí, že se nic nestalo, a neví, jestli špatně vyslovil, nebo takový
 * příkaz vůbec neexistuje.
 */
export const MikrofonTlacitko: React.FC = () => {
  const [moznosti, setMoznosti] = useState<Moznosti | null>(null);
  const [stav, setStav] = useState<Stav>('klid');
  const [hlaseni, setHlaseni] = useState<{ text: string; dobre: boolean } | null>(null);
  const prikazy = useRef<HlasovyPrikaz[]>([]);
  const bezici = useRef<Poslouchani | null>(null);

  useEffect(() => {
    let zivy = true;
    void zjistiMoznosti().then((m) => { if (zivy) setMoznosti(m); });
    void prikazyService.nacti().then((p) => { if (zivy) prikazy.current = p; });
    return () => { zivy = false; };
  }, []);

  // Hlášení samo zmizí; na pódiu není čas zavírat bublinu.
  useEffect(() => {
    if (!hlaseni) return;
    const t = setTimeout(() => setHlaseni(null), 6000);
    return () => clearTimeout(t);
  }, [hlaseni]);

  const zacni = async () => {
    if (!moznosti || moznosti.cesta === 'zadna') return;

    if (stav === 'poslouchá') {
      bezici.current?.zastav();
      return;
    }
    if (stav === 'přepisuje') return;

    setHlaseni(null);
    setStav('poslouchá');
    try {
      const p = poslouchej(moznosti.cesta);
      bezici.current = p;
      const text = await p.vysledek;
      setStav('přepisuje');

      // Seznam se čte znovu: mezitím si člověk mohl příkaz založit.
      prikazy.current = await prikazyService.nacti();
      const nalez = najdiPrikaz(text, prikazy.current);

      if (!nalez) {
        setHlaseni({
          text: text.trim() ? `Slyším „${text.trim()}" — na to zatím nic nemám.` : 'Nic jsem neslyšel.',
          dobre: false,
        });
        return;
      }

      const vysledek = await spustPrikaz(nalez.prikaz, { cislo: nalez.cislo, sekce: nalez.sekce });
      if (vysledek.chyba) {
        setHlaseni({ text: `${nalez.prikaz.nazev}: ${vysledek.chyba}`, dobre: false });
      } else if (!vysledek.provedeno) {
        setHlaseni({ text: `„${nalez.prikaz.nazev}" tahle část aplikace zatím neobsluhuje.`, dobre: false });
      } else {
        setHlaseni({ text: nalez.prikaz.nazev, dobre: true });
      }
    } catch (e: any) {
      setHlaseni({ text: e?.message || 'Poslech selhal.', dobre: false });
    } finally {
      bezici.current = null;
      setStav('klid');
    }
  };

  if (!moznosti || moznosti.cesta === 'zadna') return null;

  return (
    <div className="relative">
      <button
        onClick={() => void zacni()}
        title={`Hlasový příkaz — ${moznosti.duvod}`}
        className={`relative w-9 h-9 rounded-xl flex items-center justify-center border transition-colors cursor-pointer ${
          stav === 'poslouchá'
            ? 'bg-[#FF453A]/20 border-[#FF453A]/50 text-[#FF453A]'
            : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white hover:border-slate-600'
        }`}
      >
        {stav === 'přepisuje' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Mic className={`w-4 h-4 ${stav === 'poslouchá' ? 'animate-pulse' : ''}`} />
        )}
        {/* Zvuk odchází ven — člen to má vidět pokaždé, ne jen v nastavení. */}
        {moznosti.odesilaVen && (
          <ShieldAlert className="w-3 h-3 text-amber-400 absolute -top-1 -right-1" />
        )}
      </button>

      {(hlaseni || stav === 'poslouchá') && (
        <div
          className={`absolute top-11 right-0 z-50 px-3 py-2 rounded-xl text-[11px] font-medium whitespace-nowrap max-w-[280px] truncate border shadow-lg ${
            stav === 'poslouchá'
              ? 'bg-[#FF453A]/15 border-[#FF453A]/40 text-[#FF9F0A]'
              : hlaseni?.dobre
                ? 'bg-[#30D158]/15 border-[#30D158]/40 text-[#30D158]'
                : 'bg-slate-900 border-slate-700 text-slate-300'
          }`}
        >
          {stav === 'poslouchá' ? 'Poslouchám — mluv…' : hlaseni?.text}
        </div>
      )}
    </div>
  );
};
