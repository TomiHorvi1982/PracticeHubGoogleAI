// Factory Pattern Service for Drum Kit Sample Management, Dynamic Buffer Mapping & Real-Time Switching
import { CustomDrumKit, DrumPad } from '../types';
import { DRUM_KITS, DrumKitOption } from '../data/drumKits';
import { InstrumentProfile, audioSynth } from './audioSynth';
import { customDrumKitService } from './customDrumKitService';
import { eventBus } from './eventBus';
import { sampledDrumEngine, DrumArticulation } from './SampledDrumEngine';

export type DrumPadType =
  | 'kick'
  | 'snare'
  | 'hihat_closed'
  | 'hihat_open'
  | 'tom_low'
  | 'tom_high'
  | 'crash'
  | 'ride';

export interface DrumKitState {
  activeKitId: string;
  activeKitName: string;
  isCustom: boolean;
  loadedPads: DrumPadType[];
  isLoading: boolean;
  error: string | null;
}

export interface DrumKitInstance {
  id: string;
  name: string;
  czName: string;
  icon: string;
  genre: string;
  description: string;
  isCustom: boolean;
  buffers: Map<DrumPadType, AudioBuffer>;
  isLoaded: () => boolean;
  load: () => Promise<Map<DrumPadType, AudioBuffer>>;
  unload: () => void;
  playPad: (padType: DrumPadType, velocity?: number) => void;
}

export class DrumKitFactory {
  private activeKitId: string = 'drums';
  private kitInstances: Map<string, DrumKitInstance> = new Map();
  private kitBuffers: Map<string, Map<DrumPadType, AudioBuffer>> = new Map();
  private loadingKits: Set<string> = new Set();
  private subscribers: Set<(state: DrumKitState) => void> = new Set();
  private maxCachedKits: number = 8; // Keep at most 8 kit buffer sets in memory (LRU eviction)
  private kitAccessOrder: string[] = [];

  constructor() {
    this.init();
  }

  private init(): void {
    // 1. Register all 10 built-in studio kits
    DRUM_KITS.forEach((kit) => {
      this.registerBuiltinKit(kit);
    });

    // 2. Subscribe to custom drum kits service
    customDrumKitService.subscribe((customKits) => {
      customKits.forEach((cKit) => {
        this.registerCustomKit(cKit);
      });
    });
  }

  public subscribe(cb: (state: DrumKitState) => void): () => void {
    this.subscribers.add(cb);
    cb(this.getState());
    return () => this.subscribers.delete(cb);
  }

  private notify(): void {
    const state = this.getState();
    for (const sub of this.subscribers) {
      try {
        sub(state);
      } catch (e) {
        console.error('[DrumKitFactory] Error notifying subscriber:', e);
      }
    }
  }

  public getState(): DrumKitState {
    const activeBuffers = this.kitBuffers.get(this.activeKitId);
    const loadedPads: DrumPadType[] = activeBuffers
      ? (Array.from(activeBuffers.keys()) as DrumPadType[])
      : [];
    const isCustom = customDrumKitService.isCustomKitId(this.activeKitId);
    const name = this.getKitName(this.activeKitId);

    return {
      activeKitId: this.activeKitId,
      activeKitName: name,
      isCustom,
      loadedPads,
      isLoading: this.loadingKits.has(this.activeKitId),
      error: null,
    };
  }

  public getActiveKitId(): string {
    return this.activeKitId;
  }

  public getKitName(kitId: string): string {
    const found = DRUM_KITS.find((k) => k.id === kitId);
    if (found) return found.name;
    const cKit = customDrumKitService.getAllKits().find((k) => k.id === kitId);
    if (cKit) return cKit.name;
    return kitId;
  }

  public getAllKitOptions(): { id: string; name: string; czName: string; icon: string; genre: string; isCustom: boolean }[] {
    const builtins = DRUM_KITS.map((k) => ({
      id: k.id,
      name: k.name,
      czName: k.czName,
      icon: k.icon,
      genre: k.genre,
      isCustom: false,
    }));

    const customs = customDrumKitService.getAllKits().map((k) => ({
      id: k.id,
      name: k.name,
      czName: k.czName || k.name,
      icon: k.icon || '🥁',
      genre: k.genre || 'Custom',
      isCustom: true,
    }));

    return [...builtins, ...customs];
  }

  // --- REGISTRATION & FACTORY CREATION ---
  private registerBuiltinKit(kit: DrumKitOption): void {
    const instance: DrumKitInstance = {
      id: kit.id,
      name: kit.name,
      czName: kit.czName,
      icon: kit.icon,
      genre: kit.genre,
      description: kit.description,
      isCustom: false,
      buffers: new Map(),
      isLoaded: () => this.isKitLoaded(kit.id),
      load: async () => this.loadKitBuffers(kit.id),
      unload: () => this.unloadKit(kit.id),
      playPad: (padType, velocity = 1.0) => this.playDrumSound(padType, velocity, kit.id),
    };

    this.kitInstances.set(kit.id, instance);
  }

  private registerCustomKit(kit: CustomDrumKit): void {
    const instance: DrumKitInstance = {
      id: kit.id,
      name: kit.name,
      czName: kit.czName || kit.name,
      icon: kit.icon || '🥁',
      genre: kit.genre || 'Custom',
      description: kit.description || 'Uživatelská sada',
      isCustom: true,
      buffers: new Map(),
      isLoaded: () => this.isKitLoaded(kit.id),
      load: async () => this.loadKitBuffers(kit.id),
      unload: () => this.unloadKit(kit.id),
      playPad: (padType, velocity = 1.0) => this.playDrumSound(padType, velocity, kit.id),
    };

    this.kitInstances.set(kit.id, instance);
  }

  public getKit(kitId: string): DrumKitInstance | null {
    return this.kitInstances.get(kitId) || null;
  }

  // --- DYNAMIC KIT SWITCHING & BUFFER MANAGEMENT ---
  /**
   * Real-time kit switcher:
   * 1. Updates activeKitId
   * 2. Loads & decodes audio buffers for the newly selected kit
   * 3. Unloads older inactive kits if memory limit is exceeded
   * 4. Emits events for cross-component synchronization
   */
  public async switchKit(newKitId: string): Promise<void> {
    if (this.activeKitId === newKitId && this.isKitLoaded(newKitId)) {
      return;
    }

    this.activeKitId = newKitId;
    sampledDrumEngine.setActiveKit(newKitId);
    this.updateAccessOrder(newKitId);
    this.notify();

    // Load newly selected kit
    await this.loadKitBuffers(newKitId);

    // Evict least recently used inactive kits if buffer memory exceeds threshold
    this.evictInactiveKitsIfNeeded();

    // Emit event bus notification
    eventBus.emit('INSTRUMENT_CHANGED', { instrument: newKitId });
    this.notify();
  }

  public isKitLoaded(kitId: string): boolean {
    const buffers = this.kitBuffers.get(kitId);
    return !!(buffers && buffers.size > 0);
  }

  public async preloadKit(kitId: string): Promise<void> {
    await this.loadKitBuffers(kitId);
  }

  /**
   * Loads and maps audio buffers for a specific drum kit
   */
  public async loadKitBuffers(kitId: string): Promise<Map<DrumPadType, AudioBuffer>> {
    if (this.kitBuffers.has(kitId)) {
      this.updateAccessOrder(kitId);
      return this.kitBuffers.get(kitId)!;
    }

    if (this.loadingKits.has(kitId)) {
      // Wait for existing load promise
      while (this.loadingKits.has(kitId)) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return this.kitBuffers.get(kitId) || new Map();
    }

    this.loadingKits.add(kitId);
    this.notify();

    try {
      const ctx = audioSynth.initCtx();
      const buffers = new Map<DrumPadType, AudioBuffer>();

      if (customDrumKitService.isCustomKitId(kitId)) {
        // Load custom user kit samples
        const customKit = await customDrumKitService.getKitById(kitId);
        const pads: DrumPadType[] = [
          'kick',
          'snare',
          'hihat_closed',
          'hihat_open',
          'tom_low',
          'tom_high',
          'crash',
          'ride',
        ];

        for (const padId of pads) {
          const sample = customKit?.samples?.[padId];
          if (sample?.dataUrl) {
            try {
              const res = await fetch(sample.dataUrl);
              const arrayBuf = await res.arrayBuffer();
              const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
              buffers.set(padId, decoded);
            } catch (err) {
              console.warn(`[DrumKitFactory] Failed to decode custom sample for pad ${padId}:`, err);
              // Fall back to synthesized pad for this slot
              const fallbackBuf = this.synthesizePadBuffer(ctx, padId, 'drums');
              buffers.set(padId, fallbackBuf);
            }
          } else {
            // Use base kit synthesis fallback for empty custom pads
            const fallbackBuf = this.synthesizePadBuffer(ctx, padId, 'drums');
            buffers.set(padId, fallbackBuf);
          }
        }
      } else {
        // High-definition acoustic synthesis generation for built-in studio kits
        const pads: DrumPadType[] = [
          'kick',
          'snare',
          'hihat_closed',
          'hihat_open',
          'tom_low',
          'tom_high',
          'crash',
          'ride',
        ];

        for (const padId of pads) {
          const buf = this.synthesizePadBuffer(ctx, padId, kitId as InstrumentProfile);
          buffers.set(padId, buf);
        }
      }

      this.kitBuffers.set(kitId, buffers);
      this.updateAccessOrder(kitId);

      const inst = this.kitInstances.get(kitId);
      if (inst) {
        inst.buffers = buffers;
      }

      return buffers;
    } finally {
      this.loadingKits.delete(kitId);
      this.notify();
    }
  }

  /**
   * Unload a specific drum kit from memory to free audio buffer resources
   */
  public unloadKit(kitId: string): void {
    if (this.kitBuffers.has(kitId)) {
      this.kitBuffers.delete(kitId);
      this.kitAccessOrder = this.kitAccessOrder.filter((id) => id !== kitId);
      const inst = this.kitInstances.get(kitId);
      if (inst) {
        inst.buffers.clear();
      }
      this.notify();
    }
  }

  /**
   * Unload all inactive kits, keeping only the active kit or specified ID
   */
  public unloadInactiveKits(keepKitId: string = this.activeKitId): void {
    const kitIds = Array.from(this.kitBuffers.keys());
    for (const id of kitIds) {
      if (id !== keepKitId) {
        this.unloadKit(id);
      }
    }
  }

  private updateAccessOrder(kitId: string): void {
    this.kitAccessOrder = this.kitAccessOrder.filter((id) => id !== kitId);
    this.kitAccessOrder.push(kitId);
  }

  private evictInactiveKitsIfNeeded(): void {
    while (this.kitAccessOrder.length > this.maxCachedKits) {
      const oldestKitId = this.kitAccessOrder[0];
      if (oldestKitId !== this.activeKitId) {
        this.unloadKit(oldestKitId);
      } else if (this.kitAccessOrder.length > 1) {
        const nextOldest = this.kitAccessOrder[1];
        this.unloadKit(nextOldest);
      } else {
        break;
      }
    }
  }

  // --- AUDIO SYNTHESIS ENGINE (Multi-Kit AudioBuffer Renderer) ---
  /**
   * Synthesizes a studio-quality AudioBuffer with acoustic physical modeling,
   * multi-harmonic shell resonance, stereo room decay, and transient impact
   * tailored to each of the 10 distinct drum kit profiles.
   */
  private synthesizePadBuffer(
    ctx: AudioContext,
    padType: DrumPadType,
    profile: InstrumentProfile
  ): AudioBuffer {
    const sampleRate = ctx.sampleRate || 44100;
    const is808 = profile === 'drums_808';
    const is909 = profile === 'drums_electronic_909';
    const is80s = profile === 'drums_80s_arena';
    const isJazz = profile === 'drums_jazz';
    const isMetal = profile === 'drums_metal' || profile === 'drums_djent';
    const isDjent = profile === 'drums_djent';
    const isFunk = profile === 'drums_funk';
    const isHeavyRock = profile === 'drums_heavy_rock';
    const isPunk = profile === 'drums_punk';

    switch (padType) {
      case 'kick': {
        const duration = is808 ? 0.85 : is80s || isHeavyRock ? 0.6 : isMetal ? 0.32 : isFunk ? 0.26 : 0.48;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const startFreq = isMetal ? 440 : is909 ? 320 : is808 ? 160 : isFunk ? 190 : isHeavyRock ? 220 : 175;
        const endFreq = is808 ? 30 : isMetal ? (isDjent ? 52 : 44) : isJazz ? 46 : 38;
        const decayRate = is808 ? 3.2 : isMetal ? 12.0 : isFunk ? 11.0 : 6.5;

        let phaseSub = 0;
        let phaseHarmonic = 0;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const currentFreq = endFreq + (startFreq - endFreq) * Math.exp(-t * (isMetal ? 38 : 24));
          phaseSub += (2 * Math.PI * currentFreq) / sampleRate;
          phaseHarmonic += (2 * Math.PI * currentFreq * 2.04) / sampleRate;

          // 1. Sub fundamental & 2nd harmonic resonance
          let sub = Math.sin(phaseSub);
          const harmonic = Math.sin(phaseHarmonic) * 0.25 * Math.exp(-t * 18);

          // 2. Beater attack click & punch transient
          let beater = 0;
          if (t < 0.035) {
            const clickEnv = Math.exp(-t * 260);
            const clickFreq = isMetal ? 3600 : is909 ? 2800 : 2200;
            const clickSine = Math.sin(2 * Math.PI * clickFreq * t) * (isMetal ? 0.7 : 0.4);
            const clickNoise = (Math.random() * 2 - 1) * (isMetal ? 0.5 : 0.3);
            beater = (clickSine + clickNoise) * clickEnv;
          }

          // 3. Nonlinear warmth saturation
          let mixed = sub * 0.85 + harmonic + beater;
          if (is808 || isHeavyRock || isMetal) {
            mixed = Math.tanh(mixed * 1.45);
          } else {
            mixed = Math.tanh(mixed * 1.15);
          }

          const amp = Math.exp(-t * decayRate);
          const val = mixed * amp * 0.98;
          left[i] = val;
          right[i] = val;
        }
        return buffer;
      }

      case 'snare': {
        const duration = is80s ? 0.65 : isMetal ? 0.38 : isFunk ? 0.28 : 0.48;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const toneFreq1 = isMetal ? 260 : isFunk ? 220 : is808 ? 180 : isJazz ? 165 : 190;
        const toneFreq2 = toneFreq1 * 1.68;
        let phase1 = 0;
        let phase2 = 0;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const currentFreq1 = toneFreq1 * Math.exp(-t * 15);
          const currentFreq2 = toneFreq2 * Math.exp(-t * 18);
          phase1 += (2 * Math.PI * currentFreq1) / sampleRate;
          phase2 += (2 * Math.PI * currentFreq2) / sampleRate;

          // Acoustic shell body (dual tuned drum head tones)
          const body1 = Math.sin(phase1) * Math.exp(-t * (isMetal ? 20 : 14));
          const body2 = Math.sin(phase2) * 0.4 * Math.exp(-t * (isMetal ? 24 : 16));
          const body = (body1 + body2) * (isJazz ? 0.35 : 0.7);

          // Snare bottom wire buzz (stereo decorrelated noise)
          const noiseL = Math.random() * 2 - 1;
          const noiseR = Math.random() * 2 - 1;

          // Rim stick crack transient
          const rimCrack = t < 0.008 ? (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.8 : 0;

          let noiseEnv: number;
          if (is80s) {
            noiseEnv = t < 0.24 ? 1.0 : t < 0.28 ? (0.28 - t) / 0.04 : 0;
          } else if (isJazz) {
            noiseEnv = Math.exp(-t * 7.5);
          } else if (isFunk) {
            noiseEnv = Math.exp(-t * 22.0);
          } else {
            noiseEnv = Math.exp(-t * 13.0);
          }

          const noiseGain = isJazz ? 0.85 : isFunk ? 0.95 : 0.8;
          const combinedL = (body * 0.45 + noiseL * noiseGain + rimCrack) * noiseEnv;
          const combinedR = (body * 0.45 + noiseR * noiseGain + rimCrack) * noiseEnv;

          left[i] = Math.tanh(combinedL * 1.3) * 0.95;
          right[i] = Math.tanh(combinedR * 1.3) * 0.95;
        }
        return buffer;
      }

      case 'hihat_closed': {
        const duration = isFunk ? 0.045 : is808 ? 0.055 : 0.075;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        // 6 inharmonic bronze cymbal frequencies
        const freqs = [205, 304, 369, 522, 540, 800];
        const phases = [0, 0, 0, 0, 0, 0];

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          let metal = 0;
          for (let f = 0; f < freqs.length; f++) {
            phases[f] += (2 * Math.PI * freqs[f] * (is808 ? 1.5 : 2.1)) / sampleRate;
            metal += Math.sin(phases[f]) > 0 ? 0.16 : -0.16;
          }

          const noiseL = Math.random() * 2 - 1;
          const noiseR = Math.random() * 2 - 1;
          const stickClick = t < 0.004 ? Math.sin(2 * Math.PI * 7200 * t) * 0.5 : 0;
          const env = Math.exp(-t * (isFunk ? 70 : 50));

          const valL = (metal * 0.45 + noiseL * 0.55 + stickClick) * env;
          const valR = (metal * 0.45 + noiseR * 0.55 + stickClick) * env;

          left[i] = Math.tanh(valL * 1.4) * 0.9;
          right[i] = Math.tanh(valR * 1.4) * 0.9;
        }
        return buffer;
      }

      case 'hihat_open': {
        const duration = is808 ? 0.6 : 0.5;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const freqs = [205, 304, 369, 522, 540, 800];
        const phases = [0, 0, 0, 0, 0, 0];

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          let metal = 0;
          for (let f = 0; f < freqs.length; f++) {
            phases[f] += (2 * Math.PI * freqs[f] * 2.1) / sampleRate;
            metal += Math.sin(phases[f]) > 0 ? 0.16 : -0.16;
          }

          const noiseL = Math.random() * 2 - 1;
          const noiseR = Math.random() * 2 - 1;
          const shimmer = Math.sin(2 * Math.PI * 6500 * t) * 0.12;
          const env = Math.exp(-t * 8.5);

          left[i] = Math.tanh((metal * 0.4 + noiseL * 0.6 + shimmer) * env * 1.3) * 0.85;
          right[i] = Math.tanh((metal * 0.4 + noiseR * 0.6 + shimmer) * env * 1.3) * 0.85;
        }
        return buffer;
      }

      case 'tom_low':
      case 'tom_high': {
        const isHigh = padType === 'tom_high';
        const duration = is80s ? 0.7 : 0.55;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const basePitch = isHigh ? (isJazz ? 185 : 155) : isJazz ? 115 : 90;
        const startPitch = basePitch * 1.7;
        let phase = 0;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const pitch = basePitch + (startPitch - basePitch) * Math.exp(-t * 20);
          phase += (2 * Math.PI * pitch) / sampleRate;

          const fundamental = Math.sin(phase);
          const overtone = Math.sin(phase * 1.95) * 0.3 * Math.exp(-t * 15);
          const stickImpact = t < 0.015 ? (Math.random() * 2 - 1) * Math.exp(-t * 220) * 0.5 : 0;
          const env = Math.exp(-t * (is80s ? 5.5 : 7.5));

          const val = Math.tanh((fundamental + overtone + stickImpact) * 1.2) * env * 0.95;
          // Slight stereo pan for low vs high tom
          left[i] = val * (isHigh ? 0.8 : 1.0);
          right[i] = val * (isHigh ? 1.0 : 0.8);
        }
        return buffer;
      }

      case 'crash': {
        const duration = isMetal ? 1.8 : 1.4;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const noiseL = Math.random() * 2 - 1;
          const noiseR = Math.random() * 2 - 1;
          const shimmer1 = Math.sin(2 * Math.PI * 4600 * t) * 0.18;
          const shimmer2 = Math.sin(2 * Math.PI * 7200 * t) * 0.12;
          const env = Math.exp(-t * 2.8);

          left[i] = Math.tanh((noiseL * 0.75 + shimmer1 + shimmer2) * env * 1.2) * 0.85;
          right[i] = Math.tanh((noiseR * 0.75 + shimmer1 - shimmer2) * env * 1.2) * 0.85;
        }
        return buffer;
      }

      case 'ride': {
        const duration = 1.6;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = ctx.createBuffer(2, numSamples, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        // Ping bell resonance frequencies
        const bellFreq1 = 820;
        const bellFreq2 = 1430;
        const bellFreq3 = 2650;
        const bellFreq4 = 4800;

        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const bell =
            Math.sin(2 * Math.PI * bellFreq1 * t) * 0.35 +
            Math.sin(2 * Math.PI * bellFreq2 * t) * 0.3 +
            Math.sin(2 * Math.PI * bellFreq3 * t) * 0.25 +
            Math.sin(2 * Math.PI * bellFreq4 * t) * 0.15;

          const sizzleL = (Math.random() * 2 - 1) * 0.3;
          const sizzleR = (Math.random() * 2 - 1) * 0.3;
          const env = Math.exp(-t * 2.2);

          left[i] = Math.tanh((bell * 0.8 + sizzleL * 0.4) * env * 1.2) * 0.9;
          right[i] = Math.tanh((bell * 0.8 + sizzleR * 0.4) * env * 1.2) * 0.9;
        }
        return buffer;
      }
    }
  }

  // --- PLAYBACK EXECUTION ---
  /**
   * Plays a drum pad sound instantly from the sample-based drum engine with multi-velocity and round-robin
   */
  public playDrumSound(
    padType: string,
    velocity = 1.0,
    kitProfile: string = this.activeKitId
  ): AudioBufferSourceNode | null {
    // 1. Primary path: Route through SampledDrumEngine (Multi-Velocity, Round-Robin, Choke, Mixer)
    try {
      const artMap: Record<string, DrumArticulation> = {
        kick: 'kick',
        snare: 'snare',
        snare_rimshot: 'snare_rimshot',
        snare_sidestick: 'snare_sidestick',
        hihat_closed: 'hihat_closed',
        hihat_semi: 'hihat_semi',
        hihat_open: 'hihat_open',
        hihat_pedal: 'hihat_pedal',
        hihat_splash: 'hihat_splash',
        tom_low: 'tom_low',
        tom_mid: 'tom_mid',
        tom_high: 'tom_high',
        crash: 'crash_left',
        crash_left: 'crash_left',
        crash_right: 'crash_right',
        ride: 'ride_bow',
        ride_bow: 'ride_bow',
        ride_bell: 'ride_bell',
        china: 'china',
        splash: 'splash',
        tambourine: 'tambourine',
        cowbell: 'cowbell',
        shaker: 'shaker',
        handclap: 'handclap',
      };

      const art = artMap[padType] || (padType as DrumArticulation);
      if (art) {
        const source = sampledDrumEngine.triggerPad(art, velocity, kitProfile);
        if (source) return source;
      }
    } catch (e) {
      console.warn('[DrumKitFactory] SampledDrumEngine playback fallback:', e);
    }

    const ctx = audioSynth.initCtx();
    const now = ctx.currentTime;
    const pad = padType as DrumPadType;

    // 2. Check custom drum kit buffers in CustomDrumKitService
    const customSampleBuf = audioSynth.getCustomDrumSampleBuffer(kitProfile, padType);
    if (customSampleBuf) {
      const source = ctx.createBufferSource();
      source.buffer = customSampleBuf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(velocity * 1.1, now);
      source.connect(gain);
      const masterGain = audioSynth.getMasterGain();
      if (masterGain) {
        gain.connect(masterGain);
      } else {
        gain.connect(ctx.destination);
      }
      source.start(now);
      return source;
    }

    // 3. Look up audio buffer in kitBuffers cache
    let bufferMap = this.kitBuffers.get(kitProfile);
    if (!bufferMap) {
      const synthBuf = this.synthesizePadBuffer(
        ctx,
        pad,
        (customDrumKitService.isCustomKitId(kitProfile) ? 'drums' : kitProfile) as InstrumentProfile
      );
      if (!this.kitBuffers.has(kitProfile)) {
        this.kitBuffers.set(kitProfile, new Map());
      }
      this.kitBuffers.get(kitProfile)!.set(pad, synthBuf);
      bufferMap = this.kitBuffers.get(kitProfile);
    }

    const audioBuf = bufferMap?.get(pad);
    if (audioBuf) {
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;

      const pitchDetune = (Math.random() * 30 - 15);
      source.detune.setValueAtTime(pitchDetune, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.01, Math.min(1.5, velocity)), now);

      source.connect(gain);
      const masterGain = audioSynth.getMasterGain();
      if (masterGain) {
        gain.connect(masterGain);
      } else {
        gain.connect(ctx.destination);
      }

      source.start(now);
      return source;
    }

    return null;
  }
}

// Global Singleton Export
export const drumKitFactory = new DrumKitFactory();
