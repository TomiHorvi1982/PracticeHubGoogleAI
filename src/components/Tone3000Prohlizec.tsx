import React, { useCallback, useEffect, useState } from 'react';
import {
  Search, Download, Check, AlertTriangle, ChevronLeft, ChevronRight, Loader2, Globe,
} from 'lucide-react';
import { authorizedFetch } from '../services/assetLibraryService';

/**
 * Katalog Tone3000 u nás.
 *
 * Tone3000 je zásobárna nasnímaných aparátů (.nam) a impulzů beden (IR)
 * — právě odtud pocházejí modely, na které odkazují tvoje presety
 * v Soundshedu. Stažené modely padají do stejné složky, ze které čte náš
 * vlastní aparát, takže jdou použít i bez Soundshedu.
 *
 * Chodí se přes server, ne přímo: cizí služba pro nás nemá povolené CORS.
 */

interface Ton {
  id: number;
  nazev: string;
  popis?: string;
  znacky: string[];
  poctyModelu: number;
  poctyIr: number;
  stazeni: number;
  obrazek?: string;
}
interface Model {
  id: number;
  nazev: string;
  odkaz: string;
  typ: 'nam' | 'ir';
  velikost?: number;
}

const RAZENI = [
  { id: 'downloads-all-time', nazev: 'Nejstahovanější' },
  { id: 'trending', nazev: 'Teď populární' },
  { id: 'newest', nazev: 'Nejnovější' },
  { id: 'best-match', nazev: 'Nejlepší shoda' },
];

/** Tisíce se čtou líp než holé číslo. */
const pocet = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10} tis.` : String(n));

export const Tone3000Prohlizec: React.FC = () => {
  const [dotaz, setDotaz] = useState('');
  const [razeni, setRazeni] = useState(RAZENI[0].id);
  const [strana, setStrana] = useState(1);
  const [tony, setTony] = useState<Ton[]>([]);
  const [stranek, setStranek] = useState(1);
  const [celkem, setCelkem] = useState(0);
  const [nacita, setNacita] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const [otevreny, setOtevreny] = useState<number | null>(null);
  const [modely, setModely] = useState<Model[]>([]);
  const [nacitaModely, setNacitaModely] = useState(false);
  const [stahuje, setStahuje] = useState<number | null>(null);
  const [stazene, setStazene] = useState<Record<number, string>>({});

  const hledej = useCallback(async (q: string, r: string, s: number) => {
    setNacita(true);
    setChyba(null);
    try {
      const d = await (await authorizedFetch(
        `/api/tone3000/hledat?q=${encodeURIComponent(q)}&razeni=${r}&strana=${s}`,
      )).json();
      if (d.error) throw new Error(d.error);
      setTony(d.tony || []);
      setStranek(d.stranek || 1);
      setCelkem(d.celkem || 0);
    } catch (e: any) {
      setChyba(e?.message || 'Katalog se nepodařilo načíst.');
      setTony([]);
    } finally {
      setNacita(false);
    }
  }, []);

  // Na první otevření se ukáže to nejstahovanější, ať sekce není prázdná.
  useEffect(() => { void hledej('', razeni, 1); }, []);

  const odesli = (e: React.FormEvent) => {
    e.preventDefault();
    setStrana(1);
    setOtevreny(null);
    void hledej(dotaz, razeni, 1);
  };

  const naStranu = (s: number) => {
    setStrana(s);
    setOtevreny(null);
    void hledej(dotaz, razeni, s);
  };

  const otevri = async (t: Ton) => {
    if (otevreny === t.id) { setOtevreny(null); return; }
    setOtevreny(t.id);
    setModely([]);
    setNacitaModely(true);
    try {
      const d = await (await authorizedFetch(`/api/tone3000/modely?tone_id=${t.id}`)).json();
      setModely(d.error ? [] : (d.modely || []));
    } catch {
      setModely([]);
    } finally {
      setNacitaModely(false);
    }
  };

  const stahni = async (m: Model) => {
    setStahuje(m.id);
    try {
      const d = await (await authorizedFetch('/api/tone3000/stahnout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odkaz: m.odkaz, nazev: m.nazev, id: m.id }),
      })).json();
      setStazene((z) => ({
        ...z,
        [m.id]: d.error ? `Nepovedlo se: ${d.error}` : `Uloženo jako ${d.ulozeno}`,
      }));
    } catch {
      setStazene((z) => ({ ...z, [m.id]: 'Nepovedlo se stáhnout.' }));
    } finally {
      setStahuje(null);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-[#0A84FF]" />
          Tone3000 — aparáty a bedny
        </h3>
        {celkem > 0 && (
          <span className="text-stitek text-neutral-500 shrink-0 tabular-nums">
            {pocet(celkem)} výsledků
          </span>
        )}
      </div>

      <form onSubmit={odesli} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={dotaz}
            onChange={(e) => setDotaz(e.target.value)}
            placeholder="Marshall, Mesa, V30, plate reverb…"
            className="w-full bg-black/30 border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-drobne text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/25"
          />
        </div>
        <select
          value={razeni}
          onChange={(e) => { setRazeni(e.target.value); setStrana(1); void hledej(dotaz, e.target.value, 1); }}
          className="bg-black/30 border border-white/[0.08] rounded-xl px-2 py-2 text-drobne text-white focus:outline-none focus:border-white/25"
        >
          {RAZENI.map((r) => <option key={r.id} value={r.id}>{r.nazev}</option>)}
        </select>
        <button
          type="submit"
          className="text-drobne px-3 py-2 rounded-xl bg-[#0A84FF]/15 border border-[#0A84FF]/40 text-[#0A84FF] hover:bg-[#0A84FF]/25 transition-colors cursor-pointer"
        >
          Hledat
        </button>
      </form>

      {chyba && (
        <p className="text-drobne text-[#FF9F0A] bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 rounded-xl px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{chyba}
        </p>
      )}

      {nacita && (
        <p className="text-drobne text-neutral-400 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />Hledám…
        </p>
      )}

      {!nacita && !tony.length && !chyba && (
        <p className="text-drobne text-neutral-500">Nic takového se nenašlo.</p>
      )}

      <div className="space-y-1.5">
        {tony.map((t) => {
          const oteviren = otevreny === t.id;
          return (
            <div key={t.id} className="rounded-xl border border-white/[0.08] bg-black/20 overflow-hidden">
              <button
                onClick={() => void otevri(t)}
                className="w-full text-left px-3 py-2 hover:bg-white/[0.03] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-drobne text-neutral-200 truncate flex-1">{t.nazev}</span>
                  {/* Katalog hlásí u některých tónů jiný počet, než pak
                      vrátí (61 vs 30), a `models_count` počítá i bedny.
                      Proto se to bere jen jako hrubý údaj a nic se
                      netvrdí o tom, kolik z toho jsou aparáty — přesný
                      seznam je vidět po rozkliknutí. */}
                  <span className="text-stitek text-neutral-600 shrink-0 tabular-nums">
                    {t.poctyModelu > 0 && `~${t.poctyModelu} souborů`}
                    {t.poctyIr > 0 && ` · ${t.poctyIr} beden`}
                  </span>
                  <span className="text-stitek text-neutral-600 shrink-0 tabular-nums">
                    ↓ {pocet(t.stazeni)}
                  </span>
                </div>
                {t.znacky.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {t.znacky.slice(0, 5).map((z) => (
                      <span key={z} className="text-stitek text-neutral-500 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5">
                        {z}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              {oteviren && (
                <div className="px-3 pb-3 pt-1 border-t border-white/[0.06] space-y-1">
                  {nacitaModely && (
                    <p className="text-stitek text-neutral-500 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />Načítám soubory…
                    </p>
                  )}
                  {!nacitaModely && !modely.length && (
                    <p className="text-stitek text-neutral-600">Žádné soubory ke stažení.</p>
                  )}
                  {modely.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 py-1">
                      <span className={`text-stitek shrink-0 border rounded-md px-1.5 py-0.5 ${
                        m.typ === 'nam'
                          ? 'text-[#FF9F0A] border-[#FF9F0A]/30 bg-[#FF9F0A]/10'
                          : 'text-[#FF375F] border-[#FF375F]/30 bg-[#FF375F]/10'
                      }`}>
                        {m.typ === 'nam' ? 'aparát' : 'bedna'}
                      </span>
                      <span className="text-stitek text-neutral-300 truncate flex-1">{m.nazev}</span>
                      {stazene[m.id] ? (
                        <span className="text-stitek text-[#30D158] shrink-0 flex items-center gap-1 max-w-[45%] truncate">
                          <Check className="w-3 h-3 shrink-0" />{stazene[m.id]}
                        </span>
                      ) : (
                        <button
                          onClick={() => void stahni(m)}
                          disabled={stahuje === m.id}
                          className="text-stitek shrink-0 px-2 py-1 rounded-lg border border-white/[0.08] text-neutral-300 hover:border-white/25 transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1"
                        >
                          {stahuje === m.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Download className="w-3 h-3" />}
                          Stáhnout
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {stranek > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => naStranu(strana - 1)}
            disabled={strana <= 1 || nacita}
            className="p-1.5 rounded-lg border border-white/[0.08] text-neutral-400 hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-stitek text-neutral-500 tabular-nums">
            {strana} / {stranek}
          </span>
          <button
            onClick={() => naStranu(strana + 1)}
            disabled={strana >= stranek || nacita}
            className="p-1.5 rounded-lg border border-white/[0.08] text-neutral-400 hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <p className="text-stitek text-neutral-600 leading-relaxed">
        Aparáty se ukládají mezi ostatní modely, takže je hned uvidíš v nabídce
        nahoře. Bedny (IR) jdou do vlastní složky — použije je Soundshed.
      </p>
    </div>
  );
};
