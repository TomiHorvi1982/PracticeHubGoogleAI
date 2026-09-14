import React from 'react';
import { GraduationCap, Music } from 'lucide-react';
import { AuthSession } from '../types';
import { LoginModal } from './LoginModal';

/**
 * Co vidí nepřihlášený — a nic víc.
 *
 * Studio se za touhle stránkou nesestavuje, takže se do něj nedá
 * proklikat ani zavřením formuláře. Po přihlášení rozhodne role: žák
 * dostane svou obrazovku se sekcemi, které mu učitel povolil, ostatní
 * studio.
 */

interface Props {
  /** Přišel přes odkaz `/zak` — formulář začne přihlášením žáka. */
  proZaky: boolean;
  onPrihlaseno: (s: AuthSession) => void;
  /** Otevřený odkaz z pozvánky — nejdřív se musí nastavit heslo. */
  forceInviteTab?: boolean;
}

export const VstupniStranka: React.FC<Props> = ({ proZaky, onPrihlaseno, forceInviteTab }) => (
  <main className="min-h-screen flex items-center justify-center p-6">
    <div className="w-full max-w-4xl grid gap-10 md:grid-cols-[1fr_auto] items-center">
      <div className="space-y-4 max-w-[46ch]">
        <div className="flex items-center gap-3 text-znacka">
          {proZaky ? <GraduationCap className="w-7 h-7" /> : <Music className="w-7 h-7" />}
          <span className="font-bold tracking-[0.2em] text-drobne uppercase">Neverlast Studio</span>
        </div>
        <h1 className="text-3xl font-bold text-pismo [text-wrap:balance]">
          {proZaky ? 'Ahoj, jdeme cvičit' : 'Zkušebna kapely a výuka'}
        </h1>
      </div>

      <LoginModal
        isOpen
        vlozene
        vychoziRezim={proZaky ? 'zak' : 'login'}
        forceInviteTab={forceInviteTab}
        onClose={() => { /* vložený formulář se nezavírá */ }}
        onLoginSuccess={onPrihlaseno}
      />
    </div>
  </main>
);
