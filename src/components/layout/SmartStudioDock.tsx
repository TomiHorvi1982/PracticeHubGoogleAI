import React from 'react';
import { useMusicalContext, DockToolId } from '../../context/MusicalContext';
import { Tuner } from '../Tuner';
import { ChordScaleExplorer } from '../ChordScaleExplorer';
import { VirtualInstruments } from '../VirtualInstruments';
import { 
  X, 
  Compass, 
  Mic, 
  Clock, 
  Piano, 
  Volume2, 
  Play, 
  Pause, 
  Minimize2, 
  Maximize2 
} from 'lucide-react';

export const SmartStudioDock: React.FC = () => {
  const {
    activeDockTool,
    setActiveDockTool,
    activeChord,
    key,
    bpm,
    setBpm,
    isMetronomeActive,
    toggleMetronome,
  } = useMusicalContext();

  if (!activeDockTool) return null;

  const tools: { id: NonNullable<DockToolId>; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'fretboard', label: 'Hmatník & Stupnice', icon: Compass },
    { id: 'chords', label: 'Akordy', icon: Compass },
    { id: 'tuner', label: 'Ladička', icon: Mic },
    { id: 'metronome', label: 'Metronom', icon: Clock },
    { id: 'keyboard', label: 'Klávesy & Synth', icon: Piano },
  ];

  return (
    <div className="bg-[#12131A]/95 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-10px_30px_rgba(0,0,0,0.5)] transition-all duration-300 z-30 flex flex-col shrink-0 max-h-[460px]">
      {/* Dock Header Bar */}
      <div className="h-11 px-4 sm:px-6 bg-[#161722]/80 border-b border-white/[0.06] flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <span className="text-stitek font-extrabold text-[#FF9F0A] uppercase tracking-widest px-2.5 py-1 rounded-lg bg-[#FF9F0A]/10 border border-[#FF9F0A]/20 flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF9F0A] animate-pulse" />
            STUDIO DOCK
          </span>
          {activeChord && (
            <span className="text-xs font-bold text-white bg-black/40 px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-1.5">
              <span className="text-neutral-400 font-medium text-drobne">Akord:</span>
              <span className="text-[#FF9F0A] font-extrabold font-mono">{activeChord}</span>
            </span>
          )}
          <span className="text-xs font-semibold text-neutral-400 hidden sm:inline-flex items-center gap-1">
            Tónina: <strong className="text-white font-mono">{key}</strong>
          </span>
        </div>

        {/* Tool Switching Tabs */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/[0.06]">
          {tools.map((t) => {
            const Icon = t.icon;
            const isActive = activeDockTool === t.id || (activeDockTool === 'scales' && t.id === 'fretboard');
            return (
              <button
                key={t.id}
                onClick={() => setActiveDockTool(t.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#FF9F0A] text-black font-extrabold shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Close Button */}
        <button
          onClick={() => setActiveDockTool(null)}
          className="p-1.5 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          title="Zavřít dock"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Dock Tool Content Area */}
      <div className="p-4 sm:p-5 overflow-y-auto flex-1 text-slate-100 scrollbar-thin">
        {(activeDockTool === 'fretboard' || activeDockTool === 'scales' || activeDockTool === 'chords') && (
          <div className="space-y-2 max-w-7xl mx-auto">
            <ChordScaleExplorer />
          </div>
        )}

        {activeDockTool === 'tuner' && (
          <div className="max-w-3xl mx-auto py-2">
            <Tuner />
          </div>
        )}

        {activeDockTool === 'metronome' && (
          <div className="max-w-md mx-auto py-6 bg-[#16161A]/90 backdrop-blur-xl p-6 rounded-3xl border border-white/[0.08] text-center space-y-5 shadow-2xl">
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 text-[#FF9F0A]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Rychlý Metronom</h3>
            </div>
            <div className="text-6xl font-black font-mono text-white tracking-tight flex items-baseline justify-center gap-2">
              {bpm} <span className="text-sm text-neutral-400 font-sans font-semibold">BPM</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setBpm(bpm - 5)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl text-sm border border-white/10 transition-all cursor-pointer"
              >
                -5
              </button>
              <button
                onClick={toggleMetronome}
                className={`px-8 py-2.5 rounded-xl font-black text-sm shadow-xl transition-all flex items-center gap-2 cursor-pointer ${
                  isMetronomeActive
                    ? 'bg-[#FF9F0A] text-black shadow-[#FF9F0A]/20 scale-105'
                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
                }`}
              >
                {isMetronomeActive ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{isMetronomeActive ? 'Zastavit' : 'Spustit'}</span>
              </button>
              <button
                onClick={() => setBpm(bpm + 5)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl text-sm border border-white/10 transition-all cursor-pointer"
              >
                +5
              </button>
            </div>
          </div>
        )}

        {(activeDockTool === 'keyboard' || activeDockTool === 'looper' || activeDockTool === 'drums') && (
          <div className="py-2 max-w-[1800px] mx-auto">
            <VirtualInstruments />
          </div>
        )}
      </div>
    </div>
  );
};
