import React from 'react';
import { useMusicalContext } from '../../context/MusicalContext';
import { Minimize2, ChevronLeft, ChevronRight, Play, Pause, Mic, Clock, Music } from 'lucide-react';

interface GigModeViewProps {
  onExitGigMode: () => void;
}

export const GigModeView: React.FC<GigModeViewProps> = ({ onExitGigMode }) => {
  const { activeSong, bpm, key, isPlaying, setIsPlaying, toggleDockTool } = useMusicalContext();

  return (
    <div className="fixed inset-0 bg-black text-white z-50 flex flex-col select-none p-4 overflow-hidden">
      {/* Gig Header */}
      <div className="h-16 px-4 bg-slate-900 border-b border-slate-800 rounded-2xl flex items-center justify-between shrink-0 mb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onExitGigMode}
            className="px-4 py-2 bg-amber-500 text-slate-950 font-black rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-amber-500/30"
          >
            <Minimize2 className="w-4 h-4" />
            <span>OPUSTIT GIG MODE</span>
          </button>
          <div>
            <h2 className="text-xl font-black text-amber-400 truncate max-w-md">
              {activeSong ? activeSong.title : 'Žádná vybraná skladba'}
            </h2>
            {activeSong && <p className="text-xs font-semibold text-slate-400">{activeSong.artist}</p>}
          </div>
        </div>

        {/* Big Performance Badges */}
        <div className="flex items-center gap-4">
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Tónina</p>
            <p className="text-xl font-black text-amber-400">{key}</p>
          </div>
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase">BPM</p>
            <p className="text-xl font-black text-white">{bpm}</p>
          </div>
          <button
            onClick={() => toggleDockTool('tuner')}
            className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-amber-400 font-bold flex items-center gap-2"
          >
            <Mic className="w-5 h-5" />
            <span className="hidden sm:inline">Ladička</span>
          </button>
        </div>
      </div>

      {/* Main Gig Content Stage - Massive Chords & Text */}
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-6 overflow-y-auto text-slate-100 font-mono text-lg leading-relaxed shadow-inner">
        {activeSong ? (
          <div className="max-w-4xl mx-auto space-y-4 whitespace-pre-wrap font-sans">
            <div className="border-b border-slate-800 pb-4 mb-6">
              <h1 className="text-3xl font-black text-white mb-1">{activeSong.title}</h1>
              <p className="text-lg font-bold text-amber-400">{activeSong.artist}</p>
            </div>
            <div className="text-xl font-medium leading-loose text-slate-200">
              {activeSong.content}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-4">
            <Music className="w-16 h-16 text-slate-700" />
            <p className="text-xl font-bold">Vyberte skladbu v knihovně pro zobrazení v Gig Mode.</p>
          </div>
        )}
      </div>

      {/* Gig Footer Controls */}
      <div className="h-16 mt-4 flex items-center justify-between gap-4 shrink-0">
        <button className="flex-1 py-3 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-2xl font-bold text-slate-300 flex items-center justify-center gap-2 text-base">
          <ChevronLeft className="w-5 h-5" />
          <span>PŘEDCHOZÍ SKLADBA</span>
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`px-8 py-3 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-xl ${
            isPlaying ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'
          }`}
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
          <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
        </button>
        <button className="flex-1 py-3 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-2xl font-bold text-slate-300 flex items-center justify-center gap-2 text-base">
          <span>NÁSLEDUJÍCÍ SKLADBA</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
