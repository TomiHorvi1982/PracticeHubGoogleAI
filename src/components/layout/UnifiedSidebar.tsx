import React from 'react';
import { 
  BookOpen, 
  Library, 
  ListMusic, 
  Bookmark, 
  FileCode, 
  Piano, 
  Youtube, 
  Globe, 
  Compass, 
  Clock, 
  Mic, 
  Camera, 
  ChevronLeft, 
  ChevronRight,
  Sliders,
  Disc3,
  PanelLeftClose,
  PanelLeftOpen,
  FolderOpen
} from 'lucide-react';

export type MainTabType =
  | 'songbook'
  | 'playlist'
  | 'bookmarks'
  | 'alphatab'
  | 'instruments'
  | 'youtube'
  | 'mediacenter'
  | 'stemmixer'
  | 'freetar'
  | 'scales'
  | 'practice'
  | 'tuner'
  | 'library';

interface UnifiedSidebarProps {
  activeTab: MainTabType;
  onSelectTab: (tab: MainTabType) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  songsCount?: number;
  bookmarksCount?: number;
}

export const UnifiedSidebar: React.FC<UnifiedSidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  songsCount = 0,
  bookmarksCount = 0,
}) => {
  const sections = [
    {
      title: 'SONG CENTER',
      items: [
        { id: 'songbook', label: 'Zpěvník', icon: BookOpen, badge: null },
        { id: 'library', label: 'Knihovna', icon: FolderOpen, badge: null },
        { id: 'playlist', label: 'Setlisty', icon: ListMusic, badge: null },
        { id: 'bookmarks', label: 'Oblíbené', icon: Bookmark, badge: bookmarksCount > 0 ? bookmarksCount : null },
      ],
    },
    {
      title: 'STUDIO & STUDIO JAM',
      items: [
        { id: 'mediacenter', label: 'Media Center', icon: Disc3, badge: 'KASET' },
        { id: 'alphatab', label: 'Guitar Pro', icon: FileCode, badge: 'TAB' },
        { id: 'instruments', label: 'Virtual Instruments', icon: Piano, badge: null },
        { id: 'youtube', label: 'YouTube Jam', icon: Youtube, badge: null },
        { id: 'stemmixer', label: 'AI Stem Mixážní Pult', icon: Sliders, badge: 'AI' },
        { id: 'freetar', label: 'Freetar.de', icon: Globe, badge: null },
      ],
    },
    {
      title: 'TEORIE & TRÉNINK',
      items: [
        { id: 'scales', label: 'Stupnice & Akordy', icon: Compass, badge: null },
        { id: 'practice', label: 'Metronom & Cvičení', icon: Clock, badge: null },
        { id: 'tuner', label: 'Ladička', icon: Mic, badge: null },
      ],
    },
    {
      title: 'KAPELA',
      items: [
      ],
    },
  ];

  return (
    <aside
      className={`bg-[#0F172A] border-r border-slate-800/80 flex flex-col justify-between transition-all duration-300 z-20 shrink-0 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Top Header & Collapse Action Bar */}
      <div className={`p-2 border-b border-slate-800/60 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isCollapsed ? (
          <div className="flex items-center justify-between w-full px-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400/90">
              SONG CENTRE
            </span>
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
              title="Sbalit navigaci"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
            title="Rozbalit navigaci"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Content */}
      <div className="py-2 px-2 overflow-y-auto space-y-5 flex-1">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {!isCollapsed && (
              <h3 className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id as MainTabType)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                  {!isCollapsed && (
                    <span className="truncate flex-1 text-left">{item.label}</span>
                  )}
                  {!isCollapsed && item.badge !== null && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                        isActive
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Collapse/Expand Toggle Footer */}
      <div className="p-2 border-t border-slate-800/80 flex justify-end">
        <button
          onClick={onToggleCollapse}
          className="w-full py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-xs font-semibold"
          title={isCollapsed ? 'Rozbalit panel' : 'Sbalit panel'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!isCollapsed && <span className="ml-2">Sbalit navigaci</span>}
        </button>
      </div>
    </aside>
  );
};
