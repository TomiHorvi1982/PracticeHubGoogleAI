import React, { useState, useEffect } from 'react';
import { 
  FileUp, Disc, Music, Sliders, Play, Plus, BookOpen, Trash2, 
  Sparkles, CheckCircle, AlertCircle, RefreshCw, Star, Layers, Search,
  ChevronDown, ChevronRight
} from 'lucide-react';
import { Song, SongAttachment } from '../types';
import { GuitarProPlayer } from './GuitarProPlayer';
import { FreetarExplorer } from './FreetarExplorer';
import { usePamet } from '../hooks/usePamet';

interface AlphaTabSectionProps {
  songs: Song[];
  onAddSong?: (song: Song) => void;
}

export const AlphaTabSection: React.FC<AlphaTabSectionProps> = ({
  songs,
  onAddSong,
}) => {
  /**
   * Načtená tabulatura přežije přepnutí do jiné sekce.
   *
   * Dřív se při návratu ztratila a musela se hledat znovu — což je
   * u tabulatury, kterou člověk zrovna cvičí, ta nejotravnější možná
   * ztráta.
   */
  const [activeFile, setActiveFile] = usePamet<{
    dataUrl: string;
    filename: string;
    artist?: string;
    bpm?: number;
  } | null>('gp_otevrena', null);

  /** Vyhledávání je sbalené: většinou se otevírá vlastní soubor. */
  const [hledaniOtevrene, setHledaniOtevrene] = usePamet('gp_hledani_otevrene', false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  /**
   * Jakmile je tabulatura v přehrávači, hledání se sbalí.
   *
   * Vede k tomu víc cest — nález z vyhledávače, soubor ze zpěvníku,
   * přetažené GP z disku — a každá by na to musela myslet zvlášť.
   * Jedna reakce na načtený soubor je pojistka, kterou nejde obejít.
   */
  useEffect(() => {
    if (activeFile) setHledaniOtevrene(false);
  }, [activeFile?.filename, activeFile?.dataUrl]);

  // Extract all existing Guitar Pro files from the library songs
  const libraryGpFiles = songs.flatMap(song => 
    (song.attachments || [])
      .filter(att => att.type === 'guitarpro')
      .map(att => ({
        songId: song.id,
        songTitle: song.title,
        songArtist: song.artist,
        attachment: att
      }))
  );

  const loadLibraryGp = (fileItem: { attachment: SongAttachment; songArtist: string }) => {
    setActiveFile({
      dataUrl: fileItem.attachment.dataUrl,
      filename: fileItem.attachment.name,
      artist: fileItem.songArtist,
      bpm: fileItem.attachment.parsedData?.bpm || 120,
    });
    setSuccessMsg(`Načten soubor "${fileItem.attachment.name}" ze Song Library.`);
    setErrorMsg(null);
  };

  return (
    <div className="space-y-4 font-sans text-white pb-12">
      {/* Title block */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="bg-[#FF9F0A] text-black font-semibold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
                AlphaTab Labs
              </span>
              <span className="text-xs text-neutral-400 font-medium">Interaktivní přehrávač tabulatur</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              AlphaTab Studio &amp; Guitar Pro
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Otevřete libovolný soubor GP3/GP4/GP5/GPX, přehrávejte MIDI tóny, přepínejte nástroje a trénujte.
            </p>
          </div>
        </div>

        {activeFile && (
          <button 
            onClick={() => { setActiveFile(null); setSuccessMsg(null); setErrorMsg(null); }}
            className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
          >
            Zavřít soubor
          </button>
        )}
      </div>

      {/* Hledání tabulatur.
          Bydlelo ve vlastní sekci, takže se za každou nalezenou
          tabulaturou muselo přepnout jinam a zpátky. Tady se nález
          otevře rovnou v přehrávači o kus níž. */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl overflow-hidden">
        <button
          onClick={() => setHledaniOtevrene((v) => !v)}
          className="w-full flex items-center gap-2 px-5 py-3 text-left cursor-pointer hover:bg-white/[0.03]"
        >
          {hledaniOtevrene
            ? <ChevronDown className="w-4 h-4 text-neutral-400" />
            : <ChevronRight className="w-4 h-4 text-neutral-400" />}
          <Search className="w-4 h-4 text-[#FF9F0A]" />
          <span className="text-sm font-bold text-white">Najít tabulaturu</span>
          <span className="text-[11px] text-neutral-500">
            naše sbírka, Ultimate Guitar a Freetar — nález se otevře rovnou tady
          </span>
        </button>
        {/**
         * Vyhledávač zůstává připojený i po sbalení.
         *
         * Dřív se odpojoval, a s ním zmizely výsledky i to, co bylo
         * rozepsané — po každém otevření tabulatury se hledalo znovu.
         * Skrývá se proto stylem, ne odpojením.
         */}
        <div className={hledaniOtevrene ? 'px-5 pb-5 space-y-4' : 'hidden'}>
          <FreetarExplorer
            vlozeny
            songs={songs}
            onSongImported={(song) => onAddSong?.(song)}
            onViewSong={(song) => onAddSong?.(song)}
            onOtevritVPrehravaci={(soubor) => {
              setActiveFile(soubor);
              setSuccessMsg(`„${soubor.filename}" je v přehrávači.`);
              setErrorMsg(null);
            }}
          />

        {/* Soubory ve zpěvníku v roletce.
            Rozbalený seznam osmdesáti položek zabral víc místa než
            samotné hledání; jako roletka je po ruce a nepřekáží. */}
        <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 space-y-2 shadow-lg">
          <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#FF9F0A]" />
            <span>Soubory ve zpěvníku ({libraryGpFiles.length})</span>
          </label>

          {libraryGpFiles.length === 0 ? (
            <p className="text-xs text-neutral-400 py-1 leading-relaxed">
              Ve zpěvníku zatím žádný Guitar Pro soubor není. Najdi tabulaturu výš, nebo
              soubory nahraj v sekci Soubory.
            </p>
          ) : (
            <select
              value=""
              onChange={(e) => {
                const vybrany = libraryGpFiles[Number(e.target.value)];
                if (vybrany) loadLibraryGp(vybrany);
              }}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#FF9F0A] cursor-pointer"
            >
              <option value="">— vyber soubor a otevře se v přehrávači —</option>
              {libraryGpFiles.map((fileItem, idx) => (
                <option key={idx} value={idx}>
                  {fileItem.attachment.name} · {fileItem.songArtist} — {fileItem.songTitle}
                </option>
              ))}
            </select>
          )}
        </div>
        </div>
      </div>

        {/* Status feedback alerts */}
        {successMsg && (
          <div className="bg-[#30D158]/10 border border-[#30D158]/30 text-[#30D158] px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Player Rendering or Placeholder empty state */}
        {activeFile ? (
          <div className="space-y-3">
            <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-medium">Aktivní tabulatura:</span>
              <span className="font-bold text-[#FF9F0A]">{activeFile.filename}</span>
            </div>
            <GuitarProPlayer
              dataUrl={activeFile.dataUrl}
              filename={activeFile.filename}
              artist={activeFile.artist}
              bpm={activeFile.bpm}
            />
          </div>
        ) : (
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-12 sm:p-16 text-center text-xs space-y-4 shadow-xl">
            <div className="flex justify-center">
              <div className="p-4 bg-white/5 rounded-3xl border border-white/10 text-neutral-500">
                <Music className="w-10 h-10" />
              </div>
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <p className="font-bold text-white text-base">
                Žádný Guitar Pro soubor nebyl načten
              </p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Chcete-li zobrazit interaktivní tabulaturu a spustit doprovod, nahrajte soubor s příponou <strong className="text-[#FF9F0A]">.gp</strong>, <strong className="text-[#FF9F0A]">.gp5</strong>, nebo vyberte z existujících souborů ve vaší knihovně.
              </p>
            </div>
            <div className="pt-2">
              <span className="inline-block px-4 py-2 bg-white/5 text-neutral-300 rounded-xl border border-white/10 font-semibold text-xs">
                Připraven k cvičení
              </span>
            </div>
          </div>
        )}
    </div>
  );
};