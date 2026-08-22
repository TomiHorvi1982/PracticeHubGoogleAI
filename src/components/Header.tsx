import React from 'react';
import { TabType, UserAccount, BandOnlineUser, SharedPlaybackState } from '../types';
import { ROLE_LABELS } from '../services/authService';
import {
  Music, Mic, Grid, Play, Dumbbell, Camera, Users, Youtube, Globe,
  FileText, Bookmark, FolderArchive, Shield, User, LogIn, ListMusic, Radio,
  Monitor
} from 'lucide-react';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  currentUser: UserAccount | null;
  onlineUsers: BandOnlineUser[];
  playbackState?: SharedPlaybackState;
  onOpenOnlineMembersModal: () => void;
  onOpenCaptureModal: (mode?: 'camera' | 'screenshot' | 'upload') => void;
  onOpenLoginModal: () => void;
  onOpenAdminModal: () => void;
  onOpenProfileModal: () => void;
  onOpenQuickPiano?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onlineUsers,
  playbackState,
  onOpenOnlineMembersModal,
  onOpenCaptureModal,
  onOpenLoginModal,
  onOpenAdminModal,
  onOpenProfileModal,
  onOpenQuickPiano,
}) => {
  const tabs: { id: TabType; label: string; icon: React.FC<{ className?: string }>; badge?: string }[] = [
    { id: 'songbook', label: 'Zpěvník', icon: Music },
    { id: 'playlist', label: 'Playlist', icon: ListMusic, badge: playbackState?.isPlaying ? 'Hraje' : undefined },
    { id: 'library', label: 'Knihovna', icon: FolderArchive },
    { id: 'alphatab', label: 'Guitar Pro', icon: FileText },
    { id: 'freetar', label: 'Freetar.de', icon: Globe },
    { id: 'youtube', label: 'YouTube', icon: Youtube },
    { id: 'bookmarks', label: 'Záložky', icon: Bookmark },
    { id: 'tuner', label: 'Ladička', icon: Mic },
    { id: 'scales', label: 'Stupnice', icon: Grid },
    { id: 'instruments', label: 'Nástroje', icon: Play },
    { id: 'practice', label: 'Trénink', icon: Dumbbell },
  ];

  const roleMeta = currentUser ? ROLE_LABELS[currentUser.role] : null;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.permissions?.canManageUsers;

  return (
    <header className="bg-[#121216]/90 backdrop-blur-2xl border-b border-white/[0.08] text-[#E5E5EA] sticky top-0 z-40 select-none shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
      <div className="w-full px-3 sm:px-5">
        <div className="flex items-center justify-between h-14 gap-2 sm:gap-4">
          
          {/* Logo & Brand: NeverLate Studio */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF453A] via-[#FF9F0A] to-[#FF375F] p-[1px] shadow-lg shadow-orange-500/20">
              <div className="w-full h-full bg-[#1C1C1E] rounded-[11px] flex items-center justify-center">
                <Radio className="w-4 h-4 text-[#FF9F0A] animate-pulse" />
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] sm:text-[16px] font-bold tracking-tight text-white font-sans flex items-center">
                  NeverLate<span className="text-[#FF9F0A] ml-0.5">Studio</span>
                </span>
                <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 bg-white/10 text-white/80 rounded-md border border-white/10 hidden sm:inline">
                  PRO
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Desktop Apple Segmented Pill Style) */}
          <nav className="hidden lg:flex items-center gap-1 bg-[#1C1C1E]/80 p-1 rounded-2xl border border-white/[0.07] backdrop-blur-md shadow-inner">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium tracking-tight transition-all duration-150 relative cursor-pointer ${
                    isActive
                      ? 'bg-white/15 text-white shadow-sm font-semibold border border-white/10'
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.06] border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#FF9F0A]' : 'text-neutral-400'}`} />
                  <span>{tab.label}</span>
                  {tab.id === 'playlist' && playbackState?.isPlaying && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-ping ml-0.5"></span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Actions & User Bar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Real-time Band Presence Button */}
            <button
              onClick={onOpenOnlineMembersModal}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#30D158]/10 hover:bg-[#30D158]/20 border border-[#30D158]/30 rounded-xl text-[#30D158] text-xs font-medium transition-colors cursor-pointer shadow-sm"
              title="Zobrazit připojené členy kapely v reálném čase"
            >
              <span className="w-2 h-2 bg-[#30D158] rounded-full animate-pulse shadow-[0_0_8px_#30D158]"></span>
              <span className="text-[11px] font-semibold">
                Online ({onlineUsers.length})
              </span>
            </button>

            {/* Admin Management Button */}
            {isAdmin && (
              <button
                onClick={onOpenAdminModal}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#FF9F0A]/10 hover:bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/30 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                title="Správa uživatelů, rolí a pozvánek"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px] font-semibold">Uživatelé</span>
              </button>
            )}

            {/* Quick Piano Helper Button */}
            {onOpenQuickPiano && (
              <button
                onClick={onOpenQuickPiano}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#FF9F0A]/10 hover:bg-[#FF9F0A]/20 text-[#FF9F0A] hover:text-[#FFB340] border border-[#FF9F0A]/30 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
                title="Otevřít rychlou klavírní pomůcku a přehrávač tónů"
              >
                <Music className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold">Klavír</span>
              </button>
            )}

            {/* Quick Vyfotit & Printscreen Buttons */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={() => onOpenCaptureModal('camera')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white border border-white/[0.08] rounded-xl text-xs font-medium transition-all cursor-pointer"
                title="Vyfotit snímek webkamerou nebo fotoaparátem"
              >
                <Camera className="w-3.5 h-3.5 text-[#FF9F0A]" />
                <span className="hidden md:inline text-[11px]">Vyfotit</span>
              </button>

              <button
                onClick={() => onOpenCaptureModal('screenshot')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white border border-white/[0.08] rounded-xl text-xs font-medium transition-all cursor-pointer"
                title="Pořídit printscreen plochy nebo okna z PC"
              >
                <Monitor className="w-3.5 h-3.5 text-[#0A84FF]" />
                <span className="hidden md:inline text-[11px]">Printscreen</span>
              </button>
            </div>

            {/* User Account / Login Button */}
            {currentUser ? (
              <button
                onClick={onOpenProfileModal}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.09] rounded-xl text-xs transition-all cursor-pointer"
                title={`Přihlášen jako: ${currentUser.displayName} (${roleMeta?.label})`}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white text-[10px] shadow-sm"
                  style={{ backgroundColor: currentUser.avatarColor || roleMeta?.color || '#FF9F0A' }}
                >
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-medium text-xs hidden sm:inline max-w-[100px] truncate">
                    {currentUser.displayName}
                  </span>
                  {roleMeta && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-white/10 text-neutral-300">
                      {roleMeta.label}
                    </span>
                  )}
                </div>
              </button>
            ) : (
              <button
                onClick={onOpenLoginModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#FF9F0A] to-[#FF453A] hover:brightness-110 text-black font-semibold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Přihlásit</span>
              </button>
            )}

          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex lg:hidden overflow-x-auto py-2 gap-1.5 border-t border-white/[0.06] scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-xl transition-all border ${
                  isActive
                    ? 'bg-white/20 text-white border-white/20 font-semibold'
                    : 'bg-white/[0.04] text-neutral-400 border-white/[0.04]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.id === 'playlist' && playbackState?.isPlaying && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]"></span>
                )}
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};


