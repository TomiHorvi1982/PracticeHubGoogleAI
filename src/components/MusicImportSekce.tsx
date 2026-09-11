import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronDown, ChevronRight, Disc, Download, ExternalLink, FileAudio, ListMusic, Loader2,
  LogIn, LogOut, RotateCcw, Search, Square, TriangleAlert, User, X,
} from 'lucide-react';
import type { Song } from '../types';
import { songDatabaseService } from '../services/songDatabaseService';
import { assetLibraryService } from '../services/assetLibraryService';
import { authService } from '../services/authService';
import { rozeberOdkaz, vypadaJakoOdkaz } from '../services/musicImport/spotifyOdkaz';
import {
  NahledInterpreta, NahledKolekce, NahledSkladby, POPIS_VYNECHANI,
} from '../services/musicImport/normalizace';
import { musicImportApi } from '../services/musicImport/musicImportApi';
import { adresaBezLocalhostu, spotifyPrihlaseni } from '../services/musicImport/spotifyPrihlaseni';
import {
  PolozkaImportu, Rozhodnuti, importuj, pripravPolozky, souhrn, zopakujNeuspesne,
} from '../services/musicImport/importWorkflow';
import { KnihovnaProvider, VlastniSouborProvider, jeZvukovySoubor } from '../services/musicImport/audioZdroje';
import { POPIS_SHODY, najdiDuplicitu } from '../services/musicImport/duplicity';
import { ImportChyba, PopisChyby, ZPRAVY, popisChyby } from '../services/musicImport/chyby';

/**
 * Music Import.
 *
 * Metadata skladeb ze Spotify do zpěvníku: odkaz na skladbu, album,
 * playlist nebo interpreta, náhled, výběr, import. Inspirované postupem
 * spotDL (URL → metadata → seznam → zpracování), ale bez jeho hlavní
 * části — spotDL stahuje zvuk z YouTube, a to tady není. Zvuk se ke
 * skladbě připojí jen z knihovny nebo ze souboru, který uživatel sám
 * vybere. Jinak se píseň založí bez něj a řekne se to.
 *
 * Stav sekce přežije přepnutí jinam, protože sekce zůstávají připojené
 * (`ZiveSekce`) — rozdělaný výběr z playlistu se nemusí dělat znovu.
 */

interface Props {
  /** Otevře existující píseň ve zpěvníku. */
  onOtevritPisen: (song: Song) => void;
}

const DRUH: Record<string, string> = {
  track: 'Skladba',
  album: 'Album',
  playlist: 'Playlist',
  artist: 'Interpret',
};

function delka(vterin: number): string {
  const v = Math.max(0, Math.round(vterin));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/** Technický záznam do konzole — pro ladění, ne do okna. */
function zaloguj(c: PopisChyby): void {
  if (c.kod !== 'CANCELLED') console.warn(`[music-import] ${c.kod}: ${c.technicky}`);
}

/** Obal s náhradou, když se nenačte (ARTWORK_UNAVAILABLE). */
const Obal: React.FC<{ url: string | null; velikost: string; kulate?: boolean }> = ({ url, velikost, kulate }) => {
  const [chyba, setChyba] = useState(false);
  const tvar = kulate ? 'rounded-full' : 'rounded-prvek';
  if (!url || chyba) {
    return (
      <div
        className={`${velikost} ${tvar} bg-plocha-3 border border-kresba flex items-center justify-center shrink-0 text-pismo-slaby`}
        title={url ? ZPRAVY.ARTWORK_UNAVAILABLE : undefined}
      >
        {kulate ? <User className="w-1/2 h-1/2" /> : <Disc className="w-1/2 h-1/2" />}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setChyba(true)}
      className={`${velikost} ${tvar} object-cover shrink-0 border border-kresba`}
    />
  );
};

/** Hláška s technickým detailem na rozkliknutí a případně s „zkusit znovu". */
const PanelChyby: React.FC<{ chyba: PopisChyby; onZnovu?: () => void }> = ({ chyba, onZnovu }) => {
  const [detail, setDetail] = useState(false);
  return (
    <div className="flex items-start gap-2 text-drobne text-chyba bg-chyba/10 border border-chyba/30 rounded-panel p-3">
      <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="grow space-y-1 min-w-0">
        <p>{chyba.zprava}</p>
        {chyba.technicky && (
          <button
            onClick={() => setDetail((d) => !d)}
            className="flex items-center gap-1 text-stitek text-pismo-slaby hover:text-pismo cursor-pointer"
          >
            {detail ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            technický detail ({chyba.kod})
          </button>
        )}
        {detail && (
          <pre className="text-stitek font-mono text-pismo-tlum whitespace-pre-wrap break-all">{chyba.technicky}</pre>
        )}
      </div>
      {onZnovu && chyba.opakovat && (
        <button
          onClick={onZnovu}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />Zkusit znovu
        </button>
      )}
    </div>
  );
};

export const MusicImportSekce: React.FC<Props> = ({ onOtevritPisen }) => {
  const [vstup, setVstup] = useState('');
  const [nastaveno, setNastaveno] = useState<boolean | null>(null);
  const [vAplikaci, setVAplikaci] = useState(authService.isAuthenticated());
  const [spotifyUcet, setSpotifyUcet] = useState(spotifyPrihlaseni.prihlasen());
  const [prihlasuje, setPrihlasuje] = useState(false);

  const [nacita, setNacita] = useState(false);
  const [chyba, setChyba] = useState<PopisChyby | null>(null);
  const [kolekce, setKolekce] = useState<NahledKolekce | null>(null);
  const [upozorneni, setUpozorneni] = useState<{ kod: string; zprava: string } | null>(null);
  const [interpret, setInterpret] = useState<NahledInterpreta | null>(null);

  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const [rozhodnuti, setRozhodnuti] = useState<Record<string, Rozhodnuti>>({});
  const [soubory, setSoubory] = useState<Map<string, File>>(new Map());
  const [chybaSouboru, setChybaSouboru] = useState<Record<string, string>>({});
  const [jenSeZvukem, setJenSeZvukem] = useState(false);

  const [polozky, setPolozky] = useState<PolozkaImportu[] | null>(null);
  const [importuje, setImportuje] = useState(false);
  const [pisne, setPisne] = useState<Song[]>(() => songDatabaseService.getSongs());

  /*
   * Adresa bez localhostu, pokud tu je potřeba.
   *
   * Spotify nepřijme přihlášení s návratem na `localhost`. Týká se to jen
   * přihlášení k vlastním playlistům — skladby, alba a hledání jdou přes
   * server a adresa jim nevadí. Ukazuje se to hned, ne až po kliknutí,
   * protože s tou adresou se zakládá i aplikace ve Spotify dashboardu.
   */
  const jinaAdresa = useMemo(
    () => (typeof window !== 'undefined' ? adresaBezLocalhostu(window.location.href) : null),
    [],
  );

  const ctrlNacteni = useRef<AbortController | null>(null);
  const ctrlImportu = useRef<AbortController | null>(null);
  const posledni = useRef<string>('');

  useEffect(() => songDatabaseService.subscribe(setPisne), []);
  useEffect(() => authService.subscribe((s: unknown) => setVAplikaci(!!s)), []);
  useEffect(() => spotifyPrihlaseni.subscribe(() => setSpotifyUcet(spotifyPrihlaseni.prihlasen())), []);

  // Je import na serveru nastavený? Bez přihlášení do aplikace se to nezjistí.
  useEffect(() => {
    if (!vAplikaci) return;
    let platne = true;
    musicImportApi.stav()
      .then((d) => { if (platne) setNastaveno(d.nastaveno); })
      .catch(() => { if (platne) setNastaveno(null); });
    return () => { platne = false; };
  }, [vAplikaci]);

  /* ------------------------------------------------------ Rozpoznání */

  const rozpoznano = useMemo(() => {
    const t = vstup.trim();
    if (!t) return null;
    if (!vypadaJakoOdkaz(t)) return { popis: 'Hledání', ok: true, hledani: true };
    const r = rozeberOdkaz(t);
    if (r.stav === 'ok') return { popis: DRUH[r.odkaz.druh], ok: true, hledani: false };
    if (r.stav === 'kratky') return { popis: 'Zkrácený odkaz', ok: true, hledani: false };
    return { popis: r.kod === 'UNSUPPORTED_SOURCE' ? 'Nepodporováno' : 'Neplatný odkaz', ok: false, hledani: false };
  }, [vstup]);

  /* ------------------------------------------------------ Načtení */

  const nastavKolekci = (k: NahledKolekce) => {
    setKolekce(k);
    setInterpret(null);
    setPolozky(null);
    setRozhodnuti({});
    setSoubory(new Map());
    setChybaSouboru({});
    // Předvybere se všechno, co ve zpěvníku ještě není.
    const aktualni = songDatabaseService.getSongs();
    setVybrane(new Set(
      k.skladby
        .filter((s) => !najdiDuplicitu({ sourceId: s.sourceId, isrc: s.isrc, title: s.title, artist: s.artist }, aktualni))
        .map((s) => s.sourceId),
    ));
  };

  const nacti = async (text = vstup) => {
    const t = text.trim();
    ctrlNacteni.current?.abort();
    const ctrl = new AbortController();
    ctrlNacteni.current = ctrl;
    posledni.current = t;
    setNacita(true);
    setChyba(null);
    setUpozorneni(null);

    try {
      if (!t) throw new ImportChyba('INVALID_URL', 'prázdný vstup', 'Vlož odkaz ze Spotify, nebo napiš, co hledáš.');
      if (vypadaJakoOdkaz(t)) {
        // Rozbitý odkaz se ohlásí hned, bez cesty na server.
        const r = rozeberOdkaz(t);
        if (r.stav === 'chyba') throw new ImportChyba(r.kod, r.detail);
        const token = r.stav === 'ok' && r.odkaz.druh === 'playlist' ? await spotifyPrihlaseni.platnyToken() : null;
        const v = await musicImportApi.nahled(t, token, ctrl.signal);
        if (ctrlNacteni.current !== ctrl) return;
        if (v.druh === 'interpret') {
          setInterpret(v.interpret);
          setKolekce(null);
          setPolozky(null);
        } else {
          nastavKolekci(v.kolekce);
          setUpozorneni(v.upozorneni ?? null);
        }
      } else {
        const k = await musicImportApi.hledej(t, ctrl.signal);
        if (ctrlNacteni.current !== ctrl) return;
        nastavKolekci(k);
      }
    } catch (e) {
      // Přebitý novějším načtením — o tom se nehlásí.
      if (ctrlNacteni.current !== ctrl) return;
      const c = ctrl.signal.aborted ? popisChyby(new ImportChyba('CANCELLED', 'načítání zrušeno')) : popisChyby(e);
      zaloguj(c);
      setChyba(c);
    } finally {
      if (ctrlNacteni.current === ctrl) {
        ctrlNacteni.current = null;
        setNacita(false);
      }
    }
  };

  const zrusNacteni = () => ctrlNacteni.current?.abort();

  const prihlasSpotify = async () => {
    setPrihlasuje(true);
    const v = await spotifyPrihlaseni.prihlas();
    setPrihlasuje(false);
    if (!v.ok) {
      setChyba(popisChyby(new ImportChyba('SPOTIFY_LOGIN_REQUIRED', v.chyba || '', v.chyba)));
      return;
    }
    // Po přihlášení se načte znovu, co tu bylo — typicky vlastní playlist.
    if (posledni.current) void nacti(posledni.current);
  };

  /* ------------------------------------------------------ Výběr */

  const duplicity = useMemo(() => {
    const m = new Map<string, ReturnType<typeof najdiDuplicitu>>();
    for (const s of kolekce?.skladby || []) {
      m.set(s.sourceId, najdiDuplicitu({ sourceId: s.sourceId, isrc: s.isrc, title: s.title, artist: s.artist }, pisne));
    }
    return m;
  }, [kolekce, pisne]);

  const prepni = (id: string) => setVybrane((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const pripojSoubor = (s: NahledSkladby, f: File | undefined) => {
    if (!f) return;
    if (!jeZvukovySoubor(f)) {
      setChybaSouboru((p) => ({ ...p, [s.sourceId]: 'Tohle není zvukový soubor.' }));
      return;
    }
    setChybaSouboru((p) => { const n = { ...p }; delete n[s.sourceId]; return n; });
    setSoubory((p) => new Map(p).set(s.sourceId, f));
    setVybrane((p) => new Set(p).add(s.sourceId));
  };

  const odeberSoubor = (id: string) => setSoubory((p) => { const n = new Map(p); n.delete(id); return n; });

  /* ------------------------------------------------------ Import */

  const zavislosti = () => ({
    pisne: () => songDatabaseService.getSongs(),
    ulozPisen: (song: Song) => songDatabaseService.saveSong(song),
    // Pořadí má smysl: soubor, který člověk vybral výslovně, má přednost
    // před tím, co se najde v knihovně podle názvu.
    zdroje: [
      new VlastniSouborProvider(soubory, {
        nahraj: (f: File) => assetLibraryService.upload(f, 'my_songs', 'audio', 'private', null, {
          zdrojovaSlozka: 'Music Import',
          tagy: ['music-import'],
        }),
      }),
      new KnihovnaProvider({ hledej: (q: string) => assetLibraryService.list({ search: q, limit: 25 }) }),
    ],
  });

  const spustImport = async (opakovat = false) => {
    if (!kolekce || importuje) return;
    const ctrl = new AbortController();
    ctrlImportu.current = ctrl;
    setImportuje(true);
    const moz = { signal: ctrl.signal, jenSeZvukem, rozhodnuti, priZmene: (p: readonly PolozkaImportu[]) => setPolozky([...p]) };
    try {
      const v = opakovat && polozky
        ? await zopakujNeuspesne(polozky, zavislosti(), moz)
        : await importuj(pripravPolozky(kolekce.skladby.filter((s) => vybrane.has(s.sourceId))), zavislosti(), moz);
      setPolozky(v);
      v.filter((p) => p.chyba).forEach((p) => zaloguj(p.chyba!));
    } finally {
      ctrlImportu.current = null;
      setImportuje(false);
    }
  };

  const stavPolozky = useMemo(
    () => new Map((polozky || []).map((p) => [p.skladba.sourceId, p])),
    [polozky],
  );
  const shrnuti = polozky ? souhrn(polozky) : null;
  const lzeOpakovat = !!polozky?.some((p) => p.stav === 'zruseno' || (p.stav === 'chyba' && p.chyba?.opakovat));
  const pisenPodleId = (id?: string) => (id ? pisne.find((p) => p.id === id) : undefined);

  const pocetVybranych = kolekce ? kolekce.skladby.filter((s) => vybrane.has(s.sourceId)).length : 0;

  /* ------------------------------------------------------ Vykreslení */

  return (
    <div className="space-y-4">
      <div>
        <h2 className="nadpis-sekce">Music Import</h2>
        <p className="text-drobne text-pismo-tlum max-w-[74ch]">
          Skladby ze Spotify do zpěvníku — název, interpret, album, obal a délka. Vlož odkaz na
          skladbu, album, playlist nebo interpreta, nebo napiš, co hledáš. Zvuk se připojí jen
          z tvé knihovny nebo ze souboru, který sám vybereš; ze Spotify se žádný nestahuje.
        </p>
      </div>

      {!vAplikaci && (
        <p className="flex items-start gap-2 text-drobne text-pozor bg-pozor/10 border border-pozor/30 rounded-panel p-3 max-w-[74ch]">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          Přihlas se do aplikace — import ukládá skladby do zpěvníku a ten je jen pro přihlášené.
        </p>
      )}
      {vAplikaci && nastaveno === false && (
        <p className="flex items-start gap-2 text-drobne text-pozor bg-pozor/10 border border-pozor/30 rounded-panel p-3 max-w-[74ch]">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {ZPRAVY.SPOTIFY_NOT_CONFIGURED} Klíče se zakládají v{' '}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline">
              Spotify Developer Dashboard
            </a>.
          </span>
        </p>
      )}

      {/* Vstup */}
      <div className="bg-plocha-2 border border-kresba rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative grow min-w-[260px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-pismo-slaby" />
            <input
              value={vstup}
              onChange={(e) => setVstup(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void nacti(); } }}
              placeholder="https://open.spotify.com/playlist/…  nebo  Metallica One"
              aria-label="Odkaz ze Spotify nebo hledaný výraz"
              className="w-full bg-vhloubeni border border-kresba rounded-prvek pl-8 pr-2 py-2 text-drobne text-pismo outline-none focus:border-znacka-okraj"
            />
          </div>
          {rozpoznano && (
            <span
              className={`px-2 py-1 rounded-prvek text-stitek font-bold ${
                rozpoznano.ok ? 'bg-znacka-tlum text-znacka ring-1 ring-znacka-okraj' : 'bg-chyba/10 text-chyba'
              }`}
            >
              {rozpoznano.popis}
            </span>
          )}
          {nacita ? (
            <button
              onClick={zrusNacteni}
              className="flex items-center gap-1.5 px-3 py-2 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />Zrušit
            </button>
          ) : (
            <button
              onClick={() => void nacti()}
              disabled={!vstup.trim() || !vAplikaci}
              className="flex items-center gap-1.5 px-3 py-2 rounded-prvek text-drobne zlata-plocha cursor-pointer disabled:opacity-40"
            >
              {rozpoznano?.hledani ? <Search className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
              {rozpoznano?.hledani ? 'Hledat' : 'Načíst'}
            </button>
          )}
        </div>

        {jinaAdresa && (
          <p className="flex items-start gap-2 text-drobne text-pozor bg-pozor/10 border border-pozor/30 rounded-panel p-3">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Aplikace běží na adrese <code>localhost</code> a z té Spotify přihlášení nepřijme — přes http
              povoluje jen <code>127.0.0.1</code>. Pro import vlastních playlistů ji otevři na{' '}
              <a href={jinaAdresa} className="underline font-bold">{new URL(jinaAdresa).origin}</a>{' '}
              (do aplikace se tam přihlásíš znovu — pro prohlížeč je to jiná adresa). Ve Spotify
              dashboardu nastav Redirect URI <code>{new URL(jinaAdresa).origin}/spotify-callback.html</code>.
              Skladby, alba a hledání fungují i tady.
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-stitek text-pismo-slaby">
          {spotifyPrihlaseni.nastaveno() ? (
            spotifyUcet ? (
              <>
                <Check className="w-3.5 h-3.5 text-uspech" />
                Přihlášen ke Spotify — vlastní playlisty se načtou celé.
                <button
                  onClick={() => spotifyPrihlaseni.odhlas()}
                  className="flex items-center gap-1 text-pismo-tlum hover:text-pismo cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />Odhlásit
                </button>
              </>
            ) : (
              <>
                Skladby playlistu vydá Spotify jen jeho majiteli nebo spoluautorovi.
                <button
                  onClick={() => void prihlasSpotify()}
                  disabled={prihlasuje || !!jinaAdresa}
                  title={jinaAdresa ? 'Z adresy localhost Spotify přihlášení nepřijme' : undefined}
                  className="flex items-center gap-1 text-znacka hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {prihlasuje ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
                  Přihlásit ke Spotify
                </button>
              </>
            )
          ) : (
            <span>Import playlistů potřebuje přihlášení ke Spotify — chybí VITE_SPOTIFY_CLIENT_ID.</span>
          )}
        </div>
      </div>

      {chyba && <PanelChyby chyba={chyba} onZnovu={() => void nacti(posledni.current)} />}

      {/* Interpret: vybere se album */}
      {interpret && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Obal url={interpret.coverUrl} velikost="w-16 h-16" kulate />
            <div className="min-w-0">
              <p className="stitek-pole">Interpret</p>
              <p className="nadpis-panelu truncate">{interpret.nazev}</p>
              {interpret.zanry.length > 0 && (
                <p className="text-stitek text-pismo-slaby truncate">{interpret.zanry.slice(0, 4).join(' · ')}</p>
              )}
            </div>
          </div>
          {interpret.alba.length === 0 ? (
            <p className="text-drobne text-pismo-slaby">Spotify u tohoto interpreta žádná alba neuvádí.</p>
          ) : (
            <>
              <p className="text-drobne text-pismo-tlum">Vyber album — skladby se načtou po albech.</p>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {interpret.alba.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      const url = `https://open.spotify.com/album/${a.id}`;
                      setVstup(url);
                      void nacti(url);
                    }}
                    className="karta karta-najeti p-2 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <Obal url={a.coverUrl} velikost="w-12 h-12" />
                    <span className="min-w-0">
                      <span className="block text-drobne font-bold text-pismo truncate">{a.nazev}</span>
                      <span className="block text-stitek text-pismo-slaby">
                        {[a.rok, a.pocet ? `${a.pocet} skladeb` : null, a.druh === 'single' ? 'singl' : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Kolekce: náhled a výběr */}
      {kolekce && (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Obal url={kolekce.coverUrl} velikost="w-20 h-20" />
            <div className="min-w-0 grow">
              <p className="stitek-pole">{kolekce.id ? DRUH[kolekce.druh] : 'Výsledky hledání'}</p>
              <p className="nadpis-panelu truncate">{kolekce.nazev}</p>
              <p className="text-stitek text-pismo-slaby truncate">
                {[kolekce.autor, kolekce.popis, `${kolekce.skladby.length}${kolekce.celkem > kolekce.skladby.length ? ` z ${kolekce.celkem}` : ''} skladeb`]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            {kolekce.url && (
              <a
                href={kolekce.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Otevřít na Spotify"
                className="p-1.5 text-pismo-slaby hover:text-pismo cursor-pointer shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          {upozorneni && (
            <p className="flex items-start gap-2 text-drobne text-pozor bg-pozor/10 border border-pozor/30 rounded-panel p-3">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="grow">{upozorneni.zprava}</span>
              {upozorneni.kod === 'SPOTIFY_LOGIN_REQUIRED' && spotifyPrihlaseni.nastaveno() && !spotifyUcet && (
                <button
                  onClick={() => void prihlasSpotify()}
                  disabled={prihlasuje || !!jinaAdresa}
                  title={jinaAdresa ? 'Z adresy localhost Spotify přihlášení nepřijme' : undefined}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne zlata-plocha cursor-pointer shrink-0 disabled:opacity-40"
                >
                  <LogIn className="w-3.5 h-3.5" />Přihlásit
                </button>
              )}
            </p>
          )}

          {kolekce.vynechano.length > 0 && (
            <p className="text-stitek text-pismo-slaby">
              Vynecháno: {kolekce.vynechano.map((v) => `${v.pocet}× ${POPIS_VYNECHANI[v.duvod]}`).join(', ')}.
            </p>
          )}

          {kolekce.skladby.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setVybrane(new Set(kolekce.skladby.map((s) => s.sourceId)))}
                  disabled={importuje}
                  className="px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer disabled:opacity-40"
                >
                  Vybrat vše
                </button>
                <button
                  onClick={() => setVybrane(new Set())}
                  disabled={importuje}
                  className="px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer disabled:opacity-40"
                >
                  Zrušit výběr
                </button>
                <span className="text-stitek text-pismo-slaby">vybráno {pocetVybranych} z {kolekce.skladby.length}</span>

                <label className="ml-auto flex items-center gap-1.5 text-drobne text-pismo-tlum cursor-pointer">
                  <input
                    type="checkbox"
                    checked={jenSeZvukem}
                    onChange={(e) => setJenSeZvukem(e.target.checked)}
                    disabled={importuje}
                    className="accent-znacka"
                  />
                  Jen skladby s oprávněným zvukem
                </label>

                {importuje ? (
                  <button
                    onClick={() => ctrlImportu.current?.abort()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-prvek text-drobne font-bold bg-chyba text-white cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />Zrušit import
                  </button>
                ) : (
                  <button
                    onClick={() => void spustImport(false)}
                    disabled={!pocetVybranych || !vAplikaci}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-prvek text-drobne zlata-plocha cursor-pointer disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />Importovat vybrané ({pocetVybranych})
                  </button>
                )}
              </div>

              {/* Průběh */}
              {shrnuti && (
                <div className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-plocha-3 overflow-hidden" role="progressbar"
                       aria-valuemin={0} aria-valuemax={shrnuti.celkem} aria-valuenow={shrnuti.celkem - shrnuti.zbyva}>
                    <div
                      className="h-full bg-znacka transition-[width] duration-300"
                      style={{ width: `${shrnuti.celkem ? ((shrnuti.celkem - shrnuti.zbyva) / shrnuti.celkem) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-stitek text-pismo-slaby tabular-nums">
                    <span>{shrnuti.celkem - shrnuti.zbyva} / {shrnuti.celkem}</span>
                    {shrnuti.hotovo > 0 && <span className="text-uspech">importováno {shrnuti.hotovo}</span>}
                    {shrnuti.bezZvuku > 0 && <span className="text-pozor">z toho bez zvuku {shrnuti.bezZvuku}</span>}
                    {shrnuti.duplicit > 0 && <span>už ve zpěvníku {shrnuti.duplicit}</span>}
                    {shrnuti.chyb > 0 && <span className="text-chyba">chyb {shrnuti.chyb}</span>}
                    {shrnuti.zruseno > 0 && <span>zrušeno {shrnuti.zruseno}</span>}
                    {!importuje && lzeOpakovat && (
                      <button
                        onClick={() => void spustImport(true)}
                        className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />Zopakovat neúspěšné
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Seznam skladeb */}
              <ul className="bg-plocha-2 border border-kresba rounded-2xl divide-y divide-kresba-jemna">
                {kolekce.skladby.map((s) => {
                  const shoda = duplicity.get(s.sourceId);
                  const p = stavPolozky.get(s.sourceId);
                  const soubor = soubory.get(s.sourceId);
                  const vyber = vybrane.has(s.sourceId);
                  const ulozena = pisenPodleId(p?.songId) || (p?.shoda?.song);
                  return (
                    <li key={s.sourceId} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <input
                        type="checkbox"
                        checked={vyber}
                        onChange={() => prepni(s.sourceId)}
                        disabled={importuje}
                        aria-label={`Vybrat ${s.title}`}
                        className="accent-znacka shrink-0"
                      />
                      <span className="w-6 text-stitek text-pismo-slaby tabular-nums text-right shrink-0">{s.poradi}</span>
                      <Obal url={s.coverUrl} velikost="w-9 h-9" />
                      <span className="min-w-0 grow basis-48">
                        <span className="block text-drobne font-bold text-pismo truncate">
                          {s.title}{s.explicit && <span className="ml-1.5 text-stitek text-pismo-slaby">E</span>}
                        </span>
                        <span className="block text-stitek text-pismo-slaby truncate">
                          {s.artists.join(', ')}{s.album ? ` · ${s.album}` : ''}
                        </span>
                      </span>
                      <span className="text-stitek text-pismo-slaby tabular-nums shrink-0">{delka(s.duration)}</span>

                      {/* Zvuk */}
                      <span className="flex items-center gap-1 shrink-0">
                        {soubor ? (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-prvek bg-plocha-3 text-stitek text-pismo-tlum max-w-[180px]">
                            <FileAudio className="w-3 h-3 shrink-0" />
                            <span className="truncate">{soubor.name}</span>
                            <button
                              onClick={() => odeberSoubor(s.sourceId)}
                              disabled={importuje}
                              aria-label={`Odebrat soubor ${soubor.name}`}
                              className="text-pismo-slaby hover:text-chyba cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ) : (
                          <label
                            className={`flex items-center gap-1 px-2 py-1 rounded-prvek bg-plocha-3 text-stitek text-pismo-tlum hover:text-pismo ${
                              importuje ? 'opacity-40' : 'cursor-pointer'
                            }`}
                            title="Připojit vlastní nahrávku k téhle skladbě"
                          >
                            <FileAudio className="w-3 h-3" />Vlastní zvuk
                            <input
                              type="file"
                              accept="audio/*"
                              hidden
                              disabled={importuje}
                              onChange={(e) => { pripojSoubor(s, e.target.files?.[0]); e.target.value = ''; }}
                            />
                          </label>
                        )}
                      </span>

                      {/* Duplicita před importem */}
                      {shoda && !p && (
                        <span className="w-full flex flex-wrap items-center gap-1.5 pl-9 text-stitek">
                          <span className="px-2 py-0.5 rounded-prvek bg-info/10 text-info font-bold">
                            Už ve zpěvníku — {POPIS_SHODY[shoda.druh]}
                          </span>
                          <button
                            onClick={() => onOtevritPisen(shoda.song)}
                            className="flex items-center gap-1 text-pismo-tlum hover:text-pismo cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />Otevřít
                          </button>
                          <select
                            value={rozhodnuti[s.sourceId] || 'preskocit'}
                            disabled={importuje}
                            onChange={(e) => {
                              const r = e.target.value as Rozhodnuti;
                              setRozhodnuti((p2) => ({ ...p2, [s.sourceId]: r }));
                              if (r === 'nahradit') setVybrane((p2) => new Set(p2).add(s.sourceId));
                            }}
                            aria-label="Co s duplicitou"
                            className="bg-vhloubeni border border-kresba rounded-prvek px-1.5 py-0.5 text-stitek text-pismo outline-none focus:border-znacka-okraj"
                          >
                            <option value="preskocit">Nezdvojovat — přeskočit</option>
                            <option value="nahradit">Nahradit metadata</option>
                          </select>
                        </span>
                      )}

                      {chybaSouboru[s.sourceId] && (
                        <span className="w-full pl-9 text-stitek text-chyba">{chybaSouboru[s.sourceId]}</span>
                      )}

                      {/* Stav importu */}
                      {p && (
                        <span className="w-full flex flex-wrap items-center gap-1.5 pl-9 text-stitek">
                          {p.stav === 'ceka' && <span className="text-pismo-slaby">čeká</span>}
                          {p.stav === 'bezi' && (
                            <span className="flex items-center gap-1 text-pismo-tlum"><Loader2 className="w-3 h-3 animate-spin" />importuji…</span>
                          )}
                          {p.stav === 'hotovo' && (
                            <span className="flex items-center gap-1 text-uspech font-bold">
                              <Check className="w-3 h-3" />{p.shoda ? 'metadata nahrazena' : 'importováno'}
                            </span>
                          )}
                          {p.stav === 'hotovo' && p.zvuk && <span className="text-pismo-tlum">{p.zvuk}</span>}
                          {p.upozorneni && <span className="text-pozor">{p.upozorneni.zprava}</span>}
                          {p.stav === 'duplicita' && (
                            <span className="text-pismo-tlum">
                              Nezdvojeno — už ve zpěvníku ({p.shoda ? POPIS_SHODY[p.shoda.druh] : 'shoda'})
                            </span>
                          )}
                          {p.stav === 'zruseno' && <span className="text-pismo-slaby">zrušeno</span>}
                          {p.stav === 'chyba' && p.chyba && (
                            <span className="text-chyba" title={`${p.chyba.kod}: ${p.chyba.technicky}`}>{p.chyba.zprava}</span>
                          )}
                          {ulozena && (p.stav === 'hotovo' || p.stav === 'duplicita') && (
                            <button
                              onClick={() => onOtevritPisen(ulozena)}
                              className="flex items-center gap-1 text-pismo-tlum hover:text-pismo cursor-pointer"
                            >
                              <ExternalLink className="w-3 h-3" />Otevřít
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {kolekce.skladby.length === 0 && !kolekce.obsahNedostupny && (
            <p className="flex items-center gap-2 text-drobne text-pismo-slaby">
              <ListMusic className="w-4 h-4" />
              {kolekce.id ? 'V téhle kolekci není nic, co by šlo importovat.' : 'Nic nenalezeno. Zkus jiná slova.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
