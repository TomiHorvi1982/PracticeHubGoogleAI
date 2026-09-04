import React, { useState, useEffect, useRef } from 'react';
import { CustomDrumKit, CustomDrumSample, DrumPad, MultiLayerSampleLayer } from '../types';
import { customDrumKitService } from '../services/customDrumKitService';
import { audioSynth } from '../services/audioSynth';
import {
  sampledDrumEngine,
  DrumArticulation,
  VelocityTier,
  VELOCITY_RANGES,
} from '../services/SampledDrumEngine';
import {
  parseDrumSampleFileName,
  ParsedDrumFileName,
} from '../services/drumSampleProcessor';
import {
  Mic, Square, Upload, Trash2, Plus, Download, Copy,
  Play, Check, Sparkles, Disc, AlertCircle, X,
  Radio, Volume2, Save, FileAudio, RotateCcw,
  Layers, Sliders, FolderUp, RefreshCw, Zap, ShieldCheck
} from 'lucide-react';

export interface PadConfigDef {
  id: DrumArticulation;
  name: string;
  czName: string;
  keyLabel: string;
  icon: string;
  category: 'kick' | 'snare' | 'hihat' | 'toms' | 'cymbals' | 'perc';
  desc: string;
}

export const EXTENDED_PAD_DEFINITIONS: PadConfigDef[] = [
  // Kick & Snares
  { id: 'kick', name: 'Bass Drum (Kick)', czName: 'Kopák (Střed)', keyLabel: 'Q', icon: '🥁', category: 'kick', desc: 'Hluboký basový úder' },
  { id: 'snare', name: 'Snare Drum (Center)', czName: 'Virbl (Střed)', keyLabel: 'W', icon: '🪘', category: 'snare', desc: 'Průrazný úder se struníkem' },
  { id: 'snare_rimshot', name: 'Snare Rimshot', czName: 'Virbl (Rimshot)', keyLabel: 'E', icon: '💥', category: 'snare', desc: 'Úder přes blánu a ráfek' },
  { id: 'snare_sidestick', name: 'Snare Cross-Stick', czName: 'Virbl (Side-Stick)', keyLabel: 'R', icon: '🪵', category: 'snare', desc: 'Dřevěný úder o ráfek' },

  // Hi-Hats
  { id: 'hihat_closed', name: 'Hi-Hat Closed', czName: 'Hi-Hat (Zavřená)', keyLabel: 'A', icon: '🪙', category: 'hihat', desc: 'Krátký těsný činelový tik' },
  { id: 'hihat_semi', name: 'Hi-Hat Semi-Open', czName: 'Hi-Hat (Polootevřená)', keyLabel: 'S', icon: '✨', category: 'hihat', desc: 'Středně otevřená hi-hat' },
  { id: 'hihat_open', name: 'Hi-Hat Open', czName: 'Hi-Hat (Otevřená)', keyLabel: 'D', icon: '🌟', category: 'hihat', desc: 'Znělý rozpuštěný činel' },
  { id: 'hihat_pedal', name: 'Hi-Hat Pedal Chick', czName: 'Hi-Hat (Pedál)', keyLabel: 'F', icon: '🦶', category: 'hihat', desc: 'Sešlápnutí pedálem' },

  // Toms
  { id: 'tom_high', name: 'High Rack Tom 10"', czName: 'Malý přechod 10"', keyLabel: 'T', icon: '🪘', category: 'toms', desc: 'Vysoký melodický tom' },
  { id: 'tom_mid', name: 'Mid Rack Tom 12"', czName: 'Střední přechod 12"', keyLabel: 'Y', icon: '🪘', category: 'toms', desc: 'Střední tom přechod' },
  { id: 'tom_low', name: 'Floor Tom 16"', czName: 'Velký kotel 16"', keyLabel: 'U', icon: '🥁', category: 'toms', desc: 'Hluboký basový kotel' },

  // Cymbals
  { id: 'crash_left', name: 'Crash Cymbal 16"', czName: 'Crash činel 16"', keyLabel: 'G', icon: '💥', category: 'cymbals', desc: 'Akcentový činel vlevo' },
  { id: 'crash_right', name: 'Crash Cymbal 18"', czName: 'Crash činel 18"', keyLabel: 'H', icon: '⚡', category: 'cymbals', desc: 'Těžký crash vpravo' },
  { id: 'ride_bow', name: 'Ride Cymbal (Bow)', czName: 'Ride (Tělo)', keyLabel: 'J', icon: '🛸', category: 'cymbals', desc: 'Zvonivý doprovodný činel' },
  { id: 'ride_bell', name: 'Ride Cymbal (Bell)', czName: 'Ride (Zvon)', keyLabel: 'K', icon: '🔔', category: 'cymbals', desc: 'Pronikavý úder na zvon' },
  { id: 'china', name: 'China Cymbal', czName: 'China činel', keyLabel: 'L', icon: '🔥', category: 'cymbals', desc: 'Efektový agresivní činel' },
  { id: 'splash', name: 'Splash Cymbal', czName: 'Splash činel', keyLabel: 'Z', icon: '💦', category: 'cymbals', desc: 'Rychlý krátký splash' },

  // Percussion
  { id: 'tambourine', name: 'Tambourine', czName: 'Tamburína', keyLabel: 'X', icon: '🪇', category: 'perc', desc: 'Chrastivý úder tamburíny' },
  { id: 'cowbell', name: 'Cowbell', czName: 'Kravský zvonec', keyLabel: 'C', icon: '🛎️', category: 'perc', desc: 'Rytmický kovový zvonec' },
  { id: 'shaker', name: 'Studio Shaker', czName: 'Šejkr', keyLabel: 'V', icon: '🧂', category: 'perc', desc: 'Jemný studiový šejkr' },
  { id: 'handclap', name: 'Hand Clap', czName: 'Tlesknutí', keyLabel: 'B', icon: '👏', category: 'perc', desc: 'Skupinové tlesknutí' },
];

const ICONS = ['🥁', '⚡', '🤘', '🚀', '🎛️', '🔥', '🔊', '💥', '🎷', '☕', '🌟', '🎧'];

const VELOCITY_TIER_OPTIONS: { tier: VelocityTier; label: string; range: string; desc: string }[] = [
  { tier: 'soft', label: 'Soft (pp)', range: '1-30', desc: 'Velmi jemný dynamický úder / ghost note' },
  { tier: 'med_soft', label: 'Med-Soft (p)', range: '31-60', desc: 'Lehký tichý úder' },
  { tier: 'med', label: 'Medium (mf)', range: '61-90', desc: 'Střední přirozený úder (standard)' },
  { tier: 'hard', label: 'Hard (f)', range: '91-110', desc: 'Silný důrazný úder' },
  { tier: 'very_hard', label: 'Very Hard (ff)', range: '111-127', desc: 'Maximální akcent / rimshot forte' },
];

interface CustomDrumKitModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKitId?: string;
  onSelectKit: (kitId: string) => void;
}

export const CustomDrumKitModal: React.FC<CustomDrumKitModalProps> = ({
  isOpen,
  onClose,
  currentKitId,
  onSelectKit,
}) => {
  const [kits, setKits] = useState<CustomDrumKit[]>([]);
  const [activeKit, setActiveKit] = useState<CustomDrumKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Tab View: 'pads' | 'multilayer' | 'batch'
  const [activeTab, setActiveTab] = useState<'pads' | 'multilayer' | 'batch'>('pads');

  // Selected articulation in multilayer view
  const [selectedPadId, setSelectedPadId] = useState<DrumArticulation>('snare');
  const [selectedVelocityTier, setSelectedVelocityTier] = useState<VelocityTier>('med');
  const [testVelocity, setTestVelocity] = useState<number>(85);
  const [lastHitRR, setLastHitRR] = useState<number>(1);

  // Recording State
  const [recordingPadId, setRecordingPadId] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Drag and Drop state
  const [dragOverPadId, setDragOverPadId] = useState<string | null>(null);
  const [isBatchDragOver, setIsBatchDragOver] = useState(false);
  const [batchParsedFiles, setBatchParsedFiles] = useState<{
    file: File;
    name: string;
    parsed: ParsedDrumFileName;
    status: 'pending' | 'imported' | 'failed';
  }[]>([]);

  // Hidden File Inputs
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadKits();
      const unsub = sampledDrumEngine.subscribeVoice((ev) => {
        setLastHitRR(ev.roundRobinIndex);
      });
      return () => unsub();
    }
  }, [isOpen]);

  const loadKits = async () => {
    setLoading(true);
    try {
      const allKits = await customDrumKitService.getAllKits();
      setKits(allKits);

      if (allKits.length > 0) {
        const found = currentKitId ? allKits.find((k) => k.id === currentKitId) : null;
        setActiveKit(found || allKits[0]);
      } else {
        // Create first custom kit
        const newKit = customDrumKitService.createEmptyKit('Moje První Sada Bicích', 'Rock');
        await customDrumKitService.saveKit(newKit);
        setKits([newKit]);
        setActiveKit(newKit);
      }
    } catch (err) {
      console.error('Failed to load custom kits:', err);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // --- KIT MANAGEMENT ---
  const handleCreateNewKit = async () => {
    const name = `Nová Sada ${kits.length + 1}`;
    const newKit = customDrumKitService.createEmptyKit(name, 'Custom');
    await customDrumKitService.saveKit(newKit);
    const updated = [...kits, newKit];
    setKits(updated);
    setActiveKit(newKit);
    showNotification(`Vytvořena nová sada "${name}"`, 'success');
  };

  const handleDuplicateKit = async () => {
    if (!activeKit) return;
    const duplicated: CustomDrumKit = {
      ...activeKit,
      id: crypto.randomUUID(),
      name: `${activeKit.name} (Kopie)`,
      czName: `${activeKit.name} (Kopie)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      samples: { ...(activeKit.samples || {}) },
      multiLayers: activeKit.multiLayers ? JSON.parse(JSON.stringify(activeKit.multiLayers)) : {},
    };
    await customDrumKitService.saveKit(duplicated);
    const updated = [...kits, duplicated];
    setKits(updated);
    setActiveKit(duplicated);
    showNotification(`Sada zkopírována jako "${duplicated.name}"`, 'success');
  };

  const handleDeleteKit = async () => {
    if (!activeKit) return;
    if (!window.confirm(`Opravdu chcete smazat sadu bicích "${activeKit.name}"?`)) return;

    await customDrumKitService.deleteKit(activeKit.id);
    const updated = kits.filter((k) => k.id !== activeKit.id);
    setKits(updated);

    if (updated.length > 0) {
      setActiveKit(updated[0]);
    } else {
      const newKit = customDrumKitService.createEmptyKit('Moje Sada Bicích', 'Custom');
      await customDrumKitService.saveKit(newKit);
      setKits([newKit]);
      setActiveKit(newKit);
    }
    showNotification(`Sada "${activeKit.name}" byla smazána`, 'info');
  };

  const handleSaveActiveKit = async () => {
    if (!activeKit) return;
    try {
      await customDrumKitService.saveKit(activeKit);
      setKits((prev) => prev.map((k) => (k.id === activeKit.id ? activeKit : k)));
      sampledDrumEngine.setActiveKit(activeKit.id);
      showNotification(`Sada "${activeKit.name}" byla úspěšně uložena a aktivována v enginu bicích!`, 'success');
      onSelectKit(activeKit.id);
    } catch (err) {
      console.error(err);
      showNotification('Chyba při ukládání sady.', 'error');
    }
  };

  // --- SINGLE SAMPLE IMPORT & UPLOAD ---
  const handleFileUpload = async (padId: DrumArticulation, file: File, tier: VelocityTier = 'med', roundRobin: number = 1) => {
    if (!activeKit) return;

    if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|flac|aac|m4a)$/i)) {
      showNotification('Prosím vyberte platný zvukový soubor (.wav, .mp3, .ogg, .flac, .m4a)', 'error');
      return;
    }

    try {
      showNotification(`Načítám a dekóduji ${file.name}...`, 'info');
      const dataUrl = await customDrumKitService.readFileAsDataUrl(file);

      // Load into SampledDrumEngine high-resolution multi-layer buffer
      const decodedBuffer = await sampledDrumEngine.loadCustomWavSample(
        activeKit.id,
        padId,
        dataUrl,
        tier,
        roundRobin
      );

      const layer: MultiLayerSampleLayer = {
        tier,
        roundRobin,
        name: file.name,
        dataUrl,
        size: file.size,
        duration: Math.round(decodedBuffer.duration * 100) / 100,
        uploadedAt: Date.now(),
      };

      // Legacy fallback entry for 8 pad backward compatibility
      const legacySample: CustomDrumSample = {
        padId,
        name: file.name,
        dataUrl,
        size: file.size,
        duration: Math.round(decodedBuffer.duration * 100) / 100,
        uploadedAt: Date.now(),
        tier,
        roundRobin,
      };

      const updatedMultiLayers = { ...(activeKit.multiLayers || {}) };
      if (!updatedMultiLayers[padId]) {
        updatedMultiLayers[padId] = {};
      }
      const layerKey = `${tier}:rr${roundRobin}`;
      updatedMultiLayers[padId][layerKey] = layer;

      const updatedSamples = { ...(activeKit.samples || {}), [padId]: legacySample };
      const updatedKit: CustomDrumKit = {
        ...activeKit,
        samples: updatedSamples,
        multiLayers: updatedMultiLayers,
      };

      setActiveKit(updatedKit);
      await customDrumKitService.saveKit(updatedKit);
      setKits((prev) => prev.map((k) => (k.id === updatedKit.id ? updatedKit : k)));

      // Play test sound with exact velocity
      sampledDrumEngine.triggerPad(padId, testVelocity, activeKit.id);
      showNotification(`Vzorek pro ${padDefName(padId)} (${tier.toUpperCase()}, RR${roundRobin}) úspěšně načten!`, 'success');
    } catch (err) {
      console.error('File load failed:', err);
      showNotification('Nepodařilo se dekódovat audio soubor.', 'error');
    }
  };

  const handleRemoveSample = async (padId: DrumArticulation, tier?: VelocityTier, roundRobin?: number) => {
    if (!activeKit) return;

    if (tier && roundRobin) {
      // Remove specific layer
      const updated = await customDrumKitService.removeMultiLayerSample(activeKit.id, padId, tier, roundRobin);
      if (updated) {
        setActiveKit(updated);
        setKits((prev) => prev.map((k) => (k.id === updated.id ? updated : k)));
      }
      showNotification(`Vrstva ${tier.toUpperCase()} RR${roundRobin} smazána`, 'info');
    } else {
      // Remove entire pad
      const updatedSamples = { ...(activeKit.samples || {}) };
      delete updatedSamples[padId];

      const updatedMultiLayers = { ...(activeKit.multiLayers || {}) };
      delete updatedMultiLayers[padId];

      const updatedKit: CustomDrumKit = { ...activeKit, samples: updatedSamples, multiLayers: updatedMultiLayers };
      setActiveKit(updatedKit);
      await customDrumKitService.saveKit(updatedKit);
      setKits((prev) => prev.map((k) => (k.id === updatedKit.id ? updatedKit : k)));
      showNotification(`Všechny vzorky pro ${padDefName(padId)} byly smazány`, 'info');
    }
  };

  // --- BATCH MULTI-FILE IMPORT ---
  const handleBatchFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const list = Array.from(files).map((file) => {
      const parsed = parseDrumSampleFileName(file.name);
      return {
        file,
        name: file.name,
        parsed,
        status: 'pending' as const,
      };
    });

    setBatchParsedFiles(list);
    setActiveTab('batch');
    showNotification(`Analyzováno ${list.length} zvukových souborů. Zkontrolujte přiřazení a klikněte na Importovat.`, 'info');
  };

  const handleExecuteBatchImport = async () => {
    if (!activeKit || batchParsedFiles.length === 0) return;

    showNotification(`Importuji ${batchParsedFiles.length} vzorků do sady ${activeKit.name}...`, 'info');
    let importedCount = 0;

    const updatedKit: CustomDrumKit = {
      ...activeKit,
      samples: { ...(activeKit.samples || {}) },
      multiLayers: { ...(activeKit.multiLayers || {}) },
    };

    for (let i = 0; i < batchParsedFiles.length; i++) {
      const item = batchParsedFiles[i];
      const art = item.parsed.articulation || 'snare';
      const tier = item.parsed.tier || 'med';
      const rr = item.parsed.roundRobin || 1;

      try {
        const dataUrl = await customDrumKitService.readFileAsDataUrl(item.file);
        const decodedBuffer = await sampledDrumEngine.loadCustomWavSample(
          updatedKit.id,
          art,
          dataUrl,
          tier,
          rr
        );

        if (!updatedKit.multiLayers![art]) {
          updatedKit.multiLayers![art] = {};
        }

        const layerKey = `${tier}:rr${rr}`;
        updatedKit.multiLayers![art][layerKey] = {
          tier,
          roundRobin: rr,
          name: item.file.name,
          dataUrl,
          size: item.file.size,
          duration: Math.round(decodedBuffer.duration * 100) / 100,
          uploadedAt: Date.now(),
        };

        updatedKit.samples[art] = {
          padId: art,
          name: item.file.name,
          dataUrl,
          size: item.file.size,
          duration: Math.round(decodedBuffer.duration * 100) / 100,
          uploadedAt: Date.now(),
          tier,
          roundRobin: rr,
        };

        item.status = 'imported';
        importedCount++;
      } catch (err) {
        console.error(`Batch import failed for ${item.name}:`, err);
        item.status = 'failed';
      }
    }

    setActiveKit(updatedKit);
    await customDrumKitService.saveKit(updatedKit);
    setKits((prev) => prev.map((k) => (k.id === updatedKit.id ? updatedKit : k)));
    setBatchParsedFiles([...batchParsedFiles]);

    showNotification(`Úspěšně importováno ${importedCount} vzorků s multi-velocity & round-robin vrstvami!`, 'success');
  };

  // --- MICROPHONE RECORDING ---
  const startRecording = async (padId: DrumArticulation, tier: VelocityTier = 'med') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        stream.getTracks().forEach((track) => track.stop());

        if (activeKit && audioBlob.size > 100) {
          const dataUrl = await customDrumKitService.readFileAsDataUrl(audioBlob);
          const decoded = await sampledDrumEngine.loadCustomWavSample(activeKit.id, padId, dataUrl, tier, 1);

          const sample: CustomDrumSample = {
            padId,
            name: `Nahrávka_${padId}_${new Date().toLocaleTimeString().replace(/:/g, '-')}`,
            dataUrl,
            size: audioBlob.size,
            duration: Math.round(decoded.duration * 100) / 100,
            uploadedAt: Date.now(),
            tier,
            roundRobin: 1,
          };

          const updatedSamples = { ...(activeKit.samples || {}), [padId]: sample };
          const updatedKit: CustomDrumKit = { ...activeKit, samples: updatedSamples };

          setActiveKit(updatedKit);
          await customDrumKitService.saveKit(updatedKit);
          setKits((prev) => prev.map((k) => (k.id === updatedKit.id ? updatedKit : k)));

          sampledDrumEngine.triggerPad(padId, testVelocity, updatedKit.id);
          showNotification(`Nahrávka uložena pro ${padDefName(padId)}!`, 'success');
        }
      };

      mediaRecorder.start();
      setRecordingPadId(padId);
      setRecordingTime(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingTime((t) => {
          if (t >= 5) {
            stopRecording();
            return 5;
          }
          return t + 0.1;
        });
      }, 100);
    } catch (err) {
      console.error('Microphone error:', err);
      showNotification('Nelze získat přístup k mikrofonu.', 'error');
    }
  };

  const stopRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecordingPadId(null);
  };

  // --- EXPORT & IMPORT ---
  const handleExportKit = () => {
    if (!activeKit) return;
    const jsonStr = JSON.stringify(activeKit, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DrumKit_${activeKit.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification(`Sada "${activeKit.name}" exportována do souboru`, 'success');
  };

  const handleImportKit = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported: CustomDrumKit = JSON.parse(reader.result as string);
        if (!imported.id || !imported.name) {
          throw new Error('Neplatný formát bicí sady');
        }
        imported.id = crypto.randomUUID();
        imported.name = `${imported.name} (Importováno)`;

        await customDrumKitService.saveKit(imported);
        const updated = [...kits, imported];
        setKits(updated);
        setActiveKit(imported);
        showNotification(`Sada "${imported.name}" úspěšně importována!`, 'success');
      } catch (err) {
        console.error(err);
        showNotification('Chyba při importu: neplatný JSON soubor bicí sady.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Test Play with Exact Velocity and Round-Robin Cycling
  const handleTestPlay = (padId: DrumArticulation, vel = testVelocity) => {
    if (!activeKit) return;
    sampledDrumEngine.triggerPad(padId, vel, activeKit.id);
  };

  const padDefName = (id: DrumArticulation) => {
    const p = EXTENDED_PAD_DEFINITIONS.find((x) => x.id === id);
    return p ? p.czName : id;
  };

  if (!isOpen) return null;

  return (
    <div
      id="custom-drum-kit-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-plocha-2 border border-white/15 rounded-3xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-plocha-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-znacka/20 border border-znacka/40 flex items-center justify-center text-xl shadow-inner">
              {activeKit?.icon || '🥁'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-znacka text-black font-extrabold text-stitek px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Sampled Drum Engine Pro
                </span>
                <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
                  Multi-Velocity Layers • Round-Robin Anti-Machine-Gun • WAV 24-bit
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                Správce Vlastních Zvuků & Audio Vzorků Bicích
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleCreateNewKit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-uspech/20 hover:bg-uspech/30 text-uspech border border-uspech/40 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nová sada</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 text-neutral-400 hover:text-white rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* STATUS NOTIFICATION BAR */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs font-semibold flex items-center justify-between transition-all ${
              statusMessage.type === 'success'
                ? 'bg-uspech/20 text-uspech border-b border-uspech/30'
                : statusMessage.type === 'error'
                ? 'bg-chyba/20 text-chyba border-b border-chyba/30'
                : 'bg-info/20 text-info border-b border-info/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-xs hover:underline">
              Zavřít
            </button>
          </div>
        )}

        {/* KIT SELECTOR & METADATA BAR */}
        <div className="p-4 border-b border-white/10 bg-black/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Kit Switcher Pill Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin flex-1">
            <span className="text-drobne font-bold text-neutral-400 uppercase tracking-wider mr-1 whitespace-nowrap">
              Sady ({kits.length}):
            </span>
            {kits.map((kit) => {
              const isSelected = activeKit?.id === kit.id;
              const sampleCount = Object.keys(kit.samples || {}).length;
              const multiCount = kit.multiLayers ? Object.keys(kit.multiLayers).length : 0;
              return (
                <button
                  key={kit.id}
                  onClick={() => setActiveKit(kit)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-znacka text-black shadow-md'
                      : 'bg-white/5 text-neutral-300 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <span>{kit.icon || '🥁'}</span>
                  <span>{kit.name}</span>
                  <span
                    className={`text-stitek px-1.5 py-0.2 rounded-md ${
                      isSelected ? 'bg-black/30 text-white' : 'bg-white/10 text-neutral-400'
                    }`}
                  >
                    {multiCount > 0 ? `${multiCount} multi` : `${sampleCount} padů`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action Buttons */}
          {activeKit && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleDuplicateKit}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white rounded-xl text-xs font-medium border border-white/10 transition-all cursor-pointer"
                title="Vytvořit kopii sady"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kopie</span>
              </button>

              <button
                onClick={handleExportKit}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white rounded-xl text-xs font-medium border border-white/10 transition-all cursor-pointer"
                title="Exportovat sadu do JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>

              <label className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white rounded-xl text-xs font-medium border border-white/10 transition-all cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Import</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportKit}
                  className="hidden"
                />
              </label>

              <button
                onClick={handleDeleteKit}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-chyba/10 hover:bg-chyba/20 text-chyba rounded-xl text-xs font-medium border border-chyba/20 transition-all cursor-pointer"
                title="Smazat sadu"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ACTIVE KIT DETAILS & TAB SWITCHER */}
        {activeKit && (
          <div className="px-4 py-3 bg-plocha-3 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <input
                type="text"
                value={activeKit.name}
                onChange={(e) => setActiveKit({ ...activeKit, name: e.target.value, czName: e.target.value })}
                placeholder="Název sady bicích"
                className="bg-black/50 text-white font-bold text-sm px-3 py-1.5 rounded-xl border border-white/15 focus:border-znacka outline-none max-w-xs"
              />
              <select
                value={activeKit.icon || '🥁'}
                onChange={(e) => setActiveKit({ ...activeKit, icon: e.target.value })}
                className="bg-black/50 text-white font-bold text-sm px-2 py-1.5 rounded-xl border border-white/15 outline-none cursor-pointer"
              >
                {ICONS.map((ico) => (
                  <option key={ico} value={ico}>
                    {ico}
                  </option>
                ))}
              </select>
            </div>

            {/* TAB SELECTOR: Quick Pads | Multi-Velocity Studio | Batch Dropzone */}
            <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setActiveTab('pads')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'pads'
                    ? 'bg-znacka text-black shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Disc className="w-3.5 h-3.5" />
                <span>Pady bicích</span>
              </button>

              <button
                onClick={() => setActiveTab('multilayer')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'multilayer'
                    ? 'bg-znacka text-black shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Multi-Velocity & Round-Robin</span>
              </button>

              <button
                onClick={() => setActiveTab('batch')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'batch'
                    ? 'bg-znacka text-black shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <FolderUp className="w-3.5 h-3.5" />
                <span>Hromadný import WAV</span>
              </button>
            </div>
          </div>
        )}

        {/* MODAL MAIN CONTENT AREA */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 max-h-[58vh] space-y-4">
          {/* ========================================================================= */}
          {/* TAB 1: QUICK PADS OVERVIEW */}
          {/* ========================================================================= */}
          {activeTab === 'pads' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Disc className="w-4 h-4 text-znacka" />
                    Pady Bicí Soustavy (Kick, Snare, Toms, Cymbals, Percussion)
                  </h3>
                  <p className="text-drobne text-neutral-400 mt-0.5">
                    Přetáhněte sem libovolný audio soubor (.wav, .mp3) nebo nahrajte z mikrofonu. Engine automaticky odvodí dynamické multi-velocity vrstvy a round-robin micro-variace.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {EXTENDED_PAD_DEFINITIONS.map((padDef) => {
                  const sample: CustomDrumSample | undefined = activeKit?.samples?.[padDef.id];
                  const multiMap = activeKit?.multiLayers?.[padDef.id];
                  const multiLayerCount = multiMap ? Object.keys(multiMap).length : 0;
                  const hasCustomSample = !!sample?.dataUrl || multiLayerCount > 0;
                  const isRecording = recordingPadId === padDef.id;
                  const isDragOver = dragOverPadId === padDef.id;

                  return (
                    <div
                      key={padDef.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverPadId(padDef.id);
                      }}
                      onDragLeave={() => setDragOverPadId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverPadId(null);
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          handleFileUpload(padDef.id, file);
                        }
                      }}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        isRecording
                          ? 'bg-chyba/15 border-chyba animate-pulse'
                          : isDragOver
                          ? 'bg-znacka/20 border-znacka scale-[1.01]'
                          : hasCustomSample
                          ? 'bg-black/40 border-uspech/40 hover:border-uspech'
                          : 'bg-black/30 border-white/10 hover:border-white/20'
                      }`}
                    >
                      {/* Slot Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-lg">
                            {padDef.icon}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono font-bold text-znacka bg-black/60 px-1.5 py-0.5 rounded border border-white/10">
                                [{padDef.keyLabel}]
                              </span>
                              <h4 className="text-xs sm:text-sm font-bold text-white leading-tight">
                                {padDef.czName}
                              </h4>
                            </div>
                            <span className="text-stitek text-neutral-400 block font-medium mt-0.5">
                              {padDef.desc}
                            </span>
                          </div>
                        </div>

                        {/* Status badge */}
                        {multiLayerCount > 0 ? (
                          <span className="text-stitek font-mono font-bold text-znacka bg-znacka/10 px-2 py-0.5 rounded-md border border-znacka/30 flex items-center gap-1 whitespace-nowrap">
                            <Layers className="w-3 h-3" />
                            <span>{multiLayerCount} Multi-vrstev</span>
                          </span>
                        ) : hasCustomSample ? (
                          <span className="text-stitek font-mono font-bold text-uspech bg-uspech/10 px-2 py-0.5 rounded-md border border-uspech/20 flex items-center gap-1 whitespace-nowrap">
                            <Check className="w-3 h-3" />
                            <span>WAV ({sample?.duration}s)</span>
                          </span>
                        ) : (
                          <span className="text-stitek font-mono font-medium text-neutral-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5 whitespace-nowrap">
                            Fyzikální model
                          </span>
                        )}
                      </div>

                      {/* Sample info if uploaded */}
                      {hasCustomSample && (
                        <div className="px-2.5 py-1.5 bg-white/[0.03] rounded-xl border border-white/5 flex items-center justify-between text-drobne text-neutral-300">
                          <div className="flex items-center gap-1.5 truncate mr-2">
                            <FileAudio className="w-3.5 h-3.5 text-uspech shrink-0" />
                            <span className="truncate font-semibold">{sample?.name || 'Vlastní WAV vzorek'}</span>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedPadId(padDef.id);
                              setActiveTab('multilayer');
                            }}
                            className="text-stitek font-bold text-znacka hover:underline whitespace-nowrap cursor-pointer"
                          >
                            Upravit vrstvy &rarr;
                          </button>
                        </div>
                      )}

                      {/* Recording Live Indicator */}
                      {isRecording && (
                        <div className="px-3 py-2 bg-chyba/20 border border-chyba/40 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-chyba">
                            <span className="w-2.5 h-2.5 rounded-full bg-chyba animate-ping" />
                            <span>Nahrávám z mikrofonu... {recordingTime.toFixed(1)}s</span>
                          </div>
                          <button
                            onClick={stopRecording}
                            className="px-2.5 py-1 bg-chyba text-white rounded-lg text-xs font-bold hover:bg-chyba/80 cursor-pointer flex items-center gap-1"
                          >
                            <Square className="w-3 h-3 fill-white" />
                            <span>Zastavit</span>
                          </button>
                        </div>
                      )}

                      {/* Slot Action Controls */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
                        <button
                          onClick={() => handleTestPlay(padDef.id)}
                          className="px-2.5 py-1.5 bg-white/5 hover:bg-white/15 text-neutral-200 hover:text-white rounded-xl text-xs font-semibold border border-white/10 flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                          title="Přehrát zvuk tohoto padu"
                        >
                          <Play className="w-3.5 h-3.5 text-uspech fill-uspech" />
                          <span>Přehrát</span>
                        </button>

                        <input
                          type="file"
                          ref={(el) => {
                            fileInputRefs.current[padDef.id] = el;
                          }}
                          accept="audio/*,.wav,.mp3,.ogg,.flac,.aac,.m4a"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(padDef.id, file);
                              e.target.value = '';
                            }
                          }}
                        />
                        <button
                          onClick={() => fileInputRefs.current[padDef.id]?.click()}
                          className="px-2.5 py-1.5 bg-white/5 hover:bg-znacka/20 hover:text-znacka hover:border-znacka/30 text-neutral-300 rounded-xl text-xs font-semibold border border-white/10 flex items-center gap-1 transition-all cursor-pointer"
                          title="Nahrát vlastní WAV soubor"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Vložit WAV</span>
                        </button>

                        {!isRecording ? (
                          <button
                            onClick={() => startRecording(padDef.id)}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-chyba/20 hover:text-chyba hover:border-chyba/30 text-neutral-300 rounded-xl text-xs font-semibold border border-white/10 flex items-center gap-1 transition-all cursor-pointer"
                            title="Nahrát živý zvuk z mikrofonu"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>Mic</span>
                          </button>
                        ) : (
                          <button
                            onClick={stopRecording}
                            className="px-2.5 py-1.5 bg-chyba text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Square className="w-3.5 h-3.5 fill-white" />
                            <span>Stop</span>
                          </button>
                        )}

                        {hasCustomSample && (
                          <button
                            onClick={() => handleRemoveSample(padDef.id)}
                            className="ml-auto p-1.5 text-neutral-400 hover:text-chyba hover:bg-chyba/10 rounded-lg transition-all cursor-pointer"
                            title="Resetovat na výchozí zvuk"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: MULTI-VELOCITY & ROUND-ROBIN STUDIO */}
          {/* ========================================================================= */}
          {activeTab === 'multilayer' && (
            <div className="space-y-4">
              {/* Articulation Selector Strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {EXTENDED_PAD_DEFINITIONS.map((pad) => {
                  const isSel = selectedPadId === pad.id;
                  const layerCount = activeKit?.multiLayers?.[pad.id]
                    ? Object.keys(activeKit.multiLayers[pad.id]).length
                    : activeKit?.samples?.[pad.id]
                    ? 1
                    : 0;

                  return (
                    <button
                      key={pad.id}
                      onClick={() => setSelectedPadId(pad.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                        isSel
                          ? 'bg-znacka text-black border-znacka shadow-md'
                          : 'bg-white/5 text-neutral-300 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      <span>{pad.icon}</span>
                      <span>{pad.czName}</span>
                      {layerCount > 0 && (
                        <span
                          className={`text-stitek px-1.5 py-0.2 rounded-md ${
                            isSel ? 'bg-black/30 text-white' : 'bg-uspech/20 text-uspech'
                          }`}
                        >
                          {layerCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Pad Detail Banner & Test Controller */}
              <div className="p-4 bg-black/50 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-znacka/20 border border-znacka/40 flex items-center justify-center text-2xl">
                    {EXTENDED_PAD_DEFINITIONS.find((p) => p.id === selectedPadId)?.icon || '🥁'}
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                      {padDefName(selectedPadId)}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      5 Dynamických Velocity vrstev (Soft..Very Hard) x 4 Round-Robin variace
                    </p>
                  </div>
                </div>

                {/* Velocity Test Controller with Live Round-Robin Badge */}
                <div className="flex items-center gap-3 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between text-drobne text-neutral-300 font-bold mb-1">
                      <span>Testovací Velocity:</span>
                      <span className="font-mono text-znacka">{testVelocity} (1-127)</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={127}
                      value={testVelocity}
                      onChange={(e) => setTestVelocity(parseInt(e.target.value, 10))}
                      className="w-32 accent-znacka cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={() => handleTestPlay(selectedPadId, testVelocity)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-uspech hover:bg-uspech/90 text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>Otestovat</span>
                  </button>

                  <div className="flex flex-col items-center">
                    <span className="text-stitek text-neutral-400 uppercase font-bold">Poslední RR</span>
                    <span className="text-xs font-mono font-extrabold px-2 py-0.5 bg-znacka/20 text-znacka rounded-md border border-znacka/30">
                      RR{lastHitRR}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5 Velocity Tiers Matrix */}
              <div className="space-y-3">
                {VELOCITY_TIER_OPTIONS.map((tierOpt) => {
                  const isSelectedTier = selectedVelocityTier === tierOpt.tier;

                  return (
                    <div
                      key={tierOpt.tier}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isSelectedTier
                          ? 'bg-plocha-3 border-znacka/50 shadow-md'
                          : 'bg-black/30 border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-znacka font-mono bg-black/60 px-2 py-0.5 rounded border border-white/10">
                            {tierOpt.label}
                          </span>
                          <span className="text-xs font-bold text-white">
                            MIDI Velocity: {tierOpt.range}
                          </span>
                          <span className="text-drobne text-neutral-400 hidden md:inline">
                            &bull; {tierOpt.desc}
                          </span>
                        </div>

                        {/* Test this specific velocity tier */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const velValues = { soft: 20, med_soft: 45, med: 75, hard: 100, very_hard: 125 };
                              handleTestPlay(selectedPadId, velValues[tierOpt.tier]);
                            }}
                            className="px-2.5 py-1 bg-white/5 hover:bg-white/15 text-neutral-200 text-drobne font-semibold rounded-lg border border-white/10 flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-uspech fill-uspech" />
                            <span>Zahrát {tierOpt.tier}</span>
                          </button>
                        </div>
                      </div>

                      {/* 4 Round-Robin Variation Slots */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map((rrIndex) => {
                          const layerKey = `${tierOpt.tier}:rr${rrIndex}`;
                          const customLayer = activeKit?.multiLayers?.[selectedPadId]?.[layerKey];
                          const hasLayer = !!customLayer?.dataUrl;
                          const isLastHit = lastHitRR === rrIndex && selectedVelocityTier === tierOpt.tier;

                          return (
                            <div
                              key={rrIndex}
                              className={`p-2.5 rounded-xl border flex flex-col justify-between space-y-2 transition-all ${
                                isLastHit
                                  ? 'bg-znacka/20 border-znacka'
                                  : hasLayer
                                  ? 'bg-black/60 border-uspech/40'
                                  : 'bg-black/40 border-white/5'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-drobne font-mono font-bold text-white flex items-center gap-1">
                                  <Zap className="w-3 h-3 text-znacka" />
                                  RR {rrIndex}
                                </span>
                                {hasLayer ? (
                                  <span className="text-stitek font-bold text-uspech bg-uspech/10 px-1.5 py-0.2 rounded border border-uspech/20">
                                    Vlastní WAV
                                  </span>
                                ) : (
                                  <span className="text-stitek text-neutral-400 font-mono">
                                    Anti-MG Micro-DSP
                                  </span>
                                )}
                              </div>

                              <div className="text-stitek text-neutral-300 truncate">
                                {hasLayer ? customLayer.name : 'Automaticky generováno enginem'}
                              </div>

                              <div className="flex items-center justify-between pt-1 border-t border-white/5">
                                <label className="text-stitek text-znacka hover:underline font-bold cursor-pointer flex items-center gap-1">
                                  <Upload className="w-2.5 h-2.5" />
                                  <span>{hasLayer ? 'Změnit' : 'Nahrát WAV'}</span>
                                  <input
                                    type="file"
                                    accept="audio/*,.wav,.mp3,.ogg,.flac"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        handleFileUpload(selectedPadId, file, tierOpt.tier, rrIndex);
                                        e.target.value = '';
                                      }
                                    }}
                                  />
                                </label>

                                {hasLayer && (
                                  <button
                                    onClick={() => handleRemoveSample(selectedPadId, tierOpt.tier, rrIndex)}
                                    className="p-1 text-neutral-400 hover:text-chyba cursor-pointer"
                                    title="Odstranit tuto vrstvu"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: BATCH WAV IMPORTER */}
          {/* ========================================================================= */}
          {activeTab === 'batch' && (
            <div className="space-y-4">
              {/* Dropzone Container */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsBatchDragOver(true);
                }}
                onDragLeave={() => setIsBatchDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsBatchDragOver(false);
                  handleBatchFileSelect(e.dataTransfer.files);
                }}
                className={`p-8 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center space-y-3 transition-all ${
                  isBatchDragOver
                    ? 'bg-znacka/20 border-znacka scale-[1.01]'
                    : 'bg-black/40 border-white/20 hover:border-white/40'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-znacka/20 border border-znacka/40 flex items-center justify-center text-2xl text-znacka">
                  <FolderUp className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    Přetáhněte sem více souborů WAV naráz
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 max-w-md">
                    Chytrý analyzátor automaticky rozpozná název bicího nástroje (Kick, Snare, Toms, Cymbals), dynamickou vrstvu (Soft, Hard, FF...) i Round-Robin variace (RR1..RR4).
                  </p>
                </div>

                <input
                  type="file"
                  ref={batchFileInputRef}
                  multiple
                  accept="audio/*,.wav,.mp3,.ogg,.flac"
                  className="hidden"
                  onChange={(e) => handleBatchFileSelect(e.target.files)}
                />
                <button
                  onClick={() => batchFileInputRef.current?.click()}
                  className="px-4 py-2 bg-znacka hover:bg-[#FFB340] text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md"
                >
                  Vybrat soubory ze složky
                </button>
              </div>

              {/* Parsed File List Preview */}
              {batchParsedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Rozpoznané soubory k importu ({batchParsedFiles.length}):
                    </h4>
                    <button
                      onClick={handleExecuteBatchImport}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-uspech hover:bg-uspech/90 text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-md"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Spustit Import všech souborů</span>
                    </button>
                  </div>

                  <div className="bg-black/50 border border-white/10 rounded-2xl overflow-hidden max-h-56 overflow-y-auto divide-y divide-white/5">
                    {batchParsedFiles.map((item, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 truncate flex-1">
                          <FileAudio className="w-4 h-4 text-znacka shrink-0" />
                          <span className="font-semibold text-white truncate">{item.name}</span>
                        </div>

                        {/* Parsed Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Articulation */}
                          <select
                            value={item.parsed.articulation || 'snare'}
                            onChange={(e) => {
                              item.parsed.articulation = e.target.value as DrumArticulation;
                              setBatchParsedFiles([...batchParsedFiles]);
                            }}
                            className="bg-black/60 text-white font-bold text-drobne px-2 py-1 rounded-lg border border-white/15 outline-none"
                          >
                            {EXTENDED_PAD_DEFINITIONS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.czName}
                              </option>
                            ))}
                          </select>

                          {/* Velocity Tier */}
                          <select
                            value={item.parsed.tier || 'med'}
                            onChange={(e) => {
                              item.parsed.tier = e.target.value as VelocityTier;
                              setBatchParsedFiles([...batchParsedFiles]);
                            }}
                            className="bg-black/60 text-znacka font-bold text-drobne px-2 py-1 rounded-lg border border-white/15 outline-none"
                          >
                            {VELOCITY_TIER_OPTIONS.map((v) => (
                              <option key={v.tier} value={v.tier}>
                                {v.label}
                              </option>
                            ))}
                          </select>

                          {/* Round Robin */}
                          <select
                            value={item.parsed.roundRobin || 1}
                            onChange={(e) => {
                              item.parsed.roundRobin = parseInt(e.target.value, 10);
                              setBatchParsedFiles([...batchParsedFiles]);
                            }}
                            className="bg-black/60 text-uspech font-bold text-drobne px-2 py-1 rounded-lg border border-white/15 outline-none"
                          >
                            {[1, 2, 3, 4].map((rr) => (
                              <option key={rr} value={rr}>
                                RR {rr}
                              </option>
                            ))}
                          </select>

                          {item.status === 'imported' && (
                            <span className="text-stitek font-bold text-uspech flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Hotovo
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-white/10 bg-plocha-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 font-medium">
              Rychlý test padů:
            </span>
            <div className="flex items-center gap-1 overflow-x-auto">
              {EXTENDED_PAD_DEFINITIONS.slice(0, 8).map((pad) => (
                <button
                  key={pad.id}
                  onClick={() => handleTestPlay(pad.id)}
                  className="px-2 py-1 bg-black/40 hover:bg-znacka/20 text-neutral-300 hover:text-znacka border border-white/10 rounded-lg text-stitek font-mono font-bold transition-all cursor-pointer active:scale-95"
                >
                  {pad.keyLabel}: {pad.czName.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              Zavřít
            </button>

            <button
              onClick={handleSaveActiveKit}
              className="flex items-center gap-1.5 px-5 py-2 bg-znacka hover:bg-[#FFB340] text-black font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-lg"
            >
              <Check className="w-4 h-4" />
              <span>Použít tuto sadu v bicích</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
