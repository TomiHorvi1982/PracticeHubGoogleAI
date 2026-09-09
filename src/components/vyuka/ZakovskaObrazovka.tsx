import React from 'react';
import { LogOut, Music4 } from 'lucide-react';
import { MainTabType } from '../layout/sekce';
import { Zak } from '../../services/vyukaService';

/**
 * Obrazovka žáka.
 *
 * Sestavuje se místo studia, ne vedle něj — a v tom je celý smysl.
 * Do sekce se v aplikaci dá dostat sedmi cestami; kdyby se žákovi
 * studio sestavilo a jen se mu schovala navigace, stačilo by na jednu
 * z nich zapomenout a devítileté dítě skončí v mixážním pultu.
 *
 * Sekce navíc si žák neotvírá sám: přijdou v `povoleneSekce` z toho, co
 * mu učitel zaškrtl, a jiné než ty se sem ani nepředají.
 */

interface Props {
  zak: Zak;
  /** Hotové sekce studia, které učitel povolil. Bez povolení prázdné. */
  povoleneSekce: { id: MainTabType; nazev: string; ikona: string; obsah: React.ReactNode }[];
  otevrena: MainTabType | null;
  onOtevrit: (id: MainTabType | null) => void;
  onOdhlasit: () => void;
}

/**
 * Motivy.
 *
 * Barvy a nic víc — pozadí, přízvuk a to je celé. Vybírá si je dítě,
 * ne my podle jména.
 */
const MOTIVY: Record<string, { pozadi: string; prizvuk: string; jmeno: string }> = {
  vesmir: { pozadi: 'linear-gradient(160deg,#150E2E 0%,#2A1247 55%,#3D1740 100%)', prizvuk: '#C4B5FD', jmeno: 'Vesmír' },
  dracek: { pozadi: 'linear-gradient(160deg,#062B22 0%,#0A3F35 55%,#0C4A52 100%)', prizvuk: '#6EE7B7', jmeno: 'Dráček' },
  rocker: { pozadi: 'linear-gradient(160deg,#2B1206 0%,#45180C 55%,#4A1024 100%)', prizvuk: '#FDBA74', jmeno: 'Rocker' },
  studio: { pozadi: 'linear-gradient(160deg,#080F14 0%,#0A131A 55%,#131C24 100%)', prizvuk: '#FFD166', jmeno: 'Studio' },
};

export const ZakovskaObrazovka: React.FC<Props> = ({
  zak, povoleneSekce, otevrena, onOtevrit, onOdhlasit,
}) => {
  const motiv = MOTIVY[zak.motiv] || MOTIVY.vesmir;
  const sekce = povoleneSekce.find((s) => s.id === otevrena);

  return (
    <div className="min-h-screen text-white" style={{ background: motiv.pozadi }}>
      {/* Lišta je záměrně chudá: jméno, případný návrat a odhlášení.
          Nic, co by svádělo k prozkoumávání. */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-white/10">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-black"
          style={{ background: motiv.prizvuk }}
        >
          {zak.prezdivka.slice(0, 1).toUpperCase()}
        </div>
        <div className="leading-tight">
          <p className="font-bold text-lg">Ahoj, {zak.prezdivka}!</p>
          <p className="text-xs text-white/60">{zak.stupen}. stupeň · {motiv.jmeno}</p>
        </div>

        {sekce && (
          <button
            onClick={() => onOtevrit(null)}
            className="ml-auto px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-bold cursor-pointer"
          >
            ← Zpátky
          </button>
        )}
        <button
          onClick={onOdhlasit}
          title="Odhlásit se"
          className={`${sekce ? '' : 'ml-auto'} p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 cursor-pointer`}
          aria-label="Odhlásit se"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {sekce ? (
        // Sekce studia se vykreslí tak, jak je — jen na světlejším
        // podkladu, aby v dětském motivu nezmizela.
        <main className="p-3 sm:p-5">
          <div className="rounded-3xl bg-[#0A131A] border border-white/10 p-3 sm:p-5 overflow-hidden">
            {sekce.obsah}
          </div>
        </main>
      ) : (
        <main className="p-5 sm:p-8 max-w-4xl mx-auto space-y-8">
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Co mám dnes cvičit</h2>
            {/* Úkoly přijdou v další fázi. Do té doby se nepředstírá,
                že tu něco je — prázdné místo s vysvětlením je poctivější
                než falešný seznam. */}
            <div className="rounded-3xl border border-white/15 bg-black/25 p-6 text-center space-y-2">
              <Music4 className="w-8 h-8 mx-auto opacity-50" />
              <p className="text-white/70">
                Zatím tu nic není. Až ti učitel zadá úkol, objeví se přesně tady.
              </p>
            </div>
          </section>

          {povoleneSekce.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-2xl font-bold">Můžeš si otevřít</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {povoleneSekce.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onOtevrit(s.id)}
                    className="rounded-3xl border border-white/15 bg-black/25 hover:bg-black/40 p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors"
                  >
                    <span className="text-3xl">{s.ikona}</span>
                    <span className="font-bold text-sm text-center">{s.nazev}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
};
