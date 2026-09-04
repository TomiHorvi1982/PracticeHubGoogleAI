import React, { useCallback, useEffect, useState } from 'react';
import {
  Search, Loader2, Plus, Sparkles, AlertCircle, Users, Play, TrendingUp, Tag, Disc3,
  ArrowLeft, Globe, MapPin,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { MiniPrehravac } from './MiniPrehravac';

interface Skladba {
  nazev: string;
  interpret: string;
  posluchacu?: number;
  shoda?: number;
  obrazek: string | null;
}

interface Album {
  nazev: string;
  interpret: string;
  obrazek: string | null;
  poslechu: number;
}

interface Interpret {
  jmeno: string;
  posluchacu: number;
  popis: string;
  styly: string[];
  obrazek: string | null;
  skladby: Skladba[];
  alba: Album[];
}

interface Props {
  onPridat: (interpret: string, nazev: string) => void;
}

async function ptejSe(cesta: string): Promise<any> {
  const token = authService.getCurrentSession()?.token;
  const res = await fetch(cesta, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(d?.error || `Server vrátil ${res.status}`), { chybiKlic: d?.chybiKlic });
  }
  return d;
}

type Rezim = 'hledani' | 'zebricky' | 'styly';

/**
 * Žebříčky a styly přežijí zavření panelu.
 *
 * Přepnutí na Media Center a zpátky panel odpojí a připojí znovu; bez téhle
 * paměti by to znamenalo nové volání Last.fm pokaždé. Denní žebříček se
 * během jedné zkoušky nezmění.
 */
let pametZebricku: { svet: Skladba[]; cesko: Skladba[] } | null = null;
let pametStylu: { nazev: string; pouziti: number }[] = [];

/**
 * Průzkumník Last.fm.
 *
 * Data jsou celá z Last.fm — žebříčky, styly, životopisy, tracklisty alb.
 * Zvuk ne: Last.fm žádný nehostuje a ukázky z API zrušil. Poslech se proto
 * dohledá na YouTube podle interpreta a názvu a hraje se bez obrazu, aby
 * to bylo poslechem, ne dalším videem na stránce.
 *
 * Playlisty z jejich API zmizely taky. Nejblíž jim jsou tracklisty alb —
 * skladby v pořadí, jak jdou za sebou.
 */
export const LastFmPanel: React.FC<Props> = ({ onPridat }) => {
  const [rezim, setRezim] = useState<Rezim>('zebricky');
  const [dotaz, setDotaz] = useState('');
  const [vysledky, setVysledky] = useState<Skladba[]>([]);
  const [podobne, setPodobne] = useState<Skladba[]>([]);
  const [zdrojPodobnych, setZdrojPodobnych] = useState('');
  const [vybrana, setVybrana] = useState<Skladba | null>(null);

  const [zebricky, setZebricky] = useState<{ svet: Skladba[]; cesko: Skladba[] } | null>(pametZebricku);
  const [kdeZebricek, setKdeZebricek] = useState<'svet' | 'cesko'>('cesko');
  const [styly, setStyly] = useState<{ nazev: string; pouziti: number }[]>(pametStylu);
  const [vybranyStyl, setVybranyStyl] = useState<string | null>(null);
  const [skladbyStylu, setSkladbyStylu] = useState<Skladba[]>([]);

  const [interpret, setInterpret] = useState<Interpret | null>(null);
  const [album, setAlbum] = useState<{ nazev: string; interpret: string; obrazek: string | null; skladby: Skladba[] } | null>(null);

  const [hledam, setHledam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [chybiKlic, setChybiKlic] = useState(false);
  const [ukazka, setUkazka] = useState<{ videoId: string; nazev: string } | null>(null);
  const [hledamVideo, setHledamVideo] = useState<string | null>(null);

  const nahlas = (e: any, zaloha: string) => {
    setChybiKlic(Boolean(e?.chybiKlic));
    setChyba(e?.message || zaloha);
  };

  // Žebříčky a styly se natáhnou hned — panel se otevírá právě proto, aby
  // bylo co objevovat. Prázdná plocha s výzvou „něco napiš" by to popřela.
  //
  // Čeká se ale na přihlášení: obnovení sezení ze Supabase je asynchronní,
  // takže při načtení stránky ještě token být nemusí a server by odpověděl
  // „Chybí přihlašovací token" na dotaz, který nikdo nepoložil.
  useEffect(() => {
    if (pametZebricku) return;
    let nacteno = false;
    return authService.subscribe((sezeni) => {
      if (!sezeni?.token || nacteno) return;
      nacteno = true;
      void ptejSe('/api/lastfm/zebricky')
        .then((d) => {
          pametZebricku = d;
          setZebricky(d);
        })
        .catch((e) => nahlas(e, 'Žebříčky se nenačetly.'));
      void ptejSe('/api/lastfm/styly')
        .then((d) => {
          pametStylu = d.styly || [];
          setStyly(pametStylu);
        })
        .catch(() => {
          /* styly jsou doplněk, chybu hlásí už žebříčky */
        });
    });
  }, []);

  const hledej = useCallback(async () => {
    const q = dotaz.trim();
    if (!q) return;
    setRezim('hledani');
    setHledam(true);
    setChyba(null);
    setPodobne([]);
    setVybrana(null);
    setInterpret(null);
    setAlbum(null);
    try {
      const d = await ptejSe(`/api/lastfm/search?q=${encodeURIComponent(q)}`);
      setVysledky(d.skladby || []);
      if ((d.skladby || []).length === 0) setChyba('Nic se nenašlo.');
    } catch (e: any) {
      nahlas(e, 'Hledání selhalo.');
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

  const otevriInterpreta = async (jmeno: string) => {
    setAlbum(null);
    setInterpret(null);
    setChyba(null);
    try {
      setInterpret(await ptejSe(`/api/lastfm/interpret?name=${encodeURIComponent(jmeno)}`));
    } catch (e: any) {
      nahlas(e, 'Interpret se nenačetl.');
    }
  };

  const otevriAlbum = async (a: Album) => {
    setChyba(null);
    try {
      setAlbum(
        await ptejSe(
          `/api/lastfm/album?artist=${encodeURIComponent(a.interpret)}&album=${encodeURIComponent(a.nazev)}`
        )
      );
    } catch (e: any) {
      nahlas(e, 'Album se nenačetlo.');
    }
  };

  const otevriStyl = async (tag: string) => {
    setVybranyStyl(tag);
    setSkladbyStylu([]);
    try {
      const d = await ptejSe(`/api/lastfm/styl?tag=${encodeURIComponent(tag)}`);
      setSkladbyStylu(d.skladby || []);
    } catch (e: any) {
      nahlas(e, 'Styl se nenačetl.');
    }
  };

  /**
   * Pustí skladbu.
   *
   * Last.fm zvuk nemá, takže se poslech dohledá na YouTube — stejnou cestou,
   * jakou si appka shání videa k písním v knihovně.
   */
  const pust = async (s: Skladba) => {
    const klic = `${s.interpret}-${s.nazev}`;
    setHledamVideo(klic);
    setChyba(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const res = await fetch('/api/search-youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: s.nazev, artist: s.interpret }),
      });
      const d = await res.json().catch(() => ({}));
      const video = (d.videos || [])[0];
      const id = video?.id || (video?.url || '').match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1];
      if (!id) {
        setChyba(`K „${s.nazev}" se nenašel žádný poslech.`);
        return;
      }
      setUkazka({ videoId: id, nazev: `${s.interpret} — ${s.nazev}` });
    } catch {
      setChyba('Nepodařilo se dohledat poslech.');
    } finally {
      setHledamVideo(null);
    }
  };

  const radek = (s: Skladba, i: number, poradi?: number) => (
    <div
      key={`${s.interpret}-${s.nazev}-${i}`}
      className="flex items-center gap-2 bg-black/30 border border-white/[0.06] rounded-xl px-2.5 py-1.5 hover:border-white/20 transition-all"
    >
      {typeof poradi === 'number' ? (
        <span className="w-5 text-center text-stitek font-mono text-neutral-600 shrink-0 tabular-nums">
          {poradi}
        </span>
      ) : s.obrazek ? (
        <img src={s.obrazek} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-md bg-white/5 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <button
          onClick={() => void ukazPodobne(s)}
          className="block w-full text-left text-drobne font-semibold text-white truncate cursor-pointer hover:text-znacka"
          title="Ukázat podobné"
        >
          {s.nazev || s.interpret}
        </button>
        <div className="text-stitek text-neutral-500 truncate">
          <button
            onClick={() => void otevriInterpreta(s.interpret)}
            className="cursor-pointer hover:text-znacka hover:underline"
            title="Otevřít interpreta"
          >
            {s.interpret || 'interpret'}
          </button>
          {typeof s.posluchacu === 'number' && s.posluchacu > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" /> {s.posluchacu.toLocaleString('cs')}
            </span>
          )}
          {typeof s.shoda === 'number' && s.shoda > 0 && (
            <span className="ml-1.5 text-znacka">shoda {Math.round(s.shoda * 100)} %</span>
          )}
        </div>
      </div>

      {s.nazev && (
        <>
          <button
            onClick={() => void pust(s)}
            disabled={hledamVideo !== null}
            className="p-1.5 rounded-lg bg-chyba/15 hover:bg-chyba/30 text-chyba cursor-pointer shrink-0 transition-all disabled:opacity-40 disabled:cursor-wait"
            title="Poslechnout"
          >
            {hledamVideo === `${s.interpret}-${s.nazev}` ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>
          <button
            onClick={() => onPridat(s.interpret, s.nazev)}
            className="p-1.5 rounded-lg bg-uspech/15 hover:bg-uspech/30 text-uspech cursor-pointer shrink-0 transition-all"
            title="Přidat do knihovny — materiály se dohledají samy"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );

  const mrizka = (skladby: Skladba[], cislovat = false) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-[34vh] overflow-y-auto pr-1">
      {skladby.map((s, i) => radek(s, i, cislovat ? i + 1 : undefined))}
    </div>
  );

  const zpet = (kam: () => void, popis: string) => (
    <button
      onClick={kam}
      className="flex items-center gap-1 text-drobne text-neutral-400 hover:text-white cursor-pointer"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> {popis}
    </button>
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
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-drobne text-white placeholder-neutral-500 outline-none focus:border-znacka"
          />
        </div>
        <button
          onClick={() => void hledej()}
          disabled={hledam || !dotaz.trim()}
          className="px-4 py-2 bg-znacka hover:bg-znacka/90 text-black text-xs font-bold rounded-xl cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          {hledam ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hledat'}
        </button>
      </div>

      {/* Poslech je jeden pro celý panel a bez obrazu — o hudbu tu jde,
          ne o video. */}
      {ukazka && (
        <div className="max-w-sm">
          <MiniPrehravac
            key={ukazka.videoId}
            videoId={ukazka.videoId}
            nazev={ukazka.nazev}
            zdroj="Last.fm"
            onZavrit={() => setUkazka(null)}
          />
        </div>
      )}

      {chyba && (
        <div className="flex items-start gap-2 text-drobne text-chyba bg-chyba/10 border border-chyba/30 rounded-xl px-3 py-2">
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

      {/* Album má přednost před vším ostatním — je to nejhlubší úroveň. */}
      {album ? (
        <div className="space-y-2">
          {zpet(() => setAlbum(null), interpret ? `Zpět na ${interpret.jmeno}` : 'Zpět')}
          <div className="flex items-center gap-3">
            {album.obrazek && (
              <img src={album.obrazek} alt="" className="w-16 h-16 rounded-xl object-cover" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{album.nazev}</div>
              <div className="text-drobne text-neutral-500 truncate">{album.interpret}</div>
              <div className="text-stitek text-neutral-600">{album.skladby.length} skladeb</div>
            </div>
          </div>
          {mrizka(album.skladby, true)}
        </div>
      ) : interpret ? (
        <div className="space-y-2">
          {zpet(() => setInterpret(null), 'Zpět')}
          <div className="flex items-start gap-3">
            {interpret.obrazek ? (
              <img src={interpret.obrazek} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{interpret.jmeno}</div>
              {interpret.posluchacu > 0 && (
                <div className="text-stitek text-neutral-500">
                  {interpret.posluchacu.toLocaleString('cs')} posluchačů
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-1">
                {interpret.styly.slice(0, 6).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setInterpret(null);
                      setRezim('styly');
                      void otevriStyl(t);
                    }}
                    className="text-stitek px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400 hover:text-znacka cursor-pointer"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {interpret.popis && (
            <p className="text-drobne text-neutral-400 leading-relaxed line-clamp-4">{interpret.popis}</p>
          )}

          {interpret.alba.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-stitek font-bold uppercase tracking-wider text-neutral-500">
                <Disc3 className="w-3 h-3" /> Alba
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {interpret.alba.map((a) => (
                  <button
                    key={a.nazev}
                    onClick={() => void otevriAlbum(a)}
                    className="shrink-0 w-24 text-left cursor-pointer group"
                    title="Ukázat skladby alba"
                  >
                    {a.obrazek ? (
                      <img
                        src={a.obrazek}
                        alt=""
                        className="w-24 h-24 rounded-lg object-cover border border-white/10 group-hover:border-znacka/60"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-lg bg-white/5 border border-white/10" />
                    )}
                    <div className="text-stitek text-neutral-300 truncate mt-1 group-hover:text-znacka">
                      {a.nazev}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-stitek font-bold uppercase tracking-wider text-neutral-500">
              Nejposlouchanější
            </div>
            {mrizka(interpret.skladby, true)}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1">
            {([
              { id: 'zebricky', popis: 'Žebříčky', ikona: TrendingUp },
              { id: 'styly', popis: 'Styly', ikona: Tag },
              { id: 'hledani', popis: 'Hledání', ikona: Search },
            ] as const).map((z) => {
              const Ikona = z.ikona;
              return (
                <button
                  key={z.id}
                  onClick={() => setRezim(z.id)}
                  className={`px-2.5 py-1 rounded-lg text-stitek font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    rezim === z.id
                      ? 'bg-znacka/20 text-znacka border border-znacka/40'
                      : 'text-neutral-500 hover:text-white border border-transparent'
                  }`}
                >
                  <Ikona className="w-3 h-3" /> {z.popis}
                </button>
              );
            })}
          </div>

          {rezim === 'zebricky' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                {([
                  { id: 'cesko', popis: 'Česko', ikona: MapPin },
                  { id: 'svet', popis: 'Svět', ikona: Globe },
                ] as const).map((k) => {
                  const Ikona = k.ikona;
                  return (
                    <button
                      key={k.id}
                      onClick={() => setKdeZebricek(k.id)}
                      className={`px-2 py-0.5 rounded-md text-stitek font-semibold flex items-center gap-1 cursor-pointer ${
                        kdeZebricek === k.id
                          ? 'bg-white/[0.12] text-white'
                          : 'text-neutral-500 hover:text-white'
                      }`}
                    >
                      <Ikona className="w-2.5 h-2.5" /> {k.popis}
                    </button>
                  );
                })}
              </div>
              {!zebricky ? (
                <p className="text-drobne text-neutral-600 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Načítám žebříčky z Last.fm…
                </p>
              ) : (
                mrizka(zebricky[kdeZebricek], true)
              )}
            </div>
          )}

          {rezim === 'styly' && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {styly.map((t) => (
                  <button
                    key={t.nazev}
                    onClick={() => void otevriStyl(t.nazev)}
                    className={`px-2 py-0.5 rounded-lg text-stitek font-semibold cursor-pointer transition-all ${
                      vybranyStyl === t.nazev
                        ? 'bg-znacka text-black'
                        : 'bg-white/[0.06] text-neutral-300 hover:bg-white/[0.14]'
                    }`}
                  >
                    {t.nazev}
                  </button>
                ))}
              </div>
              {vybranyStyl ? (
                skladbyStylu.length ? (
                  mrizka(skladbyStylu, true)
                ) : (
                  <p className="text-drobne text-neutral-600 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Načítám {vybranyStyl}…
                  </p>
                )
              ) : (
                <p className="text-drobne text-neutral-600">Vyber styl a Last.fm ukáže, co se v něm poslouchá.</p>
              )}
            </div>
          )}

          {rezim === 'hledani' && (
            <>
              {vysledky.length > 0 ? (
                mrizka(vysledky)
              ) : (
                <p className="text-drobne text-neutral-600">Napiš nahoru skladbu nebo kapelu.</p>
              )}
            </>
          )}

          {vybrana && (
            <div className="space-y-1.5 border-t border-white/[0.06] pt-2.5">
              <div className="flex items-center gap-1.5 text-drobne text-neutral-400">
                <Sparkles className="w-3.5 h-3.5 text-znacka" />
                Podobné k{' '}
                <strong className="text-white">
                  {vybrana.interpret} — {vybrana.nazev}
                </strong>
                {zdrojPodobnych === 'interpret' && (
                  <span className="text-neutral-600">
                    (Last.fm nezná tuhle skladbu, tak nabízí podobné interprety)
                  </span>
                )}
              </div>
              {podobne.length === 0 ? (
                <p className="text-drobne text-neutral-600">Last.fm k téhle skladbě nic nezná.</p>
              ) : (
                mrizka(podobne)
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
