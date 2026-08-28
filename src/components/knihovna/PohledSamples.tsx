import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Search, Trash2, Music4 } from 'lucide-react';
import { authService } from '../../services/authService';
import { audioBus } from '../../services/audioBus';

/**
 * Zvukový pohled na knihovnu.
 *
 * Seznam souborů je pro samply špatný nástroj: u smyčky je podstatné
 * tempo, tónina a jak zní, ne datum a velikost. Tady se dá poslechnout
 * dřív, než se rozhodne, kam patří.
 */

interface Sample {
  id: string;
  nazev: string;
  kategorie: string;
  bpm: number;
  tonina: string;
  takt: string;
  balik: string;
  velikost: number;
}

const NASTROJE: { id: string; popis: string }[] = [
  { id: 'bicí', popis: 'Bicí' },
  { id: 'basa', popis: 'Basa' },
  { id: 'kytara', popis: 'Kytara' },
  { id: 'vokal', popis: 'Vokály' },
  { id: 'stopy', popis: 'Stopy' },
];

type Razeni = 'nazev' | 'bpm' | 'tonina' | 'takt';

export const PohledSamples: React.FC<{ jsemSpravce: boolean }> = ({ jsemSpravce }) => {
  const [nastroj, setNastroj] = useState('bicí');
  const [hledat, setHledat] = useState('');
  const [samply, setSamply] = useState<Sample[]>([]);
  const [nacitam, setNacitam] = useState(false);
  const [razeni, setRazeni] = useState<Razeni>('nazev');
  const [hraje, setHraje] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Blob adresy přehraných samplů — jinak by paměť rostla s každým klikem. */
  const blobyRef = useRef<string[]>([]);
  useEffect(() => () => {
    audioRef.current?.pause();
    blobyRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  useEffect(() => {
    let zruseno = false;
    const id = window.setTimeout(async () => {
      setNacitam(true);
      try {
        const token = authService.getCurrentSession()?.token;
        const res = await fetch(
          `/api/samples?nastroj=${encodeURIComponent(nastroj)}&search=${encodeURIComponent(hledat)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        const data = await res.json();
        if (!zruseno) setSamply(data?.samply || []);
      } catch {
        if (!zruseno) setSamply([]);
      } finally {
        if (!zruseno) setNacitam(false);
      }
    }, 250);
    return () => { zruseno = true; window.clearTimeout(id); };
  }, [nastroj, hledat]);

  const serazene = useMemo(() => {
    const kopie = [...samply];
    kopie.sort((a, b) => {
      if (razeni === 'bpm') return (b.bpm || 0) - (a.bpm || 0);
      // Prázdné údaje patří na konec: seznam začínající deseti pomlčkami
      // vypadá, jako by třídění nefungovalo.
      if (razeni === 'tonina' || razeni === 'takt') {
        const x = a[razeni] || '￿';
        const y = b[razeni] || '￿';
        return x.localeCompare(y, 'cs');
      }
      return a.nazev.localeCompare(b.nazev, 'cs');
    });
    return kopie;
  }, [samply, razeni]);

  const prehraj = async (s: Sample) => {
    if (hraje === s.id) {
      audioRef.current?.pause();
      audioBus.release(`sample-${s.id}`);
      setHraje(null);
      return;
    }
    setChyba(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const res = await fetch(`/api/assets/${s.id}/content`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      blobyRef.current.push(url);

      audioRef.current?.pause();
      const a = new Audio(url);
      audioRef.current = a;
      // Sample dohraje sám a bývá krátký — bez uvolnění by horní lišta
      // dál hlásila, že se něco přehrává.
      a.onended = () => {
        audioBus.release(`sample-${s.id}`);
        setHraje(null);
      };
      // Sample je zvuk jako každý jiný — když se pustí, ostatní zdroje mlčí.
      audioBus.claim(`sample-${s.id}`, s.nazev, 'Knihovna');
      await a.play();
      setHraje(s.id);
    } catch (e: any) {
      setChyba(`Přehrání selhalo: ${e?.message || e}`);
      setHraje(null);
    }
  };

  const smaz = async (s: Sample) => {
    if (!window.confirm(`Smazat „${s.nazev}" z knihovny?`)) return;
    const token = authService.getCurrentSession()?.token;
    const res = await fetch(`/api/assets/${s.id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) setSamply((p) => p.filter((x) => x.id !== s.id));
    else setChyba((await res.json().catch(() => ({})))?.error || 'Smazání selhalo.');
  };

  return (
    <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {NASTROJE.map((n) => (
          <button
            key={n.id}
            onClick={() => setNastroj(n.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              nastroj === n.id
                ? 'bg-[#0A84FF] text-white'
                : 'bg-white/[0.04] text-neutral-400 hover:text-white'
            }`}
          >
            {n.popis}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={hledat}
            onChange={(e) => setHledat(e.target.value)}
            placeholder="Hledat sample…"
            className="pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs w-48 focus:outline-none focus:border-[#0A84FF]"
          />
        </div>
        <select
          value={razeni}
          onChange={(e) => setRazeni(e.target.value as Razeni)}
          className="px-2 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-neutral-300 cursor-pointer"
        >
          <option value="nazev">Podle názvu</option>
          <option value="bpm">Podle tempa</option>
          <option value="tonina">Podle tóniny</option>
          <option value="takt">Podle taktu</option>
        </select>
      </div>

      {chyba && <div className="text-[11px] text-red-400">{chyba}</div>}

      {nacitam && <div className="text-xs text-neutral-500 py-4 text-center">Načítám…</div>}

      {!nacitam && serazene.length === 0 && (
        <div className="text-xs text-neutral-500 py-8 text-center">
          <Music4 className="w-6 h-6 mx-auto mb-2 opacity-40" />
          V kategorii zatím nic není. Nahraj sem soubory a pojmenuj je třeba
          <span className="font-mono text-neutral-400"> groove_120bpm_Am_4-4.wav</span> —
          tempo, tónina i takt se pak vyplní samy.
        </div>
      )}

      <div className="max-h-[52vh] overflow-y-auto divide-y divide-white/[0.04]">
        {serazene.map((s) => (
          <div key={s.id} className="flex items-center gap-3 py-2 group">
            <button
              onClick={() => prehraj(s)}
              className="p-2 rounded-lg bg-white/[0.06] hover:bg-[#0A84FF]/20 text-[#0A84FF] cursor-pointer shrink-0"
              title="Přehrát"
            >
              {hraje === s.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <span className="flex-1 truncate text-xs text-neutral-200">{s.nazev}</span>
            <span className="text-[10px] font-mono tabular-nums text-neutral-500 w-16 text-right">
              {s.bpm ? `${s.bpm} BPM` : ''}
            </span>
            <span className="text-[10px] font-mono text-neutral-500 w-10 text-right truncate">{s.tonina}</span>
            <span className="text-[10px] font-mono text-neutral-500 w-10 text-right truncate">{s.takt}</span>
            <span className="text-[10px] font-mono tabular-nums text-neutral-600 w-14 text-right">
              {(s.velikost / 1024 / 1024).toFixed(1)} MB
            </span>
            {jsemSpravce && (
              <button
                onClick={() => smaz(s)}
                className="p-1.5 rounded-lg text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Smazat z knihovny"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
