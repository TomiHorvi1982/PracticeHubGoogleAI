export interface YouTubeVideo {
  id: string; // YouTube Video ID
  title: string;
  url: string; // Full YouTube URL
  type: 'official' | 'backingtrack' | 'karaoke' | 'cover' | 'other';
  channel?: string;
  addedAt?: number;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm?: number;
  capo?: number;
  content: string; // Text with [Chord] markers or plain chords above lyrics
  chordsUsed: string[];
  notes?: string;
  attachments?: SongAttachment[];
  youtubeVideos?: YouTubeVideo[];
  createdAt: number;
  updatedAt: number;
  author?: string;
}

export interface SongAttachment {
  id: string;
  name: string;
  type: 'pdf' | 'midi' | 'guitarpro' | 'txt' | 'image' | 'audio';
  dataUrl: string; // Base64 or Object URL
  size?: number;
  uploadedAt: number;
  parsedData?: {
    title?: string;
    artist?: string;
    bpm?: number;
    key?: string;
    chords?: string[];
    extractedText?: string;
    trackNames?: string[];
  };
}

export interface TuningPreset {
  name: string;
  notes: string[]; // e.g., ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
  frequencies: number[];
}

export interface ChordDefinition {
  name: string;
  root: string;
  type: string; // Major, Minor, 7, maj7, m7, sus4, power, etc.
  frets: number[]; // e.g., [-1, 0, 2, 2, 2, 0] (-1 for muted, 0 for open)
  fingers: number[]; // 0 for none, 1-4 for index..pinky
  barreFret?: number;
  pianoKeys: number[]; // Note numbers relative to C
}

export interface ChordVariation {
  id: string;
  label: string;
  description: string;
  category: 'open' | 'barre_e' | 'barre_a' | 'power';
  chord: ChordDefinition;
}

export interface ScaleDefinition {
  name: string;
  czName: string;
  intervals: number[]; // Semitone intervals from root e.g. [0, 2, 4, 5, 7, 9, 11]
  description: string;
}

export interface BandSession {
  roomId: string;
  roomName: string;
  hostName: string;
  createdTime: number;
  lastUpdated?: number;
  activeSongId?: string;
  songsList?: Song[];
  sharedPhoto?: {
    dataUrl: string;
    caption: string;
    timestamp: number;
    author: string;
  };
  members: SessionMember[];
}

export interface SessionMember {
  id: string;
  name: string;
  instrument: string;
  isHost: boolean;
  joinedAt: number;
}

export interface DrumPad {
  id: string;
  name: string;
  keyLabel: string;
  soundType: 'kick' | 'snare' | 'hihat_closed' | 'hihat_open' | 'tom_low' | 'tom_high' | 'crash' | 'ride';
}

export type TabType = 'songbook' | 'youtube' | 'tuner' | 'scales' | 'instruments' | 'practice' | 'setlist';
