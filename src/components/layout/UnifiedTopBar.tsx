import React, { useEffect, useState } from 'react';
import { useMusicalContext } from '../../context/MusicalContext';
import { audioBus, CoHraje } from '../../services/audioBus';
import { posunDoToniny } from '../../services/akordy';
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
  } = useMusicalContext();

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
    <header className="h-16 bg-[#0F172A] border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between text-slate-200 select-none z-30 shrink-0 gap-2">
      {/* LEFT SECTION: Logo & Active Song Badge */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
            NL
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold tracking-wide text-white leading-tight">NEVERLATE</h1>
            <p className="text-[10px] text-amber-400 font-medium uppercase tracking-widest">Studio Workspace</p>
          </div>
        </div>

        {/* Active Song Context Pill */}
        <div className="hidden md:flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl max-w-[260px]">
          <Music2 className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="truncate text-xs">
            {activeSong ? (
              <span className="font-semibold text-slate-100">{activeSong.title}</span>
            ) : (
              <span className="text-slate-400 italic">Free Jam Mode (Bez skladby)</span>
            )}
            {activeSong && <span className="text-slate-400 text-[11px] block truncate">{activeSong.artist}</span>}
          </div>
        </div>

        {/* Právě hraje — vedle skladby, kterou zrovna trénujeme. */}
        {hraje && (
          <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1.5 rounded-xl max-w-[200px] lg:max-w-[260px]">
            <AudioLines className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
            <div className="truncate text-xs min-w-0">
              <span className="font-semibold text-emerald-100 block truncate">
                {hraje.nazev || 'Přehrávání'}
              </span>
              <span className="text-emerald-400/70 text-[10px] block truncate">{hraje.zdroj}</span>
            </div>
            <button
              onClick={() => audioBus.stopAll()}
              className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-200 cursor-pointer shrink-0 transition-all"
              title="Zastavit přehrávání"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          </div>
        )}
      </div>

      {/* CENTER SECTION: Global Musical Controls (BPM, Key, Tuning, Transport) */}
      <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/80 shadow-inner">
        {/* BPM Control */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/60 rounded-xl border border-slate-800">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <input
            type="number"
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-11 text-center bg-transparent text-sm font-bold text-slate-100 focus:outline-none"
            min={30}
            max={300}
          />
          <span className="text-[10px] font-semibold text-slate-400 uppercase">BPM</span>
          <div className="flex flex-col -space-y-1 ml-0.5">
            <button
              onClick={() => setBpm(bpm + 1)}
              className="text-[9px] text-slate-400 hover:text-white px-1 font-bold"
            >
              ▲
            </button>
            <button
              onClick={() => setBpm(bpm - 1)}
              className="text-[9px] text-slate-400 hover:text-white px-1 font-bold"
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
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
          }`}
          title="Metronom"
        >
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          <span className="hidden sm:inline">Metronom</span>
        </button>

        {/* Key & Transpose Control */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/60 rounded-xl border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase">Tónina</span>
          <select
            value={key}
            onChange={(e) => zahrajV(e.target.value)}
            className="bg-transparent text-xs font-bold text-amber-400 focus:outline-none cursor-pointer"
            title={
              activeSong?.key
                ? `Píseň je v ${activeSong.key}. Výběrem jiné tóniny se přepíšou akordy.`
                : 'U písně není známá tónina, takže není z čeho počítat posun.'
            }
          >
            {keysList.map((k) => (
              <option key={k} value={k} className="bg-slate-900 text-slate-100">
                {k}
              </option>
            ))}
          </select>

          {/* Transpose Controls */}
          <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
            <button
              onClick={() => setTransposeSemitones((prev) => prev - 1)}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center"
              title="Transponovat o půltón dolů"
            >
              -
            </button>
            <span className="text-xs font-mono font-bold text-slate-200 min-w-[20px] text-center">
              {transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones}
            </span>
            <button
              onClick={() => setTransposeSemitones((prev) => prev + 1)}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center"
              title="Transponovat o půltón nahoru"
            >
              +
            </button>
          </div>
        </div>

        {/* Tuning Selector */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/60 rounded-xl border border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400 uppercase">Ladění</span>
          <select
            value={tuning}
            onChange={(e) => setTuning(e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-300 focus:outline-none cursor-pointer"
          >
            {tuningsList.map((t) => (
              <option key={t} value={t} className="bg-slate-900 text-slate-100">
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* RIGHT SECTION: Quick Dock Triggers, Live Band Session & Account */}
      <div className="flex items-center gap-2">
        {/* User Profile / Admin Button */}
        {currentUser ? (
          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            {userRole === 'admin' && (
              <button
                onClick={onOpenAdminModal}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-amber-400"
                title="Administrace"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onOpenProfileModal}
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center font-bold text-xs text-amber-400"
              title="Profil uživatele"
            >
              {currentUser.email ? currentUser.email.charAt(0).toUpperCase() : 'U'}
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLoginModal}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors flex items-center gap-1"
          >
            <User className="w-3.5 h-3.5" />
            <span>Přihlásit</span>
          </button>
        )}
      </div>
    </header>
  );
};
