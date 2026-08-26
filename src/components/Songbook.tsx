import React, { useState, useEffect, useMemo } from 'react';
import { ObjevSkladby } from './songbook/ObjevSkladby';
import { SeznamSkladeb } from './songbook/SeznamSkladeb';
import { Podium } from './songbook/Podium';
import { spustDoplneni } from '../services/enrichmentClient';
import {
  PRAZDNY_FILTR,
  filtrujSkladby,
  zaznamenejOtevreni,
} from '../services/songFilters';
import { Song } from '../types';
import { TUNING_PRESETS } from '../data/chordsAndScales';
import { songDatabaseService } from '../services/songDatabaseService';
import {
  Search, Plus, BookOpen, Music, Check,
  Maximize2, Minimize2, X, FileUp, ChevronRight, Globe,
  Trash2, List, Edit3, Lock, Unlock,
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

  /** Ukázka z YouTube spuštěná z řádku skladby. */

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

  const vPlaylistu = useMemo(() => {
    if (selectedPlaylistId === 'all') return songs;
    const pl = playlists.find((p) => p.id === selectedPlaylistId);
    return pl ? songs.filter((s) => pl.songIds.includes(s.id)) : songs;
  }, [songs, playlists, selectedPlaylistId]);

  // Hledání je jediné, co seznam zkracuje. Řazení a výběr údajů si řeší
  // SeznamSkladeb sám podle zaškrtnutých polí.
  const filteredSongs = useMemo(
    () => filtrujSkladby(vPlaylistu, { ...PRAZDNY_FILTR, hledani: searchQuery }),
    [vPlaylistu, searchQuery]
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
        {/* Dvě strany: vlevo svět, vpravo tvoje knihovna. Sbalené se dělí
            taky — dvě úzké lišty pod sebou vypadaly jako dva nesouvisející
            řádky, vedle sebe je vidět, že jde o dvojici. Otevřený panel
            sám dostane celou šířku; teprve když jsou otevřené oba, dělí
            se o ni. */}
        <div
          className={`grid gap-4 items-start ${
            levaOtevrena === pravaOtevrena ? 'lg:grid-cols-2' : 'grid-cols-1'
          }`}
        >
        {levaOtevrena ? (
        <div className="bg-[#16161A]/60 backdrop-blur-xl border border-[#FF9F0A]/20 rounded-3xl p-4 sm:p-5 shadow-xl space-y-2.5 h-full">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#FF9F0A]" />
            <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Objevit novou skladbu
            </h2>
            <span className="text-[10px] text-neutral-500">Last.fm — hledá venku, ne ve tvé knihovně</span>
            {/* Jedna ikona pro obojí: otočená šipka říká, kterým směrem
                se panel chystá jít. Křížek vedle šipky na otevírání jen
                nutil hledat, který ovladač je ten správný. */}
            <button
              onClick={() => setLevaOtevrena(false)}
              className="ml-auto p-1 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer shrink-0"
              title="Sbalit objevování"
            >
              <ChevronRight className="w-4 h-4 rotate-90 transition-transform" />
            </button>
          </div>
            <ObjevSkladby
              songs={songs}
              activeSong={activeSong}
              onVybratSkladbu={(sk) => {
                setActiveSong(sk);
                zaznamenejOtevreni(sk.id);
              }}
              onPridatSkladbu={(sk) => {
                void songDatabaseService.saveSong(sk);
                setActiveSong(sk);
              }}
              onUlozitVidea={(songId, videa) => {
                const p = songs.find((x) => x.id === songId);
                if (!p) return;
                const nova = { ...p, youtubeVideos: videa, updatedAt: Date.now() };
                void songDatabaseService.saveSong(nova);
                if (activeSong?.id === songId) setActiveSong(nova);
              }}
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
        <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 sm:p-5 flex flex-col gap-3 shadow-xl h-full">
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
                title="Sbalit vlastní knihovnu"
              >
                <ChevronRight className="w-4 h-4 rotate-90 transition-transform" />
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
          </div>

            {/* Seznam si nese vlastní zaškrtávátka údajů — samostatný panel
                filtrů odešel, protože říkal totéž dvakrát a navíc uměl
                skladby schovat. */}
            <SeznamSkladeb
              songs={filteredSongs}
              aktivniId={activeSong?.id}
              onVybrat={(s) => {
                setActiveSong(s);
                zaznamenejOtevreni(s.id);
                setTransposeSemitones(0);
              }}
              onZamknout={handleLockClick}
              onSmazat={handleDeleteClick}
              onDoPlaylistu={handleOpenAddToPlaylist}
            />
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

        {/* Pódium — playlist a k němu plocha s okny. Píseň sama tu už
            nemá vlastní blok: co je na ní vidět, si každý naklikal sám
            a Pódium to při přepnutí skladby vymění. */}
        <Podium
          songs={songs}
          /* „Vše" je filtr knihovny, ne set list — na Pódiu by byl vždycky
             prázdný a tvářil se, že si tam nic nepřidal. */
          playlists={playlists.filter((p) => p.id !== 'all')}
          aktivni={activeSong}
          onVybrat={(sk) => {
            setActiveSong(sk);
            zaznamenejOtevreni(sk.id);
            setTransposeSemitones(0);
          }}
          plocha={
            activeSong ? (
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
            ) : (
              <div className="h-full flex items-center justify-center text-center text-[12px] text-neutral-600 border border-dashed border-white/[0.08] rounded-2xl p-10">
                Vyber skladbu z playlistu nebo z knihovny vpravo.
              </div>
            )
          }
        />
      </div>

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
