import React from 'react';
import { useMusicalContext } from '../../context/MusicalContext';
import { UnifiedTopBar } from './UnifiedTopBar';
import { MainTabType } from './UnifiedSidebar';
import { HorniNavigace } from './HorniNavigace';
import { SmartStudioDock } from './SmartStudioDock';

interface MainLayoutProps {
  children: React.ReactNode;
  activeTab: MainTabType;
  onSelectTab: (tab: MainTabType) => void;
  onOpenLoginModal: () => void;
  onOpenProfileModal: () => void;
  onOpenAdminModal: () => void;
  currentUser: any;
  userRole: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  activeTab,
  onSelectTab,
  onOpenLoginModal,
  onOpenProfileModal,
  onOpenAdminModal,
  currentUser,
  userRole,
}) => {
  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col font-sans antialiased overflow-hidden">
      {/* Vrchní lišta: stav skladby a přehrávání */}
      <UnifiedTopBar
        onOpenLoginModal={onOpenLoginModal}
        onOpenProfileModal={onOpenProfileModal}
        onOpenAdminModal={onOpenAdminModal}
        currentUser={currentUser}
        userRole={userRole}
      />

      {/* Nástroje. Bývaly v bočním panelu, který ukrajoval pruh obrazovky
          i tam, kde je plocha to hlavní. */}
      <HorniNavigace activeTab={activeTab} onSelectTab={onSelectTab} />

      <main className="flex-1 overflow-y-auto bg-[#0B1120] flex flex-col">
        {/* Bez bočního panelu má obsah celou šířku. Strop zůstává, aby se
            řádky textu na širokoúhlé obrazovce nerozjely donekonečna. */}
        <div className="flex-1 p-4 sm:p-6 w-full max-w-[1920px] mx-auto">
          {children}
        </div>

        <SmartStudioDock />
      </main>
    </div>
  );
};
