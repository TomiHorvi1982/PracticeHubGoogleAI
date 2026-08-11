// Web MIDI API Input Manager Service for Hardware Keyboards & Controllers

import { audioSynth, InstrumentProfile } from './audioSynth';

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
  state: 'connected' | 'disconnected';
}

export interface ScaleFilterConfig {
  enabled: boolean;
  allowedNoteRoots: string[]; // e.g. ['C', 'D', 'E', 'F', 'G', 'A', 'B'] or ['C', 'E', 'G']
  rootNote?: string;
  scaleName?: string;
}

export interface MidiEventPayload {
  type: 'noteon' | 'noteoff' | 'pitchbend' | 'controlchange';
  note?: number;
  noteName?: string;
  velocity?: number;
  channel: number;
  value?: number;
  deviceName?: string;
  timestamp: number;
  isFilteredOut?: boolean;
}

export type MidiListener = (event: MidiEventPayload) => void;

class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private selectedInputId: string | 'all' = 'all';
  private listeners: Set<MidiListener> = new Set();
  private channelMappings: Record<number, InstrumentProfile> = {
    1: 'grand_piano',
    2: 'electric_guitar',
    3: 'bass_guitar',
    4: 'acoustic_guitar',
    5: 'rhodes_ep',
    6: 'analog_synth',
    10: 'drums',
  };
  private isAutoSynthEnabled = true;
  private recentLog: MidiEventPayload[] = [];
  private scaleFilter: ScaleFilterConfig = {
    enabled: false,
    allowedNoteRoots: [],
  };

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    try {
      const savedChannelMappings = localStorage.getItem('strum_midi_channel_mappings');
      if (savedChannelMappings) {
        this.channelMappings = { ...this.channelMappings, ...JSON.parse(savedChannelMappings) };
      }
    } catch (e) {
      console.error('Failed to load MIDI channel mappings:', e);
    }
  }

  public async initMidi(): Promise<MidiDevice[]> {
    if (typeof window === 'undefined' || !navigator.requestMIDIAccess) {
      console.warn('Web MIDI API is not supported in this browser environment.');
      return [];
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.setupInputs();

      this.midiAccess.onstatechange = () => {
        this.setupInputs();
      };

      return this.getConnectedDevices();
    } catch (err) {
      console.error('Failed to access Web MIDI API:', err);
      return [];
    }
  }

  private setupInputs() {
    if (!this.midiAccess) return;

    const inputs = Array.from(this.midiAccess.inputs.values());
    inputs.forEach((input) => {
      input.onmidimessage = (e) => this.handleMidiMessage(e, input.name || 'Unknown Device');
    });
  }

  public getConnectedDevices(): MidiDevice[] {
    if (!this.midiAccess) return [];
    const devices: MidiDevice[] = [];
    this.midiAccess.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name || `MIDI Vstup ${input.id}`,
        manufacturer: input.manufacturer,
        state: input.state === 'connected' ? 'connected' : 'disconnected',
      });
    });
    return devices;
  }

  public setSelectedInput(inputId: string | 'all') {
    this.selectedInputId = inputId;
  }

  public getSelectedInput(): string | 'all' {
    return this.selectedInputId;
  }

  public setChannelMapping(channel: number, profile: InstrumentProfile) {
    this.channelMappings[channel] = profile;
    try {
      localStorage.setItem('strum_midi_channel_mappings', JSON.stringify(this.channelMappings));
    } catch (e) {
      console.error('Failed to save MIDI channel mappings:', e);
    }
  }

  public getChannelMapping(channel: number): InstrumentProfile {
    return this.channelMappings[channel] || 'grand_piano';
  }

  public getAllChannelMappings(): Record<number, InstrumentProfile> {
    return { ...this.channelMappings };
  }

  public setAutoSynthEnabled(enabled: boolean) {
    this.isAutoSynthEnabled = enabled;
  }

  public isAutoSynthActive(): boolean {
    return this.isAutoSynthEnabled;
  }

  public setScaleFilter(config: ScaleFilterConfig) {
    this.scaleFilter = { ...config };
  }

  public getScaleFilter(): ScaleFilterConfig {
    return { ...this.scaleFilter };
  }

  public sendNoteToOutputs(note: number, velocity: number, channel: number = 1) {
    if (!this.midiAccess) return;
    const status = velocity > 0 ? 0x90 | ((channel - 1) & 0xf) : 0x80 | ((channel - 1) & 0xf);
    const velByte = Math.min(127, Math.max(0, Math.round(velocity * 127)));
    this.midiAccess.outputs.forEach((output) => {
      try {
        output.send([status, note, velByte]);
      } catch (e) {
        console.warn('Failed to send MIDI message to output device:', e);
      }
    });
  }

  public subscribe(listener: MidiListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getRecentLog(): MidiEventPayload[] {
    return [...this.recentLog];
  }

  private handleMidiMessage(event: MIDIMessageEvent, deviceName: string) {
    if (!event.data || event.data.length < 2) return;

    const status = event.data[0];
    const command = status >> 4;
    const channel = (status & 0xf) + 1; // 1-indexed MIDI channel
    const note = event.data[1];
    const rawVelocity = event.data.length > 2 ? event.data[2] : 0;
    const velocity = rawVelocity / 127;

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteRoot = noteNames[note % 12];
    const noteName = `${noteRoot}${Math.floor(note / 12) - 1}`;

    // Check if key is filtered out (darkened) by scale filter
    const isFilteredOut =
      this.scaleFilter.enabled &&
      this.scaleFilter.allowedNoteRoots.length > 0 &&
      !this.scaleFilter.allowedNoteRoots.includes(noteRoot);

    let payload: MidiEventPayload | null = null;

    if (command === 0x9 && velocity > 0) {
      // NOTE ON
      payload = {
        type: 'noteon',
        note,
        noteName,
        velocity,
        channel,
        deviceName,
        timestamp: performance.now(),
        isFilteredOut,
      };

      if (this.isAutoSynthEnabled && !isFilteredOut) {
        const soundProfile = this.getChannelMapping(channel);
        audioSynth.noteOn(note, soundProfile, velocity);
      }
    } else if (command === 0x8 || (command === 0x9 && velocity === 0)) {
      // NOTE OFF
      payload = {
        type: 'noteoff',
        note,
        noteName,
        velocity: 0,
        channel,
        deviceName,
        timestamp: performance.now(),
        isFilteredOut,
      };

      if (this.isAutoSynthEnabled && !isFilteredOut) {
        const soundProfile = this.getChannelMapping(channel);
        audioSynth.noteOff(note, soundProfile);
      }
    } else if (command === 0xe) {
      // PITCH BEND
      const bendVal = ((rawVelocity << 7) | note) - 8192;
      payload = {
        type: 'pitchbend',
        value: bendVal,
        channel,
        deviceName,
        timestamp: performance.now(),
      };
    } else if (command === 0xb) {
      // CONTROL CHANGE
      payload = {
        type: 'controlchange',
        value: rawVelocity,
        channel,
        deviceName,
        timestamp: performance.now(),
      };
    }

    if (payload) {
      this.recentLog.unshift(payload);
      if (this.recentLog.length > 25) this.recentLog.pop();

      this.listeners.forEach((listener) => listener(payload!));
    }
  }
}

export const midiService = new MidiService();
