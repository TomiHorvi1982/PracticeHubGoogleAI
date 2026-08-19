import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Camera, Monitor, Upload, Search, Tag, Trash2, Download, ZoomIn, ZoomOut,
  RotateCw, Maximize2, X, ChevronLeft, ChevronRight, Check, Edit2, Calendar,
  User, Eye, Sparkles, Filter, Grid as GridIcon, List, Copy
} from 'lucide-react';
import { BandPhoto, UserAccount, BandOnlineUser } from '../types';
import { photoService } from '../services/photoService';

interface PhotosSectionProps {
  photos: BandPhoto[];
  currentUser: UserAccount | null;
  onlineUsers?: BandOnlineUser[];
  onOpenCameraCapture: () => void;
  onOpenScreenCapture: () => void;
  onOpenUploadCapture: () => void;
}

export const PhotosSection: React.FC<PhotosSectionProps> = ({
  photos,
  currentUser,
  onlineUsers = [],
  onOpenCameraCapture,
  onOpenScreenCapture,
  onOpenUploadCapture,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'photo' | 'screenshot' | 'upload' | 'my' | string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'list'>('grid');
  
  // Lightbox & viewer state
  const [lightboxPhotoId, setLightboxPhotoId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Global Ctrl+V paste support inside photos tab
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const result = event.target?.result as string;
              if (result) {
                const newPhoto = await photoService.savePhoto({
                  title: `Printscreen ze schránky ${new Date().toLocaleDateString('cs-CZ')} ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`,
                  dataUrl: result,
                  type: 'screenshot',
                  authorId: currentUser?.id || 'guest',
                  authorName: currentUser?.displayName || 'Člen Kapely',
                  tags: ['Printscreen z PC'],
                });
                setLightboxPhotoId(newPhoto.id);
              }
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [currentUser]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    for (const p of photos) {
      if (Array.isArray(p.tags)) {
        for (const t of p.tags) {
          if (t.trim()) tagsSet.add(t.trim());
        }
      }
    }
    return Array.from(tagsSet);
  }, [photos]);

  // Filtered photos
  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      // Type or custom tag filter
      if (activeFilter === 'photo' && p.type !== 'photo') return false;
      if (activeFilter === 'screenshot' && p.type !== 'screenshot') return false;
      if (activeFilter === 'upload' && p.type !== 'upload') return false;
      if (activeFilter === 'my' && p.authorId !== currentUser?.id) return false;
      if (
        activeFilter !== 'all' &&
        activeFilter !== 'photo' &&
        activeFilter !== 'screenshot' &&
        activeFilter !== 'upload' &&
        activeFilter !== 'my'
      ) {
        if (!p.tags || !p.tags.includes(activeFilter)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = p.title.toLowerCase().includes(q);
        const notesMatch = (p.notes || '').toLowerCase().includes(q);
        const authorMatch = (p.authorName || '').toLowerCase().includes(q);
        const tagsMatch = p.tags?.some((t) => t.toLowerCase().includes(q));
        if (!titleMatch && !notesMatch && !authorMatch && !tagsMatch) {
          return false;
        }
      }

      return true;
    });
  }, [photos, activeFilter, searchQuery, currentUser]);

  const currentLightboxPhoto = useMemo(() => {
    return photos.find((p) => p.id === lightboxPhotoId) || null;
  }, [photos, lightboxPhotoId]);

  const currentLightboxIndex = useMemo(() => {
    if (!currentLightboxPhoto) return -1;
    return filteredPhotos.findIndex((p) => p.id === currentLightboxPhoto.id);
  }, [filteredPhotos, currentLightboxPhoto]);

  const openLightbox = (photo: BandPhoto) => {
    setLightboxPhotoId(photo.id);
    setZoomLevel(1);
    setRotation(0);
    setEditTitle(photo.title);
    setEditNotes(photo.notes || '');
    setIsEditingMetadata(false);
  };

  const closeLightbox = () => {
    setLightboxPhotoId(null);
    setIsEditingMetadata(false);
  };

  const handleNextPhoto = useCallback(() => {
    if (filteredPhotos.length === 0 || currentLightboxIndex === -1) return;
    const nextIndex = (currentLightboxIndex + 1) % filteredPhotos.length;
    const nextPhoto = filteredPhotos[nextIndex];
    setLightboxPhotoId(nextPhoto.id);
    setZoomLevel(1);
    setRotation(0);
    setEditTitle(nextPhoto.title);
    setEditNotes(nextPhoto.notes || '');
    setIsEditingMetadata(false);
  }, [filteredPhotos, currentLightboxIndex]);

  const handlePrevPhoto = useCallback(() => {
    if (filteredPhotos.length === 0 || currentLightboxIndex === -1) return;
    const prevIndex = (currentLightboxIndex - 1 + filteredPhotos.length) % filteredPhotos.length;
    const prevPhoto = filteredPhotos[prevIndex];
    setLightboxPhotoId(prevPhoto.id);
    setZoomLevel(1);
    setRotation(0);
    setEditTitle(prevPhoto.title);
    setEditNotes(prevPhoto.notes || '');
    setIsEditingMetadata(false);
  }, [filteredPhotos, currentLightboxIndex]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!lightboxPhotoId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') handleNextPhoto();
      if (e.key === 'ArrowLeft') handlePrevPhoto();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxPhotoId, handleNextPhoto, handlePrevPhoto]);

  const handleDeletePhoto = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm('Opravdu chcete smazat tento snímek z galerie kapely?')) {
      if (lightboxPhotoId === id) {
        closeLightbox();
      }
      await photoService.deletePhoto(id);
    }
  };

  const handleDownloadPhoto = (photo: BandPhoto, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const link = document.createElement('a');
    link.href = photo.dataUrl;
    link.download = `${photo.title.replace(/[^a-zA-Z0-9-_]/g, '_') || 'kapela_snimek'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyPhoto = async (photo: BandPhoto, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      // Try copying image to clipboard if supported
      const res = await fetch(photo.dataUrl);
      const blob = await res.blob();
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    } catch (err) {
      console.warn('Clipboard image write not supported, falling back to data URL', err);
      navigator.clipboard.writeText(photo.dataUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleSaveMetadata = async () => {
    if (!currentLightboxPhoto) return;
    await photoService.updatePhoto(currentLightboxPhoto.id, {
      title: editTitle.trim() || currentLightboxPhoto.title,
      notes: editNotes.trim(),
    });
    setIsEditingMetadata(false);
  };

  return (
    <div className="space-y-4 font-sans text-white pb-12">
      
      {/* Top Banner & Action Bar */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl shrink-0">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="bg-[#FF9F0A] text-black font-bold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
                  Galerie
                </span>
                <span className="text-xs text-neutral-400 font-medium">
                  {photos.length} {photos.length === 1 ? 'snímek' : photos.length < 5 ? 'snímky' : 'snímků'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Fotky &amp; Printscreeny Kapely
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Sdílené fotografie ze zkoušek, akordové tabule, printscreeny z PC a záznamy nastavení aparátů.
              </p>
            </div>
          </div>

          {/* Quick Capture Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            
            <button
              onClick={onOpenCameraCapture}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#FF9F0A] hover:bg-[#ffaa2b] text-black font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
              title="Vyfotit webkamerou nebo fotoaparátem v mobilu"
            >
              <Camera className="w-4 h-4" />
              <span>Vyfotit kamerou</span>
            </button>

            <button
              onClick={onOpenScreenCapture}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#30D158] hover:bg-[#34e260] text-black font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
              title="Pořídit snímek celé obrazovky nebo okna z PC"
            >
              <Monitor className="w-4 h-4" />
              <span>Printscreen PC</span>
            </button>

            <button
              onClick={onOpenUploadCapture}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs rounded-xl border border-white/10 cursor-pointer transition-all"
              title="Nahrát soubor nebo vložit ze schránky"
            >
              <Upload className="w-4 h-4 text-neutral-300" />
              <span>Nahrát / Vložit</span>
            </button>

          </div>

        </div>

        {/* Tip / Paste notification */}
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between text-xs text-neutral-400 gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#30D158]" />
            <span>Klávesová zkratka: Na této záložce můžete kdykoliv stisknout <kbd className="px-1.5 py-0.5 bg-white/10 border border-white/15 rounded text-white font-mono text-[10px]">Ctrl + V</kbd> pro okamžité vložení snímku ze schránky!</span>
          </div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-lg">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hledat podle názvu, autora, štítku..."
            className="w-full bg-black/40 border border-white/10 focus:border-[#0A84FF] text-white pl-9 pr-8 py-2 rounded-xl text-xs outline-none transition-colors placeholder-neutral-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-white text-black shadow-md font-bold'
                : 'bg-black/30 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            Vše ({photos.length})
          </button>

          <button
            onClick={() => setActiveFilter('photo')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeFilter === 'photo'
                ? 'bg-[#FF9F0A] text-black shadow-md font-bold'
                : 'bg-black/30 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Foto z kamery</span>
          </button>

          <button
            onClick={() => setActiveFilter('screenshot')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeFilter === 'screenshot'
                ? 'bg-[#30D158] text-black shadow-md font-bold'
                : 'bg-black/30 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Printscreen PC</span>
          </button>

          {currentUser && (
            <button
              onClick={() => setActiveFilter('my')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeFilter === 'my'
                  ? 'bg-[#0A84FF] text-white shadow-md font-bold'
                  : 'bg-black/30 text-neutral-400 hover:text-white border border-white/5'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Moje snímky</span>
            </button>
          )}

          {/* Dynamic Tags */}
          {allTags.slice(0, 4).map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveFilter(tag)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeFilter === tag
                  ? 'bg-white text-black font-bold'
                  : 'bg-black/30 text-neutral-400 hover:text-white border border-white/5'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white/20 text-white' : 'text-neutral-500 hover:text-white'}`}
            title="Mřížka"
          >
            <GridIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white/20 text-white' : 'text-neutral-500 hover:text-white'}`}
            title="Seznam"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Main Photos Grid / List */}
      {filteredPhotos.length === 0 ? (
        
        /* EMPTY STATE */
        <div className="p-12 sm:p-16 text-center rounded-3xl border border-white/[0.08] bg-[#16161A]/80 backdrop-blur-xl flex flex-col items-center justify-center gap-4 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-neutral-400">
            <Camera className="w-8 h-8 text-[#FF9F0A]" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-base font-bold text-white">
              {searchQuery || activeFilter !== 'all' ? 'Nebyly nalezeny žádné snímky' : 'Galerie kapely je zatím prázdná'}
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              {searchQuery || activeFilter !== 'all'
                ? 'Zkuste upravit vyhledávací dotaz nebo vybrat jiný filtr.'
                : 'Pořiďte fotografii zkoušky webkamerou, zachyťte printscreen z počítače nebo vložte obrázek ze schránky stisknutím Ctrl+V.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={onOpenCameraCapture}
              className="flex items-center gap-2 px-4 py-2 bg-[#FF9F0A] hover:bg-[#ffaa2b] text-black font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
            >
              <Camera className="w-4 h-4" />
              <span>Vyfotit snímek</span>
            </button>
            <button
              onClick={onOpenScreenCapture}
              className="flex items-center gap-2 px-4 py-2 bg-[#30D158] hover:bg-[#34e260] text-black font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
            >
              <Monitor className="w-4 h-4" />
              <span>Printscreen PC</span>
            </button>
          </div>
        </div>

      ) : viewMode === 'grid' ? (
        
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => {
            const isPhoto = photo.type === 'photo';
            const isScreenshot = photo.type === 'screenshot';

            return (
              <div
                key={photo.id}
                onClick={() => openLightbox(photo)}
                className="group bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] hover:border-white/20 rounded-2xl flex flex-col overflow-hidden transition-all shadow-lg hover:shadow-xl cursor-pointer"
              >
                {/* Image Container */}
                <div className="relative bg-black/60 aspect-video overflow-hidden flex items-center justify-center">
                  <img
                    src={photo.dataUrl}
                    alt={photo.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />

                  {/* Type Badge */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md tracking-wide shadow-md ${
                        isPhoto
                          ? 'bg-[#FF9F0A] text-black'
                          : isScreenshot
                          ? 'bg-[#30D158] text-black'
                          : 'bg-white/20 backdrop-blur-md text-white'
                      }`}
                    >
                      {isPhoto ? 'Foto' : isScreenshot ? 'Printscreen' : 'Soubor'}
                    </span>
                  </div>

                  {/* Hover Quick Action Buttons */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDownloadPhoto(photo, e)}
                      className="p-1.5 bg-black/70 hover:bg-black text-white rounded-lg backdrop-blur-md border border-white/10 cursor-pointer"
                      title="Stáhnout obrázek"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeletePhoto(photo.id, e)}
                      className="p-1.5 bg-black/70 hover:bg-red-500/80 text-white rounded-lg backdrop-blur-md border border-white/10 cursor-pointer"
                      title="Smazat snímek"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Hover Overlay Icon */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                    <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 text-white text-xs font-semibold rounded-xl border border-white/20 flex items-center gap-1.5 shadow-lg">
                      <Eye className="w-4 h-4 text-[#0A84FF]" />
                      <span>Zvětšit</span>
                    </div>
                  </div>
                </div>

                {/* Card Info */}
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                  <div>
                    <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-[#0A84FF] transition-colors">
                      {photo.title}
                    </h4>
                    {photo.notes && (
                      <p className="text-xs text-neutral-400 line-clamp-2 mt-1 leading-normal">
                        {photo.notes}
                      </p>
                    )}
                  </div>

                  {/* Tags */}
                  {photo.tags && photo.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {photo.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-neutral-300 border border-white/10"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer Meta */}
                  <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-neutral-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-[#FF9F0A]" />
                      <strong className="text-neutral-300 font-medium">{photo.authorName || 'Člen'}</strong>
                    </span>
                    <span>
                      {new Date(photo.createdAt).toLocaleDateString('cs-CZ')}
                    </span>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      ) : (
        
        /* LIST VIEW */
        <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden divide-y divide-white/5 shadow-xl">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => openLightbox(photo)}
              className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-16 h-12 bg-black/60 rounded-xl border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                  <img
                    src={photo.dataUrl}
                    alt={photo.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-md ${
                        photo.type === 'photo'
                          ? 'bg-[#FF9F0A] text-black'
                          : photo.type === 'screenshot'
                          ? 'bg-[#30D158] text-black'
                          : 'bg-white/20 text-white'
                      }`}
                    >
                      {photo.type === 'photo' ? 'Foto' : photo.type === 'screenshot' ? 'Printscreen' : 'Soubor'}
                    </span>
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-[#0A84FF]">
                      {photo.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                    <span>Autor: <strong className="text-neutral-200 font-medium">{photo.authorName}</strong></span>
                    <span>{new Date(photo.createdAt).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => handleDownloadPhoto(photo, e)}
                  className="p-2 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 rounded-xl transition-all cursor-pointer"
                  title="Stáhnout"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDeletePhoto(photo.id, e)}
                  className="p-2 bg-white/5 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-xl transition-all cursor-pointer"
                  title="Smazat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. LIGHTBOX / FULLSCREEN VIEWER MODAL */}
      {currentLightboxPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-xl select-none font-sans">
          <div className="bg-[#16161A] border border-white/15 rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Lightbox Header Bar */}
            <div className="bg-black/40 border-b border-white/10 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                    currentLightboxPhoto.type === 'photo'
                      ? 'bg-[#FF9F0A] text-black'
                      : currentLightboxPhoto.type === 'screenshot'
                      ? 'bg-[#30D158] text-black'
                      : 'bg-white/20 text-white'
                  }`}
                >
                  {currentLightboxPhoto.type === 'photo' ? 'Foto' : currentLightboxPhoto.type === 'screenshot' ? 'Printscreen' : 'Soubor'}
                </span>
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {currentLightboxPhoto.title}
                </h3>
              </div>

              {/* Viewer Controls */}
              <div className="flex items-center gap-1.5">
                
                {/* Zoom out */}
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl cursor-pointer"
                  title="Oddálit"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                {/* Zoom level indicator */}
                <button
                  onClick={() => setZoomLevel(1)}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 border border-white/10 rounded-xl cursor-pointer"
                  title="Resetovat přiblížení"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>

                {/* Zoom in */}
                <button
                  onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl cursor-pointer"
                  title="Přiblížit"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                {/* Rotate */}
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl cursor-pointer"
                  title="Otočit o 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                {/* Copy */}
                <button
                  onClick={() => handleCopyPhoto(currentLightboxPhoto)}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl cursor-pointer"
                  title="Kopírovat do schránky"
                >
                  {copySuccess ? <Check className="w-4 h-4 text-[#30D158]" /> : <Copy className="w-4 h-4" />}
                </button>

                {/* Download */}
                <button
                  onClick={() => handleDownloadPhoto(currentLightboxPhoto)}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl cursor-pointer"
                  title="Stáhnout plnou velikost"
                >
                  <Download className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDeletePhoto(currentLightboxPhoto.id)}
                  className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl cursor-pointer"
                  title="Smazat snímek"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Close */}
                <button
                  onClick={closeLightbox}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl ml-1 cursor-pointer"
                  title="Zavřít (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>

              </div>
            </div>

            {/* Lightbox Body: Image Canvas + Sidebar */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-black/80">
              
              {/* Image Viewport */}
              <div className="relative flex-1 bg-black/60 overflow-auto flex items-center justify-center p-6">
                
                {/* Image element with dynamic zoom and rotate transform */}
                <div
                  className="transition-transform duration-150 flex items-center justify-center"
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  }}
                >
                  <img
                    src={currentLightboxPhoto.dataUrl}
                    alt={currentLightboxPhoto.title}
                    className="max-h-[55vh] md:max-h-[70vh] max-w-full object-contain rounded-xl shadow-2xl"
                  />
                </div>

                {/* Previous Image Arrow */}
                {filteredPhotos.length > 1 && (
                  <button
                    onClick={handlePrevPhoto}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/60 hover:bg-black/90 text-white border border-white/15 rounded-2xl cursor-pointer backdrop-blur-md transition-all"
                    title="Předchozí snímek (Šipka vlevo)"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}

                {/* Next Image Arrow */}
                {filteredPhotos.length > 1 && (
                  <button
                    onClick={handleNextPhoto}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/60 hover:bg-black/90 text-white border border-white/15 rounded-2xl cursor-pointer backdrop-blur-md transition-all"
                    title="Další snímek (Šipka vpravo)"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                )}

                {/* Index counter badge */}
                <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-md px-3 py-1.5 text-xs text-neutral-300 border border-white/10 rounded-xl font-medium">
                  {currentLightboxIndex + 1} z {filteredPhotos.length}
                </div>

              </div>

              {/* Sidebar Metadata & Edit */}
              <div className="w-full md:w-80 bg-[#16161A] border-t md:border-t-0 md:border-l border-white/10 p-5 flex flex-col justify-between overflow-y-auto">
                
                <div className="space-y-4">
                  
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Informace o snímku</span>
                    <button
                      onClick={() => setIsEditingMetadata(!isEditingMetadata)}
                      className="text-xs text-[#0A84FF] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>{isEditingMetadata ? 'Zrušit úpravy' : 'Upravit'}</span>
                    </button>
                  </div>

                  {isEditingMetadata ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-neutral-400 font-medium block mb-1">Název</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 focus:border-[#0A84FF] text-white px-3 py-2 rounded-xl text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-neutral-400 font-medium block mb-1">Poznámky</label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={3}
                          className="w-full bg-black/40 border border-white/10 focus:border-[#0A84FF] text-white px-3 py-2 rounded-xl text-xs outline-none resize-none"
                        />
                      </div>
                      <button
                        onClick={handleSaveMetadata}
                        className="w-full py-2 bg-[#30D158] hover:bg-[#34e260] text-black font-bold text-xs rounded-xl cursor-pointer transition-all shadow-md"
                      >
                        Uložit změny
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-base font-bold text-white tracking-tight">
                          {currentLightboxPhoto.title}
                        </h4>
                        {currentLightboxPhoto.notes && (
                          <p className="text-xs text-neutral-300 mt-1 leading-relaxed whitespace-pre-wrap">
                            {currentLightboxPhoto.notes}
                          </p>
                        )}
                      </div>

                      {/* Tags */}
                      {currentLightboxPhoto.tags && currentLightboxPhoto.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {currentLightboxPhoto.tags.map((t) => (
                            <span
                              key={t}
                              className="text-xs px-2 py-0.5 bg-white/5 text-neutral-300 border border-white/10 rounded-md"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Metadata table */}
                  <div className="pt-4 border-t border-white/10 space-y-2 text-xs">
                    <div className="flex justify-between text-neutral-400">
                      <span>Autor:</span>
                      <strong className="text-white font-medium">{currentLightboxPhoto.authorName}</strong>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>Vytvořeno:</span>
                      <strong className="text-white font-medium">
                        {new Date(currentLightboxPhoto.createdAt).toLocaleString('cs-CZ')}
                      </strong>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>Typ záznamu:</span>
                      <strong className="text-[#FF9F0A] font-semibold">
                        {currentLightboxPhoto.type === 'photo' ? 'Kamera / Fotoaparát' : currentLightboxPhoto.type === 'screenshot' ? 'Printscreen obrazovky PC' : 'Nahraný soubor'}
                      </strong>
                    </div>
                  </div>

                </div>

                {/* Lightbox Footer Actions */}
                <div className="pt-4 border-t border-white/10 flex gap-2">
                  <button
                    onClick={() => handleDownloadPhoto(currentLightboxPhoto)}
                    className="flex-1 py-2.5 bg-[#FF9F0A] hover:bg-[#ffaa2b] text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Stáhnout PNG</span>
                  </button>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
