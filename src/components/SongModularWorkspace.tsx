import React, { useState, useEffect, useRef } from 'react';
import { Song, SongAttachment, SongLink } from '../types';
import {
  Type, Play, Pause, Youtube, Music, FileText, Image as ImageIcon,
  Link as LinkIcon, Move, X, Plus, ChevronUp, ChevronDown, Repeat,
  Repeat1, Zap, Volume2, ZoomIn, ZoomOut, RotateCw, RotateCcw, ExternalLink,
  Sliders, Maximize2, Minimize2, Check, Save, Edit3, Trash2, Eye, EyeOff, LayoutGrid,
  Radio, Compass, Mic, Piano, Grab, Settings2, SlidersHorizontal, Layers, Sparkles
} from 'lucide-react';
import { ChordHoverPill } from './ChordHoverPill';
import { AkordyPanel } from './songbook/AkordyPanel';
import { parseSongSections } from '../utils/songSectionUtils';
import { extractUniqueChords, findOrGenerateChord } from '../utils/chordUtils';
import { audioSynth } from '../services/audioSynth';
import { ModularTunerSection, ModularFretboardSection, ModularPianoSection } from './ModularWorkspaceExtras';
import { ModularStemsMixer } from './ModularStemsMixer';
import { songDatabaseService } from '../services/songDatabaseService';
import { useMusicalContext } from '../context/MusicalContext';

export type ModuleType =
  | 'text_chords'
  | 'youtube'
  | 'chord_diagrams'
  | 'stems_mixer'
  | 'tuner'
  | 'fretboard'
  | 'keyboard'
  | 'tabs'
  | 'midi'
  | 'notes'
  | 'images'
  | 'links';

export interface ModuleConfig {
  id: ModuleType;
  title: string;
  icon: string;
  description?: string;
  visible: boolean;
  width: '1/3' | '1/2' | '2/3' | 'full'; // grid width
  height: 'sm' | 'md' | 'lg' | 'auto';
  customHeight?: number;
  customColSpan?: number;
  isFloating?: boolean;
  floatPos?: { x: number; y: number };
  floatSize?: { width: number; height: number };
  /** Pozice v mřížce. Chybí u sestav uložených dřív — dopočítá se z `width`. */
  grid?: { x: number; y: number; w: number; h: number };
  order: number;
}

import { PrazdnyModul } from './songbook/PrazdnyModul';
import { NavrhyPanel } from './songbook/NavrhyPanel';
import { TabulaturaModul } from './songbook/TabulaturaModul';
import { MidiModul } from './songbook/MidiModul';
import { PlovouciPlocha } from './songbook/PlovouciPlocha';
import { dataModulu } from './songbook/moduleRegistry';

export const DEFAULT_MODULES: ModuleConfig[] = [
  { id: 'text_chords', title: 'Text a Akordy', icon: '📝', description: 'Hlavní text písně s interaktivními akordy, transpozicí a autoscrollem', visible: true, width: '2/3', height: 'lg', order: 1 },
  { id: 'youtube', title: 'YouTube Video', icon: '🎥', description: 'Přehrávač videoklipů, lekcí, backing tracků a návodů', visible: true, width: '1/3', height: 'md', order: 2 },
  { id: 'stems_mixer', title: 'Steems Mixer', icon: '🎚️', description: 'Vícestopý mixážní pult se svislými fadery, Solo/Mute a měřením gainu propojený se Stem Studiem', visible: false, width: 'full', height: 'md', order: 3 },
  { id: 'chord_diagrams', title: 'Diagramy Akordů', icon: '🎸', description: 'Vizuální hmatníkové diagramy všech akordů použitých v písni', visible: true, width: '1/3', height: 'sm', order: 4 },
  { id: 'tuner', title: 'Ladička & Metronom', icon: '🎯', description: 'Přesná mikrofonní ladička, referenční tóny a integrovaný metronom', visible: false, width: '1/2', height: 'md', order: 5 },
  { id: 'fretboard', title: 'Kytarový Hmatník', icon: '🎸', description: 'Interaktivní kytarový krk s vyznačením tónů a akordových pozic', visible: false, width: 'full', height: 'sm', order: 6 },
  { id: 'keyboard', title: 'Klavír & Klávesy', icon: '🎹', description: 'Virtuální klaviatura s dynamickým zvýrazňováním tónů a intervalů hraných akordů v reálném čase', visible: false, width: 'full', height: 'md', order: 7 },
  { id: 'tabs', title: 'Tabs & Tabulatury', icon: '📑', description: 'Tabulatura a kytarové party v textovém formátu', visible: true, width: '1/2', height: 'md', order: 8 },
  { id: 'midi', title: 'MIDI Přehrávač', icon: '🎹', description: 'Přehrávání a vizualizace přiložených MIDI souborů a stop', visible: true, width: '1/2', height: 'md', order: 9 },
  { id: 'notes', title: 'Noty (Sheet Music)', icon: '🎼', description: 'Notové zápisy a PDF partitury s lupou', visible: true, width: '1/2', height: 'md', order: 10 },
  { id: 'images', title: 'Obrázky a Fotky', icon: '🖼️', description: 'Fotky schémat, ručně psaných poznámek a obalů', visible: true, width: '1/2', height: 'md', order: 11 },
  { id: 'links', title: 'Odkazy a Zdroje', icon: '🔗', description: 'Užitečné webové odkazy, tabulky a související materiály', visible: true, width: '1/2', height: 'sm', order: 12 },
];

interface SongModularWorkspaceProps {
  song: Song;
  onUpdateSong: (updatedSong: Song) => void;
  isStageMode?: boolean;
  transposeSemitones: number;
  setTransposeSemitones: React.Dispatch<React.SetStateAction<number>>;
  capoFret: number;
  setCapoFret: (fret: number) => void;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  onOpenImportModal?: () => void;
  onSelectModalChord?: (chordName: string) => void;
}

export const SongModularWorkspace: React.FC<SongModularWorkspaceProps> = ({
  song,
  onUpdateSong,
  isStageMode = false,
  transposeSemitones,
  setTransposeSemitones,
  capoFret,
  setCapoFret,
  fontSize,
  setFontSize,
  onOpenImportModal,
  onSelectModalChord,
}) => {
  const musicalCtx = useMusicalContext();

  /**
   * Uložená sestava modulů, nebo `null`, když píseň žádnou nemá.
   *
   * `null` je tady důležitá informace, ne chyba: podle ní se pozná píseň
   * otevřená poprvé, které se má nabídnout výběr modulů místo plochy
   * poskládané naslepo. Dřív se v obou případech vrátily výchozí moduly a
   * ty dva stavy od sebe nešly rozeznat.
   */
  const nactiSestavu = (s: Song): ModuleConfig[] | null => {
    const doplnChybejici = (ulozene: ModuleConfig[]): ModuleConfig[] => {
      const spojene = [...ulozene];
      // Modul přidaný do appky až po uložení sestavy musí přibýt skrytý —
      // jinak by se u starých písní nikdy neobjevil.
      DEFAULT_MODULES.forEach((def) => {
        if (!spojene.some((m) => m.id === def.id)) {
          spojene.push({ ...def, visible: false, order: spojene.length + 1 });
        }
      });
      return spojene;
    };

    if (Array.isArray(s.moduleConfigs) && s.moduleConfigs.length > 0) {
      return doplnChybejici(s.moduleConfigs);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const ulozene = JSON.parse(localStorage.getItem(`song_modules_cfg_${s.id}`) || 'null');
        if (Array.isArray(ulozene) && ulozene.length > 0) return doplnChybejici(ulozene);
      } catch {
        /* poškozený záznam se chová jako žádný */
      }
    }
    return null;
  };

  const [modules, setModules] = useState<ModuleConfig[]>(() => nactiSestavu(song) || DEFAULT_MODULES);

  // Modal for module selection
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3200);
  };

  // Save layout config
  const saveModulesConfig = (newModules: ModuleConfig[]) => {
    setModules(newModules);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`song_modules_cfg_${song.id}`, JSON.stringify(newModules));
    }
  };

  // Explicit Save button action: Saves layout, module states and song parameters permanently
  const handleSaveLayoutAndSong = () => {
    const updatedSong: Song = {
      ...song,
      moduleConfigs: modules,
      content: editedContent || song.content,
      tuning: musicalCtx?.tuning || song.tuning,
      key: musicalCtx?.key || song.key,
      bpm: musicalCtx?.bpm || song.bpm,
      capo: capoFret,
      updatedAt: Date.now(),
    };
    songDatabaseService.saveSong(updatedSong);
    onUpdateSong(updatedSong);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`song_modules_cfg_${song.id}`, JSON.stringify(modules));
    }
    showToast('✅ Nastavení, moduly a rozložení skladby byly úspěšně uloženy!');
  };

  // Restore button action: Restores original default layout and modules
  const handleRestoreDefaultLayout = () => {
    setModules(DEFAULT_MODULES);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`song_modules_cfg_${song.id}`);
    }
    setTransposeSemitones(0);
    if (musicalCtx?.setTransposeSemitones) {
      musicalCtx.setTransposeSemitones(0);
    }
    const updatedSong: Song = {
      ...song,
      moduleConfigs: DEFAULT_MODULES,
    };
    songDatabaseService.saveSong(updatedSong);
    onUpdateSong(updatedSong);
    showToast('🔄 Rozložení modulů a nastavení bylo obnoveno do výchozího stavu.');
  };

  // Text / Chords states
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedContent, setEditedContent] = useState(song.content || '');
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(3);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [isLoopActive, setIsLoopActive] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // YouTube States
  const [ytInput, setYtInput] = useState('');
  const [selectedYtIndex, setSelectedYtIndex] = useState(0);

  // Links state
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkCategory, setNewLinkCategory] = useState<SongLink['category']>('other');

  // MIDI Player State

  // Noty / Images Zoom
  const [sheetZoom, setSheetZoom] = useState(100);

  // Drag reorder state
  const [draggedModuleId, setDraggedModuleId] = useState<ModuleType | null>(null);

  // Resizing state for all directions (both, horizontal width, vertical height)
  type ResizeDirection = 'both' | 'horizontal' | 'vertical';
  const [resizingModuleId, setResizingModuleId] = useState<ModuleType | null>(null);
  const [resizeDir, setResizeDir] = useState<ResizeDirection>('both');
  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    parentWidth: number;
    startColSpan: number;
    isFloating?: boolean;
  }>({
    startX: 0,
    startY: 0,
    startWidth: 400,
    startHeight: 400,
    parentWidth: 1200,
    startColSpan: 6,
  });

  // Floating drag state
  const [floatingDragId, setFloatingDragId] = useState<ModuleType | null>(null);
  const floatDragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({ startX: 0, startY: 0, initX: 0, initY: 0 });

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Autoscroll effect
  useEffect(() => {
    let interval: any = null;
    if (isAutoScrolling) {
      interval = setInterval(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop += scrollSpeed * 0.75;
        }
      }, 50);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoScrolling, scrollSpeed]);

  // Transposition offset
  const effectiveTranspose = transposeSemitones - capoFret;
  const songSections = parseSongSections(song.content || '');
  const songChords = extractUniqueChords(song.content || '', effectiveTranspose);

  // Content attachments categorization
  const youtubeVideos = song.youtubeVideos || [];
  const links = song.links || [];
  const attachments = song.attachments || [];

  // Přílohy si moduly nevybírají samy — rozhoduje registr, který je jediným
  // místem, kde je napsáno, co ke kterému modulu patří. Poznává je i podle
  // přípony, protože `type` bývá u hromadných importů „other".
  const tabAttachments = dataModulu(song, 'tabs').prilohy;
  const midiAttachments = dataModulu(song, 'midi').prilohy;
  const noteAttachments = dataModulu(song, 'notes').prilohy;
  const imageAttachments = dataModulu(song, 'images').prilohy;

  // Toggle module visibility
  const toggleModuleVisible = (id: ModuleType) => {
    const updated = modules.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m));
    saveModulesConfig(updated);
  };

  // Change width of module
  const changeModuleWidth = (id: ModuleType, width: ModuleConfig['width']) => {
    const updated = modules.map((m) => (m.id === id ? { ...m, width } : m));
    saveModulesConfig(updated);
  };

  // Change height of module
  const changeModuleHeight = (id: ModuleType, height: ModuleConfig['height']) => {
    const updated = modules.map((m) => (m.id === id ? { ...m, height, customHeight: undefined } : m));
    saveModulesConfig(updated);
  };

  // Toggle floating mode
  const toggleFloating = (id: ModuleType) => {
    const updated = modules.map((m) => {
      if (m.id === id) {
        const nextFloating = !m.isFloating;
        return {
          ...m,
          isFloating: nextFloating,
          floatPos: nextFloating ? m.floatPos || { x: 100, y: 120 } : m.floatPos,
        };
      }
      return m;
    });
    saveModulesConfig(updated);
  };

  // Move module position up or down
  const moveModule = (id: ModuleType, direction: 'up' | 'down') => {
    const sorted = [...modules].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((m) => m.id === id);
    if (idx < 0) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    // Swap orders
    const tempOrder = sorted[idx].order;
    sorted[idx].order = sorted[targetIdx].order;
    sorted[targetIdx].order = tempOrder;

    saveModulesConfig(sorted);
  };

  // Equal Grid preset reset - ONLY FOR CURRENTLY VISIBLE/CHECKED MODULES!
  const handleResetEqualGrid = () => {
    const visibleOnes = modules.filter((m) => m.visible).sort((a, b) => a.order - b.order);
    const count = visibleOnes.length;

    const updated = modules.map((m) => {
      // KEEP UNCHECKED MODULES UNCHECKED!
      if (!m.visible) return m;

      const visIdx = visibleOnes.findIndex((v) => v.id === m.id);
      let targetWidth: ModuleConfig['width'] = '1/2';
      if (count === 1) {
        targetWidth = 'full';
      } else if (count === 3) {
        targetWidth = '1/3';
      } else if (count === 4) {
        targetWidth = '1/2';
      } else if (count === 5) {
        targetWidth = visIdx < 2 ? '1/2' : '1/3';
      } else if (count >= 6) {
        targetWidth = '1/3';
      }

      return {
        ...m,
        width: targetWidth,
        height: 'md' as ModuleConfig['height'],
        customHeight: undefined,
        isFloating: false,
        order: visIdx + 1,
      };
    });

    saveModulesConfig(updated);
  };

  // Multi-directional resize handlers
  const handleStartResize = (
    id: ModuleType,
    e: React.MouseEvent,
    direction: ResizeDirection,
    element: HTMLElement,
    isFloating: boolean = false
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingModuleId(id);
    setResizeDir(direction);
    
    const rect = element.getBoundingClientRect();
    const parentWidth = element.parentElement?.clientWidth || window.innerWidth;
    const currentMod = modules.find((m) => m.id === id);
    const currentCol = currentMod?.customColSpan || (currentMod?.width === '1/3' ? 4 : currentMod?.width === '1/2' ? 6 : currentMod?.width === '2/3' ? 8 : 12);

    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      parentWidth: parentWidth,
      startColSpan: currentCol,
      isFloating: isFloating,
    };
  };

  useEffect(() => {
    if (!resizingModuleId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartRef.current.startX;
      const deltaY = e.clientY - resizeStartRef.current.startY;
      const isFloat = resizeStartRef.current.isFloating;

      if (isFloat) {
        // Floating module smooth pixel resize
        const newW = Math.max(300, Math.min(window.innerWidth - 60, resizeStartRef.current.startWidth + deltaX));
        const newH = Math.max(200, Math.min(window.innerHeight - 80, resizeStartRef.current.startHeight + deltaY));
        setModules((prev) =>
          prev.map((m) => {
            if (m.id !== resizingModuleId) return m;
            return {
              ...m,
              floatSize: {
                width: resizeDir === 'vertical' ? (m.floatSize?.width || resizeStartRef.current.startWidth) : newW,
                height: resizeDir === 'horizontal' ? (m.floatSize?.height || resizeStartRef.current.startHeight) : newH,
              },
            };
          })
        );
      } else {
        // Docked Grid module multi-directional resize
        const newHeight = Math.max(160, Math.min(1200, resizeStartRef.current.startHeight + deltaY));
        
        // Calculate new column span based on pixel change relative to parent 12-column grid
        const colWidthPx = Math.max(40, resizeStartRef.current.parentWidth / 12);
        const colDelta = Math.round(deltaX / colWidthPx);
        const rawCol = Math.max(3, Math.min(12, resizeStartRef.current.startColSpan + colDelta));
        
        let targetWidth: ModuleConfig['width'] = '1/2';
        if (rawCol <= 4) targetWidth = '1/3';
        else if (rawCol <= 6) targetWidth = '1/2';
        else if (rawCol <= 8) targetWidth = '2/3';
        else targetWidth = 'full';

        setModules((prev) =>
          prev.map((m) => {
            if (m.id !== resizingModuleId) return m;
            return {
              ...m,
              customHeight: resizeDir === 'horizontal' ? m.customHeight : newHeight,
              customColSpan: resizeDir === 'vertical' ? m.customColSpan : rawCol,
              width: targetWidth,
            };
          })
        );
      }
    };

    const handleMouseUp = () => {
      if (resizingModuleId) {
        saveModulesConfig(modules);
        setResizingModuleId(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingModuleId, resizeDir, modules]);

  // Floating Window drag handlers
  const handleStartFloatDrag = (id: ModuleType, e: React.MouseEvent, currentPos: { x: number; y: number }) => {
    e.preventDefault();
    setFloatingDragId(id);
    floatDragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: currentPos?.x || 100,
      initY: currentPos?.y || 100,
    };
  };

  useEffect(() => {
    if (!floatingDragId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - floatDragStartRef.current.startX;
      const deltaY = e.clientY - floatDragStartRef.current.startY;
      const newX = Math.max(20, Math.min(window.innerWidth - 320, floatDragStartRef.current.initX + deltaX));
      const newY = Math.max(40, Math.min(window.innerHeight - 200, floatDragStartRef.current.initY + deltaY));

      setModules((prev) =>
        prev.map((m) => (m.id === floatingDragId ? { ...m, floatPos: { x: newX, y: newY } } : m))
      );
    };

    const handleMouseUp = () => {
      if (floatingDragId) {
        saveModulesConfig(modules);
        setFloatingDragId(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [floatingDragId, modules]);

  // Drag & drop reordering between tiles
  const handleDropOnModule = (targetId: ModuleType) => {
    if (!draggedModuleId || draggedModuleId === targetId) return;

    const sorted = [...modules].sort((a, b) => a.order - b.order);
    const sourceIdx = sorted.findIndex((m) => m.id === draggedModuleId);
    const targetIdx = sorted.findIndex((m) => m.id === targetId);

    if (sourceIdx < 0 || targetIdx < 0) return;

    const [moved] = sorted.splice(sourceIdx, 1);
    sorted.splice(targetIdx, 0, moved);

    const reordered = sorted.map((m, idx) => ({ ...m, order: idx + 1 }));
    saveModulesConfig(reordered);
    setDraggedModuleId(null);
  };

  // Add Link Handler
  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl.trim()) return;

    let cleanUrl = newLinkUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    const newLink: SongLink = {
      id: 'link_' + Date.now(),
      title: newLinkTitle.trim() || cleanUrl,
      url: cleanUrl,
      category: newLinkCategory,
    };

    const updated = {
      ...song,
      links: [newLink, ...(song.links || [])],
      updatedAt: Date.now(),
    };

    onUpdateSong(updated);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setShowAddLink(false);
  };

  // Add YouTube Video Handler
  const handleAddYoutube = (url: string) => {
    if (!url.trim()) return;
    const clean = url.trim();
    let vidId = '';

    if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
      vidId = clean;
    } else {
      const match =
        clean.match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/) ||
        clean.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (match) vidId = match[1];
    }

    if (!vidId) return;

    const newVid = {
      id: vidId,
      title: `${song.title} (Video)`,
      url: `https://www.youtube.com/watch?v=${vidId}`,
      type: 'backingtrack' as const,
      addedAt: Date.now(),
    };

    const updated = {
      ...song,
      youtubeVideos: [newVid, ...(song.youtubeVideos || []).filter((v) => v.id !== vidId)],
      updatedAt: Date.now(),
    };

    onUpdateSong(updated);
    setYtInput('');
  };

  // Save Text Changes
  const handleSaveText = () => {
    const updated = {
      ...song,
      content: editedContent,
      updatedAt: Date.now(),
    };
    onUpdateSong(updated);
    setIsEditingText(false);
  };

  // Transpose Chord Helper
  const CHROMATIC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  const transposeChordName = (chordName: string, semitones: number): string => {
    if (!semitones) return chordName;
    const match = chordName.match(/^([A-G][b#]?)(.*)/);
    if (!match) return chordName;

    const [, root, suffix] = match;
    let idx = CHROMATIC.indexOf(root);
    if (idx === -1) {
      if (root === 'Db') idx = CHROMATIC.indexOf('C#');
      else if (root === 'D#') idx = CHROMATIC.indexOf('Eb');
      else if (root === 'Gb') idx = CHROMATIC.indexOf('F#');
      else if (root === 'Ab') idx = CHROMATIC.indexOf('G#');
      else if (root === 'A#') idx = CHROMATIC.indexOf('Bb');
    }
    if (idx === -1) return chordName;

    let newIdx = (idx + semitones) % 12;
    if (newIdx < 0) newIdx += 12;

    return CHROMATIC[newIdx] + suffix;
  };

  // Render Line with interactive chord pills
  const renderLineWithChords = (lineText: string) => {
    // Check if line contains [Chord] brackets
    const bracketRegex = /\[([A-G][b#]?[^\]]*)\]/g;
    if (bracketRegex.test(lineText)) {
      const parts = lineText.split(/(\[[A-G][b#]?[^\]]*\])/g);
      return (
        <div className="text-white whitespace-pre-wrap flex flex-wrap items-baseline gap-x-1">
          {parts.map((part, idx) => {
            const chordMatch = part.match(/^\[([A-G][b#]?[^\]]*)\]$/);
            if (chordMatch) {
              const chordRaw = chordMatch[1];
              const transposed = transposeChordName(chordRaw, effectiveTranspose);
              return (
                <span
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (musicalCtx?.setActiveChord) musicalCtx.setActiveChord(transposed);
                    if (onSelectModalChord) onSelectModalChord(transposed);
                  }}
                  className="text-[#FF9F0A] font-bold px-1.5 py-0.5 bg-[#FF9F0A]/10 hover:bg-[#FF9F0A]/25 border border-[#FF9F0A]/30 rounded-md text-[0.9em] cursor-pointer inline-block mx-0.5"
                  title={`Akord ${transposed} - kliknutím zobrazit na klávesách i hmatníku`}
                >
                  {transposed}
                </span>
              );
            }
            return <span key={idx}>{part}</span>;
          })}
        </div>
      );
    }

    // Check if whole line is purely chords (e.g. "Am   C   G   F")
    const words = lineText.trim().split(/\s+/);
    const chordPattern = /^[A-G][b#]?(m|maj|min|dim|aug|sus|add|\d)*(\/[A-G][b#]?)?$/;
    const isPureChordLine = words.length > 0 && words.every((w) => chordPattern.test(w));

    if (isPureChordLine) {
      return (
        <div className="text-[#FF9F0A] font-bold text-[0.95em] flex flex-wrap gap-4 py-0.5">
          {words.map((w, wIdx) => {
            const transposed = transposeChordName(w, effectiveTranspose);
            return (
              <span
                key={wIdx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (musicalCtx?.setActiveChord) musicalCtx.setActiveChord(transposed);
                  if (onSelectModalChord) onSelectModalChord(transposed);
                }}
                className="px-1.5 py-0.5 rounded-md hover:bg-[#FF9F0A]/20 cursor-pointer transition-colors"
                title={`Akord ${transposed} - kliknutím zobrazit na klávesách i hmatníku`}
              >
                {transposed}
              </span>
            );
          })}
        </div>
      );
    }

    // Plain text line
    return <div className="text-neutral-100 whitespace-pre-wrap">{lineText || ' '}</div>;
  };

  // Render Lyrics lines
  const renderLyrics = () => {
    if (!songSections || songSections.length === 0) {
      return (
        <div className="text-center py-12 text-neutral-400">
          <p className="text-sm">Žádný text písně zatím nebyl vložen.</p>
          <button
            onClick={() => setIsEditingText(true)}
            className="mt-3 px-4 py-2 bg-[#FF9F0A] text-black font-bold rounded-xl text-xs"
          >
            Vložit text a akordy
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {songSections.map((section) => (
          <div
            key={section.id}
            id={`sec-block-${section.id}`}
            className={`p-3 rounded-2xl transition-all ${
              selectedSectionId === section.id
                ? 'bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 shadow-md'
                : 'hover:bg-white/[0.02]'
            }`}
          >
            {section.title && (
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-white/[0.06]">
                <span className="text-xs font-bold text-[#FF9F0A] uppercase tracking-wider">
                  [{section.title}]
                </span>
                <button
                  onClick={() => {
                    if (selectedSectionId === section.id && isLoopActive) {
                      setIsLoopActive(false);
                      setSelectedSectionId(null);
                    } else {
                      setSelectedSectionId(section.id);
                      setIsLoopActive(true);
                    }
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-1 font-semibold cursor-pointer ${
                    selectedSectionId === section.id && isLoopActive
                      ? 'bg-[#FF9F0A] text-black'
                      : 'bg-white/5 text-neutral-400 hover:text-white'
                  }`}
                >
                  <Repeat className="w-3 h-3" />
                  <span>Smyčka</span>
                </button>
              </div>
            )}

            <div className="space-y-2 font-mono leading-relaxed" style={{ fontSize: `${fontSize}px` }}>
              {section.lines.map((lineText, lineIdx) => {
                const lineId = `${section.id}_${lineIdx}`;
                const isActiveLine = activeLineId === lineId;

                return (
                  <div
                    key={lineIdx}
                    onClick={() => setActiveLineId(lineId)}
                    className={`p-1 rounded-xl transition-all cursor-pointer ${
                      isActiveLine ? 'bg-white/10 ring-1 ring-[#FF9F0A]' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    {renderLineWithChords(lineText)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };



  // Render Module Content Helper
  const renderModuleBody = (mod: ModuleConfig) => {
    switch (mod.id) {
      case 'text_chords':
        return (
          <div className="flex-1 flex flex-col gap-3">
            {/* Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white/[0.03] border border-white/[0.06] rounded-2xl text-xs">
              {/* Transposition & Capo */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-neutral-400 font-medium">Tónina:</span>
                <button
                  onClick={() => setTransposeSemitones((p) => p - 1)}
                  className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold cursor-pointer"
                >
                  -1
                </button>
                <span className="text-xs font-bold text-[#FF9F0A] px-1 font-mono">
                  {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones}
                </span>
                <button
                  onClick={() => setTransposeSemitones((p) => p + 1)}
                  className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold cursor-pointer"
                >
                  +1
                </button>
                <div className="border-l border-white/10 pl-2 ml-1 flex items-center gap-1">
                  <span className="text-[11px] text-neutral-400">Capo:</span>
                  <select
                    value={capoFret}
                    onChange={(e) => setCapoFret(parseInt(e.target.value, 10))}
                    className="bg-black/80 border border-white/10 text-white text-[11px] rounded-lg px-1 py-0.5 outline-none cursor-pointer"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((f) => (
                      <option key={f} value={f}>
                        {f === 0 ? 'Bez' : `${f}. pražec`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Font Size & Scroll */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-xl border border-white/10">
                  <button
                    onClick={() => setFontSize((p) => Math.max(12, p - 2))}
                    className="text-white hover:text-[#FF9F0A] font-bold px-1"
                  >
                    A-
                  </button>
                  <span className="text-[11px] text-neutral-300 px-1">{fontSize}px</span>
                  <button
                    onClick={() => setFontSize((p) => Math.min(36, p + 2))}
                    className="text-white hover:text-[#FF9F0A] font-bold px-1"
                  >
                    A+
                  </button>
                </div>

                <button
                  onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                  className={`px-2.5 py-1 rounded-xl font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                    isAutoScrolling
                      ? 'bg-[#FF9F0A] text-black font-bold'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  {isAutoScrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isAutoScrolling ? 'Pauza' : 'Rolovat'}</span>
                </button>

                <button
                  onClick={() => {
                    setEditedContent(song.content || '');
                    setIsEditingText(!isEditingText);
                  }}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#FF9F0A]" />
                  <span>{isEditingText ? 'Zavřít' : 'Upravit'}</span>
                </button>
              </div>
            </div>

            {/* Content / Editor */}
            {isEditingText ? (
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="flex-1 w-full bg-black/60 border border-white/15 rounded-2xl p-3 text-xs font-mono text-white outline-none resize-none min-h-[300px]"
                />
                <button
                  onClick={handleSaveText}
                  className="py-2 bg-[#FF9F0A] text-black font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Save className="w-4 h-4" /> Uložit text a akordy
                </button>
              </div>
            ) : (
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-3 sm:p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-2 scroll-smooth"
              >
                {renderLyrics()}
              </div>
            )}
          </div>
        );

      case 'youtube':
        return (
          <div className="flex-1 flex flex-col gap-3">
            {youtubeVideos.length > 0 ? (
              <div className="flex-1 flex flex-col gap-2">
                {youtubeVideos.length > 1 && (
                  <select
                    value={selectedYtIndex}
                    onChange={(e) => setSelectedYtIndex(parseInt(e.target.value, 10))}
                    className="bg-black/60 border border-white/10 text-xs text-white p-2 rounded-xl outline-none"
                  >
                    {youtubeVideos.map((v, i) => (
                      <option key={v.id} value={i}>
                        {i + 1}. {v.title}
                      </option>
                    ))}
                  </select>
                )}
                <div className="aspect-video w-full bg-black rounded-2xl overflow-hidden border border-white/10 shadow-lg">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${youtubeVideos[selectedYtIndex]?.id}?rel=0`}
                    title={youtubeVideos[selectedYtIndex]?.title || 'YouTube Video'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-400 text-xs space-y-3">
                <p>Žádné YouTube video není připojeno k této skladbě.</p>
              </div>
            )}

            {/* Add YT input */}
            <div className="flex gap-1.5 pt-2 border-t border-white/[0.06]">
              <input
                type="text"
                placeholder="Vložit YouTube URL / ID..."
                value={ytInput}
                onChange={(e) => setYtInput(e.target.value)}
                className="flex-1 bg-black/60 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none"
              />
              <button
                onClick={() => handleAddYoutube(ytInput)}
                disabled={!ytInput.trim()}
                className="px-3 py-1.5 bg-[#FF453A] text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-40"
              >
                Připojit
              </button>
            </div>
          </div>
        );

      case 'chord_diagrams':
        return (
          <AkordyPanel
            song={song}
            songChords={songChords}
            najdiAkord={findOrGenerateChord}
            onUpdateSong={onUpdateSong}
            onOtevritDetail={onSelectModalChord}
          />
        );

      case 'stems_mixer':
        return <ModularStemsMixer song={song} />;

      case 'tuner':
        return <ModularTunerSection currentTuningName={song.tuning} />;

      case 'fretboard':
        return (
          <ModularFretboardSection
            songChords={songChords}
            activeKey={song.key}
            onSelectChord={onSelectModalChord}
          />
        );

      case 'keyboard':
        return (
          <ModularPianoSection
            songChords={songChords}
            activeChord={musicalCtx?.activeChord}
            onSelectChord={onSelectModalChord}
            songKey={song.key}
          />
        );


      case 'tabs':
        return (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <TabulaturaModul song={song} prilohy={tabAttachments} onUpdateSong={onUpdateSong} />
            {onOpenImportModal && tabAttachments.length > 0 && (
              <button
                onClick={onOpenImportModal}
                className="shrink-0 w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#FF9F0A]" /> Nahrát další tabulaturu
              </button>
            )}
          </div>
        );

      case 'midi':
        return (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <MidiModul song={song} prilohy={midiAttachments} onUpdateSong={onUpdateSong} />
            {onOpenImportModal && midiAttachments.length > 0 && (
              <button
                onClick={onOpenImportModal}
                className="shrink-0 w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#30D158]" /> Nahrát další MIDI
              </button>
            )}
          </div>
        );

      case 'notes':
        return (
          <div className="flex-1 flex flex-col gap-3">
            {noteAttachments.length > 0 ? (
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between bg-white/5 p-1.5 rounded-xl text-xs">
                  <span className="text-neutral-300 font-medium">Zobrazení Not</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSheetZoom((z) => Math.max(50, z - 20))}
                      className="p-1 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-bold text-[#FF9F0A]">{sheetZoom}%</span>
                    <button
                      onClick={() => setSheetZoom((z) => Math.min(200, z + 20))}
                      className="p-1 bg-white/10 hover:bg-white/20 rounded-lg text-white"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto border border-white/10 rounded-2xl bg-black/40 p-2 flex justify-center">
                  {noteAttachments[0].dataUrl.startsWith('data:application/pdf') ? (
                    <iframe
                      src={noteAttachments[0].dataUrl}
                      title="Sheet Music PDF"
                      className="w-full h-[360px] rounded-xl border-0"
                    />
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-xs text-white font-bold mb-2">{noteAttachments[0].name}</p>
                      <a
                        href={noteAttachments[0].dataUrl}
                        download={noteAttachments[0].name}
                        className="px-3 py-1.5 bg-[#FF9F0A] text-black text-xs font-bold rounded-xl"
                      >
                        Stáhnout Noty (PDF)
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <PrazdnyModul song={song} modulId="notes" onUpdateSong={onUpdateSong} />
            )}

            {onOpenImportModal && (
              <button
                onClick={onOpenImportModal}
                className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#FF9F0A]" /> Nahrát Noty v PDF
              </button>
            )}
          </div>
        );

      case 'images':
        return (
          <div className="flex-1 flex flex-col gap-3">
            {imageAttachments.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 overflow-y-auto">
                {imageAttachments.map((img) => (
                  <div
                    key={img.id}
                    className="group relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-black/50"
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-white truncate">{img.name}</span>
                      <a
                        href={img.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="self-end px-2 py-1 bg-white text-black font-bold text-[10px] rounded-lg"
                      >
                        Zvětšit
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <PrazdnyModul song={song} modulId="images" onUpdateSong={onUpdateSong} />
            )}

            {onOpenImportModal && (
              <button
                onClick={onOpenImportModal}
                className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-[#FF9F0A]" /> Přidat obrázek / fotku
              </button>
            )}
          </div>
        );

      case 'links':
        return (
          <div className="flex-1 flex flex-col gap-3">
            {links.length > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-1.5">
                {links.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] rounded-2xl flex items-center justify-between text-xs transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <LinkIcon className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0" />
                      <span className="font-semibold text-white truncate">{link.title}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-400 group-hover:text-white shrink-0" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-neutral-400 text-xs">
                Zatím nebyly přidány žádné externí odkazové zdroje.
              </div>
            )}

            {showAddLink ? (
              <form
                onSubmit={handleAddLink}
                className="bg-black/50 border border-white/10 p-3 rounded-2xl space-y-2 text-xs"
              >
                <input
                  type="text"
                  placeholder="Název odkazu (např. Akordy na Supermusic)..."
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl p-2 text-white outline-none"
                />
                <input
                  type="text"
                  placeholder="URL adresa (https://...)..."
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl p-2 text-white outline-none"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddLink(false)}
                    className="px-3 py-1 bg-white/10 text-neutral-300 rounded-xl text-xs cursor-pointer"
                  >
                    Zrušit
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-[#FF9F0A] text-black font-bold rounded-xl text-xs cursor-pointer"
                  >
                    Uložit odkaz
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddLink(true)}
                className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#FF9F0A]" /> Přidat novou URL
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  /**
   * Plocha písně: plovoucí okna.
   *
   * Nahradila mřížku pevných dlaždic. Ta uměla jen zapnout a vypnout, co
   * bylo předem dané; okno si otevřeš, když ho potřebuješ, položíš kam
   * chceš a zavřeš, až dokoukáš.
   */
  return (
    <div className="space-y-4">
      <NavrhyPanel song={song} onZmena={() => onUpdateSong({ ...song })} />

        <PlovouciPlocha
          song={song}
          vykresliObsah={(okno) =>
            renderModuleBody({
              id: okno.typ,
              title: okno.typ,
              icon: '',
              visible: true,
              width: 'full',
              height: 'md',
              order: 0,
            } as ModuleConfig)
          }
        />
    </div>
  );
};