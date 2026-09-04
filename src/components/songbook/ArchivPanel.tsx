import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Download, AlertCircle, Check, Archive, ChevronLeft, Play, Pause, RotateCcw, RotateCw } from 'lucide-react';
import { authService } from '../../services/authService';

/**
 * Live Music Archive na Internet Archive.
 *
 * Zdroj nahrávek, které jde opravdu stáhnout: archiv soubory ke stažení
 * sám nabízí a sbírka `etree` obsahuje koncerty kapel, které nahrávání
 * a nekomerční šíření povolily. Přes 290 tisíc nahrávek.
 *
 * Licence se ukazuje u každé položky, i když uvedená není — je to
 * informace, podle které se člověk rozhoduje, a schovat ji by znamenalo
 * rozhodovat za něj.
 */

interface Nahravka {
  id: string;
  nazev: string;
  interpret: string;
  rok: string;
  licence: string;
  stazeni: number;
}

interface Stopa {
  soubor: string;
  nazev: string;
  poradi: number;
  delka: string;
  velikost: number;
}

const mb = (b: number) => `${Math.round((b / 1048576) * 10) / 10} MB`;

/** Čas jako mm:ss. Koncertní stopy mívají i přes dvacet minut. */
const cas = (v: number) => {
  if (!Number.isFinite(v) || v < 0) return '0:00';
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
};

export const ArchivPanel: React.FC<{ onStazeno?: () => void }> = ({ onStazeno }) => {
  const [dotaz, setDotaz] = useState('');
  const [nalezene, setNalezene] = useState<Nahravka[]>([]);
  const [celkem, setCelkem] = useState(0);
  const [hledam, setHledam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [otevrena, setOtevrena] = useState<{ nahravka: Nahravka; stopy: Stopa[] } | null>(null);
  const [nacitam, setNacitam] = useState(false);
  const [stahuje, setStahuje] = useState<string | null>(null);
  const [stazene, setStazene] = useState<Set<string>>(new Set());
  const [hraje, setHraje] = useState<string | null>(null);
  const [nacitaSe, setNacitaSe] = useState<string | null>(null);
  /** Kde v přehrávané stopě jsme, ve vteřinách. */
  const [kde, setKde] = useState(0);
  const [delka, setDelka] = useState(0);

  /**
   * Jeden přehrávač pro celý panel.
   *
   * Kdyby si každá stopa držela vlastní, hrály by přes sebe — a poslech
   * je tu na to, aby si člověk vybral, ne aby si pustil kapelu naráz.
   */
  const zvuk = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { zvuk.current?.pause(); }, []);

  /**
   * Adresa souboru v archivu.
   *
   * Archiv odpovídá přesměrováním na konkrétní server a umí částečné
   * stahování, takže jde i převíjet, ne jen přehrát od začátku.
   * Prohlížeč si obojí obstará sám.
   */
  const odkazNaStopu = (id: string, soubor: string) =>
    `https://archive.org/download/${encodeURIComponent(id)}/${soubor.split('/').map(encodeURIComponent).join('/')}`;

  /**
   * Skok o kus dopředu nebo dozadu.
   *
   * Koncertní nahrávka má i dvacet minut a proklikat ji po deseti
   * vteřinách je nejrychlejší způsob, jak zjistit, jestli stojí za
   * stažení. Meze se ořezávají, aby skok na konci nevyhodil chybu.
   */
  const skoc = (o: number) => {
    const a = zvuk.current;
    if (!a || !Number.isFinite(a.duration)) return;
    a.currentTime = Math.max(0, Math.min(a.duration - 0.2, a.currentTime + o));
    setKde(a.currentTime);
  };

  const prehraj = (stopa: Stopa) => {
    if (!otevrena) return;
    if (hraje === stopa.soubor) {
      zvuk.current?.pause();
      setHraje(null);
      return;
    }
    setKde(0);
    setDelka(0);

    if (!zvuk.current) zvuk.current = new Audio();
    const a = zvuk.current;
    a.pause();
    a.src = odkazNaStopu(otevrena.nahravka.id, stopa.soubor);
    a.onended = () => { setHraje(null); setKde(0); };
    a.ontimeupdate = () => setKde(a.currentTime);
    a.onloadedmetadata = () => setDelka(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => {
      setChyba(`„${stopa.nazev}" se nepodařilo přehrát.`);
      setNacitaSe(null);
      setHraje(null);
    };
    // Než se rozehraje, chvíli to trvá. Bez téhle značky vypadá kliknutí
    // bez odezvy a člověk mačká znovu.
    a.oncanplay = () => setNacitaSe(null);
    setNacitaSe(stopa.soubor);
    setChyba(null);
    void a.play()
      .then(() => setHraje(stopa.soubor))
      .catch((e) => {
        setChyba(e?.message || 'Přehrání selhalo.');
        setNacitaSe(null);
      });
  };

  const hlavicky = () => {
    const token = authService.getCurrentSession()?.token;
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  };

  const hledej = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dotaz.trim()) return;
    setHledam(true);
    setChyba(null);
    setOtevrena(null);
    try {
      const r = await fetch(`/api/archive/hledat?q=${encodeURIComponent(dotaz.trim())}`, { headers: hlavicky() });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Hledání selhalo.');
      setNalezene(d.polozky || []);
      setCelkem(d.celkem || 0);
    } catch (err: any) {
      setChyba(err?.message || 'Archiv neodpověděl.');
      setNalezene([]);
    } finally {
      setHledam(false);
    }
  };

  const otevri = async (n: Nahravka) => {
    setNacitam(true);
    setChyba(null);
    try {
      const r = await fetch(`/api/archive/polozka?id=${encodeURIComponent(n.id)}`, { headers: hlavicky() });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Nahrávku se nepodařilo otevřít.');
      setOtevrena({ nahravka: { ...n, licence: d.nahravka?.licence || n.licence }, stopy: d.stopy || [] });
    } catch (err: any) {
      setChyba(err?.message || 'Archiv neodpověděl.');
    } finally {
      setNacitam(false);
    }
  };

  const stahni = async (s: Stopa) => {
    if (!otevrena || stahuje) return;
    setStahuje(s.soubor);
    setChyba(null);
    try {
      const r = await fetch('/api/archive/stahni', {
        method: 'POST',
        headers: hlavicky(),
        body: JSON.stringify({
          id: otevrena.nahravka.id,
          soubor: s.soubor,
          nazev: s.nazev,
          interpret: otevrena.nahravka.interpret,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Stažení selhalo.');
      setStazene((p) => new Set(p).add(s.soubor));
      onStazeno?.();
    } catch (err: any) {
      setChyba(err?.message || 'Stažení selhalo.');
    } finally {
      setStahuje(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-drobne text-neutral-500 leading-relaxed">
        Koncertní nahrávky kapel, které nahrávání a nekomerční šíření samy povolily. Archiv je
        nabízí ke stažení, takže si je můžeš uložit i do zkušebny bez signálu.
      </p>

      <form onSubmit={hledej} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={dotaz}
            onChange={(e) => setDotaz(e.target.value)}
            placeholder="Kapela, místo nebo datum — třeba „Grateful Dead 1977“"
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-drobne text-white placeholder-neutral-600 outline-none focus:border-uspech"
          />
        </div>
        <button
          type="submit"
          disabled={hledam || !dotaz.trim()}
          className="px-4 py-2 rounded-xl bg-uspech text-black text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
        >
          {hledam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Hledat
        </button>
      </form>

      {chyba && (
        <p className="text-drobne text-chyba flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
        </p>
      )}

      {otevrena ? (
        <div className="space-y-2">
          <button
            onClick={() => setOtevrena(null)}
            className="text-drobne text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> zpět na výsledky
          </button>

          <div className="bg-black/40 border border-uspech/25 rounded-2xl p-3">
            <div className="text-drobne font-bold text-white">{otevrena.nahravka.nazev}</div>
            <div className="text-stitek text-neutral-500">
              {otevrena.nahravka.interpret}
              {otevrena.nahravka.rok && ` · ${otevrena.nahravka.rok}`}
              {` · ${otevrena.stopy.length} skladeb`}
            </div>
            <div className="text-stitek mt-1">
              {otevrena.nahravka.licence ? (
                <a
                  href={otevrena.nahravka.licence}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-uspech hover:underline"
                >
                  licence: {otevrena.nahravka.licence.replace(/^https?:\/\//, '')}
                </a>
              ) : (
                <span className="text-amber-500/80">
                  licence u téhle nahrávky uvedená není — kapela šíření povolila přijetím do sbírky,
                  ale konkrétní podmínky u položky nestojí
                </span>
              )}
            </div>
          </div>

          <p className="text-stitek text-neutral-600">
            Poslechem se nic nestahuje — zvuk jde rovnou z archivu. Do knihovny se uloží až
            tlačítkem vpravo.
          </p>

          <div className="space-y-0.5 max-h-[42vh] overflow-y-auto pr-1">
            {otevrena.stopy.map((s) => (
              <div key={s.soubor} className={`rounded-lg ${hraje === s.soubor ? 'bg-white/[0.05]' : 'hover:bg-white/[0.04]'}`}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="text-stitek text-neutral-600 tabular-nums w-6 shrink-0">{s.poradi || '·'}.</span>
                <button
                  onClick={() => prehraj(s)}
                  className="p-1 rounded text-neutral-400 hover:text-white cursor-pointer shrink-0"
                  title={hraje === s.soubor ? 'Zastavit' : 'Poslechnout bez stahování'}
                >
                  {nacitaSe === s.soubor ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : hraje === s.soubor ? <Pause className="w-3.5 h-3.5 fill-current" />
                    : <Play className="w-3.5 h-3.5 fill-current" />}
                </button>
                <span className={`text-drobne truncate flex-1 ${
                  hraje === s.soubor ? 'text-uspech font-semibold' : 'text-white'
                }`}>{s.nazev}</span>
                <span className="text-stitek text-neutral-600 tabular-nums shrink-0">{mb(s.velikost)}</span>
                <button
                  onClick={() => void stahni(s)}
                  disabled={stahuje === s.soubor || stazene.has(s.soubor)}
                  className="px-1.5 py-0.5 rounded bg-uspech/15 text-uspech text-stitek font-bold cursor-pointer disabled:opacity-40 shrink-0 flex items-center gap-1"
                  title="Stáhnout do knihovny"
                >
                  {stahuje === s.soubor ? <Loader2 className="w-3 h-3 animate-spin" />
                    : stazene.has(s.soubor) ? <Check className="w-3 h-3" />
                    : <Download className="w-3 h-3" />}
                </button>
                </div>

                {/* Ovládání jen u té stopy, která zrovna hraje.
                    U všech naráz by to byl les posuvníků, ze kterého
                    není poznat, který k čemu patří. */}
                {hraje === s.soubor && (
                  <div className="flex items-center gap-2 px-2 pb-1.5">
                    <button
                      onClick={() => skoc(-10)}
                      className="p-1 rounded text-neutral-400 hover:text-white cursor-pointer shrink-0"
                      title="O 10 vteřin zpět"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => skoc(10)}
                      className="p-1 rounded text-neutral-400 hover:text-white cursor-pointer shrink-0"
                      title="O 10 vteřin vpřed"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>

                    <span className="text-stitek text-neutral-500 tabular-nums shrink-0 w-9">
                      {cas(kde)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, delka)}
                      step={0.5}
                      value={Math.min(kde, delka || 1)}
                      onChange={(e) => {
                        const a = zvuk.current;
                        if (!a) return;
                        a.currentTime = Number(e.target.value);
                        setKde(a.currentTime);
                      }}
                      className="flex-1 accent-uspech cursor-pointer"
                    />
                    <span className="text-stitek text-neutral-500 tabular-nums shrink-0 w-9">
                      {cas(delka)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {celkem > 0 && (
            <p className="text-stitek text-neutral-600">
              {celkem.toLocaleString('cs')} nahrávek, ukazuje se {nalezene.length} nejstahovanějších
            </p>
          )}
          <div className="space-y-1 max-h-[52vh] overflow-y-auto pr-1">
            {nalezene.map((n) => (
              <button
                key={n.id}
                onClick={() => void otevri(n)}
                disabled={nacitam}
                className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/20 cursor-pointer disabled:opacity-50"
              >
                <Archive className="w-4 h-4 text-uspech shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-drobne text-white truncate">{n.nazev}</div>
                  <div className="text-stitek text-neutral-500 truncate">
                    {n.interpret}
                    {n.rok && ` · ${n.rok}`}
                    {n.licence && ' · s licencí'}
                  </div>
                </div>
                {nacitam ? <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500 shrink-0" /> : null}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
