export interface YouTubeVideo {
  id: string; // YouTube Video ID
  title: string;
  url: string; // Full YouTube URL
  type: 'official' | 'backingtrack' | 'karaoke' | 'cover' | 'other' | 'original' | 'tutorial' | 'aicover';
  channel?: string;
  addedAt?: number;
}

export interface SongLink {
  id: string;
  title: string;
  url: string;
  category?: 'youtube' | 'chords' | 'tab' | 'backing' | 'official' | 'other';
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  tuning?: string;
  bpm?: number;
  capo?: number;
  content: string; // Text with [Chord] markers or plain chords above lyrics
  chordsUsed: string[];
  notes?: string;
  attachments?: SongAttachment[];
  youtubeVideos?: YouTubeVideo[];
  isLocked?: boolean;
  lockPassword?: string;
  links?: SongLink[];
  images?: { id: string; name: string; dataUrl: string; caption?: string }[];
  tabs?: { id: string; title: string; content?: string; dataUrl?: string }[];
  sheetMusic?: { id: string; title: string; dataUrl?: string }[];
  midiFiles?: { id: string; title: string; dataUrl?: string }[];
  moduleConfigs?: any[];
  createdAt: number;
  updatedAt: number;
  author?: string;
}

export interface SongAttachment {
  id: string;
  name: string;
  type: 'pdf' | 'midi' | 'guitarpro' | 'txt' | 'image' | 'audio';
  dataUrl: string; // Base64 or Object URL
  /**
   * Set on attachments whose bytes live in Supabase Storage rather than
   * inline in `dataUrl` — bulk imports use this so the songbook fetch stays
   * small. `dataUrl` is filled in with a signed URL when the song loads.
   */
  storageBucket?: string;
  storagePath?: string;
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
  activeSong?: Song;
  autoScrollSpeed?: number;
  zoomLevel?: number;
  metronome?: {
    tempo: number;
    isPlaying: boolean;
    timeSignature: string;
  };
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

export type DrumSoundType =
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
  | 'crash'
  | 'crash_left'
  | 'crash_right'
  | 'ride'
  | 'ride_bow'
  | 'ride_bell'
  | 'china'
  | 'splash'
  | 'tambourine'
  | 'cowbell'
  | 'shaker'
  | 'handclap';

export interface DrumPad {
  id: string;
  name: string;
  keyLabel: string;
  soundType: DrumSoundType;
}

export interface MultiLayerSampleLayer {
  tier: 'soft' | 'med_soft' | 'med' | 'hard' | 'very_hard';
  roundRobin: number; // 1..4
  name: string;
  dataUrl: string; // base64 or audio data url
  size?: number;
  duration?: number;
  uploadedAt: number;
}

export interface CustomDrumSample {
  padId: string;
  name: string;
  dataUrl: string; // base64 or audio data url
  size?: number;
  duration?: number;
  volume?: number;
  pitchOffset?: number;
  uploadedAt: number;
  tier?: 'soft' | 'med_soft' | 'med' | 'hard' | 'very_hard';
  roundRobin?: number;
}

export interface CustomDrumKit {
  id: string; // uuid — matches the `drum_kits.id` Postgres column
  name: string;
  czName?: string;
  icon?: string;
  genre?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  samples: Record<string, CustomDrumSample>; // padId -> legacy single sample
  // Multi-velocity & Round-Robin layers: articulation -> layerKey ("tier:rrIndex" e.g. "hard:rr1") -> MultiLayerSampleLayer
  multiLayers?: Record<string, Record<string, MultiLayerSampleLayer>>;
}

export type UserRole = 'admin' | 'editor' | 'musician' | 'viewer';

export interface UserPermissions {
  canEditSongs: boolean;
  canDeleteSongs: boolean;
  canImportFiles: boolean;
  canManageUsers: boolean;
  canStartBandSession: boolean;
  canManageSetlists: boolean;
  canAccessTools: boolean;
}

export interface UserAccount {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: UserRole;
  permissions: UserPermissions;
  status: 'active' | 'invited' | 'disabled';
  createdAt: number;
  lastLoginAt?: number;
  invitedBy?: string;
  invitationToken?: string;
  invitationExpiresAt?: number;
  avatarColor?: string;
  instrument?: string;
  notes?: string;
}

export interface UserInvitation {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions: UserPermissions;
  temporaryPassword: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'expired';
  inviteUrl: string;
  invitedBy?: string;
  instrument?: string;
  notes?: string;
}

export interface AuthSession {
  user: UserAccount;
  token: string;
  loginTime: number;
}

export interface PlaylistItem {
  id: string;
  youtubeId: string;
  title: string;
  artist?: string;
  thumbnail: string;
  duration?: string; // e.g. "3:45"
  addedBy?: string;
  addedByName?: string;
  addedAt: number;
  notes?: string;
  songId?: string; // Optional link to a song in the songbook
  order?: number;
}

export interface BandOnlineUser {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarColor?: string;
  instrument?: string;
  lastActive: number;
  currentPage: string;
  activeSongTitle?: string;
  isLeadingPlayback?: boolean;
}

export interface SharedPlaybackState {
  isPlaying: boolean;
  currentItemId: string | null;
  youtubeId: string | null;
  title: string | null;
  currentTime: number;
  duration: number;
  mode: 'normal' | 'loop-one' | 'loop-all' | 'shuffle';
  updatedAt: number;
  updatedBy?: string;
  updatedByName?: string;
}

export interface BandPhoto {
  id: string;
  title: string;
  dataUrl: string;
  type: 'photo' | 'screenshot' | 'upload';
  authorId?: string;
  authorName?: string;
  createdAt: number;
  notes?: string;
  tags?: string[];
  width?: number;
  height?: number;
}

export interface SongStem {
  id: 'vocals' | 'drums' | 'bass' | 'guitar' | 'other' | string;
  name: string;             // e.g., "Kytara", "Zpěv", "Bicí"
  storagePath: string;      // "stems/{songId}/guitar.mp3"
  downloadUrl: string;      // Firebase Cloud Storage / audio link
  format: 'mp3' | 'wav';
  bitrateKbps: number;      // 192
}

export interface StemSongDocument {
  id: string;
  youtubeUrl: string;
  youtubeId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progressPercentage: number;
  errorMessage?: string;
  stems: SongStem[];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
  chords?: string;
}

export interface MediaTrack {
  id: string;
  title: string;
  artist: string;
  source: 'youtube' | 'youtube_music' | 'local_file' | 'stem' | 'stream';
  youtubeId?: string;
  url?: string;
  thumbnailUrl?: string;
  duration?: number;
  bpm?: number;
  key?: string;
  genre?: string;
  lyrics?: string | LyricLine[];
  associatedSongId?: string;
  isLiked?: boolean;
  type?: 'official' | 'backingtrack' | 'karaoke' | 'cover' | 'tutorial' | 'stem' | 'other' | 'original' | 'aicover' | string;
  addedAt?: number;
}

export interface MediaPlaylist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  icon?: string;
  trackIds: string[];
  isCustom?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MediaPlaybackState {
  currentTrack: MediaTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number; // 0.5 to 2.0
  loopMode: 'off' | 'one' | 'all';
  smartShuffle: boolean;
  abLoop: { start: number; end: number; active: boolean } | null;
  lyricsIndex: number;
}

export type TabType = 'songbook' | 'playlist' | 'photos' | 'youtube' | 'mediacenter' | 'library' | 'alphatab' | 'freetar' | 'bookmarks' | 'tuner' | 'scales' | 'instruments' | 'practice' | 'stemmixer';


