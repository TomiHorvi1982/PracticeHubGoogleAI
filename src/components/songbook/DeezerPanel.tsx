import React, { useState } from 'react';
import { Search, Loader2, Play, Pause, Plus, AlertCircle, Gauge, Disc3, X } from 'lucide-react';
import { authService } from '../../services/authService';

/**
 * Hledání skladby v katalogu Deezeru.
 *
 * Doplňuje to, co Last.fm neumí: přesnou délku, obal, ISRC a hlavně
 * tempo, které Deezer u části skladeb vede. Tempo je přitom první věc,
 * kterou při přípravě písně stejně musíš zjistit — z metronomu i ze
 * skládačky se podle něj vychází.
 *
 * Berou se jen údaje a třicetivteřinová ukázka, kterou Deezer sám
 * veřejně nabízí. Celé nahrávky ne: jsou licencované a stáhnout je
 * odsud by znamenalo obejít to, na čem služba stojí.
 */

interface Skladba {
  id: string;
  nazev: string;
  interpret: string;
  album: string;
  albumId: string;
  delka: number;
  obal: string;
  ukazka: string;
  isrc: string;
  bpm: number;
  rok: string;
}

const cas = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface StopaAlba {
  id: string;
  poradi: number;
  nazev: string;
  interpret: string;
  delka: number;
  ukazka: string;
}

interface Album {
  id: string;
  nazev: string;
  interpret: string;
  obal: string;
  rok: string;
  pocet: number;
  zdroj: string;
}

export const DeezerPanel: React.FC<{
  onPridat: (interpret: string, nazev: string, doplnky?: { bpm?: number }) => void | Promise<void>;
}> = ({ onPridat }) => {
  const [dotaz, setDotaz] = useState('');
  const [nalezene, setNalezene] = useState<Skladba[]>([]);
  const [hledam, setHledam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hraje, setHraje] = useState<string | null>(null);
  const [pridane, setPridane] = useState<Set<string>>(new Set());
  const [zvuk] = useState(() => new Audio());
  const [album, setAlbum] = useState<{ info: Album; stopy: StopaAlba[] } | null>(null);
  const [nacitamAlbum, setNacitamAlbum] = useState<string | null>(null);

  /**
   * Načte celé album, ze kterého nalezená skladba pochází.
   *
   * Písnička se skoro nikdy necvičí sama: na zkoušce se hraje pořadí
   * z alba, a dohledávat ho po jedné je zbytečná práce. Deezer u každé
   * stopy album vede, takže je to jeden dotaz navíc; když ho nezná,
   * doptá se MusicBrainzu, který má i vydání mimo streamovací služby.
   */
  const otevriAlbum = async (s: Skladba) => {
    if (album?.info.id === s.albumId) { setAlbum(null); return; }
    setNacitamAlbum(s.id);
    setChyba(null);
    const token = authService.getCurrentSession()?.token;
    const hlavicky = token ? { Authorization: `Bearer ${token}` } : undefined;
    try {
      let d: any = null;
      if (s.albumId) {
        const r = await fetch(`/api/album/deezer?id=${encodeURIComponent(s.albumId)}`, { headers: hlavicky });
        if (r.ok) d = await r.json();
      }
      if (!d) {
        const r = await fetch(
          `/api/album/musicbrainz?interpret=${encodeURIComponent(s.interpret)}&album=${encodeURIComponent(s.album)}`,
          { headers: hlavicky },
        );
        const z = await r.json();
        if (!r.ok) throw new Error(z?.error || 'Album se nepodařilo načíst.');
        d = z;
      }
      setAlbum({ info: d.album, stopy: d.skladby || [] });
    } catch (err: any) {
      setChyba(err?.message || 'Album se nepodařilo načíst.');
    } finally {
      setNacitamAlbum(null);
    }
  };

  const hledej = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dotaz.trim()) return;
    setHledam(true);
    setChyba(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const r = await fetch(`/api/deezer/hledat?q=${encodeURIComponent(dotaz.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Hledání selhalo.');
      setNalezene(d.skladby || []);
    } catch (err: any) {
      setChyba(err?.message || 'Deezer neodpověděl.');
      setNalezene([]);
    } finally {
      setHledam(false);
    }
  };

  /** Ukázku hraje jedna instance — jinak by se jich přes sebe navrstvilo. */
  const prehraj = (s: Skladba) => {
    if (hraje === s.id) {
      zvuk.pause();
      setHraje(null);
      return;
    }
    zvuk.src = s.ukazka;
    void zvuk.play().catch(() => setChyba('Ukázku se nepodařilo přehrát.'));
    zvuk.onended = () => setHraje(null);
    setHraje(s.id);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={hledej} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={dotaz}
            onChange={(e) => setDotaz(e.target.value)}
            placeholder="Interpret a název — třeba „Sepultura Refuse Resist“"
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-[13px] text-white placeholder-neutral-600 outline-none focus:border-[#FF9F0A]"
          />
        </div>
        <button
          type="submit"
          disabled={hledam || !dotaz.trim()}
          className="px-4 py-2 rounded-xl bg-[#FF9F0A] text-black text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
        >
          {hledam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Hledat
        </button>
      </form>

      {chyba && (
        <p className="text-[11px] text-[#FF453A] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
        </p>
      )}

      {nalezene.length === 0 && !hledam && (
        <p className="text-[11px] text-neutral-600">
          Najde název, interpreta, album, délku a u části skladeb i tempo. Poslechnout jde
          třicetivteřinová ukázka, kterou Deezer nabízí veřejně.
        </p>
      )}

      {album && (
        <div className="bg-black/40 border border-[#FF9F0A]/30 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2.5">
            {album.info.obal && (
              <img src={album.info.obal} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-white truncate">{album.info.nazev}</div>
              <div className="text-[10px] text-neutral-500 truncate">
                {album.info.interpret}
                {album.info.rok && ` · ${album.info.rok}`}
                {` · ${album.stopy.length} skladeb`}
                {album.info.zdroj === 'musicbrainz' && ' · z MusicBrainzu'}
              </div>
            </div>
            <button
              onClick={async () => {
                setChyba(null);
                for (const t of album.stopy) {
                  try {
                    await onPridat(t.interpret || album.info.interpret, t.nazev);
                    setPridane((p) => new Set(p).add(`al_${t.id}`));
                  } catch (err: any) {
                    setChyba(err?.message || 'Část alba se nepodařilo uložit.');
                    break;
                  }
                }
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[#30D158]/15 text-[#30D158] text-[10px] font-bold cursor-pointer flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3 h-3" /> celé album
            </button>
            <button
              onClick={() => setAlbum(null)}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-white cursor-pointer shrink-0"
              title="Zavřít album"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5 max-h-[36vh] overflow-y-auto pr-1">
            {album.stopy.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04]">
                <span className="text-[10px] text-neutral-600 tabular-nums w-6 shrink-0">{t.poradi}.</span>
                <span className="text-[12px] text-white truncate flex-1">{t.nazev}</span>
                {t.delka > 0 && (
                  <span className="text-[10px] text-neutral-600 tabular-nums shrink-0">{cas(t.delka)}</span>
                )}
                <button
                  onClick={async () => {
                    try {
                      await onPridat(t.interpret || album.info.interpret, t.nazev);
                      setPridane((p) => new Set(p).add(`al_${t.id}`));
                    } catch (err: any) {
                      setChyba(err?.message || 'Do knihovny se to nepodařilo uložit.');
                    }
                  }}
                  disabled={pridane.has(`al_${t.id}`)}
                  className="px-1.5 py-0.5 rounded bg-[#30D158]/15 text-[#30D158] text-[10px] font-bold cursor-pointer disabled:opacity-40 shrink-0"
                >
                  {pridane.has(`al_${t.id}`) ? '✓' : '+'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1 max-h-[52vh] overflow-y-auto pr-1">
        {nalezene.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/20"
          >
            {s.obal ? (
              <img src={s.obal} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-white/[0.06] shrink-0" />
            )}

            <button
              onClick={() => prehraj(s)}
              disabled={!s.ukazka}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white cursor-pointer disabled:opacity-25 shrink-0"
              title={s.ukazka ? 'Přehrát ukázku' : 'Ukázka není'}
            >
              {hraje === s.id ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-white truncate">{s.nazev}</div>
              <div className="text-[10px] text-neutral-500 truncate">
                {s.interpret}
                {s.album && ` · ${s.album}`}
                {s.rok && ` · ${s.rok}`}
              </div>
            </div>

            {s.bpm > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#30D158]/15 text-[#30D158] shrink-0 flex items-center gap-1"
                title="Tempo podle Deezeru — přenese se do písně"
              >
                <Gauge className="w-3 h-3" /> {s.bpm}
              </span>
            )}
            <span className="text-[10px] text-neutral-600 tabular-nums shrink-0">{cas(s.delka)}</span>

            <button
              onClick={() => void otevriAlbum(s)}
              disabled={nacitamAlbum === s.id}
              title={`Ukázat celé album „${s.album}"`}
              className="px-2 py-1 rounded-lg bg-white/[0.06] text-neutral-300 hover:text-white text-[10px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1 shrink-0"
            >
              {nacitamAlbum === s.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Disc3 className="w-3 h-3" />}
              album
            </button>

            <button
              onClick={async () => {
                // Odškrtne se až po uložení. Dřív to hlásilo „přidáno"
                // hned po kliknutí a po neúspěchu se to nedalo poznat.
                try {
                  await onPridat(s.interpret, s.nazev, s.bpm > 0 ? { bpm: s.bpm } : undefined);
                  setPridane((p) => new Set(p).add(s.id));
                } catch (err: any) {
                  setChyba(err?.message || 'Do knihovny se to nepodařilo uložit.');
                }
              }}
              disabled={pridane.has(s.id)}
              className="px-2 py-1 rounded-lg bg-[#30D158]/15 text-[#30D158] text-[10px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3 h-3" /> {pridane.has(s.id) ? 'přidáno' : 'do knihovny'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
