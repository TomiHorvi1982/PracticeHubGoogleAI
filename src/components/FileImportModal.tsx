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
} from 'lucide-react';
import { Song, SongAttachment } from '../types';
import {
  parseTextFile,
  parsePdfFile,
  parseMidiFile,
  parseGuitarProFile,
  ImportResult,
} from '../utils/fileParsers';
import { sessionSync } from '../services/sessionSync';

interface FileImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSongImported: (song: Song) => void;
  isSessionActive: boolean;
}

export const FileImportModal: React.FC<FileImportModalProps> = ({
  isOpen,
  onClose,
  onSongImported,
  isSessionActive,
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
      let result: ImportResult;

      if (['txt', 'crd', 'chopro', 'tab', 'lyrics'].includes(ext || '')) {
        result = await parseTextFile(file);
      } else if (ext === 'pdf') {
        result = await parsePdfFile(file);
      } else if (['mid', 'midi'].includes(ext || '')) {
        result = await parseMidiFile(file);
      } else if (['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gtp'].includes(ext || '')) {
        result = await parseGuitarProFile(file);
      } else {
        // Fallback text parser
        result = await parseTextFile(file);
      }

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
      id: 'song_' + Date.now(),
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

    if (isSessionActive) {
      sessionSync.broadcastNewSong(newSong);
    }

    // Reset & close
    setImportResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
      <div className="bg-[#0F0F0F] border-2 border-[#FF3E00] w-full max-w-xl p-5 shadow-[0_0_30px_rgba(255,62,0,0.2)] text-white relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#888] hover:text-white p-1 border border-[#333] hover:border-white"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#222]">
          <FileUp className="w-5 h-5 text-[#FF3E00]" />
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wide">
              IMPORT SOUBORU DO SKLADBY & RELAČNÍ ZKUŠEBNY
            </h2>
            <p className="text-[11px] text-[#888] uppercase">
              Podporované formáty: CHORDPRO (.chopro, .pro, .chordpro), TXT, PDF, MIDI &amp; GUITAR PRO (.gp, .gp3, .gp4, .gp5, .gpx)
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
            className={`border-2 border-dashed p-8 text-center transition-all cursor-pointer relative ${
              isDragging
                ? 'border-[#00FF41] bg-[#001A06]'
                : 'border-[#333] hover:border-[#FF3E00] bg-[#050505]'
            }`}
          >
            <input
              type="file"
              accept=".chopro,.chordpro,.pro,.crd,.txt,.tab,.pdf,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.gtp"
              onChange={handleFileSelect}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />

            {isProcessing ? (
              <div className="py-6 flex flex-col items-center gap-3">
                <Disc className="w-8 h-8 text-[#00FF41] animate-spin" />
                <span className="text-xs font-bold text-[#00FF41] uppercase tracking-wider">
                  ZPRACOVÁVÁM A ANALYZUJI SOUBOR...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center gap-2 text-[#888]">
                  <FileTextIcon className="w-6 h-6 text-[#00FF41]" />
                  <Layers className="w-6 h-6 text-[#FF3E00]" />
                  <Music2 className="w-6 h-6 text-[#00E5FF]" />
                  <FileSpreadsheet className="w-6 h-6 text-[#FFD700]" />
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-white mb-1">
                    PŘETÁHNĚTE SOUBOR SEM NEBO KLIKNĚTE PRO VÝBĚR
                  </p>
                  <p className="text-[11px] text-[#888] uppercase">
                    CHORDPRO (.chopro, .pro, .crd) • TXT • PDF • MIDI • GUITAR PRO (Tabulatury &amp; Zvukový Přehrávač)
                  </p>
                </div>

                <span className="mt-2 px-3 py-1 bg-[#1A1A1A] border border-[#444] text-[#D1D1D1] text-[11px] font-bold uppercase hover:bg-[#222]">
                  VYBRAT SOUBOR Z POČÍTAČE
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Preview of imported file */
          <div className="space-y-4 bg-[#050505] p-4 border border-[#222]">
            <div className="flex items-center justify-between border-b border-[#222] pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#00FF41]" />
                <span className="text-xs font-bold uppercase text-[#00FF41]">
                  SOUBOR ÚSPĚŠNĚ NAČTEN
                </span>
              </div>
              <span className="text-[10px] bg-[#222] text-[#AAA] px-2 py-0.5 border border-[#333] uppercase">
                TYP: {importResult.attachment.type.toUpperCase()}
              </span>
            </div>

            {/* Fields to tweak before saving */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] text-[#888] uppercase mb-1">NÁZEV SKLADBY</label>
                <input
                  type="text"
                  value={importResult.song.title || ''}
                  onChange={(e) =>
                    setImportResult({
                      ...importResult,
                      song: { ...importResult.song, title: e.target.value },
                    })
                  }
                  className="w-full bg-[#0F0F0F] border border-[#333] p-1.5 text-white font-bold uppercase focus:border-[#00FF41] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#888] uppercase mb-1">INTERPRET / AUTOR</label>
                <input
                  type="text"
                  value={importResult.song.artist || ''}
                  onChange={(e) =>
                    setImportResult({
                      ...importResult,
                      song: { ...importResult.song, artist: e.target.value },
                    })
                  }
                  className="w-full bg-[#0F0F0F] border border-[#333] p-1.5 text-white font-bold uppercase focus:border-[#00FF41] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#888] uppercase mb-1">TÓNINA (KEY)</label>
                <input
                  type="text"
                  value={importResult.song.key || 'C'}
                  onChange={(e) =>
                    setImportResult({
                      ...importResult,
                      song: { ...importResult.song, key: e.target.value },
                    })
                  }
                  className="w-full bg-[#0F0F0F] border border-[#333] p-1.5 text-white font-bold uppercase focus:border-[#00FF41] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#888] uppercase mb-1">TEMPO (BPM)</label>
                <input
                  type="number"
                  value={importResult.song.bpm || 120}
                  onChange={(e) =>
                    setImportResult({
                      ...importResult,
                      song: { ...importResult.song, bpm: Number(e.target.value) },
                    })
                  }
                  className="w-full bg-[#0F0F0F] border border-[#333] p-1.5 text-white font-bold uppercase focus:border-[#00FF41] outline-none"
                />
              </div>
            </div>

            {/* File info badge */}
            <div className="bg-[#0F0F0F] p-2.5 border border-[#333] text-[11px] text-[#AAA] flex items-center justify-between">
              <div>
                <span className="font-bold text-white uppercase">{importResult.attachment.name}</span>
                <span className="text-[10px] text-[#666] ml-2">
                  ({Math.round((importResult.attachment.size || 0) / 1024)} KB)
                </span>
              </div>
              {isSessionActive && (
                <span className="text-[10px] bg-[#00220A] text-[#00FF41] border border-[#00FF41]/40 px-2 py-0.5 flex items-center gap-1 font-bold">
                  <Share2 className="w-3 h-3" /> SDÍLÍ SE DO RELACE ZKUŠEBNY
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setImportResult(null)}
                className="flex-1 py-2 bg-[#1A1A1A] hover:bg-[#222] border border-[#333] text-xs font-extrabold uppercase"
              >
                VYBRAT JINÝ SOUBOR
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 py-2 bg-[#00FF41] hover:bg-white text-black text-xs font-black uppercase flex items-center justify-center gap-1 shadow-[0_0_15px_rgba(0,255,65,0.3)]"
              >
                <ArrowRight className="w-4 h-4" /> ULOŽIT & IMPORTOVAT
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 p-2.5 bg-[#2B0000] border border-[#FF3E00] text-xs text-[#FF8888] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#FF3E00]" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
