import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Sparkles,
  Music,
  Volume2,
  VolumeX,
  Radio,
  Layers,
  CheckCircle2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { Song, StemSongDocument, SongAttachment } from '../types';
import { VyberZKnihovny } from './songbook/VyberZKnihovny';
import { LibraryAsset } from '../services/assetLibraryService';
import { stemAudioService, StemAudioState, ChannelState } from '../services/stemAudioService';
import { DawVerticalFader } from './DawVerticalFader';

interface ModularStemsMixerProps {
  song?: Song;
  onOpenStemSection?: () => void;
  /** Jednotlivé stopy připojené přímo k písni, mimo hotové sady. */
  stopyPisne?: SongAttachment[];
  onUpdateSong?: (s: Song) => void;
}

const stemColors: Record<string, { accent: string; badge: string; bg: string; border: string }> = {
  vocals: { accent: '#f43f5e', badge: 'bg-rose-500', bg: 'from-rose-500/10 to-rose-950/20', border: 'border-rose-500/30' },
  guitar: { accent: '#f59e0b', badge: 'bg-amber-500', bg: 'from-amber-500/15 to-amber-950/20', border: 'border-amber-500/40' },
  bass: { accent: '#10b981', badge: 'bg-emerald-500', bg: 'from-emerald-500/10 to-emerald-950/20', border: 'border-emerald-500/30' },
  drums: { accent: '#3b82f6', badge: 'bg-blue-500', bg: 'from-blue-500/10 to-blue-950/20', border: 'border-blue-500/30' },
  other: { accent: '#a855f7', badge: 'bg-purple-500', bg: 'from-purple-500/10 to-purple-950/20', border: 'border-purple-500/30' },
};

export const ModularStemsMixer: React.FC<ModularStemsMixerProps> = ({
  song, onOpenStemSection, stopyPisne = [], onUpdateSong,
}) => {
  const [audioState, setAudioState] = useState<StemAudioState>(stemAudioService.getState());
  const [pridavam, setPridavam] = useState(false);

  useEffect(() => {
    const unsub = stemAudioService.subscribe((state) => {
      setAudioState(state);
    });
    // The service's own initial fetch (at module load) usually fires before
    // the Supabase session is restored and 401s — refetch now, on mount,
    // when we're sure the user is actually signed in.
    stemAudioService.fetchSongs();
    return () => unsub();
  }, []);

  // Try auto-selecting stem song when song changes
  useEffect(() => {
    if (song && song.title) {
      stemAudioService.selectSongByTitleOrArtist(song.title, song.artist);
    }
  }, [song]);

  const { songs, selectedSong, isPlaying, currentTime, duration, audioReady, loadingAudio, globalPitch, channels, meterLevels } = audioState;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex-1 flex flex-col space-y-3.5 text-slate-100">
      {/* MASTER TRANSPORT & SONG SELECTOR BAR */}
      <div className="bg-black/60 border border-white/[0.08] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-inner">
        {/* Play/Pause Button & Active Song Info */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => stemAudioService.togglePlay()}
            disabled={!audioReady || loadingAudio || !selectedSong}
            className={`w-10 h-10 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center shadow-lg ${
              isPlaying
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/20'
            } disabled:opacity-40`}
            title={isPlaying ? 'Pozastavit přehrávání' : 'Přehrát všechny stopy'}
          >
            {loadingAudio ? (
              <RotateCcw className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-white">
                {selectedSong ? selectedSong.title : 'Vyberte stopovou skladbu'}
              </span>
              {selectedSong && (
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md font-semibold">
                  6-Stem
                </span>
              )}
            </div>
            <p className="text-[10px] text-neutral-400">
              {selectedSong ? `${selectedSong.artist} • ${selectedSong.stems.length} stop` : 'Propojeno se Stem Studiem'}
            </p>
          </div>
        </div>

        {/* Stem Song Dropdown Switcher */}
        {songs.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={selectedSong?.id || ''}
              onChange={(e) => {
                const found = songs.find((s) => s.id === e.target.value);
                if (found) stemAudioService.selectSong(found);
              }}
              className="bg-neutral-900 border border-white/10 text-white text-xs rounded-xl px-2.5 py-1.5 outline-none cursor-pointer"
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.artist})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Stopy jde vzít i po jedné z knihovny — hotových rozdělených
            sad je zatím pár, kdežto jednotlivých stop leží v databázi víc
            a bez tohohle se k nim nedalo dostat. */}
        {onUpdateSong && song && (
          <button
            onClick={() => setPridavam((v) => !v)}
            className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 bg-[#30D158]/15 text-[#30D158] hover:bg-[#30D158]/30 cursor-pointer transition-all shrink-0"
          >
            <Layers className="w-3 h-3" />
            {pridavam ? 'Zavřít knihovnu' : 'Stopy z knihovny'}
          </button>
        )}

        {/* Time Progress Seek Bar */}
        <div className="flex-1 max-w-xs space-y-1 mx-2">
          <div className="flex justify-between text-[10px] font-mono text-neutral-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min="0"
            max={duration || 180}
            step="0.5"
            value={currentTime}
            onChange={(e) => stemAudioService.seek(parseFloat(e.target.value))}
            className="w-full accent-amber-400 h-1.5 bg-neutral-900 rounded-lg cursor-pointer"
          />
        </div>

        {/* Global Pitch Transpose */}
        <div className="flex items-center gap-1.5 bg-neutral-900/80 px-2.5 py-1 rounded-xl border border-white/10 text-xs">
          <Music className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] text-neutral-400">Transpozice:</span>
          <button
            onClick={() => stemAudioService.setGlobalPitch(Math.max(-12, globalPitch - 1))}
            className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white font-bold text-[10px]"
          >
            -
          </button>
          <span className="w-7 text-center font-mono font-bold text-amber-400 text-[11px]">
            {globalPitch > 0 ? `+${globalPitch}` : globalPitch} st
          </span>
          <button
            onClick={() => stemAudioService.setGlobalPitch(Math.min(12, globalPitch + 1))}
            className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white font-bold text-[10px]"
          >
            +
          </button>
        </div>
      </div>

      {pridavam && song && onUpdateSong && (
        <div className="bg-black/40 border border-white/[0.08] rounded-2xl p-3 space-y-2">
          <VyberZKnihovny
            kategorie="stem_mix,backing_tracks,recordings"
            vychoziDotaz={song.title}
            prazdno="V knihovně zatím žádné rozdělené stopy nejsou."
            onVybrat={(a: LibraryAsset) => {
              if ((song.attachments || []).some((x) => x.storagePath === a.storage_path)) return;
              onUpdateSong({
                ...song,
                attachments: [
                  ...(song.attachments || []),
                  {
                    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    name: a.name,
                    type: 'audio',
                    dataUrl: '',
                    storageBucket: a.storage_bucket,
                    storagePath: a.storage_path,
                    size: a.size_bytes || undefined,
                    uploadedAt: Date.now(),
                  },
                ],
                updatedAt: Date.now(),
              });
            }}
          />

          {stopyPisne.length > 0 && (
            <div className="border-t border-white/[0.06] pt-2 space-y-1">
              <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                Připojeno k písni
              </div>
              {stopyPisne.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-[11px] text-neutral-300">
                  <CheckCircle2 className="w-3 h-3 text-[#30D158] shrink-0" />
                  <span className="truncate flex-1">{p.name}</span>
                  <button
                    onClick={() =>
                      onUpdateSong({
                        ...song,
                        attachments: (song.attachments || []).filter((x) => x.id !== p.id),
                        updatedAt: Date.now(),
                      })
                    }
                    className="p-1 rounded text-neutral-600 hover:text-[#FF453A] cursor-pointer"
                    title="Odpojit stopu"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEMS VERTICAL FADERS GRID */}
      {selectedSong && selectedSong.stems && selectedSong.stems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto p-1">
          {selectedSong.stems.map((stem) => {
            const ch = channels[stem.id] || {
              volume: 0,
              pan: 0,
              isMuted: false,
              isSolo: false,
              pitchSemi: 0,
              isMono: false,
              stereoWidth: 1.0,
            };

            const meter = meterLevels[stem.id] || 0;
            const theme = stemColors[stem.id] || stemColors['other'];

            return (
              <DawVerticalFader
                key={stem.id}
                stemId={stem.id}
                name={stem.name}
                channel={ch}
                meterLevel={meter}
                isPlaying={isPlaying}
                onUpdate={(updates) => stemAudioService.updateChannel(stem.id, updates)}
                colorTheme={theme}
                compact={false}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-10 bg-black/30 border border-white/[0.06] rounded-2xl p-6 space-y-3">
          <Sliders className="w-8 h-8 text-neutral-500 mx-auto" />
          <h4 className="text-sm font-bold text-white">Žádné separované stopy pro tuto skladbu</h4>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Můžete si vybrat jinou připravenou skladbu ze seznamu nahoře nebo přejít do AI Stem Studia a oddělit stopy z YouTube.
          </p>
        </div>
      )}
    </div>
  );
};
