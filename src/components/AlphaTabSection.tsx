import React, { useState, useEffect } from 'react';
import { 
  FileUp, Disc, Music, Sliders, Play, Plus, BookOpen, Trash2, 
  Sparkles, CheckCircle, AlertCircle, RefreshCw, Star, Layers, Search 
} from 'lucide-react';
import { Song, SongAttachment } from '../types';
import { parseGuitarProFile } from '../utils/fileParsers';
import { GuitarProPlayer } from './GuitarProPlayer';

interface AlphaTabSectionProps {
  songs: Song[];
  onAddSong?: (song: Song) => void;
}

export const AlphaTabSection: React.FC<AlphaTabSectionProps> = ({
  songs,
  onAddSong,
}) => {
  const [activeFile, setActiveFile] = useState<{
    dataUrl: string;
    filename: string;
    artist?: string;
    bpm?: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gtp'].includes(ext || '')) {
      setErrorMsg('Neplatný formát. Nahrajte prosím soubor Guitar Pro (.gp, .gp3, .gp4, .gp5, .gpx)');
      setIsProcessing(false);
      return;
    }

    try {
      const result = await parseGuitarProFile(file);
      if (result && result.attachment) {
        setActiveFile({
          dataUrl: result.attachment.dataUrl,
          filename: result.attachment.name,
          artist: result.song.artist,
          bpm: result.song.bpm,
        });

        setSuccessMsg(`Soubor "${file.name}" byl úspěšně načten do přehrávače!`);

        // If the user can add to library
        if (onAddSong) {
          const newSong: Song = {
            id: 'gp_song_' + Date.now(),
            title: result.song.title || file.name.replace(/\.[^/.]+$/, ''),
            artist: result.song.artist || 'Neznámý autor',
            key: result.song.key || 'C',
            bpm: result.song.bpm || 120,
            content: result.song.content || '',
            chordsUsed: [],
            attachments: [result.attachment],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            author: 'Guitar Pro Import',
          };
          onAddSong(newSong);
          setSuccessMsg(`Soubor byl načten a skladba "${newSong.title}" byla uložena do Zpěvníku!`);
        }
      }
    } catch (err: any) {
      console.error('Failed to parse GP file:', err);
      setErrorMsg(err?.message || 'Zpracování Guitar Pro souboru selhalo. Zkuste jiný soubor.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const loadLibraryGp = (fileItem: { attachment: SongAttachment; songArtist: string }) => {
    setActiveFile({
      dataUrl: fileItem.attachment.dataUrl,
      filename: fileItem.attachment.name,
      artist: fileItem.songArtist,
      bpm: fileItem.attachment.parsedData?.bpm || 120,
    });
    setSuccessMsg(`Načten soubor "${fileItem.attachment.name}" ze Zpěvníku.`);
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Left column: file management / lists */}
        <div className="space-y-4 lg:col-span-1">
          
          {/* File Upload Box */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed p-6 text-center transition-all cursor-pointer relative rounded-3xl ${
              isDragging
                ? 'border-[#30D158] bg-[#30D158]/10'
                : 'border-white/15 hover:border-[#FF9F0A]/60 bg-[#16161A]/80 backdrop-blur-xl'
            }`}
          >
            <input
              type="file"
              accept=".gp,.gp3,.gp4,.gp5,.gpx,.gtp"
              onChange={handleFileSelect}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />

            {isProcessing ? (
              <div className="py-4 flex flex-col items-center gap-2">
                <Disc className="w-8 h-8 text-[#FF9F0A] animate-spin" />
                <span className="text-xs font-semibold text-[#FF9F0A] animate-pulse">
                  Zpracovávám data tabulatury...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-[#FF9F0A]">
                  <FileUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white mb-0.5">
                    Nahrát nový soubor (.GP)
                  </p>
                  <p className="text-[11px] text-neutral-400 leading-tight">
                    Klikněte nebo přetáhněte GP3, GP4, GP5 či GPX
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* List of library files */}
          <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 space-y-3 shadow-lg">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider border-b border-white/5 pb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#FF9F0A]" />
              <span>Soubory ve zpěvníku ({libraryGpFiles.length})</span>
            </h3>

            {libraryGpFiles.length === 0 ? (
              <p className="text-xs text-neutral-400 py-2 leading-relaxed">
                Zatím nemáte v knihovně žádné kytarové soubory s příponou .GP. Nahrajte soubor výše nebo stáhněte z freetar.de!
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                {libraryGpFiles.map((fileItem, idx) => (
                  <button
                    key={idx}
                    onClick={() => loadLibraryGp(fileItem)}
                    className="w-full text-left p-2.5 bg-black/40 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-2xl transition-all text-xs font-medium block group cursor-pointer"
                  >
                    <span className="text-white group-hover:text-[#FF9F0A] font-semibold block truncate">
                      🎸 {fileItem.attachment.name}
                    </span>
                    <span className="text-[11px] text-neutral-400 block truncate mt-0.5">
                      {fileItem.songArtist} — {fileItem.songTitle}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick instructions / features list */}
          <div className="bg-[#16161A]/60 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 text-xs space-y-2.5 leading-relaxed">
            <h4 className="font-bold text-[#FF9F0A]">Co AlphaTab dokáže?</h4>
            <ul className="space-y-1.5 text-neutral-300">
              <li className="flex items-start gap-1.5">
                <span className="text-[#30D158] font-bold">✓</span> Přehrává interaktivní tabulaturu přes Syntetizér
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#30D158] font-bold">✓</span> Zobrazuje samostatně noty, tabulaturu nebo obojí
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#30D158] font-bold">✓</span> Umožňuje měnit rychlost cvičení (50% až 150%)
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#30D158] font-bold">✓</span> Obsahuje zapínatelný doprovodný metronom
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#30D158] font-bold">✓</span> Můžete ztišit či zesílit jednotlivé nástroje
              </li>
            </ul>
          </div>
        </div>

        {/* Right column: main active player or placeholder */}
        <div className="lg:col-span-3 space-y-4">
          
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

      </div>
    </div>
  );
};
