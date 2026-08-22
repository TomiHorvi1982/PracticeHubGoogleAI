// SampledDrumEngine.ts - Professional Sample-Based Drum Instrument Engine
// Inspired by EZdrummer 3 / Addictive Drums 2 / Superior Drummer architecture.
// Features: Multi-Velocity PCM Layers, Round-Robin (Anti-Machine-Gun), Hi-Hat Choke Groups,
// Controlled Humanization (Timing/Velocity/Pitch Jitter), Multi-Channel Studio Mixer & Neverlate Library Integration.

import { audioSynth, InstrumentProfile } from './audioSynth';
import { eventBus } from './eventBus';
import { CustomDrumKit, MultiLayerSampleLayer } from '../types';
import {
  deriveAcousticVelocityAndRRLayers,
  trimAudioBufferSilence,
  normalizeAudioBuffer,
} from './drumSampleProcessor';

export type DrumArticulation =
  | 'kick'
  | 'snare'
  | 'snare_rimshot'
  | 'snare_sidestick'
  | 'hihat_closed'
  | 'hihat_semi'
  | 'hihat_open'
  | 'hihat_pedal'
  | 'hihat_splash'
  | 'tom_high'
  | 'tom_mid'
  | 'tom_low'
  | 'crash_left'
  | 'crash_right'
  | 'ride_bow'
  | 'ride_bell'
  | 'china'
  | 'splash'
  | 'tambourine'
  | 'cowbell'
  | 'shaker'
  | 'handclap';

export type VelocityTier = 'soft' | 'med_soft' | 'med' | 'hard' | 'very_hard';

export interface VelocityRange {
  tier: VelocityTier;
  minVel: number;
  maxVel: number;
  label: string;
}

export const VELOCITY_RANGES: VelocityRange[] = [
  { tier: 'soft', minVel: 1, maxVel: 30, label: 'Soft (pp)' },
  { tier: 'med_soft', minVel: 31, maxVel: 60, label: 'Med-Soft (p)' },
  { tier: 'med', minVel: 61, maxVel: 90, label: 'Medium (mf)' },
  { tier: 'hard', minVel: 91, maxVel: 110, label: 'Hard (f)' },
  { tier: 'very_hard', minVel: 111, maxVel: 127, label: 'Very Hard (ff)' },
];

export function getVelocityTier(velocityValue: number): VelocityTier {
  // Normalize 0..1 or 1..127
  const midiVel = velocityValue <= 1.0 ? Math.round(velocityValue * 127) : Math.round(velocityValue);
  const clamped = Math.max(1, Math.min(127, midiVel));
  for (const range of VELOCITY_RANGES) {
    if (clamped >= range.minVel && clamped <= range.maxVel) {
      return range.tier;
    }
  }
  return 'med';
}

export type DrumMixerChannelName = 'kick' | 'snare' | 'hihat' | 'toms' | 'overheads' | 'room' | 'percussion';

export interface DrumMixerChannelConfig {
  name: DrumMixerChannelName;
  label: string;
  czLabel: string;
  volume: number; // 0..1.5 (default 1.0)
  pan: number; // -1..1 (default 0)
  mute: boolean;
  solo: boolean;
  lowGain: number; // -12..12 dB
  midGain: number; // -12..12 dB
  highGain: number; // -12..12 dB
  compThreshold: number; // -40..0 dB
  compRatio: number; // 1..20
  reverbSend: number; // 0..1
}

export interface HumanizeSettings {
  enabled: boolean;
  intensity: number; // 0..1 (0%, 10%, 25%, 50%)
  timingJitterMs: number; // 0..5ms
  velocityJitter: number; // 0..0.15 (0-15%)
  pitchDriftCents: number; // 0..15 cents
}

export interface DrumVoiceEvent {
  articulation: DrumArticulation;
  velocity: number; // 1..127
  velocityTier: VelocityTier;
  roundRobinIndex: number;
  time: number;
}

export interface SampledDrumKitDefinition {
  id: string;
  name: string;
  czName: string;
  genre: string;
  icon: string;
  description: string;
  isCustom?: boolean;
}

export class SampledDrumEngine {
  private activeKitId: string = 'drums';
  private kitSampleCache: Map<string, Map<string, AudioBuffer>> = new Map(); // kitId -> key (articulation:tier:rr) -> AudioBuffer
  private customKitBuffers: Map<string, Map<string, AudioBuffer>> = new Map(); // kitId -> layerKey -> AudioBuffer
  private roundRobinTrackers: Map<string, number> = new Map(); // articulation:tier -> lastRRIndex
  private activeVoices: Set<{ source: AudioBufferSourceNode; gainNode: GainNode; articulation: DrumArticulation; stopTime: number }> = new Set();
  private chokeGroups: Map<string, Set<AudioBufferSourceNode>> = new Map(); // e.g. "hihat" -> active sources

  // Mixer Nodes
  private channelNodes: Map<
    DrumMixerChannelName,
    {
      inputGain: GainNode;
      panNode: StereoPannerNode | PannerNode;
      lowEq: BiquadFilterNode;
      midEq: BiquadFilterNode;
      highEq: BiquadFilterNode;
      compressor: DynamicsCompressorNode;
      reverbSendGain: GainNode;
      outputGain: GainNode;
      analyser: AnalyserNode;
    }
  > = new Map();

  private masterBusGain: GainNode | null = null;
  private roomReverbNode: ConvolverNode | null = null;
  private roomReverbGain: GainNode | null = null;

  // Mixer Config State
  private mixerConfig: Record<DrumMixerChannelName, DrumMixerChannelConfig> = {
    kick: {
      name: 'kick',
      label: 'Kick Drum',
      czLabel: 'Kopák (Kick)',
      volume: 1.0,
      pan: 0.0,
      mute: false,
      solo: false,
      lowGain: 2.0,
      midGain: -1.5,
      highGain: 1.0,
      compThreshold: -16,
      compRatio: 4,
      reverbSend: 0.08,
    },
    snare: {
      name: 'snare',
      label: 'Snare Drum',
      czLabel: 'Virbl (Snare)',
      volume: 1.0,
      pan: 0.05,
      mute: false,
      solo: false,
      lowGain: 0.0,
      midGain: 1.5,
      highGain: 2.0,
      compThreshold: -18,
      compRatio: 4.5,
      reverbSend: 0.28,
    },
    hihat: {
      name: 'hihat',
      label: 'Hi-Hat',
      czLabel: 'Hi-Hat (Činely)',
      volume: 0.85,
      pan: -0.3,
      mute: false,
      solo: false,
      lowGain: -3.0,
      midGain: 0.0,
      highGain: 2.5,
      compThreshold: -22,
      compRatio: 3,
      reverbSend: 0.15,
    },
    toms: {
      name: 'toms',
      label: 'Toms (Rack/Floor)',
      czLabel: 'Tomy & Kotle',
      volume: 0.95,
      pan: 0.0,
      mute: false,
      solo: false,
      lowGain: 1.0,
      midGain: 0.5,
      highGain: 1.0,
      compThreshold: -18,
      compRatio: 3.5,
      reverbSend: 0.22,
    },
    overheads: {
      name: 'overheads',
      label: 'Overheads / Cymbals',
      czLabel: 'Overheady & Činely',
      volume: 0.9,
      pan: 0.0,
      mute: false,
      solo: false,
      lowGain: -4.0,
      midGain: 0.0,
      highGain: 3.0,
      compThreshold: -24,
      compRatio: 2.5,
      reverbSend: 0.35,
    },
    room: {
      name: 'room',
      label: 'Room Ambience',
      czLabel: 'Studiový prostor (Room)',
      volume: 0.75,
      pan: 0.0,
      mute: false,
      solo: false,
      lowGain: 0.0,
      midGain: 0.0,
      highGain: 0.0,
      compThreshold: -20,
      compRatio: 4,
      reverbSend: 0.0,
    },
    percussion: {
      name: 'percussion',
      label: 'Percussion / FX',
      czLabel: 'Perkuse & Efekty',
      volume: 0.9,
      pan: 0.2,
      mute: false,
      solo: false,
      lowGain: -1.0,
      midGain: 1.0,
      highGain: 1.5,
      compThreshold: -20,
      compRatio: 3,
      reverbSend: 0.2,
    },
  };

  // Humanize Configuration
  private humanize: HumanizeSettings = {
    enabled: true,
    intensity: 0.15, // 15% studio humanize by default
    timingJitterMs: 2.0,
    velocityJitter: 0.04,
    pitchDriftCents: 6.0,
  };

  // Subscribers
  private listeners: Set<(event: DrumVoiceEvent) => void> = new Set();
  private stateListeners: Set<() => void> = new Set();

  constructor() {
    // Lazy audio initialization: Do not call audioSynth at module evaluation time
  }

  public subscribeVoice(cb: (event: DrumVoiceEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public subscribeState(cb: () => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private notifyState(): void {
    this.stateListeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('[SampledDrumEngine] State notify error:', e);
      }
    });
  }

  // --- AUDIO GRAPH & MULTI-CHANNEL MIXER SETUP (LAZY) ---
  public ensureAudioGraph(): AudioContext {
    const ctx = audioSynth.initCtx();
    if (!this.masterBusGain) {
      this.initAudioGraph(ctx);
    }
    return ctx;
  }

  private initAudioGraph(ctx: AudioContext): void {
    // 1. Master Bus Gain
    this.masterBusGain = ctx.createGain();
    this.masterBusGain.gain.setValueAtTime(0.95, ctx.currentTime);

    // Route to audioSynth masterGain or destination
    const synthMaster = audioSynth.getMasterGain();
    if (synthMaster) {
      this.masterBusGain.connect(synthMaster);
    } else {
      this.masterBusGain.connect(ctx.destination);
    }

    // 2. Convolution Studio Room Reverb Impulse
    this.createStudioRoomImpulse(ctx);

    // 3. Initialize 7 Discrete Drum Mixer Channels
    const channels: DrumMixerChannelName[] = ['kick', 'snare', 'hihat', 'toms', 'overheads', 'room', 'percussion'];

    channels.forEach((chName) => {
      const config = this.mixerConfig[chName];

      const inputGain = ctx.createGain();
      inputGain.gain.setValueAtTime(1.0, ctx.currentTime);

      // 3-Band Parametric EQ
      const lowEq = ctx.createBiquadFilter();
      lowEq.type = 'lowshelf';
      lowEq.frequency.setValueAtTime(110, ctx.currentTime);
      lowEq.gain.setValueAtTime(config.lowGain, ctx.currentTime);

      const midEq = ctx.createBiquadFilter();
      midEq.type = 'peaking';
      midEq.frequency.setValueAtTime(1200, ctx.currentTime);
      midEq.Q.setValueAtTime(1.2, ctx.currentTime);
      midEq.gain.setValueAtTime(config.midGain, ctx.currentTime);

      const highEq = ctx.createBiquadFilter();
      highEq.type = 'highshelf';
      highEq.frequency.setValueAtTime(7500, ctx.currentTime);
      highEq.gain.setValueAtTime(config.highGain, ctx.currentTime);

      // Studio Channel Compressor
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(config.compThreshold, ctx.currentTime);
      compressor.ratio.setValueAtTime(config.compRatio, ctx.currentTime);
      compressor.attack.setValueAtTime(0.005, ctx.currentTime);
      compressor.release.setValueAtTime(0.12, ctx.currentTime);

      // Stereo Panner
      let panNode: StereoPannerNode | PannerNode;
      if (typeof ctx.createStereoPanner === 'function') {
        const sp = ctx.createStereoPanner();
        sp.pan.setValueAtTime(config.pan, ctx.currentTime);
        panNode = sp;
      } else {
        panNode = ctx.createPanner();
      }

      // Reverb Send
      const reverbSendGain = ctx.createGain();
      reverbSendGain.gain.setValueAtTime(config.reverbSend, ctx.currentTime);

      // Channel Output Gain (Volume + Mute/Solo)
      const outputGain = ctx.createGain();
      outputGain.gain.setValueAtTime(config.volume, ctx.currentTime);

      // Ukazatel hlasitosti. Připojuje se ZA fader, takže ukazuje, co je
      // opravdu slyšet — po nastavení hlasitosti i po ztlumení. Je to slepá
      // větev: nikam dál nevede, jen měří, takže zvuk neovlivňuje.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;

      // Chain: input -> lowEq -> midEq -> highEq -> compressor -> panNode -> outputGain -> masterBusGain
      inputGain.connect(lowEq);
      lowEq.connect(midEq);
      midEq.connect(highEq);
      highEq.connect(compressor);
      compressor.connect(panNode);
      panNode.connect(outputGain);
      outputGain.connect(this.masterBusGain!);
      outputGain.connect(analyser);

      // Reverb routing
      if (this.roomReverbNode && chName !== 'room') {
        compressor.connect(reverbSendGain);
        reverbSendGain.connect(this.roomReverbNode);
      }

      this.channelNodes.set(chName, {
        inputGain,
        panNode,
        lowEq,
        midEq,
        highEq,
        compressor,
        reverbSendGain,
        outputGain,
        analyser,
      });
    });

    this.updateChannelGains();
  }

  /**
   * Okamžitá hlasitost každého kanálu, 0 až 1 — pro ukazatele u faderů.
   *
   * Počítá se efektivní hodnota (RMS) ze skutečného signálu. Když kanál
   * nehraje, vrací nulu; nic se nedopočítává ani neodhaduje z nastavené
   * hlasitosti. Ukazatel má prozradit, že stopa hraje — kdyby se hýbal
   * i u mlčícího kanálu, neřekl by nic.
   */
  public getMeterLevels(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, nodes] of this.channelNodes) {
      const a = (nodes as any).analyser as AnalyserNode | undefined;
      if (!a) continue;
      const buf = new Uint8Array(a.fftSize);
      a.getByteTimeDomainData(buf);
      let soucet = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        soucet += v * v;
      }
      const rms = Math.sqrt(soucet / buf.length);
      // Zesílení na použitelný rozsah — bicí mají krátké špičky a syrové
      // RMS by u nich sotva vystoupalo nad pár procent.
      out[name] = Math.min(1, rms * 3);
    }
    return out;
  }

  private createStudioRoomImpulse(ctx: AudioContext): void {
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.floor(sampleRate * 1.4); // 1.4 sec room decay
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Exponential studio room diffusion decay
      const decay = Math.exp(-t * 4.8);
      // Diffuse early reflections + dense tail
      const noiseL = (Math.random() * 2 - 1) * decay;
      const noiseR = (Math.random() * 2 - 1) * decay;
      left[i] = noiseL;
      right[i] = noiseR;
    }

    this.roomReverbNode = ctx.createConvolver();
    this.roomReverbNode.buffer = impulse;

    this.roomReverbGain = ctx.createGain();
    this.roomReverbGain.gain.setValueAtTime(0.7, ctx.currentTime);

    this.roomReverbNode.connect(this.roomReverbGain);
    if (this.masterBusGain) {
      this.roomReverbGain.connect(this.masterBusGain);
    }
  }

  // --- CHANNEL ROUTING FOR DRUM ARTICULATIONS ---
  public getChannelForArticulation(art: DrumArticulation): DrumMixerChannelName {
    switch (art) {
      case 'kick':
        return 'kick';
      case 'snare':
      case 'snare_rimshot':
      case 'snare_sidestick':
        return 'snare';
      case 'hihat_closed':
      case 'hihat_semi':
      case 'hihat_open':
      case 'hihat_pedal':
      case 'hihat_splash':
        return 'hihat';
      case 'tom_high':
      case 'tom_mid':
      case 'tom_low':
        return 'toms';
      case 'crash_left':
      case 'crash_right':
      case 'ride_bow':
      case 'ride_bell':
      case 'china':
      case 'splash':
        return 'overheads';
      case 'tambourine':
      case 'cowbell':
      case 'shaker':
      case 'handclap':
        return 'percussion';
      default:
        return 'snare';
    }
  }

  // --- MULTI-VELOCITY & ROUND-ROBIN SAMPLE GENERATOR & CACHE ---
  /**
   * Generates or fetches authentic acoustic multi-velocity, round-robin PCM audio buffers
   * featuring multi-layer acoustic shell excitation, transient beater attack, realistic snare wire buzz,
   * cymbal bell/bow chime dispersion, external WAV sample playback and physical acoustic room coloration.
   */
  public getSampleBuffer(
    kitId: string,
    articulation: DrumArticulation,
    tier: VelocityTier,
    rrIndex: number
  ): AudioBuffer {
    const ctx = this.ensureAudioGraph();
    const cacheKey = `${articulation}:${tier}:rr${rrIndex}`;

    if (!this.kitSampleCache.has(kitId)) {
      this.kitSampleCache.set(kitId, new Map());
    }

    const kitCache = this.kitSampleCache.get(kitId)!;
    if (kitCache.has(cacheKey)) {
      return kitCache.get(cacheKey)!;
    }

    // 1. Check if external custom WAV buffers exist for this kit
    const customBuffers = this.customKitBuffers.get(kitId);
    if (customBuffers && customBuffers.size > 0) {
      // 1a. Direct Layer Match: "${articulation}:${tier}:rr${rrIndex}"
      const directMatch = customBuffers.get(`${articulation}:${tier}:rr${rrIndex}`);
      if (directMatch) {
        kitCache.set(cacheKey, directMatch);
        return directMatch;
      }

      // 1b. Tier match with any round-robin: derive round-robin micro-variation
      const anyRRInTier = Array.from(customBuffers.entries()).find(([k]) => k.startsWith(`${articulation}:${tier}:rr`));
      if (anyRRInTier) {
        const derived = deriveAcousticVelocityAndRRLayers(ctx, anyRRInTier[1], tier, rrIndex);
        kitCache.set(cacheKey, derived);
        return derived;
      }

      // 1c. Any tier match for this articulation: derive target velocity tier & RR variation
      const anyTierBuffer = this.findCustomBufferForArticulation(customBuffers, articulation);
      if (anyTierBuffer) {
        const derived = deriveAcousticVelocityAndRRLayers(ctx, anyTierBuffer, tier, rrIndex);
        kitCache.set(cacheKey, derived);
        return derived;
      }
    }

    // 2. Check legacy AudioSynth custom drum kit buffer store
    const legacyBuffer = this.findLegacyCustomBuffer(kitId, articulation);
    if (legacyBuffer) {
      const derived = deriveAcousticVelocityAndRRLayers(ctx, legacyBuffer, tier, rrIndex);
      kitCache.set(cacheKey, derived);
      return derived;
    }

    // 3. Built-in physical acoustic modeled PCM buffer renderer
    const buf = this.renderAcousticSampleBuffer(ctx, kitId, articulation, tier, rrIndex);
    kitCache.set(cacheKey, buf);
    return buf;
  }

  private findCustomBufferForArticulation(
    customBuffers: Map<string, AudioBuffer>,
    art: DrumArticulation
  ): AudioBuffer | null {
    // Check direct articulation single or any tier
    for (const [key, buf] of customBuffers.entries()) {
      if (key.startsWith(`${art}:`)) return buf;
    }

    // Check alias fallbacks
    const fallbackAliases: Record<string, DrumArticulation[]> = {
      snare_rimshot: ['snare', 'snare_sidestick'],
      snare_sidestick: ['snare', 'snare_rimshot'],
      hihat_semi: ['hihat_open', 'hihat_closed'],
      hihat_pedal: ['hihat_closed', 'hihat_open'],
      hihat_splash: ['hihat_open', 'hihat_semi'],
      tom_high: ['tom_mid', 'tom_low'],
      tom_mid: ['tom_high', 'tom_low'],
      tom_low: ['tom_mid', 'tom_high'],
      crash_right: ['crash_left', 'china', 'splash'],
      crash_left: ['crash_right', 'china', 'splash'],
      ride_bell: ['ride_bow'],
      ride_bow: ['ride_bell'],
      china: ['crash_left', 'crash_right'],
      splash: ['crash_left', 'crash_right'],
    };

    const fallbacks = fallbackAliases[art];
    if (fallbacks) {
      for (const fb of fallbacks) {
        for (const [key, buf] of customBuffers.entries()) {
          if (key.startsWith(`${fb}:`)) return buf;
        }
      }
    }

    return null;
  }

  private findLegacyCustomBuffer(kitId: string, art: DrumArticulation): AudioBuffer | null {
    const directBuf = audioSynth.getCustomDrumSampleBuffer(kitId, art);
    if (directBuf) return directBuf;

    // Check alias mappings to legacy 8 pad IDs
    const legacyAliases: Record<string, string[]> = {
      kick: ['kick'],
      snare: ['snare'],
      snare_rimshot: ['snare'],
      snare_sidestick: ['snare'],
      hihat_closed: ['hihat_closed'],
      hihat_semi: ['hihat_open', 'hihat_closed'],
      hihat_open: ['hihat_open'],
      hihat_pedal: ['hihat_closed'],
      hihat_splash: ['hihat_open'],
      tom_high: ['tom_high'],
      tom_mid: ['tom_high', 'tom_low'],
      tom_low: ['tom_low'],
      crash_left: ['crash'],
      crash_right: ['crash'],
      ride_bow: ['ride'],
      ride_bell: ['ride'],
      china: ['crash'],
      splash: ['crash'],
    };

    const aliases = legacyAliases[art];
    if (aliases) {
      for (const alias of aliases) {
        const b = audioSynth.getCustomDrumSampleBuffer(kitId, alias);
        if (b) return b;
      }
    }

    return null;
  }

  // --- EXTERNAL WAV SAMPLE LOADING & PRELOADING ---
  /**
   * Directly decodes, trims, normalizes and registers an external WAV/audio file
   * into a specific (Articulation x Velocity Tier x Round-Robin) slot.
   */
  public async loadCustomWavSample(
    kitId: string,
    articulation: DrumArticulation,
    audioData: string | ArrayBuffer,
    tier: VelocityTier = 'med',
    roundRobin: number = 1
  ): Promise<AudioBuffer> {
    const ctx = this.ensureAudioGraph();
    let arrayBuffer: ArrayBuffer;

    if (typeof audioData === 'string') {
      const base64Str = audioData.includes(',') ? audioData.split(',')[1] : audioData;
      const binaryStr = atob(base64Str);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } else {
      arrayBuffer = audioData;
    }

    // Decode PCM audio stream
    const rawDecoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

    // Zero-latency attack transient trimming
    const trimmed = trimAudioBufferSilence(ctx, rawDecoded, -52);
    // Peak normalization
    const normalized = normalizeAudioBuffer(ctx, trimmed, -0.5);

    if (!this.customKitBuffers.has(kitId)) {
      this.customKitBuffers.set(kitId, new Map());
    }

    const kitCustom = this.customKitBuffers.get(kitId)!;
    const layerKey = `${articulation}:${tier}:rr${roundRobin}`;
    kitCustom.set(layerKey, normalized);

    // Invalidate cached derived buffers for this kit to allow fresh regeneration
    this.kitSampleCache.delete(kitId);

    // Also register in audioSynth for legacy bridge
    try {
      audioSynth.loadCustomDrumSample(kitId, articulation, audioData).catch(() => {});
    } catch (e) {}

    this.notifyState();
    return normalized;
  }

  /**
   * Preloads an entire CustomDrumKit definition (both single samples & multi-layered layers)
   */
  public async preloadCustomKit(kit: CustomDrumKit): Promise<void> {
    const ctx = this.ensureAudioGraph();

    if (!this.customKitBuffers.has(kit.id)) {
      this.customKitBuffers.set(kit.id, new Map());
    }

    const kitCustom = this.customKitBuffers.get(kit.id)!;

    // 1. Load multi-layered samples (if present)
    if (kit.multiLayers) {
      const promises: Promise<void>[] = [];
      for (const [artStr, layerMap] of Object.entries(kit.multiLayers)) {
        const art = artStr as DrumArticulation;
        for (const [layerKey, layer] of Object.entries(layerMap)) {
          if (layer?.dataUrl) {
            promises.push(
              this.loadCustomWavSample(kit.id, art, layer.dataUrl, layer.tier, layer.roundRobin)
                .then(() => {})
                .catch((err) => {
                  console.warn(`[SampledDrumEngine] Failed loading multi-layer sample for ${kit.name} (${layerKey}):`, err);
                })
            );
          }
        }
      }
      await Promise.all(promises);
    }

    // 2. Load primary / legacy pad samples
    if (kit.samples) {
      const promises = Object.entries(kit.samples).map(async ([padId, sample]) => {
        if (sample?.dataUrl) {
          try {
            await this.loadCustomWavSample(
              kit.id,
              padId as DrumArticulation,
              sample.dataUrl,
              sample.tier || 'med',
              sample.roundRobin || 1
            );
          } catch (err) {
            console.warn(`[SampledDrumEngine] Failed loading sample ${sample.name}:`, err);
          }
        }
      });
      await Promise.all(promises);
    }

    this.kitSampleCache.delete(kit.id);
    this.notifyState();
  }

  public unloadCustomKit(kitId: string): void {
    this.customKitBuffers.delete(kitId);
    this.kitSampleCache.delete(kitId);
    this.notifyState();
  }

  public getCustomKitStats(kitId: string): { totalLayers: number; articulations: DrumArticulation[]; hasMultiLayers: boolean } {
    const buffers = this.customKitBuffers.get(kitId);
    if (!buffers || buffers.size === 0) {
      return { totalLayers: 0, articulations: [], hasMultiLayers: false };
    }

    const arts = new Set<DrumArticulation>();
    let multiLayerCount = 0;

    for (const key of buffers.keys()) {
      const parts = key.split(':');
      if (parts[0]) {
        arts.add(parts[0] as DrumArticulation);
      }
      if (parts.length >= 3) {
        multiLayerCount++;
      }
    }

    return {
      totalLayers: buffers.size,
      articulations: Array.from(arts),
      hasMultiLayers: multiLayerCount > 0,
    };
  }

  /**
   * Physical acoustic modeling & multi-sample PCM buffer renderer
   */
  private renderAcousticSampleBuffer(
    ctx: AudioContext,
    kitId: string,
    articulation: DrumArticulation,
    tier: VelocityTier,
    rr: number
  ): AudioBuffer {
    const sampleRate = ctx.sampleRate || 44100;
    const is808 = kitId === 'drums_808';
    const is909 = kitId === 'drums_electronic_909';
    const is80s = kitId === 'drums_80s_arena';
    const isJazz = kitId === 'drums_jazz';
    const isMetal = kitId === 'drums_metal' || kitId === 'drums_djent';
    const isFunk = kitId === 'drums_funk';
    const isHeavyRock = kitId === 'drums_heavy_rock';

    // Velocity Tier Dynamics Scalar (Velocity 1-127 mapped to 5 tiers)
    const tierVelMap: Record<VelocityTier, { power: number; bright: number; attackEnv: number; decayMult: number }> = {
      soft: { power: 0.35, bright: 0.45, attackEnv: 0.6, decayMult: 0.8 },
      med_soft: { power: 0.55, bright: 0.65, attackEnv: 0.8, decayMult: 0.9 },
      med: { power: 0.78, bright: 0.85, attackEnv: 1.0, decayMult: 1.0 },
      hard: { power: 0.95, bright: 1.15, attackEnv: 1.25, decayMult: 1.1 },
      very_hard: { power: 1.15, bright: 1.4, attackEnv: 1.5, decayMult: 1.25 },
    };

    const dynamics = tierVelMap[tier];
    // Round-Robin micro-variation seeds (subtle physical variations in strike location)
    const rrFreqOffset = (rr - 2.5) * 1.8;
    const rrPhaseOffset = rr * 0.45;

    switch (articulation) {
      case 'kick': {
        const duration = is808 ? 0.9 : is80s || isHeavyRock ? 0.65 : isMetal ? 0.38 : isFunk ? 0.28 : 0.52;
        const numSamples = Math.floor(sampleRate * duration * dynamics.decayMult);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const baseStartFreq = isMetal ? 440 : is909 ? 340 : is808 ? 160 : isFunk ? 210 : isHeavyRock ? 230 : 185;
        const startFreq = (baseStartFreq + rrFreqOffset * 2.5) * (0.85 + dynamics.bright * 0.2);
        const endFreq = is808 ? 32 : isMetal ? 46 : isJazz ? 48 : 39;
        const decayRate = is808 ? 3.0 : isMetal ? 11.5 : isFunk ? 10.5 : 6.8;

        let phaseSub = rrPhaseOffset;
        let phaseHarmonic = rrPhaseOffset * 1.5;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const currentFreq = endFreq + (startFreq - endFreq) * Math.exp(-t * (isMetal ? 36 : 24));
          phaseSub += (2 * Math.PI * currentFreq) / sampleRate;
          phaseHarmonic += (2 * Math.PI * currentFreq * 2.02) / sampleRate;

          const sub = Math.sin(phaseSub);
          const harmonic = Math.sin(phaseHarmonic) * 0.28 * Math.exp(-t * 16) * dynamics.bright;

          // Acoustic Beater click transient
          let beater = 0;
          if (t < 0.038) {
            const clickEnv = Math.exp(-t * 240) * dynamics.attackEnv;
            const clickFreq = (isMetal ? 3800 : is909 ? 2900 : 2300) + rrFreqOffset * 20;
            const clickSine = Math.sin(2 * Math.PI * clickFreq * t);
            const clickNoise = (Math.random() * 2 - 1) * 0.4;
            beater = (clickSine * 0.7 + clickNoise * 0.3) * clickEnv * (isMetal ? 1.4 : 0.8);
          }

          const mixed = Math.tanh((sub * 0.88 + harmonic + beater) * (isMetal || isHeavyRock ? 1.35 : 1.1));
          const amp = Math.exp(-t * decayRate);
          const val = mixed * amp * dynamics.power;

          left[i] = val;
          right[i] = val * (0.98 + (rr % 2 === 0 ? 0.04 : -0.04));
        }
        return buffer;
      }

      case 'snare':
      case 'snare_rimshot':
      case 'snare_sidestick': {
        const isRim = articulation === 'snare_rimshot';
        const isStick = articulation === 'snare_sidestick';
        const duration = isStick ? 0.18 : is80s ? 0.7 : isMetal ? 0.42 : isFunk ? 0.29 : 0.5;
        const numSamples = Math.floor(sampleRate * duration * dynamics.decayMult);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const baseTone = (isMetal ? 265 : isFunk ? 225 : is808 ? 185 : isJazz ? 168 : 195) + rrFreqOffset;
        const toneFreq1 = isRim ? baseTone * 1.25 : isStick ? baseTone * 1.8 : baseTone;
        const toneFreq2 = toneFreq1 * 1.66;
        let phase1 = rrPhaseOffset;
        let phase2 = rrPhaseOffset * 1.8;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const currentFreq1 = toneFreq1 * Math.exp(-t * 14);
          const currentFreq2 = toneFreq2 * Math.exp(-t * 18);
          phase1 += (2 * Math.PI * currentFreq1) / sampleRate;
          phase2 += (2 * Math.PI * currentFreq2) / sampleRate;

          // Body wood shell resonance
          const body = (Math.sin(phase1) * 0.6 + Math.sin(phase2) * 0.4) * Math.exp(-t * (isStick ? 24 : 14));

          // Snare wire excitation (snappy crisp high frequencies)
          const wireNoiseL = (Math.random() * 2 - 1);
          const wireNoiseR = (Math.random() * 2 - 1);
          const wireEnv = Math.exp(-t * (isStick ? 38 : is80s ? 7 : isFunk ? 22 : 16)) * dynamics.bright;
          const wiresL = wireNoiseL * wireEnv * (isStick ? 0.2 : isRim ? 1.2 : 0.9);
          const wiresR = wireNoiseR * wireEnv * (isStick ? 0.2 : isRim ? 1.2 : 0.9);

          // Rimshot metal rim ping
          let rimPing = 0;
          if (isRim && t < 0.04) {
            const pingFreq = 2200 + rrFreqOffset * 15;
            rimPing = Math.sin(2 * Math.PI * pingFreq * t) * Math.exp(-t * 180) * 1.1;
          }

          // Cross-stick wooden rim click
          let stickClick = 0;
          if (isStick && t < 0.02) {
            stickClick = Math.sin(2 * Math.PI * 1850 * t) * Math.exp(-t * 320) * 1.3;
          }

          const rawL = (body * (isStick ? 0.3 : 0.6) + wiresL + rimPing + stickClick) * dynamics.power;
          const rawR = (body * (isStick ? 0.3 : 0.6) + wiresR + rimPing + stickClick) * dynamics.power;

          left[i] = Math.tanh(rawL * 1.2);
          right[i] = Math.tanh(rawR * 1.2);
        }
        return buffer;
      }

      case 'hihat_closed':
      case 'hihat_semi':
      case 'hihat_open':
      case 'hihat_pedal':
      case 'hihat_splash': {
        const isClosed = articulation === 'hihat_closed';
        const isSemi = articulation === 'hihat_semi';
        const isOpen = articulation === 'hihat_open';
        const isPedal = articulation === 'hihat_pedal';
        const isSplash = articulation === 'hihat_splash';

        const duration = isClosed ? 0.09 : isPedal ? 0.11 : isSemi ? 0.35 : isSplash ? 0.8 : 1.2;
        const numSamples = Math.floor(sampleRate * duration * dynamics.decayMult);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        // Metallic cymbal harmonic clusters
        const freqs = [
          (3180 + rrFreqOffset * 10),
          (4520 + rrFreqOffset * 15),
          (6840 + rrFreqOffset * 25),
          (8920 + rrFreqOffset * 30),
          (11400 + rrFreqOffset * 40),
        ];

        const decayRate = isClosed ? 48 : isPedal ? 42 : isSemi ? 12 : isSplash ? 5.5 : 3.8;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          let metal = 0;
          for (let f = 0; f < freqs.length; f++) {
            metal += Math.sin(2 * Math.PI * freqs[f] * t + rrPhaseOffset * f) * (0.3 - f * 0.04);
          }

          const noiseL = (Math.random() * 2 - 1) * 0.7;
          const noiseR = (Math.random() * 2 - 1) * 0.7;
          const env = Math.exp(-t * decayRate);

          // Attack chick
          let stickChick = 0;
          if (t < 0.015 && (isClosed || isSemi || isOpen)) {
            stickChick = (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.8 * dynamics.attackEnv;
          }

          const valL = (metal * 0.65 + noiseL * 0.45 + stickChick) * env * dynamics.power * dynamics.bright;
          const valR = (metal * 0.65 + noiseR * 0.45 + stickChick) * env * dynamics.power * dynamics.bright;

          left[i] = Math.tanh(valL * 1.15) * 0.9;
          right[i] = Math.tanh(valR * 1.15) * 0.9;
        }
        return buffer;
      }

      case 'tom_high':
      case 'tom_mid':
      case 'tom_low': {
        const isHigh = articulation === 'tom_high';
        const isMid = articulation === 'tom_mid';
        const baseFreq = (isHigh ? 175 : isMid ? 130 : 92) + rrFreqOffset * 1.2;
        const duration = (isHigh ? 0.45 : isMid ? 0.65 : 0.85) * dynamics.decayMult;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        let phase = rrPhaseOffset;
        let phaseHarmonic = rrPhaseOffset * 1.5;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const curFreq = baseFreq * (1 + 0.35 * Math.exp(-t * 22));
          phase += (2 * Math.PI * curFreq) / sampleRate;
          phaseHarmonic += (2 * Math.PI * curFreq * 1.98) / sampleRate;

          const fund = Math.sin(phase);
          const harm = Math.sin(phaseHarmonic) * 0.32 * Math.exp(-t * 8) * dynamics.bright;

          // Stick attack transient
          let stick = 0;
          if (t < 0.025) {
            stick = (Math.random() * 2 - 1) * Math.exp(-t * 200) * dynamics.attackEnv * 0.6;
          }

          const env = Math.exp(-t * (isHigh ? 7.5 : isMid ? 6.0 : 4.8));
          const val = Math.tanh((fund * 0.8 + harm + stick) * 1.1) * env * dynamics.power;

          // Stereo panning spread for toms
          const panOffset = isHigh ? -0.25 : isMid ? 0.1 : 0.35;
          left[i] = val * (1 - panOffset * 0.5);
          right[i] = val * (1 + panOffset * 0.5);
        }
        return buffer;
      }

      case 'crash_left':
      case 'crash_right':
      case 'china':
      case 'splash': {
        const isSplash = articulation === 'splash';
        const isChina = articulation === 'china';
        const isRight = articulation === 'crash_right';
        const duration = isSplash ? 0.9 : isChina ? 1.6 : isRight ? 2.2 : 1.9;
        const numSamples = Math.floor(sampleRate * duration * dynamics.decayMult);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const clusterFreqs = isChina
          ? [1250, 2400, 3600, 5800, 8900]
          : isSplash
          ? [3800, 5600, 8200, 11500]
          : isRight
          ? [2200, 3800, 5400, 7800, 10500]
          : [2600, 4200, 6100, 8600, 11200];

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          let chime = 0;
          for (let f = 0; f < clusterFreqs.length; f++) {
            chime += Math.sin(2 * Math.PI * (clusterFreqs[f] + rrFreqOffset * 10) * t + rrPhaseOffset * f) * 0.25;
          }

          const sizzleL = (Math.random() * 2 - 1) * 0.8;
          const sizzleR = (Math.random() * 2 - 1) * 0.8;
          const env = Math.exp(-t * (isSplash ? 4.8 : isChina ? 2.6 : 1.8));

          const valL = (chime * 0.5 + sizzleL * 0.7) * env * dynamics.power * dynamics.bright;
          const valR = (chime * 0.5 + sizzleR * 0.7) * env * dynamics.power * dynamics.bright;

          left[i] = Math.tanh(valL * 1.1) * 0.92;
          right[i] = Math.tanh(valR * 1.1) * 0.92;
        }
        return buffer;
      }

      case 'ride_bow':
      case 'ride_bell': {
        const isBell = articulation === 'ride_bell';
        const duration = 2.4 * dynamics.decayMult;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const bellFreqs = isBell
          ? [(840 + rrFreqOffset * 4), (1680 + rrFreqOffset * 8), (3120 + rrFreqOffset * 12), (5400 + rrFreqOffset * 20)]
          : [(620 + rrFreqOffset * 3), (1240 + rrFreqOffset * 6), (2480 + rrFreqOffset * 10), (4600 + rrFreqOffset * 15)];

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          let ping = 0;
          for (let f = 0; f < bellFreqs.length; f++) {
            ping += Math.sin(2 * Math.PI * bellFreqs[f] * t) * (isBell ? 0.35 : 0.22);
          }

          const sizzleL = (Math.random() * 2 - 1) * (isBell ? 0.25 : 0.55);
          const sizzleR = (Math.random() * 2 - 1) * (isBell ? 0.25 : 0.55);
          const env = Math.exp(-t * (isBell ? 1.6 : 1.9));

          const valL = (ping * (isBell ? 1.1 : 0.6) + sizzleL * 0.5) * env * dynamics.power * dynamics.bright;
          const valR = (ping * (isBell ? 1.1 : 0.6) + sizzleR * 0.5) * env * dynamics.power * dynamics.bright;

          left[i] = Math.tanh(valL * 1.1) * 0.92;
          right[i] = Math.tanh(valR * 1.1) * 0.92;
        }
        return buffer;
      }

      case 'tambourine':
      case 'cowbell':
      case 'shaker':
      case 'handclap': {
        const isCowbell = articulation === 'cowbell';
        const isClap = articulation === 'handclap';
        const isShaker = articulation === 'shaker';
        const duration = isCowbell ? 0.45 : isClap ? 0.32 : isShaker ? 0.18 : 0.38;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          let val = 0;
          if (isCowbell) {
            const cb1 = Math.sin(2 * Math.PI * 560 * t);
            const cb2 = Math.sin(2 * Math.PI * 845 * t);
            val = (cb1 * 0.6 + cb2 * 0.4) * Math.exp(-t * 9.5);
          } else if (isClap) {
            // Multi-hand clap cluster
            let clapNoise = (Math.random() * 2 - 1);
            if (t < 0.012 || (t > 0.018 && t < 0.03) || (t > 0.035 && t < 0.048)) {
              clapNoise *= 1.4;
            }
            val = clapNoise * Math.exp(-t * 18);
          } else if (isShaker) {
            val = (Math.random() * 2 - 1) * Math.sin(Math.PI * (t / duration)) * Math.exp(-t * 22);
          } else {
            // Tambourine jingle
            const jingle1 = Math.sin(2 * Math.PI * 6200 * t);
            const jingle2 = Math.sin(2 * Math.PI * 9400 * t);
            const jNoise = (Math.random() * 2 - 1) * 0.6;
            val = (jingle1 * 0.4 + jingle2 * 0.3 + jNoise) * Math.exp(-t * 14);
          }

          const outVal = Math.tanh(val * 1.2) * dynamics.power;
          left[i] = outVal;
          right[i] = outVal;
        }
        return buffer;
      }
    }
  }

  // --- CORE PLAYBACK EXECUTION (Multi-Velocity, Round-Robin, Choke, Humanize) ---
  /**
   * Main Drum Playback Entry Point
   * @param articulation drum sound type
   * @param rawVelocity 0..1 or 1..127
   * @param kitId optional drum kit profile
   */
  public triggerPad(
    articulation: DrumArticulation,
    rawVelocity: number = 100,
    kitId: string = this.activeKitId,
    atTime?: number
  ): AudioBufferSourceNode | null {
    const ctx = this.ensureAudioGraph();
    // `atTime` je čas na audio hodinách, kdy má úder znít. Looper si takhle
    // plánuje dopředu — kdyby se spoléhal na časovač prohlížeče, groove by
    // se rozjížděl, protože ten se zpožďuje o desítky milisekund a na
    // bicích je to slyšet okamžitě.
    const now = atTime !== undefined ? Math.max(atTime, ctx.currentTime) : ctx.currentTime;

    // 1. Calculate Exact Velocity (1..127) & Velocity Tier
    let midiVelocity = rawVelocity <= 1.0 ? Math.round(rawVelocity * 127) : Math.round(rawVelocity);
    midiVelocity = Math.max(1, Math.min(127, midiVelocity));

    // 2. Apply Humanization (Velocity & Timing Jitter)
    let playDelaySec = 0;
    if (this.humanize.enabled && this.humanize.intensity > 0) {
      const velSwing = (Math.random() * 2 - 1) * (this.humanize.velocityJitter * this.humanize.intensity * 127);
      midiVelocity = Math.max(1, Math.min(127, Math.round(midiVelocity + velSwing)));

      const timingJitterMs = (Math.random() * 2 - 1) * (this.humanize.timingJitterMs * this.humanize.intensity);
      playDelaySec = Math.max(0, timingJitterMs / 1000);
    }

    const tier = getVelocityTier(midiVelocity);

    // 3. Round-Robin Variation Selection (Anti-Machine-Gun)
    const rrKey = `${articulation}:${tier}`;
    const lastRR = this.roundRobinTrackers.get(rrKey) || 0;
    // Choose next RR (1..4 or 1..6) avoiding identical repeat
    let nextRR = (lastRR % 4) + 1;
    if (Math.random() > 0.5) {
      nextRR = ((lastRR + 1) % 4) + 1;
    }
    this.roundRobinTrackers.set(rrKey, nextRR);

    // 4. Hi-Hat Choke Group Management
    // If closed or pedal hi-hat is played, immediately choke any open/splash hi-hat
    if (
      articulation === 'hihat_closed' ||
      articulation === 'hihat_pedal' ||
      articulation === 'hihat_semi'
    ) {
      const activeHHSources = this.chokeGroups.get('hihat');
      if (activeHHSources && activeHHSources.size > 0) {
        activeHHSources.forEach((src) => {
          try {
            // Smooth natural hi-hat damp curve (30ms)
            src.stop(now + playDelaySec + 0.035);
          } catch (e) {}
        });
        activeHHSources.clear();
      }
    }

    // 5. Fetch AudioBuffer
    const audioBuf = this.getSampleBuffer(kitId, articulation, tier, nextRR);
    if (!audioBuf) return null;

    // 6. Audio Node Creation & Routing to Dedicated Mixer Channel
    const source = ctx.createBufferSource();
    source.buffer = audioBuf;

    // Micro-pitch humanization
    let detuneCents = 0;
    if (this.humanize.enabled && this.humanize.intensity > 0) {
      detuneCents = (Math.random() * 2 - 1) * (this.humanize.pitchDriftCents * this.humanize.intensity);
      source.detune.setValueAtTime(detuneCents, now + playDelaySec);
    }

    const voiceGain = ctx.createGain();
    // Velocity to Gain scaling with dynamic curve
    const normalizedVel = midiVelocity / 127;
    const gainVal = Math.pow(normalizedVel, 1.25) * 1.15;
    voiceGain.gain.setValueAtTime(gainVal, now + playDelaySec);

    source.connect(voiceGain);

    const channelName = this.getChannelForArticulation(articulation);
    const chNodes = this.channelNodes.get(channelName);

    if (chNodes) {
      voiceGain.connect(chNodes.inputGain);
    } else if (this.masterBusGain) {
      voiceGain.connect(this.masterBusGain);
    } else {
      voiceGain.connect(ctx.destination);
    }

    // 7. Track Hi-Hat in Choke Group
    if (articulation === 'hihat_open' || articulation === 'hihat_splash' || articulation === 'hihat_semi') {
      if (!this.chokeGroups.has('hihat')) {
        this.chokeGroups.set('hihat', new Set());
      }
      this.chokeGroups.get('hihat')!.add(source);
      source.onended = () => {
        this.chokeGroups.get('hihat')?.delete(source);
      };
    }

    // 8. Start Playback
    source.start(now + playDelaySec);

    // 9. Notify UI Subscribers (Voice visual feedback & VU meters)
    const voiceEvent: DrumVoiceEvent = {
      articulation,
      velocity: midiVelocity,
      velocityTier: tier,
      roundRobinIndex: nextRR,
      time: Date.now(),
    };

    this.listeners.forEach((cb) => {
      try {
        cb(voiceEvent);
      } catch (e) {}
    });

    eventBus.emit('DRUM_VOICE_TRIGGERED', voiceEvent);

    return source;
  }

  // --- GENERAL MIDI (GM) DRUM NOTE MAPPING ---
  /**
   * Translates standard MIDI Note Numbers (e.g. 36 = Kick, 38 = Snare, 42 = Closed HH) into drum articulations
   */
  public triggerMidiNote(
    midiNote: number,
    velocity: number = 100,
    atTime?: number
  ): AudioBufferSourceNode | null {
    const art = this.midiNoteToArticulation(midiNote);
    if (!art) return null;
    return this.triggerPad(art, velocity, this.activeKitId, atTime);
  }

  public midiNoteToArticulation(midiNote: number): DrumArticulation | null {
    switch (midiNote) {
      case 35: // Acoustic Bass Drum
      case 36: // Bass Drum 1
        return 'kick';
      case 37: // Side Stick
        return 'snare_sidestick';
      case 38: // Acoustic Snare
        return 'snare';
      case 40: // Electric Snare / Rimshot
        return 'snare_rimshot';
      case 42: // Closed Hi-Hat
        return 'hihat_closed';
      case 44: // Pedal Hi-Hat
        return 'hihat_pedal';
      case 46: // Open Hi-Hat
        return 'hihat_open';
      case 41: // Low Floor Tom
      case 43: // High Floor Tom
        return 'tom_low';
      case 45: // Low Tom
      case 47: // Low-Mid Tom
        return 'tom_mid';
      case 48: // Hi-Mid Tom
      case 50: // High Tom
        return 'tom_high';
      case 49: // Crash Cymbal 1
        return 'crash_left';
      case 57: // Crash Cymbal 2
        return 'crash_right';
      case 51: // Ride Cymbal 1 (Bow)
        return 'ride_bow';
      case 59: // Ride Cymbal 2
      case 53: // Ride Bell
        return 'ride_bell';
      case 52: // Chinese Cymbal
        return 'china';
      case 55: // Splash Cymbal
        return 'splash';
      case 54: // Tambourine
        return 'tambourine';
      case 56: // Cowbell
        return 'cowbell';
      case 69: // Cabasa / Shaker
      case 70: // Maracas / Shaker
        return 'shaker';
      case 39: // Hand Clap
        return 'handclap';
      default:
        return null;
    }
  }

  // --- MIXER CONTROLS (Volume, Pan, EQ, Compressor, Reverb, Mute, Solo) ---
  public getMixerConfig(): Record<DrumMixerChannelName, DrumMixerChannelConfig> {
    return { ...this.mixerConfig };
  }

  public setChannelVolume(channel: DrumMixerChannelName, volume: number): void {
    if (this.mixerConfig[channel]) {
      this.mixerConfig[channel].volume = Math.max(0, Math.min(2.0, volume));
      if (this.masterBusGain) {
        this.updateChannelGains();
      }
      this.notifyState();
    }
  }

  public setChannelPan(channel: DrumMixerChannelName, pan: number): void {
    if (this.mixerConfig[channel]) {
      this.mixerConfig[channel].pan = Math.max(-1, Math.min(1, pan));
      const nodes = this.channelNodes.get(channel);
      if (nodes && 'pan' in nodes.panNode) {
        const ctx = this.ensureAudioGraph();
        (nodes.panNode as StereoPannerNode).pan.setValueAtTime(this.mixerConfig[channel].pan, ctx.currentTime);
      }
      this.notifyState();
    }
  }

  public setChannelMute(channel: DrumMixerChannelName, mute: boolean): void {
    if (this.mixerConfig[channel]) {
      this.mixerConfig[channel].mute = mute;
      if (this.masterBusGain) {
        this.updateChannelGains();
      }
      this.notifyState();
    }
  }

  public setChannelSolo(channel: DrumMixerChannelName, solo: boolean): void {
    if (this.mixerConfig[channel]) {
      this.mixerConfig[channel].solo = solo;
      if (this.masterBusGain) {
        this.updateChannelGains();
      }
      this.notifyState();
    }
  }

  public setChannelEQ(
    channel: DrumMixerChannelName,
    lowGain: number,
    midGain: number,
    highGain: number
  ): void {
    if (this.mixerConfig[channel]) {
      this.mixerConfig[channel].lowGain = lowGain;
      this.mixerConfig[channel].midGain = midGain;
      this.mixerConfig[channel].highGain = highGain;

      const nodes = this.channelNodes.get(channel);
      if (nodes) {
        const ctx = this.ensureAudioGraph();
        nodes.lowEq.gain.setValueAtTime(lowGain, ctx.currentTime);
        nodes.midEq.gain.setValueAtTime(midGain, ctx.currentTime);
        nodes.highEq.gain.setValueAtTime(highGain, ctx.currentTime);
      }
      this.notifyState();
    }
  }

  public setChannelReverbSend(channel: DrumMixerChannelName, send: number): void {
    if (this.mixerConfig[channel]) {
      this.mixerConfig[channel].reverbSend = Math.max(0, Math.min(1, send));
      const nodes = this.channelNodes.get(channel);
      if (nodes) {
        const ctx = this.ensureAudioGraph();
        nodes.reverbSendGain.gain.setValueAtTime(this.mixerConfig[channel].reverbSend, ctx.currentTime);
      }
      this.notifyState();
    }
  }

  private updateChannelGains(): void {
    if (!this.masterBusGain || this.channelNodes.size === 0) return;
    const ctx = this.ensureAudioGraph();
    const anySolo = Object.values(this.mixerConfig).some((c) => c.solo);

    Object.entries(this.mixerConfig).forEach(([key, config]) => {
      const chName = key as DrumMixerChannelName;
      const nodes = this.channelNodes.get(chName);
      if (!nodes) return;

      let effectiveGain = config.volume;
      if (config.mute) {
        effectiveGain = 0.0;
      } else if (anySolo && !config.solo) {
        effectiveGain = 0.0;
      }

      nodes.outputGain.gain.cancelScheduledValues(ctx.currentTime);
      nodes.outputGain.gain.setValueAtTime(effectiveGain, ctx.currentTime);
    });
  }

  // --- HUMANIZE SETTINGS ---
  public getHumanizeSettings(): HumanizeSettings {
    return { ...this.humanize };
  }

  public setHumanizeIntensity(intensity: number): void {
    this.humanize.intensity = Math.max(0, Math.min(1, intensity));
    this.humanize.enabled = intensity > 0;
    this.notifyState();
  }

  public setHumanizeConfig(config: Partial<HumanizeSettings>): void {
    this.humanize = { ...this.humanize, ...config };
    this.notifyState();
  }

  // --- KIT SWITCHING ---
  public getActiveKitId(): string {
    return this.activeKitId;
  }

  public setActiveKit(kitId: string): void {
    this.activeKitId = kitId;
    this.notifyState();
  }
}

// Global Singleton Export
export const sampledDrumEngine = new SampledDrumEngine();
