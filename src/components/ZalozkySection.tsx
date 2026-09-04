import { HlavickaSekce } from './ui/HlavickaSekce';
import React, { useEffect, useState } from 'react';
import { Bookmark, Plus, Trash2, ExternalLink, Check, Pencil, X } from 'lucide-react';
import { zalozkyService, Zalozka, Kategorie, KATEGORIE } from '../services/zalozkyService';

/**
 * Odkazy, kam kapela chodí.
 *
 * Sdílené, ne osobní: co si jeden najde, mají ostatní taky. Mění se
 * u všech naráz, takže se nikdo nemusí ptát, kde to bylo.
 */

export const ZalozkySection: React.FC = () => {
  const [zalozky, setZalozky] = useState<Zalozka[]>([]);
  const [filtr, setFiltr] = useState<Kategorie | 'vse'>('vse');
  const [chyba, setChyba] = useState<string | null>(null);
  const [upravovana, setUpravovana] = useState<string | null>(null);

  const [nazev, setNazev] = useState('');
  const [url, setUrl] = useState('');
  const [popis, setPopis] = useState('');
  const [kategorie, setKategorie] = useState<Kategorie>('vlastni');
  const [uklada, setUklada] = useState(false);

  useEffect(() => zalozkyService.subscribe(setZalozky), []);

  const videt = filtr === 'vse' ? zalozky : zalozky.filter((z) => z.kategorie === filtr);

  const pridej = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nazev.trim() || !url.trim()) return;
    setUklada(true);
    const chyb = await zalozkyService.pridej({ nazev, url, popis, kategorie });
    setUklada(false);
    if (chyb) {
      setChyba(chyb);
      return;
    }
    setNazev('');
    setUrl('');
    setPopis('');
    setChyba(null);
  };

  return (
    <div className="space-y-4 font-sans text-white pb-12">
      {/* Odznak „Záložky" nad nadpisem opakoval to, na co uživatel
          před chvílí klikl v navigaci. Počet zůstává, ten je užitečný. */}
      <HlavickaSekce
        nazev="Kam kapela chodí"
        klic="zalozky"
        akce={zalozky.length > 0 ? (
          <span className="text-drobne text-pismo-tlum tabular-nums">{zalozky.length} záložek</span>
        ) : undefined}
        napoveda="Sdílené odkazy — co si jeden najde, mají ostatní hned taky."
      />

      {chyba && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl px-4 py-2.5 text-xs">
          {chyba}
        </div>
      )}

      {/* Filtr */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFiltr('vse')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
            filtr === 'vse' ? 'bg-uspech text-black' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
          }`}
        >
          Vše ({zalozky.length})
        </button>
        {KATEGORIE.map((k) => {
          const pocet = zalozky.filter((z) => z.kategorie === k.id).length;
          return (
            <button
              key={k.id}
              onClick={() => setFiltr(k.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                filtr === k.id ? 'bg-uspech text-black' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
              }`}
            >
              {k.ikona} {k.nazev} {pocet > 0 && <span className="opacity-60">({pocet})</span>}
            </button>
          );
        })}
      </div>

      {/* Seznam */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {videt.map((z) => (
          <div
            key={z.id}
            className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-4 flex flex-col gap-2 group"
          >
            {upravovana === z.id ? (
              <UpravaZalozky
                zalozka={z}
                onHotovo={() => setUpravovana(null)}
                onChyba={setChyba}
              />
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <span className="text-lg shrink-0">
                    {KATEGORIE.find((k) => k.id === z.kategorie)?.ikona || '⭐'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{z.nazev}</h3>
                    <p className="text-stitek text-neutral-500 truncate font-mono">{z.url}</p>
                  </div>
                </div>
                {z.popis && <p className="text-drobne text-neutral-400 leading-relaxed">{z.popis}</p>}
                <div className="flex items-center gap-1.5 mt-auto pt-1">
                  <a
                    href={z.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center text-drobne font-bold px-3 py-1.5 rounded-xl bg-white/[0.06] text-neutral-200 hover:bg-white/[0.12] cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3 h-3" /> Otevřít
                  </a>
                  <button
                    onClick={() => setUpravovana(z.id)}
                    className="p-1.5 rounded-xl text-neutral-600 hover:text-white cursor-pointer opacity-0 group-hover:opacity-100"
                    title="Upravit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Smazat „${z.nazev}" všem?`)) return;
                      const ch = await zalozkyService.smaz(z.id);
                      if (ch) setChyba(ch);
                    }}
                    className="p-1.5 rounded-xl text-neutral-600 hover:text-chyba cursor-pointer opacity-0 group-hover:opacity-100"
                    title="Smazat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {videt.length === 0 && (
          <div className="col-span-full text-center text-xs text-neutral-500 py-8">
            V téhle kategorii zatím nic není.
          </div>
        )}
      </div>

      {/* Přidání */}
      <form
        onSubmit={pridej}
        className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-uspech" />
          <h3 className="text-sm font-bold text-white">Přidat odkaz</h3>
          <span className="text-drobne text-neutral-500">uvidí ho celá kapela</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            value={nazev}
            onChange={(e) => setNazev(e.target.value)}
            placeholder="Název"
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-uspech"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="adresa.cz"
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-uspech"
          />
          <select
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value as Kategorie)}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs cursor-pointer"
          >
            {KATEGORIE.map((k) => (
              <option key={k.id} value={k.id}>{k.ikona} {k.nazev}</option>
            ))}
          </select>
        </div>

        <input
          value={popis}
          onChange={(e) => setPopis(e.target.value)}
          placeholder="K čemu to je — ať to ostatní poznají bez klikání"
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-uspech"
        />

        <button
          type="submit"
          disabled={!nazev.trim() || !url.trim() || uklada}
          className="px-4 py-2 rounded-xl bg-uspech text-black text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" /> {uklada ? 'Ukládám…' : 'Přidat'}
        </button>
      </form>
    </div>
  );
};

/** Úprava jedné záložky na místě. */
const UpravaZalozky: React.FC<{
  zalozka: Zalozka;
  onHotovo: () => void;
  onChyba: (c: string | null) => void;
}> = ({ zalozka, onHotovo, onChyba }) => {
  const [nazev, setNazev] = useState(zalozka.nazev);
  const [url, setUrl] = useState(zalozka.url);
  const [popis, setPopis] = useState(zalozka.popis);

  return (
    <div className="space-y-2">
      <input
        value={nazev}
        onChange={(e) => setNazev(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-drobne font-mono"
      />
      <input
        value={popis}
        onChange={(e) => setPopis(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-drobne"
      />
      <div className="flex gap-1.5">
        <button
          onClick={async () => {
            const ch = await zalozkyService.uprav(zalozka.id, { nazev, url, popis });
            onChyba(ch);
            if (!ch) onHotovo();
          }}
          className="flex-1 text-drobne font-bold px-2 py-1.5 rounded-lg bg-uspech text-black cursor-pointer"
        >
          Uložit
        </button>
        <button
          onClick={onHotovo}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-white cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
