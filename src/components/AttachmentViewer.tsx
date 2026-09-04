import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Music,
  FileSpreadsheet,
  Layers,
  Download,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  Eye,
  Disc,
  Volume2,
  FileUp,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';
import { SongAttachment } from '../types';
import { audioSynth } from '../services/audioSynth';
import { Midi } from '@tonejs/midi';
import { GuitarProPlayer } from './GuitarProPlayer';

interface AttachmentViewerProps {
  attachments: SongAttachment[];
  onDeleteAttachment?: (attachmentId: string) => void;
  onOpenImportModal?: () => void;
  isSessionActive?: boolean;
}

export const AttachmentViewer: React.FC<AttachmentViewerProps> = ({
  attachments,
  onDeleteAttachment,
  onOpenImportModal,
  isSessionActive,
}) => {
  const [selectedAttId, setSelectedAttId] = useState<string | null>(null);

  // MIDI Player State
  const [isPlayingMidi, setIsPlayingMidi] = useState(false);
  const [midiProgress, setMidiProgress] = useState(0);
  const [midiDuration, setMidiDuration] = useState(0);
  const midiTimerRef = useRef<any>(null);

  useEffect(() => {
    if (attachments.length > 0 && !selectedAttId) {
      setSelectedAttId(attachments[0].id);
    }
  }, [attachments]);

  const activeAtt = attachments.find((a) => a.id === selectedAttId) || attachments[0];

  // MIDI Playback Handler
  const handleToggleMidiPlay = async () => {
    if (isPlayingMidi) {
      setIsPlayingMidi(false);
      if (midiTimerRef.current) clearInterval(midiTimerRef.current);
      return;
    }

    if (!activeAtt || activeAtt.type !== 'midi' || !activeAtt.dataUrl) return;

    try {
      setIsPlayingMidi(true);
      // Fetch arraybuffer from base64 dataUrl
      const res = await fetch(activeAtt.dataUrl);
      const arrayBuffer = await res.arrayBuffer();
      const midi = new Midi(arrayBuffer);

      const duration = midi.duration || 30;
      setMidiDuration(duration);

      let currentTime = 0;
      const startTime = Date.now();

      // Simple scheduler for notes
      midi.tracks.forEach((track) => {
        const inst = track.channel === 9 || track.channel === 10 ? 'drums' : 'grand_piano';
        track.notes.forEach((note) => {
          setTimeout(() => {
            if (isPlayingMidi) {
              audioSynth.playNote(note.midi, inst, note.duration, note.velocity);
            }
          }, note.time * 1000);
        });
      });

      midiTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setMidiProgress(Math.min(elapsed, duration));
        if (elapsed >= duration) {
          setIsPlayingMidi(false);
          clearInterval(midiTimerRef.current);
        }
      }, 200);
    } catch (err) {
      console.error('MIDI playback error:', err);
      setIsPlayingMidi(false);
    }
  };

  const [imageZoom, setImageZoom] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [invertImage, setInvertImage] = useState(false);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-[#FF3E00]" />;
      case 'midi':
        return <Music className="w-4 h-4 text-[#00E5FF]" />;
      case 'guitarpro':
        return <FileSpreadsheet className="w-4 h-4 text-[#FFD700]" />;
      case 'txt':
        return <Layers className="w-4 h-4 text-[#00FF41]" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-[#FF0055]" />;
      default:
        return <FileText className="w-4 h-4 text-pismo-tlum" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'pdf':
        return 'PDF Zpěvník';
      case 'midi':
        return 'MIDI Skladba';
      case 'guitarpro':
        return 'Guitar Pro Tab';
      case 'txt':
        return 'Text / Akordy';
      case 'image':
        return 'Obrázek / Foto not';
      default:
        return 'Příloha';
    }
  };

  if (!attachments || attachments.length === 0) {
    return (
      <div className="bg-vhloubeni border border-kresba p-4 text-center my-3 font-mono">
        <p className="text-xs text-pismo-tlum uppercase mb-2">
          K TÉTO SKLADBĚ ZATÍM NEJSOU PŘIPOJENY ŽÁDNÉ SOUBORY (.GP, .PDF, .TXT, .MID, .FOTO)
        </p>
        {onOpenImportModal && (
          <button
            onClick={onOpenImportModal}
            className="px-3 py-1.5 bg-[#141414] hover:bg-plocha-2 border border-kresba-silna hover:border-[#FF3E00] text-[#FF3E00] font-bold text-xs uppercase inline-flex items-center gap-1.5"
          >
            <FileUp className="w-3.5 h-3.5" /> PŘIPOJIT SOUBOR S TABULATUROU NEBO PDF
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-vhloubeni border border-kresba-silna p-3 my-3 font-mono text-white space-y-3">
      {/* Attachments List Tabs */}
      <div className="flex items-center justify-between border-b border-kresba pb-2 overflow-x-auto gap-2">
        <div className="flex items-center gap-1">
          <span className="text-stitek font-extrabold text-pismo-tlum uppercase mr-2">PŘÍLOHY:</span>
          {attachments.map((att) => {
            const isSelected = activeAtt?.id === att.id;
            return (
              <button
                key={att.id}
                onClick={() => setSelectedAttId(att.id)}
                className={`px-2.5 py-1 text-xs font-bold uppercase flex items-center gap-1.5 border transition-none shrink-0 ${
                  isSelected
                    ? 'bg-plocha-2 border-[#00FF41] text-[#00FF41]'
                    : 'bg-vhloubeni border-kresba text-pismo-tlum hover:text-white'
                }`}
              >
                {getTypeIcon(att.type)}
                <span>{att.name}</span>
              </button>
            );
          })}
        </div>

        {onOpenImportModal && (
          <button
            onClick={onOpenImportModal}
            className="px-2 py-1 bg-plocha-2 hover:bg-kresba border border-kresba-silna text-stitek font-bold text-[#FF3E00] uppercase flex items-center gap-1 shrink-0"
          >
            <FileUp className="w-3 h-3" /> PŘIDAT SOUBOR
          </button>
        )}
      </div>

      {/* Active Attachment View Box */}
      {activeAtt && (
        <div className="bg-vhloubeni border border-kresba p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getTypeIcon(activeAtt.type)}
              <div>
                <h4 className="text-xs font-bold text-white uppercase">{activeAtt.name}</h4>
                <p className="text-stitek text-pismo-slaby uppercase">
                  {getTypeName(activeAtt.type)} • {Math.round((activeAtt.size || 0) / 1024)} KB
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={activeAtt.dataUrl}
                download={activeAtt.name}
                className="px-2.5 py-1 bg-[#141414] hover:bg-plocha-2 border border-kresba-silna text-[#00FF41] text-stitek font-bold uppercase flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> STÁHNOUT SOUBOR
              </a>

              {onDeleteAttachment && (
                <button
                  onClick={() => onDeleteAttachment(activeAtt.id)}
                  className="p-1 text-pismo-slaby hover:text-[#FF3E00] border border-kresba hover:border-[#FF3E00]"
                  title="Smazat přílohu"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Render based on format type */}
          {activeAtt.type === 'pdf' && (
            <div className="space-y-2">
              <div className="w-full h-[350px] bg-plocha-1 border border-kresba-silna overflow-hidden relative">
                <iframe
                  src={activeAtt.dataUrl}
                  className="w-full h-full border-none"
                  title="PDF Viewer"
                />
              </div>
              {activeAtt.parsedData?.extractedText && (
                <details className="bg-vhloubeni border border-kresba p-2 text-drobne text-pismo-tlum">
                  <summary className="cursor-pointer font-bold uppercase text-[#00FF41]">
                    ZOBRAZIT EXTRACTOVANÝ TEXT Z PDF
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-stitek text-pismo-tlum">
                    {activeAtt.parsedData.extractedText}
                  </pre>
                </details>
              )}
            </div>
          )}

          {activeAtt.type === 'midi' && (
            <div className="bg-[#00141D] border border-[#00E5FF]/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-[#00E5FF]" />
                  <div>
                    <span className="text-xs font-extrabold text-[#00E5FF] uppercase">
                      INTERAKTIVNÍ MIDI PŘEHRÁVAČ
                    </span>
                    <p className="text-stitek text-[#A0F5FF]">
                      Přehrává MIDI doprovod a melodii přímo ze syntetizéru appky
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleToggleMidiPlay}
                  className={`px-4 py-2 text-xs font-black uppercase flex items-center gap-1.5 transition-all ${
                    isPlayingMidi
                      ? 'bg-[#FF3E00] text-black animate-pulse shadow-[0_0_15px_#FF3E00]'
                      : 'bg-[#00E5FF] hover:bg-white text-black shadow-[0_0_15px_rgba(0,229,255,0.3)]'
                  }`}
                >
                  {isPlayingMidi ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" /> ZASTAVIT MIDI
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" /> PŘEHRÁT MIDI
                    </>
                  )}
                </button>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="w-full bg-vhloubeni h-2 border border-[#00E5FF]/30 relative overflow-hidden">
                  <div
                    className="bg-[#00E5FF] h-full transition-all"
                    style={{
                      width: `${midiDuration > 0 ? (midiProgress / midiDuration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-stitek text-[#00E5FF]">
                  <span>{Math.floor(midiProgress)}s</span>
                  <span>{Math.floor(midiDuration)}s</span>
                </div>
              </div>

              {/* MIDI Track List */}
              {activeAtt.parsedData?.trackNames && activeAtt.parsedData.trackNames.length > 0 && (
                <div className="text-stitek text-[#A0F5FF] bg-black/40 p-2 border border-[#00E5FF]/20">
                  <span className="font-bold uppercase block mb-1">
                    STOPY A NÁSTROJE SOUBORU ({activeAtt.parsedData.trackNames.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeAtt.parsedData.trackNames.map((trk, idx) => (
                      <span
                        key={idx}
                        className="bg-[#002D3A] px-2 py-0.5 border border-[#00E5FF]/40 text-white uppercase font-mono"
                      >
                        🎹 {trk}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeAtt.type === 'guitarpro' && (
            <GuitarProPlayer
              dataUrl={activeAtt.dataUrl}
              filename={activeAtt.name}
              artist={activeAtt.parsedData?.artist}
              bpm={activeAtt.parsedData?.bpm}
            />
          )}

          {activeAtt.type === 'txt' && (
            <div className="bg-vhloubeni border border-kresba p-3">
              <pre className="whitespace-pre-wrap font-mono text-xs text-[#D1D1D1] max-h-[300px] overflow-y-auto">
                {activeAtt.parsedData?.extractedText || 'Žádný textový obsah'}
              </pre>
            </div>
          )}

          {activeAtt.type === 'image' && (
            <div className="bg-vhloubeni border border-kresba p-3 space-y-2">
              <div className="flex items-center justify-between bg-plocha-1 p-1.5 border border-kresba-silna">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setImageZoom((prev) => Math.max(0.5, prev - 0.25))}
                    className="px-2 py-1 bg-plocha-2 hover:bg-kresba-silna border border-kresba-silna text-xs font-bold"
                    title="Oddálit"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-stitek font-bold px-1.5 text-pismo-tlum">
                    {Math.round(imageZoom * 100)}%
                  </span>
                  <button
                    onClick={() => setImageZoom((prev) => Math.min(3, prev + 0.25))}
                    className="px-2 py-1 bg-plocha-2 hover:bg-kresba-silna border border-kresba-silna text-xs font-bold"
                    title="Přiblížit"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setImageRotation((prev) => (prev + 90) % 360)}
                    className="px-2 py-1 bg-plocha-2 hover:bg-kresba-silna border border-kresba-silna text-xs font-bold flex items-center gap-1"
                    title="Otočit o 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setInvertImage((prev) => !prev)}
                    className={`px-2 py-1 border text-stitek font-bold uppercase transition-none ${
                      invertImage
                        ? 'bg-[#FF0055] text-white border-[#FF0055]'
                        : 'bg-plocha-2 text-pismo-tlum border-kresba-silna'
                    }`}
                    title="Vysoký kontrast (Inverze)"
                  >
                    Invertovat
                  </button>
                </div>
                <a
                  href={activeAtt.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-stitek text-[#00FF41] hover:underline flex items-center gap-1 font-bold"
                >
                  <ExternalLink className="w-3 h-3" /> PLNÁ VELIKOST
                </a>
              </div>

              <div className="w-full max-h-[500px] overflow-auto bg-[#000] border border-kresba-silna flex items-center justify-center p-2">
                <img
                  src={activeAtt.dataUrl}
                  alt={activeAtt.name}
                  className={`max-w-none transition-transform duration-150 ${
                    invertImage ? 'invert hue-rotate-180' : ''
                  }`}
                  style={{
                    transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
                    transformOrigin: 'center center',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
