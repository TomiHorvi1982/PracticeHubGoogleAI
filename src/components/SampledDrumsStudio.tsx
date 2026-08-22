import React, { useState, useEffect, useRef } from 'react';
import {
  sampledDrumEngine,
  DrumArticulation,
  VelocityTier,
  DrumVoiceEvent,
  DrumMixerChannelName,
  DrumMixerChannelConfig,
  VELOCITY_RANGES,
} from '../services/SampledDrumEngine';
import { drumKitFactory } from '../services/drumKitFactory';
import { customDrumKitService } from '../services/customDrumKitService';
import { CustomDrumKit } from '../types';
import {
  Disc,
  Volume2,
  VolumeX,
  Sparkles,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  Layers,
  Wand2,
  Activity,
  Zap,
  Info,
  Laptop,
  Check,
  FolderOpen
} from 'lucide-react';

interface SampledDrumsStudioProps {
  onOpenCustomKitModal?: () => void;
  onNavigateToLibrary?: () => void;
}

interface PadTriggerDef {
  id: DrumArticulation;
  name: string;
  czName: string;
  keyLabel: string;
  category: 'kick' | 'snare' | 'hihat' | 'toms' | 'cymbals' | 'perc';
  icon: string;
  midiNote: number;
}

const DRUM_PAD_GRID: PadTriggerDef[] = [
  // Kick & Snares
  { id: 'kick', name: 'Kick Drum', czName: 'Kopák (Center)', keyLabel: 'Q', category: 'kick', icon: '🥁', midiNote: 36 },
  { id: 'snare', name: 'Snare Center', czName: 'Virbl (Střed)', keyLabel: 'W', category: 'snare', icon: '🪘', midiNote: 38 },
  { id: 'snare_rimshot', name: 'Snare Rimshot', czName: 'Virbl (Rimshot)', keyLabel: 'E', category: 'snare', icon: '💥', midiNote: 40 },
  { id: 'snare_sidestick', name: 'Snare Cross-Stick', czName: 'Virbl (Side-Stick)', keyLabel: 'R', category: 'snare', icon: '🪵', midiNote: 37 },

  // Hi-Hats
  { id: 'hihat_closed', name: 'Hi-Hat Closed', czName: 'Hi-Hat (Zavřená)', keyLabel: 'A', category: 'hihat', icon: '🪙', midiNote: 42 },
  { id: 'hihat_semi', name: 'Hi-Hat Semi-Open', czName: 'Hi-Hat (Polootevřená)', keyLabel: 'S', category: 'hihat', icon: '✨', midiNote: 23 },
  { id: 'hihat_open', name: 'Hi-Hat Open', czName: 'Hi-Hat (Otevřená)', keyLabel: 'D', category: 'hihat', icon: '🌟', midiNote: 46 },
  { id: 'hihat_pedal', name: 'Hi-Hat Pedal Chick', czName: 'Hi-Hat (Pedál)', keyLabel: 'F', category: 'hihat', icon: '🦶', midiNote: 44 },

  // Toms
  { id: 'tom_high', name: 'High Rack Tom', czName: 'Malý přechod 10"', keyLabel: 'T', category: 'toms', icon: '🪘', midiNote: 48 },
  { id: 'tom_mid', name: 'Mid Rack Tom', czName: 'Střední přechod 12"', keyLabel: 'Y', category: 'toms', icon: '🪘', midiNote: 45 },
  { id: 'tom_low', name: 'Floor Tom', czName: 'Kotel 16"', keyLabel: 'U', category: 'toms', icon: '🥁', midiNote: 41 },

  // Cymbals
  { id: 'crash_left', name: 'Crash Cymbal 16"', czName: 'Crash činel 16"', keyLabel: 'G', category: 'cymbals', icon: '💥', midiNote: 49 },
  { id: 'crash_right', name: 'Crash Cymbal 18"', czName: 'Crash činel 18"', keyLabel: 'H', category: 'cymbals', icon: '⚡', midiNote: 57 },
  { id: 'ride_bow', name: 'Ride Cymbal (Bow)', czName: 'Ride (Tělo)', keyLabel: 'J', category: 'cymbals', icon: '🛸', midiNote: 51 },
  { id: 'ride_bell', name: 'Ride Cymbal (Bell)', czName: 'Ride (Zvon)', keyLabel: 'K', category: 'cymbals', icon: '🔔', midiNote: 53 },
  { id: 'china', name: 'China Cymbal', czName: 'China činel', keyLabel: 'L', category: 'cymbals', icon: '🔥', midiNote: 52 },
  { id: 'splash', name: 'Splash Cymbal', czName: 'Splash činel', keyLabel: 'Z', category: 'cymbals', icon: '💦', midiNote: 55 },

  // Percussion
  { id: 'tambourine', name: 'Tambourine', czName: 'Tamburína', keyLabel: 'X', category: 'perc', icon: '🪇', midiNote: 54 },
  { id: 'cowbell', name: 'Cowbell', czName: 'Kravský zvonec', keyLabel: 'C', category: 'perc', icon: '🛎️', midiNote: 56 },
  { id: 'shaker', name: 'Studio Shaker', czName: 'Šejkr', keyLabel: 'V', category: 'perc', icon: '🧂', midiNote: 69 },
  { id: 'handclap', name: 'Hand Clap', czName: 'Tlesknutí', keyLabel: 'B', category: 'perc', icon: '👏', midiNote: 39 },
];

export const SampledDrumsStudio: React.FC<SampledDrumsStudioProps> = ({
  onOpenCustomKitModal,
  onNavigateToLibrary,
}) => {
  const [activeKitId, setActiveKitId] = useState<string>(sampledDrumEngine.getActiveKitId());
  const [customKits, setCustomKits] = useState<CustomDrumKit[]>([]);

  /**
   * Úrovně pro ukazatele u faderů. Odečítají se z enginu ve smyčce
   * vykreslování, ne přes interval — tím jde v krok se snímky obrazovky
   * a při skryté kartě se prohlížeč sám zastaví.
   */
  const [urovne, setUrovne] = useState<Record<string, number>>({});

  useEffect(() => {
    let bezi = true;
    let snimek = 0;
    const tik = () => {
      if (!bezi) return;
      setUrovne(sampledDrumEngine.getMeterLevels());
      snimek = requestAnimationFrame(tik);
    };
    snimek = requestAnimationFrame(tik);
    return () => {
      bezi = false;
      cancelAnimationFrame(snimek);
    };
  }, []);

  /**
   * Engine si pamatuje naposledy vybranou sadu, což bývá některá z
   * vestavěných syntetizovaných. Ty se ale už nenabízejí — bez tohohle
   * přepnutí by výběr ukazoval prázdno a pady by dál hrály náhradní zvuk
   * místo nahraných vzorků.
   */
  useEffect(() => {
    if (customKits.length === 0) return;
    if (customKits.some((k) => k.id === activeKitId)) return;
    handleKitChange(customKits[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKits, activeKitId]);
  const [activeVoiceEvent, setActiveVoiceEvent] = useState<DrumVoiceEvent | null>(null);
  const [voiceHistory, setVoiceHistory] = useState<DrumVoiceEvent[]>([]);
  const [selectedVelocityTier, setSelectedVelocityTier] = useState<VelocityTier>('med');
  const [testPadVelocity, setTestPadVelocity] = useState<number>(85);
  const [lastTriggeredPad, setLastTriggeredPad] = useState<DrumArticulation>('snare');

  // Mixer State
  const [mixerConfig, setMixerConfig] = useState<Record<DrumMixerChannelName, DrumMixerChannelConfig>>(
    sampledDrumEngine.getMixerConfig()
  );
  const [activeMixerTab, setActiveMixerTab] = useState<'faders' | 'eq' | 'fx'>('faders');

  // Humanize State
  const [humanize, setHumanize] = useState(sampledDrumEngine.getHumanizeSettings());

  // Sequencer State
  const [bpm, setBpm] = useState(120);
  const [isPlayingSeq, setIsPlayingSeq] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const seqTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stepRef = useRef(0);

  // 16-step grid with velocity numbers (0 = off, 40 = ghost, 80 = normal, 120 = accent)
  const [seqGrid, setSeqGrid] = useState<Record<string, number[]>>(() => {
    const grid: Record<string, number[]> = {
      kick: [120, 0, 0, 0, 0, 0, 80, 0, 120, 0, 0, 0, 0, 0, 80, 0],
      snare: [0, 0, 0, 0, 120, 0, 0, 0, 0, 0, 0, 0, 120, 0, 0, 35],
      hihat_closed: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80],
      hihat_open: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0],
      tom_high: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      tom_low: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      crash_left: [120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ride_bow: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
    return grid;
  });

  // Subscribe to Drum Engine Voices & State
  useEffect(() => {
    const unsubVoice = sampledDrumEngine.subscribeVoice((event) => {
      setActiveVoiceEvent(event);
      setVoiceHistory((prev) => [event, ...prev.slice(0, 9)]);
      setLastTriggeredPad(event.articulation);
    });

    const unsubState = sampledDrumEngine.subscribeState(() => {
      setMixerConfig(sampledDrumEngine.getMixerConfig());
      setHumanize(sampledDrumEngine.getHumanizeSettings());
      setActiveKitId(sampledDrumEngine.getActiveKitId());
    });

    // Load custom kits
    setCustomKits(customDrumKitService.getAllKits());
    const unsubCustom = customDrumKitService.subscribe(setCustomKits);

    return () => {
      unsubVoice();
      unsubState();
      unsubCustom();
    };
  }, []);

  // Sequencer playback loop
  useEffect(() => {
    if (!isPlayingSeq) {
      if (seqTimerRef.current) clearInterval(seqTimerRef.current);
      stepRef.current = 0;
      setCurrentStep(0);
      return;
    }

    const stepIntervalMs = (60 / bpm / 4) * 1000;
    seqTimerRef.current = setInterval(() => {
      const step = stepRef.current;
      setCurrentStep(step);

      // Trigger all active instruments on this step with their programmed velocity
      Object.entries(seqGrid).forEach(([artKey, stepVals]) => {
        const vel = stepVals[step];
        if (vel > 0) {
          sampledDrumEngine.triggerPad(artKey as DrumArticulation, vel, activeKitId);
        }
      });

      stepRef.current = (step + 1) % 16;
    }, stepIntervalMs);

    return () => {
      if (seqTimerRef.current) clearInterval(seqTimerRef.current);
    };
  }, [isPlayingSeq, bpm, seqGrid, activeKitId]);

  // Handle Pad Trigger
  const handleTriggerPad = (articulation: DrumArticulation, velocity?: number) => {
    const vel = velocity !== undefined ? velocity : testPadVelocity;
    sampledDrumEngine.triggerPad(articulation, vel, activeKitId);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toUpperCase();
      const pad = DRUM_PAD_GRID.find((p) => p.keyLabel === key);
      if (pad) {
        e.preventDefault();
        handleTriggerPad(pad.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeKitId, testPadVelocity]);

  // Kit Change Handler
  const handleKitChange = async (kitId: string) => {
    setActiveKitId(kitId);
    await drumKitFactory.switchKit(kitId);
  };

  // Preset Grooves
  const handleLoadGroove = (type: 'rock' | 'funk' | 'metal' | 'shuffle' | 'disco') => {
    const newGrid: Record<string, number[]> = {
      kick: Array(16).fill(0),
      snare: Array(16).fill(0),
      hihat_closed: Array(16).fill(0),
      hihat_open: Array(16).fill(0),
      tom_high: Array(16).fill(0),
      tom_low: Array(16).fill(0),
      crash_left: Array(16).fill(0),
      ride_bow: Array(16).fill(0),
    };

    if (type === 'rock') {
      newGrid.kick = [120, 0, 0, 0, 0, 0, 85, 0, 120, 0, 0, 0, 0, 0, 85, 0];
      newGrid.snare = [0, 0, 0, 0, 120, 0, 0, 0, 0, 0, 0, 0, 120, 0, 0, 40];
      newGrid.hihat_closed = [85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85];
      newGrid.crash_left = [120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      setBpm(118);
    } else if (type === 'funk') {
      newGrid.kick = [120, 0, 45, 0, 0, 0, 80, 0, 0, 95, 0, 0, 0, 40, 85, 0];
      newGrid.snare = [0, 0, 0, 35, 120, 0, 0, 40, 0, 0, 40, 0, 120, 0, 0, 0];
      newGrid.hihat_closed = [90, 40, 70, 40, 90, 40, 70, 40, 90, 40, 70, 40, 90, 40, 70, 40];
      newGrid.hihat_open = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 110, 0];
      setBpm(105);
    } else if (type === 'metal') {
      newGrid.kick = [120, 100, 120, 100, 120, 100, 120, 100, 120, 100, 120, 100, 120, 100, 120, 100];
      newGrid.snare = [0, 0, 0, 0, 120, 0, 0, 0, 0, 0, 0, 0, 120, 0, 0, 0];
      newGrid.ride_bow = [95, 0, 95, 0, 95, 0, 95, 0, 95, 0, 95, 0, 95, 0, 95, 0];
      newGrid.crash_left = [120, 0, 0, 0, 0, 0, 0, 0, 110, 0, 0, 0, 0, 0, 0, 0];
      setBpm(145);
    } else if (type === 'shuffle') {
      newGrid.kick = [120, 0, 0, 0, 0, 0, 80, 0, 120, 0, 0, 0, 0, 0, 80, 0];
      newGrid.snare = [0, 0, 0, 35, 120, 0, 0, 35, 0, 0, 0, 35, 120, 0, 0, 35];
      newGrid.hihat_closed = [100, 0, 70, 0, 100, 0, 70, 0, 100, 0, 70, 0, 100, 0, 70, 0];
      setBpm(128);
    } else if (type === 'disco') {
      newGrid.kick = [120, 0, 0, 0, 120, 0, 0, 0, 120, 0, 0, 0, 120, 0, 0, 0];
      newGrid.snare = [0, 0, 0, 0, 120, 0, 0, 0, 0, 0, 0, 0, 120, 0, 0, 0];
      newGrid.hihat_open = [0, 0, 110, 0, 0, 0, 110, 0, 0, 0, 110, 0, 0, 0, 110, 0];
      newGrid.hihat_closed = [80, 0, 0, 0, 80, 0, 0, 0, 80, 0, 0, 0, 80, 0, 0, 0];
      setBpm(120);
    }

    setSeqGrid(newGrid);
  };

  // Toggle step velocity
  const handleToggleStep = (inst: string, stepIdx: number) => {
    setSeqGrid((prev) => {
      const line = [...(prev[inst] || Array(16).fill(0))];
      const cur = line[stepIdx];
      let next = 0;
      if (cur === 0) next = 80; // Normal
      else if (cur === 80) next = 120; // Accent
      else if (cur === 120) next = 35; // Ghost Note
      else next = 0; // Off
      line[stepIdx] = next;
      return { ...prev, [inst]: line };
    });
  };

  return (
    <div className="space-y-5">
      {/* 1. TOP BAR: Drum Kit Selector, Engine Mode, Humanize Presets, Library Navigation */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-2xl">
              <Disc className="w-6 h-6 text-[#FF9F0A]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Sampled Drum Engine
                </h2>
                <span className="bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/30 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Multi-Velocity &amp; Round-Robin Active
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Skutečné audio vzorky bicích s dynamickými vrstvami a eliminací machine-gun efektu.
              </p>
            </div>
          </div>

          {/* Quick Actions & Kit Chooser */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Library / Custom Kit Link */}
            {onOpenCustomKitModal && (
              <button
                onClick={onOpenCustomKitModal}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-neutral-200 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                title="Spravovat vlastní vzorky a sady bicích"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#FF9F0A]" />
                <span>My Library &bull; Sady bicích</span>
              </button>
            )}

            {/* Drum Kit Profile Select */}
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-2xl border border-white/10">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                Sada:
              </span>
              <select
                value={activeKitId}
                onChange={(e) => handleKitChange(e.target.value)}
                className="bg-[#1C1C1E] text-white font-bold text-xs p-1.5 rounded-xl border border-white/10 outline-none cursor-pointer focus:border-[#FF9F0A]"
              >
                {/* Nabízejí se jen vlastní sady. Vestavěné syntetizované sady
                    se do výběru nedávají — pady, na které si uživatel namapuje
                    vlastní vzorky, mají hrát ty vzorky, ne náhradní zvuk. */}
                {customKits.length === 0 ? (
                  <option value="">Zatím žádná sada — nahrajte vzorky</option>
                ) : (
                  customKits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon || '🥁'} {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Real-time Voice & Round-Robin Telemetry Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-white/[0.06] text-xs">
          {/* Active Trigger Monitor */}
          <div className="bg-black/50 border border-white/10 px-3 py-2 rounded-xl flex items-center justify-between">
            <span className="text-neutral-400 text-[11px] font-semibold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#FF9F0A]" /> Poslední úder:
            </span>
            {activeVoiceEvent ? (
              <span className="font-mono font-bold text-white flex items-center gap-1.5">
                <span className="text-[#FF9F0A]">{activeVoiceEvent.articulation}</span>
                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-neutral-300">
                  Vel: {activeVoiceEvent.velocity}
                </span>
                <span className="bg-[#30D158]/20 text-[#30D158] border border-[#30D158]/40 px-1.5 py-0.5 rounded text-[10px]">
                  RR #{activeVoiceEvent.roundRobinIndex}
                </span>
              </span>
            ) : (
              <span className="text-neutral-500 italic">Čekání na úder...</span>
            )}
          </div>

          {/* Velocity Tier Indicator */}
          <div className="bg-black/50 border border-white/10 px-3 py-2 rounded-xl flex items-center justify-between">
            <span className="text-neutral-400 text-[11px] font-semibold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#30D158]" /> Vrstva zvuku:
            </span>
            <span className="font-mono font-bold text-[#30D158] uppercase">
              {activeVoiceEvent ? activeVoiceEvent.velocityTier.replace('_', ' ') : 'Medium (mf)'}
            </span>
          </div>

          {/* Humanize Intensity Selector */}
          <div className="bg-black/50 border border-white/10 px-3 py-2 rounded-xl flex items-center justify-between gap-2">
            <span className="text-neutral-400 text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap">
              <Wand2 className="w-3.5 h-3.5 text-purple-400" /> Humanize:
            </span>
            <div className="flex items-center gap-1">
              {[
                { label: '0%', val: 0 },
                { label: '10%', val: 0.1 },
                { label: '25%', val: 0.25 },
                { label: '50%', val: 0.5 },
              ].map((h) => (
                <button
                  key={h.label}
                  onClick={() => sampledDrumEngine.setHumanizeIntensity(h.val)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                    humanize.intensity === h.val
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-400'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. INTERACTIVE DRUM PADS & VELOCITY TESTER */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        {/* Section Header with Velocity Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Disc className="w-4 h-4 text-[#FF9F0A]" /> Interaktivní bicí podložky &amp; Artikulace
            </h3>
            <p className="text-[11px] text-neutral-400">
              Klávesové zkratky na PC klávesnici (Q, W, E, R, A, S, D, F...) pro živé hraní.
            </p>
          </div>

          {/* Test Dynamic Velocity Tier Selector */}
          <div className="flex items-center gap-1.5 bg-black/60 p-1.5 rounded-2xl border border-white/10 flex-wrap">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1.5">
              Dynamika úderu:
            </span>
            {[
              { tier: 'soft', vel: 25, label: 'pp (Jemný)' },
              { tier: 'med_soft', vel: 50, label: 'p (Mírný)' },
              { tier: 'med', vel: 80, label: 'mf (Střední)' },
              { tier: 'hard', vel: 105, label: 'f (Silný)' },
              { tier: 'very_hard', vel: 125, label: 'ff (Maximální)' },
            ].map((v) => (
              <button
                key={v.tier}
                onClick={() => {
                  setSelectedVelocityTier(v.tier as VelocityTier);
                  setTestPadVelocity(v.vel);
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  testPadVelocity === v.vel
                    ? 'bg-[#FF9F0A] text-black shadow-md shadow-[#FF9F0A]/20'
                    : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drum Pads Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {DRUM_PAD_GRID.map((pad) => {
            const isJustTriggered = activeVoiceEvent?.articulation === pad.id;

            return (
              <button
                key={pad.id}
                onClick={() => handleTriggerPad(pad.id)}
                className={`relative group flex flex-col justify-between p-3.5 h-28 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer shadow-lg select-none ${
                  isJustTriggered
                    ? 'bg-gradient-to-br from-[#FF9F0A]/30 to-orange-950/40 border-[#FF9F0A] shadow-[0_0_20px_rgba(255,159,10,0.4)] ring-2 ring-[#FF9F0A]'
                    : pad.category === 'kick'
                    ? 'bg-gradient-to-b from-blue-950/30 to-black/60 border-blue-500/20 hover:border-blue-400/50'
                    : pad.category === 'snare'
                    ? 'bg-gradient-to-b from-amber-950/30 to-black/60 border-amber-500/20 hover:border-amber-400/50'
                    : pad.category === 'hihat'
                    ? 'bg-gradient-to-b from-emerald-950/30 to-black/60 border-emerald-500/20 hover:border-emerald-400/50'
                    : pad.category === 'toms'
                    ? 'bg-gradient-to-b from-purple-950/30 to-black/60 border-purple-500/20 hover:border-purple-400/50'
                    : pad.category === 'cymbals'
                    ? 'bg-gradient-to-b from-yellow-950/30 to-black/60 border-yellow-500/20 hover:border-yellow-400/50'
                    : 'bg-gradient-to-b from-neutral-900/60 to-black/60 border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg">{pad.icon}</span>
                  <span className="px-2 py-0.5 bg-black/80 border border-white/20 text-[#FF9F0A] font-mono text-[10px] font-black rounded-lg uppercase shadow-inner">
                    {pad.keyLabel}
                  </span>
                </div>

                <div>
                  <div className="text-[12px] font-bold text-white truncate group-hover:text-[#FF9F0A] transition-colors">
                    {pad.czName}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate flex items-center justify-between">
                    <span>{pad.name}</span>
                    <span className="text-[9px] font-mono text-neutral-500">M:{pad.midiNote}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. MULTI-CHANNEL STUDIO DRUM MIXER (Logic / EZdrummer DAW Style) */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#30D158]" /> Studiový vícestopý mixážní pult (Drum Mixer)
            </h3>
            <p className="text-[11px] text-neutral-400">
              Samostatné kanály s Gainem, Panoramou, Mute/Solo, 3-pásmovým ekvalizérem a prostorovým reverbem.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl border border-white/10">
            {(['faders', 'eq', 'fx'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveMixerTab(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeMixerTab === tab
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {tab === 'faders' ? '🎚️ Fadery & Panning' : tab === 'eq' ? '🎛️ 3-Pásmový EQ' : '✨ Reverb & Comp'}
              </button>
            ))}
          </div>
        </div>

        {/* Mixer Channels Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {(Object.keys(mixerConfig) as DrumMixerChannelName[]).map((chName) => {
            const ch = mixerConfig[chName];
            const isKick = chName === 'kick';
            const isSnare = chName === 'snare';

            return (
              <div
                key={chName}
                className="bg-black/60 border border-white/10 p-3 rounded-2xl flex flex-col justify-between space-y-3 shadow-md"
              >
                {/* Channel Header */}
                <div className="text-center border-b border-white/[0.06] pb-2">
                  <div className="text-[11px] font-black text-white truncate">{ch.czLabel}</div>
                  <div className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">{chName}</div>
                </div>

                {/* TAB 1: FADERS & PANNING */}
                {activeMixerTab === 'faders' && (
                  <div className="flex flex-col items-center space-y-3 py-1">
                    {/* Vertical Volume Fader */}
                    <div className="h-36 flex items-center justify-center relative w-full gap-2">
                      {/* Ukazatel hlasitosti: roste zdola, jako na mixu. */}
                      <div className="h-32 w-1.5 rounded-full bg-black/60 border border-white/10 overflow-hidden flex flex-col justify-end shrink-0">
                        <div
                          className={`w-full rounded-full transition-[height] duration-75 ${
                            (urovne[chName] || 0) > 0.85
                              ? 'bg-[#FF453A]'
                              : (urovne[chName] || 0) > 0.6
                                ? 'bg-[#FF9F0A]'
                                : 'bg-[#30D158]'
                          }`}
                          style={{ height: `${Math.round((urovne[chName] || 0) * 100)}%` }}
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.02"
                        value={ch.volume}
                        onChange={(e) => sampledDrumEngine.setChannelVolume(chName, parseFloat(e.target.value))}
                        className="w-32 h-2 -rotate-90 origin-center cursor-pointer accent-[#FF9F0A]"
                        title={`Hlasitost: ${Math.round(ch.volume * 100)}%`}
                      />
                    </div>

                    <div className="text-[11px] font-mono font-bold text-neutral-200">
                      {Math.round(ch.volume * 100)}%
                    </div>

                    {/* Pan Slider */}
                    <div className="w-full space-y-1">
                      <div className="flex justify-between text-[9px] font-mono text-neutral-400">
                        <span>L</span>
                        <span>Pan: {ch.pan > 0 ? `+${ch.pan}` : ch.pan === 0 ? 'C' : ch.pan}</span>
                        <span>R</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={ch.pan}
                        onChange={(e) => sampledDrumEngine.setChannelPan(chName, parseFloat(e.target.value))}
                        className="w-full h-1.5 cursor-pointer accent-[#30D158]"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 2: 3-BAND EQ */}
                {activeMixerTab === 'eq' && (
                  <div className="space-y-2 py-1 text-[10px]">
                    <div className="space-y-1">
                      <div className="flex justify-between font-mono text-neutral-300">
                        <span>High (7.5k)</span>
                        <span className="text-[#FF9F0A]">{ch.highGain > 0 ? `+${ch.highGain}` : ch.highGain}dB</span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={ch.highGain}
                        onChange={(e) =>
                          sampledDrumEngine.setChannelEQ(chName, ch.lowGain, ch.midGain, parseFloat(e.target.value))
                        }
                        className="w-full h-1 cursor-pointer accent-[#FF9F0A]"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between font-mono text-neutral-300">
                        <span>Mid (1.2k)</span>
                        <span className="text-[#30D158]">{ch.midGain > 0 ? `+${ch.midGain}` : ch.midGain}dB</span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={ch.midGain}
                        onChange={(e) =>
                          sampledDrumEngine.setChannelEQ(chName, ch.lowGain, parseFloat(e.target.value), ch.highGain)
                        }
                        className="w-full h-1 cursor-pointer accent-[#30D158]"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between font-mono text-neutral-300">
                        <span>Low (110Hz)</span>
                        <span className="text-blue-400">{ch.lowGain > 0 ? `+${ch.lowGain}` : ch.lowGain}dB</span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={ch.lowGain}
                        onChange={(e) =>
                          sampledDrumEngine.setChannelEQ(chName, parseFloat(e.target.value), ch.midGain, ch.highGain)
                        }
                        className="w-full h-1 cursor-pointer accent-blue-400"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 3: REVERB SEND & FX */}
                {activeMixerTab === 'fx' && (
                  <div className="space-y-3 py-2 text-[10px]">
                    <div className="space-y-1">
                      <div className="flex justify-between font-mono text-neutral-300">
                        <span>Room Reverb</span>
                        <span className="text-purple-400">{Math.round(ch.reverbSend * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={ch.reverbSend}
                        onChange={(e) => sampledDrumEngine.setChannelReverbSend(chName, parseFloat(e.target.value))}
                        className="w-full h-1.5 cursor-pointer accent-purple-400"
                      />
                    </div>

                    <div className="bg-white/5 p-2 rounded-lg border border-white/5 space-y-1 text-[9px] font-mono text-neutral-400">
                      <div className="flex justify-between">
                        <span>Comp Thresh:</span>
                        <span className="text-white">{ch.compThreshold} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Comp Ratio:</span>
                        <span className="text-white">{ch.compRatio}:1</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mute & Solo Toggles */}
                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.06]">
                  <button
                    onClick={() => sampledDrumEngine.setChannelMute(chName, !ch.mute)}
                    className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      ch.mute
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-neutral-400'
                    }`}
                  >
                    MUTE
                  </button>
                  <button
                    onClick={() => sampledDrumEngine.setChannelSolo(chName, !ch.solo)}
                    className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      ch.solo
                        ? 'bg-amber-400 text-black shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-neutral-400'
                    }`}
                  >
                    SOLO
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. MULTI-VELOCITY STEP SEQUENCER & GROOVE PLAYER */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlayingSeq(!isPlayingSeq)}
              className={`p-3 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-lg ${
                isPlayingSeq
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-[#30D158] hover:bg-[#28b84d] text-black font-black'
              }`}
            >
              {isPlayingSeq ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                16-Krokový Groover &amp; Sekvencer
              </h3>
              <p className="text-[11px] text-neutral-400">
                Kliknutím cyklujte dynamiku kroku: Vypnuto &rarr; Normální (mf) &rarr; Akcent (ff) &rarr; Ghost Note (pp).
              </p>
            </div>
          </div>

          {/* BPM & Presets */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-[11px] font-bold text-neutral-400">Tempo:</span>
              <input
                type="number"
                min="40"
                max="240"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value) || 120)}
                className="w-14 bg-[#1C1C1E] text-white font-mono font-bold text-xs p-1 rounded-lg border border-white/10 text-center outline-none"
              />
              <span className="text-[10px] font-mono text-neutral-500">BPM</span>
            </div>

            <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl border border-white/10 flex-wrap">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1">Presety:</span>
              {[
                { id: 'rock', label: 'Rock 4/4' },
                { id: 'funk', label: 'Funk Pocket' },
                { id: 'metal', label: 'Metal Blast' },
                { id: 'shuffle', label: 'Shuffle' },
                { id: 'disco', label: 'Disco' },
              ].map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleLoadGroove(g.id as any)}
                  className="px-2 py-0.5 bg-white/5 hover:bg-white/15 text-neutral-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 16-Step Sequencer Grid */}
        <div className="space-y-2 overflow-x-auto pb-2 scrollbar-thin">
          {Object.keys(seqGrid).map((instKey) => {
            const padDef = DRUM_PAD_GRID.find((p) => p.id === instKey);
            const line = seqGrid[instKey];

            return (
              <div key={instKey} className="flex items-center gap-2 min-w-[650px]">
                {/* Track Label */}
                <div className="w-32 flex items-center justify-between text-xs font-bold text-neutral-200 bg-black/40 px-2.5 py-1.5 rounded-xl border border-white/5">
                  <span className="truncate">{padDef?.czName || instKey}</span>
                  <span className="text-[10px]">{padDef?.icon || '🥁'}</span>
                </div>

                {/* 16 Step Buttons */}
                <div className="flex-1 grid grid-cols-16 gap-1">
                  {line.map((val, stepIdx) => {
                    const isCurrent = isPlayingSeq && currentStep === stepIdx;
                    const isQuarter = stepIdx % 4 === 0;

                    return (
                      <button
                        key={stepIdx}
                        onClick={() => handleToggleStep(instKey, stepIdx)}
                        className={`h-8 rounded-lg font-mono text-[9px] font-black transition-all cursor-pointer flex items-center justify-center border ${
                          isCurrent
                            ? 'ring-2 ring-white scale-105 z-10'
                            : ''
                        } ${
                          val === 120
                            ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] shadow-md shadow-[#FF9F0A]/30'
                            : val === 80
                            ? 'bg-[#30D158] text-black border-[#30D158]'
                            : val === 35
                            ? 'bg-purple-900/60 text-purple-200 border-purple-500/40'
                            : isQuarter
                            ? 'bg-white/10 hover:bg-white/20 border-white/10 text-neutral-600'
                            : 'bg-black/40 hover:bg-white/10 border-white/5 text-neutral-700'
                        }`}
                        title={`Krok ${stepIdx + 1}: ${val === 0 ? 'Vypnuto' : val === 120 ? 'Akcent (ff)' : val === 80 ? 'Normální (mf)' : 'Ghost (pp)'}`}
                      >
                        {val > 0 ? (val === 120 ? 'FF' : val === 80 ? 'MF' : 'PP') : isQuarter ? '•' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
