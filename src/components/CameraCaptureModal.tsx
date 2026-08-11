import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, Sparkles, Send, Upload, X, Check, Loader2 } from 'lucide-react';
import { transcribeSongPhoto, TranscribedSong } from '../services/geminiScanner';
import { sessionSync } from '../services/sessionSync';
import { Song } from '../types';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSongTranscribed: (song: Song) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onSongTranscribed,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [photoSent, setPhotoSent] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      setTranscriptionError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera access failed:', err);
      setTranscriptionError('Kamera není dostupná nebo byl odepřen přístup. Můžete vybrat fotku ze souboru.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, capturedImage, startCamera, stopCamera]);

  if (!isOpen) return null;

  const takeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCapturedImage(event.target.result as string);
          stopCamera();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTranscribeWithAI = async () => {
    if (!capturedImage) return;
    setIsTranscribing(true);
    setTranscriptionError(null);

    try {
      const result: TranscribedSong = await transcribeSongPhoto(capturedImage);
      const newSong: Song = {
        id: 'song_' + Date.now(),
        title: result.title || 'Vyfocená píseň',
        artist: result.artist || 'Vyfoceno kytaristou',
        key: result.key || 'G',
        content: result.content || '',
        chordsUsed: result.chords || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        notes: 'Píseň byla automaticky přepsána z fotky pomocí AI OCR.',
        attachments: [
          {
            id: 'att_' + Date.now(),
            name: 'Původní fotka zpěvníku.jpg',
            type: 'image',
            dataUrl: capturedImage,
            uploadedAt: Date.now(),
          },
        ],
      };

      onSongTranscribed(newSong);
      setIsTranscribing(false);
      onClose();
    } catch (err: unknown) {
      setIsTranscribing(false);
      const message = err instanceof Error ? err.message : 'Přepis fotky selhal.';
      setTranscriptionError(message);
    }
  };

  const handleShareToSession = () => {
    if (!capturedImage) return;
    sessionSync.sharePhotoToSession(capturedImage, 'Fotka zpěvníku / akordový papír');
    setPhotoSent(true);
    setTimeout(() => setPhotoSent(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 font-mono">
      <div className="bg-[#0F0F0F] border-2 border-[#333] text-[#D1D1D1] max-w-xl w-full p-5 relative">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-3 border-b border-[#222] pb-2">
          <div className="flex items-center gap-2">
            <span className="bg-[#FF3E00] text-black font-black px-2 py-0.5 text-[10px] uppercase">
              SCANNER
            </span>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              OKAMŽITÝ FOTO-ZPĚVNÍK (AI)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#888] hover:text-white hover:bg-[#222]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden Canvas for Capturing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Viewfinder / Preview */}
        <div className="relative bg-[#050505] border border-[#222] aspect-video flex items-center justify-center mb-3">
          {capturedImage ? (
            <img src={capturedImage} alt="Captured chords" className="w-full h-full object-contain" />
          ) : stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center p-6 text-[#555]">
              <Camera className="w-10 h-10 mx-auto mb-1 opacity-50 text-[#FF3E00]" />
              <p className="text-xs uppercase">KAMERA NAČÍTÁ NEBO NENÍ K DISPOZICI</p>
            </div>
          )}

          {/* Shutter Overlay Button */}
          {!capturedImage && stream && (
            <button
              onClick={takeSnapshot}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 w-12 h-12 bg-[#FF3E00] hover:bg-white border-2 border-black flex items-center justify-center shadow-xl transition-none"
              title="Vyfotit"
            >
              <div className="w-8 h-8 border border-black bg-black"></div>
            </button>
          )}
        </div>

        {/* Error message */}
        {transcriptionError && (
          <div className="bg-[#2B0000] border border-[#FF3E00] p-2 text-[#FF3E00] text-xs mb-3 font-mono uppercase">
            {transcriptionError}
          </div>
        )}

        {/* Actions Controls */}
        {capturedImage ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              
              {/* Gemini AI OCR Transcribe */}
              <button
                onClick={handleTranscribeWithAI}
                disabled={isTranscribing}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#FF3E00] hover:bg-white text-black font-extrabold text-xs uppercase disabled:opacity-50 transition-none"
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI PŘEPISUJE AKORDY...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>PŘEVÉST FOTKU NA AKORDY (AI)</span>
                  </>
                )}
              </button>

              {/* Share Photo to Band Room */}
              <button
                onClick={handleShareToSession}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#00FF41] hover:bg-white text-black font-extrabold text-xs uppercase transition-none"
              >
                {photoSent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                <span>{photoSent ? 'ODESLÁNO KAPELÁM!' : 'SDÍLET FOTKU DO ZKUŠEBNY'}</span>
              </button>

            </div>

            <div className="flex justify-between items-center pt-1">
              <button
                onClick={() => {
                  setCapturedImage(null);
                  startCamera();
                }}
                className="flex items-center gap-1 text-[#888] hover:text-white text-xs uppercase"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                VYFOTIT ZNOVA
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer bg-[#141414] hover:bg-[#222] text-[#D1D1D1] px-3 py-1.5 border border-[#333] uppercase">
              <Upload className="w-3.5 h-3.5 text-[#FF3E00]" />
              <span>NAHRÁT Z GALÉRIE</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>

            <p className="text-[10px] text-[#555] uppercase">OSTRÉ SVĚTLO ZAJISTÍ NEJLEPŠÍ PŘEPIS</p>
          </div>
        )}

      </div>
    </div>
  );
};
