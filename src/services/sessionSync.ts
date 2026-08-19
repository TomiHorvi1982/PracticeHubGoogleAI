import { BandSession, SessionMember, Song } from '../types';
import { setFirestoreDoc, subscribeFirestoreCollection, getFirestoreDoc } from './firebase';

const CHANNEL_NAME = 'guitar_band_session_hub';

export class SessionSyncService {
  private channel: BroadcastChannel | null = null;
  private currentRoomId: string | null = null;
  private currentMember: SessionMember | null = null;
  private listeners: Array<(session: BandSession) => void> = [];
  private unsubscribeFirestore: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event) => {
        if (event.data && event.data.type === 'SESSION_UPDATE') {
          const session = event.data.session as BandSession;
          if (session.roomId === this.currentRoomId) {
            this.notifyListeners(session);
          }
        }
      };
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === `band_room_${this.currentRoomId}` && e.newValue) {
          try {
            const session = JSON.parse(e.newValue);
            this.notifyListeners(session);
          } catch (err) {}
        }
      });
    }
  }

  private startCloudSync(roomId: string) {
    if (this.unsubscribeFirestore) {
      this.unsubscribeFirestore();
    }

    this.unsubscribeFirestore = subscribeFirestoreCollection<BandSession>('sessions', (sessions) => {
      const room = sessions.find((s) => s.roomId === roomId);
      if (room) {
        this.saveAndBroadcastLocal(room);
        this.notifyListeners(room);
      }
    });
  }

  public async createRoom(roomName: string, hostName: string, instrument = 'Kytara'): Promise<BandSession> {
    const roomId = 'KAPELA-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const hostMember: SessionMember = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: hostName,
      instrument,
      isHost: true,
      joinedAt: Date.now(),
    };

    let initialSongs: Song[] = [];
    try {
      const raw = localStorage.getItem('band_songs_db');
      if (raw) initialSongs = JSON.parse(raw);
    } catch (e) {}

    const session: BandSession = {
      roomId,
      roomName: roomName || 'Naše Kapela',
      hostName,
      createdTime: Date.now(),
      members: [hostMember],
      songsList: initialSongs,
      lastUpdated: Date.now(),
    };

    this.currentRoomId = roomId;
    this.currentMember = hostMember;
    this.saveAndBroadcastLocal(session);

    // Persist to Cloud Firestore
    try {
      await setFirestoreDoc('sessions', roomId, session);
    } catch (err) {
      console.warn('Failed to save session to Firestore:', err);
    }

    this.startCloudSync(roomId);
    return session;
  }

  public async joinRoom(roomId: string, memberName: string, instrument = 'Kytara'): Promise<BandSession> {
    const cleanRoomId = roomId.trim().toUpperCase();

    const newMember: SessionMember = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: memberName,
      instrument,
      isHost: false,
      joinedAt: Date.now(),
    };

    this.currentRoomId = cleanRoomId;
    this.currentMember = newMember;

    // Fetch existing room from Firestore
    let room = await getFirestoreDoc<BandSession>('sessions', cleanRoomId);
    if (!room) {
      const savedLocal = localStorage.getItem(`band_room_${cleanRoomId}`);
      if (savedLocal) {
        try {
          room = JSON.parse(savedLocal);
        } catch (e) {}
      }
    }

    if (!room) {
      room = {
        roomId: cleanRoomId,
        roomName: 'Zkušebna Kapely',
        hostName: 'Kapelník',
        createdTime: Date.now(),
        members: [newMember],
        songsList: [],
        lastUpdated: Date.now(),
      };
    } else {
      const exists = room.members.some((m) => m.name.toLowerCase() === memberName.toLowerCase());
      if (!exists) {
        room.members.push(newMember);
      }
    }

    room.lastUpdated = Date.now();
    this.saveAndBroadcastLocal(room);

    try {
      await setFirestoreDoc('sessions', cleanRoomId, room);
    } catch (err) {}

    this.startCloudSync(cleanRoomId);
    return room;
  }

  public async updateCurrentSong(song: Song | null, autoScrollSpeed = 0, zoomLevel = 100) {
    if (!this.currentRoomId) return;

    let currentSession = this.getRoomLocally(this.currentRoomId);
    if (!currentSession) {
      currentSession = await getFirestoreDoc<BandSession>('sessions', this.currentRoomId);
    }
    if (!currentSession) return;

    currentSession.activeSong = song || undefined;
    currentSession.activeSongId = song?.id || undefined;
    currentSession.autoScrollSpeed = autoScrollSpeed;
    currentSession.zoomLevel = zoomLevel;
    currentSession.lastUpdated = Date.now();

    this.saveAndBroadcastLocal(currentSession);
    await setFirestoreDoc('sessions', this.currentRoomId, currentSession).catch(() => {});
  }

  public async setActiveSong(song: Song | null) {
    await this.updateCurrentSong(song);
  }

  public async broadcastNewSong(song: Song) {
    if (!this.currentRoomId) return;

    let currentSession = this.getRoomLocally(this.currentRoomId);
    if (!currentSession) {
      currentSession = await getFirestoreDoc<BandSession>('sessions', this.currentRoomId);
    }
    if (!currentSession) return;

    const songs = currentSession.songsList || [];
    const idx = songs.findIndex((s) => s.id === song.id);
    if (idx >= 0) {
      songs[idx] = song;
    } else {
      songs.unshift(song);
    }
    currentSession.songsList = songs;
    currentSession.lastUpdated = Date.now();

    this.saveAndBroadcastLocal(currentSession);
    await setFirestoreDoc('sessions', this.currentRoomId, currentSession).catch(() => {});
  }

  public async updateMetronome(tempo: number, isPlaying: boolean, timeSignature = '4/4') {
    if (!this.currentRoomId) return;

    let currentSession = this.getRoomLocally(this.currentRoomId);
    if (!currentSession) {
      currentSession = await getFirestoreDoc<BandSession>('sessions', this.currentRoomId);
    }
    if (!currentSession) return;

    currentSession.metronome = {
      tempo,
      isPlaying,
      timeSignature,
    };
    currentSession.lastUpdated = Date.now();

    this.saveAndBroadcastLocal(currentSession);
    await setFirestoreDoc('sessions', this.currentRoomId, currentSession).catch(() => {});
  }

  public getSession(): BandSession | null {
    if (this.currentRoomId) {
      return this.getRoomLocally(this.currentRoomId);
    }
    return null;
  }

  public subscribe(cb: (session: BandSession) => void) {
    this.listeners.push(cb);
    if (this.currentRoomId) {
      const current = this.getRoomLocally(this.currentRoomId);
      if (current) cb(current);
    }
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notifyListeners(session: BandSession) {
    this.listeners.forEach((cb) => cb(session));
  }

  private saveAndBroadcastLocal(session: BandSession) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`band_room_${session.roomId}`, JSON.stringify(session));
    }
    if (this.channel) {
      this.channel.postMessage({
        type: 'SESSION_UPDATE',
        session,
      });
    }
  }

  private getRoomLocally(roomId: string): BandSession | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(`band_room_${roomId}`);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {}
    }
    return null;
  }

  public leaveRoom() {
    if (this.unsubscribeFirestore) {
      this.unsubscribeFirestore();
      this.unsubscribeFirestore = null;
    }
    this.currentRoomId = null;
    this.currentMember = null;
  }
}

export const sessionSyncService = new SessionSyncService();
export const sessionSync = sessionSyncService;
