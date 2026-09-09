import React from 'react';
import { useMusicalContext } from '../../context/MusicalContext';
import { UnifiedTopBar } from './UnifiedTopBar';
import { MainTabType } from './sekce';
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
  /** Běží plocha s okny místo jedné sekce přes celou obrazovku? */
  rezimPlochy?: boolean;
  onPrepnoutPlochu?: () => void;
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
  rezimPlochy = false,
  onPrepnoutPlochu,
}) => {
  return (
    <div className="min-h-screen bg-podklad text-pismo flex flex-col font-sans antialiased overflow-hidden">
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
      <HorniNavigace
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        rezimPlochy={rezimPlochy}
        onPrepnoutPlochu={onPrepnoutPlochu}
      />

      <main className="flex-1 overflow-y-auto bg-transparent flex flex-col">
        {/* Bez bočního panelu má obsah celou šířku. Strop zůstává, aby se
            řádky textu na širokoúhlé obrazovce nerozjely donekonečna. */}
        {/* Na mobilu uzsi odsazeni: vnorene panely uvnitr sekci sezraly
            na 375px pres sto pixelu a na obsah zbylo 267. */}
        {/* Plocha si obrazovku řídí sama — odsazení a strop šířky by jí
            ukrojily místo, kvůli kterému vznikla. */}
        <div className={rezimPlochy ? 'flex-1' : 'flex-1 p-3 sm:p-6 w-full max-w-[1920px] mx-auto'}>
          {children}
        </div>

        {!rezimPlochy && <SmartStudioDock />}
      </main>
    </div>
  );
};
