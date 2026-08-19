import { BandOnlineUser, SharedPlaybackState, UserAccount } from '../types';

type LiveSyncCallback = (state: {
  onlineUsers: BandOnlineUser[];
  playbackState: SharedPlaybackState;
  playlistCount?: number;
  songsCount?: number;
}) => void;

class LiveSyncService {
  private onlineUsers: BandOnlineUser[] = [];
  private playbackState: SharedPlaybackState = {
    isPlaying: false,
    currentItemId: null,
    youtubeId: null,
    title: null,
    currentTime: 0,
    duration: 0,
    mode: 'normal',
    updatedAt: Date.now(),
  };
  private subscribers: Set<LiveSyncCallback> = new Set();
  private intervalId: any = null;
  private currentUser: UserAccount | null = null;
  private currentPage: string = 'songbook';
  private activeSongTitle: string = '';
  private isLeadingPlayback: boolean = false;
  private isSyncing: boolean = false;

  constructor() {
    this.startHeartbeat();
  }

  public setUserContext(user: UserAccount | null, currentPage: string, activeSongTitle?: string, isLeading?: boolean) {
    this.currentUser = user;
    this.currentPage = currentPage;
    if (activeSongTitle !== undefined) this.activeSongTitle = activeSongTitle;
    if (isLeading !== undefined) this.isLeadingPlayback = isLeading;
  }

  public subscribe(cb: LiveSyncCallback): () => void {
    this.subscribers.add(cb);
    cb({ onlineUsers: this.onlineUsers, playbackState: this.playbackState });
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    for (const sub of this.subscribers) {
      try {
        sub({ onlineUsers: this.onlineUsers, playbackState: this.playbackState });
      } catch (e) {
        console.error('Error in liveSync subscriber', e);
      }
    }
  }

  public getOnlineUsers(): BandOnlineUser[] {
    return this.onlineUsers;
  }

  public getPlaybackState(): SharedPlaybackState {
    return this.playbackState;
  }

  public async fetchInitialState() {
    try {
      const res = await fetch('/api/db/init');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.onlineUsers)) {
          this.onlineUsers = data.onlineUsers;
        }
        if (data.playbackState) {
          this.playbackState = data.playbackState;
        }
        this.notify();
        return data;
      }
    } catch (e) {
      console.warn('Failed to fetch initial database state:', e);
    }
    return null;
  }

  private startHeartbeat() {
    if (this.intervalId) clearInterval(this.intervalId);

    const runPing = async () => {
      if (this.isSyncing) return;
      this.isSyncing = true;
      try {
        const payload: any = {};
        if (this.currentUser) {
          payload.user = {
            id: this.currentUser.id,
            email: this.currentUser.email,
            displayName: this.currentUser.displayName,
            role: this.currentUser.role,
            avatarColor: this.currentUser.avatarColor,
            instrument: this.currentUser.instrument,
            currentPage: this.currentPage,
            activeSongTitle: this.activeSongTitle,
            isLeadingPlayback: this.isLeadingPlayback,
          };
        }

        const res = await fetch('/api/live/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.onlineUsers)) {
            this.onlineUsers = data.onlineUsers;
          }
          if (data.playbackState) {
            // Only update local playback state if it was updated by someone else or newer
            const remoteTime = data.playbackState.updatedAt || 0;
            const localTime = this.playbackState.updatedAt || 0;
            if (remoteTime > localTime) {
              this.playbackState = data.playbackState;
            }
          }
          this.notify();
        }
      } catch (err) {
        // Silent fail on transient network disconnect
      } finally {
        this.isSyncing = false;
      }
    };

    runPing();
    this.intervalId = setInterval(runPing, 2500);
  }

  public async broadcastPlayback(update: Partial<SharedPlaybackState>) {
    const newState: SharedPlaybackState = {
      ...this.playbackState,
      ...update,
      updatedAt: Date.now(),
      updatedBy: this.currentUser?.id || 'anonymous',
      updatedByName: this.currentUser?.displayName || 'Člen',
    };

    this.playbackState = newState;
    this.notify();

    try {
      await fetch('/api/live/playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState),
      });
    } catch (e) {
      console.warn('Failed to broadcast playback state', e);
    }
  }
}

export const liveSyncService = new LiveSyncService();
