import React, { useState, useRef, useEffect } from 'react';
import { Camera, Monitor, Upload, X, Check, RefreshCw, Sparkles, Tag, FileText, Clock, AlertCircle } from 'lucide-react';
import { BandPhoto, UserAccount } from '../types';
import { photoService } from '../services/photoService';

interface CaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured?: (photo: BandPhoto) => void;
  currentUser: UserAccount | null;
  initialMode?: 'camera' | 'screenshot' | 'upload';
}

export const CaptureModal: React.FC<CaptureModalProps> = ({
  isOpen,
  onClose,
  onPhotoCaptured,
  currentUser,
  initialMode = 'camera',
}) => {
  const [mode, setMode] = useState<'camera' | 'screenshot' | 'upload'>(initialMode);
  
  // Camera stream state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [useTimer, setUseTimer] = useState(false);

  // Screen capture state
  const [screenError, setScreenError] = useState<string | null>(null);
  const [isScreenCapturing, setIsScreenCapturing] = useState(false);

  // Captured image preview & form state
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedType, setCapturedType] = useState<'photo' | 'screenshot' | 'upload'>('photo');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Zkouška']);
  const [isSaving, setIsSaving] = useState(false);
  const [flashActive, setFlashActive] = useState(false);

  const AVAILABLE_TAGS = ['Akordy & Noty', 'Zkouška', 'Printscreen z PC', 'Vybavení / Aparát', 'Stage', 'Nápad', 'Tablatury'];

  // Sync mode with initialMode prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setCapturedDataUrl(null);
      setTitle(`Snímek ${new Date().toLocaleDateString('cs-CZ')} ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`);
      setNotes('');
      setCameraError(null);
      setScreenError(null);
    }
  }, [isOpen, initialMode]);

  // Start / Stop camera stream when mode changes
  useEffect(() => {
    if (isOpen && mode === 'camera' && !capturedDataUrl) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, mode, cameraFacing, capturedDataUrl]);

  // Global clipboard paste listener (Ctrl+V) when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const result = event.target?.result as string;
              if (result) {
                setCapturedDataUrl(result);
                setCapturedType('screenshot');
                setTitle(`Printscreen ze schránky ${new Date().toLocaleDateString('cs-CZ')} ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`);
                setSelectedTags(['Printscreen z PC']);
                stopCamera();
              }
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Váš prohlížeč nepodporuje přímý přístup ke kameře.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Nelze získat přístup ke kameře. Zkontrolujte oprávnění v prohlížeči nebo zvolte nahrání souboru.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const takeCameraSnapshot = () => {
    if (useTimer && countdown === null) {
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev === 1) {
            clearInterval(timer);
            executeCapture();
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
      return;
    }

    executeCapture();
  };

  const executeCapture = () => {
    if (!videoRef.current) return;

    // Flash animation
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 200);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCapturedDataUrl(dataUrl);
      setCapturedType('photo');
      setSelectedTags(['Zkouška']);
      stopCamera();
    }
  };

  const triggerScreenCapture = async () => {
    setScreenError(null);
    setIsScreenCapturing(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setScreenError('Váš prohlížeč nebo platforma nepodporuje snímání obrazovky (getDisplayMedia).');
        setIsScreenCapturing(false);
        return;
      }

      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        } as any,
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = mediaStream;
      video.autoplay = true;
      video.muted = true;

      video.onloadedmetadata = () => {
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1920;
          canvas.height = video.videoHeight || 1080;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            setCapturedDataUrl(dataUrl);
            setCapturedType('screenshot');
            setTitle(`Printscreen z PC ${new Date().toLocaleDateString('cs-CZ')} ${new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`);
            setSelectedTags(['Printscreen z PC']);
          }

          // Clean up track
          mediaStream.getTracks().forEach((track) => track.stop());
          setIsScreenCapturing(false);
        }, 300);
      };
    } catch (err: any) {
      console.warn('Screen capture cancelled or error:', err);
      setIsScreenCapturing(false);
      if (err.name !== 'NotAllowedError') {
        setScreenError('Snímání obrazovky bylo přerušeno nebo zamítnuto.');
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCapturedDataUrl(dataUrl);
        setCapturedType('upload');
        setTitle(file.name.replace(/\.[^/.]+$/, '') || 'Nahraný obrázek');
        setSelectedTags(['Akordy & Noty']);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSavePhoto = async () => {
    if (!capturedDataUrl) return;

    setIsSaving(true);
    try {
      const newPhoto = await photoService.savePhoto({
        title: title.trim() || 'Snímek bez názvu',
        dataUrl: capturedDataUrl,
        type: capturedType,
        authorId: currentUser?.id || 'guest',
        authorName: currentUser?.displayName || 'Člen Kapely',
        notes: notes.trim(),
        tags: selectedTags,
      });

      if (onPhotoCaptured) {
        onPhotoCaptured(newPhoto);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save photo:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm font-mono select-none">
      <div className="bg-[#0F0F0F] border-2 border-[#333] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-[8px_8px_0px_#000] overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#141414] border-b border-[#222] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-[#FF3E00] text-black font-black px-1.5 py-0.5 text-[11px] uppercase">
              FOTO_STUDIO
            </div>
            <h2 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-1.5">
              <span>Vyfotit / Snímek z PC</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#222] text-[#888] hover:text-white transition-none cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (When not viewing captured preview) */}
        {!capturedDataUrl && (
          <div className="flex border-b border-[#222] bg-[#0A0A0A]">
            <button
              onClick={() => setMode('camera')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase transition-none border-r border-[#222] cursor-pointer ${
                mode === 'camera'
                  ? 'bg-[#1A1A1A] text-[#FF3E00] border-b-2 border-b-[#FF3E00]'
                  : 'text-[#888] hover:text-white hover:bg-[#141414]'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Vyfotit kamerou</span>
            </button>

            <button
              onClick={() => setMode('screenshot')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase transition-none border-r border-[#222] cursor-pointer ${
                mode === 'screenshot'
                  ? 'bg-[#1A1A1A] text-[#00FF41] border-b-2 border-b-[#00FF41]'
                  : 'text-[#888] hover:text-white hover:bg-[#141414]'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>Printscreen PC</span>
            </button>

            <button
              onClick={() => setMode('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase transition-none cursor-pointer ${
                mode === 'upload'
                  ? 'bg-[#1A1A1A] text-white border-b-2 border-b-white'
                  : 'text-[#888] hover:text-white hover:bg-[#141414]'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Nahrát / Vložit</span>
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          
          {/* 1. CAPTURED PREVIEW & METADATA FORM */}
          {capturedDataUrl ? (
            <div className="flex flex-col gap-4">
              
              {/* Preview Box */}
              <div className="relative border-2 border-[#333] bg-black overflow-hidden rounded flex items-center justify-center max-h-[300px]">
                <img
                  src={capturedDataUrl}
                  alt="Náhled pořízeného snímku"
                  className="max-h-[300px] w-auto object-contain"
                />
                
                <div className="absolute top-2 left-2 bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white border border-[#444] uppercase flex items-center gap-1">
                  {capturedType === 'photo' && <Camera className="w-3 h-3 text-[#FF3E00]" />}
                  {capturedType === 'screenshot' && <Monitor className="w-3 h-3 text-[#00FF41]" />}
                  {capturedType === 'upload' && <Upload className="w-3 h-3 text-white]" />}
                  <span>{capturedType === 'photo' ? 'Foto z kamery' : capturedType === 'screenshot' ? 'Printscreen PC' : 'Nahráno'}</span>
                </div>

                <button
                  onClick={() => {
                    setCapturedDataUrl(null);
                    if (mode === 'camera') startCamera();
                  }}
                  className="absolute top-2 right-2 bg-black/90 hover:bg-[#222] text-white px-2.5 py-1 text-xs font-bold border border-[#555] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Vyfotit znovu</span>
                </button>
              </div>

              {/* Metadata Form */}
              <div className="flex flex-col gap-3 bg-[#141414] p-3 border border-[#222]">
                <div>
                  <label className="text-[11px] font-bold text-[#888] uppercase block mb-1">
                    Název snímku
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Např. Akordy z tabule - Stánky..."
                    className="w-full bg-[#0A0A0A] border border-[#333] focus:border-[#FF3E00] text-white px-3 py-1.5 text-xs outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#888] uppercase block mb-1">
                    Poznámka / Popis (volitelné)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Doplňující informace pro kapelu, nastavení efektů, poznámky..."
                    rows={2}
                    className="w-full bg-[#0A0A0A] border border-[#333] focus:border-[#FF3E00] text-white px-3 py-1.5 text-xs outline-none font-mono resize-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#888] uppercase block mb-1.5 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-[#FF3E00]" />
                    <span>Štítky / Kategorie</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {AVAILABLE_TAGS.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-none border cursor-pointer ${
                            isSelected
                              ? 'bg-[#FF3E00] text-black border-black font-black'
                              : 'bg-[#0A0A0A] text-[#888] border-[#333] hover:text-white'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Author Info */}
                <div className="text-[10px] text-[#666] flex items-center justify-between pt-1 border-t border-[#222]">
                  <span>Autor: <strong className="text-[#AAA]">{currentUser?.displayName || 'Člen Kapely'}</strong></span>
                  <span>Uloží se do sdílené sekce <strong>FOTKY</strong></span>
                </div>
              </div>

            </div>
          ) : (
            
            /* 2. CAPTURE MODES INTERFACE */
            <div className="flex-1 flex flex-col justify-center">
              
              {/* CAMERA MODE */}
              {mode === 'camera' && (
                <div className="flex flex-col gap-3 items-center">
                  
                  {cameraError ? (
                    <div className="w-full p-4 bg-[#2E1111] border border-[#FF3E00] text-[#FF9999] text-xs flex flex-col gap-2">
                      <div className="flex items-center gap-2 font-bold text-[#FF3E00]">
                        <AlertCircle className="w-4 h-4" />
                        <span>Kamera není dostupná</span>
                      </div>
                      <p>{cameraError}</p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={startCamera}
                          className="px-3 py-1 bg-[#FF3E00] text-black font-bold text-xs uppercase"
                        >
                          Zkusit znovu
                        </button>
                        <button
                          onClick={() => setMode('upload')}
                          className="px-3 py-1 bg-[#222] text-white text-xs uppercase hover:bg-[#333]"
                        >
                          Nahrát fotku ze souboru
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full relative bg-black border-2 border-[#333] rounded overflow-hidden aspect-video max-h-[360px] flex items-center justify-center">
                      
                      {/* Video Stream */}
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />

                      {/* Flash overlay */}
                      {flashActive && (
                        <div className="absolute inset-0 bg-white z-20 pointer-events-none transition-opacity" />
                      )}

                      {/* Viewfinder crosshairs / grid */}
                      <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/10">
                        <div className="border-r border-b border-white/10" />
                        <div className="border-r border-b border-white/10" />
                        <div className="border-b border-white/10" />
                        <div className="border-r border-b border-white/10" />
                        <div className="border-r border-b border-white/10" />
                        <div className="border-b border-white/10" />
                        <div className="border-r border-white/10" />
                        <div className="border-r border-white/10" />
                        <div />
                      </div>

                      {/* Countdown Display */}
                      {countdown !== null && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
                          <span className="text-7xl font-black text-[#FF3E00] animate-ping font-mono">
                            {countdown}
                          </span>
                        </div>
                      )}

                      {/* Top Viewfinder Controls */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
                        <div className="bg-black/80 px-2 py-0.5 text-[10px] text-[#00FF41] border border-[#00FF41]/40 flex items-center gap-1 font-mono">
                          <span className="w-2 h-2 rounded-full bg-[#00FF41] animate-pulse"></span>
                          <span>LIVE KAMERA</span>
                        </div>

                        <div className="flex gap-1.5">
                          {/* Timer Toggle */}
                          <button
                            type="button"
                            onClick={() => setUseTimer(!useTimer)}
                            className={`px-2 py-0.5 text-[10px] font-bold border flex items-center gap-1 cursor-pointer ${
                              useTimer ? 'bg-[#FF3E00] text-black border-black' : 'bg-black/80 text-[#AAA] border-[#555]'
                            }`}
                            title="Samospoušť 3 sekundy"
                          >
                            <Clock className="w-3 h-3" />
                            <span>3s</span>
                          </button>

                          {/* Flip Camera */}
                          <button
                            type="button"
                            onClick={() => setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'))}
                            className="px-2 py-0.5 text-[10px] font-bold bg-black/80 text-white border border-[#555] flex items-center gap-1 cursor-pointer hover:bg-[#222]"
                            title="Přepnout přední / zadní kameru"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Otočit</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* Bottom Snap Button */}
                  {!cameraError && (
                    <div className="flex justify-center w-full mt-1">
                      <button
                        type="button"
                        onClick={takeCameraSnapshot}
                        className="flex items-center gap-2 px-6 py-2.5 bg-[#FF3E00] hover:bg-[#FF5500] text-black font-black text-xs uppercase tracking-wider border border-black shadow-[3px_3px_0px_#000] cursor-pointer active:translate-x-0.5 active:translate-y-0.5 transition-none"
                      >
                        <Camera className="w-4 h-4" />
                        <span>VYFOTIT SNÍMEK</span>
                      </button>
                    </div>
                  )}

                </div>
              )}

              {/* SCREENSHOT MODE */}
              {mode === 'screenshot' && (
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#333] bg-[#0A0A0A] text-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#112E1B] border-2 border-[#00FF41] flex items-center justify-center text-[#00FF41]">
                    <Monitor className="w-7 h-7" />
                  </div>

                  <div className="max-w-md">
                    <h3 className="text-sm font-bold text-white uppercase mb-1">
                      Snímek obrazovky / Okna z PC (Printscreen)
                    </h3>
                    <p className="text-xs text-[#888] leading-relaxed">
                      Kliknutím na tlačítko níže otevřete výběr obrazovky, okna (např. DAW, Guitar Pro, YouTube) nebo záložky. Okamžitě se pořídí snímek ve vysokém rozlišení.
                    </p>
                  </div>

                  {screenError && (
                    <div className="p-2.5 bg-[#2E1111] border border-[#FF3E00] text-[#FF9999] text-xs max-w-md">
                      {screenError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={triggerScreenCapture}
                    disabled={isScreenCapturing}
                    className="flex items-center gap-2 px-6 py-3 bg-[#00FF41] hover:bg-[#00DD38] text-black font-black text-xs uppercase tracking-wider border border-black shadow-[3px_3px_0px_#000] cursor-pointer disabled:opacity-50"
                  >
                    <Monitor className="w-4 h-4" />
                    <span>{isScreenCapturing ? 'Snímám obrazovku...' : 'ZACHYTIT OBRAZOVKU PC'}</span>
                  </button>

                  <div className="text-[11px] text-[#666] flex items-center gap-1.5 mt-2 bg-[#141414] px-3 py-1.5 border border-[#222]">
                    <Sparkles className="w-3.5 h-3.5 text-[#00FF41]" />
                    <span>Nebo můžete kdykoliv stisknout <strong>Ctrl + V</strong> pro vložení snímku ze schránky!</span>
                  </div>
                </div>
              )}

              {/* UPLOAD & PASTE MODE */}
              {mode === 'upload' && (
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#333] bg-[#0A0A0A] text-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[#1A1A1A] border-2 border-[#555] flex items-center justify-center text-white">
                    <Upload className="w-7 h-7" />
                  </div>

                  <div className="max-w-md">
                    <h3 className="text-sm font-bold text-white uppercase mb-1">
                      Nahrát soubor nebo vložit ze schránky
                    </h3>
                    <p className="text-xs text-[#888] leading-relaxed">
                      Vyberte soubor obrázku z počítače / telefonu (PNG, JPG, WEBP) nebo stiskněte <strong className="text-white">Ctrl + V</strong> pro okamžité vložení zkopírovaného printscreenu.
                    </p>
                  </div>

                  <label className="flex items-center gap-2 px-6 py-2.5 bg-[#D1D1D1] hover:bg-white text-black font-black text-xs uppercase tracking-wider border border-black shadow-[3px_3px_0px_#000] cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>VYBRAT SOUBOR OBRÁZKU</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-[#141414] border-t border-[#222] px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] text-[#AAA] hover:text-white text-xs font-bold uppercase transition-none border border-[#333] cursor-pointer"
          >
            Zrušit
          </button>

          {capturedDataUrl && (
            <button
              type="button"
              onClick={handleSavePhoto}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 bg-[#00FF41] hover:bg-[#00DD38] text-black font-black text-xs uppercase tracking-wider border border-black shadow-[2px_2px_0px_#000] cursor-pointer disabled:opacity-50 transition-none"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'UKLÁDÁM...' : 'ULOŽIT DO FOTEK'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
