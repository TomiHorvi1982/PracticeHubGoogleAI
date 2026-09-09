import React, { useEffect, useState } from 'react';
import { useMusicalContext } from '../../context/MusicalContext';
import { audioBus, CoHraje } from '../../services/audioBus';
import { posunDoToniny } from '../../services/akordy';
import { MikrofonTlacitko } from '../hlas/MikrofonTlacitko';
import { ZivaKytara } from './ZivaKytara';
import { zaregistruj } from '../../services/hlas/vykonavac';
import { toninaZReci } from '../../services/tonina';
import { 
  Play, 
  Pause, 
  Clock, 
  Music2, 
  Sliders, 
  Mic, 
  Radio, 
  User, 
  ShieldCheck, 
  Volume2, 
  VolumeX,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Square,
  AudioLines
} from 'lucide-react';

interface UnifiedTopBarProps {
  onOpenLoginModal: () => void;
  onOpenProfileModal: () => void;
  onOpenAdminModal: () => void;
  currentUser: any;
  userRole: string;
}

export const UnifiedTopBar: React.FC<UnifiedTopBarProps> = ({
  onOpenLoginModal,
  onOpenProfileModal,
  onOpenAdminModal,
  currentUser,
  userRole,
}) => {
  const {
    activeSong,
    bpm,
    setBpm,
    key,
    setKey,
    tuning,
    setTuning,
    transposeSemitones,
    setTransposeSemitones,
    isMetronomeActive,
    toggleMetronome,
    setCapo,
  } = useMusicalContext();

  /**
   * Metronom obsluhuje horní lišta.
   *
   * Hlasový příkaz nemá k hudebnímu kontextu přístup a mít ho nemá —
   * ví jen jméno akce. Registruje se tady, kde tempo i spínač doopravdy
   * jsou; dokud tahle lišta stojí, katalog ty akce hlásí jako zapojené.
   */
  useEffect(() => {
    const vMezich = (t: number) => Math.max(20, Math.min(300, Math.round(t)));

    const odeber = [
      zaregistruj('metronom.tempo', ({ bpm: nove }) => setBpm(vMezich(Number(nove)))),
      zaregistruj('metronom.zapni', () => { if (!isMetronomeActive) toggleMetronome(); }),
      zaregistruj('metronom.vypni', () => { if (isMetronomeActive) toggleMetronome(); }),
      zaregistruj('metronom.rychleji', ({ o }) => setBpm(vMezich(bpm + Number(o || 5)))),
      zaregistruj('metronom.pomaleji', ({ o }) => setBpm(vMezich(bpm - Number(o || 5)))),

      /**
       * Tónina se z řeči překládá zvlášť.
       *
       * České názvosloví se u dvou tónů rozchází s anglickým a
       * nastavit tóninu o půltón vedle je chyba, kterou nikdo nespojí
       * s hlasovým ovládáním.
       */
      zaregistruj('hudba.tonina', ({ tonina }) => {
        const nova = toninaZReci(String(tonina || ''));
        if (nova) setKey(nova);
      }),
      zaregistruj('hudba.transpozice', ({ pultonu }) => {
        const p = Number(pultonu);
        if (Number.isFinite(p)) setTransposeSemitones(Math.max(-12, Math.min(12, Math.round(p))));
      }),
      zaregistruj('hudba.kapodastr', ({ prazec }) => {
        const p = Number(prazec);
        if (Number.isFinite(p)) setCapo(Math.max(0, Math.min(12, Math.round(p))));
      }),
    ];
    return () => odeber.forEach((f) => f());
  }, [setBpm, bpm, isMetronomeActive, toggleMetronome, setKey, setTransposeSemitones, setCapo]);

  /**
   * Co zrovna hraje.
   *
   * Zvuk umí spustit sedm různých míst — spodní přehrávač, Media Center,
   * bicí, ukázky v knihovně i u výsledků hledání. Když se z reproduktoru
   * ozve skladba, člověk pak obchází sekce a hledá, které okno ji pustilo.
   * Vrchní lišta je jediné místo vidět odevšad, tak to říká rovnou —
   * i s tlačítkem, kterým to jde utnout.
   */
  const [hraje, setHraje] = useState<CoHraje | null>(null);
  useEffect(() => audioBus.subscribe(setHraje), []);

  const keysList = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm'];

  /**
   * Přepne píseň do zvolené tóniny.
   *
   * Dřív tenhle výběr jen přepsal štítek a nic se nestalo — kdo chtěl
   * hrát v jiné tónině, musel si posun spočítat z hlavy a naklikat ho na
   * plus a minus vedle. Teď se posun dopočítá z tóniny písně.
   */
  const zahrajV = (cil: string) => {
    setKey(cil);
    const posun = activeSong?.key ? posunDoToniny(activeSong.key, cil) : null;
    if (posun !== null) setTransposeSemitones(posun);
  };
  const tuningsList = ['E Standard', 'Drop D', 'D Standard', 'Drop C', 'Half Step Down', 'Open G', 'Open D'];

  return (
    <header className="h-16 bg-plocha-1/80 backdrop-blur-xl border-b border-kresba px-3 sm:px-4 flex items-center justify-between text-pismo select-none z-30 shrink-0 gap-2">
      {/* LEFT SECTION: Logo & Active Song Badge */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-panel zlata-plocha flex items-center justify-center pismo-znacky text-base shadow-znacka">
            NL
          </div>
          <div className="hidden sm:block leading-none">
            {/* Logo je značka, ne nadpis stránky. Jako `h1` soupeřilo
                s nadpisem sekce — stránka měla dva a čtečka i vyhledávač
                pak nevědí, o čem ta stránka je.

                Pod jménem stojí, z čeho vzniklo: Neverlast je zkratka
                Never Late Studio a bez toho řádku to nikdo neuhodne. */}
            <span className="pismo-znacky text-sm text-pismo block">NEVERLAST</span>
            <span className="podpis-znacky block mt-0.5">Never Late Studio</span>
          </div>
        </div>

        {/* Active Song Context Pill */}
        <div className="hidden md:flex items-center gap-2 bg-plocha-1/90 border border-kresba px-3 py-1.5 rounded-xl max-w-[260px]">
          <Music2 className="w-4 h-4 text-znacka shrink-0" />
          <div className="truncate text-xs">
            {activeSong ? (
              <span className="font-semibold text-pismo">{activeSong.title}</span>
            ) : (
              <span className="text-pismo-tlum italic">Free Jam Mode (Bez skladby)</span>
            )}
            {activeSong && <span className="text-pismo-tlum text-drobne block truncate">{activeSong.artist}</span>}
          </div>
        </div>

        {/* Právě hraje — vedle skladby, kterou zrovna trénujeme. */}
        {hraje && (
          <div className="hidden sm:flex items-center gap-2 bg-uspech/10 border border-uspech/30 px-2.5 py-1.5 rounded-xl max-w-[200px] lg:max-w-[260px]">
            <AudioLines className="w-4 h-4 text-uspech shrink-0 animate-pulse" />
            <div className="truncate text-xs min-w-0">
              <span className="font-semibold text-emerald-100 block truncate">
                {hraje.nazev || 'Přehrávání'}
              </span>
              <span className="text-uspech/70 text-stitek block truncate">{hraje.zdroj}</span>
            </div>
            <button
              onClick={() => audioBus.stopAll()}
              className="p-1 rounded-lg hover:bg-uspech/20 text-uspech hover:text-emerald-200 cursor-pointer shrink-0 transition-all"
              title="Zastavit přehrávání"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          </div>
        )}
      </div>

      {/* CENTER SECTION: Global Musical Controls (BPM, Key, Tuning, Transport) */}
      <div className="flex items-center gap-1 sm:gap-2 p-1 sm:p-1.5 bg-plocha-1/80 rounded-2xl border border-kresba/80 shadow-inner min-w-0">
        {/* BPM Control */}
        <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 bg-podklad/60 rounded-xl border border-kresba">
          <Clock className="w-3.5 h-3.5 text-znacka" />
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="bez-sipek w-11 text-center bg-transparent text-sm font-bold text-pismo focus:outline-none"
            min={30}
            max={300}
          />
          <span className="hidden sm:inline stitek-pole">BPM</span>
          {/* Šipky mají 15×14px, což se na dotyk netrefí — a na úzkém okně
              navíc vytlačovaly profil uživatele mimo obrazovku. Číslo se
              dá přepsat přímo, takže se tu nic neztrácí. */}
          <div className="hidden sm:flex flex-col -space-y-1 ml-0.5">
            <button
              onClick={() => setBpm(bpm + 1)}
              className="text-stitek text-pismo-tlum hover:text-white px-1 font-bold"
            >
              ▲
            </button>
            <button
              onClick={() => setBpm(bpm - 1)}
              className="text-stitek text-pismo-tlum hover:text-white px-1 font-bold"
            >
              ▼
            </button>
          </div>
        </div>

        {/* Metronome Toggle */}
        <button
          onClick={toggleMetronome}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
            isMetronomeActive
              ? 'zlata-plocha shadow-md shadow-znacka/20'
              : 'bg-plocha-2/80 hover:bg-plocha-3 text-pismo'
          }`}
          title="Metronom"
        >
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          <span className="hidden sm:inline">Metronom</span>
        </button>

        {/* Key & Transpose Control */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-podklad/60 rounded-xl border border-kresba">
          <span className="stitek-pole">Tónina</span>
          <select
            value={key}
            onChange={(e) => zahrajV(e.target.value)}
            className="bg-transparent text-xs font-bold text-znacka focus:outline-none cursor-pointer"
            title={
              activeSong?.key
                ? `Píseň je v ${activeSong.key}. Výběrem jiné tóniny se přepíšou akordy.`
                : 'U písně není známá tónina, takže není z čeho počítat posun.'
            }
          >
            {keysList.map((k) => (
              <option key={k} value={k} className="bg-plocha-1 text-pismo">
                {k}
              </option>
            ))}
          </select>

          {/* Transpose Controls */}
          <div className="flex items-center gap-1 pl-1 border-l border-kresba">
            <button
              onClick={() => setTransposeSemitones((prev) => prev - 1)}
              className="w-5 h-5 rounded bg-plocha-2 hover:bg-plocha-3 text-xs font-bold text-pismo flex items-center justify-center"
              title="Transponovat o půltón dolů"
            >
              -
            </button>
            <span className="text-xs font-mono font-bold text-pismo min-w-[20px] text-center">
              {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones}
            </span>
            <button
              onClick={() => setTransposeSemitones((prev) => prev + 1)}
              className="w-5 h-5 rounded bg-plocha-2 hover:bg-plocha-3 text-xs font-bold text-pismo flex items-center justify-center"
              title="Transponovat o půltón nahoru"
            >
              +
            </button>
          </div>
        </div>

        {/* Tuning Selector */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-podklad/60 rounded-xl border border-kresba">
          <span className="stitek-pole">Ladění</span>
          <select
            value={tuning}
            onChange={(e) => setTuning(e.target.value)}
            className="bg-transparent text-xs font-medium text-pismo focus:outline-none cursor-pointer"
          >
            {tuningsList.map((t) => (
              <option key={t} value={t} className="bg-plocha-1 text-pismo">
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* RIGHT SECTION: Quick Dock Triggers, Live Band Session & Account */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Spouštěč dolního panelu tu byl, ale panel se otevíral v úzkém
            pruhu dole a všechny jeho nástroje — hmatník, akordy, ladička,
            metronom, klávesy — má aplikace i jako plnohodnotné sekce.
            Dvě cesty k témuž jen nutily hádat, která je ta lepší. */}
        {/* Kytara i hlas patří do lišty ze stejného důvodu: obojí se
            používá při hraní, kdy se člověk neproklikává do sekce. */}
        <ZivaKytara />
        {/* Hlasové příkazy — v liště, tedy dostupné ze všech sekcí. */}
        <MikrofonTlacitko />
        {/* User Profile / Admin Button */}
        {currentUser ? (
          <div className="flex items-center gap-1 pl-2 border-l border-kresba">
            {userRole === 'admin' && (
              <button
                onClick={onOpenAdminModal}
                className="p-2 rounded-xl bg-plocha-1 border border-kresba hover:bg-plocha-2 text-znacka"
                title="Administrace"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onOpenProfileModal}
              className="w-8 h-8 rounded-xl bg-plocha-2 hover:bg-plocha-3 border border-kresba flex items-center justify-center font-bold text-xs text-znacka"
              title="Profil uživatele"
            >
              {currentUser.email ? currentUser.email.charAt(0).toUpperCase() : 'U'}
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLoginModal}
            className="px-3 py-1.5 rounded-xl zlata-plocha font-semibold text-xs transition-colors flex items-center gap-1"
          >
            <User className="w-3.5 h-3.5" />
            <span>Přihlásit</span>
          </button>
        )}
      </div>
    </header>
  );
};
