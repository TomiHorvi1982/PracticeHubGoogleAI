import React, { useCallback, useEffect, useState } from 'react';
import { Mic, Loader2, AlertCircle, ArrowRight, Music4, Scissors } from 'lucide-react';
import { VyberZKnihovny } from '../songbook/VyberZKnihovny';
import { LibraryAsset } from '../../services/assetLibraryService';
import {
  pripravenost, spustPrepis, stavPrepisu, StavPrepisu, UsekPrepisu, cas,
} from '../../services/textyService';

/** Zpěvník je dvojjazyčný, takže jazyk nejde napevno. */
const JAZYKY: { id: string; nazev: string }[] = [
  { id: 'auto', nazev: 'Rozpoznat sám' },
  { id: 'cs', nazev: 'Česky' },
  { id: 'en', nazev: 'Anglicky' },
  { id: 'sk', nazev: 'Slovensky' },
];

/**
 * Přepis textu z nahrávky.
 *
 * Běží na tomhle stroji — nahrávka nikam neodchází. Trvá to minuty, ne
 * vteřiny, takže je vidět, v jaké fázi to je: oddělit zpěv od kapely je
 * ta dlouhá část, samotný přepis je pak rychlý.
 */
export const PrepisPanel: React.FC<{
  onVlozit: (useky: UsekPrepisu[]) => void;
}> = ({ onVlozit }) => {
  const [pripraveno, setPripraveno] = useState<{ ok: boolean; chybi: string[] } | null>(null);
  const [nahravka, setNahravka] = useState<LibraryAsset | null>(null);
  const [oddelit, setOddelit] = useState(true);
  const [jazyk, setJazyk] = useState('auto');
  const [stav, setStav] = useState<StavPrepisu | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  /**
   * Číslo běžící úlohy drží stav, ne ref.
   *
   * V refu to nefungovalo: přiřazení do refu nespustí efekt, takže se
   * dotazování na postup nikdy nerozběhlo a ukazatel zůstal viset na
   * nule, i když přepis na serveru v klidu doběhl.
   */
  const [uloha, setUloha] = useState<string | null>(null);

  useEffect(() => {
    void pripravenost().then(setPripraveno).catch(() => setPripraveno({ ok: false, chybi: ['server neodpověděl'] }));
  }, []);

  // Dotazování místo trvalého spojení: přepis hlásí postup po vteřinách,
  // ne po milisekundách, a na tohle je zbytečné držet otevřený kanál.
  useEffect(() => {
    if (!uloha) return;
    let zivy = true;
    const t = window.setInterval(async () => {
      try {
        const s = await stavPrepisu(uloha);
        if (!zivy) return;
        setStav(s);
        if (s.faze === 'hotovo' || s.faze === 'chyba') setUloha(null);
      } catch (e: any) {
        if (!zivy) return;
        setChyba(e?.message || 'Spojení se ztratilo.');
        setUloha(null);
      }
    }, 1200);
    return () => {
      zivy = false;
      window.clearInterval(t);
    };
  }, [uloha]);

  /**
   * Vybraná stopa se jménem „vocals" už zpěv oddělený má.
   *
   * Pouštět na ni separaci znovu je několik minut práce navíc za nic —
   * a kdo si stopu vybral, právě proto, že je vokálová, by na to sám
   * nemusel myslet.
   */
  const vyber = (a: LibraryAsset) => {
    setNahravka(a);
    if (/vocal|zpev|zpěv/i.test(a.name)) setOddelit(false);
  };

  const spust = useCallback(async () => {
    if (!nahravka) return;
    setChyba(null);
    setStav({ faze: 'priprava', postup: 0, zprava: 'Startuju…', useky: [], chyba: null });
    try {
      setUloha(await spustPrepis(nahravka.id, oddelit, jazyk));
    } catch (e: any) {
      setChyba(e?.message || 'Přepis se nepodařilo spustit.');
      setStav(null);
    }
  }, [nahravka, oddelit, jazyk]);

  const bezi = !!uloha || (!!stav && stav.faze !== 'hotovo' && stav.faze !== 'chyba');

  return (
    <div className="space-y-4">
      <div className="bg-plocha-2 border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Mic className="w-5 h-5 text-znacka" />
          <div className="flex-1 min-w-[220px]">
            <h3 className="text-sm font-bold text-white">Přepis z nahrávky</h3>
            <p className="text-drobne text-neutral-400">
              Běží tady na počítači — nahrávka nikam neodchází. Ber to jako první nástřel, ne hotový text.
            </p>
          </div>
        </div>

        {pripraveno && !pripraveno.ok && (
          <p className="text-drobne text-chyba flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Přepis není připravený — chybí {pripraveno.chybi.join(', ')}.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setOddelit(!oddelit)}
            className={`px-3 py-1.5 rounded-xl text-drobne font-bold flex items-center gap-1.5 cursor-pointer ${
              oddelit ? 'bg-uspech text-black' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
            }`}
            title="Přes celou kapelu si přepis hodně domýšlí. Nad čistým zpěvem píše, co tam opravdu je."
          >
            <Scissors className="w-3.5 h-3.5" /> Nejdřív oddělit zpěv
          </button>
          <select
            value={jazyk}
            onChange={(e) => setJazyk(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-drobne text-white outline-none focus:border-znacka"
            title="U rozpoznání sám se občas splete a přepíše češtinu jako polštinu; když víš, co to je, řekni to."
          >
            {JAZYKY.map((j) => (
              <option key={j.id} value={j.id}>{j.nazev}</option>
            ))}
          </select>
          <span className="text-stitek text-neutral-500">
            {oddelit
              ? 'Přesnější, ale trvá to — počítej minutu na minutu písně navíc.'
              : 'Rychlé, ale přes kapelu si přepis dost domýšlí. Vyber, když už máš vokálovou stopu.'}
          </span>
        </div>

        {nahravka ? (
          <div className="flex flex-wrap items-center gap-2 bg-black/25 rounded-xl px-3 py-2">
            <Music4 className="w-4 h-4 text-info shrink-0" />
            <span className="text-drobne text-white truncate flex-1 min-w-[140px]">
              {nahravka.name}
              {/vocal|zpev|zpěv/i.test(nahravka.name) && (
                <span className="text-stitek text-uspech ml-2">už je to vokálová stopa</span>
              )}
            </span>
            <button
              onClick={() => setNahravka(null)}
              disabled={bezi}
              className="text-drobne text-neutral-500 hover:text-white cursor-pointer disabled:opacity-40"
            >
              změnit
            </button>
            <button
              onClick={() => void spust()}
              disabled={bezi || !pripraveno?.ok}
              className="px-3 py-1.5 rounded-xl bg-znacka text-black text-drobne font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              {bezi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
              {bezi ? 'Běží…' : 'Přepsat'}
            </button>
          </div>
        ) : (
          <VyberZKnihovny
            kategorie="recordings,stem_mix,backing_tracks"
            onVybrat={vyber}
            prazdno="V knihovně zatím žádné nahrávky nejsou."
            cil="k přepisu"
          />
        )}

        {chyba && (
          <p className="text-drobne text-chyba flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
          </p>
        )}

        {stav && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-drobne">
              <span className={stav.faze === 'chyba' ? 'text-chyba' : 'text-neutral-300'}>
                {stav.chyba || stav.zprava}
              </span>
              <span className="text-neutral-500 tabular-nums">{stav.postup} %</span>
            </div>
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={`h-full transition-[width] duration-500 ${
                  stav.faze === 'chyba' ? 'bg-chyba' : 'bg-znacka'
                }`}
                style={{ width: `${stav.faze === 'chyba' ? 100 : stav.postup}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {stav?.useky && stav.useky.length > 0 && (
        <div className="bg-plocha-2 border border-white/[0.08] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-white flex-1">
              Přepsáno — {stav.useky.length} řádků
            </h4>
            <button
              onClick={() => onVlozit(stav.useky)}
              className="px-3 py-1.5 rounded-xl bg-nastroj text-white text-drobne font-bold cursor-pointer flex items-center gap-1.5"
            >
              Do editoru <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-[40vh] overflow-y-auto space-y-0.5 pr-1">
            {stav.useky.map((u, i) => (
              <div key={i} className="flex gap-2 text-drobne py-0.5">
                <span className="text-neutral-600 tabular-nums shrink-0 w-10">{cas(u.zacatek)}</span>
                <span className="text-neutral-200">{u.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
