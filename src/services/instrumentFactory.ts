// Factory Pattern Service for Instrument Sample Management, Caching & Playback
// Abstracts away SoundFont fetching, Cache API & IndexedDB storage, loading progress events, and sound synthesis.

import {
  InstrumentProfile,
  SoundProfileOption,
  INSTRUMENT_PROFILES,
  DRUM_KITS,
  audioSynth,
} from './audioSynth';
import { drumKitFactory, DrumPadType } from './drumKitFactory';
import { eventBus } from './eventBus';

export interface InstrumentInstance {
  profile: InstrumentProfile;
  name: string;
  category: string;
  isLoaded: () => boolean;
  isLoading: () => boolean;
  getProgress: () => number | null;
  isCachedLocally: () => Promise<boolean>;
  preload: (onProgress?: (pct: number) => void) => Promise<void>;
  playNote: (noteName: string, duration?: number, velocity?: number) => void;
  stopNote: (noteName: string) => void;
}

export class InstrumentFactory {
  private instances = new Map<InstrumentProfile, InstrumentInstance>();

  /**
   * Factory method: Get or create a unified InstrumentInstance for the given profile.
   * Centralizes sample loading, cache status, and sound generation.
   */
  public getInstrument(profile: InstrumentProfile): InstrumentInstance {
    if (this.instances.has(profile)) {
      return this.instances.get(profile)!;
    }

    const name = this.getInstrumentName(profile);
    const category = this.getInstrumentCategory(profile);
    const isDrumProfile = profile === 'drums' || profile.startsWith('drums_') || profile.startsWith('custom_');

    const instance: InstrumentInstance = {
      profile,
      name,
      category,
      isLoaded: () => isDrumProfile ? drumKitFactory.isKitLoaded(profile) : audioSynth.isInstrumentLoaded(profile),
      isLoading: () => isDrumProfile ? drumKitFactory.getState().isLoading : audioSynth.isInstrumentLoading(profile),
      getProgress: () => isDrumProfile ? (drumKitFactory.isKitLoaded(profile) ? null : 50) : audioSynth.getLoadingProgress(profile),
      isCachedLocally: async () => isDrumProfile ? true : audioSynth.isInstrumentCachedLocally(profile),
      preload: async (onProgress) => {
        return this.preloadInstrument(profile, onProgress);
      },
      playNote: (noteName: string, duration = 2.0, velocity = 0.8) => {
        if (isDrumProfile) {
          drumKitFactory.playDrumSound('snare', velocity, profile);
        } else {
          this.playNote(profile, noteName, duration, velocity);
        }
      },
      stopNote: (noteName: string) => {
        if (!isDrumProfile) {
          audioSynth.stopNote(noteName, profile);
        }
      },
    };

    this.instances.set(profile, instance);
    return instance;
  }

  /**
   * Centralized sample preloading with dual-layer cache check, progress events, and error handling
   */
  public async preloadInstrument(
    profile: InstrumentProfile,
    onProgress?: (pct: number) => void
  ): Promise<void> {
    const isDrumProfile = profile === 'drums' || profile.startsWith('drums_') || profile.startsWith('custom_');

    if (isDrumProfile) {
      try {
        if (onProgress) onProgress(30);
        await drumKitFactory.loadKitBuffers(profile);
        if (onProgress) onProgress(100);
        eventBus.emit('INSTRUMENT_LOADING_UPDATE', {
          profile,
          sfName: profile,
          progress: 100,
          isLoading: false,
        });
      } catch (err: any) {
        console.warn(`[InstrumentFactory] Error loading drum kit buffers for '${profile}':`, err);
        throw err;
      }
      return;
    }

    try {
      await audioSynth.preloadInstrument(profile, (progress) => {
        if (onProgress) onProgress(progress);
      });
    } catch (err: any) {
      console.warn(`[InstrumentFactory] Error preloading profile '${profile}':`, err);
      eventBus.emit('INSTRUMENT_LOADING_UPDATE', {
        profile,
        sfName: profile,
        progress: 0,
        isLoading: false,
      });
      throw err;
    }
  }

  /**
   * Play a note on an instrument safely using the factory engine
   */
  public playNote(
    profile: InstrumentProfile,
    noteName: string,
    duration = 2.0,
    velocity = 0.8
  ): void {
    audioSynth.playNote(noteName, profile, duration, velocity);
  }

  /**
   * Play a drum sound for a drum kit profile using the dedicated DrumKitFactory buffer engine
   */
  public playDrumSound(soundType: string, velocity = 1.0, kitProfile: InstrumentProfile | string = 'drums'): void {
    drumKitFactory.playDrumSound(soundType, velocity, kitProfile);
  }

  /**
   * Switch the active drum kit dynamically in real-time
   */
  public async switchDrumKit(kitId: string): Promise<void> {
    await drumKitFactory.switchKit(kitId);
  }

  /**
   * Unload inactive drum kits from memory
   */
  public unloadInactiveDrumKits(keepKitId?: string): void {
    drumKitFactory.unloadInactiveKits(keepKitId);
  }

  /**
   * Play a guitar chord strum for a guitar profile
   */
  public playGuitarChord(
    frets: number[],
    openFreqs: number[] = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63],
    profile: InstrumentProfile = 'acoustic_guitar'
  ): void {
    audioSynth.playGuitarChord(frets, openFreqs, profile);
  }

  /**
   * Stop all playing notes across all instruments
   */
  public stopAllNotes(): void {
    audioSynth.stopAllNotes();
  }

  /**
   * Check if instrument is loaded in memory
   */
  public isInstrumentLoaded(profile: InstrumentProfile): boolean {
    const isDrumProfile = profile === 'drums' || profile.startsWith('drums_') || profile.startsWith('custom_');
    if (isDrumProfile) {
      return drumKitFactory.isKitLoaded(profile);
    }
    return audioSynth.isInstrumentLoaded(profile);
  }

  /**
   * Check if instrument is currently downloading/decoding
   */
  public isInstrumentLoading(profile: InstrumentProfile): boolean {
    const isDrumProfile = profile === 'drums' || profile.startsWith('drums_') || profile.startsWith('custom_');
    if (isDrumProfile) {
      return drumKitFactory.getState().isLoading;
    }
    return audioSynth.isInstrumentLoading(profile);
  }

  /**
   * Get loading progress percentage (1-100) or null
   */
  public getLoadingProgress(profile: InstrumentProfile): number | null {
    const isDrumProfile = profile === 'drums' || profile.startsWith('drums_') || profile.startsWith('custom_');
    if (isDrumProfile) {
      return drumKitFactory.isKitLoaded(profile) ? null : 50;
    }
    return audioSynth.getLoadingProgress(profile);
  }

  /**
   * Check if instrument samples are cached locally in IndexedDB / Cache API
   */
  public async isInstrumentCachedLocally(profile: InstrumentProfile): Promise<boolean> {
    const isDrumProfile = profile === 'drums' || profile.startsWith('drums_') || profile.startsWith('custom_');
    if (isDrumProfile) {
      return true;
    }
    return audioSynth.isInstrumentCachedLocally(profile);
  }

  /**
   * Get human-readable display name for an instrument profile
   */
  public getInstrumentName(profile: InstrumentProfile): string {
    const found = INSTRUMENT_PROFILES.find((p) => p.id === profile);
    if (found) return found.name;
    const kit = DRUM_KITS.find((k) => k.id === profile);
    if (kit) return kit.name;
    return profile;
  }

  /**
   * Get category for an instrument profile
   */
  public getInstrumentCategory(profile: InstrumentProfile): string {
    const found = INSTRUMENT_PROFILES.find((p) => p.id === profile);
    if (found) return found.czCategory;
    const kit = DRUM_KITS.find((k) => k.id === profile);
    if (kit) return 'Bicí sady';
    return 'Různé';
  }

  /**
   * Get all instruments belonging to a specific category
   */
  public getInstrumentsByCategory(category: string): InstrumentInstance[] {
    const profiles = INSTRUMENT_PROFILES.filter(
      (p) => p.czCategory.toLowerCase() === category.toLowerCase()
    ).map((p) => p.id);

    if (category.toLowerCase().includes('bicí') || category.toLowerCase().includes('drum')) {
      DRUM_KITS.forEach((k) => {
        if (!profiles.includes(k.id)) profiles.push(k.id);
      });
    }

    return profiles.map((p) => this.getInstrument(p));
  }

  /**
   * Get all Piano category instruments
   */
  public getPianoInstruments(): InstrumentInstance[] {
    return this.getInstrumentsByCategory('Klávesy / Piano');
  }

  /**
   * Get all Drum Kit category instruments
   */
  public getDrumKitInstruments(): InstrumentInstance[] {
    return DRUM_KITS.map((k) => this.getInstrument(k.id));
  }

  /**
   * Check if any instrument in a category is currently loading
   */
  public isCategoryLoading(category: string): boolean {
    const insts = this.getInstrumentsByCategory(category);
    return insts.some((i) => i.isLoading());
  }

  /**
   * Get highest loading progress for a category
   */
  public getCategoryLoadingProgress(category: string): number | null {
    const insts = this.getInstrumentsByCategory(category);
    let maxProgress: number | null = null;
    for (const inst of insts) {
      const p = inst.getProgress();
      if (p !== null) {
        if (maxProgress === null || p > maxProgress) {
          maxProgress = p;
        }
      }
    }
    return maxProgress;
  }

  /**
   * Check IndexedDB cache status summary across instrument profiles
   */
  public async getCacheStorageSummary(): Promise<{ cachedCount: number; profiles: string[] }> {
    const cachedProfiles: string[] = [];
    const allProfiles = [
      ...INSTRUMENT_PROFILES.map((p) => p.id),
      ...DRUM_KITS.map((k) => k.id),
    ];

    for (const profile of allProfiles) {
      try {
        const isCached = await this.isInstrumentCachedLocally(profile);
        if (isCached) {
          cachedProfiles.push(profile);
        }
      } catch {
        // ignore individual cache check error
      }
    }

    return {
      cachedCount: cachedProfiles.length,
      profiles: cachedProfiles,
    };
  }

  /**
   * Get list of all available instrument profile options
   */
  public getAvailableInstruments(): SoundProfileOption[] {
    return INSTRUMENT_PROFILES;
  }

  /**
   * Get mapped instrument instance for a band role (e.g. 'Kytara', 'Klávesy')
   */
  public getMappedInstrument(role: string): InstrumentInstance {
    const profile = audioSynth.getMappedSound(role);
    return this.getInstrument(profile);
  }

  /**
   * Update role mapping (persists to localStorage and notifies subscribers)
   */
  public setMappedInstrument(role: string, profile: InstrumentProfile): void {
    audioSynth.setInstrumentMapping(role, profile);
    eventBus.emit('INSTRUMENT_CHANGED', { instrument: profile });
  }
}

// Global Singleton Export
export const instrumentFactory = new InstrumentFactory();
