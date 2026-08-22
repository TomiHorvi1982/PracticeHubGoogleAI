import React, { useState, useEffect, useRef } from 'react';
import { assetLibraryService, LibraryAsset } from '../services/assetLibraryService';
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
  LayoutGrid
} from 'lucide-react';
import { Song, SongAttachment } from '../types';
import { parseAnyFile, fileToDataUrl } from '../utils/fileParsers';
import { GuitarProPlayer } from './GuitarProPlayer';
import { audioSynth } from '../services/audioSynth';
import { Midi } from '@tonejs/midi';

export type LibraryCategory = 'all' | 'guitarpro' | 'pdf' | 'txt' | 'image' | 'midi';

export interface LibraryItem {
  id: string;
  name: string;
  type: 'guitarpro' | 'pdf' | 'txt' | 'image' | 'midi';
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

// Sample starter library items
const INITIAL_LIBRARY_ITEMS: LibraryItem[] = [
  {
    id: 'sample_gp_1',
    name: 'Oasis_Wonderwall_GuitarTab.gp5',
    type: 'guitarpro',
    dataUrl: '', // Will be loaded or placeholder
    size: 45200,
    uploadedAt: Date.now() - 3600000 * 24,
    artist: 'Oasis',
    songTitle: 'Wonderwall',
    bpm: 87,
    key: 'Em',
    trackNames: ['Acoustic Guitar', 'Electric Guitar', 'Strings', 'Drums', 'Bass'],
  },
  {
    id: 'sample_pdf_1',
    name: 'Pink_Floyd_Wish_You_Were_Here_Sheet.pdf',
    type: 'pdf',
    dataUrl: '',
    size: 184500,
    uploadedAt: Date.now() - 3600000 * 12,
    artist: 'Pink Floyd',
    songTitle: 'Wish You Were Here',
    extractedText: 'Pink Floyd - Wish You Were Here\n[G]So, so you think you can tell [Em]Heaven from Hell...',
  },
  {
    id: 'sample_txt_1',
    name: 'Nedvedi_Stanky_Akordy.txt',
    type: 'txt',
    dataUrl: '',
    size: 2400,
    uploadedAt: Date.now() - 3600000 * 6,
    artist: 'Jan Nedvěd',
    songTitle: 'Stánky',
    key: 'G',
    bpm: 95,
    extractedText: 'Jan Nedvěd - Stánky\n\n[G]U stánků [C]na levnou [G]krásu\n[G]postávaj [C]a ze slov a [G]hlasů\n[G]poznávaj [D7]jak málo stačí [G]k štěstí.',
  },
  {
    id: 'sample_img_1',
    name: 'Kytarove_Akordy_Open_Chords_Chart.png',
    type: 'image',
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%230F0F0F"/><rect x="20" y="20" width="560" height="360" rx="8" fill="%23141414" stroke="%23FF3E00" stroke-width="2"/><text x="300" y="60" fill="%23FFFFFF" font-family="monospace" font-size="20" font-weight="bold" text-anchor="middle">ZÁKLADNÍ KYTAROVÉ AKORDY // GUITAR CHORD CHART</text><text x="100" y="140" fill="%2300FF41" font-family="monospace" font-size="28" font-weight="bold">C</text><text x="100" y="170" fill="%23AAAAAA" font-family="monospace" font-size="14">x 3 2 0 1 0</text><text x="240" y="140" fill="%2300FF41" font-family="monospace" font-size="28" font-weight="bold">G</text><text x="240" y="170" fill="%23AAAAAA" font-family="monospace" font-size="14">3 2 0 0 0 3</text><text x="380" y="140" fill="%2300FF41" font-family="monospace" font-size="28" font-weight="bold">D</text><text x="380" y="170" fill="%23AAAAAA" font-family="monospace" font-size="14">x x 0 2 3 2</text><text x="500" y="140" fill="%2300FF41" font-family="monospace" font-size="28" font-weight="bold">Em</text><text x="500" y="170" fill="%23AAAAAA" font-family="monospace" font-size="14">0 2 2 0 0 0</text><text x="100" y="270" fill="%23FFD700" font-family="monospace" font-size="28" font-weight="bold">Am</text><text x="100" y="300" fill="%23AAAAAA" font-family="monospace" font-size="14">x 0 2 2 1 0</text><text x="240" y="270" fill="%23FFD700" font-family="monospace" font-size="28" font-weight="bold">F</text><text x="240" y="300" fill="%23AAAAAA" font-family="monospace" font-size="14">1 3 3 2 1 1</text><text x="380" y="270" fill="%23FFD700" font-family="monospace" font-size="28" font-weight="bold">E</text><text x="380" y="300" fill="%23AAAAAA" font-family="monospace" font-size="14">0 2 2 1 0 0</text><text x="500" y="270" fill="%23FFD700" font-family="monospace" font-size="28" font-weight="bold">A</text><text x="500" y="300" fill="%23AAAAAA" font-family="monospace" font-size="14">x 0 2 2 2 0</text><text x="300" y="360" fill="%23888888" font-family="monospace" font-size="12" text-anchor="middle">STRUM_OS // MULTIMEDIÁLNÍ KNIHOVNA</text></svg>',
    size: 12400,
    uploadedAt: Date.now() - 3600000 * 2,
    artist: 'Diagramy',
    songTitle: 'Základní akordy',
  },
  {
    id: 'sample_midi_1',
    name: 'House_Of_The_Rising_Sun_Backing.mid',
    type: 'midi',
    dataUrl: '',
    size: 28900,
    uploadedAt: Date.now() - 3600000,
    artist: 'The Animals',
    songTitle: 'House of the Rising Sun',
    bpm: 116,
    trackNames: ['Fingerpicking Guitar', 'Bass', 'Organ', 'Drums'],
  },
];

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

  const [selectedCategory, setSelectedCategory] = useState<LibraryCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeItem, setActiveItem] = useState<LibraryItem | null>(() => libraryItems[0] || null);

  // View Mode: 'detailed' vs 'compact' (1-line: Name - Artist)
  const [libraryListViewMode, setLibraryListViewMode] = useState<'detailed' | 'compact'>('detailed');

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
  const [midiProgress, setMidiProgress] = useState(0);
  const [midiDuration, setMidiDuration] = useState(0);
  const midiTimerRef = useRef<any>(null);

  // TXT Transpose state
  const [txtTranspose, setTxtTranspose] = useState(0);

  /** Z čeho appka pozná typ souboru — podle přípony, ne podle kategorie. */
  const typSouboru = (a: LibraryAsset): LibraryItem['type'] => {
    const jm = `${a.original_filename || a.name}`.toLowerCase();
    if (/\.(gp|gp3|gp4|gp5|gpx|gtp)$/.test(jm)) return 'guitarpro';
    if (jm.endsWith('.pdf')) return 'pdf';
    if (/\.(mid|midi)$/.test(jm)) return 'midi';
    if (/\.(jpe?g|png|webp|gif)$/.test(jm)) return 'image';
    return 'txt';
  };

  /**
   * Načte stránku knihovny.
   *
   * `dataUrl` zůstává prázdná — podepsaná adresa se shání až ve chvíli, kdy
   * si položku někdo vybere. Podepsat dopředu dvacet tisíc souborů by
   * znamenalo dvacet tisíc zbytečných požadavků.
   */
  const nactiKnihovnu = async (dotaz: string) => {
    setNacitamKnihovnu(true);
    try {
      const { assets, total } = await assetLibraryService.listPage({
        search: dotaz.trim() || undefined,
        limit: 200,
        sort: 'name',
      });
      setLibraryItems(
        assets.map((a) => ({
          id: a.id,
          name: a.name,
          type: typSouboru(a),
          dataUrl: '',
          size: Number(a.size_bytes || 0),
          uploadedAt: new Date(a.created_at).getTime(),
        }))
      );
      setCelkemVKnihovne(total);
    } catch (e) {
      console.warn('[knihovna] načtení selhalo', e);
    } finally {
      setNacitamKnihovnu(false);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => nactiKnihovnu(searchQuery), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Adresa souboru se shání až při výběru — a jen jednou.
  useEffect(() => {
    if (!activeItem || activeItem.dataUrl) return;
    let zruseno = false;
    (async () => {
      const url = await assetLibraryService.getDownloadUrl(activeItem.id);
      if (zruseno || !url) return;
      setActiveItem((p) => (p && p.id === activeItem.id ? { ...p, dataUrl: url } : p));
      setLibraryItems((prev) => prev.map((i) => (i.id === activeItem.id ? { ...i, dataUrl: url } : i)));
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

    // Merge without duplicates by dataUrl or name+size
    const merged = [...libraryItems];
    songAttachments.forEach((sa) => {
      const exists = merged.some(
        (m) => m.id === sa.id || (m.name === sa.name && m.size === sa.size && m.size > 0)
      );
      if (!exists) {
        merged.push(sa);
      }
    });

    return merged;
  }, [libraryItems, songs]);

  // Filtered items
  const filteredItems = allCombinedItems.filter((item) => {
    const matchesCategory =
      selectedCategory === 'all' || item.type === selectedCategory;
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
  const handleUploadFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    setStatusMessage(null);
    let addedCount = 0;

    try {
      const newItems: LibraryItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const parsed = await parseAnyFile(file);

        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        let type: LibraryItem['type'] = 'txt';
        if (['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gtp'].includes(ext)) type = 'guitarpro';
        else if (ext === 'pdf') type = 'pdf';
        else if (['mid', 'midi'].includes(ext)) type = 'midi';
        else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp'].includes(ext)) type = 'image';

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
        // Kategorie se odvozuje z typu, aby šel pak filtrovat.
        const kategorie =
          type === 'guitarpro' ? 'guitar_pro' : type === 'pdf' ? 'pdf' : type === 'midi' ? 'midi' : type === 'image' ? 'band_photos' : 'documents';
        const assetType: LibraryAsset['asset_type'] =
          type === 'guitarpro' ? 'guitar_pro' : type === 'pdf' ? 'pdf' : type === 'midi' ? 'midi' : type === 'image' ? 'image' : 'preset';

        try {
          const ulozeny = await assetLibraryService.upload(file, kategorie, assetType, 'global');
          newItem.id = ulozeny.id;
        } catch (e: any) {
          setStatusMessage({ type: 'error', text: `„${file.name}" se nepodařilo nahrát: ${e?.message || 'neznámá chyba'}` });
          continue;
        }

        newItems.push(newItem);
        addedCount++;
      }

      setLibraryItems((prev) => [...newItems, ...prev]);
      setCelkemVKnihovne((n) => n + newItems.length);
      if (newItems.length > 0) {
        setActiveItem(newItems[0]);
      }
      setStatusMessage({
        type: 'success',
        text: `Úspěšně nahráno ${addedCount} soubor(ů) do multimediální knihovny!`,
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

  // MIDI Playback Handler
  const handleToggleMidi = async () => {
    if (isPlayingMidi) {
      setIsPlayingMidi(false);
      if (midiTimerRef.current) clearInterval(midiTimerRef.current);
      return;
    }

    if (!activeItem || activeItem.type !== 'midi' || !activeItem.dataUrl) return;

    try {
      setIsPlayingMidi(true);
      const res = await fetch(activeItem.dataUrl);
      const arrayBuffer = await res.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      const duration = midi.duration || 30;
      setMidiDuration(duration);

      const startTime = Date.now();
      midi.tracks.forEach((track) => {
        const inst = track.channel === 9 || track.channel === 10 ? 'drums' : 'grand_piano';
        track.notes.forEach((note) => {
          setTimeout(() => {
            if (isPlayingMidi) {
              audioSynth.playNote(note.midi, inst, note.duration, note.velocity);
            }
          }, note.time * 1000);
        });
      });

      midiTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setMidiProgress(Math.min(elapsed, duration));
        if (elapsed >= duration) {
          setIsPlayingMidi(false);
          clearInterval(midiTimerRef.current);
        }
      }, 200);
    } catch (e) {
      console.error('MIDI play error:', e);
      setIsPlayingMidi(false);
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
      text: `Skladba "${newSong.title}" byla úspěšně přidána do Zpěvníku!`,
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
    if (activeItem?.id === itemId) {
      setActiveItem(libraryItems.filter((i) => i.id !== itemId)[0] || null);
    }
    setStatusMessage({ type: 'success', text: 'Soubor byl odstraněn z knihovny.' });
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
              <span className="text-xs text-neutral-400 font-medium">
                {allCombinedItems.length} souborů k dispozici
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Multimediální Knihovna Souborů
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Kompletní úložiště pro Guitar Pro (.gp), PDF zpěvníky, textové akordy (.txt), obrázky a MIDI stopy.
            </p>
          </div>
        </div>

        {/* Quick Upload Button */}
        <label className="px-4 py-2.5 bg-white text-black hover:bg-neutral-200 font-semibold text-xs rounded-xl cursor-pointer flex items-center gap-2 transition-all shadow-md">
          <FileUp className="w-4 h-4" />
          <span>Nahrát soubory</span>
          <input
            type="file"
            multiple
            accept=".gp,.gp3,.gp4,.gp5,.gpx,.gtp,.pdf,.txt,.chopro,.pro,.crd,.tab,.png,.jpg,.jpeg,.webp,.svg,.gif,.mid,.midi"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleUploadFiles(e.target.files);
              }
            }}
            className="hidden"
          />
        </label>
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Column: Explorer Filters & File List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          
          {/* Category Filter Tabs */}
          <div className="flex flex-wrap gap-1.5 bg-[#16161A]/80 backdrop-blur-xl p-2 rounded-2xl border border-white/[0.08]">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-white/15 text-white shadow-sm border border-white/10'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Vše ({allCombinedItems.length})
            </button>
            <button
              onClick={() => setSelectedCategory('guitarpro')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedCategory === 'guitarpro'
                  ? 'bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/30 font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Guitar Pro</span>
            </button>
            <button
              onClick={() => setSelectedCategory('pdf')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedCategory === 'pdf'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              onClick={() => setSelectedCategory('txt')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedCategory === 'txt'
                  ? 'bg-[#30D158]/20 text-[#30D158] border border-[#30D158]/30 font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Text</span>
            </button>
            <button
              onClick={() => setSelectedCategory('image')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedCategory === 'image'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Obrázky</span>
            </button>
            <button
              onClick={() => setSelectedCategory('midi')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedCategory === 'midi'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>MIDI</span>
            </button>
          </div>

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

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleUploadFiles(e.dataTransfer.files);
              }
            }}
            className={`border-2 border-dashed p-4 text-center cursor-pointer transition-all relative rounded-2xl ${
              isDragging
                ? 'border-[#0A84FF] bg-[#0A84FF]/10'
                : 'border-white/10 hover:border-[#0A84FF]/50 bg-[#16161A]/40'
            }`}
          >
            <input
              type="file"
              multiple
              accept=".gp,.gp3,.gp4,.gp5,.gpx,.gtp,.pdf,.txt,.chopro,.pro,.crd,.tab,.png,.jpg,.jpeg,.webp,.svg,.gif,.mid,.midi"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUploadFiles(e.target.files);
                }
              }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            {isProcessing ? (
              <div className="py-2 flex items-center justify-center gap-2 text-[#0A84FF] text-xs font-semibold">
                <Disc className="w-4 h-4 animate-spin" />
                <span>Nahrávám a zpracovávám soubory...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-neutral-400">
                <FileUp className="w-4 h-4 text-[#0A84FF]" />
                <span className="text-xs font-medium">
                  Přetáhněte sem soubory pro okamžité přidání
                </span>
              </div>
            )}
          </div>

          {/* View Mode Switcher Header */}
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
              Soubory ({filteredItems.length})
            </span>
            <div className="flex items-center bg-black/50 border border-white/10 p-0.5 rounded-xl">
              <button
                onClick={() => setLibraryListViewMode('compact')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  libraryListViewMode === 'compact'
                    ? 'bg-[#0A84FF] text-white shadow-sm font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="1-řádkový kompaktní režim (Název skladby & Kapela)"
              >
                <AlignJustify className="w-3 h-3" />
                <span>Řádky</span>
              </button>
              <button
                onClick={() => setLibraryListViewMode('detailed')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  libraryListViewMode === 'detailed'
                    ? 'bg-[#0A84FF] text-white shadow-sm font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Detailní režim s náhledem detailů"
              >
                <LayoutGrid className="w-3 h-3" />
                <span>Detailní</span>
              </button>
            </div>
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
                      onClick={() => setActiveItem(item)}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2 group ${
                        isSelected
                          ? 'bg-[#0A84FF]/20 border border-[#0A84FF]/40 text-white shadow-sm font-semibold'
                          : 'bg-black/30 border border-white/5 hover:bg-white/5 hover:border-white/10 text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="shrink-0 scale-75 opacity-80">
                          {getItemIcon(item.type)}
                        </div>
                        <div className="text-xs truncate flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-white truncate">{item.name}</span>
                          {item.artist && (
                            <>
                              <span className="text-neutral-500 font-normal shrink-0">—</span>
                              <span className="text-neutral-400 text-[11px] truncate">{item.artist}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {getItemTypeBadge(item.type)}
                        {item.songId && (
                          <span className="text-[9px] bg-[#30D158]/20 text-[#30D158] px-1.5 py-0.5 rounded font-medium">
                            Zpěvník
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveItem(item)}
                    className={`p-3 rounded-2xl cursor-pointer transition-all flex items-start justify-between gap-2.5 group ${
                      isSelected
                        ? 'bg-white/10 border border-white/20 shadow-sm'
                        : 'bg-black/30 border border-white/5 hover:bg-white/5 hover:border-white/10'
                    }`}
                  >
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
                    title="Vytvořit novou skladbu ve Zpěvníku z tohoto souboru"
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
                    <div className="w-full h-[500px] bg-black/40 rounded-2xl border border-white/10 overflow-hidden relative">
                      <iframe
                        src={activeItem.dataUrl}
                        className="w-full h-full border-none rounded-2xl"
                        title="PDF Viewer"
                      />
                    </div>
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

    </div>
  );
};
