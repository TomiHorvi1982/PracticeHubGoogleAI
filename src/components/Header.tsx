import React from 'react';
import { TabType, BandSession } from '../types';
import { Music, Mic, Grid, Play, Dumbbell, QrCode, Camera, Users, Youtube } from 'lucide-react';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  session: BandSession | null;
  onOpenSessionModal: () => void;
  onOpenCameraModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  session,
  onOpenSessionModal,
  onOpenCameraModal,
}) => {
  const tabs: { id: TabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'songbook', label: 'ZPĚVNÍK', icon: Music },
    { id: 'youtube', label: 'YOUTUBE', icon: Youtube },
    { id: 'tuner', label: 'LADIČKA', icon: Mic },
    { id: 'scales', label: 'STUPNICE', icon: Grid },
    { id: 'instruments', label: 'NÁSTROJE', icon: Play },
    { id: 'practice', label: 'TRÉNINK', icon: Dumbbell },
  ];

  return (
    <header className="bg-[#0F0F0F] border-b-2 border-[#1A1A1A] text-[#D1D1D1] sticky top-0 z-40 font-mono select-none">
      <div className="max-w-[1400px] mx-auto px-4">
        <div className="flex items-center justify-between h-14 gap-2 sm:gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="bg-[#FF3E00] text-black font-black px-2 py-0.5 text-[11px] tracking-wider uppercase font-mono border border-black shadow-[2px_2px_0px_#000]">
              LIVE_OS
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tighter text-white uppercase flex items-center gap-2">
                <span>STRUM_OS</span>
                <span className="text-[#00FF41] text-xs font-normal hidden lg:inline">// v2.6 PORTÁL</span>
              </h1>
            </div>
          </div>

          {/* Navigation Tabs (Desktop) */}
          <nav className="hidden md:flex items-center gap-1 bg-[#050505] p-1 border border-[#222]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold tracking-tight uppercase transition-none ${
                    isActive
                      ? 'bg-[#D1D1D1] text-black shadow-none border border-white'
                      : 'text-[#888] hover:text-white hover:bg-[#1A1A1A] border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : 'text-[#FF3E00]'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Actions & Band Room Badge */}
          <div className="flex items-center gap-2">
            
            {/* Instant Camera Capture Button */}
            <button
              onClick={onOpenCameraModal}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#141414] hover:bg-[#1F1F1F] text-[#D1D1D1] border border-[#333] text-xs font-bold transition-none"
              title="Vyfotit akordy nebo zpěvník"
            >
              <Camera className="w-3.5 h-3.5 text-[#FF3E00]" />
              <span className="hidden sm:inline text-[11px] uppercase">SKEN_FOTO</span>
            </button>

            {/* Band Session Button / Badge */}
            <button
              onClick={onOpenSessionModal}
              className={`flex items-center gap-2 px-3 py-1 border text-xs font-bold transition-none ${
                session
                  ? 'bg-[#0F1E13] border-[#00FF41] text-[#00FF41]'
                  : 'bg-[#141414] border-[#333] text-[#D1D1D1] hover:border-[#FF3E00]'
              }`}
            >
              <span className="w-2 h-2 bg-[#00FF41] rounded-full animate-pulse"></span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] uppercase">
                  {session ? `POKOJ: ${session.roomId}` : 'ZKUŠEBNA_QR'}
                </span>
                {session && (
                  <span className="flex items-center gap-0.5 bg-[#00FF41] text-black text-[10px] px-1 py-0 font-extrabold">
                    <Users className="w-3 h-3" />
                    {session.members.length}
                  </span>
                )}
              </div>
            </button>

          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden overflow-x-auto py-1.5 gap-1 border-t border-[#1A1A1A] scrollbar-none bg-[#050505]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase whitespace-nowrap transition-none border ${
                  isActive
                    ? 'bg-[#D1D1D1] text-black border-white'
                    : 'bg-[#141414] text-[#888] border-[#222]'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};
