import React, { useState, useEffect, useMemo } from 'react';
import { SongFilterPanel } from './songbook/SongFilterPanel';
import { ObjevSkladby } from './songbook/ObjevSkladby';
import { spustDoplneni } from '../services/enrichmentClient';
import {
  jeFiltrPrazdny,
  SongFilter,
  ZpusobRazeni,
  filtrujSkladby,
  seradSkladby,
  sestavFasety,
  nactiFiltr,
  ulozFiltr,
  zaznamenejOtevreni,
} from '../services/songFilters';
import { Song } from '../types';
import { TUNING_PRESETS } from '../data/chordsAndScales';
import { songDatabaseService } from '../services/songDatabaseService';
import {
  Search, Plus, BookOpen, Music, Check,
  Maximize2, Minimize2, X, FileUp, ChevronDown, ChevronRight, Globe,
  Trash2, List, Edit3, Lock, Unlock, ListPlus,
  ShieldAlert, Eye, EyeOff, Sliders,
  AlignJustify, LayoutGrid
} from 'lucide-react';
import { OnlineSearchModal } from './OnlineSearchModal';
import { ChordDetailModal } from './ChordDetailModal';
import { FileImportModal } from './FileImportModal';
import { useMusicalContext } from '../context/MusicalContext';
import { SongModularWorkspace } from './SongModularWorkspace';
import { LockPasswordModal, AddToPlaylistModal, DeleteSongConfirmModal } from './SongbookModals';

interface SongbookProps {
  customNewSong?: Song | null;
  onSelectSongForYoutube?: (song: Song) => void;
}

export const Songbook: React.FC<SongbookProps> = ({
  customNewSong,
  onSelectSongForYoutube,
}) => {
  const {
    activeSong: globalActiveSong,
    setActiveSong: setGlobalActiveSong,
    transposeSemitones,
    setTransposeSemitones,
    capo: capoFret,
    setCapo: setCapoFret,
    setKey,
    setBpm,
    setTuning,
  } = useMusicalContext();

  const [songs, setSongs] = useState<Song[]>(() => songDatabaseService.getSongs());

  useEffect(() => {
    const unsub = songDatabaseService.subscribe((updatedSongs) => {
      setSongs(updatedSongs);
    });
    return unsub;
  }, []);

  const [activeSongLocal, setActiveSongLocal] = useState<Song>(() => globalActiveSong || songs[0] || {
    id: 'sample',
    title: 'Stánky',
    artist: 'Brontozaři',
    key: 'G',
    tuning: 'Standard (EADGBe)',
    bpm: 90,
    content: '[G]U stánků na levnou krásu [C]postávaj a [G]smutně koukaj...',
    chordsUsed: ['G', 'C'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const activeSong = globalActiveSong || activeSongLocal;

  const setActiveSong = (song: Song | ((prev: Song) => Song)) => {
    if (typeof song === 'function') {
      const next = song(activeSong);
      setActiveSongLocal(next);
      setGlobalActiveSong(next);
    } else {
      setActiveSongLocal(song);
      setGlobalActiveSong(song);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingTuningInline, setIsEditingTuningInline] = useState(false);
  const [inlineTuningVal, setInlineTuningVal] = useState('');
  const [selectedModalChord, setSelectedModalChord] = useState<string | null>(null);
  const [isOnlineSearchOpen, setIsOnlineSearchOpen] = useState(false);
  const [isFileImportOpen, setIsFileImportOpen] = useState(false);

  // Enlargement & Stage Mode States
  const [fontSize, setFontSize] = useState<number>(16);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isStageCleanMode, setIsStageCleanMode] = useState<boolean>(false);
  const [isExpandedHeight, setIsExpandedHeight] = useState<boolean>(false);

  // Playlists, Sorting & Alphabet Filter States
  const [playlists, setPlaylists] = useState<{ id: string; name: string; songIds: string[] }[]>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('band_playlists_db');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return [
      { id: 'all', name: 'Vše', songIds: [] },
      { id: 'favorites', name: 'Oblíbené', songIds: [] },
      { id: 'concert', name: 'Koncertní set', songIds: [] }
    ];
  });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('all');
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [sortMode, setSortMode] = useState<ZpusobRazeni>('recent');

  /** Nastavení filtru přežije zavření okna — jinak by se skládalo pořád dokola. */
  const [filtr, setFiltrStav] = useState<SongFilter>(() => nactiFiltr());
  const setFiltr = (f: SongFilter) => {
    setFiltrStav(f);
    ulozFiltr(f);
  };
  const selectedLetter = filtr.pismeno;
  const setSelectedLetter = (p: string | null) => setFiltr({ ...filtr, pismeno: p });

  // View Mode: 'detailed' (full cards with badges) vs 'compact' (1-line: Band - Song)
  /** Filtry a seznam skladeb jsou v základu sbalené — stránka pak začíná
   *  hledáním, ne dvěma obrazovkami ovládání. */
  /** Které z obou hledání je otevřené. Pamatuje se — kdo hledá jen ve
   *  svém, nechce mít Last.fm přes půl obrazovky při každém spuštění. */
  const [levaOtevrena, setLevaOtevrena] = useState(() => {
    try {
      return localStorage.getItem('neverlate_leva_strana') !== '0';
    } catch {
      return true;
    }
  });
  const [pravaOtevrena, setPravaOtevrena] = useState(() => {
    try {
      return localStorage.getItem('neverlate_prava_strana') !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('neverlate_leva_strana', levaOtevrena ? '1' : '0');
      localStorage.setItem('neverlate_prava_strana', pravaOtevrena ? '1' : '0');
    } catch {
      /* plné úložiště nesmí zabránit zavření strany */
    }
  }, [levaOtevrena, pravaOtevrena]);

  const [filtryOtevrene, setFiltryOtevrene] = useState(false);
  const [seznamOtevreny, setSeznamOtevreny] = useState(false);

  // Výchozí je řádkový výpis; detailní si člověk zapne, když chce vidět
  // odznaky obsahu. Uložená volba z minula má přednost.
  const [songListViewMode, setSongListViewMode] = useState<'detailed' | 'compact'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('strumos_songlist_view_mode');
      if (saved === 'detailed' || saved === 'compact') return saved;
    }
    return 'compact';
  });

  const toggleSongListViewMode = (mode: 'detailed' | 'compact') => {
    setSongListViewMode(mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('strumos_songlist_view_mode', mode);
    }
  };

  // Success / Toast Messages
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modals state for Lock & AddToPlaylist & Delete
  const [lockModalSong, setLockModalSong] = useState<Song | null>(null);
  const [lockModalMode, setLockModalMode] = useState<'lock' | 'unlock' | 'delete' | 'edit'>('lock');
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);

  const [deleteModalSong, setDeleteModalSong] = useState<Song | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [playlistModalSong, setPlaylistModalSong] = useState<Song | null>(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);

  // Sync edited chords & musical context parameters when song changes
  useEffect(() => {
    if (activeSong) {
      setCapoFret(activeSong.capo || 0);
      if (activeSong.key) setKey(activeSong.key);
      if (activeSong.bpm) setBpm(activeSong.bpm);
      if (activeSong.tuning) setTuning(activeSong.tuning);
    }
  }, [activeSong?.id, activeSong?.key, activeSong?.bpm, activeSong?.tuning]);

  // Keep songs state automatically backed up
  useEffect(() => {
    if (typeof localStorage !== 'undefined' && songs && songs.length > 0) {
    }
  }, [songs]);

  // Sync playlists to localStorage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('band_playlists_db', JSON.stringify(playlists));
    }
  }, [playlists]);

  // Form states for creating song
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editKey, setEditKey] = useState('G');
  const [editTuning, setEditTuning] = useState('Standard (EADGBe)');
  const [editBpm, setEditBpm] = useState(90);
  const [editContent, setEditContent] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleCreateSong = () => {
    const newSong: Song = {
      id: crypto.randomUUID(),
      title: editTitle || 'Nová skladba',
      artist: editArtist || 'Neznámý interpret',
      key: editKey,
      tuning: editTuning,
      bpm: editBpm,
      content: editContent,
      chordsUsed: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    songDatabaseService.saveSong(newSong);
    setActiveSong(newSong);
    setIsEditing(false);
    showToast(`Skladba "${newSong.title}" byla uložena.`);
  };

  const handleSongImported = (importedSong: Song) => {
    songDatabaseService.saveSong(importedSong);
    setActiveSong(importedSong);
    setTransposeSemitones(0);
    showToast(`Skladba "${importedSong.title}" byla importována.`);
  };

  const handleUpdateSong = (updatedSong: Song) => {
    songDatabaseService.saveSong(updatedSong);
    setActiveSong(updatedSong);
    setSongs((prev) => prev.map((s) => (s.id === updatedSong.id ? updatedSong : s)));
  };

  // Lock / Delete Actions
  const handleLockClick = (song: Song, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLockModalSong(song);
    setLockModalMode(song.isLocked ? 'unlock' : 'lock');
    setIsLockModalOpen(true);
  };

  const handleDeleteClick = (song: Song, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (song.isLocked) {
      setLockModalSong(song);
      setLockModalMode('delete');
      setIsLockModalOpen(true);
    } else {
      setDeleteModalSong(song);
      setIsDeleteModalOpen(true);
    }
  };

  const performDeleteSong = (songId: string) => {
    const deletedSong = songs.find((s) => s.id === songId);
    const deletedTitle = deletedSong?.title || 'Skladba';

    songDatabaseService.deleteSong(songId);

    setPlaylists((prev) =>
      prev.map((p) => ({
        ...p,
        songIds: p.songIds.filter((id) => id !== songId),
      }))
    );

    const updatedSongs = songs.filter((s) => s.id !== songId);
    setSongs(updatedSongs);

    if (activeSong?.id === songId) {
      if (updatedSongs.length > 0) {
        setActiveSong(updatedSongs[0]);
      } else {
        const defaultEmptySong: Song = {
          id: crypto.randomUUID(),
          title: 'Nová skladba',
          artist: '',
          key: 'C',
          tuning: 'Standard (EADGBe)',
          bpm: 120,
          content: '',
          chordsUsed: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setActiveSong(defaultEmptySong);
      }
    }

    showToast(`Skladba "${deletedTitle}" byla úspěšně smazána.`);
  };

  const handleLockConfirmed = (password: string) => {
    if (!lockModalSong) return;
    const updated: Song = {
      ...lockModalSong,
      isLocked: true,
      lockPassword: password,
      updatedAt: Date.now(),
    };
    handleUpdateSong(updated);
    showToast(`Skladba "${lockModalSong.title}" byla uzamčena adminem.`);
  };

  const handleUnlockConfirmed = () => {
    if (!lockModalSong) return;
    const updated: Song = {
      ...lockModalSong,
      isLocked: false,
      updatedAt: Date.now(),
    };
    handleUpdateSong(updated);
    showToast(`Skladba "${lockModalSong.title}" byla odemčena.`);
  };

  const handleOpenAddToPlaylist = (song: Song, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPlaylistModalSong(song);
    setIsPlaylistModalOpen(true);
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const item = {
      id: 'pl_' + Date.now(),
      name: newPlaylistName.trim(),
      songIds: [],
    };
    setPlaylists((prev) => [...prev, item]);
    setSelectedPlaylistId(item.id);
    setNewPlaylistName('');
    setShowNewPlaylistInput(false);
  };

  const toggleSongInPlaylist = (playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== playlistId) return p;
        const alreadyHas = p.songIds.includes(songId);
        return {
          ...p,
          songIds: alreadyHas ? p.songIds.filter((id) => id !== songId) : [...p.songIds, songId],
        };
      })
    );
  };

  // Helper to extract content tags for library song list
  const getSongContentBadges = (song: Song) => {
    const badges = [];
    if ((song.youtubeVideos?.length || 0) > 0) {
      badges.push({ id: 'yt', label: 'YouTube', icon: '🎥', color: 'bg-red-500/20 text-red-300 border-red-500/30' });
    }
    if (song.content && song.content.trim().length > 0) {
      badges.push({ id: 'txt', label: 'Text', icon: '📝', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' });
    }
    if ((song.chordsUsed?.length || 0) > 0 || /\[[^\]]+\]/.test(song.content || '')) {
      badges.push({ id: 'chords', label: 'Akordy', icon: '🎸', color: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30' });
    }
    if (
      (song.tabs?.length || 0) > 0 ||
      song.attachments?.some((a) => a.type === 'guitarpro' || a.type === 'txt') ||
      /tab|e\|---|b\|---/i.test(song.content || '')
    ) {
      badges.push({ id: 'tabs', label: 'Tabs', icon: '📑', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' });
    }
    if ((song.midiFiles?.length || 0) > 0 || song.attachments?.some((a) => a.type === 'midi')) {
      badges.push({ id: 'midi', label: 'Midi', icon: '🎹', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' });
    }
    if ((song.sheetMusic?.length || 0) > 0 || song.attachments?.some((a) => a.type === 'pdf')) {
      badges.push({ id: 'notes', label: 'Noty', icon: '🎼', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' });
    }
    if ((song.images?.length || 0) > 0 || song.attachments?.some((a) => a.type === 'image')) {
      badges.push({ id: 'img', label: 'Obrázky', icon: '🖼️', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' });
    }
    if ((song.links?.length || 0) > 0) {
      badges.push({ id: 'links', label: 'Odkazy', icon: '🔗', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' });
    }
    return badges;
  };

  // Nabídka filtrů se počítá z celé knihovny, ne z právě vyfiltrovaného
  // výběru — nabídka, která se pod rukama zmenšuje podle toho, co jsi
  // zrovna zaškrtl, se ovládá mizerně.
  const fasety = useMemo(() => sestavFasety(songs), [songs]);

  const vPlaylistu = useMemo(() => {
    if (selectedPlaylistId === 'all') return songs;
    const pl = playlists.find((p) => p.id === selectedPlaylistId);
    return pl ? songs.filter((s) => pl.songIds.includes(s.id)) : songs;
  }, [songs, playlists, selectedPlaylistId]);

  const filteredSongs = useMemo(
    () => seradSkladby(filtrujSkladby(vPlaylistu, { ...filtr, hledani: searchQuery }), sortMode),
    [vPlaylistu, filtr, searchQuery, sortMode]
  );

  return (
    <div className="w-full space-y-4 font-sans pb-16">

      {/* Success / Toast Banner */}
      {toastMsg && (
        <div className="bg-[#30D158]/15 border border-[#30D158]/30 rounded-2xl px-4 py-2.5 text-xs text-[#30D158] flex items-center justify-between shadow-md">
          <span>{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="text-white hover:text-[#30D158]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Knihovna nahoře přes celou šířku, píseň pod ní. Dřív to byly dva
          sloupce vedle sebe: seznam se mačkal do třetiny obrazovky a píseň
          přišla o zbytek. Na šířku se do řádku vejde čtyřikrát víc skladeb. */}
      <div className="flex flex-col gap-4">
        {/* Dvě hledání vedle sebe, oddělená čárou: vlevo svět, vpravo tvoje
            knihovna. Pod sebou nebylo na první pohled poznat, které pole
            sahá kam. Každá strana se dá zavřít — když hledáš jen ve svém,
            půlka obrazovky s Last.fm jen překáží. */}
        <div
          className={`grid gap-0 items-start ${
            levaOtevrena && pravaOtevrena ? 'lg:grid-cols-2' : 'grid-cols-1'
          }`}
        >
        {levaOtevrena ? (
        <div className="bg-[#16161A]/60 backdrop-blur-xl border border-[#FF9F0A]/20 rounded-3xl lg:rounded-r-none lg:border-r-0 p-4 sm:p-5 shadow-xl space-y-2.5 h-full">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#FF9F0A]" />
            <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Objevit novou skladbu
            </h2>
            <span className="text-[10px] text-neutral-500">Last.fm — hledá venku, ne ve tvé knihovně</span>
            <button
              onClick={() => setLevaOtevrena(false)}
              className="ml-auto p-1 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer shrink-0"
              title="Zavřít objevování"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
            <ObjevSkladby
              onPridat={(interpret, nazev) => {
                const nova: Song = {
                  id: `song_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  title: nazev,
                  artist: interpret,
                  key: '',
                  content: '',
                  chordsUsed: [],
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                void songDatabaseService.saveSong(nova).then((ulozena) => {
                  spustDoplneni(ulozena.id);
                  setToastMsg(`„${nazev}" přidáno. Sháním k tomu materiály…`);
                });
              }}
            />

        </div>
        ) : (
          <button
            onClick={() => setLevaOtevrena(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#16161A]/60 border border-[#FF9F0A]/20 rounded-3xl text-left cursor-pointer hover:border-[#FF9F0A]/40 transition-all"
          >
            <Globe className="w-4 h-4 text-[#FF9F0A] shrink-0" />
            <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
              Objevit novou skladbu
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-500 ml-auto" />
          </button>
        )}

        {pravaOtevrena ? (
        <div className={`bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 sm:p-5 flex flex-col gap-3 shadow-xl h-full ${
          levaOtevrena ? 'lg:rounded-l-none lg:border-l-white/[0.14]' : ''
        }`}>
          {/* Search & Actions Header */}
          <div className="space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#FF9F0A]" />
                <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Moje skladby ({filteredSongs.length})
                </h2>
              </div>
              <button
                onClick={() => setPravaOtevrena(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer shrink-0"
                title="Zavřít vlastní knihovnu"
              >
                <X className="w-3.5 h-3.5" />
              </button>

            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Hledat ve svých skladbách…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/[0.08] text-white rounded-2xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-[#FF9F0A]/50 focus:bg-white/[0.08] placeholder-neutral-500 transition-all"
              />
            </div>

            {/* Alphabet Index Row */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none select-none">
              <button
                onClick={() => setSelectedLetter(null)}
                className={`px-2 py-1 text-[10px] font-medium rounded-lg border shrink-0 transition-all cursor-pointer ${
                  !selectedLetter
                    ? 'bg-white/20 text-white border-white/25 font-semibold'
                    : 'bg-white/[0.04] text-neutral-400 border-white/[0.04] hover:text-white'
                }`}
              >
                Vše
              </button>
              {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => {
                const hasSongs = songs.some((s) => s.title.toUpperCase().startsWith(letter));
                const isActive = selectedLetter === letter;
                return (
                  <button
                    key={letter}
                    onClick={() => setSelectedLetter(isActive ? null : letter)}
                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md border shrink-0 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] font-bold'
                        : hasSongs
                        ? 'bg-white/[0.06] text-neutral-300 border-white/[0.08] hover:border-white/20'
                        : 'bg-transparent text-neutral-600 border-transparent cursor-not-allowed'
                    }`}
                    disabled={!hasSongs}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>

            {/* Roletka s ovládáním. V základu sbalená — hledání stačí na
                většinu případů a filtry si člověk otevře, až je potřebuje. */}
            <button
              onClick={() => {
                // Ovládání a seznam patří k sobě — filtruješ proto, abys
                // v seznamu něco našel. Dvě samostatné roletky vedle sebe
                // znamenaly dvě kliknutí k témuž.
                const nove = !filtryOtevrene;
                setFiltryOtevrene(nove);
                setSeznamOtevreny(nove);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl text-left cursor-pointer transition-all"
            >
              {filtryOtevrene ? (
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              )}
              <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
                Moje skladby — řazení, filtry a seznam
              </span>
              {!jeFiltrPrazdny(filtr) && (
                <span className="text-[9px] font-bold text-black bg-[#FF9F0A] px-1.5 rounded-full">
                  filtr zapnutý
                </span>
              )}
              <span className="ml-auto text-[10px] font-mono text-neutral-500">
                {filteredSongs.length} z {songs.length}
              </span>
            </button>

            <div className={`grid-cols-1 lg:grid-cols-3 gap-3 items-start ${filtryOtevrene ? 'grid' : 'hidden'}`}>
            <div className="flex items-center justify-between bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] text-[11px]">
              <span className="text-neutral-400 font-medium px-2">Řazení</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setSortMode('recent')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                    sortMode === 'recent'
                      ? 'bg-white/15 text-white font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Poslední
                </button>
                {([
                  ['alphabetical', 'Název'],
                  ['artist', 'Interpret'],
                  ['opened', 'Naposledy'],
                ] as [ZpusobRazeni, string][]).map(([id, popis]) => (
                  <button
                    key={id}
                    onClick={() => setSortMode(id)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      sortMode === id
                        ? 'bg-white/15 text-white font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {popis}
                  </button>
                ))}
              </div>
            </div>

            <SongFilterPanel
              filtr={filtr}
              fasety={fasety}
              nalezeno={filteredSongs.length}
              celkem={songs.length}
              onZmena={setFiltr}
            />


            {/* Playlists Selector Panel */}
            <div className="bg-white/[0.03] border border-white/[0.06] p-2.5 rounded-2xl space-y-2 lg:max-h-[300px] lg:overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide flex items-center gap-1.5">
                  <List className="w-3.5 h-3.5 text-[#FF9F0A]" /> Playlisty
                </span>
                <button
                  onClick={() => setShowNewPlaylistInput(!showNewPlaylistInput)}
                  className="text-[10px] font-medium text-[#FF9F0A] hover:underline cursor-pointer"
                >
                  + Nový playlist
                </button>
              </div>

              {showNewPlaylistInput ? (
                <form onSubmit={handleCreatePlaylist} className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Název playlistu..."
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    className="flex-1 bg-black/50 border border-white/15 rounded-xl px-2.5 py-1 text-xs text-white focus:border-[#FF9F0A] outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="bg-[#FF9F0A] text-black text-xs font-semibold px-2.5 rounded-xl cursor-pointer"
                  >
                    OK
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-[72px] overflow-y-auto">
                  {playlists.map((pl) => {
                    const isActive = selectedPlaylistId === pl.id;
                    const songCount =
                      pl.id === 'all'
                        ? songs.length
                        : songs.filter((s) => pl.songIds.includes(s.id)).length;
                    return (
                      <button
                        key={pl.id}
                        onClick={() => {
                          setSelectedPlaylistId(pl.id);
                          setSelectedLetter(null);
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded-xl border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#FF9F0A] border-[#FF9F0A] text-black font-semibold shadow-sm'
                            : 'bg-white/[0.04] border-white/[0.06] text-neutral-400 hover:text-white'
                        }`}
                      >
                        {pl.name} <span className="opacity-70 text-[10px]">({songCount})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            </div>

            {/* Action Buttons: Import */}
            <div className="pt-1">
              <button
                onClick={() => setIsFileImportOpen(true)}
                className="w-full py-2.5 px-3 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <FileUp className="w-4 h-4 text-[#FF9F0A]" />
                <span>Importovat píseň (.txt, .gp, .chordpro, .pdf)</span>
              </button>
            </div>
          </div>

          {/* Seznam skladeb je taky roletka. Přepínač řádky/detailní má
              smysl až uvnitř, proto je vedle nadpisu, ne nad ním. */}
          <div className={`items-center justify-between px-1 pt-2 pb-1 border-t border-white/[0.06] ${seznamOtevreny ? 'flex' : 'hidden'}`}>
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
              Skladby ({filteredSongs.length})
            </span>
            <div className={`items-center bg-black/50 border border-white/10 p-0.5 rounded-xl ${seznamOtevreny ? 'flex' : 'hidden'}`}>
              <button
                onClick={() => toggleSongListViewMode('compact')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  songListViewMode === 'compact'
                    ? 'bg-[#FF9F0A] text-black shadow-sm font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="1-řádkový kompaktní režim (Název skladby & Kapela)"
              >
                <AlignJustify className="w-3 h-3" />
                <span>Řádky</span>
              </button>
              <button
                onClick={() => toggleSongListViewMode('detailed')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  songListViewMode === 'detailed'
                    ? 'bg-[#FF9F0A] text-black shadow-sm font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title="Detailní režim s popisem obsahu a odznaky"
              >
                <LayoutGrid className="w-3 h-3" />
                <span>Detailní</span>
              </button>
            </div>
          </div>

          {/* Songs List with Scroll Support (Compact 1-line or Detailed Cards) */}
          <div
            className={`overflow-y-auto max-h-[46vh] grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-1.5 pr-1 pt-1 ${
              seznamOtevreny ? 'grid' : 'hidden'
            }`}
          >
            {filteredSongs.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-10">
                Žádné skladby neodpovídají filtrům
              </p>
            ) : (
              filteredSongs.map((song) => {
                const isActive = activeSong.id === song.id;
                const badges = getSongContentBadges(song);

                if (songListViewMode === 'compact') {
                  // Compact 1-line view (Band & Song only for high density)
                  return (
                    <div
                      key={song.id}
                      onClick={() => {
                        setActiveSong(song);
                        zaznamenejOtevreni(song.id);
                        setTransposeSemitones(0);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 group ${
                        isActive
                          ? 'bg-[#FF9F0A]/20 border-[#FF9F0A]/40 text-white shadow-sm font-semibold'
                          : 'bg-white/[0.02] hover:bg-white/[0.08] border-white/[0.04] text-neutral-300'
                      }`}
                      title={`${song.artist} - ${song.title}`}
                    >
                      {/* Band & Song 1-line text */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {song.isLocked && (
                          <span title="Uzamčeno">
                            <Lock className="w-3.5 h-3.5 text-[#FF453A] shrink-0" />
                          </span>
                        )}
                        <div className="text-xs truncate flex items-center gap-1.5">
                          <span className="font-bold text-white truncate">{song.title}</span>
                          <span className="text-neutral-500 font-normal shrink-0">—</span>
                          <span className="text-neutral-400 text-[11px] truncate font-medium">{song.artist}</span>
                        </div>
                      </div>

                      {/* Tuning / Key Badge & Compact hover actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] font-medium bg-white/10 text-neutral-300 px-1.5 py-0.5 rounded">
                          {song.tuning ? song.tuning.split(' ')[0] : 'Std'}
                        </span>
                        
                        <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                          <button
                            onClick={(e) => handleOpenAddToPlaylist(song, e)}
                            className="p-1 hover:bg-white/15 text-neutral-300 hover:text-white rounded cursor-pointer"
                            title="Přidat do playlistu"
                          >
                            <ListPlus className="w-3.5 h-3.5 text-[#FF9F0A]" />
                          </button>
                          <button
                            onClick={(e) => handleLockClick(song, e)}
                            className="p-1 hover:bg-white/15 text-neutral-300 hover:text-white rounded cursor-pointer"
                            title={song.isLocked ? 'Odemknout' : 'Uzamknout'}
                          >
                            {song.isLocked ? <Lock className="w-3.5 h-3.5 text-[#FF453A]" /> : <Unlock className="w-3.5 h-3.5 text-neutral-400" />}
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(song, e)}
                            className="p-1 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded cursor-pointer"
                            title="Smazat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Detailed view (Full card with content descriptor badges)
                return (
                  <div
                    key={song.id}
                    onClick={() => {
                      setActiveSong(song);
                      zaznamenejOtevreni(song.id);
                      setTransposeSemitones(0);
                    }}
                    className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer relative group ${
                      isActive
                        ? 'bg-white/15 border-white/25 text-white shadow-md'
                        : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.04] text-neutral-300'
                    }`}
                  >
                    {/* Song Header & Title */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-1 truncate">
                        {song.isLocked && (
                          <span title="Zamčeno adminem">
                            <Lock className="w-3.5 h-3.5 text-[#FF453A] shrink-0" />
                          </span>
                        )}
                        <h3 className="font-bold text-xs truncate text-white">{song.title}</h3>
                      </div>
                      <span className="text-[10px] font-medium bg-white/10 text-neutral-300 px-2 py-0.5 rounded-md shrink-0">
                        {song.tuning || 'Standard'}
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-400 mt-0.5 truncate">{song.artist}</p>

                    {/* Content Descriptor Badges ("popis co obsahuje: Youtube, Text, Akordy, Tabs, Midi, Noty, Obrázky, Odkazy") */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {badges.map((b) => (
                        <span
                          key={b.id}
                          className={`text-[9px] font-semibold border px-1.5 py-0.5 rounded-md flex items-center gap-1 ${b.color}`}
                        >
                          <span>{b.icon}</span>
                          <span>{b.label}</span>
                        </span>
                      ))}
                    </div>

                    {/* Quick Card Action Toolbar */}
                    <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-1.5 border-t border-white/[0.06] opacity-90 group-hover:opacity-100">
                      {/* Add to playlist button */}
                      <button
                        onClick={(e) => handleOpenAddToPlaylist(song, e)}
                        className="p-1.5 bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                        title="Přidat do playlistu"
                      >
                        <ListPlus className="w-3.5 h-3.5 text-[#FF9F0A]" />
                        <span>Playlist</span>
                      </button>

                      {/* Lock / Unlock button */}
                      <button
                        onClick={(e) => handleLockClick(song, e)}
                        className={`p-1.5 rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition-colors ${
                          song.isLocked
                            ? 'bg-[#FF453A]/20 text-[#FF453A] border border-[#FF453A]/30'
                            : 'bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white'
                        }`}
                        title={song.isLocked ? 'Odemknout skladbu' : 'Uzamknout adminem'}
                      >
                        {song.isLocked ? <Lock className="w-3.5 h-3.5 text-[#FF453A]" /> : <Unlock className="w-3.5 h-3.5 text-neutral-400" />}
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDeleteClick(song, e)}
                        className="p-1.5 bg-white/5 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded-lg cursor-pointer transition-colors"
                        title="Odstranit z knihovny"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        ) : (
          <button
            onClick={() => setPravaOtevrena(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#16161A]/80 border border-white/[0.08] rounded-3xl text-left cursor-pointer hover:border-white/20 transition-all"
          >
            <BookOpen className="w-4 h-4 text-[#FF9F0A] shrink-0" />
            <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
              Moje skladby ({songs.length})
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-500 ml-auto" />
          </button>
        )}
        </div>

        {/* Main View: Song Viewer with Modular Windows Workspace */}
        <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 flex flex-col relative min-h-[820px] shadow-xl space-y-4">
          {/* Song Header & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight">
                  {activeSong.title}
                </h1>

                {activeSong.isLocked && (
                  <span className="bg-[#FF453A]/20 text-[#FF453A] border border-[#FF453A]/30 font-bold text-[10px] px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Zamčeno adminem
                  </span>
                )}

                {isEditingTuningInline ? (
                  <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 p-1 rounded-xl">
                    <select
                      value={TUNING_PRESETS.some((t) => t.name === inlineTuningVal) ? inlineTuningVal : ''}
                      onChange={(e) => {
                        if (e.target.value && e.target.value !== 'Vlastní') {
                          setInlineTuningVal(e.target.value);
                        }
                      }}
                      className="bg-black/80 border border-white/10 text-white text-xs p-1 rounded-lg focus:outline-none"
                    >
                      <option value="">-- Předvolba --</option>
                      {TUNING_PRESETS.map((tuning) => (
                        <option key={tuning.name} value={tuning.name}>
                          {tuning.name}
                        </option>
                      ))}
                      <option value="Vlastní">Vlastní...</option>
                    </select>
                    <input
                      type="text"
                      value={inlineTuningVal}
                      onChange={(e) => setInlineTuningVal(e.target.value)}
                      className="bg-black/80 border border-white/10 text-white text-xs p-1 w-28 rounded-lg outline-none"
                      placeholder="Ladění..."
                    />
                    <button
                      onClick={() => {
                        const updatedSong = { ...activeSong, tuning: inlineTuningVal || 'Standard (EADGBe)' };
                        handleUpdateSong(updatedSong);
                        setIsEditingTuningInline(false);
                      }}
                      className="p-1 bg-[#30D158]/20 text-[#30D158] rounded-lg hover:bg-[#30D158] hover:text-black cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setIsEditingTuningInline(false)}
                      className="p-1 bg-white/10 text-neutral-400 rounded-lg hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setInlineTuningVal(activeSong.tuning || 'Standard (EADGBe)');
                      setIsEditingTuningInline(true);
                    }}
                    className="text-xs font-medium text-neutral-300 bg-white/[0.06] hover:bg-white/[0.12] px-2.5 py-1 rounded-xl border border-white/[0.08] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>🎸 Ladění: {activeSong.tuning || 'Standard (EADGBe)'}</span>
                    <span className="text-[10px] text-[#FF9F0A]">(Změnit)</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">{activeSong.artist}</p>
            </div>

            {/* Quick Actions Header Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Add to Playlist */}
              <button
                onClick={() => handleOpenAddToPlaylist(activeSong)}
                className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <ListPlus className="w-3.5 h-3.5 text-[#FF9F0A]" />
                <span>Do playlistu</span>
              </button>

              {/* Fullscreen Stage Mode */}
              <button
                onClick={() => setIsFullscreen(true)}
                className="px-3.5 py-1.5 bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                title="Pódiový režim s nastavitelnými oknami"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Pódium</span>
              </button>

              {/* Delete Active Song button */}
              <button
                onClick={(e) => handleDeleteClick(activeSong, e)}
                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 hover:border-red-500/40 text-red-400 hover:text-red-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
                title="Smazat skladbu ze zpěvníku"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Smazat</span>
              </button>
            </div>
          </div>

          {/* SONG MODULAR WORKSPACE (Movable & Resizable Windows) */}
          <SongModularWorkspace
            song={activeSong}
            onUpdateSong={handleUpdateSong}
            transposeSemitones={transposeSemitones}
            setTransposeSemitones={setTransposeSemitones}
            capoFret={capoFret}
            setCapoFret={setCapoFret}
            fontSize={fontSize}
            setFontSize={setFontSize}
            onOpenImportModal={() => setIsFileImportOpen(true)}
            onSelectModalChord={setSelectedModalChord}
          />
        </div>
      </div>

      {/* FULLSCREEN STAGE VIEW MODAL (PÓDIOVÝ REŽIM) */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-[#0E0E12] text-[#E5E5EA] flex flex-col font-sans p-4 sm:p-6 overflow-y-auto select-none">
          {/* Stage Mode Header */}
          {!isStageCleanMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1C1C22]/90 backdrop-blur-2xl border border-white/15 rounded-2xl p-4 mb-4 shadow-2xl">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="bg-[#FF9F0A] text-black font-extrabold text-[10px] px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                    Pódiový režim
                  </span>
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {activeSong.title}
                  </h1>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {activeSong.artist} • Ladění: <span className="text-[#FF9F0A] font-medium">{activeSong.tuning || 'Standard (EADGBe)'}</span>
                </p>
              </div>

              {/* Controls Grid */}
              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={() => setIsStageCleanMode(true)}
                  className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-neutral-300 hover:text-white text-xs font-medium rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <EyeOff className="w-4 h-4 text-neutral-400" />
                  <span>Čistý režim</span>
                </button>

                <button
                  onClick={() => setIsFullscreen(false)}
                  className="px-3.5 py-1.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  <Minimize2 className="w-4 h-4" />
                  <span>Zavřít Pódium</span>
                </button>
              </div>
            </div>
          )}

          {/* Floating Exit Button when in Clean Mode */}
          {isStageCleanMode && (
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
              <button
                onClick={() => setIsStageCleanMode(false)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 backdrop-blur-xl border border-white/10 cursor-pointer shadow-lg"
              >
                <Eye className="w-4 h-4 text-[#30D158]" />
                <span>Nástroje</span>
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="px-3 py-1.5 bg-[#FF453A] text-white text-xs font-semibold rounded-xl cursor-pointer shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Stage Workspace */}
          <div className="flex-1 w-full max-w-7xl mx-auto py-2">
            <SongModularWorkspace
              song={activeSong}
              onUpdateSong={handleUpdateSong}
              isStageMode={true}
              transposeSemitones={transposeSemitones}
              setTransposeSemitones={setTransposeSemitones}
              capoFret={capoFret}
              setCapoFret={setCapoFret}
              fontSize={fontSize}
              setFontSize={setFontSize}
              onOpenImportModal={() => setIsFileImportOpen(true)}
              onSelectModalChord={setSelectedModalChord}
            />
          </div>
        </div>
      )}

      {/* New Song Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-[#1C1C1E] border border-white/15 text-white max-w-2xl w-full p-6 rounded-3xl shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <Music className="w-5 h-5 text-[#FF9F0A]" /> Vložit novou skladbu
            </h3>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-neutral-400 mb-1">Název skladby</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Např. Stánky"
                    className="w-full bg-black/60 border border-white/10 rounded-xl p-2.5 text-white focus:border-[#FF9F0A] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">Interpret</label>
                  <input
                    type="text"
                    value={editArtist}
                    onChange={(e) => setEditArtist(e.target.value)}
                    placeholder="Nedvědi"
                    className="w-full bg-black/60 border border-white/10 rounded-xl p-2.5 text-white focus:border-[#FF9F0A] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Ladění kytary</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    onChange={(e) => {
                      if (e.target.value && e.target.value !== 'Vlastní') {
                        setEditTuning(e.target.value);
                      }
                    }}
                    className="w-full bg-black/60 border border-white/10 rounded-xl p-2.5 text-white text-xs focus:border-[#FF9F0A] outline-none"
                    value={TUNING_PRESETS.some((t) => t.name === editTuning) ? editTuning : ''}
                  >
                    <option value="">-- Vyberte předvolbu --</option>
                    {TUNING_PRESETS.map((tuning) => (
                      <option key={tuning.name} value={tuning.name}>
                        {tuning.name}
                      </option>
                    ))}
                    <option value="Vlastní">Vlastní (ručně vpravo)...</option>
                  </select>
                  <input
                    type="text"
                    value={editTuning}
                    onChange={(e) => setEditTuning(e.target.value)}
                    placeholder="Např. Standard (EADGBe)..."
                    className="w-full bg-black/60 border border-white/10 rounded-xl p-2.5 text-white focus:border-[#FF9F0A] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  Text s akordy v hranatých závorkách (např. [G]Když se u [C]nás)
                </label>
                <textarea
                  rows={8}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-2xl p-3 text-xs font-mono text-white focus:border-[#FF9F0A] outline-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-neutral-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleCreateSong}
                  className="px-4 py-2 bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 text-black text-xs font-semibold rounded-xl cursor-pointer shadow-md"
                >
                  Uložit skladbu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Online Search Modal */}
      <OnlineSearchModal
        isOpen={isOnlineSearchOpen}
        onClose={() => setIsOnlineSearchOpen(false)}
        onSongImported={(newSong) => {
          const updated = [newSong, ...songs];
          setSongs(updated);
          setActiveSong(newSong);
        }}
      />

      {/* File Import Modal (.txt, .pdf, .mid, .gp) */}
      <FileImportModal
        isOpen={isFileImportOpen}
        onClose={() => setIsFileImportOpen(false)}
        onSongImported={handleSongImported}
      />

      {/* Interactive Chord Detail & Audio Popup Modal */}
      <ChordDetailModal
        chordName={selectedModalChord}
        onClose={() => setSelectedModalChord(null)}
      />

      {/* Admin Lock / Password Modal */}
      <LockPasswordModal
        isOpen={isLockModalOpen}
        song={lockModalSong}
        mode={lockModalMode}
        onClose={() => setIsLockModalOpen(false)}
        onSuccess={() => {
          if (lockModalSong && lockModalMode === 'delete') {
            performDeleteSong(lockModalSong.id);
          } else if (lockModalSong && lockModalMode === 'unlock') {
            handleUnlockConfirmed();
          }
        }}
        onLockConfirmed={handleLockConfirmed}
      />

      {/* Add To Playlist Modal */}
      <AddToPlaylistModal
        isOpen={isPlaylistModalOpen}
        song={playlistModalSong}
        playlists={playlists}
        onClose={() => setIsPlaylistModalOpen(false)}
        onToggleSongInPlaylist={toggleSongInPlaylist}
        onCreateNewPlaylist={(name) => {
          const item = { id: 'pl_' + Date.now(), name, songIds: [] };
          setPlaylists((prev) => [...prev, item]);
          if (playlistModalSong) {
            toggleSongInPlaylist(item.id, playlistModalSong.id);
          }
        }}
        onAddedSuccessToast={showToast}
      />
      {/* Delete Song Confirmation Modal */}
      <DeleteSongConfirmModal
        isOpen={isDeleteModalOpen}
        song={deleteModalSong}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteModalSong(null);
        }}
        onConfirm={() => {
          if (deleteModalSong) {
            performDeleteSong(deleteModalSong.id);
          }
        }}
      />
    </div>
  );
};
