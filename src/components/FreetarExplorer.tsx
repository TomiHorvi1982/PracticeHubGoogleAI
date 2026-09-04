import { useSdilenyVyraz } from '../services/useSdilenyVyraz';
import { sdilenyVyraz } from '../services/sdilenyVyraz';
import React, { useState, useEffect, useRef } from 'react';
import { TipyKapel } from './youtube/TipyKapel';
import {
  Globe,
  Search,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Download,
  Sparkles,
  Check,
  AlertCircle,
  Maximize2,
  Minimize2,
  BookOpen,
  Plus,
  Eye,
  Star,
  Music,
  ExternalLink,
  Layers,
  FileSpreadsheet,
  Disc,
  X,
  Volume2,
  Library,
} from 'lucide-react';
import { Song, SongAttachment } from '../types';
import { tabLibraryService, TabLibraryEntry } from '../services/tabLibraryService';
import { PrehledSbirky } from './knihovna/PrehledSbirky';
import { extractUniqueChords } from '../utils/chordUtils';
import { authService } from '../services/authService';
import { prilohaZAssetu, jizPripojeno } from '../services/priradKPisni';
import { songDatabaseService } from '../services/songDatabaseService';

interface FreetarExplorerProps {
  onSongImported: (song: Song) => void;
  onViewSong: (song: Song) => void;
  /**
   * Otevřít nalezenou tabulaturu rovnou v přehrávači Guitar Pro.
   *
   * Vyhledávání bydlí uvnitř sekce Guitar Pro, takže nález nemusí
   * putovat přes zpěvník a přepínání sekcí — přehraje se na místě.
   * Týká se jen souborů z vlastní sbírky; z Ultimate Guitar chodí text
   * s akordy, který přehrávač tabulatur vykreslit neumí.
   */
  onOtevritVPrehravaci?: (soubor: {
    dataUrl: string;
    filename: string;
    artist?: string;
    bpm?: number;
  }) => void;
  /** Skryje vlastní hlavičku, když sedí uvnitř jiné sekce. */
  vlozeny?: boolean;
  /**
   * Skladby, které ve zpěvníku už jsou.
   *
   * Slouží jen k tomu, aby automatické ukládání nezakládalo tutéž píseň
   * podruhé. Bez toho by z pěti prohlédnutých verzí jedné písničky
   * vzniklo ve zpěvníku pět záznamů.
   */
  songs?: Song[];
}

interface FreetarSearchResult {
  id: string;
  artist: string;
  song: string;
  path?: string;
  url: string;
  rating: string | number | null;
  type: string;
  /** Odkud výsledek přišel — určuje, kterým endpointem se stahuje obsah. */
  source?: 'ultimate-guitar' | 'freetar' | 'library';
  /** `false` u placených verzí (Pro/Official), jejichž obsah UG nevydá. */
  viewable?: boolean;
  /** Jen u výsledků z vlastní sbírky — původní záznam pro stažení souboru. */
  libraryEntry?: TabLibraryEntry;
}

export const FreetarExplorer: React.FC<FreetarExplorerProps> = ({
  onSongImported,
  onOtevritVPrehravaci,
  vlozeny,
  songs = [],
  onViewSong,
}) => {
  // Mode: 'native_search' | 'live_browser'
  const [activeMode, setActiveMode] = useState<'native_search' | 'sbirka' | 'live_browser'>('native_search');

  // Native Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<FreetarSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Preview & Reading Modal
  const [previewTab, setPreviewTab] = useState<any | null>(null);
  const [isLoadingTab, setIsLoadingTab] = useState<boolean>(false);
  const [tabTranspose, setTabTranspose] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live Browser State
  /**
   * Ukládat prohlédnuté tabulatury rovnou do zpěvníku.
   *
   * Dosud se musela každá otevřená tabulatura ještě jednou potvrdit
   * tlačítkem, přestože ten, kdo si ji otevřel, ji chtěl. Volba zůstává
   * pro případ, že si někdo jen prohlíží — a co ve zpěvníku už je, se
   * podruhé nezakládá.
   */
  const [ukladatSam, setUkladatSam] = useState(
    () => localStorage.getItem('neverlate_ug_automaticky') !== 'ne',
  );

  /** Stahovat z UG smí jen správce — používá se jeho vlastní předplatné. */
  const jsemSpravce = authService.getCurrentUser()?.role === 'admin';

  const [currentUrl, setCurrentUrl] = useState<string>('https://freetar.de');
  const [iframeUrl, setIframeUrl] = useState<string>('/api/freetar-proxy?url=https%3A%2F%2Ffreetar.de');
  const [directInput, setDirectInput] = useState<string>('');
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [windowHeightPx, setWindowHeightPx] = useState<number>(720);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Quick initial popular searches
  // Run native search against /api/freetar-search
  // Výraz napsaný jinde: pole se vyplní a hledá se při vstupu do sekce.
  useSdilenyVyraz((v) => { setSearchQuery(v); void handleExecuteSearch(v); });

  const handleExecuteSearch = async (term: string) => {
    sdilenyVyraz.nastav(term);
    if (!term.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setStatusMessage(null);

    // Hledá se přímo na Ultimate Guitar. Freetar je jen jeho frontend a jeho
    // proxy začala vracet prázdno, takže na něj spoléhat nejde — zůstává jako
    // záloha pro případ, že by UG odmítl odpovědět.
    const zdroje: { nazev: string; url: string; source: 'ultimate-guitar' | 'freetar' }[] = [
      { nazev: 'Ultimate Guitar', url: '/api/ug-search', source: 'ultimate-guitar' },
      { nazev: 'Freetar.de', url: '/api/freetar-search', source: 'freetar' },
    ];

    const potize: string[] = [];

    // Vlastní sbírka jde první — co má kapela na disku, je vždycky lepší
    // než cizí verze z internetu. Nezdržuje: hledá se v databázi, ne přes web.
    let vlastni: FreetarSearchResult[] = [];
    try {
      const nalezene = await tabLibraryService.search(term.trim());
      vlastni = nalezene.map((e) => ({
        id: `lib_${e.id}`,
        artist: e.artist,
        song: e.title,
        url: e.relPath,
        rating: null,
        type: e.format.toUpperCase(),
        source: 'library' as const,
        viewable: e.stored,
        libraryEntry: e,
      }));
    } catch (e: any) {
      potize.push(`Vlastní sbírka: ${e?.message || 'nedostupná'}.`);
    }

    try {
      for (const zdroj of zdroje) {
        try {
          const res = await fetch(`${zdroj.url}?q=${encodeURIComponent(term.trim())}`);
          const data = await res.json();
          const results: FreetarSearchResult[] = Array.isArray(data.results) ? data.results : [];

          if (results.length > 0) {
            setSearchResults([
              ...vlastni,
              ...results.map((r) => ({ ...r, source: r.source || zdroj.source })),
            ]);
            setSearchError(null);
            setStatusMessage({
              type: 'success',
              text:
                `${vlastni.length ? `${vlastni.length} z vlastní sbírky, ` : ''}` +
                `${results.length} z ${zdroj.nazev}.` +
                (potize.length ? ` ${potize.join(' ')}` : ''),
            });
            return;
          }

          potize.push(
            data.error
              ? `${zdroj.nazev}: ${data.error}`
              : `${zdroj.nazev}: nic nenašel.`
          );
        } catch (e: any) {
          potize.push(`${zdroj.nazev}: ${e?.message || 'nedostupný'}.`);
        }
      }

      // Internetové zdroje selhaly — vlastní sbírka může mít výsledky i tak.
      if (vlastni.length > 0) {
        setSearchResults(vlastni);
        setSearchError(null);
        setStatusMessage({
          type: 'success',
          text: `${vlastni.length} z vlastní sbírky. Online zdroje nic nevrátily: ${potize.join(' ')}`,
        });
        return;
      }

      setSearchResults([]);
      setSearchError(`Pro „${term}" se nic nenašlo.\n${potize.join('\n')}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Preview or fetch tab content from Freetar
  /** Obsah tabulatury si každý zdroj podává jinak, tvar odpovědi je ale stejný. */
  const tabEndpointFor = (result: FreetarSearchResult) =>
    result.source === 'freetar' ? '/api/freetar-tab' : '/api/ug-tab';

  const handlePreviewTab = async (result: FreetarSearchResult) => {
    if (result.source === 'library') {
      // Guitar Pro soubor je binární — jako text ho ukázat nejde.
      // Uvnitř sekce Guitar Pro se rovnou otevře v přehrávači; samostatně
      // musí napřed do zpěvníku, odkud si ho přehrávač vezme.
      if (onOtevritVPrehravaci && result.libraryEntry?.stored) {
        void otevriVPrehravaci(result.libraryEntry);
        return;
      }
      setStatusMessage({
        type: result.libraryEntry?.stored ? 'success' : 'error',
        text: result.libraryEntry?.stored
          ? `„${result.song}" je Guitar Pro soubor. Dejte „Do Song Library" a otevře se v přehrávači tabulatur.`
          : `„${result.song}" je zatím jen v rejstříku — soubor nahrán není. Nahrajte ho skriptem index-tab-library.ts s přepínačem --upload.`,
      });
      return;
    }

    if (result.viewable === false) {
      /**
       * Guitar Pro soubory jsou na Ultimate Guitar za předplatným.
       *
       * Kdo předplatné má, má na ně nárok — a když je přihlášení uložené
       * v Nastavení, stáhnou se rovnou do knihovny. Bez něj se jen otevře
       * stránka, ať si to člověk stáhne sám; obcházet placení appka nebude.
       */
      if (jsemSpravce) {
        setStatusMessage({ type: 'success', text: `Stahuji „${result.song}" z Ultimate Guitar…` });
        try {
          const token = authService.getCurrentSession()?.token;
          const r = await fetch('/api/ug/stahnout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ url: result.url }),
          });
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            const kam = d.asset ? await pripojKePisni(d.asset, result) : null;
            setStatusMessage({
              type: 'success',
              text: d.jizByl
                ? `„${d.asset?.name}" už v knihovně je — nestahuji podruhé.`
                : `„${d.asset?.name}" je stažený (${Math.round((d.velikost || 0) / 1024)} kB)`
                  + (kam ? ` a připojený k „${kam}". Najdeš ho v seznamu vlevo.` : '.'),
            });
            return;
          }
          setStatusMessage({ type: 'error', text: d.error || 'Stažení selhalo.' });
          if (r.status === 412) window.open(result.url, '_blank', 'noopener,noreferrer');
          return;
        } catch (e: any) {
          setStatusMessage({ type: 'error', text: `Stažení selhalo: ${e?.message || e}` });
          return;
        }
      }

      window.open(result.url, '_blank', 'noopener,noreferrer');
      setStatusMessage({
        type: 'error',
        text:
          `„${result.song}" je ${result.type} — Guitar Pro soubory dává Ultimate Guitar `
          + 'jen předplatitelům. Otevřel jsem stránku, ať si soubor stáhneš sám. '
          + 'Ve vlastní sbírce máme přes 74 tisíc tabulatur, zkus ji nejdřív.',
      });
      return;
    }

    setIsLoadingTab(true);
    setTabTranspose(0);
    try {
      const res = await fetch(`${tabEndpointFor(result)}?url=${encodeURIComponent(result.url)}`);
      const data = await res.json();
      if (data.success && data.song) {
        setPreviewTab(data.song);

        // Kdo si tabulaturu otevřel, ten ji chce. Zakládá se jen to, co
        // ve zpěvníku ještě není — porovnává se název s interpretem,
        // protože ta samá píseň chodí z Ultimate Guitar v několika verzích.
        if (ukladatSam) {
          const nazev = String(data.song.title || result.song || '').trim().toLowerCase();
          const interpret = String(data.song.artist || result.artist || '').trim().toLowerCase();
          const uzJe = songs.some(
            (s) =>
              s.title.trim().toLowerCase() === nazev &&
              s.artist.trim().toLowerCase() === interpret,
          );
          if (!uzJe) {
            await handleImportToSongbook({ ...data.song, url: result.url, source: result.source });
          } else {
            setStatusMessage({
              type: 'success',
              text: `„${data.song.title}" už ve zpěvníku je — neukládám podruhé.`,
            });
          }
        }
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Nepodařilo se načíst obsah tabulatury.' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'Chyba při stahování tabulatury: ' + e?.message });
    } finally {
      setIsLoadingTab(false);
    }
  };

  // Import directly to Songbook
  /**
   * Tabulatura z vlastní sbírky je Guitar Pro soubor, ne text s akordy —
   * do zpěvníku se proto připojí jako příloha odkazem do úložiště, přesně
   * jako u hromadného importu tabů. Přehrávač si ji pak vykreslí.
   */
  /**
   * Otevře tabulaturu ze sbírky rovnou v přehrávači.
   *
   * Soubor se stáhne přes vlastní server a předá jako datová adresa —
   * přehrávač si ji přečte sám a nemusí se kvůli tomu zakládat skladba.
   */
  /**
   * Připojí stažený Guitar Pro soubor ke skladbě ve zpěvníku.
   *
   * Do knihovny se soubor uložil už na serveru, jenže seznam v sekci
   * Guitar Pro čte přílohy skladeb, ne knihovnu — bez tohohle kroku
   * stažený soubor nikde nevidět není a přehrávač ho nenabídne.
   * Když píseň ve zpěvníku ještě není, založí se; z UG chodí interpret
   * i název, takže není co hádat.
   *
   * Vrací název skladby, ke které soubor přibyl, nebo null, když se
   * uložení nepovedlo — stažení tím ale nepadá, soubor v knihovně je.
   */
  const pripojKePisni = async (
    asset: { id: string; name: string; storage_bucket: string; storage_path: string; size_bytes?: number },
    nalez: FreetarSearchResult,
  ): Promise<string | null> => {
    try {
      const priloha = prilohaZAssetu(asset as any);
      const nazev = String(nalez.song || '').trim();
      const interpret = String(nalez.artist || '').trim();
      const stavajici = (songs || []).find(
        (s) =>
          s.title.trim().toLowerCase() === nazev.toLowerCase() &&
          s.artist.trim().toLowerCase() === interpret.toLowerCase(),
      );

      if (stavajici) {
        if (jizPripojeno(stavajici, asset as any)) return `${stavajici.artist} — ${stavajici.title}`;
        await songDatabaseService.saveSong({
          ...stavajici,
          attachments: [...(stavajici.attachments || []), priloha],
          updatedAt: Date.now(),
        });
        return `${stavajici.artist} — ${stavajici.title}`;
      }

      const nova: Song = {
        id: `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: nazev || asset.name.replace(/\.[a-z0-9]+$/i, ''),
        artist: interpret || 'Ultimate Guitar',
        key: '',
        bpm: 120,
        content: '',
        chordsUsed: [],
        attachments: [priloha],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const ulozena = await songDatabaseService.saveSong(nova);
      onSongImported(ulozena);
      return `${ulozena.artist} — ${ulozena.title}`;
    } catch {
      return null;
    }
  };

  const otevriVPrehravaci = async (entry: TabLibraryEntry) => {
    if (!onOtevritVPrehravaci) return;
    setStatusMessage(null);
    const url = await tabLibraryService.fileUrl(entry);
    if (!url) {
      setStatusMessage({
        type: 'error',
        text: `„${entry.title}" je zatím jen v rejstříku — soubor nahraný není.`,
      });
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dataUrl: string = await new Promise((hotovo, chyba) => {
        const ctecka = new FileReader();
        ctecka.onload = () => hotovo(ctecka.result as string);
        ctecka.onerror = chyba;
        ctecka.readAsDataURL(blob);
      });
      onOtevritVPrehravaci({
        dataUrl,
        filename: `${entry.title}.${entry.format}`,
        artist: entry.artist,
      });
      setStatusMessage({ type: 'success', text: `„${entry.title}" je v přehrávači.` });
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: `Soubor se nepodařilo načíst: ${e?.message || e}` });
    }
  };

  const handleImportLibraryEntry = async (entry: TabLibraryEntry) => {
    setStatusMessage(null);
    const url = await tabLibraryService.fileUrl(entry);
    if (!url) {
      setStatusMessage({
        type: 'error',
        text: `Soubor „${entry.title}" ještě není nahraný — je zatím jen v rejstříku sbírky.`,
      });
      return;
    }

    const newSong: Song = {
      id: crypto.randomUUID(),
      title: entry.title,
      artist: entry.artist,
      key: 'C',
      bpm: 120,
      content: '',
      chordsUsed: [],
      attachments: [
        {
          id: crypto.randomUUID(),
          name: `${entry.title}.${entry.format}`,
          type: 'guitarpro',
          dataUrl: url,
          storageBucket: entry.storageBucket || 'assets',
          storagePath: entry.storagePath || undefined,
          size: entry.sizeBytes || undefined,
          uploadedAt: Date.now(),
        } as SongAttachment,
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onSongImported(newSong);
    setStatusMessage({
      type: 'success',
      text: `„${entry.artist} — ${entry.title}" přidán do zpěvníku i s tabulaturou.`,
    });
  };

  const handleImportToSongbook = async (resultOrSong: FreetarSearchResult | any) => {
    if (resultOrSong.source === 'library' && resultOrSong.libraryEntry) {
      return handleImportLibraryEntry(resultOrSong.libraryEntry);
    }

    setStatusMessage(null);
    let songData = resultOrSong;

    // Řádek z výsledků nese jen odkaz, obsah se musí došáhnout. Rozpozná se
    // podle toho, že ještě nemá `content` — dřív se testovalo `path`, které
    // ale výsledky z Ultimate Guitar nemají, takže by se importovala
    // prázdná skladba.
    if (resultOrSong.url && !resultOrSong.content) {
      try {
        const res = await fetch(`${tabEndpointFor(resultOrSong)}?url=${encodeURIComponent(resultOrSong.url)}`);
        const data = await res.json();
        if (data.success && data.song) {
          songData = data.song;
        } else {
          setStatusMessage({
            type: 'error',
            text: data.error || 'Obsah tabulatury se nepodařilo stáhnout.',
          });
          return;
        }
      } catch (e: any) {
        setStatusMessage({ type: 'error', text: 'Chyba při stahování tabulatury: ' + e?.message });
        return;
      }
    }

    const newSong: Song = {
      id: crypto.randomUUID(),
      title: songData.title || songData.song || 'Skladba z Freetar',
      artist: songData.artist || 'Neznámý interpret',
      key: songData.key || 'C',
      bpm: songData.bpm || 120,
      content: songData.content || `[C]Skladba: ${songData.song || songData.title}\n[G]Zdroj: ${songData.url || 'Freetar.de'}`,
      // Akordy se vytáhnou z textu, i když je zdroj nepošle: v hranatých
      // závorkách v obsahu jsou a ve zpěvníku se pak dají promítnout na
      // hmatník i klavír.
      chordsUsed: songData.chordsUsed?.length
        ? songData.chordsUsed
        : extractUniqueChords(songData.content || ''),
      attachments: [
        {
          id: 'att_' + Date.now(),
          name: `${songData.artist || 'Freetar'} - ${songData.title || 'Tab'}.txt`,
          type: 'txt',
          dataUrl: 'data:text/plain;charset=utf-8,' + encodeURIComponent(songData.content || ''),
          size: (songData.content || '').length,
          uploadedAt: Date.now(),
          parsedData: {
            title: songData.title,
            artist: songData.artist,
            extractedText: songData.content,
          },
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: 'Freetar.de',
    };

    onSongImported(newSong);
    setStatusMessage({
      type: 'success',
      text: `Skladba "${newSong.title}" (${newSong.artist}) byla úspěšně přidána do Song Library!`,
    });
    setPreviewTab(null);
  };

  // Browser Navigation
  const navigateBrowser = (url: string) => {
    setIsNavigating(true);
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://freetar.de/search?search_term=${encodeURIComponent(cleanUrl)}`;
    }
    setCurrentUrl(cleanUrl);
    setIframeUrl(`/api/freetar-proxy?url=${encodeURIComponent(cleanUrl)}`);
  };

  // Listen to navigation events from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'FREETAR_NAVIGATED') {
        const navigatedUrl = event.data.url;
        if (navigatedUrl && navigatedUrl !== currentUrl) {
          setCurrentUrl(navigatedUrl);
          setIsNavigating(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [currentUrl]);

  // Filtered search results by tab type
  const filteredResults = searchResults.filter((r) => {
    if (typeFilter === 'all') return true;
    const t = r.type.toLowerCase();
    if (typeFilter === 'chords') return t.includes('chord') || t.includes('akord');
    if (typeFilter === 'tabs') return t.includes('tab') && !t.includes('bass') && !t.includes('pro');
    if (typeFilter === 'bass') return t.includes('bass') || t.includes('basa');
    if (typeFilter === 'guitarpro') return t.includes('pro') || t.includes('gp') || t.includes('guitar pro');
    return true;
  });

  return (
    <div className={vlozeny ? 'space-y-4 font-sans text-white' : 'space-y-6 font-sans text-white pb-12'}>
      
      {/* Hlavička. Uvnitř jiné sekce se vynechá — svůj nadpis už tam je. */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 ${
          vlozeny
            ? ''
            : 'bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl'
        }`}
      >
        {/* Titulek se uvnitř jiné sekce vynechá — nadpis už tam je.
            Přepínač režimů ale zůstává: bez něj by nešlo přepnout na
            vlastní sbírku, což je zrovna to, co se tady hledá nejvíc. */}
        <div className={`flex items-center gap-3.5 ${vlozeny ? 'hidden' : ''}`}>
          <div className="p-3 bg-znacka/10 border border-znacka/30 text-znacka rounded-2xl">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-znacka text-black font-bold px-2 py-0.5 text-stitek rounded-md uppercase tracking-wide">
                Freetar.de
              </span>
              <span className="text-xs text-neutral-400 font-medium">Oficiální repozitář tabulatur</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight mt-0.5">
              Integrovaný vyhledávač akordů &amp; tabů
            </h2>
          </div>
        </div>

        {/* Mode Switcher */}
        {/* Tri rezimy vedle sebe se na uzkem okne nevesly a rada se
            orizla. Zalomeni je lepsi nez schovany treti rezim. */}
        <div className="flex flex-wrap items-center gap-1 bg-black/40 p-1 rounded-2xl border border-white/10">
          <button
            onClick={() => setActiveMode('native_search')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              activeMode === 'native_search'
                ? 'bg-white text-black font-bold shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" /> Nativní vyhledávač
          </button>
          <button
            onClick={() => setActiveMode('sbirka')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              activeMode === 'sbirka'
                ? 'bg-white text-black font-bold shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Library className="w-3.5 h-3.5" /> Naše sbírka
          </button>
          <button
            onClick={() => setActiveMode('live_browser')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              activeMode === 'live_browser'
                ? 'bg-white text-black font-bold shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Živý prohlížeč Freetar
          </button>
        </div>
      </div>

      {/* Global Status Message */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between border shadow-lg ${
            statusMessage.type === 'success'
              ? 'bg-uspech/10 border-uspech/30 text-uspech'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs text-neutral-400 hover:text-white cursor-pointer"
          >
            ✕ Zavřít
          </button>
        </div>
      )}

      {/* MODE 2: CO MÁME DOMA */}
      {activeMode === 'sbirka' && (
        <PrehledSbirky
          onOtevrit={onOtevritVPrehravaci ? (e) => { void otevriVPrehravaci(e); } : undefined}
          onImportovat={(e) => { void handleImportLibraryEntry(e); }}
        />
      )}

      {/* MODE 1: NATIVE SEARCH & TAB VIEWER */}
      {activeMode === 'native_search' && (
        <div className="space-y-6">
          
          {/* Search Box & Quick Tags */}
          <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteSearch(searchQuery);
              }}
              className="flex flex-wrap gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Zadejte název písně nebo interpreta (např. Wonderwall, Pink Floyd, Kabát)..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-znacka outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-3 bg-znacka hover:bg-znacka-svetla text-black font-bold text-xs uppercase rounded-2xl flex items-center gap-2 transition-all shadow-lg shrink-0 disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {isSearching ? (
                  <>
                    <Disc className="w-4 h-4 animate-spin" /> Vyhledávám...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" /> Vyhledat na Freetar
                  </>
                )}
              </button>
            </form>

            {/* Ukládání nálezů. Patří k vyhledávání, protože rozhoduje
                o tom, co se stane hned po otevření tabulatury. */}
            <label className="flex items-center gap-2 text-drobne text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={ukladatSam}
                onChange={(e) => {
                  setUkladatSam(e.target.checked);
                  localStorage.setItem('neverlate_ug_automaticky', e.target.checked ? 'ano' : 'ne');
                }}
                className="accent-znacka cursor-pointer"
              />
              Otevřenou tabulaturu rovnou uložit do zpěvníku i s akordy
            </label>

            {/* Tipy na kapely místo pevného seznamu osmi jmen.
                Jen světové: tabulatury k českým kapelám tu skoro nejsou,
                takže by česká řada vedla na prázdné výsledky. */}
            <TipyKapel
              oblasti={['svet']}
              onVybrat={(jmeno) => {
                setSearchQuery(jmeno);
                handleExecuteSearch(jmeno);
              }}
            />
          </div>

          {/* Type Filter & Results Count */}
          {searchResults.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 p-3 rounded-2xl border border-white/5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-neutral-400 font-medium mr-1">Filtrovat typ:</span>
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    typeFilter === 'all'
                      ? 'bg-white text-black font-bold shadow-md'
                      : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
                  }`}
                >
                  Vše ({searchResults.length})
                </button>
                <button
                  onClick={() => setTypeFilter('chords')}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    typeFilter === 'chords'
                      ? 'bg-uspech text-black font-bold shadow-md'
                      : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
                  }`}
                >
                  Akordy (Chords)
                </button>
                <button
                  onClick={() => setTypeFilter('tabs')}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    typeFilter === 'tabs'
                      ? 'bg-info text-white font-bold shadow-md'
                      : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
                  }`}
                >
                  Kytarové Taby
                </button>
                <button
                  onClick={() => setTypeFilter('bass')}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    typeFilter === 'bass'
                      ? 'bg-znacka text-black font-bold shadow-md'
                      : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
                  }`}
                >
                  Basa
                </button>
                <button
                  onClick={() => setTypeFilter('guitarpro')}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    typeFilter === 'guitarpro'
                      ? 'bg-nastroj text-white font-bold shadow-md'
                      : 'bg-white/5 text-neutral-400 hover:text-white border border-white/5'
                  }`}
                >
                  Guitar Pro
                </button>
              </div>

              <div className="text-xs text-neutral-400 font-medium">
                Zobrazeno <strong className="text-white">{filteredResults.length}</strong> z {searchResults.length} výsledků
              </div>
            </div>
          )}

          {/* Search Error Alert */}
          {searchError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-xs text-red-300 flex items-center gap-2.5 font-medium">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
              <span>{searchError}</span>
            </div>
          )}

          {/* Search Results Table */}
          {filteredResults.length > 0 && (
            <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5 text-neutral-400 font-medium">
                      <th className="p-4">Interpret</th>
                      <th className="p-4">Název skladby</th>
                      <th className="p-4">Typ tabu</th>
                      <th className="p-4">Hodnocení</th>
                      <th className="p-4 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredResults.map((res) => {
                      const isChords = res.type.toLowerCase().includes('chord');
                      const isBass = res.type.toLowerCase().includes('bass');
                      const isGp = res.type.toLowerCase().includes('pro');

                      return (
                        <tr key={res.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="p-4 font-bold text-znacka">{res.artist}</td>
                          <td className="p-4 font-semibold text-white group-hover:text-info transition-colors">
                            {res.song}
                          </td>
                          <td className="p-4">
                            <span
                              className={`px-2.5 py-1 text-drobne font-semibold rounded-lg border ${
                                isChords
                                  ? 'bg-uspech/10 text-uspech border-uspech/30'
                                  : isBass
                                  ? 'bg-znacka/10 text-znacka border-znacka/30'
                                  : isGp
                                  ? 'bg-nastroj/10 text-nastroj border-nastroj/30'
                                  : 'bg-info/10 text-info border-info/30'
                              }`}
                            >
                              {res.type}
                            </span>
                          </td>
                          <td className="p-4 text-neutral-300">
                            {res.rating ? (
                              <span className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 text-znacka fill-current" />
                                {res.rating}
                              </span>
                            ) : (
                              <span className="text-neutral-600">—</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handlePreviewTab(res)}
                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-info font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                                title="Zobrazit náhled skladby a akordů"
                              >
                                <Eye className="w-3.5 h-3.5" /> Náhled
                              </button>
                              <button
                                onClick={() => handleImportToSongbook(res)}
                                className="px-3 py-1.5 bg-uspech hover:bg-uspech-svetla text-black font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
                                title="Importovat přímo do Song Library"
                              >
                                <Plus className="w-3.5 h-3.5" /> Do Song Library
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Initial State / Placeholder when no search executed yet */}
          {searchResults.length === 0 && !isSearching && !searchError && (
            <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-12 text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 rounded-full bg-znacka/10 border border-znacka/20 flex items-center justify-center mx-auto text-znacka">
                <Globe className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Vyhledávejte z desítek tisíc tabů a akordů na Freetar.de
                </h3>
                <p className="text-xs text-neutral-400 max-w-md mx-auto mt-1.5">
                  Zadejte název oblíbené písně výše. Výsledky můžete okamžitě číst, transponovat nebo jedním kliknutím uložit do svého zpěvníku.
                </p>
              </div>
            </div>
          )}

        </div>
      )}

      {/* MODE 2: LIVE BROWSER WITH PROXY */}
      {activeMode === 'live_browser' && (
        <div className="space-y-4">
          
          {/* Browser Address & Control Bar */}
          <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-3.5 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigateBrowser('https://freetar.de')}
                className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white cursor-pointer transition-all"
                title="Domů"
              >
                <Home className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setIframeUrl(`/api/freetar-proxy?url=${encodeURIComponent(currentUrl)}&t=${Date.now()}`);
                }}
                className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white cursor-pointer transition-all"
                title="Obnovit stránku"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Address Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigateBrowser(directInput || currentUrl);
              }}
              className="flex-1 min-w-[250px] flex gap-2"
            >
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={directInput || currentUrl}
                  onChange={(e) => setDirectInput(e.target.value)}
                  placeholder="https://freetar.de nebo hledaný výraz..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-uspech font-mono focus:border-znacka outline-none"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-semibold text-white cursor-pointer transition-all"
              >
                Přejít
              </button>
            </form>

            {/* Import Page & Resize Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setStatusMessage({ type: 'success', text: 'Stahuji a importuji aktuální zobrazenou skladbu...' });
                  try {
                    const res = await fetch(`/api/freetar-tab?url=${encodeURIComponent(currentUrl)}`);
                    const data = await res.json();
                    if (data.success && data.song) {
                      handleImportToSongbook(data.song);
                    } else {
                      setStatusMessage({ type: 'error', text: 'Na této stránce nebyla nalezena čitelná tabulatura.' });
                    }
                  } catch (e: any) {
                    setStatusMessage({ type: 'error', text: 'Chyba při importu: ' + e?.message });
                  }
                }}
                className="px-4 py-2 bg-uspech hover:bg-uspech-svetla text-black font-bold text-xs uppercase rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
              >
                <Download className="w-4 h-4" /> Import stránky
              </button>

              <button
                onClick={() => setIsFullscreen((prev) => !prev)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white cursor-pointer transition-all"
                title={isFullscreen ? 'Zmenšit okno' : 'Plná velikost'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Embedded Iframe */}
          <div
            className={`bg-black/60 rounded-3xl border border-white/10 relative overflow-hidden transition-all shadow-xl ${
              isFullscreen ? 'fixed inset-0 z-50 p-4 bg-black/95 rounded-none' : ''
            }`}
            style={{ height: isFullscreen ? '100vh' : `${windowHeightPx}px` }}
          >
            {isNavigating && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-10 flex items-center justify-center gap-2 text-xs font-semibold text-znacka">
                <Disc className="w-5 h-5 animate-spin" /> Načítám Freetar.de...
              </div>
            )}
            <iframe
              src={iframeUrl}
              className="w-full h-full border-none rounded-3xl"
              title="Freetar.de Web Explorer"
              onLoad={() => setIsNavigating(false)}
            />
          </div>

        </div>
      )}

      {/* TAB PREVIEW / READING MODAL */}
      {previewTab && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-plocha-2 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {previewTab.artist} — {previewTab.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-neutral-400 mt-0.5">
                  {previewTab.key && <span>Tónina: <strong className="text-uspech">{previewTab.key}</strong></span>}
                  {previewTab.capo && <span>Capo: <strong className="text-znacka">{previewTab.capo}</strong></span>}
                  {previewTab.tuning && <span>Ladění: <strong className="text-white">{previewTab.tuning}</strong></span>}
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => handleImportToSongbook(previewTab)}
                  className="px-4 py-2 bg-uspech hover:bg-uspech-svetla text-black text-xs font-bold uppercase rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Uložit do Song Library
                </button>
                <button
                  onClick={() => setPreviewTab(null)}
                  className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/5 cursor-pointer transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Formatted Tab Reader */}
            <div className="p-6 overflow-y-auto flex-1 bg-black/40 space-y-4">
              {/* Chords used pills */}
              {previewTab.chordsUsed && previewTab.chordsUsed.length > 0 && (
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-neutral-400 font-medium">Použité akordy:</span>
                  {previewTab.chordsUsed.map((ch: string) => (
                    <span
                      key={ch}
                      className="px-3 py-1 bg-uspech/10 text-uspech border border-uspech/30 rounded-xl text-xs font-bold font-mono"
                    >
                      {ch}
                    </span>
                  ))}
                </div>
              )}

              {/* Tab text body */}
              <div className="bg-black/60 p-5 rounded-2xl border border-white/5">
                <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-200 leading-relaxed select-text">
                  {previewTab.content}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-neutral-400">
              <span>Zdroj: {previewTab.sourceName || 'Freetar.de'}</span>
              <button
                onClick={() => setPreviewTab(null)}
                className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold cursor-pointer transition-all"
              >
                Zavřít náhled
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
