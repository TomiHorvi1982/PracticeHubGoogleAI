import React, { useState, useEffect, useRef } from 'react';
import { Song, BandSession } from '../types';
import { INITIAL_SONGS, CHORDS_DATABASE } from '../data/chordsAndScales';
import { sessionSync } from '../services/sessionSync';
import {
  Search, Plus, Play, Pause, ChevronUp, ChevronDown,
  FileText, Camera, Share2, BookOpen, Music, Check, Globe, HelpCircle,
  Repeat, Repeat1, Zap, Maximize2, Minimize2, ZoomIn, ZoomOut, Type, Eye, EyeOff, X, FileUp, Volume2, Youtube
} from 'lucide-react';
import { OnlineSearchModal } from './OnlineSearchModal';
import { GuitarChordDiagram } from './GuitarChordDiagram';
import { ChordDetailModal } from './ChordDetailModal';
import { FileImportModal } from './FileImportModal';
import { AttachmentViewer } from './AttachmentViewer';
import { ChordHoverPill } from './ChordHoverPill';
import { extractUniqueChords, findOrGenerateChord } from '../utils/chordUtils';
import { parseSongSections, SongSection } from '../utils/songSectionUtils';
import { audioSynth } from '../services/audioSynth';

interface SongbookProps {
  session: BandSession | null;
  onOpenCameraModal: () => void;
  customNewSong?: Song | null;
  onSelectSongForYoutube?: (song: Song) => void;
}

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export const Songbook: React.FC<SongbookProps> = ({
  session,
  onOpenCameraModal,
  customNewSong,
  onSelectSongForYoutube,
}) => {
  const [songs, setSongs] = useState<Song[]>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('band_songs_db');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return INITIAL_SONGS;
        }
      }
    }
    return INITIAL_SONGS;
  });

  const [activeSong, setActiveSong] = useState<Song>(songs[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [transposeSemitones, setTransposeSemitones] = useState(0);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3);
  const [isEditing, setIsEditing] = useState(false);
  const [hoveredChord, setHoveredChord] = useState<string | null>(null);
  const [selectedModalChord, setSelectedModalChord] = useState<string | null>(null);
  const [sharedNotice, setSharedNotice] = useState(false);
  const [isOnlineSearchOpen, setIsOnlineSearchOpen] = useState(false);
  const [isFileImportOpen, setIsFileImportOpen] = useState(false);

  // Enlargement & Stage Mode States
  const [fontSize, setFontSize] = useState<number>(16);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isStageCleanMode, setIsStageCleanMode] = useState<boolean>(false);
  const [isExpandedHeight, setIsExpandedHeight] = useState<boolean>(false);

  // Rhythm Follower & Animated Highlighting States
  const [isRhythmGuideActive, setIsRhythmGuideActive] = useState<boolean>(true);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [isBeatStepperActive, setIsBeatStepperActive] = useState<boolean>(false);
  const [beatsPerLine, setBeatsPerLine] = useState<number>(4);

  const hoveredChordDef = hoveredChord ? findOrGenerateChord(hoveredChord) : null;

  // Section Looping Practice States
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [isLoopActive, setIsLoopActive] = useState(false);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(90);

  // Capo (Kapodastr) State
  const [capoFret, setCapoFret] = useState<number>(activeSong?.capo || 0);

  useEffect(() => {
    if (activeSong) {
      setCapoFret(activeSong.capo || 0);
    }
  }, [activeSong?.id]);

  // Effective transposition considering Capo
  const effectiveTranspose = transposeSemitones - capoFret;

  // Parse sections for active song
  const songSections = parseSongSections(activeSong?.content || '');
  const activeSection = songSections.find((s) => s.id === selectedSectionId) || null;

  // Get all unique chords present in the active song (transposed with capo offset)
  const songChords = extractUniqueChords(activeSong?.content || '', effectiveTranspose);

  // Form states for creating/editing song
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editKey, setEditKey] = useState('G');
  const [editBpm, setEditBpm] = useState(90);
  const [editContent, setEditContent] = useState('');

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fullscreenScrollRef = useRef<HTMLDivElement | null>(null);

  // Get ordered list of all line IDs in current song
  const getAllLineIds = (): string[] => {
    if (songSections.length === 0) {
      const lines = (activeSong?.content || '').split('\n');
      return lines.map((_, idx) => `line-${idx}`);
    }
    const ids: string[] = [];
    songSections.forEach((sec) => {
      sec.lines.forEach((_, lineIdx) => {
        ids.push(`sec-${sec.id}-line-${lineIdx}`);
      });
    });
    return ids;
  };

  // Step active line forward or backward
  const handleStepLine = (direction: 'next' | 'prev') => {
    const lineIds = getAllLineIds();
    if (lineIds.length === 0) return;

    const currentIdx = activeLineId ? lineIds.indexOf(activeLineId) : -1;
    let newIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;

    if (newIdx < 0) newIdx = 0;
    if (newIdx >= lineIds.length) newIdx = lineIds.length - 1;

    const targetLineId = lineIds[newIdx];
    setActiveLineId(targetLineId);

    // Scroll target line into view smooth center
    const targetRef = isFullscreen ? fullscreenScrollRef.current : scrollRef.current;
    if (targetRef) {
      const lineEl = targetRef.querySelector(`[data-line-id="${targetLineId}"]`);
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  // Auto detect active line from scroll position (reader focal line)
  const handleViewerScroll = () => {
    if (!isRhythmGuideActive) return;
    const targetRef = isFullscreen ? fullscreenScrollRef.current : scrollRef.current;
    if (!targetRef) return;

    const lines = targetRef.querySelectorAll<HTMLElement>('.song-lyric-line');
    if (lines.length === 0) return;

    const containerRect = targetRef.getBoundingClientRect();
    const focusPoint = containerRect.top + containerRect.height * 0.3; // 30% down from top

    let closestLineId: string | null = null;
    let minDistance = Infinity;

    lines.forEach((lineEl) => {
      const rect = lineEl.getBoundingClientRect();
      const lineCenter = rect.top + rect.height / 2;
      const distance = Math.abs(lineCenter - focusPoint);
      if (distance < minDistance) {
        minDistance = distance;
        closestLineId = lineEl.getAttribute('data-line-id');
      }
    });

    if (closestLineId && closestLineId !== activeLineId) {
      setActiveLineId(closestLineId);
    }
  };

  // Reset section loop & initialize first line when song changes
  useEffect(() => {
    setSelectedSectionId(null);
    setIsLoopActive(false);
    const lineIds = getAllLineIds();
    if (lineIds.length > 0) {
      setActiveLineId(lineIds[0]);
    } else {
      setActiveLineId(null);
    }
  }, [activeSong]);

  // Handle Keyboard Navigation (ESC, Arrow keys for line stepping)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      if (!isInput && activeSong && isRhythmGuideActive) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          handleStepLine('next');
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          handleStepLine('prev');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, activeSong, activeLineId, songSections, isRhythmGuideActive]);

  // Practice Metronome Effect & Auto Beat Stepper
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isMetronomeActive) {
      let beat = 0;
      const intervalMs = Math.max(150, (60 / metronomeBpm) * 1000);
      interval = setInterval(() => {
        audioSynth.playMetronomeClick(beat === 0);
        beat = (beat + 1) % beatsPerLine;

        if (isBeatStepperActive && beat === 0) {
          handleStepLine('next');
        }
      }, intervalMs);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isMetronomeActive, metronomeBpm, isBeatStepperActive, beatsPerLine, activeLineId, isFullscreen]);

  // Auto-save songs to localStorage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('band_songs_db', JSON.stringify(songs));
    }
  }, [songs]);

  // Handle new AI scanned song added
  useEffect(() => {
    if (customNewSong) {
      setSongs((prev) => [customNewSong, ...prev]);
      setActiveSong(customNewSong);
      setTransposeSemitones(0);
      if (session) {
        sessionSync.broadcastNewSong(customNewSong);
      }
    }
  }, [customNewSong]);

  // Section-Aware Auto-scroll & Looping Effect (Handles normal & fullscreen views)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const targetRef = isFullscreen ? fullscreenScrollRef.current : scrollRef.current;

    if (isAutoScrolling && targetRef) {
      interval = setInterval(() => {
        if (targetRef) {
          // Continuous section loop handling
          if (isLoopActive && selectedSectionId) {
            const secEl = document.getElementById(
              isFullscreen ? `fs-section-${selectedSectionId}` : `section-${selectedSectionId}`
            );
            if (secEl) {
              const containerTop = targetRef.offsetTop;
              const secTop = secEl.offsetTop - containerTop - 10;
              const secBottom = secTop + secEl.offsetHeight;

              if (
                targetRef.scrollTop + targetRef.clientHeight >= secBottom + 10 ||
                targetRef.scrollTop >= secBottom - 10
              ) {
                targetRef.scrollTop = Math.max(0, secTop);
                return;
              }
            }
          }

          targetRef.scrollTop += scrollSpeed * 0.5;

          if (
            !isLoopActive &&
            targetRef.scrollTop + targetRef.clientHeight >= targetRef.scrollHeight - 5
          ) {
            setIsAutoScrolling(false);
          }
        }
      }, 50);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoScrolling, scrollSpeed, isLoopActive, selectedSectionId, isFullscreen]);

  // Handler to toggle section looping
  const handleToggleSectionLoop = (sectionId: string) => {
    if (selectedSectionId === sectionId && isLoopActive) {
      setIsLoopActive(false);
      setSelectedSectionId(null);
    } else {
      setSelectedSectionId(sectionId);
      setIsLoopActive(true);
      setIsAutoScrolling(true);

      const targetRef = isFullscreen ? fullscreenScrollRef.current : scrollRef.current;
      setTimeout(() => {
        const secEl = document.getElementById(
          isFullscreen ? `fs-section-${sectionId}` : `section-${sectionId}`
        );
        if (secEl && targetRef) {
          const containerTop = targetRef.offsetTop;
          targetRef.scrollTop = Math.max(0, secEl.offsetTop - containerTop - 10);
        }
      }, 50);
    }
  };

  // Listen for band session song broadcast & song list synchronization
  useEffect(() => {
    const unsubscribe = sessionSync.subscribe((sessionData) => {
      if (sessionData.songsList && sessionData.songsList.length > 0) {
        setSongs((prevSongs) => {
          const incoming = sessionData.songsList!;
          const existingMap = new Map<string, Song>(prevSongs.map((s) => [s.id, s]));

          let changed = false;
          for (const incSong of incoming) {
            const old = existingMap.get(incSong.id);
            if (!old || old.updatedAt !== incSong.updatedAt || old.content !== incSong.content) {
              existingMap.set(incSong.id, incSong);
              changed = true;
            }
          }

          if (changed || prevSongs.length === 0) {
            const merged = Array.from(existingMap.values());
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('band_songs_db', JSON.stringify(merged));
            }
            return merged;
          }
          return prevSongs;
        });
      }

      if (sessionData.activeSongId) {
        setActiveSong((currentActive) => {
          if (currentActive?.id === sessionData.activeSongId) return currentActive;
          const found = sessionData.songsList?.find((s) => s.id === sessionData.activeSongId);
          if (found) {
            setTransposeSemitones(0);
            return found;
          }
          return currentActive;
        });
      }
    });
    return unsubscribe;
  }, []);

  // Transpose helper supporting slash chords (e.g. G/B -> A/C#)
  const transposeNote = (note: string, semitones: number): string => {
    let root = note;
    if (root === 'Db') root = 'C#';
    if (root === 'D#') root = 'Eb';
    if (root === 'Gb') root = 'F#';
    if (root === 'Ab') root = 'G#';
    if (root === 'A#') root = 'Bb';

    const index = CHROMATIC_SCALE.indexOf(root);
    if (index === -1) return note;

    let newIndex = (index + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    return CHROMATIC_SCALE[newIndex];
  };

  const transposeChordName = (chordName: string, semitones: number): string => {
    if (semitones === 0) return chordName;

    if (chordName.includes('/')) {
      const parts = chordName.split('/');
      return parts.map((p) => transposeChordName(p, semitones)).join('/');
    }

    const match = chordName.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return chordName;

    const [, root, suffix] = match;
    const transposedRoot = transposeNote(root, semitones);
    return transposedRoot + suffix;
  };

  // Render content with section blocks, looping badges, rhythm follower highlights, and interactive inline transposed chords
  const renderFormattedLyrics = (content: string, isFS: boolean = false) => {
    if (!content) return null;

    if (songSections.length === 0) {
      const lines = content.split('\n');
      return lines.map((line, lineIdx) => {
        const lineId = `line-${lineIdx}`;
        const isActiveLine = isRhythmGuideActive && activeLineId === lineId;
        const parts = line.split(/(\[[^\]]+\])/g);

        return (
          <div
            key={lineIdx}
            data-line-id={lineId}
            onClick={() => {
              if (isRhythmGuideActive) setActiveLineId(lineId);
            }}
            className={`song-lyric-line my-1.5 p-2 rounded transition-all duration-200 cursor-pointer relative font-mono leading-relaxed ${
              isActiveLine
                ? 'bg-[#00220A]/80 border-l-4 border-[#00FF41] shadow-[0_0_20px_rgba(0,255,65,0.35)] animate-pulse-glow text-white font-bold'
                : 'hover:bg-[#111] text-[#D1D1D1] border-l-4 border-transparent'
            }`}
            style={{ fontSize: `${fontSize}px` }}
          >
            {isActiveLine && (
              <span className="inline-flex items-center gap-1 bg-[#00FF41] text-black font-black text-[9px] px-1.5 py-0.5 rounded-xs mr-2 uppercase tracking-wider animate-pulse shadow-sm">
                <Zap className="w-2.5 h-2.5 text-black" /> HRAJE SE
              </span>
            )}

            {parts.map((part, partIdx) => {
              if (part.startsWith('[') && part.endsWith(']')) {
                const originalChord = part.slice(1, -1);
                const transposedChord = transposeChordName(originalChord, effectiveTranspose);
                return (
                  <ChordHoverPill
                    key={partIdx}
                    chordName={transposedChord}
                    isActiveLine={isActiveLine}
                    fontSize={fontSize}
                    onSelectModalChord={setSelectedModalChord}
                  />
                );
              }
              return <span key={partIdx}>{part}</span>;
            })}
          </div>
        );
      });
    }

    return songSections.map((sec) => {
      const isSelected = selectedSectionId === sec.id;
      const isLoopingThis = isSelected && isLoopActive;
      const elementId = isFS ? `fs-section-${sec.id}` : `section-${sec.id}`;

      return (
        <div
          key={sec.id}
          id={elementId}
          className={`my-3 p-3 sm:p-4 transition-all duration-200 border relative rounded-sm ${
            isLoopingThis
              ? 'bg-[#00220A]/40 border-[#00FF41] shadow-[0_0_15px_rgba(0,255,65,0.25)]'
              : isSelected
              ? 'bg-[#141414] border-[#FF3E00]/60'
              : 'bg-[#0A0A0A]/60 border-[#1A1A1A] hover:border-[#333]'
          }`}
        >
          {/* Section Header Bar */}
          <div className="flex items-center justify-between border-b border-[#222] pb-1.5 mb-2 select-none">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] sm:text-xs font-black uppercase px-2 py-0.5 border ${
                  isLoopingThis
                    ? 'bg-[#00FF41] text-black border-black font-extrabold'
                    : sec.type === 'chorus'
                    ? 'bg-[#FF3E00] text-black border-black font-extrabold'
                    : 'bg-[#1A1A1A] text-white border-[#333]'
                }`}
              >
                {sec.title}
              </span>

              {isLoopingThis && (
                <span className="animate-pulse text-[9px] font-extrabold text-[#00FF41] bg-[#002B0E] px-2 py-0.5 border border-[#00FF41]/40 flex items-center gap-1">
                  <Repeat1 className="w-3 h-3 text-[#00FF41]" />
                  AKTIVNÍ PRAKTICKÁ SMYČKA
                </span>
              )}
            </div>

            <button
              onClick={() => handleToggleSectionLoop(sec.id)}
              className={`text-[10px] font-extrabold uppercase px-2 py-1 border transition-none flex items-center gap-1.5 ${
                isLoopingThis
                  ? 'bg-[#00FF41] hover:bg-white text-black border-black shadow-md'
                  : 'bg-[#141414] hover:bg-[#222] text-[#888] hover:text-[#00FF41] border-[#333]'
              }`}
              title="Nastavit tuto sekci pro plynulé opakovací cvičení"
            >
              <Repeat className={`w-3.5 h-3.5 ${isLoopingThis ? 'text-black animate-spin' : ''}`} />
              <span>{isLoopingThis ? 'ZRUŠIT LOOP' : 'LOOPOVAT SEKCI'}</span>
            </button>
          </div>

          {/* Section Lines */}
          {sec.lines.map((line, lineIdx) => {
            const lineId = `sec-${sec.id}-line-${lineIdx}`;
            const isActiveLine = isRhythmGuideActive && activeLineId === lineId;
            const parts = line.split(/(\[[^\]]+\])/g);

            return (
              <div
                key={lineIdx}
                data-line-id={lineId}
                onClick={() => {
                  if (isRhythmGuideActive) setActiveLineId(lineId);
                }}
                className={`song-lyric-line my-1.5 p-2 rounded transition-all duration-200 cursor-pointer relative font-mono leading-relaxed ${
                  isActiveLine
                    ? 'bg-[#00220A]/80 border-l-4 border-[#00FF41] shadow-[0_0_20px_rgba(0,255,65,0.35)] animate-pulse-glow text-white font-bold'
                    : 'hover:bg-[#111] text-[#D1D1D1] border-l-4 border-transparent'
                }`}
                style={{ fontSize: `${fontSize}px` }}
              >
                {isActiveLine && (
                  <span className="inline-flex items-center gap-1 bg-[#00FF41] text-black font-black text-[9px] px-1.5 py-0.5 rounded-xs mr-2 uppercase tracking-wider animate-pulse shadow-sm">
                    <Zap className="w-2.5 h-2.5 text-black" /> HRAJE SE
                  </span>
                )}

                {parts.map((part, partIdx) => {
                  if (part.startsWith('[') && part.endsWith(']')) {
                    const originalChord = part.slice(1, -1);
                    const transposedChord = transposeChordName(originalChord, effectiveTranspose);

                    return (
                      <ChordHoverPill
                        key={partIdx}
                        chordName={transposedChord}
                        isActiveLine={isActiveLine}
                        fontSize={fontSize}
                        onSelectModalChord={setSelectedModalChord}
                      />
                    );
                  }
                  return <span key={partIdx}>{part}</span>;
                })}
              </div>
            );
          })}
        </div>
      );
    });
  };

  const handleCreateSong = () => {
    const newSong: Song = {
      id: 'song_' + Date.now(),
      title: editTitle || 'Nová Píseň',
      artist: editArtist || 'Vlastní tvorba',
      key: editKey,
      bpm: editBpm,
      content: editContent,
      chordsUsed: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updatedSongs = [newSong, ...songs];
    setSongs(updatedSongs);
    setActiveSong(newSong);
    setIsEditing(false);

    if (session) {
      sessionSync.broadcastNewSong(newSong);
    }
  };

  const handleSongImported = (importedSong: Song) => {
    setSongs((prev) => [importedSong, ...prev]);
    setActiveSong(importedSong);
    setTransposeSemitones(0);
    if (session) {
      sessionSync.broadcastNewSong(importedSong);
    }
  };

  const handleDeleteAttachment = (attachmentId: string) => {
    if (!activeSong) return;
    const updatedAttachments = (activeSong.attachments || []).filter((a) => a.id !== attachmentId);
    const updatedSong: Song = {
      ...activeSong,
      attachments: updatedAttachments,
      updatedAt: Date.now(),
    };
    setActiveSong(updatedSong);
    setSongs((prev) => prev.map((s) => (s.id === updatedSong.id ? updatedSong : s)));
    if (session) {
      sessionSync.broadcastNewSong(updatedSong);
    }
  };

  const handleShareSongToBand = () => {
    if (session && activeSong) {
      sessionSync.setActiveSong(activeSong.id);
      sessionSync.broadcastSongs(songs);
      setSharedNotice(true);
      setTimeout(() => setSharedNotice(false), 2500);
    }
  };

  const filteredSongs = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const chordDef = hoveredChord
    ? CHORDS_DATABASE.find((c) => c.name === hoveredChord || c.root === hoveredChord)
    : null;

  return (
    <div className="max-w-[1400px] mx-auto space-y-3 font-mono pb-12">
      {/* Cloud Session Live Status Banner */}
      {session && (
        <div className="bg-[#001D07] border border-[#00FF41] px-4 py-2 text-xs text-[#00FF41] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-[0_0_15px_rgba(0,255,65,0.15)]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#00FF41] rounded-full animate-pulse shrink-0"></span>
            <span className="font-extrabold uppercase tracking-wide">
              ☁️ CLOUD ZKUŠEBNY PROPOJENA: <span className="text-white font-mono bg-black/60 px-2 py-0.5 border border-[#00FF41]/40">{session.roomId}</span>
            </span>
            <span className="hidden md:inline text-[11px] text-[#A0FFA0]">
              // Všechny přidané písničky se automaticky ukládají do cloudu a vidí je všichni v reálném čase.
            </span>
          </div>
          <span className="text-[10px] bg-[#00FF41] text-black font-black uppercase px-2 py-0.5">
            PŘIPOJENO ČLENŮ: {session.members.length}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      
      {/* Sidebar: Song List & Search */}
      <div className={`lg:col-span-4 bg-[#0F0F0F] border border-[#333] p-4 flex flex-col ${isExpandedHeight ? 'h-[850px]' : 'h-[650px]'}`}>
        
        {/* Search & Actions Header */}
        <div className="space-y-3 mb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#888] uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#FF3E00]" />
              KNIHOVNA SKLADEB ({songs.length})
            </h2>
            <button
              onClick={() => {
                setEditTitle('');
                setEditArtist('');
                setEditContent('[G]Text s akordy [C]zde...');
                setIsEditing(true);
              }}
              className="px-2.5 py-1 bg-[#D1D1D1] hover:bg-white text-black font-extrabold text-[11px] uppercase flex items-center gap-1 border border-white"
            >
              <Plus className="w-3.5 h-3.5" /> NOVÁ SKLADBA
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#666] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="VYHLEDAT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#050505] border border-[#222] text-[#D1D1D1] pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#FF3E00] uppercase"
            />
          </div>

          {/* Action Buttons: File Import, Photo OCR & Online Search */}
          <button
            onClick={() => setIsFileImportOpen(true)}
            className="w-full py-2 px-2 bg-[#1A1800] hover:bg-[#2B2800] border border-[#FFD700] hover:border-white text-[#FFD700] text-[11px] font-black flex items-center justify-center gap-1.5 uppercase transition-none shadow-[0_0_12px_rgba(255,215,0,0.15)]"
          >
            <FileUp className="w-4 h-4 text-[#FFD700]" />
            <span>IMPORT SOUBORŮ (TXT, PDF, MIDI, GUITAR PRO)</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <button
              onClick={() => setIsOnlineSearchOpen(true)}
              className="py-1.5 px-2 bg-[#141414] hover:bg-[#1A1A1A] border border-[#333] hover:border-[#00FF41] text-[#00FF41] text-[11px] font-bold flex items-center justify-center gap-1.5 uppercase transition-none"
            >
              <Globe className="w-3.5 h-3.5 text-[#00FF41]" />
              <span>HLEDAT ONLINE</span>
            </button>

            <button
              onClick={onOpenCameraModal}
              className="py-1.5 px-2 bg-[#141414] hover:bg-[#1A1A1A] border border-[#333] hover:border-[#FF3E00] text-[#FF3E00] text-[11px] font-bold flex items-center justify-center gap-1.5 uppercase transition-none"
            >
              <Camera className="w-3.5 h-3.5 text-[#FF3E00]" />
              <span>SKEN_ZPĚVNÍK (AI)</span>
            </button>
          </div>
        </div>

        {/* Songs List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filteredSongs.map((song) => {
            const isActive = activeSong.id === song.id;
            return (
              <button
                key={song.id}
                onClick={() => {
                  setActiveSong(song);
                  setTransposeSemitones(0);
                  if (session) {
                    sessionSync.setActiveSong(song.id);
                  }
                }}
                className={`w-full text-left p-2.5 border transition-none ${
                  isActive
                    ? 'bg-[#141414] border-[#FF3E00] border-l-4 text-white'
                    : 'bg-[#050505] hover:bg-[#111] border-[#222] text-[#888]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase truncate text-white">{song.title}</h3>
                  <span className="text-[10px] font-bold bg-[#222] text-[#00FF41] px-1.5 py-0.5 border border-[#333]">
                    {song.key}
                  </span>
                </div>
                <p className="text-[10px] text-[#666] mt-1 uppercase">{song.artist}</p>
              </button>
            );
          })}
        </div>

      </div>

      {/* Main View: Song Viewer / Transposer / Auto-Scroll */}
      <div className={`lg:col-span-8 bg-[#0F0F0F] border border-[#333] p-4 flex flex-col relative ${isExpandedHeight ? 'h-[850px]' : 'h-[650px]'}`}>
        
        {/* Song Control Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#222]">
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              {activeSong.title}
              <span className="text-[10px] font-bold text-[#00FF41] bg-[#002B0E] px-2 py-0.5 border border-[#00FF41]/40">
                TÓNINA: {transposeChordName(activeSong.key, transposeSemitones)}
              </span>
            </h2>
            <p className="text-[11px] text-[#666] uppercase">{activeSong.artist}</p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            
            {/* Font Size Zoom Controller */}
            <div className="flex items-center bg-[#050505] border border-[#222] p-1 gap-1" title="Nastavení velikosti písma a akordů">
              <Type className="w-3.5 h-3.5 text-[#FF3E00] ml-1" />
              <button
                onClick={() => setFontSize((prev) => Math.max(12, prev - 2))}
                className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#222] text-white text-xs font-bold border border-[#333]"
                title="Zmenšit písmo (A-)"
              >
                -
              </button>
              <span className="text-xs font-bold px-1.5 text-[#00FF41]">{fontSize}px</span>
              <button
                onClick={() => setFontSize((prev) => Math.min(36, prev + 2))}
                className="px-1.5 py-0.5 bg-[#141414] hover:bg-[#222] text-white text-xs font-bold border border-[#333]"
                title="Zvětšit písmo (A+)"
              >
                +
              </button>
            </div>

            {/* Stage Mode Fullscreen Button */}
            <button
              onClick={() => setIsFullscreen(true)}
              className="px-2.5 py-1 bg-[#FF3E00] hover:bg-white text-black font-extrabold text-[10px] uppercase flex items-center gap-1 border border-black shadow-sm"
              title="Otevřít na celou obrazovku v režimu pódiového čtení (Stage Mode)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>PLNOU OBRAZOVKU</span>
            </button>

            {/* YouTube Section Shortcut Button */}
            <button
              onClick={() => onSelectSongForYoutube && onSelectSongForYoutube(activeSong)}
              className="px-2.5 py-1 bg-[#FF0000] hover:bg-white text-white hover:text-black font-extrabold text-[10px] uppercase flex items-center gap-1 border border-black shadow-sm"
              title="Zobrazit oficiální videoklip a backing tracky z YouTube pro tuto písničku"
            >
              <Youtube className="w-3.5 h-3.5" />
              <span>YOUTUBE ({activeSong.youtubeVideos?.length || 0})</span>
            </button>

            {/* Transposer Controls */}
            <div className="flex items-center bg-[#050505] border border-[#222] p-1 gap-1">
              <span className="text-[10px] uppercase font-bold text-[#666] px-1 flex items-center gap-1">
                <Music className="w-3 h-3 text-[#FF3E00]" />
                TRANSPOZICE:
              </span>

              <button
                onClick={() => setTransposeSemitones((prev) => prev - 1)}
                className="px-2 py-0.5 bg-[#141414] hover:bg-[#222] text-white text-xs font-black border border-[#333] transition-none flex items-center gap-0.5"
                title="Snížit o 1 polotón (-1)"
              >
                <ChevronDown className="w-3 h-3 text-[#FF3E00]" />
                <span>-1</span>
              </button>

              <span className={`text-xs font-black px-2 py-0.5 border text-center ${
                transposeSemitones !== 0 
                  ? 'bg-[#FF3E00]/20 text-[#FF3E00] border-[#FF3E00]' 
                  : 'text-[#888] border-[#333] bg-[#111]'
              }`}>
                {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones}
              </span>

              <button
                onClick={() => setTransposeSemitones((prev) => prev + 1)}
                className="px-2 py-0.5 bg-[#141414] hover:bg-[#222] text-white text-xs font-black border border-[#333] transition-none flex items-center gap-0.5"
                title="Zvýšit o 1 polotón (+1)"
              >
                <ChevronUp className="w-3 h-3 text-[#00FF41]" />
                <span>+1</span>
              </button>

              {transposeSemitones !== 0 && (
                <button
                  onClick={() => setTransposeSemitones(0)}
                  className="px-2 py-0.5 bg-[#FF3E00] hover:bg-white text-black font-extrabold text-[10px] uppercase transition-none ml-1"
                  title="Obnovit původní tóninu"
                >
                  RESET (0)
                </button>
              )}
            </div>

            {/* Auto-Scroll Toggle */}
            <div className="flex items-center bg-[#050505] border border-[#222] px-2 py-1 gap-2">
              <button
                onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                className={`px-2 py-1 text-[10px] font-bold uppercase flex items-center gap-1 transition-none ${
                  isAutoScrolling
                    ? 'bg-[#FF3E00] text-black'
                    : 'bg-[#222] text-[#D1D1D1] hover:bg-[#333]'
                }`}
              >
                {isAutoScrolling ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isAutoScrolling ? 'PAUZA' : 'POSUN'}</span>
              </button>

              <input
                type="range"
                min="1"
                max="8"
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(Number(e.target.value))}
                className="w-14 accent-[#FF3E00] cursor-pointer"
              />
            </div>

            {/* Height Toggle */}
            <button
              onClick={() => setIsExpandedHeight(!isExpandedHeight)}
              className="p-1.5 bg-[#141414] hover:bg-[#222] border border-[#333] text-[#888] hover:text-white"
              title={isExpandedHeight ? "Zmenšit výšku panelu" : "Zvětšit výšku panelu"}
            >
              {isExpandedHeight ? <ChevronUp className="w-4 h-4 text-[#00FF41]" /> : <ChevronDown className="w-4 h-4 text-[#FF3E00]" />}
            </button>

            {/* Share to Band Room */}
            <button
              onClick={handleShareSongToBand}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase flex items-center gap-1 border transition-none ${
                sharedNotice
                  ? 'bg-[#002B0E] border-[#00FF41] text-[#00FF41]'
                  : 'bg-[#141414] hover:bg-[#222] border-[#333] text-white'
              }`}
            >
              {sharedNotice ? <Check className="w-3.5 h-3.5 text-[#00FF41]" /> : <Share2 className="w-3.5 h-3.5 text-[#FF3E00]" />}
              <span>{sharedNotice ? 'VYSÍLÁNO' : 'VYSÍLAT'}</span>
            </button>

          </div>
        </div>

        {/* Transpose Presets & Capo Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 my-2 py-1.5 px-2 bg-[#050505] border border-[#222] text-[10px] font-mono">
          <div className="flex items-center gap-1 overflow-x-auto">
            <span className="text-[#666] uppercase font-bold shrink-0">RYCHLÁ TRANSPOZICE:</span>
            {[-5, -2, -1, 0, 1, 2, 5].map((step) => {
              const isActive = transposeSemitones === step;
              return (
                <button
                  key={step}
                  onClick={() => setTransposeSemitones(step)}
                  className={`px-2 py-0.5 border font-bold uppercase whitespace-nowrap transition-none ${
                    isActive
                      ? 'bg-[#FF3E00] text-black border-black'
                      : 'bg-[#141414] text-[#AAA] border-[#222] hover:text-white hover:border-[#444]'
                  }`}
                >
                  {step === 0 ? 'PŮVODNÍ (0)' : step > 0 ? `+${step}` : step}
                </button>
              );
            })}
          </div>

          {/* Guitarist Capo Selector */}
          <div className="flex items-center gap-2 shrink-0 bg-[#0F0F0F] border border-[#333] px-2 py-1 rounded-xs">
            <span className="text-[#FFD700] uppercase font-black flex items-center gap-1 text-[10px]">
              🎸 KAPODASTR (CAPO):
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCapoFret((prev) => Math.max(0, prev - 1))}
                disabled={capoFret === 0}
                className="w-5 h-5 bg-[#1C1C1C] hover:bg-[#333] disabled:opacity-30 text-white font-black text-xs flex items-center justify-center border border-[#444]"
                title="Snížit kapodastr o 1 pražec"
              >
                -
              </button>
              <span className="font-extrabold text-[#00FF41] px-1 min-w-[55px] text-center text-[10px]">
                {capoFret === 0 ? 'BEZ KAPO' : `${capoFret}. PRAŽEC`}
              </span>
              <button
                onClick={() => setCapoFret((prev) => Math.min(12, prev + 1))}
                disabled={capoFret === 12}
                className="w-5 h-5 bg-[#1C1C1C] hover:bg-[#333] disabled:opacity-30 text-white font-black text-xs flex items-center justify-center border border-[#444]"
                title="Zvýšit kapodastr o 1 pražec"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[#888] uppercase">
              PŮVODNÍ TÓNINA: <strong className="text-white">{activeSong.key}</strong>
            </span>
            {capoFret > 0 && (
              <span className="text-[#00FF41] bg-[#002B0E] px-2 py-0.5 border border-[#00FF41]/40 font-bold uppercase">
                TVARY S KAPO: {transposeChordName(activeSong.key, effectiveTranspose)}
              </span>
            )}
          </div>
        </div>

        {/* Capo Notice Banner if active */}
        {capoFret > 0 && (
          <div className="bg-[#1A1600] border border-[#FFD700] px-3 py-1.5 my-1 text-[11px] font-mono text-[#FFD700] flex items-center justify-between font-bold shadow-sm">
            <span className="flex items-center gap-1.5">
              🎸 NASAĎTE KAPODASTR NA {capoFret}. PRAŽEC KYTARY!
            </span>
            <span className="text-white text-[10px]">
              Zní tónina: <strong className="text-[#00FF41]">{transposeChordName(activeSong.key, transposeSemitones)}</strong> | Akordové tvary k hraní: <strong className="text-[#FFD700]">{transposeChordName(activeSong.key, effectiveTranspose)}</strong>
            </span>
          </div>
        )}

        {/* Practice Loop & Section Selection Toolbar */}
        <div className="bg-[#080808] border border-[#222] p-2.5 my-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1C1C1C] pb-2">
            <div className="flex items-center gap-1.5">
              <Repeat1 className={`w-4 h-4 ${isLoopActive ? 'text-[#00FF41] animate-spin' : 'text-[#FF3E00]'}`} />
              <span className="text-xs font-black uppercase tracking-wider text-white">
                CVIČEBNÍ OPIS (SECTION LOOP)
              </span>
              {isLoopActive && activeSection && (
                <span className="text-[10px] font-extrabold bg-[#00FF41] text-black px-2 py-0.5 uppercase border border-black shadow-sm">
                  SMYČKA: {activeSection.title}
                </span>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {/* Metronome Toggle */}
              <button
                onClick={() => setIsMetronomeActive((prev) => !prev)}
                className={`px-2 py-1 text-[10px] font-extrabold uppercase border flex items-center gap-1 transition-none ${
                  isMetronomeActive
                    ? 'bg-[#00FF41] text-black border-black font-extrabold'
                    : 'bg-[#141414] hover:bg-[#222] text-[#AAA] border-[#333]'
                }`}
                title="Zapnout/vypnout cvičný metronom"
              >
                <Zap className="w-3 h-3" />
                <span>METRONOM ({metronomeBpm} BPM)</span>
              </button>

              {/* Tempo / Speed selector */}
              <div className="flex items-center bg-[#050505] border border-[#222] p-0.5">
                <span className="text-[9px] uppercase font-bold text-[#666] px-1">TEMPO:</span>
                {[0.5, 0.75, 1, 1.25, 1.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setScrollSpeed(spd * 3)}
                    className={`px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                      scrollSpeed === spd * 3
                        ? 'bg-[#FF3E00] text-black'
                        : 'text-[#888] hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Section Selector Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin scrollbar-thumb-[#333]">
            <span className="text-[10px] font-bold uppercase text-[#666] shrink-0">VYBRAT SEKCI PRO LOOP:</span>
            <button
              onClick={() => {
                setIsLoopActive(false);
                setSelectedSectionId(null);
              }}
              className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase border whitespace-nowrap transition-none ${
                !isLoopActive
                  ? 'bg-[#FF3E00] text-black border-black'
                  : 'bg-[#141414] text-[#AAA] border-[#222] hover:text-white'
              }`}
            >
              CELÁ SKLADBA
            </button>

            {songSections.map((sec) => {
              const isSecLooping = selectedSectionId === sec.id && isLoopActive;
              return (
                <button
                  key={sec.id}
                  onClick={() => handleToggleSectionLoop(sec.id)}
                  className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase border whitespace-nowrap transition-none flex items-center gap-1 ${
                    isSecLooping
                      ? 'bg-[#00FF41] text-black border-black shadow-sm font-black'
                      : selectedSectionId === sec.id
                      ? 'bg-[#222] text-[#00FF41] border-[#00FF41]'
                      : 'bg-[#141414] text-[#888] border-[#222] hover:text-white hover:border-[#444]'
                  }`}
                >
                  {isSecLooping && <Repeat className="w-3 h-3 animate-spin text-black" />}
                  <span>{sec.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Song Lyrics & Chords Canvas */}
        {/* Rhythm Follower & Animated Highlighting Toolbar */}
        <div className="bg-[#0A1A0F] border border-[#00FF41]/40 p-2 my-1 rounded-xs flex flex-wrap items-center justify-between gap-2 text-xs font-mono select-none">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRhythmGuideActive(!isRhythmGuideActive)}
              className={`px-2.5 py-1 text-[10px] font-black uppercase flex items-center gap-1.5 border shadow-sm transition-none ${
                isRhythmGuideActive
                  ? 'bg-[#00FF41] text-black border-black animate-pulse'
                  : 'bg-[#141414] text-[#AAA] border-[#333] hover:text-white'
              }`}
              title="Zapnout/vypnout animované zvýrazňování aktuálního akordu a řádku"
            >
              <Zap className="w-3.5 h-3.5 text-black" />
              <span>{isRhythmGuideActive ? 'VODIČ RYTMA: ZAPNUT' : 'VODIČ RYTMA: VYPNUT'}</span>
            </button>

            <div className="flex items-center gap-1 bg-[#050505] border border-[#222] p-0.5">
              <button
                onClick={() => handleStepLine('prev')}
                className="px-2 py-0.5 bg-[#141414] hover:bg-[#222] text-[#00FF41] font-extrabold text-[10px] border border-[#333] flex items-center gap-1"
                title="Posunout na předchozí řádek (Šipka Nahoru)"
              >
                <ChevronUp className="w-3 h-3" />
                <span>PŘEDCHOZÍ ŘÁDEK</span>
              </button>
              <button
                onClick={() => handleStepLine('next')}
                className="px-2 py-0.5 bg-[#141414] hover:bg-[#222] text-[#00FF41] font-extrabold text-[10px] border border-[#333] flex items-center gap-1"
                title="Posunout na další řádek (Šipka Dolů)"
              >
                <span>DALŠÍ ŘÁDEK</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBeatStepperActive(!isBeatStepperActive)}
              className={`px-2 py-1 text-[10px] font-extrabold uppercase border flex items-center gap-1 transition-none ${
                isBeatStepperActive
                  ? 'bg-[#FF3E00] text-black border-black font-black'
                  : 'bg-[#141414] hover:bg-[#222] text-[#888] border-[#333]'
              }`}
              title="Automaticky posouvat řádek na každé 4 doby metronomu"
            >
              <Repeat className={`w-3 h-3 ${isBeatStepperActive ? 'animate-spin' : ''}`} />
              <span>{isBeatStepperActive ? 'AUTOPOSUN BEATU: AKTIVNÍ' : 'AUTOPOSUN METRONOMU'}</span>
            </button>

            <span className="text-[9px] text-[#00FF41] hidden xl:inline-block font-mono">
              💡 ŠIPKY / KLIKNUTÍ PRO POSUN
            </span>
          </div>
        </div>

        {/* Enlarged Lyrics Canvas */}
        <div
          ref={scrollRef}
          onScroll={handleViewerScroll}
          className="flex-1 overflow-y-auto my-1 p-4 bg-[#050505] border border-[#222] relative min-h-[500px]"
        >
          {renderFormattedLyrics(activeSong.content, false)}

          {/* Attachments Section (PDF, MIDI, Guitar Pro, TXT) */}
          <AttachmentViewer
            attachments={activeSong.attachments || []}
            onDeleteAttachment={handleDeleteAttachment}
            onOpenImportModal={() => setIsFileImportOpen(true)}
            isSessionActive={!!session}
          />
        </div>

        {/* Bottom Minimized Used Chords Bar with Hover Diagrams & Variation Helper */}
        {songChords.length > 0 && (
          <div className="bg-[#0A0A0A] border-t-2 border-[#222] p-2 my-1 shrink-0 flex flex-wrap items-center justify-between gap-2 z-20 font-mono">
            <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin scrollbar-thumb-[#333]">
              <span className="text-[10px] font-black uppercase text-[#FF3E00] flex items-center gap-1 shrink-0">
                <Music className="w-3.5 h-3.5 text-[#FF3E00]" />
                POUŽITÉ AKORDY ({songChords.length}):
              </span>

              <div className="flex items-center gap-1.5 flex-wrap">
                {songChords.map((chordName) => (
                  <ChordHoverPill
                    key={chordName}
                    chordName={chordName}
                    fontSize={13}
                    onSelectModalChord={setSelectedModalChord}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                if (songChords[0]) setSelectedModalChord(songChords[0]);
              }}
              className="text-[10px] font-bold text-[#FFD700] hover:text-white uppercase underline shrink-0 flex items-center gap-1"
            >
              <Zap className="w-3 h-3 text-[#FFD700]" /> VARIACE &amp; BARRE HMATY 🎸
            </button>
          </div>
        )}

        {/* Hovered Chord Mini SVG Fretboard Popup */}
        {hoveredChordDef && !isFullscreen && (
          <div className="fixed bottom-6 right-6 bg-[#0F0F0F] border-2 border-[#FF3E00] p-3 shadow-2xl z-50 font-mono animate-in fade-in zoom-in-95 duration-150 rounded-sm pointer-events-auto">
            <div className="flex items-center justify-between gap-3 mb-2 border-b border-[#222] pb-1">
              <span className="text-[10px] font-black uppercase text-[#FF3E00] flex items-center gap-1">
                <Music className="w-3.5 h-3.5" /> AKORD {hoveredChordDef.name}
              </span>
              <span className="text-[9px] text-[#00FF41] font-bold uppercase">
                {hoveredChordDef.type}
              </span>
            </div>
            
            <GuitarChordDiagram
              chord={hoveredChordDef}
              size="md"
              showTitle={false}
              showPlayButton={true}
              onClick={() => setSelectedModalChord(hoveredChordDef.name)}
              className="shadow-lg border-[#333]"
            />
            <p className="text-[8px] text-[#888] text-center mt-1.5 uppercase font-bold">
              KLIKNĚTE PRO AUDIO &amp; DETAIL
            </p>
          </div>
        )}

      </div>

      {/* FULLSCREEN STAGE VIEW MODAL (PLNOOBRAZOVKOVÝ REŽIM) */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-[#050505] text-[#D1D1D1] flex flex-col font-mono p-3 sm:p-6 overflow-hidden select-none">
          
          {/* Stage Mode Top Navigation Bar */}
          {!isStageCleanMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0F0F0F] border-2 border-[#333] p-3 mb-2 shadow-xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-[#FF3E00] text-black font-extrabold text-[10px] px-2 py-0.5 uppercase tracking-wider">
                    STAGE MODE
                  </span>
                  <h1 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
                    {activeSong.title}
                  </h1>
                </div>
                <p className="text-xs text-[#888] uppercase mt-0.5">
                  INTERPRET: <strong className="text-white">{activeSong.artist}</strong> | TÓNINA: <strong className="text-[#00FF41]">{transposeChordName(activeSong.key, transposeSemitones)}</strong>
                </p>
              </div>

              {/* Controls Grid */}
              <div className="flex items-center flex-wrap gap-2">
                
                {/* Font Size Buttons */}
                <div className="flex items-center bg-[#050505] border border-[#333] p-1 gap-1">
                  <Type className="w-4 h-4 text-[#FF3E00] ml-1" />
                  <button
                    onClick={() => setFontSize((prev) => Math.max(12, prev - 2))}
                    className="px-2 py-1 bg-[#222] hover:bg-[#333] text-white text-xs font-black border border-[#444]"
                    title="Zmenšit písmo (A-)"
                  >
                    A-
                  </button>
                  <span className="text-xs font-extrabold text-[#00FF41] px-2">{fontSize}px</span>
                  <button
                    onClick={() => setFontSize((prev) => Math.min(36, prev + 2))}
                    className="px-2 py-1 bg-[#222] hover:bg-[#333] text-white text-xs font-black border border-[#444]"
                    title="Zvětšit písmo (A+)"
                  >
                    A+
                  </button>
                </div>

                {/* Transposition */}
                <div className="flex items-center bg-[#050505] border border-[#333] p-1 gap-1">
                  <span className="text-[10px] uppercase font-bold text-[#666] px-1">TRANSPOZICE:</span>
                  <button
                    onClick={() => setTransposeSemitones((p) => p - 1)}
                    className="px-2 py-1 bg-[#141414] hover:bg-[#222] text-white text-xs font-black border border-[#333]"
                  >
                    -1
                  </button>
                  <span className="text-xs font-black text-[#FF3E00] px-1">
                    {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones}
                  </span>
                  <button
                    onClick={() => setTransposeSemitones((p) => p + 1)}
                    className="px-2 py-1 bg-[#141414] hover:bg-[#222] text-white text-xs font-black border border-[#333]"
                  >
                    +1
                  </button>
                  {transposeSemitones !== 0 && (
                    <button
                      onClick={() => setTransposeSemitones(0)}
                      className="px-1.5 py-1 bg-[#FF3E00] text-black text-[10px] font-bold uppercase"
                    >
                      RESET
                    </button>
                  )}
                </div>

                {/* Auto Scroll */}
                <button
                  onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                  className={`px-3 py-1.5 text-xs font-black uppercase flex items-center gap-1.5 border ${
                    isAutoScrolling
                      ? 'bg-[#FF3E00] text-black border-black'
                      : 'bg-[#222] text-white border-[#444] hover:bg-[#333]'
                  }`}
                >
                  {isAutoScrolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isAutoScrolling ? 'PAUZA' : 'POSUN'}</span>
                </button>

                {/* Clean Mode Toggle */}
                <button
                  onClick={() => setIsStageCleanMode(true)}
                  className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#222] border border-[#333] text-[#888] hover:text-white text-xs font-bold uppercase flex items-center gap-1"
                  title="Skrýt lišty pro maximální přehlednost na pódiu"
                >
                  <EyeOff className="w-4 h-4 text-[#FF3E00]" />
                  <span>ČISTÝ REŽIM</span>
                </button>

                {/* Exit Fullscreen */}
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="px-3 py-1.5 bg-[#FF3E00] hover:bg-white text-black font-black text-xs uppercase flex items-center gap-1 border border-black"
                >
                  <Minimize2 className="w-4 h-4" />
                  <span>ZAVŘÍT</span>
                </button>

              </div>
            </div>
          )}

          {/* Floating Exit Button when in Clean Mode */}
          {isStageCleanMode && (
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
              <button
                onClick={() => setIsStageCleanMode(false)}
                className="px-3 py-1.5 bg-[#141414]/90 hover:bg-[#222] text-white text-xs font-bold uppercase border border-[#444] flex items-center gap-1 backdrop-blur-md"
              >
                <Eye className="w-4 h-4 text-[#00FF41]" />
                <span>ZOBRAZIT NÁSTROJE</span>
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="px-3 py-1.5 bg-[#FF3E00] text-black text-xs font-black uppercase border border-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Fullscreen Lyrics Scroll Canvas */}
          <div
            ref={fullscreenScrollRef}
            onScroll={handleViewerScroll}
            className="flex-1 overflow-y-auto bg-[#0A0A0A] border-2 border-[#222] p-4 sm:p-8 rounded-sm my-1 max-w-6xl mx-auto w-full shadow-2xl relative"
          >
            {renderFormattedLyrics(activeSong.content, true)}
          </div>

          {/* Fullscreen Guitar Chords Strip */}
          {songChords.length > 0 && !isStageCleanMode && (
            <div className="bg-[#0F0F0F] border border-[#333] p-2 mt-2 flex items-center gap-3 overflow-x-auto max-w-6xl mx-auto w-full font-mono">
              <span className="text-[10px] font-black uppercase text-[#FF3E00] shrink-0">AKORDY:</span>
              <div className="flex items-center gap-2 overflow-x-auto">
                {songChords.map((chordName) => (
                  <ChordHoverPill
                    key={chordName}
                    chordName={chordName}
                    fontSize={14}
                    onSelectModalChord={setSelectedModalChord}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* New Song Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 font-mono">
          <div className="bg-[#0F0F0F] border-2 border-[#333] text-[#D1D1D1] max-w-2xl w-full p-5">
            <h3 className="text-sm font-bold text-white uppercase mb-4 flex items-center gap-2 border-b border-[#222] pb-2">
              <Music className="w-4 h-4 text-[#FF3E00]" /> VLOŽIT / UPRAVIT SKLADBU
            </h3>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-[#666] mb-1 uppercase">NÁZEV SKLADBY</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="NAPŘ. STÁNKY"
                    className="w-full bg-[#050505] border border-[#222] p-2 text-white focus:border-[#FF3E00] uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#666] mb-1 uppercase">INTERPRET</label>
                  <input
                    type="text"
                    value={editArtist}
                    onChange={(e) => setEditArtist(e.target.value)}
                    placeholder="NEDVĚDI"
                    className="w-full bg-[#050505] border border-[#222] p-2 text-white focus:border-[#FF3E00] uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#666] mb-1 uppercase">
                  TEXT S AKORDY V BRACKETS (NAPŘ. [G]KDYŽ SE U [C]NÁS)
                </label>
                <textarea
                  rows={8}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-[#050505] border border-[#222] p-2 text-xs font-mono text-white focus:border-[#FF3E00]"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-1.5 bg-[#222] hover:bg-[#333] text-white text-xs font-bold uppercase"
                >
                  ZRUŠIT
                </button>
                <button
                  onClick={handleCreateSong}
                  className="px-4 py-1.5 bg-[#FF3E00] hover:bg-white text-black text-xs font-bold uppercase"
                >
                  ULOŽIT SKLADBU
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Online Search Modal */}
      <OnlineSearchModal
        isOpen={isOnlineSearchOpen}
        onClose={() => setIsOnlineSearchOpen(false)}
        onSongImported={(newSong) => {
          const updated = [newSong, ...songs];
          setSongs(updated);
          setActiveSong(newSong);
          if (session) {
            sessionSync.broadcastNewSong(newSong);
          }
        }}
      />

      {/* File Import Modal (.txt, .pdf, .mid, .gp) */}
      <FileImportModal
        isOpen={isFileImportOpen}
        onClose={() => setIsFileImportOpen(false)}
        onSongImported={handleSongImported}
        isSessionActive={!!session}
      />

      {/* Interactive Chord Detail & Audio Popup Modal */}
      <ChordDetailModal
        chordName={selectedModalChord}
        onClose={() => setSelectedModalChord(null)}
      />

    </div>
  );
};
