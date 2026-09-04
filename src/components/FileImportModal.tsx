import React, { useState } from 'react';
import {
  FileText,
  FileCode,
  Music,
  File,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Download,
  Share2,
  FileText as FileTextIcon,
  FileUp,
  Music2,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  Disc,
  Image as ImageIcon,
} from 'lucide-react';
import { Song, SongAttachment } from '../types';
import {
  parseTextFile,
  parsePdfFile,
  parseMidiFile,
  parseGuitarProFile,
  parseImageFile,
  parseAnyFile,
  ImportResult,
} from '../utils/fileParsers';

interface FileImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSongImported: (song: Song) => void;
}

export const FileImportModal: React.FC<FileImportModalProps> = ({
  isOpen,
  onClose,
  onSongImported,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setImportResult(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      const result = await parseAnyFile(file);
      setImportResult(result);
    } catch (err: any) {
      console.error('File import failed:', err);
      setErrorMessage(err?.message || 'Chyba při zpracování souboru');
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

  const handleConfirmImport = () => {
    if (!importResult) return;

    const newSong: Song = {
      id: crypto.randomUUID(),
      title: importResult.song.title || 'Importovaná Skladba',
      artist: importResult.song.artist || 'Neznámý interpret',
      key: importResult.song.key || 'C',
      bpm: importResult.song.bpm || 120,
      content: importResult.song.content || '',
      chordsUsed: [],
      attachments: [importResult.attachment],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onSongImported(newSong);

    // Reset & close
    setImportResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 font-sans">
      <div className="bg-plocha-2 border border-white/[0.1] w-full max-w-xl p-6 rounded-3xl shadow-2xl text-white relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-white/5">
          <div className="p-3 bg-znacka/10 border border-znacka/30 text-znacka rounded-2xl">
            <FileUp className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Import souboru do skladby
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Podporované formáty: Guitar Pro (.gp, .gp5), PDF, ChordPro, Obrázky &amp; MIDI
            </p>
          </div>
        </div>

        {/* Drag and drop area */}
        {!importResult ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer relative ${
              isDragging
                ? 'border-uspech bg-uspech/10'
                : 'border-white/10 hover:border-white/20 bg-black/30'
            }`}
          >
            <input
              type="file"
              accept=".chopro,.chordpro,.pro,.crd,.txt,.tab,.pdf,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.gtp,.png,.jpg,.jpeg,.webp,.svg"
              onChange={handleFileSelect}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />

            {isProcessing ? (
              <div className="py-6 flex flex-col items-center gap-3">
                <Disc className="w-8 h-8 text-uspech animate-spin" />
                <span className="text-xs font-bold text-uspech uppercase tracking-wider">
                  Zpracovávám a analyzuji soubor...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center gap-3 text-neutral-400">
                  <FileSpreadsheet className="w-6 h-6 text-znacka" />
                  <FileTextIcon className="w-6 h-6 text-chyba" />
                  <Layers className="w-6 h-6 text-uspech" />
                  <ImageIcon className="w-6 h-6 text-[#FF375F]" />
                  <Music2 className="w-6 h-6 text-info" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-white mb-1">
                    Přetáhněte soubor sem nebo klikněte pro výběr
                  </p>
                  <p className="text-xs text-neutral-400">
                    Guitar Pro (.gp, .gp5) • PDF zpěvníky • TXT / ChordPro • Foto not/tabů • MIDI
                  </p>
                </div>

                <span className="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 text-xs font-semibold rounded-xl transition-all">
                  Vybrat soubor z počítače
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Preview of imported file */
          <div className="space-y-4 bg-black/40 p-5 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-uspech" />
                <span className="text-xs font-bold text-uspech">
                  Soubor byl úspěšně načten
                </span>
              </div>
              <span className="text-stitek bg-white/10 text-neutral-300 px-2.5 py-0.5 rounded-md font-mono uppercase">
                Typ: {importResult.attachment.type}
              </span>
            </div>

            {/* Fields to tweak before saving */}
            <div className="grid grid-cols-2 gap-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-400">Název skladby</label>
                <input
                  type="text"
                  value={importResult.song.title || ''}
                  onChange={(e) =>
                    setImportResult({
                      ...importResult,
                      song: { ...importResult.song, title: e.target.value },
                    })
                  }
                  className="bez-sipek w-full bg-white/5 border border-white/10 rounded-xl p-2 text-white font-medium focus:border-uspech outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-400">Interpret / Autor</label>
                <input
                  type="text"
                  value={importResult.song.artist || ''}
                  onChange={(e) =>
                    setImportResult({
                      ...importResult,
                      song: { ...importResult.song, artist: e.target.value },
                    })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-white font-medium focus:border-uspech outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-400">Tónina (Key)</label>
                <input
                  type="text"
                  value={importResult.song.key || 'C'}
                  onChange={(e) =>
                    setImportResult({
                      ...importResult,
                      song: { ...importResult.song, key: e.target.value },
                    })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-white font-medium focus:border-uspech outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-400">Tempo (BPM)</label>
                <input
                  type="number"
                  value={importResult.song.bpm || 120}
                  onChange={(e) =>
                    setImportResult({
                      ...importResult,
                      song: { ...importResult.song, bpm: Number(e.target.value) },
                    })
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-white font-medium focus:border-uspech outline-none"
                />
              </div>
            </div>

            {/* File info badge */}
            <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-xs text-neutral-300 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white">{importResult.attachment.name}</span>
                <span className="text-drobne text-neutral-400 ml-2">
                  ({Math.round((importResult.attachment.size || 0) / 1024)} KB)
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setImportResult(null)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Vybrat jiný soubor
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 py-2.5 bg-uspech hover:bg-[#34e260] text-black text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
              >
                <ArrowRight className="w-4 h-4" /> Uložit a importovat
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
