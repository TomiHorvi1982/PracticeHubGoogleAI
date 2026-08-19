// Web Audio API High-Quality Sampler & SoundSynthesizer Engine
// Supports 200+ Real General MIDI SoundFont Instruments with Multi-Velocity Acoustic Modeling,
// IndexedDB Local Sample Caching, Polyphonic Voice Management & Damper Release.

import { ALL_INSTRUMENTS, InstrumentPreset } from '../data/instrumentPresets';
import { DRUM_KITS, DrumKitOption } from '../data/drumKits';
import { drumKitFactory } from './drumKitFactory';
import { eventBus } from './eventBus';

export { DRUM_KITS, type DrumKitOption };

export type InstrumentProfile =
  | 'acoustic_guitar'
  | 'electric_guitar'
  | 'nylon_guitar'
  | 'bass_guitar'
  | 'grand_piano'
  | 'acoustic_grand_piano_sf'
  | 'electric_piano_1_sf'
  | 'clavinet_sf'
  | 'rhodes_ep'
  | 'analog_synth'
  | 'drums'
  | 'drums_808'
  | 'drums_jazz'
  | string;

export interface SoundProfileOption {
  id: InstrumentProfile;
  name: string;
  czCategory: string;
  description: string;
}

export const INSTRUMENT_PROFILES: SoundProfileOption[] = [
  ...ALL_INSTRUMENTS.map(inst => ({
    id: inst.id,
    name: `${inst.icon} ${inst.czName} (${inst.name})`,
    czCategory: inst.czCategory,
    description: inst.description,
  })),

  ...DRUM_KITS.map(kit => ({
    id: kit.id,
    name: `${kit.icon} ${kit.czName}`,
    czCategory: 'Bicí sady',
    description: kit.description,
  })),
];

const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const note = MIDI_NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function noteToMidi(note: string): number {
  const match = note.trim().match(/^([A-G]#?)(\d+)$/i);
  if (!match) return 60;
  const noteName = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const noteIndex = MIDI_NOTE_NAMES.indexOf(noteName);
  if (noteIndex === -1) return 60;
  return (octave + 1) * 12 + noteIndex;
}

// IndexedDB & Cache API Dual-Layer Persistent Caching Helpers
const DB_NAME = 'StrumSoundFontCache';
const STORE_NAME = 'soundfonts';
const CACHE_NAME = 'strum-soundfont-cache-v1';

async function fetchWithCache(sfName: string, cdnUrl: string): Promise<string> {
  // 1. Try Browser Cache API first
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(cdnUrl);
      if (cachedResponse) {
        return await cachedResponse.text();
      }
    } catch {
      // Ignore cache API failures
    }
  }

  // 2. Fetch from network CDN
  const res = await fetch(cdnUrl);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const text = await res.text();

  // 3. Store in Cache API asynchronously
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      cache.put(cdnUrl, new Response(text, { headers: { 'Content-Type': 'application/javascript' } }));
    } catch {
      // Ignore
    }
  }

  return text;
}

async function getCachedSoundfont(sfName: string): Promise<Record<string, string> | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(sfName);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Robust multi-strategy SoundFont JS script parser.
 * Handles valid JSON, JS object assignments with unquoted keys or trailing commas, and sandbox execution.
 */
function parseSoundfontJS(scriptText: string): Record<string, string> {
  // Strategy 1: Regex match extracted object string and parse with JSON.parse
  const jsonMatch = scriptText.match(/MIDI\.Soundfont\.\w+\s*=\s*(\{[\s\S]*\});?/);
  if (jsonMatch && jsonMatch[1]) {
    const rawObjStr = jsonMatch[1].trim();
    try {
      return JSON.parse(rawObjStr);
    } catch {
      // Remove trailing commas before closing braces/brackets if present
      try {
        const cleaned = rawObjStr.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(cleaned);
      } catch {
        // Fall through to Strategy 2
      }
    }
  }

  // Strategy 2: Execute script in sandboxed Function context with MIDI object stub
  try {
    const midiMock: any = { Soundfont: {} };
    const sandboxFn = new Function('MIDI', scriptText);
    sandboxFn(midiMock);

    const keys = Object.keys(midiMock.Soundfont);
    if (keys.length > 0 && typeof midiMock.Soundfont[keys[0]] === 'object') {
      return midiMock.Soundfont[keys[0]];
    }
  } catch {
    // Fall through to Strategy 3
  }

  // Strategy 3: Key-value regex extraction for base64 data URIs
  const result: Record<string, string> = {};
  const kvRegex = /"([A-Ga-g0-9#]+)"\s*:\s*"(data:audio\/[a-zA-Z0-9]+;base64,[A-Za-z0-9+/=]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = kvRegex.exec(scriptText)) !== null) {
    result[match[1]] = match[2];
  }

  if (Object.keys(result).length > 0) {
    return result;
  }

  throw new Error('Could not parse SoundFont JavaScript content with any available parsing strategy');
}

async function setCachedSoundfont(sfName: string, data: Record<string, string>): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(data, sfName);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// LRU Cache for decoded AudioBuffers to optimize RAM & prevent memory leaks
class LruAudioBufferCache {
  private cache = new Map<string, AudioBuffer>();
  private maxEntries: number;

  constructor(maxEntries = 48) {
    this.maxEntries = maxEntries;
  }

  get(key: string): AudioBuffer | undefined {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: string, value: AudioBuffer): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Active Voice Node Interface for Polyphony & Damper Release
interface ActiveVoice {
  id: string;
  source: AudioBufferSourceNode | OscillatorNode;
  gainNode: GainNode;
  filterNode?: BiquadFilterNode;
  pannerNode?: StereoPannerNode;
  startTime: number;
  releaseTime: number;
  isSustained: boolean;
  stop: () => void;
}

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Raw base64 data dicts: sfName -> (noteName -> base64Str)
  private rawSoundfontData: Record<string, Record<string, string>> = {};
  // LRU cache for active decoded AudioBuffers: key `${sfName}:${noteName}` -> AudioBuffer
  private lruAudioCache = new LruAudioBufferCache(60);
  // Cache for fully/partially decoded AudioBuffers: sfName -> (noteName -> AudioBuffer)
  private soundfontBuffers: Record<string, Record<string, AudioBuffer>> = {};
  private loadingInstruments: Record<string, boolean> = {};
  private loadingCallbacks: Record<string, ((progress: number) => void)[]> = {};
  private loadingProgress: Record<string, number> = {};

  // Polyphony Voice Tracking
  private activeVoices: Map<string, ActiveVoice> = new Map();
  private maxPolyphony = 64;
  private isSustainActive = false;

  // Custom Drum Kits: kitId -> (padId -> AudioBuffer)
  private customDrumKitBuffers: Map<string, Map<string, AudioBuffer>> = new Map();

  // Mapped Role -> Instrument Profile
  private instrumentMappings: Record<string, InstrumentProfile> = {
    'Kytara': 'acoustic_dreadnought',
    'Akustická kytara': 'acoustic_dreadnought',
    'Elektrická kytara': 'electric_strat_clean',
    'Basa': 'fender_jazz_bass_finger',
    'Baskytara': 'fender_jazz_bass_finger',
    'Klávesy': 'grand_piano_steinway',
    'Piano': 'grand_piano_steinway',
    'Syntetizér': 'prophet5_brass_lead',
    'Bicí': 'drums',
    'Zpěv': 'rhodes_stage73',
  };

  constructor() {
    this.loadMappingsFromStorage();
  }

  private loadMappingsFromStorage() {
    try {
      const saved = localStorage.getItem('strum_instrument_sound_mappings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.instrumentMappings = { ...this.instrumentMappings, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load instrument sound mappings:', e);
    }
  }

  public setInstrumentMapping(role: string, profile: InstrumentProfile) {
    this.instrumentMappings[role] = profile;
    try {
      localStorage.setItem('strum_instrument_sound_mappings', JSON.stringify(this.instrumentMappings));
    } catch (e) {
      console.error('Failed to save instrument mappings:', e);
    }
  }

  public getMappedSound(role: string): InstrumentProfile {
    return this.instrumentMappings[role] || 'grand_piano_steinway';
  }

  public getAllMappings(): Record<string, InstrumentProfile> {
    return { ...this.instrumentMappings };
  }

  // --- AUDIO CONTEXT INITIALIZATION ---
  public initCtx(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Mastering compressor
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(3.5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public getMasterGain(): GainNode | null {
    if (!this.masterGain) {
      this.initCtx();
    }
    return this.masterGain;
  }

  private getNoiseBuffer(ctx: AudioContext, duration = 1.0): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.duration < duration) {
      const bufferSize = ctx.sampleRate * Math.max(duration, 2.0);
      this.noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return this.noiseBuffer;
  }

  // --- CUSTOM DRUM SAMPLE MANAGEMENT ---
  public async loadCustomDrumSample(kitId: string, padId: string, audioData: string | ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.initCtx();
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

    const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

    if (!this.customDrumKitBuffers.has(kitId)) {
      this.customDrumKitBuffers.set(kitId, new Map());
    }
    this.customDrumKitBuffers.get(kitId)!.set(padId, decodedBuffer);
    try {
      drumKitFactory.loadKitBuffers(kitId).catch(() => {});
    } catch (e) {}
    return decodedBuffer;
  }

  public unloadCustomKit(kitId: string): void {
    this.customDrumKitBuffers.delete(kitId);
    try {
      drumKitFactory.unloadKit(kitId);
    } catch (e) {}
  }

  public getCustomDrumSampleBuffer(kitId: string, padId: string): AudioBuffer | undefined {
    return this.customDrumKitBuffers.get(kitId)?.get(padId);
  }

  public hasCustomDrumKit(kitId: string): boolean {
    return this.customDrumKitBuffers.has(kitId);
  }

  // --- HELPER CONVERSIONS ---
  public noteToFreq(note: string | number): number {
    if (typeof note === 'number') return note;
    const midi = noteToMidi(note);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // --- SOUNDFONT SAMPLE LOADING & CACHING ---
  public getSoundfontNameForProfile(profile: string): string {
    if (profile === 'acoustic_grand_piano_sf') return 'acoustic_grand_piano';
    if (profile === 'electric_piano_1_sf') return 'electric_piano_1';
    if (profile === 'clavinet_sf') return 'clavinet';

    // Drum kit profiles mapped to soundfont sample sets for high-quality multisamples
    if (profile === 'drums' || profile.startsWith('drums_')) {
      if (profile === 'drums_jazz') return 'synth_drum';
      if (profile === 'drums_808' || profile === 'drums_electronic_909') return 'synth_drum';
      if (profile === 'drums_metal' || profile === 'drums_heavy_rock' || profile === 'drums_djent') return 'taiko_drum';
      if (profile === 'drums_80s_arena' || profile === 'drums_funk') return 'melodic_tom';
      return 'taiko_drum';
    }

    const preset = ALL_INSTRUMENTS.find(i => i.id === profile);
    if (preset && preset.soundfont) {
      return preset.soundfont;
    }
    return 'acoustic_grand_piano';
  }

  public isInstrumentLoaded(profile: string): boolean {
    const sfName = this.getSoundfontNameForProfile(profile);
    return !!(this.soundfontBuffers[sfName] && Object.keys(this.soundfontBuffers[sfName]).length > 0);
  }

  public isInstrumentLoading(profile: string): boolean {
    const sfName = this.getSoundfontNameForProfile(profile);
    return !!this.loadingInstruments[sfName];
  }

  public getLoadingProgress(profile: string): number | null {
    const sfName = this.getSoundfontNameForProfile(profile);
    return this.loadingProgress[sfName] ?? null;
  }

  public async isInstrumentCachedLocally(profile: string): Promise<boolean> {
    const sfName = this.getSoundfontNameForProfile(profile);
    if (this.soundfontBuffers[sfName] && Object.keys(this.soundfontBuffers[sfName]).length > 0) {
      return true;
    }
    const cachedData = await getCachedSoundfont(sfName);
    return !!cachedData;
  }

  public async preloadInstrument(profile: string, onProgress?: (p: number) => void): Promise<void> {
    const sfName = this.getSoundfontNameForProfile(profile);

    if (this.soundfontBuffers[sfName] && Object.keys(this.soundfontBuffers[sfName]).length > 0) {
      if (onProgress) onProgress(100);
      return;
    }

    if (onProgress) {
      if (!this.loadingCallbacks[sfName]) this.loadingCallbacks[sfName] = [];
      this.loadingCallbacks[sfName].push(onProgress);
    }

    if (this.loadingInstruments[sfName]) return;
    this.loadingInstruments[sfName] = true;

    const notifyProgress = (pct: number) => {
      this.loadingProgress[sfName] = pct;
      if (this.loadingCallbacks[sfName]) {
        this.loadingCallbacks[sfName].forEach(cb => cb(pct));
      }
      eventBus.emit('INSTRUMENT_LOADING_UPDATE', {
        profile,
        sfName,
        progress: pct,
        isLoading: pct < 100,
      });
    };

    notifyProgress(10);

    try {
      const ctx = this.initCtx();

      // Step 1: Check IndexedDB / Local Storage Cache
      let rawData = await getCachedSoundfont(sfName);

      if (!rawData || typeof rawData !== 'object' || Object.keys(rawData).length === 0) {
        notifyProgress(25);
        // Step 2: Download from CDN if not cached using Cache API + Network fallback
        const cdnUrl = `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${sfName}-mp3.js`;
        const text = await fetchWithCache(sfName, cdnUrl);
        notifyProgress(55);

        // Parse object safely using multi-strategy parser
        rawData = parseSoundfontJS(text);

        // Cache to IndexedDB asynchronously
        setCachedSoundfont(sfName, rawData).catch(() => {});
      }

      notifyProgress(75);

      // Step 3: Fast Keynote Decoding (sparse set of notes e.g., C1..C8 for instant 0-ms play)
      this.rawSoundfontData[sfName] = rawData;
      if (!this.soundfontBuffers[sfName]) {
        this.soundfontBuffers[sfName] = {};
      }

      const noteEntries = Object.entries(rawData);
      if (noteEntries.length === 0) {
        throw new Error('SoundFont object contains no notes');
      }

      // Keynotes to pre-decode immediately (e.g. C or F notes, or sampled step notes if no C/F)
      let keynotes = noteEntries.filter(([k]) => k.startsWith('C') || k.startsWith('F'));
      if (keynotes.length === 0) {
        const step = Math.max(1, Math.floor(noteEntries.length / 12));
        keynotes = noteEntries.filter((_, idx) => idx % step === 0);
      }

      let decodedCount = 0;

      await Promise.all(
        keynotes.map(async ([noteKey, b64Data]) => {
          try {
            const base64Str = b64Data.includes(',') ? b64Data.split(',')[1] : b64Data;
            const binaryStr = atob(base64Str);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const buffer = await ctx.decodeAudioData(bytes.buffer);
            this.soundfontBuffers[sfName][noteKey] = buffer;
            this.lruAudioCache.set(`${sfName}:${noteKey}`, buffer);
          } catch {
            // ignore individual decode error
          } finally {
            decodedCount++;
            const pct = 75 + Math.floor((decodedCount / keynotes.length) * 25);
            notifyProgress(Math.min(100, pct));
          }
        })
      );

      notifyProgress(100);
    } catch (err) {
      console.warn(`Failed to load SoundFont '${sfName}', using dynamic physical modeling fallback`, err);
      eventBus.emit('INSTRUMENT_LOADING_UPDATE', {
        profile,
        sfName,
        progress: 0,
        isLoading: false,
      });
    } finally {
      this.loadingInstruments[sfName] = false;
      delete this.loadingProgress[sfName];
      delete this.loadingCallbacks[sfName];
    }
  }

  // --- LAZY NOTE DECODER WITH LRU CACHE & PITCH-SHIFTING ---
  public getNoteBufferSync(sfName: string, noteName: string): { buffer: AudioBuffer; baseNote: string } | null {
    const cacheKey = `${sfName}:${noteName}`;
    const lruCached = this.lruAudioCache.get(cacheKey);
    if (lruCached) {
      return { buffer: lruCached, baseNote: noteName };
    }

    const dict = this.soundfontBuffers[sfName];
    if (dict && dict[noteName]) {
      this.lruAudioCache.set(cacheKey, dict[noteName]);
      return { buffer: dict[noteName], baseNote: noteName };
    }

    // Trigger background decode if raw base64 exists
    const rawDict = this.rawSoundfontData[sfName];
    if (rawDict && rawDict[noteName]) {
      this.decodeNoteInBackground(sfName, noteName);
    }

    // Pitch-shifting fallback: find closest decoded keynote
    if (dict) {
      const targetMidi = noteToMidi(noteName);
      let bestNote = '';
      let minDiff = Infinity;
      for (const k of Object.keys(dict)) {
        const diff = Math.abs(noteToMidi(k) - targetMidi);
        if (diff < minDiff) {
          minDiff = diff;
          bestNote = k;
        }
      }
      if (bestNote && dict[bestNote]) {
        return { buffer: dict[bestNote], baseNote: bestNote };
      }
    }

    return null;
  }

  private async decodeNoteInBackground(sfName: string, noteName: string): Promise<void> {
    const rawDict = this.rawSoundfontData[sfName];
    if (!rawDict || !rawDict[noteName]) return;
    try {
      const ctx = this.initCtx();
      const b64Data = rawDict[noteName];
      const base64Str = b64Data.includes(',') ? b64Data.split(',')[1] : b64Data;
      const binaryStr = atob(base64Str);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const decoded = await ctx.decodeAudioData(bytes.buffer);
      if (!this.soundfontBuffers[sfName]) this.soundfontBuffers[sfName] = {};
      this.soundfontBuffers[sfName][noteName] = decoded;
      this.lruAudioCache.set(`${sfName}:${noteName}`, decoded);
    } catch {
      // ignore
    }
  }

  // --- POLYPHONY & VOICE STEALER ---
  private addVoice(voice: ActiveVoice) {
    if (this.activeVoices.size >= this.maxPolyphony) {
      // Steal oldest released voice or oldest voice overall
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, v] of this.activeVoices.entries()) {
        if (v.isSustained || v.releaseTime < Infinity) {
          oldestKey = key;
          break;
        }
        if (v.startTime < oldestTime) {
          oldestTime = v.startTime;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const stolen = this.activeVoices.get(oldestKey);
        if (stolen) {
          try {
            stolen.gainNode.gain.cancelScheduledValues(0);
            stolen.gainNode.gain.setValueAtTime(stolen.gainNode.gain.value, this.initCtx().currentTime);
            stolen.gainNode.gain.linearRampToValueAtTime(0.0001, this.initCtx().currentTime + 0.005);
            setTimeout(() => stolen.stop(), 8);
          } catch {
            // ignore
          }
        }
        this.activeVoices.delete(oldestKey);
      }
    }
    this.activeVoices.set(voice.id, voice);
  }

  // --- SUSTAIN PEDAL MANAGEMENT ---
  public setSustain(active: boolean) {
    this.isSustainActive = active;
    if (!active) {
      const now = this.initCtx().currentTime;
      for (const [key, voice] of this.activeVoices.entries()) {
        if (voice.isSustained) {
          voice.isSustained = false;
          voice.gainNode.gain.cancelScheduledValues(now);
          voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
          voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (voice.releaseTime || 0.35));
          setTimeout(() => {
            voice.stop();
            this.activeVoices.delete(key);
          }, ((voice.releaseTime || 0.35) + 0.05) * 1000);
        }
      }
    }
  }

  // --- STOP NOTE & PANIC ALL NOTES ---
  public stopNote(noteName: string, profile?: InstrumentProfile): void {
    const ctx = this.initCtx();
    const now = ctx.currentTime;
    for (const [key, voice] of this.activeVoices.entries()) {
      if (key.includes(noteName)) {
        try {
          voice.gainNode.gain.cancelScheduledValues(now);
          voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
          voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.05);
          setTimeout(() => {
            voice.stop();
            this.activeVoices.delete(key);
          }, 60);
        } catch {
          // ignore
        }
      }
    }
  }

  public stopAllNotes(): void {
    const ctx = this.initCtx();
    const now = ctx.currentTime;
    for (const [key, voice] of this.activeVoices.entries()) {
      try {
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
        voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.01);
        setTimeout(() => voice.stop(), 20);
      } catch {
        // ignore
      }
    }
    this.activeVoices.clear();
  }

  // --- CORE SAMPLED & MODELING NOTE PLAYBACK ---
  public playSampledNote(
    sfName: string,
    noteName: string,
    duration = 2.5,
    volume = 0.7,
    velocity = 0.8
  ): boolean {
    const buffers = this.soundfontBuffers[sfName];
    if (!buffers) return false;

    const ctx = this.initCtx();
    const now = ctx.currentTime;
    const targetMidi = noteToMidi(noteName);

    // Find closest available sampled note
    let bestNote = noteName;
    let minDiff = Infinity;

    if (!buffers[noteName]) {
      for (const key of Object.keys(buffers)) {
        const keyMidi = noteToMidi(key);
        const diff = Math.abs(keyMidi - targetMidi);
        if (diff < minDiff) {
          minDiff = diff;
          bestNote = key;
        }
      }
    }

    const sampleBuffer = buffers[bestNote];
    if (!sampleBuffer) return false;

    const baseMidi = noteToMidi(bestNote);
    const playbackRate = Math.pow(2, (targetMidi - baseMidi) / 12);

    const source = ctx.createBufferSource();
    source.buffer = sampleBuffer;
    source.playbackRate.setValueAtTime(playbackRate, now);

    // Dynamic Multi-Velocity Acoustic Modeling
    // 1. Dynamic Lowpass Filter: Higher velocity = brighter overtones
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const baseFreq = 440 * Math.pow(2, (targetMidi - 69) / 12);
    const normVel = Math.max(0.05, Math.min(1.0, velocity));
    filter.frequency.setValueAtTime(baseFreq * (1.2 + Math.pow(normVel, 1.5) * 10.0), now);

    // 2. Perceptual Volume Curve (Logarithmic)
    const gainNode = ctx.createGain();
    const scaledGain = volume * (0.05 + 0.95 * Math.pow(normVel, 1.35));

    // Attack Envelope: Instantaneous transient for hard hits, subtle ramp for soft touches
    const attackTime = (1.0 - normVel) * 0.015 + 0.003;
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(scaledGain, now + attackTime);
    gainNode.gain.setValueAtTime(scaledGain, now + Math.max(0.05, duration - 0.35));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // 3. True Keyboard Stereo Panning
    const panner = ctx.createStereoPanner();
    const panVal = Math.max(-0.55, Math.min(0.55, (targetMidi - 60) / 60 * 0.35));
    panner.pan.setValueAtTime(panVal, now);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(panner);
    if (this.masterGain) panner.connect(this.masterGain);

    source.start(now);
    source.stop(now + duration + 0.1);

    const voiceId = `${targetMidi}_${sfName}_${now}`;
    const activeVoice: ActiveVoice = {
      id: voiceId,
      source,
      gainNode,
      filterNode: filter,
      pannerNode: panner,
      startTime: now,
      releaseTime: 0.35,
      isSustained: false,
      stop: () => {
        try { source.stop(); } catch { /* ignore */ }
      },
    };

    this.addVoice(activeVoice);
    return true;
  }

  // --- GENERAL NOTE TRIGGER ---
  public playNote(
    freqOrNote: number | string,
    profile: InstrumentProfile = 'grand_piano_steinway',
    duration = 2.5,
    volume = 0.7,
    velocity = 0.8
  ) {
    const noteName = typeof freqOrNote === 'number' ? midiToNoteName(Math.round(69 + 12 * Math.log2(freqOrNote / 440))) : freqOrNote;
    const sfName = this.getSoundfontNameForProfile(profile);

    // Try playing authentic sample from SoundFont
    const playedSample = this.playSampledNote(sfName, noteName, duration, volume, velocity);

    if (!playedSample) {
      // Trigger background preload for next time
      this.preloadInstrument(profile);

      // Play rich expressive modeling preset while sample loads
      const preset = ALL_INSTRUMENTS.find(i => i.id === profile) || ALL_INSTRUMENTS[0];
      this.playPresetNote(preset, noteName, duration, volume, velocity);
    }
  }

  // --- POLYPHONIC MIDI NOTE ON & OFF ---
  public noteOn(
    noteOrFreq: number | string,
    profile: InstrumentProfile = 'grand_piano_steinway',
    velocity = 0.8
  ) {
    const noteName = typeof noteOrFreq === 'number' ? midiToNoteName(Math.round(69 + 12 * Math.log2(noteOrFreq / 440))) : noteOrFreq;
    const midi = noteToMidi(noteName);

    // General MIDI Drum note handling for drum profiles
    if (profile === 'drums' || profile.startsWith('drums_')) {
      let padType = 'kick';
      if (midi === 35 || midi === 36) padType = 'kick';
      else if (midi === 38 || midi === 40 || midi === 37) padType = 'snare';
      else if (midi === 42 || midi === 44) padType = 'hihat_closed';
      else if (midi === 46) padType = 'hihat_open';
      else if (midi === 41 || midi === 43 || midi === 45) padType = 'tom_low';
      else if (midi === 47 || midi === 48 || midi === 50) padType = 'tom_high';
      else if (midi === 49 || midi === 52 || midi === 55 || midi === 57) padType = 'crash';
      else if (midi === 51 || midi === 53 || midi === 59) padType = 'ride';
      else {
        const types = ['kick', 'snare', 'hihat_closed', 'hihat_open', 'tom_low', 'tom_high', 'crash', 'ride'];
        padType = types[Math.abs(midi) % types.length];
      }
      this.playDrumSound(padType, velocity, profile);
      return;
    }

    const key = `${midi}_${profile}`;

    // Stop existing note if already held
    if (this.activeVoices.has(key)) {
      this.noteOff(noteName, profile);
    }

    const sfName = this.getSoundfontNameForProfile(profile);
    const buffers = this.soundfontBuffers[sfName];

    if (buffers) {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      let bestNote = noteName;
      let minDiff = Infinity;

      if (!buffers[noteName]) {
        for (const k of Object.keys(buffers)) {
          const keyMidi = noteToMidi(k);
          const diff = Math.abs(keyMidi - midi);
          if (diff < minDiff) {
            minDiff = diff;
            bestNote = k;
          }
        }
      }

      const sampleBuffer = buffers[bestNote];
      if (sampleBuffer) {
        const baseMidi = noteToMidi(bestNote);
        const playbackRate = Math.pow(2, (midi - baseMidi) / 12);

        const source = ctx.createBufferSource();
        source.buffer = sampleBuffer;
        source.playbackRate.setValueAtTime(playbackRate, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const baseFreq = 440 * Math.pow(2, (midi - 69) / 12);
        const normVel = Math.max(0.05, Math.min(1.0, velocity));
        filter.frequency.setValueAtTime(baseFreq * (1.2 + Math.pow(normVel, 1.5) * 10.0), now);

        const gainNode = ctx.createGain();
        const scaledGain = 0.7 * (0.05 + 0.95 * Math.pow(normVel, 1.35));
        const attackTime = (1.0 - normVel) * 0.015 + 0.003;

        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.linearRampToValueAtTime(scaledGain, now + attackTime);

        const panner = ctx.createStereoPanner();
        const panVal = Math.max(-0.55, Math.min(0.55, (midi - 60) / 60 * 0.35));
        panner.pan.setValueAtTime(panVal, now);

        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(panner);
        if (this.masterGain) panner.connect(this.masterGain);

        source.start(now);

        const voice: ActiveVoice = {
          id: key,
          source,
          gainNode,
          filterNode: filter,
          pannerNode: panner,
          startTime: now,
          releaseTime: 0.35,
          isSustained: false,
          stop: () => {
            try { source.stop(); } catch { /* ignore */ }
          },
        };

        this.addVoice(voice);
        return;
      }
    }

    // Fallback preset playback
    this.playNote(noteName, profile, 2.5, 0.7, velocity);
  }

  public noteOff(noteOrFreq: number | string, profile: InstrumentProfile = 'grand_piano_steinway') {
    const noteName = typeof noteOrFreq === 'number' ? midiToNoteName(Math.round(69 + 12 * Math.log2(noteOrFreq / 440))) : noteOrFreq;
    const midi = noteToMidi(noteName);
    const key = `${midi}_${profile}`;

    const voice = this.activeVoices.get(key);
    if (voice) {
      if (this.isSustainActive) {
        voice.isSustained = true;
        return;
      }

      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const releaseTime = voice.releaseTime || 0.35;

      voice.gainNode.gain.cancelScheduledValues(now);
      voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
      voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);

      setTimeout(() => {
        voice.stop();
        this.activeVoices.delete(key);
      }, (releaseTime + 0.05) * 1000);
    }
  }

  // --- EXPRESSIVE PHYSICAL MODELING PRESET SYNTHESIZER ---
  public playPresetNote(
    preset: InstrumentPreset,
    freqOrNote: number | string,
    duration = 2.5,
    volume = 0.7,
    velocity = 0.8
  ) {
    const ctx = this.initCtx();
    const now = ctx.currentTime;
    let baseFreq = typeof freqOrNote === 'number' ? freqOrNote : this.noteToFreq(freqOrNote);

    if (preset.octaveShift) {
      baseFreq *= Math.pow(2, preset.octaveShift);
    }

    const normVel = Math.max(0.05, Math.min(1.0, velocity));
    const scaledGain = volume * (0.05 + 0.95 * Math.pow(normVel, 1.35));
    const brightness = preset.brightness || 1.0;
    const effectiveDuration = Math.max(0.3, preset.decay || duration);

    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0.0001, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(baseFreq * (1.2 + Math.pow(normVel, 1.5) * 8.0 * brightness), now);

    if (preset.resonance) {
      filter.Q.setValueAtTime(preset.resonance, now);
    }

    // Synthesize based on preset category
    switch (preset.synthType) {
      case 'piano':
      case 'rhodes':
      case 'fm_ep': {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = preset.synthType === 'rhodes' ? 'sine' : 'triangle';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(baseFreq, now);
        osc2.frequency.setValueAtTime(baseFreq * 2.001, now);

        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(scaledGain * 0.4 * brightness, now);

        osc1.connect(filter);
        osc2.connect(g2);
        g2.connect(filter);

        mainGain.gain.linearRampToValueAtTime(scaledGain, now + 0.005);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + effectiveDuration);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + effectiveDuration);
        osc2.stop(now + effectiveDuration);
        break;
      }

      case 'organ': {
        const drawbars = [1, 2, 3, 4, 6];
        const oscs: OscillatorNode[] = [];
        drawbars.forEach((mult, idx) => {
          const osc = ctx.createOscillator();
          osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(baseFreq * mult, now);
          osc.connect(filter);
          oscs.push(osc);
        });

        mainGain.gain.linearRampToValueAtTime(scaledGain * 0.8, now + 0.015);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + effectiveDuration);

        oscs.forEach(o => {
          o.start(now);
          o.stop(now + effectiveDuration);
        });
        break;
      }

      default: {
        const osc = ctx.createOscillator();
        osc.type = preset.synthType.includes('bass') ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(baseFreq, now);

        osc.connect(filter);

        mainGain.gain.linearRampToValueAtTime(scaledGain, now + 0.01);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, now + effectiveDuration);

        osc.start(now);
        osc.stop(now + effectiveDuration);
        break;
      }
    }

    filter.connect(mainGain);
    if (this.masterGain) mainGain.connect(this.masterGain);
  }

  // --- SPECIALIZED INSTRUMENT CONVENIENCE METHODS ---
  public playClavinetNote(freqOrNote: number | string, duration = 1.5, volume = 0.6) {
    this.playNote(freqOrNote, 'hohner_clavinet_d6', duration, volume);
  }

  public playGuitarNote(freqOrNote: number | string, duration = 2.0, volume = 0.5) {
    this.playNote(freqOrNote, 'acoustic_dreadnought', duration, volume);
  }

  public playElectricGuitarNote(freqOrNote: number | string, duration = 2.2, volume = 0.5) {
    this.playNote(freqOrNote, 'electric_strat_clean', duration, volume);
  }

  public playNylonGuitarNote(freqOrNote: number | string, duration = 2.0, volume = 0.5) {
    this.playNote(freqOrNote, 'nylon_classical_spanish', duration, volume);
  }

  public playBassNote(freqOrNote: number | string, duration = 2.0, volume = 0.6) {
    this.playNote(freqOrNote, 'fender_jazz_bass_finger', duration, volume);
  }

  public playPianoNote(freqOrNote: number | string, duration = 2.2, volume = 0.5) {
    this.playNote(freqOrNote, 'grand_piano_steinway', duration, volume);
  }

  public playRhodesNote(freqOrNote: number | string, duration = 2.2, volume = 0.5) {
    this.playNote(freqOrNote, 'rhodes_stage73', duration, volume);
  }

  public playAnalogSynthNote(freqOrNote: number | string, duration = 2.0, volume = 0.5) {
    this.playNote(freqOrNote, 'prophet5_brass_lead', duration, volume);
  }

  public playGuitarChord(
    frets: number[],
    baseTuning = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63],
    profile: InstrumentProfile = 'acoustic_dreadnought'
  ) {
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    frets.forEach((fret, stringIdx) => {
      if (fret < 0) return;
      const baseFreq = baseTuning[stringIdx];
      const freq = baseFreq * Math.pow(2, fret / 12);
      const strumDelay = stringIdx * 0.028; // Realistic human strum timing

      setTimeout(() => {
        this.playNote(freq, profile, 2.5, 0.45, 0.8);
      }, strumDelay * 1000);
    });
  }

  public playPianoChord(
    keysOrNotes: (number | string)[],
    baseOctave = 4,
    duration = 2.5,
    volume = 0.45,
    profile: InstrumentProfile = 'grand_piano_steinway'
  ) {
    keysOrNotes.forEach((k, idx) => {
      let noteName: string;
      if (typeof k === 'number') {
        const rootIndex = k % 12;
        const noteStr = MIDI_NOTE_NAMES[rootIndex];
        const oct = baseOctave + Math.floor(k / 12);
        noteName = `${noteStr}${oct}`;
      } else {
        noteName = k;
      }
      setTimeout(() => {
        this.playNote(noteName, profile, duration, volume, 0.85);
      }, idx * 12);
    });
  }

  // --- DRUM KITS & PERCUSSION ENGINE ---
  public playDrumSound(type: string, volume = 0.7, profile: InstrumentProfile = 'drums') {
    // 1. Primary path: Play from the dedicated DrumKitFactory buffer engine
    try {
      const source = drumKitFactory.playDrumSound(type, volume, profile);
      if (source) return;
    } catch (e) {
      console.warn('[AudioSynth] Fallback to direct drum synthesis:', e);
    }

    const ctx = this.initCtx();
    const now = ctx.currentTime;

    // 2. Check custom uploaded drum kits
    if (this.customDrumKitBuffers.has(profile)) {
      const padBuffer = this.customDrumKitBuffers.get(profile)!.get(type);
      if (padBuffer) {
        const source = ctx.createBufferSource();
        source.buffer = padBuffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 1.1, now);
        source.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);
        source.start(now);
        return;
      }
    }

    // 2. Check if decoded SoundFont sample buffers exist for mapped GM percussion
    const sfName = this.getSoundfontNameForProfile(profile);
    const sfDict = this.soundfontBuffers[sfName];
    if (sfDict) {
      // Map drum pad types to GM percussion MIDI note names
      const gmNoteMap: Record<string, string> = {
        kick: 'C2',          // MIDI 36 - Bass Drum 1
        snare: 'D2',         // MIDI 38 - Acoustic Snare
        hihat_closed: 'F#2', // MIDI 42 - Closed Hi-Hat
        hihat_open: 'A#2',   // MIDI 46 - Open Hi-Hat
        tom_low: 'F2',       // MIDI 41 - Low Floor Tom
        tom_high: 'D3',      // MIDI 50 - High Tom
        crash: 'C#3',        // MIDI 49 - Crash Cymbal 1
        ride: 'D#3',         // MIDI 51 - Ride Cymbal 1
      };
      const noteName = gmNoteMap[type];
      if (noteName) {
        const played = this.playSampledNote(sfName, noteName, 1.8, volume, 0.9);
        if (played) return;
      }
    }

    // 3. Multi-Kit High Precision Synthesis Engine (distinct sound profiles for all 10 drum kits)
    const is808 = profile === 'drums_808';
    const is909 = profile === 'drums_electronic_909';
    const is80s = profile === 'drums_80s_arena';
    const isJazz = profile === 'drums_jazz';
    const isMetal = profile === 'drums_metal' || profile === 'drums_djent';
    const isFunk = profile === 'drums_funk';
    const isHeavyRock = profile === 'drums_heavy_rock';
    const isPunk = profile === 'drums_punk';

    switch (type) {
      case 'kick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (is808) {
          // Roland TR-808 Sub Boom Kick
          osc.type = 'sine';
          osc.frequency.setValueAtTime(130, now);
          osc.frequency.exponentialRampToValueAtTime(36, now + 0.45);

          gain.gain.setValueAtTime(volume * 1.5, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        } else if (is909) {
          // Roland TR-909 Punchy Click Kick
          osc.type = 'sine';
          osc.frequency.setValueAtTime(280, now);
          osc.frequency.exponentialRampToValueAtTime(46, now + 0.12);

          // Overdrive click transient
          const clickOsc = ctx.createOscillator();
          const clickGain = ctx.createGain();
          clickOsc.type = 'triangle';
          clickOsc.frequency.setValueAtTime(800, now);
          clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.02);
          clickGain.gain.setValueAtTime(volume * 0.8, now);
          clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
          clickOsc.connect(clickGain);
          if (this.masterGain) clickGain.connect(this.masterGain);
          clickOsc.start(now);
          clickOsc.stop(now + 0.02);

          gain.gain.setValueAtTime(volume * 1.4, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        } else if (isMetal) {
          // High-definition Clicky Double-Kick
          osc.type = 'sine';
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.exponentialRampToValueAtTime(48, now + 0.08);

          gain.gain.setValueAtTime(volume * 1.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        } else if (isJazz) {
          // Soft Mellow Acoustic Jazz Kick
          osc.type = 'sine';
          osc.frequency.setValueAtTime(110, now);
          osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);

          gain.gain.setValueAtTime(volume * 0.9, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        } else if (isFunk) {
          // Muted Dry Funky Kick
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.exponentialRampToValueAtTime(52, now + 0.09);

          gain.gain.setValueAtTime(volume * 1.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        } else if (is80s || isHeavyRock) {
          // Deep Booming Arena Kick
          osc.type = 'sine';
          osc.frequency.setValueAtTime(170, now);
          osc.frequency.exponentialRampToValueAtTime(38, now + 0.2);

          gain.gain.setValueAtTime(volume * 1.4, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        } else {
          // Classic Rock Ludwig Kick
          osc.type = 'sine';
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

          gain.gain.setValueAtTime(volume * 1.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        }

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.7);
        break;
      }

      case 'snare': {
        if (is80s) {
          // Famous 80s GATED REVERB SNARE
          const osc = ctx.createOscillator();
          const oscGain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(190, now);
          oscGain.gain.setValueAtTime(volume * 0.9, now);
          oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

          const noiseBuffer = this.getNoiseBuffer(ctx, 0.4);
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;

          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'highpass';
          noiseFilter.frequency.value = 800;

          const noiseGain = ctx.createGain();
          // Gated Envelope: Hold high gain flat, then cut abruptly
          noiseGain.gain.setValueAtTime(volume * 1.2, now);
          noiseGain.gain.setValueAtTime(volume * 1.1, now + 0.18);
          noiseGain.gain.linearRampToValueAtTime(0.0001, now + 0.19);

          osc.connect(oscGain);
          if (this.masterGain) oscGain.connect(this.masterGain);

          noise.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          if (this.masterGain) noiseGain.connect(this.masterGain);

          osc.start(now);
          noise.start(now);
          osc.stop(now + 0.2);
          noise.stop(now + 0.2);
        } else if (isJazz) {
          // Jazz Brush Snare (Soft rasping bandpass noise)
          const noiseBuffer = this.getNoiseBuffer(ctx, 0.3);
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;

          const bandpass = ctx.createBiquadFilter();
          bandpass.type = 'bandpass';
          bandpass.frequency.value = 2200;
          bandpass.Q.value = 0.8;

          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(0.001, now);
          noiseGain.gain.linearRampToValueAtTime(volume * 0.75, now + 0.015);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

          noise.connect(bandpass);
          bandpass.connect(noiseGain);
          if (this.masterGain) noiseGain.connect(this.masterGain);

          noise.start(now);
          noise.stop(now + 0.3);
        } else if (is808) {
          // TR-808 Snare (Tone + Snappy Noise)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const oscGain = ctx.createGain();

          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(180, now);
          osc2.frequency.setValueAtTime(330, now);

          oscGain.gain.setValueAtTime(volume * 0.8, now);
          oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

          const noiseBuffer = this.getNoiseBuffer(ctx, 0.2);
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;

          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'highpass';
          noiseFilter.frequency.value = 2000;

          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(volume * 0.9, now);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

          osc1.connect(oscGain);
          osc2.connect(oscGain);
          if (this.masterGain) oscGain.connect(this.masterGain);

          noise.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          if (this.masterGain) noiseGain.connect(this.masterGain);

          osc1.start(now);
          osc2.start(now);
          noise.start(now);
          osc1.stop(now + 0.2);
          osc2.stop(now + 0.2);
          noise.stop(now + 0.2);
        } else if (isMetal) {
          // Steel Piccolo Snare (High pitch, sharp attack)
          const osc = ctx.createOscillator();
          const oscGain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(260, now);
          oscGain.gain.setValueAtTime(volume, now);
          oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

          const noiseBuffer = this.getNoiseBuffer(ctx, 0.2);
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;

          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'highpass';
          noiseFilter.frequency.value = 2500;

          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(volume * 1.1, now);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

          osc.connect(oscGain);
          if (this.masterGain) oscGain.connect(this.masterGain);

          noise.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          if (this.masterGain) noiseGain.connect(this.masterGain);

          osc.start(now);
          noise.start(now);
          osc.stop(now + 0.2);
          noise.stop(now + 0.2);
        } else {
          // Standard / Funk / Rock Snare
          const osc = ctx.createOscillator();
          const oscGain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(isFunk ? 210 : 180, now);
          oscGain.gain.setValueAtTime(volume, now);
          oscGain.gain.exponentialRampToValueAtTime(0.01, now + (isFunk ? 0.08 : 0.12));

          const noiseBuffer = this.getNoiseBuffer(ctx, 0.25);
          const noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;

          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'highpass';
          noiseFilter.frequency.value = isFunk ? 1800 : 1200;

          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(volume * 0.95, now);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (isFunk ? 0.16 : 0.25));

          osc.connect(oscGain);
          if (this.masterGain) oscGain.connect(this.masterGain);

          noise.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          if (this.masterGain) noiseGain.connect(this.masterGain);

          osc.start(now);
          noise.start(now);
          osc.stop(now + 0.25);
          noise.stop(now + 0.25);
        }
        break;
      }

      case 'hihat_closed': {
        const duration = is808 ? 0.03 : isJazz ? 0.06 : 0.05;
        const cutoff = is808 ? 10000 : is909 ? 8500 : isFunk ? 8000 : 7000;

        const noiseBuffer = this.getNoiseBuffer(ctx, duration);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = cutoff;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * (is808 ? 0.8 : 0.65), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        noise.start(now);
        break;
      }

      case 'hihat_open': {
        const duration = is808 ? 0.3 : isJazz ? 0.5 : 0.4;
        const cutoff = is808 ? 9000 : isJazz ? 5500 : 6500;

        const noiseBuffer = this.getNoiseBuffer(ctx, duration);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = cutoff;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        noise.start(now);
        break;
      }

      case 'tom_low':
      case 'tom_high': {
        const isHigh = type === 'tom_high';
        const startFreq = isHigh ? (is808 ? 200 : 180) : (is808 ? 120 : 100);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 0.38, now + 0.3);

        gain.gain.setValueAtTime(volume * (is80s ? 1.1 : 0.9), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (is80s ? 0.45 : 0.32));

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      }

      case 'crash':
      case 'ride': {
        const isRide = type === 'ride';
        const duration = isRide ? (isJazz ? 2.2 : 1.2) : (is80s ? 1.8 : 1.4);
        const noiseBuffer = this.getNoiseBuffer(ctx, duration);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = isRide ? 'bandpass' : 'highpass';
        filter.frequency.value = isRide ? (isJazz ? 6200 : 5500) : 4500;
        if (isRide) filter.Q.value = 1.4;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * (isRide ? 0.6 : 0.8), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        noise.start(now);
        break;
      }
    }
  }

  // --- METRONOME CLICK ---
  public playMetronomeClick(accent = false) {
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 1200 : 800, now);

    gain.gain.setValueAtTime(accent ? 0.9 : 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    if (this.masterGain) gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);
  }
}

export const audioSynth = new SoundSynthesizer();
