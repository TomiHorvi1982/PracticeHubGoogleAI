// Domain Event Bus for decoupled inter-tool communication

export type DomainEventType =
  | 'SONG_CHANGED'
  | 'KEY_CHANGED'
  | 'TRANSPOSE_CHANGED'
  | 'BPM_CHANGED'
  | 'TUNING_CHANGED'
  | 'CAPO_CHANGED'
  | 'CHORD_SELECTED'
  | 'SCALE_SELECTED'
  | 'TRANSPORT_PLAY'
  | 'TRANSPORT_PAUSE'
  | 'TRANSPORT_STOP'
  | 'TRANSPORT_SEEK'
  | 'METRONOME_TOGGLE'
  | 'RECORDING_STARTED'
  | 'RECORDING_STOPPED'
  | 'RECORDING_SAVED'
  | 'INSTRUMENT_CHANGED'
  | 'INSTRUMENT_LOADING_UPDATE'
  | 'DOCK_OPEN_TOOL'
  | 'MEDIA_TRACK_CHANGED'
  | 'MEDIA_PLAY'
  | 'MEDIA_PAUSE'
  | 'MEDIA_SEEK'
  | 'MEDIA_VOLUME_CHANGED'
  | 'MEDIA_SPEED_CHANGED'
  | 'SONG_MEDIA_ATTACHED'
  | 'DRUM_VOICE_TRIGGERED';

export interface DomainEventPayloads {
  SONG_CHANGED: { songId: string | null; song?: any };
  KEY_CHANGED: { key: string };
  TRANSPOSE_CHANGED: { semitones: number };
  BPM_CHANGED: { bpm: number };
  TUNING_CHANGED: { tuning: string };
  CAPO_CHANGED: { capo: number };
  CHORD_SELECTED: { chordName: string | null };
  SCALE_SELECTED: { scaleName: string | null; rootNote?: string };
  TRANSPORT_PLAY: void;
  TRANSPORT_PAUSE: void;
  TRANSPORT_STOP: void;
  TRANSPORT_SEEK: { positionMs: number };
  METRONOME_TOGGLE: { isRunning: boolean; bpm?: number };
  RECORDING_STARTED: { mode: string };
  RECORDING_STOPPED: { audioUrl?: string };
  RECORDING_SAVED: { title: string; audioUrl: string; songId?: string };
  INSTRUMENT_CHANGED: { instrument: string };
  INSTRUMENT_LOADING_UPDATE: { profile: string; sfName: string; progress: number; isLoading: boolean };
  DOCK_OPEN_TOOL: { toolId: 'fretboard' | 'scales' | 'chords' | 'tuner' | 'metronome' | 'looper' | 'drums' | 'keyboard' };
  MEDIA_TRACK_CHANGED: { track: any; autoPlay?: boolean };
  MEDIA_PLAY: void;
  MEDIA_PAUSE: void;
  MEDIA_SEEK: { time: number };
  MEDIA_VOLUME_CHANGED: { volume: number };
  MEDIA_SPEED_CHANGED: { speed: number };
  SONG_MEDIA_ATTACHED: { songId: string; track: any };
  DRUM_VOICE_TRIGGERED: { articulation: string; velocity: number; roundRobinIndex: number };
}

type EventCallback<T extends DomainEventType> = (payload: DomainEventPayloads[T]) => void;

class DomainEventBus {
  private listeners: { [key in DomainEventType]?: Array<(payload: any) => void> } = {};

  public on<T extends DomainEventType>(event: T, callback: EventCallback<T>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);

    return () => {
      this.off(event, callback);
    };
  }

  public off<T extends DomainEventType>(event: T, callback: EventCallback<T>): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter((cb) => cb !== callback);
  }

  public emit<T extends DomainEventType>(event: T, payload?: DomainEventPayloads[T]): void {
    if (!this.listeners[event]) return;
    this.listeners[event]!.forEach((callback) => {
      try {
        callback(payload);
      } catch (err) {
        console.error(`Error in event listener for ${event}:`, err);
      }
    });
  }
}

export const eventBus = new DomainEventBus();
