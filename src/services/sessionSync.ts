import { BandSession, SessionMember, Song } from '../types';

const CHANNEL_NAME = 'guitar_band_session_hub';

export class SessionSyncService {
  private channel: BroadcastChannel | null = null;
  private currentRoomId: string | null = null;
  private currentMember: SessionMember | null = null;
  private listeners: Array<(session: BandSession) => void> = [];
  private pollTimer: any = null;
  private lastSyncedTimestamp = 0;

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

    // Fallback/supplementary sync using localStorage event
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === `band_room_${this.currentRoomId}` && e.newValue) {
          try {
            const session = JSON.parse(e.newValue);
            this.notifyListeners(session);
          } catch (err) {
            console.error('Failed to parse room update', err);
          }
        }
      });
    }
  }

  private startCloudSync(roomId: string) {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    this.pollTimer = setInterval(() => {
      if (!this.currentRoomId) return;

      fetch(`/api/rooms/${encodeURIComponent(this.currentRoomId)}/poll?lastUpdated=${this.lastSyncedTimestamp}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.updated && data.room) {
            const room: BandSession = data.room;
            this.lastSyncedTimestamp = room.lastUpdated || Date.now();
            this.saveAndBroadcastLocal(room);
          }
        })
        .catch(() => {
          // Silent catch for polling
        });
    }, 2000);
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

    // Get host's local songs if present to upload to cloud room
    let initialSongs: Song[] = [];
    try {
      const raw = localStorage.getItem('band_songs_db');
      if (raw) initialSongs = JSON.parse(raw);
    } catch (e) {}

    const localSession: BandSession = {
      roomId,
      roomName: roomName || 'Naše Kapela',
      hostName,
      createdTime: Date.now(),
      members: [hostMember],
      songsList: initialSongs,
    };

    this.currentRoomId = roomId;
    this.currentMember = hostMember;
    this.saveAndBroadcastLocal(localSession);

    // Sync to Cloud Server Store
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          roomName,
          hostName,
          member: hostMember,
          songsList: initialSongs,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.room) {
          const cloudRoom: BandSession = data.room;
          this.lastSyncedTimestamp = cloudRoom.lastUpdated || Date.now();
          this.saveAndBroadcastLocal(cloudRoom);
          this.startCloudSync(roomId);
          return cloudRoom;
        }
      }
    } catch (err) {
      console.warn('Failed to register room on cloud server:', err);
    }

    this.startCloudSync(roomId);
    return localSession;
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

    // Call Cloud API to join room and retrieve host's songs!
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(cleanRoomId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: newMember }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.room) {
          const cloudRoom: BandSession = data.room;
          this.lastSyncedTimestamp = cloudRoom.lastUpdated || Date.now();
          this.saveAndBroadcastLocal(cloudRoom);
          this.startCloudSync(cleanRoomId);
          return cloudRoom;
        }
      }
    } catch (err) {
      console.warn('Cloud room join request failed, falling back to local state:', err);
    }

    // Fallback to local storage state if server unavailable
    const localSession = this.getRoomState(cleanRoomId);
    let updatedSession: BandSession;

    if (localSession) {
      const existing = localSession.members.find((m) => m.name === memberName);
      if (!existing) localSession.members.push(newMember);
      updatedSession = localSession;
    } else {
      updatedSession = {
        roomId: cleanRoomId,
        roomName: `Zkušebna ${cleanRoomId}`,
        hostName: memberName,
        createdTime: Date.now(),
        members: [newMember],
      };
    }

    this.saveAndBroadcastLocal(updatedSession);
    this.startCloudSync(cleanRoomId);
    return updatedSession;
  }

  public sharePhotoToSession(dataUrl: string, caption = 'Nový list akordů / fotka', author = 'Kytarista') {
    if (!this.currentRoomId) return;
    const session = this.getRoomState(this.currentRoomId);
    const photoData = {
      dataUrl,
      caption,
      timestamp: Date.now(),
      author: this.currentMember?.name || author,
    };

    if (session) {
      session.sharedPhoto = photoData;
      this.saveAndBroadcastLocal(session);
    }

    // Sync to Cloud
    fetch(`/api/rooms/${encodeURIComponent(this.currentRoomId)}/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharedPhoto: photoData }),
    }).catch((e) => console.warn('Cloud photo share failed:', e));
  }

  public setActiveSong(songId: string) {
    if (!this.currentRoomId) return;
    const session = this.getRoomState(this.currentRoomId);
    if (session) {
      session.activeSongId = songId;
      this.saveAndBroadcastLocal(session);
    }

    // Sync to Cloud
    fetch(`/api/rooms/${encodeURIComponent(this.currentRoomId)}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeSongId: songId }),
    }).catch((e) => console.warn('Cloud active song update failed:', e));
  }

  public broadcastSongs(songsList: Song[]) {
    if (!this.currentRoomId) return;
    const session = this.getRoomState(this.currentRoomId);
    if (session) {
      session.songsList = songsList;
      this.saveAndBroadcastLocal(session);
    }

    // Sync to Cloud
    fetch(`/api/rooms/${encodeURIComponent(this.currentRoomId)}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songsList }),
    }).catch((e) => console.warn('Cloud songs broadcast failed:', e));
  }

  public broadcastNewSong(newSong: Song) {
    if (!this.currentRoomId) return;
    const session = this.getRoomState(this.currentRoomId);
    if (session) {
      const existingList = session.songsList || [];
      const updatedList = [newSong, ...existingList.filter((s) => s.id !== newSong.id)];
      session.songsList = updatedList;
      session.activeSongId = newSong.id;
      this.saveAndBroadcastLocal(session);
    }

    // Sync to Cloud
    fetch(`/api/rooms/${encodeURIComponent(this.currentRoomId)}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song: newSong, activeSongId: newSong.id }),
    }).catch((e) => console.warn('Cloud new song broadcast failed:', e));
  }

  public getRoomState(roomId: string): BandSession | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(`band_room_${roomId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public getCurrentSession(): BandSession | null {
    if (!this.currentRoomId) return null;
    return this.getRoomState(this.currentRoomId);
  }

  public leaveRoom() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.currentRoomId = null;
    this.currentMember = null;
  }

  public subscribe(callback: (session: BandSession) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notifyListeners(session: BandSession) {
    this.listeners.forEach((listener) => listener(session));
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
    this.notifyListeners(session);
  }
}

export const sessionSync = new SessionSyncService();
