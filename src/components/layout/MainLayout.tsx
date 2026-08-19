import React, { useState } from 'react';
import { useMusicalContext } from '../../context/MusicalContext';
import { UnifiedTopBar } from './UnifiedTopBar';
import { UnifiedSidebar, MainTabType } from './UnifiedSidebar';
import { SmartStudioDock } from './SmartStudioDock';
import { GigModeView } from './GigModeView';
import { BandSession } from '../../types';

interface MainLayoutProps {
  children: React.ReactNode;
  activeTab: MainTabType;
  onSelectTab: (tab: MainTabType) => void;
  session: BandSession | null;
  onOpenSessionModal: () => void;
  onOpenLoginModal: () => void;
  onOpenProfileModal: () => void;
  onOpenAdminModal: () => void;
  currentUser: any;
  userRole: string;
  songsCount?: number;
  bookmarksCount?: number;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  activeTab,
  onSelectTab,
  session,
  onOpenSessionModal,
  onOpenLoginModal,
  onOpenProfileModal,
  onOpenAdminModal,
  currentUser,
  userRole,
  songsCount = 0,
  bookmarksCount = 0,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const { isGigMode, setIsGigMode } = useMusicalContext();

  if (isGigMode) {
    return <GigModeView onExitGigMode={() => setIsGigMode(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col font-sans antialiased overflow-hidden">
      {/* Top Header Navigation Bar */}
      <UnifiedTopBar
        session={session}
        onOpenSessionModal={onOpenSessionModal}
        onOpenLoginModal={onOpenLoginModal}
        onOpenProfileModal={onOpenProfileModal}
        onOpenAdminModal={onOpenAdminModal}
        currentUser={currentUser}
        userRole={userRole}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Workspace Area (Sidebar + Stage Content) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Unified Left Sidebar */}
        <UnifiedSidebar
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          songsCount={songsCount}
          bookmarksCount={bookmarksCount}
        />

        {/* Central Stage Workspace Area */}
        <main className="flex-1 overflow-y-auto bg-[#0B1120] flex flex-col">
          <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-[1920px] mx-auto">
            {children}
          </div>

          {/* Bottom Collapsible Smart Studio Dock */}
          <SmartStudioDock />
        </main>
      </div>
    </div>
  );
};
