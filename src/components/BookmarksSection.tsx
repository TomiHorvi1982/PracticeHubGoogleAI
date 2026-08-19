import React, { useState, useEffect } from 'react';
import { 
  Bookmark, Plus, Trash2, ExternalLink, Globe, Tag, Sparkles, 
  HelpCircle, Check, AlertCircle, BookOpen, Music, Play, Dumbbell 
} from 'lucide-react';

interface BookmarkedSite {
  id: string;
  title: string;
  url: string;
  description: string;
  category: 'tabs' | 'practice' | 'theory' | 'tools' | 'custom';
  isDefault?: boolean;
}

const DEFAULT_BOOKMARKS: BookmarkedSite[] = [
  {
    id: 'b_freetar',
    title: 'Freetar.de',
    url: 'https://freetar.de',
    description: 'Alternativní minimalistický vyhledávač akordů a textů bez otravných reklam.',
    category: 'tabs',
    isDefault: true
  },
  {
    id: 'b_songsterr',
    title: 'Songsterr Tabs',
    url: 'https://www.songsterr.com',
    description: 'Největší online knihovna interaktivních kytarových tabulatur se zvukovým přehrávačem.',
    category: 'tabs',
    isDefault: true
  },
  {
    id: 'b_ultimate_guitar',
    title: 'Ultimate Guitar',
    url: 'https://www.ultimate-guitar.com',
    description: 'Tradiční a nejrozsáhlejší celosvětová databáze kytarových akordů, tabů a ladiček.',
    category: 'tabs',
    isDefault: true
  },
  {
    id: 'b_justinguitar',
    title: 'JustinGuitar',
    url: 'https://www.justinguitar.com',
    description: 'Uznávaný portál s bezplatnými video kurzy a metodikou výuky kytary od úplných začátků.',
    category: 'practice',
    isDefault: true
  },
  {
    id: 'b_chordify',
    title: 'Chordify',
    url: 'https://chordify.net',
    description: 'Nástroj, který automaticky detekuje akordy z libovolného YouTube videa nebo audio souboru.',
    category: 'tools',
    isDefault: true
  },
  {
    id: 'b_musictheory',
    title: 'MusicTheory.net',
    url: 'https://www.musictheory.net',
    description: 'Přehledné interaktivní cvičení pro trénink sluchu, čtení not a pochopení hudební teorie.',
    category: 'theory',
    isDefault: true
  },
  {
    id: 'b_drumbit',
    title: 'drumbit - Online Drum Machine',
    url: 'https://drumbit.app',
    description: 'Vynikající jednoduchý bicí automat v prohlížeči pro cvičení rytmu a groovů.',
    category: 'tools',
    isDefault: true
  }
];

export const BookmarksSection: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<BookmarkedSite[]>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('guitar_bookmarks_db');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return DEFAULT_BOOKMARKS;
        }
      }
    }
    return DEFAULT_BOOKMARKS;
  });

  // Filter category
  const [activeFilter, setActiveFilter] = useState<'all' | 'tabs' | 'practice' | 'theory' | 'tools' | 'custom'>('all');

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<'tabs' | 'practice' | 'theory' | 'tools' | 'custom'>('custom');

  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Sync to localStorage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('guitar_bookmarks_db', JSON.stringify(bookmarks));
    }
  }, [bookmarks]);

  const handleAddBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);

    if (!newTitle.trim() || !newUrl.trim()) {
      setFormError('Název a URL adresa jsou povinné údaje.');
      return;
    }

    let cleanUrl = newUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    try {
      new URL(cleanUrl); // Validate URL structure
    } catch {
      setFormError('Zadejte prosím platný formát URL adresy (např. www.stranka.cz).');
      return;
    }

    const item: BookmarkedSite = {
      id: 'custom_b_' + Date.now(),
      title: newTitle.trim(),
      url: cleanUrl,
      description: newDesc.trim() || 'Vlastní užitečný odkaz uložený uživatelem.',
      category: newCategory,
    };

    setBookmarks(prev => [item, ...prev]);
    setNewTitle('');
    setNewUrl('');
    setNewDesc('');
    setNewCategory('custom');
    setFormSuccess(true);

    setTimeout(() => setFormSuccess(false), 3000);
  };

  const handleDeleteBookmark = (id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'tabs': return 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30';
      case 'practice': return 'bg-[#30D158]/15 text-[#30D158] border-[#30D158]/30';
      case 'theory': return 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30';
      case 'tools': return 'bg-[#FF453A]/15 text-[#FF453A] border-[#FF453A]/30';
      default: return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'tabs': return 'Akordy & Taby';
      case 'practice': return 'Cvičení / Škola';
      case 'theory': return 'Teorie / Sluch';
      case 'tools': return 'Pomůcky / Metronom';
      default: return 'Vlastní záložka';
    }
  };

  const filteredBookmarks = activeFilter === 'all' 
    ? bookmarks 
    : bookmarks.filter(b => b.category === activeFilter);

  return (
    <div className="space-y-4 font-sans text-white pb-12">
      {/* Welcome Banner */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl">
            <Bookmark className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="bg-[#FF9F0A] text-black font-bold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
                Záložky
              </span>
              <span className="text-xs text-neutral-400 font-medium">
                {bookmarks.length} uložených portálů
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Rozcestník Odkazů a Kytarových Webů
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Ukládejte si užitečné portály, kurzy, sluchové trenažéry a weby s taby. Vše na jednom místě.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        
        {/* Left column: Add Form & Quick Filters */}
        <div className="space-y-4 xl:col-span-1">
          
          {/* Quick Filters */}
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 space-y-1.5 shadow-lg">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2 px-1">
              Kategorie záložek:
            </span>
            
            <button
              onClick={() => setActiveFilter('all')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white text-black shadow-md font-bold'
                  : 'bg-black/30 text-neutral-300 hover:bg-white/5 border border-white/5'
              }`}
            >
              <span>Všechny záložky</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-black/20">{bookmarks.length}</span>
            </button>

            {(['tabs', 'practice', 'theory', 'tools', 'custom'] as const).map(cat => {
              const count = bookmarks.filter(b => b.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                    activeFilter === cat
                      ? 'bg-white text-black shadow-md font-bold'
                      : 'bg-black/30 text-neutral-300 hover:bg-white/5 border border-white/5'
                  }`}
                >
                  <span>{getCategoryLabel(cat)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-black/20">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Add Bookmark Form */}
          <form onSubmit={handleAddBookmark} className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 space-y-3.5 shadow-lg">
            <div className="border-b border-white/5 pb-2.5">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#30D158]" />
                Přidat novou záložku
              </h3>
            </div>

            {formSuccess && (
              <div className="bg-[#30D158]/10 border border-[#30D158]/30 text-[#30D158] p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>Záložka byla úspěšně přidána!</span>
              </div>
            )}

            {formError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs text-neutral-400 font-medium">Název stránky *</label>
              <input 
                type="text" 
                placeholder="Např. Kytary.cz Magazín"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs font-medium text-white placeholder-neutral-500 focus:border-[#30D158] outline-none transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-neutral-400 font-medium">URL adresa *</label>
              <input 
                type="text" 
                placeholder="www.priklad.cz/kurz"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs font-medium text-white placeholder-neutral-500 focus:border-[#30D158] outline-none transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-neutral-400 font-medium">Popis / Poznámka</label>
              <textarea 
                placeholder="Vlastní poznámka, k čemu web slouží..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-neutral-500 focus:border-[#30D158] outline-none resize-none transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-neutral-400 font-medium">Kategorie</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:border-[#30D158] outline-none font-medium cursor-pointer"
              >
                <option value="tabs" className="bg-[#16161A] text-white">Akordy &amp; Taby</option>
                <option value="practice" className="bg-[#16161A] text-white">Cvičení / Škola</option>
                <option value="theory" className="bg-[#16161A] text-white">Teorie / Sluch</option>
                <option value="tools" className="bg-[#16161A] text-white">Pomůcky / Metronom</option>
                <option value="custom" className="bg-[#16161A] text-white">Ostatní / Vlastní</option>
              </select>
            </div>

            <button 
              type="submit"
              className="w-full py-2.5 bg-[#30D158] hover:bg-[#34e260] text-black text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Uložit do záložek
            </button>
          </form>

        </div>

        {/* Right column: Bookmarks Grid */}
        <div className="xl:col-span-3 space-y-3">
          
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-semibold text-neutral-400">
              Celkem {filteredBookmarks.length} záložek v této kategorii
            </span>
            <span className="text-[11px] text-neutral-400">
              Odkazy se otevírají v novém okně
            </span>
          </div>

          {filteredBookmarks.length === 0 ? (
            <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-16 text-center text-xs space-y-3 shadow-xl">
              <div className="flex justify-center">
                <div className="p-4 bg-white/5 rounded-3xl border border-white/10 text-neutral-500">
                  <Globe className="w-10 h-10" />
                </div>
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <p className="font-bold text-white text-base">V této kategorii zatím nejsou žádné záložky</p>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Použijte levý panel k přidání nového odkazu nebo kurzu, který při kytarovém tréninku často navštěvujete.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredBookmarks.map((bookmark) => (
                <div 
                  key={bookmark.id}
                  className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] hover:border-white/20 p-4 rounded-2xl flex flex-col justify-between gap-3 shadow-lg hover:shadow-xl transition-all group"
                >
                  <div className="space-y-2">
                    {/* Header: Title + tag */}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-white tracking-tight break-words line-clamp-1 flex items-center gap-2 group-hover:text-[#0A84FF] transition-colors">
                        <Bookmark className="w-4 h-4 text-[#FF9F0A] shrink-0" />
                        {bookmark.title}
                      </h4>
                      
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border shrink-0 ${getCategoryColor(bookmark.category)}`}>
                        {getCategoryLabel(bookmark.category)}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">
                      {bookmark.description}
                    </p>
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                    <span className="text-[11px] text-neutral-400 truncate max-w-[180px]">
                      {bookmark.url}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Delete custom ones */}
                      {!bookmark.isDefault && (
                        <button
                          onClick={() => handleDeleteBookmark(bookmark.id)}
                          className="p-2 bg-white/5 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-xl transition-all cursor-pointer"
                          title="Smazat záložku"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <a
                        href={bookmark.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 bg-[#0A84FF]/10 hover:bg-[#0A84FF] text-[#0A84FF] hover:text-white border border-[#0A84FF]/30 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      >
                        <span>Otevřít</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
