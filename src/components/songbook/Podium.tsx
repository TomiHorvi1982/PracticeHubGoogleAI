import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Maximize2, Minimize2, ListMusic, Check, Music2, X,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { Song } from '../../types';
import { audioSynth } from '../../services/audioSynth';
import { audioBus } from '../../services/audioBus';
import { podiumProfil } from '../../services/podiumProfil';
import { ObalkyPisne } from './ObalkyPisne';

interface Playlist {
  id: string;
  name: string;
  songIds: string[];
}

interface Props {
  songs: Song[];
  playlists: Playlist[];
  aktivni: Song | null;
  onVybrat: (s: Song) => void;
  /** Plocha s okny pro právě vybranou píseň. */
  plocha: React.ReactNode;
  /** Zařadí otevřenou píseň do setu, když v něm ještě není. */
  onPridatDoSetu?: (s: Song) => void;
  /** Vyhodí píseň ze setu. Set si vybírá Pódium samo, tak ho posílá s sebou. */
  onOdebratZeSetu?: (setId: string, s: Song) => void;
}

/** Kolik taktů se napočítá, než se začne hrát. */
const TAKTY_ODPOCTU = 2;
const DOB_V_TAKTU = 4;

/**
 * Pódium — místo, odkud se hraje.
 *
 * Sedí tu playlist a k němu plocha s okny. Kliknutí na jinou píseň
 * v playlistu přepne rovnou i obsah plochy, protože každý má u každé
 * písně nastavené své: kytarista tabulaturu, zpěvák text. Nastavení se
 * ukládá k člověku, ne ke skladbě.
 *
 * Pódiový režim je totéž přes celou obrazovku, s odpočtem před začátkem —
 * na zkoušce nikdo nekouká na obrazovku, ale čeká na čtyři klepnutí.
 */
export const Podium: React.FC<Props> = ({
  songs, playlists, aktivni, onVybrat, plocha, onPridatDoSetu, onOdebratZeSetu,
}) => {
  /**
   * Sbalený seznam skladeb.
   *
   * Set má klidně čtyřicet písní a na Pódiu tlačil plochu s okny až
   * pod obrazovku. Drží se v prohlížeči, ne v profilu: profil skládá
   * stav z výslovného výčtu polí, takže by se nové pole tiše zahodilo
   * a seznam by se po každém přihlášení zase rozbaloval.
   */
  const [seznamOtevreny, setSeznamOtevreny] = useState(() => {
    try { return localStorage.getItem('neverlate_podium_seznam') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('neverlate_podium_seznam', seznamOtevreny ? '1' : '0'); }
    catch { /* plné úložiště nesmí rozbít Pódium */ }
  }, [seznamOtevreny]);

  // Naposledy zvolený playlist, jinak první, ve kterém něco je — prázdný
  // set list na Pódiu vypadá, jako by se nic neuložilo.
  const [playlistId, setPlaylistId] = useState<string>(() => {
    const ulozeny = podiumProfil.playlist();
    if (ulozeny && playlists.some((p) => p.id === ulozeny)) return ulozeny;
    return (playlists.find((p) => p.songIds.length > 0) || playlists[0])?.id || '';
  });
  const [naCelou, setNaCelou] = useState(false);
  const [odpocet, setOdpocet] = useState<number | null>(null);
  const [hraje, setHraje] = useState(false);

  // Které písně už mají nastavená okna. Přepočítá se na zprávu z plochy —
  // jinak by se zaškrtnutí objevilo až po přenačtení stránky.
  const [nastavene, setNastavene] = useState<Set<string>>(new Set());
  const prepocitej = useCallback(() => {
    setNastavene(new Set(songs.filter((s) => podiumProfil.maNastaveno(s.id)).map((s) => s.id)));
  }, [songs]);

  useEffect(() => {
    prepocitej();
    window.addEventListener('neverlate:podium-zmena', prepocitej);
    return () => window.removeEventListener('neverlate:podium-zmena', prepocitej);
  }, [prepocitej]);

  const playlist = playlists.find((p) => p.id === playlistId) || playlists[0] || null;
  const vPlaylistu = playlist
    ? (playlist.songIds.map((id) => songs.find((s) => s.id === id)).filter(Boolean) as Song[])
    : [];
  const kde = aktivni ? vPlaylistu.findIndex((s) => s.id === aktivni.id) : -1;
  /**
   * Otevřená píseň nemusí být v setu.
   *
   * Na Pódium se dá přijít s písní, kterou sis zrovna otevřel v knihovně —
   * a je správně, že se nezavře. Ale bez upozornění to vypadá, jako by se
   * do setu připletla sama.
   */
  const mimoSet = Boolean(aktivni && vPlaylistu.length > 0 && kde < 0);

  const vyberPlaylist = (id: string) => {
    setPlaylistId(id);
    podiumProfil.ulozPlaylist(id);
  };

  const prepni = (posun: number) => {
    if (vPlaylistu.length === 0) return;
    // Když je na Pódiu píseň mimo playlist, „další" znamená první v pořadí.
    const dalsi = kde < 0 ? 0 : (kde + posun + vPlaylistu.length) % vPlaylistu.length;
    onVybrat(vPlaylistu[dalsi]);
  };

  // Odpočet žije v ref, aby ho šlo zrušit i z jiného tiknutí než toho,
  // které ho spustilo.
  const casovac = useRef<number | null>(null);
  const zrus = () => {
    if (casovac.current !== null) {
      clearInterval(casovac.current);
      casovac.current = null;
    }
    setOdpocet(null);
  };

  useEffect(() => zrus, []);


  /**
   * Napočítá dva takty a pak spustí.
   *
   * Klepe metronomem s důrazem na první dobu — kapela pozná, kde je
   * začátek taktu, aniž by se dívala na obrazovku.
   */
  const spust = () => {
    if (hraje) {
      audioBus.stopAll();
      setHraje(false);
      zrus();
      return;
    }
    zrus();

    const bpm = aktivni?.bpm || 120;
    const celkem = TAKTY_ODPOCTU * DOB_V_TAKTU;
    let doba = 0;
    setOdpocet(celkem);

    const tik = () => {
      audioSynth.playMetronomeClick(doba % DOB_V_TAKTU === 0);
      doba += 1;
      setOdpocet(celkem - doba);
      if (doba >= celkem) {
        zrus();
        setHraje(true);
        // Přehrávání zařizuje okno s hudbou; Pódium jen dá povel.
        window.dispatchEvent(
          new CustomEvent('neverlate:podium-start', { detail: { songId: aktivni?.id } })
        );
      }
    };

    tik();
    casovac.current = window.setInterval(tik, 60000 / bpm);
  };

  const udaj = (popis: string, hodnota: string | number | undefined) =>
    hodnota ? (
      <div className="flex items-baseline gap-1.5">
        <span className="text-stitek uppercase tracking-wider text-neutral-500">{popis}</span>
        <span className="text-sm font-bold text-white tabular-nums">{hodnota}</span>
      </div>
    ) : null;

  const zakladniUdaje = aktivni && (
    <div className="flex items-center gap-4 flex-wrap">
      {udaj('Tempo', aktivni.bpm ? `${aktivni.bpm} BPM` : '')}
      {udaj('Tónina', aktivni.key)}
      {udaj('Ladění', aktivni.tuning || 'Standard (EADGBe)')}
    </div>
  );

  const ovladani = (velke: boolean) => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => prepni(-1)}
        disabled={vPlaylistu.length === 0}
        className={`rounded-xl bg-white/[0.06] hover:bg-white/[0.14] text-neutral-300 hover:text-white cursor-pointer transition-all disabled:opacity-25 disabled:cursor-not-allowed ${
          velke ? 'p-3' : 'p-2'
        }`}
        title="Předchozí skladba"
      >
        <SkipBack className={velke ? 'w-5 h-5' : 'w-4 h-4'} />
      </button>

      <button
        onClick={spust}
        disabled={!aktivni}
        className={`rounded-2xl font-bold flex items-center justify-center cursor-pointer transition-all disabled:opacity-30 ${
          hraje ? 'bg-uspech text-black' : 'bg-znacka text-black hover:bg-znacka/85'
        } ${velke ? 'w-20 h-20' : 'w-11 h-11'}`}
        title={hraje ? 'Zastavit' : `Spustit s odpočtem ${TAKTY_ODPOCTU} taktů`}
      >
        {odpocet !== null ? (
          <span className={velke ? 'text-3xl tabular-nums' : 'text-base tabular-nums'}>
            {(odpocet % DOB_V_TAKTU) + 1}
          </span>
        ) : hraje ? (
          <Pause className={velke ? 'w-9 h-9 fill-current' : 'w-5 h-5 fill-current'} />
        ) : (
          <Play className={velke ? 'w-9 h-9 fill-current ml-1' : 'w-5 h-5 fill-current ml-0.5'} />
        )}
      </button>

      <button
        onClick={() => prepni(1)}
        disabled={vPlaylistu.length === 0}
        className={`rounded-xl bg-white/[0.06] hover:bg-white/[0.14] text-neutral-300 hover:text-white cursor-pointer transition-all disabled:opacity-25 disabled:cursor-not-allowed ${
          velke ? 'p-3' : 'p-2'
        }`}
        title="Další skladba"
      >
        <SkipForward className={velke ? 'w-5 h-5' : 'w-4 h-4'} />
      </button>
    </div>
  );

  /**
   * Set list ve třech sloupcích, v pořadí, ve kterém se hraje.
   *
   * Dřív to byly štítky zabalené do řádků vedle sebe, takže se pořadí
   * dalo přečíst jen očima skákajícíma přes konce řádků. Pod sebou se
   * čte odshora dolů, ale jeden sloupec u sedmatřiceti písní odsunul
   * plochu s okny mimo obrazovku — tři sloupce se čtou stejně a zaberou
   * třetinu výšky.
   *
   * Obal je vepředu, protože z něj poznáš skladbu dřív, než stihneš
   * přečíst název.
   */
  const seznam = (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1">
      {vPlaylistu.length === 0 ? (
        <p className="text-drobne text-neutral-600">
          Set list je prázdný. Přidej skladby ikonou v seznamu vpravo.
        </p>
      ) : (
        vPlaylistu.map((s, i) => {
          const je = aktivni?.id === s.id;
          return (
            <div
              key={s.id}
              className={`flex items-center rounded-xl border transition-all min-w-0 ${
                je
                  ? 'bg-znacka/20 border-znacka'
                  : 'bg-black/30 border-white/[0.08] hover:border-white/25'
              }`}
            >
              <button
                onClick={() => onVybrat(s)}
                className="flex items-center gap-2 px-2 py-1.5 flex-1 min-w-0 cursor-pointer text-left"
                title={
                  nastavene.has(s.id)
                    ? 'Okna k téhle písni už máš nastavená'
                    : 'K téhle písni sis ještě nic nenastavil'
                }
              >
                <span className="text-stitek font-mono text-neutral-600 tabular-nums w-4 shrink-0 text-right">
                  {i + 1}
                </span>
                <ObalkyPisne song={s} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-drobne ${je ? 'text-white font-bold' : 'text-neutral-300'}`}>
                    {s.title}
                  </span>
                  <span className="flex items-center gap-1.5 text-stitek text-neutral-500">
                    <span className="truncate">{s.artist}</span>
                    {s.bpm ? <span className="font-mono tabular-nums shrink-0">{s.bpm}</span> : null}
                    {/* Fajfka říká, že u téhle písně už je naklikáno, co
                        chceš vidět — před zkouškou je vidět, co ještě chybí. */}
                    {nastavene.has(s.id) && <Check className="w-2.5 h-2.5 text-uspech shrink-0" />}
                  </span>
                </span>
              </button>

              {onOdebratZeSetu && playlist && (
                <button
                  onClick={() => onOdebratZeSetu(playlist.id, s)}
                  className="p-1.5 rounded-lg text-neutral-600 hover:text-chyba hover:bg-chyba/10 cursor-pointer shrink-0 transition-all"
                  title={`Odebrat „${s.title}" ze setu`}
                  aria-label={`Odebrat ${s.title} ze setu`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const zahlavi = (velke: boolean) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => setSeznamOtevreny((o) => !o)}
          className="p-1 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer shrink-0"
          title={seznamOtevreny ? 'Sbalit seznam' : 'Rozbalit seznam'}
        >
          {seznamOtevreny ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <ListMusic className="w-4 h-4 text-znacka shrink-0" />
        {playlists.length > 1 ? (
          <select
            value={playlistId}
            onChange={(e) => vyberPlaylist(e.target.value)}
            className="bg-black/50 border border-white/10 text-white text-drobne font-semibold rounded-lg px-2 py-1 outline-none focus:border-znacka cursor-pointer"
          >
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.songIds.length})
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            {playlist?.name || 'Playlist'}
          </span>
        )}
      </div>

      {velke ? null : ovladani(false)}

      <button
        onClick={() => setNaCelou((v) => !v)}
        className="px-3 py-1.5 bg-znacka hover:bg-znacka/90 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
      >
        {naCelou ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        <span>{naCelou ? 'Zavřít pódiový režim' : 'Pódiový režim'}</span>
      </button>
    </div>
  );

  if (naCelou) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#0E0E12] text-[#E5E5EA] flex flex-col p-4 sm:p-6 gap-4 overflow-y-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <span className="bg-znacka text-black font-extrabold text-stitek px-2.5 py-0.5 rounded-md uppercase tracking-wider">
              Pódiový režim
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1.5 truncate">
              {aktivni?.title || 'Vyber skladbu'}
            </h1>
            <p className="text-xs text-neutral-400">{aktivni?.artist}</p>
          </div>

          {/* Ovládání uprostřed nahoře — na pódiu se hledá palcem, ne očima. */}
          <div className="flex flex-col items-center gap-2">
            {ovladani(true)}
            {odpocet !== null && (
              <span className="text-stitek uppercase tracking-widest text-znacka">
                Nádech — {Math.ceil((odpocet + 1) / DOB_V_TAKTU)}. takt
              </span>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {zakladniUdaje}
            <button
              onClick={() => setNaCelou(false)}
              className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Minimize2 className="w-4 h-4" /> Zavřít
            </button>
          </div>
        </div>

        {seznam}
        <div className="flex-1 min-h-0">{plocha}</div>
      </div>
    );
  }

  return (
    <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 flex flex-col relative min-h-[820px] shadow-xl gap-4">
      {zahlavi(false)}
      {seznam}

      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Music2 className="w-5 h-5 text-znacka shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate">
              {aktivni?.title || 'Vyber skladbu z playlistu'}
            </h1>
            <p className="text-xs text-neutral-400 truncate">{aktivni?.artist}</p>
          </div>

          {mimoSet && onPridatDoSetu && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-stitek font-bold uppercase tracking-wider text-znacka bg-znacka/12 border border-znacka/30 px-2 py-0.5 rounded-lg">
                Není v setu
              </span>
              <button
                onClick={() => aktivni && onPridatDoSetu(aktivni)}
                className="px-2 py-1 rounded-lg text-stitek font-bold bg-uspech/15 text-uspech hover:bg-uspech/30 cursor-pointer transition-all"
              >
                Přidat
              </button>
            </div>
          )}
        </div>
        {zakladniUdaje}
      </div>

      <div className="flex-1 min-h-0">{plocha}</div>
    </div>
  );
};
