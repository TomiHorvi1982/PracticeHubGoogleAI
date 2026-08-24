import React, { useEffect, useState } from 'react';
import { Play, Square, Loader2, Volume2, ChevronDown, AlertCircle } from 'lucide-react';
import { Song, SongAttachment } from '../../types';
import { midiPlayerService, MidiSongState } from '../../services/midiPlayerService';
import { audioSynth } from '../../services/audioSynth';
import { PrazdnyModul } from './PrazdnyModul';

interface Props {
  song: Song;
  prilohy: SongAttachment[];
  onUpdateSong: (s: Song) => void;
}

function cas(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/**
 * MIDI u písně — s přehráváním, ne jen se seznamem souborů.
 *
 * Modul dřív ukazoval tlačítko „Přehrát MIDI", které jen přepnulo ikonu na
 * pauzu a nikdy nic nezahrálo. Používá se tentýž přehrávač jako ve
 * Virtuálních nástrojích, takže se zvuk chová všude stejně.
 */
export const MidiModul: React.FC<Props> = ({ song, prilohy, onUpdateSong }) => {
  const [stav, setStav] = useState<MidiSongState>(midiPlayerService.getState());
  const [vybrana, setVybrana] = useState(0);
  const [hlasitost, setHlasitost] = useState(() => audioSynth.getMasterVolume());

  useEffect(() => midiPlayerService.subscribe(setStav), []);

  // Odchod od písně nesmí nechat MIDI hrát dál na pozadí.
  useEffect(() => () => midiPlayerService.stop(), []);

  if (prilohy.length === 0) {
    return <PrazdnyModul song={song} modulId="midi" onUpdateSong={onUpdateSong} />;
  }

  const priloha = prilohy[Math.min(vybrana, prilohy.length - 1)];
  const nactene = stav.asset?.name === priloha.name;

  const prehraj = async () => {
    if (stav.isPlaying) {
      midiPlayerService.stop();
      return;
    }
    if (!nactene) await midiPlayerService.loadFromUrl(priloha.dataUrl, priloha.name);
    midiPlayerService.play();
  };

  return (
    <div className="flex-1 flex flex-col gap-2.5 min-h-0">
      {prilohy.length > 1 && (
        <div className="relative shrink-0">
          <select
            value={vybrana}
            onChange={(e) => setVybrana(parseInt(e.target.value, 10))}
            className="w-full appearance-none bg-black/50 border border-white/10 rounded-lg pl-2.5 pr-7 py-1 text-[11px] text-white outline-none focus:border-[#FF9F0A] cursor-pointer"
          >
            {prilohy.map((p, i) => (
              <option key={p.id} value={i}>{p.name}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-neutral-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      )}

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => void prehraj()}
          disabled={stav.loading || !priloha.dataUrl}
          className={`p-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
            stav.isPlaying ? 'bg-red-500 text-white' : 'bg-[#30D158] text-black'
          }`}
          title={stav.isPlaying ? 'Zastavit' : 'Přehrát'}
        >
          {stav.loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : stav.isPlaying ? (
            <Square className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-white truncate">{priloha.name}</div>
          <div className="text-[10px] font-mono text-neutral-500">
            {nactene ? `${cas(stav.position)} / ${cas(stav.duration)} · ${stav.tracks.length} stop` : 'připraveno'}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Volume2 className="w-3.5 h-3.5 text-neutral-500" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={hlasitost}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setHlasitost(v);
              audioSynth.setMasterVolume(v);
            }}
            className="w-16 h-1 cursor-pointer accent-[#FF9F0A]"
            title={`Hlasitost ${Math.round(hlasitost * 100)} %`}
          />
        </div>
      </div>

      {nactene && stav.duration > 0 && (
        <div className="h-1 bg-white/5 rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-[#FF9F0A] rounded-full"
            style={{ width: `${(stav.position / stav.duration) * 100}%`, transition: 'width 100ms linear' }}
          />
        </div>
      )}

      {stav.error && nactene && (
        <p className="text-[10px] text-[#FF453A] flex items-center gap-1 shrink-0">
          <AlertCircle className="w-3 h-3 shrink-0" /> {stav.error}
        </p>
      )}

      {/* Stopy se dají ztlumit jednotlivě — u MIDI s kytarou i bicími se
          hodí poslechnout si jen jednu. */}
      {nactene && stav.tracks.length > 1 && (
        <div className="flex flex-wrap gap-1 overflow-y-auto min-h-0">
          {stav.tracks.map((t) => (
            <button
              key={t.index}
              onClick={() => midiPlayerService.toggleMute(t.index)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer ${
                t.muted
                  ? 'bg-transparent border-white/10 text-neutral-600 line-through'
                  : 'bg-[#30D158]/15 border-[#30D158]/40 text-[#30D158]'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
