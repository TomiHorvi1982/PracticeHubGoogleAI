import React, { useState, useCallback } from 'react';
import { Search, Loader2, Plus, Sparkles, AlertCircle, Users } from 'lucide-react';
import { authService } from '../../services/authService';

interface Skladba {
  nazev: string;
  interpret: string;
  posluchacu?: number;
  shoda?: number;
  obrazek: string | null;
}

interface Props {
  /** Přidání do knihovny. Doplnění materiálů se rozjede samo. */
  onPridat: (interpret: string, nazev: string) => void;
}

async function ptejSe(cesta: string): Promise<any> {
  const token = authService.getCurrentSession()?.token;
  const res = await fetch(cesta, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error || `Server vrátil ${res.status}`), { chybiKlic: d?.chybiKlic });
  return d;
}

/**
 * Hledání skladeb a doporučení podobných.
 *
 * Staví na Last.fm, který podobnost odvozuje z toho, co lidé opravdu
 * poslouchají. Jazykový model by uměl navrhnout taky, ale občas by si píseň
 * vymyslel — a nabídnout kapele skladbu, která neexistuje, je horší než
 * nenabídnout nic.
 */
export const ObjevSkladby: React.FC<Props> = ({ onPridat }) => {
  const [dotaz, setDotaz] = useState('');
  const [vysledky, setVysledky] = useState<Skladba[]>([]);
  const [podobne, setPodobne] = useState<Skladba[]>([]);
  const [zdrojPodobnych, setZdrojPodobnych] = useState<string>('');
  const [vybrana, setVybrana] = useState<Skladba | null>(null);
  const [hledam, setHledam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [chybiKlic, setChybiKlic] = useState(false);

  const hledej = useCallback(async () => {
    const q = dotaz.trim();
    if (!q) return;
    setHledam(true);
    setChyba(null);
    setPodobne([]);
    setVybrana(null);
    try {
      const d = await ptejSe(`/api/lastfm/search?q=${encodeURIComponent(q)}`);
      setVysledky(d.skladby || []);
      if ((d.skladby || []).length === 0) setChyba('Nic se nenašlo.');
    } catch (e: any) {
      setChybiKlic(Boolean(e?.chybiKlic));
      setChyba(e?.message || 'Hledání selhalo.');
      setVysledky([]);
    } finally {
      setHledam(false);
    }
  }, [dotaz]);

  const ukazPodobne = async (s: Skladba) => {
    setVybrana(s);
    setPodobne([]);
    try {
      const d = await ptejSe(
        `/api/lastfm/similar?artist=${encodeURIComponent(s.interpret)}&track=${encodeURIComponent(s.nazev)}`
      );
      setPodobne(d.podobne || []);
      setZdrojPodobnych(d.zdroj || '');
    } catch {
      /* prázdná doporučení nejsou chyba, o kterou by stálo za to zakopnout */
    }
  };

  const karta = (s: Skladba, i: number, jePodobna = false) => (
    <div
      key={`${s.interpret}-${s.nazev}-${i}`}
      className="flex items-center gap-2 bg-black/30 border border-white/[0.06] rounded-xl px-2.5 py-1.5 hover:border-white/20 transition-all"
    >
      {s.obrazek ? (
        <img src={s.obrazek} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-md bg-white/5 shrink-0" />
      )}
      <button
        onClick={() => void ukazPodobne(s)}
        className="min-w-0 flex-1 text-left cursor-pointer"
        title="Ukázat podobné"
      >
        <div className="text-[12px] font-semibold text-white truncate">{s.nazev || s.interpret}</div>
        <div className="text-[10px] text-neutral-500 truncate">
          {s.nazev ? s.interpret : 'interpret'}
          {typeof s.posluchacu === 'number' && s.posluchacu > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" /> {s.posluchacu.toLocaleString('cs')}
            </span>
          )}
          {jePodobna && typeof s.shoda === 'number' && s.shoda > 0 && (
            <span className="ml-1.5 text-[#FF9F0A]">shoda {Math.round(s.shoda * 100)} %</span>
          )}
        </div>
      </button>
      {s.nazev && (
        <button
          onClick={() => onPridat(s.interpret, s.nazev)}
          className="p-1.5 rounded-lg bg-[#30D158]/15 hover:bg-[#30D158]/30 text-[#30D158] cursor-pointer shrink-0 transition-all"
          title="Přidat do knihovny — materiály se dohledají samy"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={dotaz}
            onChange={(e) => setDotaz(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void hledej()}
            placeholder="Hledat skladbu nebo kapelu na Last.fm…"
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-[13px] text-white placeholder-neutral-500 outline-none focus:border-[#FF9F0A]"
          />
        </div>
        <button
          onClick={() => void hledej()}
          disabled={hledam || !dotaz.trim()}
          className="px-4 py-2 bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 text-black text-xs font-bold rounded-xl cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          {hledam ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hledat'}
        </button>
      </div>

      {chyba && (
        <div className="flex items-start gap-2 text-[11px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-xl px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <div>{chyba}</div>
            {chybiKlic && (
              <div className="text-neutral-400 mt-0.5">
                Přidej do <code className="text-neutral-300">.env</code> řádek{' '}
                <code className="text-neutral-300">LASTFM_API_KEY=…</code> a restartuj server.
              </div>
            )}
          </div>
        </div>
      )}

      {vysledky.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-1.5 max-h-[30vh] overflow-y-auto pr-1">
          {vysledky.map((s, i) => karta(s, i))}
        </div>
      )}

      {vybrana && (
        <div className="space-y-1.5 border-t border-white/[0.06] pt-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <Sparkles className="w-3.5 h-3.5 text-[#FF9F0A]" />
            Podobné k <strong className="text-white">{vybrana.interpret} — {vybrana.nazev}</strong>
            {zdrojPodobnych === 'interpret' && (
              <span className="text-neutral-600">
                (Last.fm nezná tuhle skladbu, tak nabízí podobné interprety)
              </span>
            )}
          </div>
          {podobne.length === 0 ? (
            <p className="text-[11px] text-neutral-600">Last.fm k téhle skladbě nic nezná.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-1.5">
              {podobne.map((s, i) => karta(s, i, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
