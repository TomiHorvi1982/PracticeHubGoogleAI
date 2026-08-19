import React from 'react';
import { useMusicalContext } from '../../context/MusicalContext';
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
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX,
  Compass,
  Piano,
  PanelLeftClose,
  PanelLeftOpen,
  Menu
} from 'lucide-react';
import { BandSession } from '../../types';

interface UnifiedTopBarProps {
  session: BandSession | null;
  onOpenSessionModal: () => void;
  onOpenLoginModal: () => void;
  onOpenProfileModal: () => void;
  onOpenAdminModal: () => void;
  currentUser: any;
  userRole: string;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const UnifiedTopBar: React.FC<UnifiedTopBarProps> = ({
  session,
  onOpenSessionModal,
  onOpenLoginModal,
  onOpenProfileModal,
  onOpenAdminModal,
  currentUser,
  userRole,
  isSidebarCollapsed = false,
  onToggleSidebar,
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
    isPlaying,
    setIsPlaying,
    isMetronomeActive,
    toggleMetronome,
    toggleDockTool,
    activeDockTool,
    isGigMode,
    setIsGigMode,
  } = useMusicalContext();

  const keysList = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm'];
  const tuningsList = ['E Standard', 'Drop D', 'D Standard', 'Drop C', 'Half Step Down', 'Open G', 'Open D'];

  return (
    <header className="h-16 bg-[#0F172A] border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between text-slate-200 select-none z-30 shrink-0 gap-2">
      {/* LEFT SECTION: Logo & Active Song Badge */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsGigMode(!isGigMode)}>
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
      </div>

      {/* CENTER SECTION: Global Musical Controls (BPM, Key, Tuning, Transport) */}
      <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800/80 shadow-inner">
        {/* Play/Pause Master Transport */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            isPlaying
              ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 scale-105'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title={isPlaying ? 'Pozastavit' : 'Spustit přehrávání'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

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
            onChange={(e) => setKey(e.target.value)}
            className="bg-transparent text-xs font-bold text-amber-400 focus:outline-none cursor-pointer"
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
        {/* Quick Tuner Trigger */}
        <button
          onClick={() => toggleDockTool('tuner')}
          className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
            activeDockTool === 'tuner'
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
              : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300'
          }`}
          title="Rychlá ladička"
        >
          <Mic className="w-4 h-4 text-amber-400" />
          <span className="hidden md:inline">Ladička</span>
        </button>

        {/* Quick Fretboard Trigger */}
        <button
          onClick={() => toggleDockTool('fretboard')}
          className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            activeDockTool === 'fretboard'
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
              : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300'
          }`}
          title="Hmatník"
        >
          <Compass className="w-4 h-4 text-amber-400" />
          <span className="hidden lg:inline">Hmatník</span>
        </button>

        {/* Quick Piano / Keys Trigger */}
        <button
          onClick={() => toggleDockTool('keyboard')}
          className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            activeDockTool === 'keyboard'
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
              : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300'
          }`}
          title="Rychlý klavír & klávesy"
        >
          <Piano className="w-4 h-4 text-amber-400" />
          <span className="hidden md:inline">Klavír</span>
        </button>

        {/* Live Band Room Status */}
        <button
          onClick={onOpenSessionModal}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
            session
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-400'
          }`}
        >
          <Radio className={`w-4 h-4 ${session ? 'text-emerald-400 animate-pulse' : ''}`} />
          <span className="hidden sm:inline">{session ? session.roomName : 'Živá Zkušebna'}</span>
        </button>

        {/* Gig Mode Button */}
        <button
          onClick={() => setIsGigMode(!isGigMode)}
          className={`p-2 rounded-xl border transition-all ${
            isGigMode
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-400'
          }`}
          title={isGigMode ? 'Opustit Gig Mode' : 'Zapnout Gig Mode (Pro živé hraní)'}
        >
          {isGigMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

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
