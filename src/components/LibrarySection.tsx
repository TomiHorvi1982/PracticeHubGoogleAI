import React, { useState, useEffect, useRef } from 'react';
import { usePamet, usePametMnoziny } from '../hooks/usePamet';
import { WaveformPrehravac } from './songbook/WaveformPrehravac';
import { PdfNahled } from './songbook/PdfNahled';
import {
  najdiPisenProSoubor, jizPripojeno, prilohaZAssetu, rozeberNazevSouboru,
} from '../services/priradKPisni';
import { songDatabaseService } from '../services/songDatabaseService';
import { nactiObsahJakoUrl, assetLibraryService, LibraryAsset } from '../services/assetLibraryService';
import { authService } from '../services/authService';
import { StromKnihovny } from './knihovna/StromKnihovny';
import { MistoVUlozisti } from './knihovna/MistoVUlozisti';
import { PohledSamples } from './knihovna/PohledSamples';
import { UzelStromu, PODLE_ID, navrhniPodkategorii, nazevKategorie } from '../services/knihovnaStrom';
import { prevedNaMp3, jePrevoditelny, Kvalita } from '../services/prevodNaMp3';
import { SbirkyPanel } from './knihovna/SbirkyPanel';
import { HromadneAkce } from './knihovna/HromadneAkce';
import { NahravaniSouboru } from './knihovna/NahravaniSouboru';
import { Sbirka, nactiSbirky } from '../services/sbirkyService';
import {
  FolderArchive,
  FileSpreadsheet,
  FileText,
  Layers,
  Image as ImageIcon,
  Music,
  FileUp,
  Search,
  Plus,
  Play,
  Pause,
  Download,
  Trash2,
  Eye,
  CheckCircle,
  AlertCircle,
  Loader2,
  Filter,
  ExternalLink,
  Volume2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sparkles,
  BookOpen,
  ArrowRight,
  Disc,
  AlignJustify,
  LayoutGrid,
  Pencil,
  X,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Song, SongAttachment } from '../types';
import { parseAnyFile, fileToDataUrl } from '../utils/fileParsers';
import { GuitarProPlayer } from './GuitarProPlayer';
import { audioSynth, midiToNoteName } from '../services/audioSynth';
import { Midi } from '@tonejs/midi';

export type LibraryCategory = 'all' | 'guitarpro' | 'pdf' | 'txt' | 'image' | 'midi' | 'audio';

export interface LibraryItem {
  id: string;
  name: string;
  type: 'guitarpro' | 'pdf' | 'txt' | 'image' | 'midi' | 'audio';
  dataUrl: string;
  size: number;
  uploadedAt: number;
  artist?: string;
  songTitle?: string;
  bpm?: number;
  key?: string;
  extractedText?: string;
  trackNames?: string[];
  songId?: string; // If attached to a song in songbook
}

interface LibrarySectionProps {
  songs: Song[];
  onAddSong?: (song: Song) => void;
  onUpdateSongs?: (songs: Song[] | ((prev: Song[]) => Song[])) => void;
  onSelectSongForPlayback?: (song: Song) => void;
  onAttachToSong?: (songId: string, attachment: SongAttachment) => void;
}


export const LibrarySection: React.FC<LibrarySectionProps> = ({
  songs,
  onAddSong,
  onUpdateSongs,
  onSelectSongForPlayback,
  onAttachToSong,
}) => {
  // Knihovna se bere z databáze, ne z prohlížeče. Dřív žila v localStorage,
  // takže ji viděl jen ten, kdo do ní nahrál — na jiném počítači byla prázdná
  // a vyčištění prohlížeče ji smazalo.
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [celkemVKnihovne, setCelkemVKnihovne] = useState(0);
  const [nacitamKnihovnu, setNacitamKnihovnu] = useState(false);

  /**
   * Výběr ve stromu. `kategorie === null` znamená celou knihovnu,
   * `podkategorie === '__bez__'` hromádku nezařazených.
   */
  // Filtry, hledání a otevřený náhled si sekce pamatuje — po návratu se
  // nemusí hledat znovu to, co tu bylo před přepnutím.
  const [kategorieFiltr, setKategorieFiltr] = usePamet<string | null>('knihovna_kategorie', null);
  const [podkategorieFiltr, setPodkategorieFiltr] = usePamet<string | null>('knihovna_podkategorie', null);
  const [uzly, setUzly] = useState<UzelStromu[]>([]);
  /** Sbírky do nabídky u nahrávání — ať jde dávku rovnou zařadit. */
  const [sbirky, setSbirky] = useState<Sbirka[]>([]);
  useEffect(() => { void nactiSbirky().then(setSbirky); }, []);
  /** Soubor, který se právě táhne na složku. */
  const [tazeny, setTazeny] = useState<string | null>(null);
  const [prejmenovavany, setPrejmenovavany] = useState<{ id: string; nazev: string } | null>(null);
  const jsemSpravce = authService.getCurrentUser()?.role === 'admin';
  const [searchQuery, setSearchQuery] = usePamet('knihovna_hledani', '');
  /** Označené soubory pro hromadné akce. */
  const [oznacene, setOznacene] = usePametMnoziny('knihovna_oznacene');
  /** Probíhá hromadné mazání — ať se nedá spustit dvakrát. */
  const [mazuHromadne, setMazuHromadne] = useState(false);
  const [activeItem, setActiveItem] = useState<LibraryItem | null>(() => libraryItems[0] || null);

  /** Hraje se? Ptají se na to naplánované noty, proto ref a ne stav. */
  const hrajeMidiRef = useRef(false);
  /** Naplánované noty, aby po zastavení opravdu zmlkly. */
  const casovaceNotRef = useRef<number[]>([]);
  /** Vytvořené blob adresy — po odchodu se musí uvolnit, jinak drží paměť. */
  const blobRef = useRef<string[]>([]);
  useEffect(() => () => { blobRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  /**
   * Co se ukazuje: soubory, nebo zvuky.
   *
   * Sample se nevybírá podle názvu a data, ale podle toho, jak zní a jestli
   * sedne do tempa. Proto má vlastní pohled — v seznamu souborů by to byly
   * jen další řádky.
   */
  const [pohled, setPohled] = usePamet<'soubory' | 'samples' | 'sbirky'>('knihovna_pohled', 'soubory');

  /**
   * Zmenšovat zvuky před nahráním?
   *
   * Jedna stopa ve WAV má padesát megabajtů, MP3 ve 192 kbps sedm. Volba
   * zůstává, protože kdo si nahrává mistr pásky, ten ztrátový formát
   * nechce — jen ať ví, že za to platí místem.
   */
  const [prevadetZvuk, setPrevadetZvuk] = useState(
    () => localStorage.getItem('neverlate_prevod_mp3') !== 'ne',
  );
  const [kvalitaMp3, setKvalitaMp3] = useState<Kvalita>(
    () => (Number(localStorage.getItem('neverlate_kvalita_mp3')) || 192) as Kvalita,
  );
  /** Kde je převod — u padesátimegového souboru to chvíli trvá. */
  const [prevod, setPrevod] = useState<{ nazev: string; procent: number } | null>(null);

  // View Mode: 'detailed' vs 'compact' (1-line: Name - Artist)
  const [libraryListViewMode, setLibraryListViewMode] = usePamet<'detailed' | 'compact'>(
    'knihovna_zobrazeni', 'detailed'
  );

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Attach modal state
  const [attachingItemId, setAttachingItemId] = useState<string | null>(null);

  // Image controls
  const [imgZoom, setImgZoom] = useState(1);
  const [imgRotation, setImgRotation] = useState(0);
  const [imgInvert, setImgInvert] = useState(false);

  // MIDI playback
  const [isPlayingMidi, setIsPlayingMidi] = useState(false);

  useEffect(() => {
    // Zastavení musí zrušit i noty, které už čekají ve frontě — jinak by
    // dohrávaly ještě dlouho potom, co přehrávač hlásí, že stojí.
    if (!isPlayingMidi) {
      casovaceNotRef.current.forEach((id) => window.clearTimeout(id));
      casovaceNotRef.current = [];
    }
  }, [isPlayingMidi]);
  const [midiProgress, setMidiProgress] = useState(0);
  const [midiDuration, setMidiDuration] = useState(0);
  const midiTimerRef = useRef<any>(null);

  // TXT Transpose state
  const [txtTranspose, setTxtTranspose] = useState(0);

  /** Z čeho appka pozná typ souboru — podle přípony, ne podle kategorie. */
  /**
   * Které kategorie v databázi tlačítko znamená.
   *
   * Tlačítka mluví o typu souboru, kdežto databáze třídí podle toho, k čemu
   * soubor slouží — bicí sampl i backing track jsou obojí .wav. Bez tohohle
   * převodu se filtrovalo až v prohlížeči, tedy jen v načtené stránce:
   * u PDF se z 236 souborů ukázalo dvacet, protože zbytek se nestáhl.
   */
  const KATEGORIE_V_DATABAZI: Record<string, string | undefined> = {
    all: undefined,
    guitarpro: 'guitar_pro',
    pdf: 'pdf',
    midi: 'midi',
    image: 'images',
    audio: 'drum_kit_sample,drum_loop,stem_mix,recordings,backing_tracks,samples',
    // Texty nejsou soubory v knihovně — bydlí v písních. Filtruje se dál
    // v prohlížeči, protože na serveru není podle čeho.
    txt: undefined,
  };

  /**
   * Jaký druh assetu složce odpovídá.
   *
   * Server podle `asset_type` volí větev v R2, takže nemůže zůstat na
   * příponě: stopa do pultu i bicí sampl jsou obojí .wav, ale patří
   * každý jinam.
   */
  const mbTxt = (b: number) =>
    b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} kB`;

  const typAssetuProKategorii = (
    kategorie: string,
    typ: LibraryItem['type'],
  ): LibraryAsset['asset_type'] => {
    switch (kategorie) {
      case 'guitar_pro': return 'guitar_pro';
      case 'pdf': return 'pdf';
      case 'midi': return 'midi';
      case 'images': case 'band_photos': return 'image';
      case 'stem_mix': return 'stem';
      case 'recordings': return 'recording';
      case 'drum_kit_sample': case 'drum_loop': case 'bass_sample':
      case 'guitar_sample': case 'vocal_sample': case 'samples':
        return 'sample';
      case 'backing_tracks': return 'audio';
      default:
        return typ === 'guitarpro' ? 'guitar_pro'
          : typ === 'pdf' ? 'pdf'
          : typ === 'midi' ? 'midi'
          : typ === 'image' ? 'image'
          : typ === 'audio' ? 'audio'
          : 'preset';
    }
  };

  const typSouboru = (a: LibraryAsset): LibraryItem['type'] => {
    const jm = `${a.original_filename || a.name}`.toLowerCase();
    if (/\.(gp|gp3|gp4|gp5|gpx|gtp)$/.test(jm)) return 'guitarpro';
    if (jm.endsWith('.pdf')) return 'pdf';
    if (/\.(mid|midi)$/.test(jm)) return 'midi';
    if (/\.(jpe?g|png|webp|gif)$/.test(jm)) return 'image';
    // Zvuk se pozná dřív než text, jinak by vzorky bicích spadly do „txt"
    // a v náhledu by se z nich pokusil vypsat obsah.
    if (/\.(wav|mp3|ogg|flac|aiff?|m4a)$/.test(jm)) return 'audio';
    return 'txt';
  };

  /**
   * Načte stránku knihovny.
   *
   * `dataUrl` zůstává prázdná — podepsaná adresa se shání až ve chvíli, kdy
   * si položku někdo vybere. Podepsat dopředu dvacet tisíc souborů by
   * znamenalo dvacet tisíc zbytečných požadavků.
   */
  const nactiKnihovnu = async (dotaz: string, _kategorie?: string, pridat = false) => {
    setNacitamKnihovnu(true);
    try {
      const offset = pridat ? libraryItems.length : 0;
      const { assets, total } = await assetLibraryService.listPage({
        search: dotaz.trim() || undefined,
        category: kategorieFiltr || undefined,
        subcategory: podkategorieFiltr || undefined,
        limit: 200,
        offset,
        sort: 'name',
      });
      const nove = assets.map((a) => ({
        id: a.id,
        name: a.name,
        type: typSouboru(a),
        dataUrl: '',
        size: Number(a.size_bytes || 0),
        uploadedAt: new Date(a.created_at).getTime(),
      }));
      // Při „načíst další" se přidává, jinak se seznam vymění — jinak by
      // přepnutí kategorie nechalo na obrazovce i soubory té předchozí.
      setLibraryItems((p) => (pridat ? [...p, ...nove] : nove));
      setCelkemVKnihovne(total);
    } catch (e) {
      console.warn('[knihovna] načtení selhalo', e);
    } finally {
      setNacitamKnihovnu(false);
    }
  };

  // Přepnutí kategorie je nový dotaz do databáze, ne jiný pohled na to,
  // co je zrovna načtené.
  useEffect(() => {
    const id = window.setTimeout(() => nactiKnihovnu(searchQuery), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, kategorieFiltr, podkategorieFiltr]);

  /** Strom se přepočítá po každé změně — přeřazení i smazání ho mění. */
  const nactiStrom = async () => {
    setUzly(await assetLibraryService.strom());
  };

  useEffect(() => {
    void nactiStrom();
    const znovu = () => void nactiStrom();
    window.addEventListener('neverlate:soubor-nahran', znovu);
    return () => window.removeEventListener('neverlate:soubor-nahran', znovu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Přeřadí soubor do jiné složky.
   *
   * Seznam se překreslí až po odpovědi serveru. Přesunout ho v prohlížeči
   * napřed by při neúspěchu ukázalo soubor tam, kam se nikdy nedostal.
   */
  const prerad = async (id: string, kategorie: string, podkategorie: string | null) => {
    try {
      await assetLibraryService.prerad(id, { category: kategorie, subcategory: podkategorie });
      await Promise.all([nactiKnihovnu(searchQuery), nactiStrom()]);
    } catch (e: any) {
      alert(e?.message || 'Přeřazení se nepovedlo.');
    }
  };

  const prejmenuj = async (id: string, nazev: string) => {
    const cisty = nazev.trim();
    if (!cisty) return;
    try {
      await assetLibraryService.rename(id, cisty);
      setPrejmenovavany(null);
      await nactiKnihovnu(searchQuery);
    } catch (e: any) {
      alert(e?.message || 'Přejmenování se nepovedlo.');
    }
  };

  /**
   * Adresa souboru se shání až při výběru — a jen jednou.
   *
   * Když se nezíská, musí to být vidět. Dřív se tiše nestalo nic a náhled
   * napořád ukazoval „připravuji“, takže nešlo poznat, jestli se soubor
   * načítá, nebo je rozbitý.
   */
  const [chybaOdkazu, setChybaOdkazu] = useState<string | null>(null);
  const [shanimOdkaz, setShanimOdkaz] = useState(false);

  /**
   * Otevřené zvukové náhledy, od nejstaršího dolů.
   *
   * Zvuky se skládají pod sebe, nepřepisují se. Při skládání písně nebo
   * porovnávání stop je potřeba slyšet dva a tři kusy vedle sebe, a s
   * jedním okénkem se pořád klikalo tam a zpátky. U ostatních typů to
   * smysl nedává — dvě otevřené tabulatury pod sebou jsou jen dvakrát
   * tolik rolování.
   */
  const [zvukoveNahledy, setZvukoveNahledy] = useState<LibraryItem[]>([]);

  /** Přidá zvuk do sloupce náhledů; už otevřený se jen posune do popředí. */
  const otevriZvuk = (item: LibraryItem) => {
    setZvukoveNahledy((p) => (p.some((x) => x.id === item.id) ? p : [...p, item]));
  };

  // Každý náhled si musí dotáhnout vlastní obsah — křivka se kreslí
  // z bajtů, ne z odkazu do knihovny.
  useEffect(() => {
    const chybejici = zvukoveNahledy.filter((n) => !n.dataUrl && !n.id.startsWith('song_att_'));
    if (!chybejici.length) return;
    let zruseno = false;
    void (async () => {
      for (const n of chybejici) {
        try {
          const url = await nactiObsahJakoUrl(n.id);
          if (zruseno) {
            URL.revokeObjectURL(url);
            return;
          }
          blobRef.current.push(url);
          setZvukoveNahledy((p) => p.map((x) => (x.id === n.id ? { ...x, dataUrl: url } : x)));
        } catch {
          /* co se nenačte, zůstane v seznamu bez křivky */
        }
      }
    })();
    return () => {
      zruseno = true;
    };
  }, [zvukoveNahledy]);

  useEffect(() => {
    setChybaOdkazu(null);
    if (!activeItem || activeItem.dataUrl) return;

    // Položky poskládané z příloh písní mají vlastní `id` s předponou;
    // v knihovně souborů pod ním nic není a ptát se na ně nemá smysl.
    if (activeItem.id.startsWith('song_att_')) {
      setChybaOdkazu('Tenhle soubor je přílohou skladby a nemá odkaz do knihovny.');
      return;
    }

    let zruseno = false;
    setShanimOdkaz(true);
    (async () => {
      try {
        // Stahuje se přes náš server a výsledek se podá jako blob adresa.
        // Podepsaný odkaz míří přímo do R2, tedy na cizí doménu, kterou
        // prohlížeč pro `fetch` blokuje, dokud se původ ručně nepovolí —
        // právě kvůli tomu se nenačítaly tabulatury ani MIDI.
        const url = await nactiObsahJakoUrl(activeItem.id);
        if (zruseno) {
          URL.revokeObjectURL(url);
          return;
        }
        blobRef.current.push(url);
        setActiveItem((p) => (p && p.id === activeItem.id ? { ...p, dataUrl: url } : p));
      } catch (e: any) {
        if (!zruseno) setChybaOdkazu(e?.message || 'Soubor se nepodařilo získat.');
      } finally {
        if (!zruseno) setShanimOdkaz(false);
      }
    })();
    return () => { zruseno = true; };
  }, [activeItem?.id]);

  // Combine items with attachments from songs
  const allCombinedItems = React.useMemo(() => {
    const songAttachments: LibraryItem[] = songs.flatMap((s) =>
      (s.attachments || []).map((att) => ({
        id: 'song_att_' + att.id,
        name: att.name,
        type: att.type === 'audio' ? 'midi' : (att.type as any),
        dataUrl: att.dataUrl,
        size: att.size || 0,
        uploadedAt: att.uploadedAt,
        artist: s.artist,
        songTitle: s.title,
        songId: s.id,
        bpm: att.parsedData?.bpm || s.bpm,
        key: att.parsedData?.key || s.key,
        extractedText: att.parsedData?.extractedText,
        trackNames: att.parsedData?.trackNames,
      }))
    );

    // Sloučení bez duplicit.
    //
    // Táž příloha se do seznamu dostane dvakrát: jednou jako soubor
    // v knihovně a podruhé jako příloha písně, která na něj odkazuje.
    // Porovnávat název se shodnou velikostí nestačilo — velikost u příloh
    // často chybí a nula ji z porovnání vyřadila, takže se soubor ukázal
    // dvakrát. Rozhoduje proto cesta v úložišti, což je to, co obě podoby
    // opravdu sdílejí.
    const merged = [...libraryItems];
    const zname = new Set(
      merged.map((m) => m.name.toLowerCase().trim())
    );

    songAttachments.forEach((sa) => {
      const uzJe =
        merged.some((m) => m.id === sa.id) ||
        zname.has(sa.name.toLowerCase().trim());
      if (!uzJe) {
        zname.add(sa.name.toLowerCase().trim());
        merged.push(sa);
      }
    });

    // Knihovna sama může tentýž soubor obsahovat víckrát — nahrán z různých
    // stran, pokaždé pod vlastním záznamem. V dlouhém seznamu se pak roluje
    // přes tytéž názvy dokola.
    const bezDuplicit: LibraryItem[] = [];
    const videne = new Set<string>();
    for (const m of merged) {
      const klic = `${m.name.toLowerCase().trim()}|${m.size || 0}`;
      if (videne.has(klic)) continue;
      videne.add(klic);
      bezDuplicit.push(m);
    }

    return bezDuplicit;
  }, [libraryItems, songs]);

  // Filtered items
  const filteredItems = allCombinedItems.filter((item) => {
    // Složku vybírá server. Přílohy písní se přimíchají až v prohlížeči
    // a do žádné složky nepatří, takže se při vybrané složce skryjí.
    const matchesCategory = !kategorieFiltr && !podkategorieFiltr ? true : !item.id.startsWith('song_att_');
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.artist && item.artist.toLowerCase().includes(q)) ||
      (item.songTitle && item.songTitle.toLowerCase().includes(q)) ||
      (item.extractedText && item.extractedText.toLowerCase().includes(q));

    return matchesCategory && matchesSearch;
  });

  // Handle uploading files
  /**
   * Jediná cesta, kterou se soubory dostávají do knihovny.
   *
   * `volby` nesou to, co se dřív dalo zadat jen při importu složky —
   * sbírku, štítky a vynucenou kategorii. Dvě různé cesty dovnitř
   * znamenaly, že u jedné šlo zadat původ a u druhé ne, podle toho, kde
   * zrovna člověk stál.
   */
  const handleUploadFiles = async (
    files: FileList | File[],
    volby?: { kategorie?: string; sbirka?: string; tagy?: string[] },
  ) => {
    setIsProcessing(true);
    setStatusMessage(null);
    let addedCount = 0;

    try {
      const newItems: LibraryItem[] = [];
      /** Co se podařilo přiřadit k písni — vypíše se v hlášce. */
      const priraadene: string[] = [];
      /** Kolik se ušetřilo převodem — taky se vypíše. */
      const zmenseno: string[] = [];

      for (let i = 0; i < files.length; i++) {
        let file = files[i];

        // Zmenšit se musí dřív, než se bajty pošlou — jinak se nahraje
        // padesát megabajtů a teprve pak se ušetří.
        if (prevadetZvuk && jePrevoditelny(file.name)) {
          setPrevod({ nazev: file.name, procent: 0 });
          const v = await prevedNaMp3(file, kvalitaMp3, (p) =>
            setPrevod({ nazev: file.name, procent: p }),
          );
          setPrevod(null);
          if (v.prevedeno) {
            zmenseno.push(
              `„${file.name}" ${mbTxt(v.puvodniBajtu)} → ${mbTxt(v.noveBajtu)}`,
            );
            file = v.soubor;
          } else if (v.duvod && v.duvod !== 'není bezeztrátový') {
            setStatusMessage({
              type: 'error',
              text: `„${file.name}" se nepodařilo zmenšit (${v.duvod}) — nahrávám původní soubor.`,
            });
          }
        }

        const parsed = await parseAnyFile(file);

        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let type: LibraryItem['type'] = 'txt';
        if (['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gtp'].includes(ext)) type = 'guitarpro';
        else if (ext === 'pdf') type = 'pdf';
        else if (['mid', 'midi'].includes(ext)) type = 'midi';
        else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'].includes(ext)) type = 'image';
        else if (['wav', 'mp3', 'aif', 'aiff', 'ogg', 'flac', 'm4a'].includes(ext)) type = 'audio';

        const newItem: LibraryItem = {
          id: 'lib_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          name: file.name,
          type,
          dataUrl: parsed.attachment.dataUrl,
          size: file.size,
          uploadedAt: Date.now(),
          artist: parsed.song.artist,
          songTitle: parsed.song.title,
          bpm: parsed.song.bpm,
          key: parsed.song.key,
          extractedText: parsed.attachment.parsedData?.extractedText || parsed.song.content,
          trackNames: parsed.attachment.parsedData?.trackNames,
        };

        // Soubor musí do knihovny doopravdy, ne jen do seznamu na obrazovce.
        //
        // Kam přijde, rozhoduje otevřená složka. Odvozovat kategorii z
        // přípony umí říct jen „tohle je .wav" — ne jestli je to stopa do
        // pultu, smyčka, nebo vokál. Když je složka vybraná, člověk to
        // právě řekl; typ se použije, jen když je otevřená celá knihovna.
        const kategorie =
          volby?.kategorie ||
          kategorieFiltr ||
          (type === 'guitarpro' ? 'guitar_pro'
            : type === 'pdf' ? 'pdf'
            : type === 'midi' ? 'midi'
            : type === 'image' ? 'images'
            : type === 'audio' ? 'samples'
            : 'documents');
        const assetType = typAssetuProKategorii(kategorie, type);
        // „Nezařazené" je hromádka, ne složka — do té se nedá nahrát.
        const podslozka = podkategorieFiltr === '__bez__' ? null : podkategorieFiltr;

        try {
          // Správce plní společnou knihovnu, ostatní si nahrávají svoje.
          const ulozeny = await assetLibraryService.upload(
            file, kategorie, assetType, jsemSpravce ? 'global' : 'private', podslozka,
            {
              sbirka: volby?.sbirka,
              tagy: volby?.tagy,
              // Cesta uvnitř vybrané složky. U jednotlivých souborů je
              // prázdná — prohlížeč ji vyplní jen u výběru celé složky.
              zdrojovaSlozka: slozkaZeSouboru(file),
            },
          );
          newItem.id = ulozeny.id;

          // Soubor si najde píseň, ke které patří, a připojí se k ní.
          // Dřív spadl do knihovny a tím to skončilo — píseň o něm nevěděla
          // a člověk ji k němu musel dohledávat ručně, přestože ke které
          // patří, bývá v názvu souboru napsané.
          const nalez = najdiPisenProSoubor(file.name, songs);
          if (nalez && !jizPripojeno(nalez.song, ulozeny)) {
            await songDatabaseService.saveSong({
              ...nalez.song,
              attachments: [...(nalez.song.attachments || []), prilohaZAssetu(ulozeny)],
              updatedAt: Date.now(),
            });
            priraadene.push(`„${file.name}" → ${nalez.song.artist} – ${nalez.song.title}`);
          } else if (!nalez && kategorie === 'my_songs') {
            /**
             * Do „Mojich skladeb" se nahrává nahrávka, ke které píseň
             * teprve má vzniknout.
             *
             * Jinde se soubor jen připojí k existující písni a když
             * žádná nesedí, zůstane v knihovně ležet. Tady je to obráceně:
             * právě proto se sem nahrává — aby se skladba objevila ve
             * zpěvníku i s nahrávkou, ne aby se pak ručně zakládala.
             */
            const { interpret, nazev } = rozeberNazevSouboru(file.name);
            const nova: Song = {
              id: `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              title: nazev || file.name.replace(/\.[a-z0-9]+$/i, ''),
              artist: interpret || 'Moje nahrávky',
              key: '',
              content: '',
              chordsUsed: [],
              attachments: [prilohaZAssetu(ulozeny)],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            const ulozenaPisen = await songDatabaseService.saveSong(nova);
            priraadene.push(`„${file.name}" → nová skladba ${ulozenaPisen.artist} – ${ulozenaPisen.title}`);
          }
        } catch (e: any) {
          setStatusMessage({ type: 'error', text: `„${file.name}" se nepodařilo nahrát: ${e?.message || 'neznámá chyba'}` });
          continue;
        }

        newItems.push(newItem);
        addedCount++;
      }

      // Nastavení si podle toho přepočítá obsazené místo. Přes událost,
      // aby knihovna nemusela vědět, že nějaká sekce s přehledem existuje.
      window.dispatchEvent(new CustomEvent('neverlate:soubor-nahran'));

      setLibraryItems((prev) => [...newItems, ...prev]);
      setCelkemVKnihovne((n) => n + newItems.length);
      if (newItems.length > 0) {
        setActiveItem(newItems[0]);
      }
      setStatusMessage({
        type: 'success',
        text:
          `Nahráno ${addedCount} souborů do knihovny.` +
          (zmenseno.length
            ? ` Zmenšeno na MP3: ${zmenseno.slice(0, 3).join(', ')}${zmenseno.length > 3 ? ` a ${zmenseno.length - 3} dalších` : ''}.`
            : '') +
          (priraadene.length
            ? ` Přiřazeno k písni: ${priraadene.slice(0, 3).join(', ')}${priraadene.length > 3 ? ` a ${priraadene.length - 3} dalších` : ''}.`
            : ''),
      });
    } catch (err: any) {
      console.error('File upload error:', err);
      setStatusMessage({
        type: 'error',
        text: 'Chyba při nahrávání souborů: ' + (err?.message || 'Neznámá chyba'),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Přehrání MIDI z knihovny.
   *
   * Jestli se má hrát, drží ref, ne stav komponenty. Naplánované noty se
   * na tuhle hodnotu ptají až za několik sekund, ale uzávěra jim podává tu,
   * která platila při plánování — a to bylo těsně po `setIsPlayingMidi(true)`,
   * kdy proměnná ve staré uzávěře byla pořád `false`. Každá nota se proto
   * zahodila a přehrávač mlčel, i když se tvářil, že hraje.
   */
  const handleToggleMidi = async () => {
    if (isPlayingMidi) {
      hrajeMidiRef.current = false;
      setIsPlayingMidi(false);
      if (midiTimerRef.current) clearInterval(midiTimerRef.current);
      return;
    }

    if (!activeItem || activeItem.type !== 'midi') return;
    if (!activeItem.dataUrl) {
      setStatusMessage({ type: 'error', text: 'Soubor se zatím nenačetl z úložiště. Zkuste to za chvíli.' });
      return;
    }

    try {
      hrajeMidiRef.current = true;
      setIsPlayingMidi(true);
      const res = await fetch(activeItem.dataUrl);
      if (!res.ok) throw new Error(`úložiště vrátilo ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      const duration = midi.duration || 30;
      setMidiDuration(duration);

      const startTime = Date.now();
      let not = 0;
      midi.tracks.forEach((track) => {
        const inst = track.channel === 9 || track.channel === 10 ? 'drums' : 'grand_piano';
        track.notes.forEach((note) => {
          not++;
          const id = window.setTimeout(() => {
            if (hrajeMidiRef.current) {
              // Název tónu, ne číslo. `playNote` bere číslo jako frekvenci
              // v hertzích, takže z noty 60 dělalo 60 Hz — o tři oktávy níž,
              // než mělo znít, a většinou pod hranicí slyšitelnosti.
              audioSynth.playNote(midiToNoteName(note.midi), inst, note.duration, 0.7, note.velocity);
            }
          }, note.time * 1000);
          casovaceNotRef.current.push(id);
        });
      });

      if (not === 0) {
        hrajeMidiRef.current = false;
        setIsPlayingMidi(false);
        setStatusMessage({ type: 'error', text: 'Soubor neobsahuje žádné noty.' });
        return;
      }

      midiTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setMidiProgress(Math.min(elapsed, duration));
        if (elapsed >= duration) {
          hrajeMidiRef.current = false;
          setIsPlayingMidi(false);
          clearInterval(midiTimerRef.current);
        }
      }, 200);
    } catch (e: any) {
      console.error('MIDI play error:', e);
      hrajeMidiRef.current = false;
      setIsPlayingMidi(false);
      setStatusMessage({ type: 'error', text: `MIDI se nepodařilo přehrát: ${e?.message || 'neznámá chyba'}` });
    }
  };

  const handleCreateSongFromItem = (item: LibraryItem) => {
    const attachment: SongAttachment = {
      id: 'att_' + Date.now(),
      name: item.name,
      type: item.type,
      dataUrl: item.dataUrl,
      size: item.size,
      uploadedAt: Date.now(),
      parsedData: {
        title: item.songTitle,
        artist: item.artist,
        bpm: item.bpm,
        key: item.key,
        extractedText: item.extractedText,
        trackNames: item.trackNames,
      },
    };

    const newSong: Song = {
      id: crypto.randomUUID(),
      title: item.songTitle || item.name.replace(/\.[^/.]+$/, ''),
      artist: item.artist || 'Neznámý interpret',
      key: item.key || 'C',
      bpm: item.bpm || 120,
      content: item.extractedText || `[C]Skladba z knihovny: ${item.name}`,
      chordsUsed: [],
      attachments: [attachment],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: 'Import z Knihovny',
    };

    if (onAddSong) {
      onAddSong(newSong);
    } else if (onUpdateSongs) {
      onUpdateSongs((prev) => [newSong, ...prev]);
    }
    setStatusMessage({
      type: 'success',
      text: `Skladba "${newSong.title}" byla úspěšně přidána do Song Library!`,
    });
    if (onSelectSongForPlayback) {
      onSelectSongForPlayback(newSong);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    // Nejdřív smazat v databázi, teprve pak ze seznamu. Obráceně by soubor
    // po znovunačtení zase naskočil a vypadalo by to, že se mazání nepovedlo.
    try {
      await assetLibraryService.remove(itemId);
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e?.message || 'Soubor se nepodařilo smazat.' });
      return;
    }
    setLibraryItems((prev) => prev.filter((i) => i.id !== itemId));
    setCelkemVKnihovne((n) => Math.max(0, n - 1));
    // Strom i ukazatel místa se musí dozvědět, že soubor zmizel.
    void nactiStrom();
    window.dispatchEvent(new CustomEvent('neverlate:soubor-nahran'));
    if (activeItem?.id === itemId) {
      setActiveItem(libraryItems.filter((i) => i.id !== itemId)[0] || null);
    }
    setStatusMessage({ type: 'success', text: 'Soubor byl odstraněn z knihovny.' });
  };

  /**
   * Smaže označené soubory najednou.
   *
   * Po jednom se sedm set vzorků neuklidí. Maže se postupně, ne naráz:
   * server maže po souborech a stovka souběžných požadavků by ho jen
   * zahltila. Co selže, se spočítá a řekne — tichý neúspěch u poloviny
   * dávky by byl horší než chyba.
   */
  const smazOznacene = async () => {
    const ids = [...oznacene];
    if (!ids.length) return;
    if (!confirm(`Smazat ${ids.length} označených souborů? Tohle už nevrátíš.`)) return;

    setMazuHromadne(true);
    setStatusMessage(null);
    let hotovo = 0;
    const selhalo: string[] = [];

    for (const id of ids) {
      try {
        await assetLibraryService.remove(id);
        hotovo++;
      } catch {
        selhalo.push(id);
      }
    }

    setLibraryItems((prev) => prev.filter((i) => !oznacene.has(i.id) || selhalo.includes(i.id)));
    setCelkemVKnihovne((n) => Math.max(0, n - hotovo));
    setZvukoveNahledy((p) => p.filter((n) => !oznacene.has(n.id) || selhalo.includes(n.id)));
    if (activeItem && oznacene.has(activeItem.id) && !selhalo.includes(activeItem.id)) {
      setActiveItem(null);
    }
    setOznacene(() => new Set(selhalo));
    void nactiStrom();
    window.dispatchEvent(new CustomEvent('neverlate:soubor-nahran'));

    setStatusMessage(
      selhalo.length
        ? { type: 'error', text: `Smazáno ${hotovo}, ${selhalo.length} se nepodařilo — zůstávají označené.` }
        : { type: 'success', text: `Smazáno ${hotovo} souborů.` }
    );
    setMazuHromadne(false);
  };

  /** Cesta ke složce, ve které soubor na disku ležel. */
  const slozkaZeSouboru = (f: File): string | undefined => {
    const cesta = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath;
    if (!cesta) return undefined;
    const casti = cesta.split('/');
    casti.pop();
    // První část je vybraná složka sama — ta je názvem sbírky, ne podsložkou.
    casti.shift();
    return casti.join('/') || undefined;
  };

  const getItemIcon = (type: LibraryItem['type']) => {
    switch (type) {
      case 'guitarpro':
        return <FileSpreadsheet className="w-4 h-4 text-[#FF9F0A]" />;
      case 'pdf':
        return <FileText className="w-4 h-4 text-[#FF453A]" />;
      case 'txt':
        return <Layers className="w-4 h-4 text-[#30D158]" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-[#BF5AF2]" />;
      case 'midi':
        return <Music className="w-4 h-4 text-[#0A84FF]" />;
    }
  };

  const getItemTypeBadge = (type: LibraryItem['type']) => {
    switch (type) {
      case 'guitarpro':
        return <span className="bg-[#FF9F0A]/15 text-[#FF9F0A] border border-[#FF9F0A]/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">Guitar Pro</span>;
      case 'pdf':
        return <span className="bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">PDF Noty</span>;
      case 'txt':
        return <span className="bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">Text / Akordy</span>;
      case 'image':
        return <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">Obrázek</span>;
      case 'midi':
        return <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">MIDI</span>;
    }
  };

  return (
    <div className="space-y-4 font-sans text-white pb-12">
      
      {/* Header Banner */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-[#0A84FF]/10 border border-[#0A84FF]/30 text-[#0A84FF] rounded-2xl">
            <FolderArchive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="bg-[#0A84FF] text-white font-bold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
                Knihovna
              </span>
              {/* Skutečný počet v knihovně, ne počet právě načtených. Seznam
                  níž je jedna stránka — dvacet tisíc řádků by prohlížeč
                  stahoval a třídil zbytečně. Zbytek se najde hledáním. */}
              <span className="text-xs text-neutral-400 font-medium tabular-nums">
                {celkemVKnihovne.toLocaleString('cs')} souborů v knihovně
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Multimediální Knihovna Souborů
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Guitar Pro, PDF noty, textové akordy, obrázky, MIDI a samply — všechno, co appka
              nabízí k písním.{' '}
              {!kategorieFiltr && !podkategorieFiltr
                ? `Zobrazeno ${allCombinedItems.length} z ${celkemVKnihovne.toLocaleString('cs')}.`
                : `V této kategorii je ${celkemVKnihovne.toLocaleString('cs')} souborů, zobrazeno ${filteredItems.length}.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
        <div className="flex rounded-xl bg-white/[0.04] border border-white/10 p-0.5">
          {(['soubory', 'samples', 'sbirky'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPohled(p)}
              className={`px-3 py-2 rounded-[10px] text-xs font-semibold capitalize transition-colors cursor-pointer ${
                pohled === p ? 'bg-[#0A84FF] text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {p === 'soubory' ? 'Soubory' : p === 'samples' ? 'Samples' : 'Sbírky'}
            </button>
          ))}
        </div>

        </div>
      </div>

      {/* Status Alerts */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border ${
            statusMessage.type === 'success'
              ? 'bg-[#30D158]/10 border-[#30D158]/30 text-[#30D158]'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs text-neutral-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main 2-column Grid */}
      {/* Kolik místa co zabírá. Patří sem, ne do Nastavení: přidává se
          a maže se tady, takže i důsledek má být vidět tady. */}
      <MistoVUlozisti jsemSpravce={jsemSpravce} />

      {pohled === 'samples' && <PohledSamples jsemSpravce={jsemSpravce} />}

      {pohled === 'sbirky' && <SbirkyPanel />}

      {pohled === 'soubory' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Column: Explorer Filters & File List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          
          {/* Složky knihovny. Nahradily řadu tlačítek: ta uměla jen
              plochý výběr typu, kdežto tady je vidět i druhá úroveň,
              počty a kolik co zabírá. */}
          <div className="bg-[#16161A]/80 backdrop-blur-xl p-2 rounded-2xl border border-white/[0.08] max-h-[38vh] overflow-y-auto">
            <StromKnihovny
              uzly={uzly}
              vybrana={{ kategorie: kategorieFiltr, podkategorie: podkategorieFiltr }}
              onVybrat={(k, p) => {
                setKategorieFiltr(k);
                setPodkategorieFiltr(p);
              }}
              onPustit={
                jsemSpravce
                  ? (k, p) => {
                      if (tazeny) void prerad(tazeny, k, p);
                    }
                  : undefined
              }
            />
          </div>

          {/* Jak soubor pojmenovat, aby si ho appka zařadila sama. Ukazuje
              se jen u vybrané složky — obecná rada u celé knihovny by
              platila pro všechno a tím pádem pro nic. */}
          {kategorieFiltr && PODLE_ID[kategorieFiltr]?.napoveda && (
            <div className="bg-[#FF9F0A]/[0.07] border border-[#FF9F0A]/25 rounded-2xl px-3 py-2 text-[11px] text-neutral-300">
              <span className="text-[#FF9F0A] font-bold">Pojmenování: </span>
              <span className="font-mono">{PODLE_ID[kategorieFiltr].napoveda}</span>
            </div>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Vyhledat soubor, interpreta..."
              className="w-full bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-[#0A84FF] outline-none transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Jediné místo, kudy soubory do knihovny chodí. */}
          <NahravaniSouboru
            otevrenaKategorie={kategorieFiltr}
            sbirky={sbirky}
            bezi={isProcessing}
            prevod={prevod}
            onNahraj={(soubory, volby) => handleUploadFiles(soubory, volby)}
          >
            {/* Zmenšování zvuků patří k nahrávání — rozhoduje o tom,
                co se zrovna nahraje. */}
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer">
              <input
                type="checkbox"
                checked={prevadetZvuk}
                onChange={(e) => {
                  setPrevadetZvuk(e.target.checked);
                  localStorage.setItem('neverlate_prevod_mp3', e.target.checked ? 'ano' : 'ne');
                }}
                className="accent-[#0A84FF] cursor-pointer"
              />
              Zmenšit zvuk na MP3
              <select
                value={kvalitaMp3}
                disabled={!prevadetZvuk}
                onChange={(e) => {
                  const v = Number(e.target.value) as Kvalita;
                  setKvalitaMp3(v);
                  localStorage.setItem('neverlate_kvalita_mp3', String(v));
                }}
                className="bg-black/40 border border-white/10 rounded-lg px-1.5 py-0.5 text-[10px] text-neutral-300 outline-none disabled:opacity-40"
              >
                <option value={128}>128</option>
                <option value={192}>192</option>
                <option value={256}>256</option>
                <option value={320}>320</option>
              </select>
            </label>
          </NahravaniSouboru>

          {/* Hromadné akce — týž díl jako ve Sbírkách a Samplech. */}
          <div className="px-1">
            <HromadneAkce
              oznacene={oznacene}
              onZmenaVyberu={setOznacene}
              viditelne={filteredItems.map((i) => i.id)}
              jsemSpravce={jsemSpravce}
              onHotovo={(smazane) => {
                if (smazane.length) {
                  setLibraryItems((prev) => prev.filter((i) => !smazane.includes(i.id)));
                  setCelkemVKnihovne((n) => Math.max(0, n - smazane.length));
                  setZvukoveNahledy((p) => p.filter((n) => !smazane.includes(n.id)));
                  if (activeItem && smazane.includes(activeItem.id)) setActiveItem(null);
                } else {
                  // Přesun mění zařazení, ne obsah — seznam se načte znovu.
                  void nactiKnihovnu(searchQuery);
                }
                void nactiStrom();
                window.dispatchEvent(new CustomEvent('neverlate:soubor-nahran'));
              }}
            />
          </div>

          {/* Files List */}
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-3 space-y-1.5 max-h-[600px] overflow-y-auto shadow-lg">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                Žádné soubory neodpovídají zadanému filtru
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = activeItem?.id === item.id;

                if (libraryListViewMode === 'compact') {
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setActiveItem(item);
                        if (item.type === 'audio') otevriZvuk(item);
                      }}
                      // Táhnout jde jen soubory z knihovny; přílohy písní
                      // do složek nepatří a server je nezná.
                      draggable={jsemSpravce && !item.id.startsWith('song_att_')}
                      onDragStart={() => setTazeny(item.id)}
                      onDragEnd={() => setTazeny(null)}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2 group ${
                        tazeny === item.id ? 'opacity-40' : ''
                      } ${
                        isSelected
                          ? 'bg-[#0A84FF]/20 border border-[#0A84FF]/40 text-white shadow-sm font-semibold'
                          : 'bg-black/30 border border-white/5 hover:bg-white/5 hover:border-white/10 text-neutral-300'
                      }`}
                    >
                      {jsemSpravce && (
                        <input
                          type="checkbox"
                          checked={oznacene.has(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() =>
                            setOznacene((p) => {
                              const n = new Set(p);
                              if (n.has(item.id)) n.delete(item.id);
                              else n.add(item.id);
                              return n;
                            })
                          }
                          className="accent-[#30D158] cursor-pointer shrink-0"
                          title="Označit pro hromadnou akci"
                        />
                      )}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="shrink-0 scale-75 opacity-80">
                          {getItemIcon(item.type)}
                        </div>
                        <div className="text-xs truncate flex items-center gap-1.5 min-w-0">
                          {prejmenovavany?.id === item.id ? (
                            <input
                              autoFocus
                              value={prejmenovavany.nazev}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setPrejmenovavany({ id: item.id, nazev: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void prejmenuj(item.id, prejmenovavany.nazev);
                                if (e.key === 'Escape') setPrejmenovavany(null);
                              }}
                              onBlur={() => void prejmenuj(item.id, prejmenovavany.nazev)}
                              className="bg-black/60 border border-[#FF9F0A] rounded px-1.5 py-0.5 text-xs text-white outline-none min-w-[180px]"
                            />
                          ) : (
                            <span className="font-bold text-white truncate">{item.name}</span>
                          )}
                          {item.artist && (
                            <>
                              <span className="text-neutral-500 font-normal shrink-0">—</span>
                              <span className="text-neutral-400 text-[11px] truncate">{item.artist}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {jsemSpravce && !item.id.startsWith('song_att_') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrejmenovavany({ id: item.id, nazev: item.name });
                            }}
                            className="p-1 rounded text-neutral-600 hover:text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Přejmenovat"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {getItemTypeBadge(item.type)}
                        {item.songId && (
                          <span className="text-[9px] bg-[#30D158]/20 text-[#30D158] px-1.5 py-0.5 rounded font-medium">
                            Song Library
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setActiveItem(item);
                      if (item.type === 'audio') otevriZvuk(item);
                    }}
                    className={`p-3 rounded-2xl cursor-pointer transition-all flex items-start justify-between gap-2.5 group ${
                      isSelected
                        ? 'bg-white/10 border border-white/20 shadow-sm'
                        : 'bg-black/30 border border-white/5 hover:bg-white/5 hover:border-white/10'
                    }`}
                  >
                    {jsemSpravce && (
                      <input
                        type="checkbox"
                        checked={oznacene.has(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() =>
                          setOznacene((p) => {
                            const n = new Set(p);
                            if (n.has(item.id)) n.delete(item.id);
                            else n.add(item.id);
                            return n;
                          })
                        }
                        className="accent-[#30D158] cursor-pointer shrink-0 mr-1"
                        title="Označit pro hromadnou akci"
                      />
                    )}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 bg-white/5 rounded-xl border border-white/5 mt-0.5 shrink-0">
                        {getItemIcon(item.type)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate group-hover:text-[#0A84FF] transition-colors">
                          {item.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                          {item.artist && <span className="text-neutral-300 font-medium">{item.artist}</span>}
                          {item.songTitle && <span>• {item.songTitle}</span>}
                          <span>• {Math.round(item.size / 1024)} KB</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {getItemTypeBadge(item.type)}
                      {item.songId && (
                        <span className="text-[10px] text-[#30D158] font-semibold">
                          Ve zpěvníku
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Za dvěma sty se pokračuje na vyžádání. Stáhnout osmnáct tisíc
                MIDI souborů naráz by prohlížeč jen zdrželo, a nikdo je
                neprojde očima. */}
            {libraryItems.length < celkemVKnihovne && (
              <button
                onClick={() => void nactiKnihovnu(searchQuery, undefined, true)}
                disabled={nacitamKnihovnu}
                className="w-full py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.08] text-xs font-semibold text-neutral-300 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-wait"
              >
                {nacitamKnihovnu
                  ? 'Načítám…'
                  : `Načíst dalších ${Math.min(200, celkemVKnihovne - libraryItems.length)} z ${(
                      celkemVKnihovne - libraryItems.length
                    ).toLocaleString('cs')}`}
              </button>
            )}
          </div>

        </div>

        {/* Right Column: Active Item Viewer / Player & Actions (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {activeItem ? (
            <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 space-y-4 shadow-xl">
              
              {/* Active Item Title & Actions Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/5 rounded-2xl border border-white/10">
                    {getItemIcon(activeItem.type)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {activeItem.name}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {activeItem.artist ? `${activeItem.artist} — ` : ''}
                      {activeItem.songTitle || 'Knihovní soubor'} • {Math.round(activeItem.size / 1024)} KB
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Create Song from Item */}
                  <button
                    onClick={() => handleCreateSongFromItem(activeItem)}
                    className="px-3.5 py-2 bg-[#30D158] hover:bg-[#34e260] text-black text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                    title="Vytvořit novou skladbu v Song Library z tohoto souboru"
                  >
                    <Plus className="w-4 h-4" /> <span>Přidat do zpěvníku</span>
                  </button>

                  {/* Download */}
                  {activeItem.dataUrl && (
                    <a
                      href={activeItem.dataUrl}
                      download={activeItem.name}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 hover:text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> <span>Stáhnout</span>
                    </a>
                  )}

                  {/* Delete from library */}
                  <button
                    onClick={() => handleDeleteItem(activeItem.id)}
                    className="p-2 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-neutral-400 hover:text-red-400 rounded-xl transition-all cursor-pointer"
                    title="Smazat z knihovny"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Proč náhled nejde. Bez tohohle vypadá nedostupný soubor
                  úplně stejně jako soubor, který se ještě načítá. */}
              {shanimOdkaz && (
                <div className="flex items-center gap-2 text-[11px] text-neutral-400 bg-white/[0.03] border border-white/10 rounded-2xl px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0A84FF]" />
                  Sháním soubor z úložiště…
                </div>
              )}
              {chybaOdkazu && (
                <div className="flex items-start gap-2 text-[11px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-2xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{chybaOdkazu}</span>
                </div>
              )}

              {/* 🔊 ZVUKOVÉ VZORKY — skládají se pod sebe, nepřepisují se */}
              {zvukoveNahledy.length > 0 && (
                <div className="space-y-2">
                  {zvukoveNahledy.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                        {zvukoveNahledy.length} otevřených zvuků
                      </span>
                      <button
                        onClick={() => setZvukoveNahledy([])}
                        className="text-[10px] text-neutral-500 hover:text-white cursor-pointer ml-auto"
                      >
                        zavřít všechny
                      </button>
                    </div>
                  )}

                  {zvukoveNahledy.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-2xl border p-1 ${
                        activeItem?.id === n.id
                          ? 'border-[#0A84FF]/40 bg-[#0A84FF]/[0.06]'
                          : 'border-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center gap-2 px-2 pt-1">
                        <span className="text-[11px] text-neutral-300 truncate flex-1">{n.name}</span>
                        <button
                          onClick={() => setZvukoveNahledy((p) => p.filter((x) => x.id !== n.id))}
                          className="p-1 rounded text-neutral-600 hover:text-[#FF453A] cursor-pointer shrink-0"
                          title="Zavřít tenhle náhled"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      {n.dataUrl ? (
                        <WaveformPrehravac url={n.dataUrl} nazev={n.name} />
                      ) : (
                        <p className="text-[11px] text-neutral-600 px-2 pb-2">Načítám křivku…</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 🎸 GUITAR PRO VIEWER & ALPHATAB PLAYER */}
              {activeItem.type === 'guitarpro' && (
                <div className="space-y-3">
                  {activeItem.dataUrl ? (
                    <GuitarProPlayer
                      dataUrl={activeItem.dataUrl}
                      filename={activeItem.name}
                      artist={activeItem.artist}
                      bpm={activeItem.bpm}
                    />
                  ) : (
                    <div className="bg-black/30 border border-white/10 rounded-2xl p-8 text-center space-y-3">
                      <FileSpreadsheet className="w-8 h-8 text-[#FF9F0A] mx-auto animate-pulse" />
                      <p className="text-xs font-bold text-[#FF9F0A] uppercase">
                        Guitar Pro tabulatura připravena
                      </p>
                      <p className="text-xs text-neutral-400 max-w-md mx-auto">
                        Nahrajte svůj vlastní .gp soubor výše nebo stáhněte z Freetar.de pro spuštění plného interaktivního AlphaTab syntezátoru.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 📄 PDF VIEWER */}
              {activeItem.type === 'pdf' && (
                <div className="space-y-3">
                  {activeItem.dataUrl ? (
                    <PdfNahled url={activeItem.dataUrl} nazev={activeItem.name} />
                  ) : (
                    <div className="bg-black/30 border border-white/10 rounded-2xl p-6 text-center space-y-2">
                      <FileText className="w-8 h-8 text-[#FF453A] mx-auto" />
                      <p className="text-xs font-bold text-white">{activeItem.name}</p>
                      <p className="text-xs text-neutral-400">
                        Náhled PDF dokumentu nebo textového výpisu
                      </p>
                    </div>
                  )}

                  {activeItem.extractedText && (
                    <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
                      <span className="text-xs font-bold text-[#30D158] block mb-2">
                        Extrahovaný text z PDF dokumentu:
                      </span>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-300 max-h-[200px] overflow-y-auto">
                        {activeItem.extractedText}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* 📝 TEXT & CHORDPRO VIEWER */}
              {activeItem.type === 'txt' && (
                <div className="space-y-3">
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400">Transpozice:</span>
                      <button
                        onClick={() => setTxtTranspose((p) => p - 1)}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        -1
                      </button>
                      <span className="font-bold text-[#30D158] px-1">
                        {txtTranspose > 0 ? `+${txtTranspose}` : txtTranspose}
                      </span>
                      <button
                        onClick={() => setTxtTranspose((p) => p + 1)}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        +1
                      </button>
                    </div>

                    <div className="text-xs text-neutral-400">
                      Tónina: <strong className="text-white">{activeItem.key || 'C'}</strong>
                    </div>
                  </div>

                  <div className="bg-black/40 border border-white/10 rounded-2xl p-5 max-h-[450px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-200 leading-relaxed">
                      {activeItem.extractedText || 'Žádný textový obsah'}
                    </pre>
                  </div>
                </div>
              )}

              {/* 🖼️ IMAGE VIEWER */}
              {activeItem.type === 'image' && (
                <div className="space-y-3">
                  {/* Image Toolbar */}
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setImgZoom((prev) => Math.max(0.5, prev - 0.25))}
                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold cursor-pointer"
                        title="Oddálit"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-semibold px-2 text-neutral-300">
                        {Math.round(imgZoom * 100)}%
                      </span>
                      <button
                        onClick={() => setImgZoom((prev) => Math.min(3, prev + 0.25))}
                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold cursor-pointer"
                        title="Přiblížit"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setImgRotation((prev) => (prev + 90) % 360)}
                        className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="Otočit o 90°"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setImgInvert((prev) => !prev)}
                        className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          imgInvert
                            ? 'bg-purple-500/30 text-purple-300 border-purple-500/50'
                            : 'bg-white/5 text-neutral-300 border-white/10'
                        }`}
                        title="Vysoký kontrast (Inverze pro čtení)"
                      >
                        Invertovat barvy
                      </button>
                    </div>

                    {activeItem.dataUrl && (
                      <a
                        href={activeItem.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#30D158] hover:underline flex items-center gap-1 font-semibold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Otevřít v novém okně
                      </a>
                    )}
                  </div>

                  {/* Image Canvas Box */}
                  <div className="w-full max-h-[500px] overflow-auto bg-black/60 rounded-2xl border border-white/10 flex items-center justify-center p-4">
                    <img
                      src={activeItem.dataUrl}
                      alt={activeItem.name}
                      className={`max-w-none transition-transform duration-150 rounded-xl ${
                        imgInvert ? 'invert hue-rotate-180' : ''
                      }`}
                      style={{
                        transform: `scale(${imgZoom}) rotate(${imgRotation}deg)`,
                        transformOrigin: 'center center',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 🎹 MIDI PLAYER */}
              {activeItem.type === 'midi' && (
                <div className="bg-[#0A84FF]/10 border border-[#0A84FF]/30 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#0A84FF]/20 text-[#0A84FF] rounded-xl">
                        <Volume2 className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-white block">
                          Interaktivní MIDI přehrávač
                        </span>
                        <p className="text-xs text-neutral-400">
                          Přehrávání tónů a doprovodu přímo přes webový syntetizér
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleToggleMidi}
                      className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
                        isPlayingMidi
                          ? 'bg-[#FF453A] text-white shadow-red-500/30'
                          : 'bg-[#0A84FF] hover:bg-blue-600 text-white shadow-blue-500/30'
                      }`}
                    >
                      {isPlayingMidi ? (
                        <>
                          <Pause className="w-4 h-4 fill-current" /> Zastavit MIDI
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" /> Přehrát MIDI
                        </>
                      )}
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="w-full bg-black/50 h-2 rounded-full border border-white/10 relative overflow-hidden">
                      <div
                        className="bg-[#0A84FF] h-full transition-all rounded-full"
                        style={{
                          width: `${midiDuration > 0 ? (midiProgress / midiDuration) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-neutral-400">
                      <span>{Math.floor(midiProgress)}s</span>
                      <span>{Math.floor(midiDuration)}s</span>
                    </div>
                  </div>

                  {/* Track names list */}
                  {activeItem.trackNames && activeItem.trackNames.length > 0 && (
                    <div className="text-xs text-neutral-300 bg-black/40 p-3.5 rounded-xl border border-white/5 space-y-2">
                      <span className="font-semibold block text-neutral-400">
                        Stopy a nástroje v souboru ({activeItem.trackNames.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeItem.trackNames.map((trk, idx) => (
                          <span
                            key={idx}
                            className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 text-neutral-200 text-xs"
                          >
                            🎹 {trk}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          ) : (
            <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-16 text-center text-xs space-y-4 shadow-xl">
              <div className="flex justify-center">
                <div className="p-4 bg-white/5 rounded-3xl border border-white/10 text-neutral-500">
                  <FolderArchive className="w-10 h-10" />
                </div>
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <p className="font-bold text-white text-base">
                  Vyberte soubor pro náhled nebo přehrání
                </p>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Knihovna podporuje Guitar Pro tabulatury, PDF noty, textové akordy, obrázky a MIDI soubory.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
      )}

    </div>
  );
};
