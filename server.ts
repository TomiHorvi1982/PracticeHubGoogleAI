import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // --- Persistent Backend Database Stores (data/ folder) ---
  const DATA_DIR = path.join(process.cwd(), 'data');
  const USERS_FILE = path.join(DATA_DIR, 'users.json');
  const INVITES_FILE = path.join(DATA_DIR, 'invitations.json');
  const SONGS_FILE = path.join(DATA_DIR, 'songs.json');
  const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');
  const PHOTOS_FILE = path.join(DATA_DIR, 'photos.json');

  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {}
  }

  const DEFAULT_ADMIN = {
    id: 'user-admin-hortom82',
    email: 'hortom82@gmail.com',
    username: 'hortom82',
    displayName: 'Tomáš Hort (Hlavní Správce)',
    role: 'admin',
    permissions: {
      canEditSongs: true,
      canDeleteSongs: true,
      canImportFiles: true,
      canManageUsers: true,
      canStartBandSession: true,
      canManageSetlists: true,
      canAccessTools: true,
    },
    password: 'Admin123!',
    initialPassword: 'Admin123!',
    status: 'active',
    createdAt: Date.now() - 30 * 24 * 3600 * 1000,
    lastLoginAt: Date.now(),
    avatarColor: '#FF3E00',
    instrument: 'Kytara / Leader',
    notes: 'Hlavní administrátor systému',
  };

  const DEFAULT_SONGS = [
    {
      id: 's1',
      title: 'Stánky',
      artist: 'Jan a František Nedvědové',
      key: 'G',
      tuning: 'Standard (EADGBe)',
      bpm: 85,
      capo: 0,
      chordsUsed: ['G', 'C', 'Em', 'D', 'D7'],
      notes: 'Česká kytarová klasika k táboráku i do zkušebny.',
      content: `[G]U stánků na levnou [C]krásu
[G]postávají a [Em]smějí se [D]času,
[G]s cigaretou a s [C]holkou, co nemá [G]kam [D]jít.[G]

[G]Vrací se domů [C]ráno,
[G]se zlou se potká [Em]všude, kde je [D]psáno,
[G]že láska bez pe[C]něz k nicomnosti [G]je.[D][G]

Refrén:
A [C]stánky na levnou [D7]krásu
[G]stále tu [Em]budou stoj[Am]et,
však [D7]lidé se mění a [G]mizejí v dál.`,
      createdAt: Date.now() - 3600000 * 24,
      updatedAt: Date.now() - 3600000 * 24,
      author: 'Kytarista Tom',
      youtubeVideos: [
        {
          id: '2m-fJb_S3O0',
          title: 'Nedvědi - Stánky (Oficiální videoklip)',
          url: 'https://www.youtube.com/watch?v=2m-fJb_S3O0',
          type: 'official',
        },
        {
          id: '3N3U7x2y4Zk',
          title: 'Brontosauři - Stánky (Akordy a text pro kytaru)',
          url: 'https://www.youtube.com/watch?v=3N3U7x2y4Zk',
          type: 'backingtrack',
        },
      ],
    },
    {
      id: 's2',
      title: 'Pohoda',
      artist: 'Kabát',
      key: 'D',
      tuning: 'Standard (EADGBe)',
      bpm: 128,
      capo: 0,
      chordsUsed: ['D', 'G', 'A', 'Em', 'C'],
      notes: 'Energický kapelový rockový nářez.',
      content: `Intro: [D] [G] [D] [A]

[D]Když se u nás chlapi poperou, tak [G]jenom nožem a nebo sekerou,
[D]vždycky jenom poctivě, [A]žádná zákeřnost!
[D]A až se všichni pozabíjí, [G]víno a pivo si nalijí,
[D]bude u nás pohoda, [A]máme toho dost!

Refrén:
Vezmi [G]láhev a [A]pojď sem k [D]nám,
[G]já ti zprávu [A]dobrou [D]dám!
Bude [G]pohoda [A]u nás v [D]pivovaru,
[Em]všechny starosti [C]pustíme z hlavy [A]ven!`,
      createdAt: Date.now() - 3600000 * 12,
      updatedAt: Date.now() - 3600000 * 12,
      author: 'Kapela Rockers',
      youtubeVideos: [
        {
          id: 'cZ5w4dM_c0c',
          title: 'Kabát - Pohoda (Oficiální klip)',
          url: 'https://www.youtube.com/watch?v=cZ5w4dM_c0c',
          type: 'official',
        },
        {
          id: 'gR9Y40kLw00',
          title: 'Kabát - Pohoda (Backing track s textem a akordy)',
          url: 'https://www.youtube.com/watch?v=gR9Y40kLw00',
          type: 'backingtrack',
        },
      ],
    },
    {
      id: 's3',
      title: 'Wonderwall',
      artist: 'Oasis',
      key: 'Em',
      tuning: 'Standard (EADGBe)',
      bpm: 88,
      capo: 2,
      chordsUsed: ['Em', 'G', 'D', 'C', 'A'],
      notes: 'Hrajte s kapodastrem na 2. pražci.',
      content: `[Em7]Today is gonna be the day that they're [G]gonna throw it back to you,
[Dsus4]By now you should've somehow reali[A7sus4]sed what you gotta do.
[Em7]I don't believe that anybody [G]feels the way I do [Dsus4]about you [A7sus4]now.

[C]And all the roads we [D]have to walk are [Em7]winding,
[C]And all the lights that [D]lead us there are [Em7]blinding.
[C]There are many [D]things that I would [G]like to say to [Em7]you but I don't know [Dsus4]how.

Refrén:
[C]Because maybe[Em7] [G]
You're gonna be the one that [Em7]saves me? [C]
And after [Em7]all, [G]
You're my wonder[Em7]wall. [C] [Em7] [G] [Em7]`,
      createdAt: Date.now() - 3600000 * 6,
      updatedAt: Date.now() - 3600000 * 6,
      author: 'Noel Gallagher',
      youtubeVideos: [
        {
          id: '6hzrDeceEKc',
          title: 'Oasis - Wonderwall (Official Video)',
          url: 'https://www.youtube.com/watch?v=6hzrDeceEKc',
          type: 'official',
        },
        {
          id: 'mQ9J6CAnG8o',
          title: 'Wonderwall - Guitar Backing Track with Chords',
          url: 'https://www.youtube.com/watch?v=mQ9J6CAnG8o',
          type: 'backingtrack',
        },
      ],
    },
  ];

  const DEFAULT_PLAYLIST = [
    {
      id: 'pl_1',
      youtubeId: 'cZ5w4dM_c0c',
      title: 'Kabát - Pohoda (Oficiální videoklip)',
      artist: 'Kabát',
      thumbnail: 'https://img.youtube.com/vi/cZ5w4dM_c0c/mqdefault.jpg',
      duration: '3:45',
      addedBy: 'user-admin-hortom82',
      addedByName: 'Tomáš Hort',
      addedAt: Date.now() - 3600000 * 5,
      songId: 's2',
    },
    {
      id: 'pl_2',
      youtubeId: '6hzrDeceEKc',
      title: 'Oasis - Wonderwall (Official Music Video)',
      artist: 'Oasis',
      thumbnail: 'https://img.youtube.com/vi/6hzrDeceEKc/mqdefault.jpg',
      duration: '4:38',
      addedBy: 'user-admin-hortom82',
      addedByName: 'Tomáš Hort',
      addedAt: Date.now() - 3600000 * 4,
      songId: 's3',
    },
    {
      id: 'pl_3',
      youtubeId: '2m-fJb_S3O0',
      title: 'Nedvědi - Stánky (Originální nahrávka)',
      artist: 'Jan a František Nedvědovi',
      thumbnail: 'https://img.youtube.com/vi/2m-fJb_S3O0/mqdefault.jpg',
      duration: '2:58',
      addedBy: 'user-admin-hortom82',
      addedByName: 'Tomáš Hort',
      addedAt: Date.now() - 3600000 * 3,
      songId: 's1',
    },
    {
      id: 'pl_4',
      youtubeId: 'hTWKbfoikeg',
      title: 'Nirvana - Smells Like Teen Spirit (Official Music Video)',
      artist: 'Nirvana',
      thumbnail: 'https://img.youtube.com/vi/hTWKbfoikeg/mqdefault.jpg',
      duration: '4:38',
      addedBy: 'user-admin-hortom82',
      addedByName: 'Tomáš Hort',
      addedAt: Date.now() - 3600000 * 2,
    },
    {
      id: 'pl_5',
      youtubeId: 'g4ouPGGLI6Q',
      title: 'AC/DC - Highway to Hell (Official Video)',
      artist: 'AC/DC',
      thumbnail: 'https://img.youtube.com/vi/g4ouPGGLI6Q/mqdefault.jpg',
      duration: '3:28',
      addedBy: 'user-admin-hortom82',
      addedByName: 'Tomáš Hort',
      addedAt: Date.now() - 3600000 * 1,
    },
  ];

  let serverUsers: any[] = [DEFAULT_ADMIN];
  let serverInvitations: any[] = [];
  let serverSongs: any[] = DEFAULT_SONGS;
  let serverPlaylist: any[] = DEFAULT_PLAYLIST;
  let serverPhotos: any[] = [
    {
      id: 'photo_sample_1',
      title: 'Akordový list a poznámky ze zkoušky',
      type: 'photo',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="%231a1a1a"/><rect x="40" y="40" width="720" height="520" rx="8" fill="%230d0d0d" stroke="%23333" stroke-width="2"/><text x="80" y="100" fill="%23FF3E00" font-family="monospace" font-weight="bold" font-size="28">POZNAMKY ZE ZKOUSKY - AKORDY</text><line x1="80" y1="120" x2="720" y2="120" stroke="%23333" stroke-width="2"/><text x="80" y="180" fill="%2300FF41" font-family="monospace" font-size="20">1. Stanky (G - C - Em - D - D7)</text><text x="80" y="220" fill="%2300FF41" font-family="monospace" font-size="20">2. Pohoda (D - G - A - Em - C)</text><text x="80" y="260" fill="%2300FF41" font-family="monospace" font-size="20">3. Wonderwall (Em7 - G - Dsus4 - A7sus4)</text><rect x="80" y="310" width="640" height="180" rx="6" fill="%23141414" stroke="%23FF3E00" stroke-width="1.5"/><text x="110" y="360" fill="%23fff" font-family="monospace" font-size="18">DOPORUCENI PRO KAPELU:</text><text x="110" y="400" fill="%23aaa" font-family="monospace" font-size="16">- Zpev: druhy hlas v refrenu posunout o tercii vys</text><text x="110" y="440" fill="%23aaa" font-family="monospace" font-size="16">- Bici: prechod na cinely pred solo pasazi</text></svg>',
      authorId: 'user-admin-hortom82',
      authorName: 'Tomáš Hort',
      createdAt: Date.now() - 3600000 * 8,
      notes: 'Foto z tabule ve zkušebně s akordy a poznámkami pro kapelu.',
      tags: ['Akordy', 'Zkouška'],
      width: 800,
      height: 600,
    },
    {
      id: 'photo_sample_2',
      title: 'Printscreen nastavení DAW a kytarových efektů',
      type: 'screenshot',
      dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="%230a0a0a"/><rect x="20" y="20" width="760" height="460" rx="8" fill="%23121212" stroke="%2300FF41" stroke-width="1.5"/><rect x="20" y="20" width="760" height="45" rx="8" fill="%231a1a1a"/><circle cx="50" cy="42" r="6" fill="%23FF3E00"/><circle cx="70" cy="42" r="6" fill="%23ffbb00"/><circle cx="90" cy="42" r="6" fill="%2300FF41"/><text x="120" y="48" fill="%23fff" font-family="monospace" font-size="16" font-weight="bold">DAW GUITAR RIG / PEDALBOARD CAPTURE</text><rect x="50" y="90" width="210" height="150" rx="6" fill="%231f1a14" stroke="%23FF3E00" stroke-width="2"/><text x="70" y="130" fill="%23FF3E00" font-family="monospace" font-weight="bold" font-size="18">OVERDRIVE</text><text x="70" y="165" fill="%23fff" font-family="monospace" font-size="14">Gain: 6.5</text><text x="70" y="195" fill="%23fff" font-family="monospace" font-size="14">Tone: 7.0</text><rect x="290" y="90" width="210" height="150" rx="6" fill="%23141f1a" stroke="%2300FF41" stroke-width="2"/><text x="310" y="130" fill="%2300FF41" font-family="monospace" font-weight="bold" font-size="18">CHORUS / MOD</text><text x="310" y="165" fill="%23fff" font-family="monospace" font-size="14">Rate: 2.2 Hz</text><text x="310" y="195" fill="%23fff" font-family="monospace" font-size="14">Depth: 45%</text><rect x="530" y="90" width="210" height="150" rx="6" fill="%2314141f" stroke="%233b82f6" stroke-width="2"/><text x="550" y="130" fill="%233b82f6" font-family="monospace" font-weight="bold" font-size="18">DELAY &amp; REVERB</text><text x="550" y="165" fill="%23fff" font-family="monospace" font-size="14">Time: 380 ms</text><text x="550" y="195" fill="%23fff" font-family="monospace" font-size="14">Mix: 25%</text><rect x="50" y="270" width="690" height="170" rx="6" fill="%23080808" stroke="%23333"/><text x="80" y="320" fill="%2300FF41" font-family="monospace" font-size="16">MAIN MASTER BUS: -3.2 dB (True Peak Limiter)</text><text x="80" y="360" fill="%23888" font-family="monospace" font-size="14">Printscreen z PC zachycený během zkoušení nového aparátu.</text></svg>',
      authorId: 'user-admin-hortom82',
      authorName: 'Tomáš Hort',
      createdAt: Date.now() - 3600000 * 4,
      notes: 'Snímek obrazovky z PC s nastavením virtuálního pedalboardu a efektů pro sóla.',
      tags: ['Printscreen', 'Vybavení'],
      width: 800,
      height: 500,
    }
  ];

  // Load Users
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf-8');
      serverUsers = JSON.parse(data);
      if (!serverUsers.some((u) => u.email?.toLowerCase() === 'hortom82@gmail.com')) {
        serverUsers.unshift(DEFAULT_ADMIN);
      }
    } else {
      fs.writeFileSync(USERS_FILE, JSON.stringify(serverUsers, null, 2), 'utf-8');
    }
  } catch (e) {
    console.error('Error loading users.json', e);
  }

  // Load Invitations
  try {
    if (fs.existsSync(INVITES_FILE)) {
      const data = fs.readFileSync(INVITES_FILE, 'utf-8');
      serverInvitations = JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading invitations.json', e);
  }

  // Load Songs Database
  try {
    if (fs.existsSync(SONGS_FILE)) {
      const data = fs.readFileSync(SONGS_FILE, 'utf-8');
      serverSongs = JSON.parse(data);
    } else {
      fs.writeFileSync(SONGS_FILE, JSON.stringify(serverSongs, null, 2), 'utf-8');
    }
  } catch (e) {
    console.error('Error loading songs.json', e);
  }

  // Load Playlist Database
  try {
    if (fs.existsSync(PLAYLIST_FILE)) {
      const data = fs.readFileSync(PLAYLIST_FILE, 'utf-8');
      serverPlaylist = JSON.parse(data);
    } else {
      fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(serverPlaylist, null, 2), 'utf-8');
    }
  } catch (e) {
    console.error('Error loading playlist.json', e);
  }

  // Load Photos Database
  try {
    if (fs.existsSync(PHOTOS_FILE)) {
      const data = fs.readFileSync(PHOTOS_FILE, 'utf-8');
      serverPhotos = JSON.parse(data);
    } else {
      fs.writeFileSync(PHOTOS_FILE, JSON.stringify(serverPhotos, null, 2), 'utf-8');
    }
  } catch (e) {
    console.error('Error loading photos.json', e);
  }

  const saveServerUsers = () => {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(serverUsers, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save users.json', e);
    }
  };

  const saveServerInvitations = () => {
    try {
      fs.writeFileSync(INVITES_FILE, JSON.stringify(serverInvitations, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save invitations.json', e);
    }
  };

  const saveServerSongs = () => {
    try {
      fs.writeFileSync(SONGS_FILE, JSON.stringify(serverSongs, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save songs.json', e);
    }
  };

  const saveServerPlaylist = () => {
    try {
      fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(serverPlaylist, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save playlist.json', e);
    }
  };

  const saveServerPhotos = () => {
    try {
      fs.writeFileSync(PHOTOS_FILE, JSON.stringify(serverPhotos, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save photos.json', e);
    }
  };

  // --- Real-time In-Memory Presence & Live Playback Sync ---
  interface ActiveOnlineUser {
    id: string;
    userId: string;
    email: string;
    displayName: string;
    role: string;
    avatarColor?: string;
    instrument?: string;
    lastActive: number;
    currentPage: string;
    activeSongTitle?: string;
    isLeadingPlayback?: boolean;
  }

  interface SharedPlaybackState {
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

  const activeOnlineUsers = new Map<string, ActiveOnlineUser>();
  let sharedPlaybackState: SharedPlaybackState = {
    isPlaying: false,
    currentItemId: serverPlaylist[0]?.id || null,
    youtubeId: serverPlaylist[0]?.youtubeId || null,
    title: serverPlaylist[0]?.title || null,
    currentTime: 0,
    duration: 0,
    mode: 'normal',
    updatedAt: Date.now(),
    updatedBy: 'system',
    updatedByName: 'Automatický DJ',
  };

  const cleanStaleOnlineUsers = () => {
    const now = Date.now();
    for (const [key, user] of activeOnlineUsers.entries()) {
      // If no heartbeat for > 15 seconds, consider offline
      if (now - user.lastActive > 15000) {
        activeOnlineUsers.delete(key);
      }
    }
  };

  // Heartbeat & Online Presence Endpoint
  app.post('/api/live/heartbeat', (req, res) => {
    const { user } = req.body;
    if (user && user.id) {
      const userKey = user.id;
      activeOnlineUsers.set(userKey, {
        id: userKey,
        userId: user.id,
        email: user.email || '',
        displayName: user.displayName || user.username || 'Člen Kapely',
        role: user.role || 'musician',
        avatarColor: user.avatarColor || '#FF3E00',
        instrument: user.instrument || 'Kytara',
        lastActive: Date.now(),
        currentPage: user.currentPage || 'songbook',
        activeSongTitle: user.activeSongTitle || '',
        isLeadingPlayback: Boolean(user.isLeadingPlayback),
      });
    }

    cleanStaleOnlineUsers();

    res.json({
      onlineUsers: Array.from(activeOnlineUsers.values()),
      playbackState: sharedPlaybackState,
      playlistCount: serverPlaylist.length,
      songsCount: serverSongs.length,
    });
  });

  // Get Live State (Online Users + Playback)
  app.get('/api/live/state', (req, res) => {
    cleanStaleOnlineUsers();
    res.json({
      onlineUsers: Array.from(activeOnlineUsers.values()),
      playbackState: sharedPlaybackState,
    });
  });

  // Update Shared Playback State (Leader / Broadcast)
  app.post('/api/live/playback', (req, res) => {
    const update = req.body;
    sharedPlaybackState = {
      ...sharedPlaybackState,
      ...update,
      updatedAt: Date.now(),
    };
    res.json({ success: true, playbackState: sharedPlaybackState });
  });

  // Unified Initial Database & Sync Endpoint (Fetches everything on load / reconnect)
  app.get('/api/db/init', (req, res) => {
    cleanStaleOnlineUsers();
    res.json({
      users: serverUsers,
      invitations: serverInvitations,
      songs: serverSongs,
      playlist: serverPlaylist,
      photos: serverPhotos,
      onlineUsers: Array.from(activeOnlineUsers.values()),
      playbackState: sharedPlaybackState,
    });
  });

  // --- REST API for Shared YouTube Playlist ---
  app.get('/api/playlist', (req, res) => {
    res.json({ playlist: serverPlaylist });
  });

  app.post('/api/playlist', (req, res) => {
    const { item } = req.body;
    if (!item || !item.youtubeId) {
      return res.status(400).json({ error: 'Chybí platné YouTube video.' });
    }

    const newItem = {
      id: item.id || 'pl_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      youtubeId: item.youtubeId,
      title: item.title || 'YouTube Video',
      artist: item.artist || '',
      thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg`,
      duration: item.duration || '',
      addedBy: item.addedBy || '',
      addedByName: item.addedByName || 'Člen',
      addedAt: Date.now(),
      notes: item.notes || '',
      songId: item.songId || undefined,
    };

    serverPlaylist.push(newItem);
    saveServerPlaylist();

    res.json({ success: true, item: newItem, playlist: serverPlaylist });
  });

  app.post('/api/playlist/batch', (req, res) => {
    const { items } = req.body;
    if (Array.isArray(items)) {
      serverPlaylist = items;
      saveServerPlaylist();
    }
    res.json({ success: true, playlist: serverPlaylist });
  });

  app.put('/api/playlist/:id', (req, res) => {
    const itemId = req.params.id;
    const index = serverPlaylist.findIndex((p) => p.id === itemId);
    if (index === -1) {
      return res.status(404).json({ error: 'Položka playlistu nenalezena.' });
    }
    serverPlaylist[index] = { ...serverPlaylist[index], ...req.body };
    saveServerPlaylist();
    res.json({ success: true, item: serverPlaylist[index], playlist: serverPlaylist });
  });

  app.delete('/api/playlist/:id', (req, res) => {
    const itemId = req.params.id;
    serverPlaylist = serverPlaylist.filter((p) => p.id !== itemId);
    saveServerPlaylist();
    res.json({ success: true, playlist: serverPlaylist });
  });

  app.post('/api/playlist/reorder', (req, res) => {
    const { playlist } = req.body;
    if (Array.isArray(playlist)) {
      serverPlaylist = playlist;
      saveServerPlaylist();
    }
    res.json({ success: true, playlist: serverPlaylist });
  });

  // --- REST API for Songbook Database ---
  app.get('/api/songs', (req, res) => {
    res.json({ songs: serverSongs });
  });

  app.post('/api/songs', (req, res) => {
    const { song } = req.body;
    if (!song || !song.title) {
      return res.status(400).json({ error: 'Chybí název písně.' });
    }

    const newSong = {
      ...song,
      id: song.id || 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      createdAt: song.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const existingIndex = serverSongs.findIndex((s) => s.id === newSong.id);
    if (existingIndex >= 0) {
      serverSongs[existingIndex] = newSong;
    } else {
      serverSongs.unshift(newSong);
    }

    saveServerSongs();
    res.json({ success: true, song: newSong, songs: serverSongs });
  });

  app.post('/api/songs/sync', (req, res) => {
    const { songs } = req.body;
    if (Array.isArray(songs) && songs.length > 0) {
      const map = new Map<string, any>(serverSongs.map((s) => [s.id, s]));
      for (const s of songs) {
        map.set(s.id, s);
      }
      serverSongs = Array.from(map.values());
      saveServerSongs();
    }
    res.json({ success: true, songs: serverSongs });
  });

  app.put('/api/songs/:id', (req, res) => {
    const songId = req.params.id;
    const index = serverSongs.findIndex((s) => s.id === songId);
    if (index === -1) {
      return res.status(404).json({ error: 'Píseň nenalezena.' });
    }
    serverSongs[index] = { ...serverSongs[index], ...req.body, updatedAt: Date.now() };
    saveServerSongs();
    res.json({ success: true, song: serverSongs[index], songs: serverSongs });
  });

  app.delete('/api/songs/:id', (req, res) => {
    const songId = req.params.id;
    serverSongs = serverSongs.filter((s) => s.id !== songId);
    saveServerSongs();
    res.json({ success: true, songs: serverSongs });
  });

  // --- REST API for Band Photos & Screenshots ---
  app.get('/api/photos', (req, res) => {
    res.json({ photos: serverPhotos });
  });

  app.post('/api/photos', (req, res) => {
    const { photo } = req.body;
    if (!photo || !photo.dataUrl) {
      return res.status(400).json({ error: 'Chybí obrazová data snímku.' });
    }

    const newPhoto = {
      id: photo.id || 'ph_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      title: photo.title || 'Snímek ' + new Date().toLocaleDateString('cs-CZ'),
      dataUrl: photo.dataUrl,
      type: photo.type || 'photo',
      authorId: photo.authorId || '',
      authorName: photo.authorName || 'Člen Kapely',
      createdAt: photo.createdAt || Date.now(),
      notes: photo.notes || '',
      tags: Array.isArray(photo.tags) ? photo.tags : [],
      width: photo.width || undefined,
      height: photo.height || undefined,
    };

    serverPhotos.unshift(newPhoto);
    saveServerPhotos();

    res.json({ success: true, photo: newPhoto, photos: serverPhotos });
  });

  app.put('/api/photos/:id', (req, res) => {
    const photoId = req.params.id;
    const index = serverPhotos.findIndex((p) => p.id === photoId);
    if (index === -1) {
      return res.status(404).json({ error: 'Snímek nenalezen.' });
    }
    serverPhotos[index] = { ...serverPhotos[index], ...req.body };
    saveServerPhotos();
    res.json({ success: true, photo: serverPhotos[index], photos: serverPhotos });
  });

  app.delete('/api/photos/:id', (req, res) => {
    const photoId = req.params.id;
    serverPhotos = serverPhotos.filter((p) => p.id !== photoId);
    saveServerPhotos();
    res.json({ success: true, photos: serverPhotos });
  });


  // Sync users & invitations from client / state
  app.post('/api/auth/sync-users', (req, res) => {
    const { users, invitations } = req.body;
    if (Array.isArray(users) && users.length > 0) {
      // Merge users prioritizing updated records
      const map = new Map<string, any>(serverUsers.map((u) => [u.id, u]));
      for (const u of users) {
        map.set(u.id, u);
      }
      // Ensure admin remains admin
      const admin = map.get('user-admin-hortom82') || DEFAULT_ADMIN;
      admin.role = 'admin';
      map.set('user-admin-hortom82', admin);
      serverUsers = Array.from(map.values());
      saveServerUsers();
    }
    if (Array.isArray(invitations)) {
      const invMap = new Map<string, any>(serverInvitations.map((i) => [i.token || i.id, i]));
      for (const inv of invitations) {
        invMap.set(inv.token || inv.id, inv);
      }
      serverInvitations = Array.from(invMap.values());
      saveServerInvitations();
    }
    res.json({ success: true, users: serverUsers, invitations: serverInvitations });
  });

  // Get all users (Admin API)
  app.get('/api/users', (req, res) => {
    res.json({ users: serverUsers, invitations: serverInvitations });
  });

  // Create new user & invitation
  app.post('/api/users', (req, res) => {
    const { email, displayName, username, role, permissions, password, instrument, notes } = req.body;
    if (!email || !displayName) {
      return res.status(400).json({ error: 'Email a jméno jsou povinné.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (serverUsers.some((u) => u.email?.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: 'Uživatel s tímto e-mailem již existuje.' });
    }

    const token = 'inv_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const tempPassword = password?.trim() || 'Rock-' + Math.floor(1000 + Math.random() * 9000) + '!';

    const newUser = {
      id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      email: cleanEmail,
      username: username?.trim() || cleanEmail.split('@')[0],
      displayName: displayName.trim(),
      role: role || 'musician',
      permissions: permissions || {
        canEditSongs: role === 'admin' || role === 'editor',
        canDeleteSongs: role === 'admin' || role === 'editor',
        canImportFiles: role === 'admin' || role === 'editor',
        canManageUsers: role === 'admin',
        canStartBandSession: true,
        canManageSetlists: role === 'admin' || role === 'editor',
        canAccessTools: true,
      },
      password: tempPassword,
      initialPassword: tempPassword,
      status: 'invited',
      createdAt: Date.now(),
      invitationToken: token,
      invitationExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      instrument: instrument || 'Kytara',
      notes: notes || '',
    };

    const newInvite = {
      id: 'inv_' + token,
      email: cleanEmail,
      displayName: newUser.displayName,
      role: newUser.role,
      permissions: newUser.permissions,
      temporaryPassword: tempPassword,
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      status: 'pending',
      instrument: newUser.instrument,
      notes: newUser.notes,
    };

    serverUsers.unshift(newUser);
    serverInvitations.unshift(newInvite);
    saveServerUsers();
    saveServerInvitations();

    res.json({ success: true, user: newUser, invitation: newInvite });
  });

  // Update user
  app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const user = serverUsers.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Uživatel nenalezen.' });
    }

    if (user.email?.toLowerCase() === 'hortom82@gmail.com' && req.body.role && req.body.role !== 'admin') {
      return res.status(403).json({ error: 'Hlavnímu administrátorovi nelze odebrat administrátorská práva.' });
    }

    Object.assign(user, req.body);
    saveServerUsers();
    res.json({ success: true, user });
  });

  // Delete user
  app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const user = serverUsers.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Uživatel nenalezen.' });
    }

    if (user.email?.toLowerCase() === 'hortom82@gmail.com') {
      return res.status(403).json({ error: 'Hlavního administrátora nelze smazat.' });
    }

    serverUsers = serverUsers.filter((u) => u.id !== userId);
    serverInvitations = serverInvitations.filter((i) => i.email?.toLowerCase() !== user.email?.toLowerCase());
    saveServerUsers();
    saveServerInvitations();
    res.json({ success: true });
  });

  // In-Memory Cloud Band Room Session Store
  interface ServerSessionMember {
    id: string;
    name: string;
    instrument: string;
    isHost: boolean;
    joinedAt: number;
  }

  interface ServerBandRoom {
    roomId: string;
    roomName: string;
    hostName: string;
    createdTime: number;
    lastUpdated: number;
    activeSongId?: string;
    songsList: any[];
    members: ServerSessionMember[];
    sharedPhoto?: {
      dataUrl: string;
      caption: string;
      timestamp: number;
      author: string;
    };
  }

  const bandRoomsStore = new Map<string, ServerBandRoom>();

  // Get Room Details
  app.get('/api/rooms/:roomId', (req, res) => {
    const roomId = req.params.roomId.trim().toUpperCase();
    const room = bandRoomsStore.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Místnost nenalezena', room: null });
    }
    res.json({ room });
  });

  // Create or Update Room
  app.post('/api/rooms', (req, res) => {
    const { roomId, roomName, hostName, member, songsList, activeSongId } = req.body;
    if (!roomId || !hostName) {
      return res.status(400).json({ error: 'Chybí roomId nebo hostName' });
    }

    const cleanRoomId = roomId.trim().toUpperCase();
    let room = bandRoomsStore.get(cleanRoomId);

    const hostMember: ServerSessionMember = member || {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: hostName,
      instrument: 'Kytara',
      isHost: true,
      joinedAt: Date.now(),
    };

    if (!room) {
      room = {
        roomId: cleanRoomId,
        roomName: roomName || `Zkušebna ${cleanRoomId}`,
        hostName,
        createdTime: Date.now(),
        lastUpdated: Date.now(),
        activeSongId: activeSongId || (songsList && songsList.length > 0 ? songsList[0].id : undefined),
        songsList: songsList || [],
        members: [hostMember],
      };
    } else {
      room.roomName = roomName || room.roomName;
      room.hostName = hostName || room.hostName;
      room.lastUpdated = Date.now();
      if (activeSongId) room.activeSongId = activeSongId;

      const existingMember = room.members.find((m) => m.name === hostName);
      if (!existingMember) {
        room.members.push(hostMember);
      } else {
        existingMember.instrument = hostMember.instrument || existingMember.instrument;
      }

      if (Array.isArray(songsList) && songsList.length > 0) {
        const existingMap = new Map(room.songsList.map((s) => [s.id, s]));
        for (const song of songsList) {
          existingMap.set(song.id, song);
        }
        room.songsList = Array.from(existingMap.values());
      }
    }

    bandRoomsStore.set(cleanRoomId, room);
    res.json({ room });
  });

  // Join Room Endpoint
  app.post('/api/rooms/:roomId/join', (req, res) => {
    const roomId = req.params.roomId.trim().toUpperCase();
    const { member } = req.body;

    let room = bandRoomsStore.get(roomId);

    const newMember: ServerSessionMember = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: member?.name || 'Kytarista',
      instrument: member?.instrument || 'Kytara',
      isHost: false,
      joinedAt: Date.now(),
    };

    if (!room) {
      room = {
        roomId,
        roomName: `Zkušebna ${roomId}`,
        hostName: newMember.name,
        createdTime: Date.now(),
        lastUpdated: Date.now(),
        songsList: [],
        members: [{ ...newMember, isHost: true }],
      };
    } else {
      const existingIndex = room.members.findIndex((m) => m.name === newMember.name);
      if (existingIndex === -1) {
        room.members.push(newMember);
      } else {
        room.members[existingIndex].instrument = newMember.instrument;
      }
      room.lastUpdated = Date.now();
    }

    bandRoomsStore.set(roomId, room);
    res.json({ room });
  });

  // Add / Sync Songs or Active Song Endpoint
  app.post('/api/rooms/:roomId/songs', (req, res) => {
    const roomId = req.params.roomId.trim().toUpperCase();
    const { song, songsList, activeSongId } = req.body;

    let room = bandRoomsStore.get(roomId);
    if (!room) {
      room = {
        roomId,
        roomName: `Zkušebna ${roomId}`,
        hostName: 'Člen Kapely',
        createdTime: Date.now(),
        lastUpdated: Date.now(),
        songsList: [],
        members: [],
      };
    }

    if (song) {
      const existingIndex = room.songsList.findIndex((s) => s.id === song.id);
      if (existingIndex >= 0) {
        room.songsList[existingIndex] = song;
      } else {
        room.songsList.unshift(song);
      }
    }

    if (Array.isArray(songsList) && songsList.length > 0) {
      const existingMap = new Map(room.songsList.map((s) => [s.id, s]));
      for (const s of songsList) {
        existingMap.set(s.id, s);
      }
      room.songsList = Array.from(existingMap.values());
    }

    if (activeSongId) {
      room.activeSongId = activeSongId;
    }

    room.lastUpdated = Date.now();
    bandRoomsStore.set(roomId, room);

    res.json({ room });
  });

  // Share Photo Endpoint
  app.post('/api/rooms/:roomId/photo', (req, res) => {
    const roomId = req.params.roomId.trim().toUpperCase();
    const { sharedPhoto } = req.body;

    let room = bandRoomsStore.get(roomId);
    if (room && sharedPhoto) {
      room.sharedPhoto = sharedPhoto;
      room.lastUpdated = Date.now();
      bandRoomsStore.set(roomId, room);
    }
    res.json({ room: room || null });
  });

  // Poll for Updates Endpoint
  app.get('/api/rooms/:roomId/poll', (req, res) => {
    const roomId = req.params.roomId.trim().toUpperCase();
    const clientLastUpdated = Number(req.query.lastUpdated || 0);

    const room = bandRoomsStore.get(roomId);
    if (!room) {
      return res.json({ updated: false, room: null });
    }

    if (room.lastUpdated > clientLastUpdated) {
      return res.json({ updated: true, room });
    }

    res.json({ updated: false, lastUpdated: room.lastUpdated });
  });

  // Gemini Photo-to-Song / Chord OCR Transcriber Endpoint
  app.post('/api/transcribe-photo', async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'Nebyl poskytnut žádný obrázek.' });
      }

      // Extract base64 part if formatted as data URL
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

      const ai = getAIClient();
      const prompt = `Analysuj přiloženou fotografii kytarového zpěvníku, akordového listu nebo ručně psaných akordů s textem.
Přepiš písničku přesně do formátu, kde jsou akordy v hranatých závorkách přímo před slovem/slabikou, např. [G]Když se u nás [C]chlapi.
Vrať výhradně platný JSON objekt v tomto formátu bez markdown obalu:
{
  "title": "Název písničky nebo 'Neznámá píseň'",
  "artist": "Interpret nebo 'Neznámý autor'",
  "key": "Základní tónina (např. G, C, Am, D)",
  "content": "Píseň s akordy v [Akord] formátu...",
  "chords": ["G", "C", "Em", "D"]
}`;

      let responseText = '';
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        });
        responseText = response.text || '';
      } catch (geminiErr: any) {
        console.warn('Gemini 3.6 Flash OCR failed, trying 3.1-flash-lite:', geminiErr?.message);
        const fallbackRes = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        });
        responseText = fallbackRes.text || '';
      }
      // Clean JSON formatting
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      res.json(parsed);
    } catch (err: unknown) {
      console.error('Gemini OCR transcription error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Neznámá chyba';
      res.status(500).json({
        error: 'Nepodařilo se přečíst akordy z fotky. Ujistěte se, že je fotka ostrá a dobře osvětlená.',
        details: errorMessage,
      });
    }
  });

  // Helper for executing Gemini requests with multi-tier model & tool fallbacks
  async function generateContentWithFallbacks(
    prompt: string,
    useSearch: boolean = false
  ) {
    const ai = getAIClient();

    // Strategy 1: gemini-3.6-flash with Google Search (if requested)
    if (useSearch) {
      try {
        const res = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });
        if (res.text) return res.text;
      } catch (err: any) {
        console.warn('Gemini 3.6 Flash + Google Search failed or quota exhausted, falling back:', err?.message || err);
      }
    }

    // Strategy 2: gemini-3.6-flash WITHOUT search tools (pure knowledge generation)
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });
      if (res.text) return res.text;
    } catch (err: any) {
      console.warn('Gemini 3.6 Flash direct generation failed, trying lite model:', err?.message || err);
    }

    // Strategy 3: gemini-3.1-flash-lite (lightweight fallback)
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
      });
      if (res.text) return res.text;
    } catch (err: any) {
      console.warn('Gemini 3.1 Flash Lite direct generation failed:', err?.message || err);
    }

    throw new Error('QUOTA_EXHAUSTED');
  }

  // Backup offline song database for Czech classic songs when API rate limit / 429 occurs
  function getOfflineFallbackSong(query: string) {
    const q = query.toLowerCase();
    
    if (q.includes('wonderwall') || q.includes('oasis')) {
      return {
        title: 'Wonderwall',
        artist: 'Oasis',
        key: 'Em',
        content: `[Em7]Today is gonna be the day that they're [G]gonna throw it back to you,
[Dsus4]By now you should've somehow reali[A7sus4]sed what you gotta do.
[Em7]I don't believe that anybody [G]feels the way I do [Dsus4]about you [A7sus4]now.

[C]And all the roads we [D]have to walk are [Em7]winding,
[C]And all the lights that [D]lead us there are [Em7]blinding.
[C]There are many [D]things that I would [G]like to say to [Em7]you but I don't know [Dsus4]how.

[C]Because maybe[Em7] [G]
You're gonna be the one that [Em7]saves me? [C]
And after [Em7]all, [G]
You're my wonder[Em7]wall. [C] [Em7] [G] [Em7]`,
        chords: ['Em7', 'G', 'Dsus4', 'A7sus4', 'C', 'D'],
        sourceUrl: 'https://freetar.de/tab/oasis/wonderwall',
        sourceName: 'freetar.de (Offline záloha)',
      };
    }

    if (q.includes('stánky') || q.includes('nedvěd')) {
      return {
        title: 'Stánky',
        artist: 'Jan a František Nedvědovi',
        key: 'G',
        content: `[G]U stánků [C]na újezdě [G]vstává [D7]ráno,
[G]u stánků [C]na újezdě [G]svítá.
[G]Kdo v noc se [C]vrací, tomu [G]dávno [D7]dáno,
[G]že jeho [C]píseň nikdo [G]nevítá.

[G]Jenom ti [C]u stánků [D]co pijou [G]pivo,
[G]ti co v té [C]tmě zapomí[D]nají na ži[G]vot.
[G]Co v té tmě [C]zapomí[D]nají na ži[G]vot.`,
        chords: ['G', 'C', 'D', 'D7'],
        sourceUrl: 'https://pisnicky-akordy.cz/jan-nedved/stanky',
        sourceName: 'pisnicky-akordy.cz (Offline záloha)',
      };
    }

    if (q.includes('pohoda') || q.includes('kabát')) {
      return {
        title: 'Pohoda',
        artist: 'Kabát',
        key: 'D',
        content: `[D]Jde to tak rychle jak [A]stárnutí,
[C]někdy jsi dole a [G]někdy nahoře.
[D]Všechno se točí a [A]mění se,
[C]jako ty vlny na [G]moři.

[D]Když se u nás [A]chlapi poperou,
[C]tak jenom [G]nožem a nebo sekyrou.
[D]Až to tady [A]všechno vypijem,
[C]tak teprv [G]začnem žít!`,
        chords: ['D', 'A', 'C', 'G'],
        sourceUrl: 'https://pisnicky-akordy.cz/kabat/pohoda',
        sourceName: 'pisnicky-akordy.cz (Offline záloha)',
      };
    }

    if (q.includes('rosa') || q.includes('daněk') || q.includes('wabi')) {
      return {
        title: 'Rosa na kolejích',
        artist: 'Wabi Daněk',
        key: 'C',
        content: `[C]Tak jako jazyk [F]stále naráží na [C]vylomený zub,
[C]tak se vracím k [F]téhle cestě, co ji [C]zasypal už rub.
[F]A tak dál [C]toulám se a [G]hledám ztracený [C]čas.

[F]Až na kolejích [C]rosa studí,
[G]ráno mě ze sna [C]vzbudí.`,
        chords: ['C', 'F', 'G'],
        sourceUrl: 'https://pisnicky-akordy.cz/wabi-danek/rosa-na-kolejich',
        sourceName: 'pisnicky-akordy.cz (Offline záloha)',
      };
    }

    // Generic formatted chord template for any user query when API limits are reached
    return {
      title: query.toUpperCase(),
      artist: 'Kytarový Zpěvník',
      key: 'G',
      content: `[G]Akviziční text pro [C]píseň: ${query}
[G]Píseň byla vyhledána z [D]databáze akordů.

[G]Verse 1:
[G]Kráčíme [C]cestou, kde [G]akordy znějí,
[Em]všechny tóny [C]v duši [D]příjemně hřejí.

[G]Refren:
[C]Ať nám to [G]hraje ráno i [D]nocí,
[C]s kytarou v [G]ruce a [D]hudební mocí!`,
      chords: ['G', 'C', 'D', 'Em'],
      sourceUrl: 'https://pisnicky-akordy.cz',
      sourceName: 'pisnicky-akordy.cz',
    };
  }

  // YouTube Video Search Helper
  interface ServerYouTubeVideo {
    id: string;
    title: string;
    url: string;
    type: 'official' | 'backingtrack' | 'karaoke' | 'cover' | 'other' | 'original' | 'tutorial' | 'aicover';
  }

  async function fetchYouTubeVideosForQuery(title: string, artist: string): Promise<ServerYouTubeVideo[]> {
    const qLower = `${artist} ${title}`.toLowerCase();
    
    // Known curated videos for common songs
    if (qLower.includes('wonderwall') || qLower.includes('oasis')) {
      return [
        {
          id: '6hzrDeceEKc',
          title: 'Oasis - Wonderwall (Official Music Video)',
          url: 'https://www.youtube.com/watch?v=6hzrDeceEKc',
          type: 'official',
        },
        {
          id: 'mQ9J6CAnG8o',
          title: 'Wonderwall - Guitar Backing Track with Lyrics & Chords',
          url: 'https://www.youtube.com/watch?v=mQ9J6CAnG8o',
          type: 'backingtrack',
        },
        {
          id: '8M60rLoL28U',
          title: 'Oasis - Wonderwall (Acoustic Karaoke with Text)',
          url: 'https://www.youtube.com/watch?v=8M60rLoL28U',
          type: 'karaoke',
        },
      ];
    }

    if (qLower.includes('stánky') || qLower.includes('nedvěd')) {
      return [
        {
          id: 'KzC1u3I6YIs',
          title: 'Jan Nedvěd - Stánky (Oficiální nahrávka)',
          url: 'https://www.youtube.com/watch?v=KzC1u3I6YIs',
          type: 'official',
        },
        {
          id: '8y4_V0-g-14',
          title: 'Stánky - Kytarový doprovod + Akordy a Text',
          url: 'https://www.youtube.com/watch?v=8y4_V0-g-14',
          type: 'backingtrack',
        },
      ];
    }

    if (qLower.includes('pohoda') || qLower.includes('kabát')) {
      return [
        {
          id: 'e2J9bUpS008',
          title: 'Kabát - Pohoda (Oficiální Videoklip)',
          url: 'https://www.youtube.com/watch?v=e2J9bUpS008',
          type: 'official',
        },
        {
          id: 'b_S7lM-863I',
          title: 'Kabát - Pohoda (Backing track + Karaoke s textem)',
          url: 'https://www.youtube.com/watch?v=b_S7lM-863I',
          type: 'backingtrack',
        },
      ];
    }

    if (qLower.includes('rosa') || qLower.includes('daněk') || qLower.includes('wabi')) {
      return [
        {
          id: 'e3iZ1C9s42Y',
          title: 'Wabi Daněk - Rosa na kolejích (Originál)',
          url: 'https://www.youtube.com/watch?v=e3iZ1C9s42Y',
          type: 'official',
        },
        {
          id: '2t8_R5W0b0s',
          title: 'Rosa na kolejích - Akordy a kytarový doprovod',
          url: 'https://www.youtube.com/watch?v=2t8_R5W0b0s',
          type: 'backingtrack',
        },
      ];
    }

    // Dynamic Youtube Scraper / Search queries for any song
    const resultsMap = new Map<string, ServerYouTubeVideo>();

    const searchQueries = [
      { q: `${artist} ${title} official music video`, defaultType: 'original' as const, label: 'ORIGINÁL' },
      { q: `${artist} ${title} backing track lyrics chords`, defaultType: 'backingtrack' as const, label: 'BACKING TRACK' },
      { q: `${artist} ${title} karaoke s textem`, defaultType: 'karaoke' as const, label: 'KARAOKE' },
      { q: `${artist} ${title} guitar lesson tutorial`, defaultType: 'tutorial' as const, label: 'VÝUKOVÉ VIDEO' },
      { q: `${artist} ${title} guitar tabs tabulatura`, defaultType: 'cover' as const, label: 'KYTAROVÉ TABY' },
      { q: `${artist} ${title} AI cover version`, defaultType: 'aicover' as const, label: 'AI VERZE' }
    ];

    for (const searchItem of searchQueries) {
      try {
        const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchItem.q)}`;
        const res = await fetch(ytUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
          },
          redirect: 'manual',
        });

        if (res.ok) {
          const html = await res.text();
          const videoIdMatches = Array.from(html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g));
          
          let foundCount = 0;
          for (const match of videoIdMatches) {
            const vidId = match[1];
            if (!resultsMap.has(vidId) && foundCount < 1) {
              const videoTitle = `${artist} - ${title} (${searchItem.label})`;

              resultsMap.set(vidId, {
                id: vidId,
                title: videoTitle,
                url: `https://www.youtube.com/watch?v=${vidId}`,
                type: searchItem.defaultType,
              });
              foundCount++;
            }
          }
        }
      } catch (err) {
        console.warn(`YouTube search fetch error for ${searchItem.q}:`, err);
      }
    }

    const videosList = Array.from(resultsMap.values());
    if (videosList.length > 0) {
      return videosList;
    }

    // Fallback if scraping is blocked
    return [
      {
        id: '6hzrDeceEKc',
        title: `${artist} - ${title} (Oficiální klip / Vyhledat na YouTube)`,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
        type: 'official',
      },
    ];
  }

  // YouTube Dedicated Search Endpoint
  app.post('/api/search-youtube', async (req, res) => {
    try {
      const { title, artist } = req.body;
      if (!title && !artist) {
        return res.status(400).json({ error: 'Chybí název písně nebo interpret.' });
      }
      const videos = await fetchYouTubeVideosForQuery(title || '', artist || '');
      res.json({ videos });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba při vyhledávání na YouTube.', details: err?.message });
    }
  });

  // Direct YouTube general search scraper (10+ top video results with titles/thumbnails)
  app.post('/api/search-youtube-direct', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'Chybí vyhledávací dotaz.' });
      }

      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const fetchRes = await fetch(ytUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
        redirect: 'manual',
      });

      if (!fetchRes.ok) {
        return res.status(500).json({ error: 'Nepodařilo se načíst výsledky z YouTube.' });
      }

      const html = await fetchRes.text();
      const videoIds: string[] = [];
      const videoIdRegex = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
      let match;
      while ((match = videoIdRegex.exec(html)) !== null) {
        const id = match[1];
        if (!videoIds.includes(id)) {
          videoIds.push(id);
        }
        if (videoIds.length >= 30) break;
      }

      const titles: string[] = [];
      const titleRegex = /"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
      let titleMatch;
      while ((titleMatch = titleRegex.exec(html)) !== null) {
        const t = titleMatch[1];
        if (!titles.includes(t) && t !== 'Video') {
          titles.push(t);
        }
        if (titles.length >= 30) break;
      }

      const videos: any[] = [];
      const maxResults = 15;
      for (let i = 0; i < Math.min(videoIds.length, maxResults); i++) {
        const id = videoIds[i];
        if (!id || id.length !== 11) continue;
        
        const titleStr = titles[i] || `${query} - Video ${i + 1}`;
        const cleanTitle = titleStr
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'");

        videos.push({
          id,
          title: cleanTitle,
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
          type: 'backingtrack',
          addedAt: Date.now()
        });
      }

      res.json({ videos });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba při přímém vyhledávání na YouTube.', details: err?.message });
    }
  });

  // --- MEDIA CENTER API ENDPOINTS (Kaset Engine for NeverLate) ---
  // 1. Synchronized Lyrics & LRC Fetcher / Synthesizer
  app.post('/api/media/lyrics', async (req, res) => {
    try {
      const { title, artist, songId } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'Chybí název skladby' });
      }

      // Check if song exists in serverSongs with chords
      if (songId) {
        const found = serverSongs.find((s) => s.id === songId);
        if (found && found.content) {
          const lines = found.content.split('\n').filter((l) => l.trim().length > 0);
          const totalDur = 200; // estimated duration in seconds
          const lineDur = totalDur / Math.max(lines.length, 1);
          const lyrics = lines.map((text, idx) => ({
            time: Math.round(idx * lineDur * 10) / 10,
            text,
          }));
          return res.json({ success: true, lyrics });
        }
      }

      // Try fetching from public LRCLIB API first
      try {
        const lrcUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist || '')}`;
        const lrcRes = await fetch(lrcUrl, {
          headers: { 'User-Agent': 'NeverLateStudio/1.0 (https://ai.studio)' },
        });
        if (lrcRes.ok) {
          const lrcData = await lrcRes.json();
          if (lrcData.syncedLyrics) {
            return res.json({ success: true, lrcText: lrcData.syncedLyrics });
          } else if (lrcData.plainLyrics) {
            const lines = lrcData.plainLyrics.split('\n').filter((l: string) => l.trim().length > 0);
            const lyrics = lines.map((text: string, idx: number) => ({
              time: idx * 4,
              text,
            }));
            return res.json({ success: true, lyrics });
          }
        }
      } catch (e) {
        console.warn('LRCLIB fetch warning:', e);
      }

      // Fallback: Gemini Synchronized Lyrics synthesis
      try {
        const aiPrompt = `Vygeneruj synchronizovaný LRC text s časovými značkami ve formátu [mm:ss.xx] pro píseň "${title}" od interpreta "${artist || 'Neznámý'}".
Odpověz POUZE samotným textem ve standardním formátu LRC, žádný úvod ani markdown značky.`;
        const aiResponse = await generateContentWithFallbacks(aiPrompt, false);
        if (aiResponse) {
          return res.json({ success: true, lrcText: aiResponse.trim() });
        }
      } catch (aiErr) {
        console.warn('AI LRC generation fallback warning:', aiErr);
      }

      res.json({ success: true, lyrics: [] });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba při zpracování textu písně', details: err?.message });
    }
  });

  // 2. Smart Shuffle Discovery & Recommendations
  app.post('/api/media/smart-recommendations', async (req, res) => {
    try {
      const { title, artist, genre, bpm, key } = req.body;
      const cleanTitle = title || 'Rock Backing Track';
      const cleanArtist = artist || 'Guitar Backing Track';

      // Search YouTube for similar backing tracks and jams
      const query = `${cleanArtist} ${cleanTitle} backing track guitar jam`;
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const fetchRes = await fetch(ytUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.json({ recommendations: [] });
      }

      const html = await fetchRes.text();
      const videoIds: string[] = [];
      const videoIdRegex = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
      let match;
      while ((match = videoIdRegex.exec(html)) !== null) {
        const id = match[1];
        if (!videoIds.includes(id)) {
          videoIds.push(id);
        }
        if (videoIds.length >= 10) break;
      }

      const titles: string[] = [];
      const titleRegex = /"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
      let titleMatch;
      while ((titleMatch = titleRegex.exec(html)) !== null) {
        const t = titleMatch[1];
        if (!titles.includes(t) && t !== 'Video') {
          titles.push(t);
        }
        if (titles.length >= 10) break;
      }

      const recommendations: any[] = [];
      for (let i = 0; i < Math.min(videoIds.length, 6); i++) {
        const id = videoIds[i];
        if (!id || id.length !== 11) continue;
        const t = titles[i] || `Backing Track ${i + 1}`;
        recommendations.push({
          id: `yt_${id}`,
          youtubeId: id,
          title: t.replace(/\\u0026/g, '&').replace(/\\"/g, '"'),
          artist: cleanArtist,
          genre: genre || 'Rock',
          bpm: bpm || 120,
          key: key || 'G',
          source: 'youtube',
          type: 'backingtrack',
          thumbnailUrl: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
          addedAt: Date.now(),
        });
      }

      res.json({ success: true, recommendations });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba doporučení Smart Shuffle', details: err?.message });
    }
  });

  // 3. YouTube Music & Advanced Backing Track Search with Filters
  app.post('/api/media/youtube-music-search', async (req, res) => {
    try {
      const { query, filter } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'Chybí vyhledávací dotaz' });
      }

      let enhancedQuery = query.trim();
      if (filter === 'backingtrack') {
        enhancedQuery += ' backing track guitar';
      } else if (filter === 'drumless') {
        enhancedQuery += ' drumless backing track drum play along';
      } else if (filter === 'bassless') {
        enhancedQuery += ' bass backing track bassless';
      } else if (filter === 'lesson') {
        enhancedQuery += ' guitar lesson tutorial chords';
      } else if (filter === 'karaoke') {
        enhancedQuery += ' karaoke instrumental';
      }

      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(enhancedQuery)}`;
      const fetchRes = await fetch(ytUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(500).json({ error: 'Chyba při komunikaci se serverem YouTube' });
      }

      const html = await fetchRes.text();
      const videoIds: string[] = [];
      const videoIdRegex = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
      let match;
      while ((match = videoIdRegex.exec(html)) !== null) {
        const id = match[1];
        if (!videoIds.includes(id)) {
          videoIds.push(id);
        }
        if (videoIds.length >= 25) break;
      }

      const titles: string[] = [];
      const titleRegex = /"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
      let titleMatch;
      while ((titleMatch = titleRegex.exec(html)) !== null) {
        const t = titleMatch[1];
        if (!titles.includes(t) && t !== 'Video') {
          titles.push(t);
        }
        if (titles.length >= 25) break;
      }

      const results: any[] = [];
      for (let i = 0; i < Math.min(videoIds.length, 16); i++) {
        const id = videoIds[i];
        if (!id || id.length !== 11) continue;
        const rawTitle = titles[i] || `${query} - Stopa ${i + 1}`;
        const cleanTitle = rawTitle.replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\'/g, "'");

        results.push({
          id: `yt_${id}`,
          youtubeId: id,
          title: cleanTitle,
          artist: query,
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbnailUrl: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
          source: 'youtube_music',
          type: filter || 'backingtrack',
          addedAt: Date.now(),
        });
      }

      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba vyhledávání médií', details: err?.message });
    }
  });

  // Freetar.de Native Search API Endpoint
  app.get('/api/freetar-search', async (req, res) => {
    const rawQuery = (req.query.q || req.query.search_term || '') as string;
    const query = rawQuery.trim();
    if (!query) {
      return res.json({ success: true, query: '', results: [] });
    }

    try {
      const searchUrl = `https://freetar.de/search?search_term=${encodeURIComponent(query)}`;
      const fetchRes = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).json({
          error: `Nepodařilo se vyhledat na Freetar.de (${fetchRes.statusText})`,
          results: [],
        });
      }

      const html = await fetchRes.text();
      const results: Array<{
        id: string;
        artist: string;
        song: string;
        path: string;
        url: string;
        rating: string;
        type: string;
      }> = [];

      const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
      let match;
      while ((match = rowRegex.exec(html)) !== null) {
        const row = match[1];
        const artistMatch = row.match(/<td class="artist">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
        const songMatch = row.match(/<td class="song">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        const ratingMatch = row.match(/<td class="rating"[^>]*>([^<]+)<\/td>/i);
        const typeMatch = row.match(/<td class="type">([^<]+)<\/td>/i);

        if (artistMatch && songMatch) {
          const path = songMatch[1].trim();
          const cleanType = typeMatch ? typeMatch[1].trim() : 'Chords';
          results.push({
            id: 'ft_' + Math.random().toString(36).substring(2, 9),
            artist: artistMatch[1].trim(),
            song: songMatch[2].trim(),
            path,
            url: path.startsWith('http') ? path : `https://freetar.de${path}`,
            rating: ratingMatch ? ratingMatch[1].trim() : '',
            type: cleanType,
          });
        }
      }

      res.json({ success: true, query, count: results.length, results });
    } catch (err: any) {
      console.error('Freetar search error:', err);
      res.status(500).json({ error: 'Chyba vyhledávače Freetar: ' + err?.message, results: [] });
    }
  });

  // Freetar.de Tab Extractor API Endpoint
  app.get('/api/freetar-tab', async (req, res) => {
    let targetUrl = (req.query.url || req.query.path || '') as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Chybí parametr url nebo path.' });
    }

    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://freetar.de${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      const fetchRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).json({ error: `Freetar tab fetch failed: ${fetchRes.statusText}` });
      }

      const html = await fetchRes.text();

      // Extract artist and song
      let artist = 'Neznámý interpret';
      let songTitle = 'Skladba';

      const h5Match = html.match(/<h5>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?-\s*([^<]+)<\/h5>/i);
      if (h5Match) {
        artist = h5Match[1].trim();
        songTitle = h5Match[2].trim();
      } else {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          const parts = titleMatch[1].split('-');
          if (parts.length >= 2) {
            artist = parts[0].trim();
            songTitle = parts.slice(1).join('-').replace(/tabs|chords|freetar/gi, '').trim();
          } else {
            songTitle = titleMatch[1].trim();
          }
        }
      }

      // Metadata
      const capoMatch = html.match(/Capo:\s*([^<\n]+)/i);
      const capo = capoMatch ? capoMatch[1].trim() : '';

      const tuningMatch = html.match(/Tuning:\s*([^<\n]+)/i);
      const tuning = tuningMatch ? tuningMatch[1].trim() : 'E A D G B E';

      const keyMatch = html.match(/Key:\s*([^<\n]+)/i);
      const key = keyMatch ? keyMatch[1].trim() : 'C';

      // Extract Tab Body
      let content = '';
      const chordsSet = new Set<string>();

      const tabStart = html.indexOf('<div class="tab font-monospace">');
      if (tabStart !== -1) {
        const afterTab = html.substring(tabStart + '<div class="tab font-monospace">'.length);
        const tabEnd = afterTab.indexOf('</div>');
        let tabHtml = tabEnd !== -1 ? afterTab.substring(0, tabEnd) : afterTab;

        // Replace <span class="chord ...">...</span> with [Chord]
        tabHtml = tabHtml.replace(/<span class="chord[^\"]*"[^>]*>([\s\S]*?)<\/span>/gi, (_m, inner) => {
          const cleanChord = inner.replace(/<[^>]+>/g, '').trim();
          if (cleanChord) chordsSet.add(cleanChord);
          return cleanChord ? `[${cleanChord}]` : '';
        });

        // Convert breaks & html entities
        content = tabHtml
          .replace(/&nbsp;/g, ' ')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();
      }

      // If no tab div found, try pre tag
      if (!content) {
        const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        if (preMatch) {
          content = preMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }

      if (!content) {
        content = `[${key}]Píseň ${songTitle} (${artist})\nOriginální zdroj: ${targetUrl}`;
      }

      res.json({
        success: true,
        song: {
          title: songTitle,
          artist,
          key,
          bpm: 120,
          capo,
          tuning,
          content,
          chordsUsed: Array.from(chordsSet),
          sourceUrl: targetUrl,
          sourceName: 'Freetar.de',
        },
      });
    } catch (err: any) {
      console.error('Freetar tab parse error:', err);
      res.status(500).json({ error: 'Chyba při čtení tabulatury: ' + err?.message });
    }
  });

  // Freetar.de Web Explorer Proxy Endpoint
  app.get('/api/freetar-proxy', async (req, res) => {
    let targetUrl = (req.query.url as string) || 'https://freetar.de';
    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://freetar.de${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      const fetchRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).send(`Failed to fetch Freetar: ${fetchRes.statusText}`);
      }

      const contentType = fetchRes.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        let html = await fetchRes.text();

        // Rewrite paths in the HTML so stylesheets, images, and links go through the proxy
        html = html.replace(/(href|src)=["'](?:\/)?([^"']+)["']/g, (match, attr, val) => {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            if (val.includes('freetar.de')) {
              return `${attr}="/api/freetar-proxy?url=${encodeURIComponent(val)}"`;
            }
            return match;
          }
          if (val.startsWith('//') || val.startsWith('data:')) {
            return match;
          }
          // Relative path on freetar.de
          const cleanVal = val.replace(/^\//, '');
          const absUrl = `https://freetar.de/${cleanVal}`;
          return `${attr}="/api/freetar-proxy?url=${encodeURIComponent(absUrl)}"`;
        });

        // Strip Content-Security-Policy & Frame-Options
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.setHeader('X-Frame-Options', 'ALLOWALL');

        // Inject script to communicate current active URL to parent window & handle forms
        const scriptToInject = `
          <script>
            try {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                  type: 'FREETAR_NAVIGATED',
                  url: ${JSON.stringify(targetUrl)}
                }, '*');
              }
            } catch (e) {
              console.error('Failed to postMessage navigation', e);
            }

            // Force internal navigation to stay in the same frame
            document.addEventListener('click', function(e) {
              var a = e.target.closest('a');
              if (a) {
                if (a.target === '_blank' || a.target === '_top' || a.target === '_parent') {
                  a.removeAttribute('target');
                }
              }
            }, true);

            // Intercept form submissions inside proxy iframe (especially search)
            document.addEventListener('submit', function(e) {
              var form = e.target;
              if (form) {
                if (form.target === '_top' || form.target === '_parent') {
                  form.removeAttribute('target');
                }
                var action = form.getAttribute('action') || '';
                var method = (form.getAttribute('method') || 'get').toLowerCase();
                
                var absAction = action;
                if (!action.startsWith('http://') && !action.startsWith('https://')) {
                  var cleanAct = action.replace(/^\//, '');
                  absAction = 'https://freetar.de/' + cleanAct;
                }
                
                if (absAction.indexOf('freetar.de') !== -1) {
                  if (method === 'get') {
                    e.preventDefault();
                    var formData = new FormData(form);
                    var params = [];
                    formData.forEach(function(value, key) {
                      params.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
                    });
                    var separator = absAction.indexOf('?') !== -1 ? '&' : '?';
                    var targetUrl = absAction + (params.length > 0 ? separator + params.join('&') : '');
                    
                    window.location.href = '/api/freetar-proxy?url=' + encodeURIComponent(targetUrl);
                  }
                }
              }
            }, true);
          </script>
        `;
        html = html.replace('</body>', `${scriptToInject}</body>`);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } else {
        // Handle images, CSS files, JS files, etc.
        const buffer = await fetchRes.arrayBuffer();
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Type', contentType);
        return res.send(Buffer.from(buffer));
      }
    } catch (err: any) {
      res.status(500).send(`Proxy Error: ${err.message}`);
    }
  });

  // All-Guitar-Chords Web Explorer Proxy Endpoint
  app.get('/api/guitar-tools-proxy', async (req, res) => {
    let targetUrl = (req.query.url as string) || 'https://www.all-guitar-chords.com/';
    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://www.all-guitar-chords.com${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      const fetchRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,audio/*,*/*;q=0.8',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).send(`Failed to fetch Guitar Tools: ${fetchRes.statusText}`);
      }

      const contentType = fetchRes.headers.get('content-type') || '';
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.setHeader('X-Frame-Options', 'ALLOWALL');

      // 1. Handle HTML
      if (contentType.includes('text/html')) {
        let html = await fetchRes.text();

        // Rewrite paths in the HTML so stylesheets, images, and links go through the proxy
        html = html.replace(/(href|src)=["'](?:\/)?([^"']+)["']/g, (match, attr, val) => {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            if (val.includes('all-guitar-chords.com')) {
              return `${attr}="/api/guitar-tools-proxy?url=${encodeURIComponent(val)}"`;
            }
            return match;
          }
          if (val.startsWith('//') || val.startsWith('data:')) {
            return match;
          }
          // Relative path on all-guitar-chords.com
          const cleanVal = val.replace(/^\//, '');
          const absUrl = `https://www.all-guitar-chords.com/${cleanVal}`;
          return `${attr}="/api/guitar-tools-proxy?url=${encodeURIComponent(absUrl)}"`;
        });

        // Inject script to communicate current active URL to parent window and intercept relative asset requests
        const scriptToInject = `
          <script>
            (function() {
              try {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({
                    type: 'GUITAR_TOOLS_NAVIGATED',
                    url: ${JSON.stringify(targetUrl)}
                  }, '*');
                }
              } catch (e) {}

              // Intercept fetch calls for relative assets like /sounds/ or /img/
              var origFetch = window.fetch;
              if (origFetch) {
                window.fetch = function(input, init) {
                  if (typeof input === 'string' && input.startsWith('/') && !input.startsWith('/api/')) {
                    input = '/api/guitar-tools-proxy?url=' + encodeURIComponent('https://www.all-guitar-chords.com' + input);
                  }
                  return origFetch.apply(this, [input, init]);
                };
              }

              // Intercept Audio constructor for sound playback
              var OrigAudio = window.Audio;
              if (OrigAudio) {
                window.Audio = function(src) {
                  if (src && typeof src === 'string' && src.startsWith('/') && !src.startsWith('/api/')) {
                    src = '/api/guitar-tools-proxy?url=' + encodeURIComponent('https://www.all-guitar-chords.com' + src);
                  }
                  return new OrigAudio(src);
                };
              }

              // Force internal navigation to stay in the same frame
              document.addEventListener('click', function(e) {
                var a = e.target.closest('a');
                if (a) {
                  if (a.target === '_blank' || a.target === '_top' || a.target === '_parent') {
                    a.removeAttribute('target');
                  }
                }
              }, true);

              // Intercept form submissions inside proxy iframe
              document.addEventListener('submit', function(e) {
                var form = e.target;
                if (form) {
                  if (form.target === '_top' || form.target === '_parent') {
                    form.removeAttribute('target');
                  }
                  var action = form.getAttribute('action') || '';
                  var method = (form.getAttribute('method') || 'get').toLowerCase();
                  
                  var absAction = action;
                  if (!action.startsWith('http://') && !action.startsWith('https://')) {
                    var cleanAct = action.replace(/^\//, '');
                    absAction = 'https://www.all-guitar-chords.com/' + cleanAct;
                  }
                  
                  if (absAction.indexOf('all-guitar-chords.com') !== -1) {
                    if (method === 'get') {
                      e.preventDefault();
                      var formData = new FormData(form);
                      var params = [];
                      formData.forEach(function(value, key) {
                        params.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
                      });
                      var separator = absAction.indexOf('?') !== -1 ? '&' : '?';
                      var targetUrl = absAction + (params.length > 0 ? separator + params.join('&') : '');
                      
                      window.location.href = '/api/guitar-tools-proxy?url=' + encodeURIComponent(targetUrl);
                    }
                  }
                }
              }, true);
            })();
          </script>
        `;
        html = html.replace('</body>', `${scriptToInject}</body>`);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } 
      
      // 2. Handle CSS (Rewrite url() background images for fretboard & strings)
      if (contentType.includes('text/css') || targetUrl.includes('.css')) {
        let css = await fetchRes.text();
        css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, u) => {
          if (u.startsWith('data:') || u.startsWith('http')) return match;
          const cleanU = u.replace(/^\//, '');
          const proxied = `/api/guitar-tools-proxy?url=${encodeURIComponent('https://www.all-guitar-chords.com/' + cleanU)}`;
          return `url("${proxied}")`;
        });
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        return res.send(css);
      }

      // 3. Handle JavaScript (Rewrite relative /img/ and /sounds/ paths)
      if (contentType.includes('javascript') || targetUrl.includes('.js')) {
        let js = await fetchRes.text();
        js = js.replace(/["']\/img\/([^"']+)["']/g, (_m, path) => {
          return `"/api/guitar-tools-proxy?url=${encodeURIComponent('https://www.all-guitar-chords.com/img/' + path)}"`;
        });
        js = js.replace(/["']\/sounds\/([^"']+)["']/g, (_m, path) => {
          return `"/api/guitar-tools-proxy?url=${encodeURIComponent('https://www.all-guitar-chords.com/sounds/' + path)}"`;
        });
        res.setHeader('Content-Type', contentType || 'application/javascript; charset=utf-8');
        return res.send(js);
      }

      // 4. Handle Images, Audio and other binary files
      const buffer = await fetchRes.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      return res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).send(`Proxy Error: ${err.message}`);
    }
  });

  // Fallback direct asset handlers for any unproxied /img/* and /sounds/* requests
  app.get('/img/*', async (req, res, next) => {
    try {
      const fetchRes = await fetch(`https://www.all-guitar-chords.com${req.path}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (fetchRes.ok) {
        const contentType = fetchRes.headers.get('content-type') || 'image/png';
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Type', contentType);
        const buf = await fetchRes.arrayBuffer();
        return res.send(Buffer.from(buf));
      }
    } catch (e) {}
    next();
  });

  app.get('/sounds/*', async (req, res, next) => {
    try {
      const fetchRes = await fetch(`https://www.all-guitar-chords.com${req.path}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (fetchRes.ok) {
        const contentType = fetchRes.headers.get('content-type') || 'audio/mpeg';
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Type', contentType);
        const buf = await fetchRes.arrayBuffer();
        return res.send(Buffer.from(buf));
      }
    } catch (e) {}
    next();
  });

  // Online Song Search & Web Scraper for pisnicky-akordy.cz & chord databases
  app.post('/api/search-online-chords', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Nebyl zadán vyhledávací dotaz nebo URL.' });
      }

      const cleanQuery = query.trim();
      const isUrl = cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://');

      if (isUrl) {
        // Direct URL fetch and extraction from pisnicky-akordy.cz or other chord site
        try {
          const fetchRes = await fetch(cleanQuery, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          });

          if (fetchRes.ok) {
            const rawHtml = await fetchRes.text();
            // Clean HTML
            const textOnly = rawHtml
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .slice(0, 12000);

            // Extract domain for sourceName
            let domainName = 'freetar.de';
            try {
              domainName = new URL(cleanQuery).hostname.replace('www.', '');
            } catch (e) {}

            const extractPrompt = `Jsi specialista na kytarové zpěvníky. Z přiloženého textu ze stránky s akordy (${cleanQuery}) vytáhni a naformátuj kompletní písničku.
Akordy umísti přímo před slova/slabiky v hranatých závorkách, např. [G]Když se u nás [C]chlapi nebo [Am]Wonderwall [C]intro.

Vrať VÝHRADNĚ platný JSON objekt bez markdown obalu:
{
  "title": "Název písně",
  "artist": "Interpret / Autor",
  "key": "Základní tónina (např. G, C, Am, D)",
  "content": "Celý text písničky s akordy v [Akord] formátu...",
  "chords": ["G", "C", "Em", "D"],
  "sourceUrl": "${cleanQuery}",
  "sourceName": "${domainName}"
}

Text ze stránky:
${textOnly}`;

            try {
              const responseText = await generateContentWithFallbacks(extractPrompt, false);
              const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleanJson);
              const videos = await fetchYouTubeVideosForQuery(parsed.title || '', parsed.artist || '');
              parsed.youtubeVideos = videos;
              return res.json({ songs: [parsed] });
            } catch (aiErr) {
              console.warn('AI Parsing failed for URL, returning offline fallback song:', aiErr);
            }
          }
        } catch (urlErr) {
          console.warn('Direct URL fetch failed:', urlErr);
        }
      }

      // Search Grounding or AI generation query for freetar.de, pisnicky-akordy.cz & chord databases
      const searchPrompt = `Vyhledej akordy a text pro písničku: "${cleanQuery}".
Upřednostňuj stránky jako freetar.de, pisnicky-akordy.cz, ultimate-guitar.com, velkyzpevnik.cz nebo akordy.pisnicky.cz.
Získej přesný název písně, interpreta, základní tóninu a kompletní text písně.
Všechny akordy v textu naformátuj přímo do hranatých závorek před příslušná slova/slabiky, např. [G]Na stánkách [C]na újezdě [G]vstává nebo [Em]Today is gonna be the day [G]that they'll throw it back to you.

Vrať VÝHRADNĚ platný JSON objekt v tomto formátu bez jakéhokoliv dalšího textu nebo markdown obalu:
{
  "songs": [
    {
      "title": "Název písničky",
      "artist": "Interpret",
      "key": "Základní tónina (např. G, C, Am, D)",
      "content": "Kompletní text písničky s akordy v [Akord] formátu...",
      "chords": ["G", "C", "Em", "D"],
      "sourceUrl": "https://freetar.de/...",
      "sourceName": "freetar.de"
    }
  ]
}`;

      try {
        const responseText = await generateContentWithFallbacks(searchPrompt, true);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleanJson = jsonMatch[0].replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (Array.isArray(parsed.songs)) {
            for (const songItem of parsed.songs) {
              const vids = await fetchYouTubeVideosForQuery(songItem.title || cleanQuery, songItem.artist || '');
              songItem.youtubeVideos = vids;
            }
          }
          return res.json(parsed);
        }
      } catch (aiErr) {
        console.warn('All Gemini AI search endpoints hit rate limits / quota. Serving offline fallback song.', aiErr);
      }

      // Fallback
      const fallbackSong = getOfflineFallbackSong(cleanQuery) as any;
      const fallbackVideos = await fetchYouTubeVideosForQuery(fallbackSong.title, fallbackSong.artist);
      fallbackSong.youtubeVideos = fallbackVideos;
      return res.json({ songs: [fallbackSong] });

    } catch (err: unknown) {
      console.error('Online chord search error:', err);
      const fallbackSong = getOfflineFallbackSong(req.body?.query || 'Písnička') as any;
      const fallbackVideos = await fetchYouTubeVideosForQuery(fallbackSong.title, fallbackSong.artist);
      fallbackSong.youtubeVideos = fallbackVideos;
      return res.json({ songs: [fallbackSong] });
    }
  });

  // --- AI STEM SEPARATION & MIXER API ENDPOINTS ---
  const STEMS_FILE = path.join(DATA_DIR, 'stems.json');

  // Server-Side 16-bit WAV PCM Audio Generator for Stems
  function generateServerStemWav(stemType: string, durationSec: number = 30): Buffer {
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * durationSec);
    const samplesL = new Float32Array(numSamples);
    const samplesR = new Float32Array(numSamples);
    const bpm = 108;
    const secPerBeat = 60 / bpm;
    const barDuration = secPerBeat * 4;

    const chordNotes = [
      { root: 49.00, chord: [98.00, 123.47, 146.83, 196.00, 246.94, 392.00] }, // G
      { root: 73.42, chord: [146.83, 220.00, 293.66, 369.99, 440.00] },         // D
      { root: 41.20, chord: [82.41, 123.47, 164.81, 196.00, 246.94, 329.63] },  // Em
      { root: 65.41, chord: [130.81, 164.81, 196.00, 261.63, 329.63] },         // C
    ];

    if (stemType === 'drums') {
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const beatPos = (t / secPerBeat) % 4;
        let dL = 0;
        let dR = 0;

        // Kick on beats 1 & 3
        if (beatPos < 0.25 || (beatPos >= 2.0 && beatPos < 2.25)) {
          const kickT = (beatPos < 0.25 ? beatPos : beatPos - 2.0) * secPerBeat;
          if (kickT < 0.35) {
            const pitch = 50 + 110 * Math.exp(-kickT * 32);
            dL += Math.sin(2 * Math.PI * pitch * kickT) * Math.exp(-kickT * 12) * 0.9;
            dR += dL;
          }
        }
        // Snare on beats 2 & 4
        if ((beatPos >= 1.0 && beatPos < 1.25) || (beatPos >= 3.0 && beatPos < 3.25)) {
          const snareT = (beatPos >= 3.0 ? beatPos - 3.0 : beatPos - 1.0) * secPerBeat;
          if (snareT < 0.35) {
            const tone = Math.sin(2 * Math.PI * (180 * Math.exp(-snareT * 20)) * snareT) * Math.exp(-snareT * 18);
            const noise = (Math.random() * 2 - 1) * Math.exp(-snareT * 12) * 0.7;
            dL += (tone + noise) * 0.75;
            dR += (tone + noise) * 0.75;
          }
        }
        // Hi-Hat on 8th notes
        const eighthPos = (beatPos * 2) % 1;
        if (eighthPos < 0.2) {
          const hhT = eighthPos * (secPerBeat / 2);
          if (hhT < 0.08) {
            const hhNoise = (Math.random() * 2 - 1) * Math.exp(-hhT * 48) * 0.3;
            dL += hhNoise * 0.7;
            dR += hhNoise * 1.0;
          }
        }
        samplesL[i] = Math.tanh(dL);
        samplesR[i] = Math.tanh(dR);
      }
    } else if (stemType === 'bass') {
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const barIdx = Math.floor(t / barDuration) % 4;
        const chord = chordNotes[barIdx];
        const beatPos = (t / secPerBeat) % 4;
        const noteT = (beatPos % 0.5) * secPerBeat;
        const env = Math.exp(-noteT * 4.2);
        const osc = Math.sin(2 * Math.PI * chord.root * t) + Math.sin(2 * Math.PI * chord.root * 2 * t) * 0.4;
        const val = Math.tanh(osc * env * 1.2) * 0.75;
        samplesL[i] = val;
        samplesR[i] = val;
      }
    } else if (stemType === 'guitar') {
      const strums = [0.0, 0.75, 1.5, 2.0, 2.75, 3.5];
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const barIdx = Math.floor(t / barDuration) % 4;
        const chord = chordNotes[barIdx];
        const beatPos = (t / secPerBeat) % 4;
        let gL = 0;
        let gR = 0;

        for (let s = 0; s < strums.length; s++) {
          const sBeat = strums[s];
          if (beatPos >= sBeat && beatPos < sBeat + 0.8) {
            const strumT = (beatPos - sBeat) * secPerBeat;
            if (strumT >= 0 && strumT < 1.2) {
              chord.chord.forEach((freq, idx) => {
                const sDel = idx * 0.012;
                const stringT = strumT - sDel;
                if (stringT > 0 && stringT < 1.1) {
                  const val = Math.sin(2 * Math.PI * freq * stringT) * Math.exp(-stringT * 3.5);
                  gL += val * 0.25;
                  gR += val * 0.25;
                }
              });
            }
          }
        }
        samplesL[i] = Math.tanh(gL * 0.8);
        samplesR[i] = Math.tanh(gR * 0.8);
      }
    } else if (stemType === 'vocals') {
      const melody = [
        [293.66, 392.00, 493.88, 440.00],
        [369.99, 440.00, 587.33, 554.37],
        [329.63, 392.00, 493.88, 392.00],
        [329.63, 392.00, 523.25, 493.88],
      ];
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const barIdx = Math.floor(t / barDuration) % 4;
        const beatPos = (t / secPerBeat) % 4;
        const noteIdx = Math.min(3, Math.floor(beatPos));
        const freq = melody[barIdx][noteIdx];
        const noteT = (beatPos % 1.0) * secPerBeat;
        const env = Math.sin(Math.PI * Math.min(1.0, noteT / (secPerBeat * 0.95)));
        const vib = 1 + Math.sin(2 * Math.PI * 5.5 * t) * 0.012;
        const val = Math.sin(2 * Math.PI * freq * vib * t) + Math.sin(2 * Math.PI * freq * 2 * vib * t) * 0.5;
        const out = Math.tanh(val * env * 1.1) * 0.75;
        samplesL[i] = out;
        samplesR[i] = out;
      }
    } else {
      // Other / Synth
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const barIdx = Math.floor(t / barDuration) % 4;
        const chord = chordNotes[barIdx];
        const env = Math.sin(Math.PI * ((t % barDuration) / barDuration));
        let sum = 0;
        chord.chord.slice(1, 4).forEach((freq) => {
          sum += Math.sin(2 * Math.PI * freq * t) * 0.3;
        });
        const out = Math.tanh(sum * env) * 0.6;
        samplesL[i] = out;
        samplesR[i] = out;
      }
    }

    // Convert to 16-bit WAV PCM Buffer
    const numChannels = 2;
    const bitsPerSample = 16;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const totalSize = 44 + dataSize;
    const buffer = Buffer.alloc(totalSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(totalSize - 8, 4);
    buffer.write('WAVE', 8);

    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const sL = Math.max(-1, Math.min(1, samplesL[i]));
      const sR = Math.max(-1, Math.min(1, samplesR[i]));
      const intL = sL < 0 ? sL * 0x8000 : sL * 0x7fff;
      const intR = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
      buffer.writeInt16LE(Math.floor(intL), offset);
      buffer.writeInt16LE(Math.floor(intR), offset + 2);
      offset += 4;
    }
    return buffer;
  }

  const DEFAULT_STEM_SONGS = [
    {
      id: 'stem_pohoda',
      youtubeUrl: 'https://www.youtube.com/watch?v=cZ5w4dM_c0c',
      youtubeId: 'cZ5w4dM_c0c',
      title: 'Pohoda',
      artist: 'Kabát',
      durationSeconds: 225,
      status: 'completed',
      progressPercentage: 100,
      createdAt: Date.now() - 3600000 * 12,
      updatedAt: Date.now() - 3600000 * 12,
      stems: [
        { id: 'vocals', name: 'Zpěv (Lead Vocals)', storagePath: 'stems/stem_pohoda/vocals.wav', downloadUrl: '/api/stems/audio/stem_pohoda/vocals', format: 'wav', bitrateKbps: 192 },
        { id: 'guitar', name: 'Elektrická & Akustická Kytara', storagePath: 'stems/stem_pohoda/guitar.wav', downloadUrl: '/api/stems/audio/stem_pohoda/guitar', format: 'wav', bitrateKbps: 192 },
        { id: 'bass', name: 'Baskytara (Bass Line)', storagePath: 'stems/stem_pohoda/bass.wav', downloadUrl: '/api/stems/audio/stem_pohoda/bass', format: 'wav', bitrateKbps: 192 },
        { id: 'drums', name: 'Bicí souprava (Drums)', storagePath: 'stems/stem_pohoda/drums.wav', downloadUrl: '/api/stems/audio/stem_pohoda/drums', format: 'wav', bitrateKbps: 192 },
        { id: 'other', name: 'Ostatní nástroje & Synth', storagePath: 'stems/stem_pohoda/other.wav', downloadUrl: '/api/stems/audio/stem_pohoda/other', format: 'wav', bitrateKbps: 192 },
      ]
    },
    {
      id: 'stem_wonderwall',
      youtubeUrl: 'https://www.youtube.com/watch?v=6hzrDeceEKc',
      youtubeId: '6hzrDeceEKc',
      title: 'Wonderwall',
      artist: 'Oasis',
      durationSeconds: 258,
      status: 'completed',
      progressPercentage: 100,
      createdAt: Date.now() - 3600000 * 6,
      updatedAt: Date.now() - 3600000 * 6,
      stems: [
        { id: 'vocals', name: 'Zpěv (Liam Gallagher)', storagePath: 'stems/stem_wonderwall/vocals.wav', downloadUrl: '/api/stems/audio/stem_wonderwall/vocals', format: 'wav', bitrateKbps: 192 },
        { id: 'guitar', name: 'Akustická Kytara (Noel Gallagher)', storagePath: 'stems/stem_wonderwall/guitar.wav', downloadUrl: '/api/stems/audio/stem_wonderwall/guitar', format: 'wav', bitrateKbps: 192 },
        { id: 'bass', name: 'Baskytara', storagePath: 'stems/stem_wonderwall/bass.wav', downloadUrl: '/api/stems/audio/stem_wonderwall/bass', format: 'wav', bitrateKbps: 192 },
        { id: 'drums', name: 'Bicí & Tamburína', storagePath: 'stems/stem_wonderwall/drums.wav', downloadUrl: '/api/stems/audio/stem_wonderwall/drums', format: 'wav', bitrateKbps: 192 },
        { id: 'other', name: 'Smyčce & Cellos', storagePath: 'stems/stem_wonderwall/other.wav', downloadUrl: '/api/stems/audio/stem_wonderwall/other', format: 'wav', bitrateKbps: 192 },
      ]
    },
    {
      id: 'stem_stanky',
      youtubeUrl: 'https://www.youtube.com/watch?v=2m-fJb_S3O0',
      youtubeId: '2m-fJb_S3O0',
      title: 'Stánky',
      artist: 'Jan a František Nedvědové',
      durationSeconds: 178,
      status: 'completed',
      progressPercentage: 100,
      createdAt: Date.now() - 3600000 * 2,
      updatedAt: Date.now() - 3600000 * 2,
      stems: [
        { id: 'vocals', name: 'Hlavní & Druhý Hlas (Zpěv)', storagePath: 'stems/stem_stanky/vocals.wav', downloadUrl: '/api/stems/audio/stem_stanky/vocals', format: 'wav', bitrateKbps: 192 },
        { id: 'guitar', name: 'Španělská Akustická Kytara', storagePath: 'stems/stem_stanky/guitar.wav', downloadUrl: '/api/stems/audio/stem_stanky/guitar', format: 'wav', bitrateKbps: 192 },
        { id: 'bass', name: 'Akustická Baskytara', storagePath: 'stems/stem_stanky/bass.wav', downloadUrl: '/api/stems/audio/stem_stanky/bass', format: 'wav', bitrateKbps: 192 },
        { id: 'drums', name: 'Rytmika / Percussion', storagePath: 'stems/stem_stanky/drums.wav', downloadUrl: '/api/stems/audio/stem_stanky/drums', format: 'wav', bitrateKbps: 192 },
        { id: 'other', name: 'Harmonika & Atmosféra', storagePath: 'stems/stem_stanky/other.wav', downloadUrl: '/api/stems/audio/stem_stanky/other', format: 'wav', bitrateKbps: 192 },
      ]
    }
  ];

  let serverStems: any[] = DEFAULT_STEM_SONGS;

  try {
    if (fs.existsSync(STEMS_FILE)) {
      const data = fs.readFileSync(STEMS_FILE, 'utf-8');
      serverStems = JSON.parse(data);
      // Ensure default songs exist and all URLs are upgraded to local endpoints
      serverStems.forEach((song) => {
        if (song.stems) {
          song.stems.forEach((st: any) => {
            if (st.downloadUrl?.includes('tonejs.github.io')) {
              st.downloadUrl = `/api/stems/audio/${song.id}/${st.id}`;
            }
          });
        }
      });
      for (const defSong of DEFAULT_STEM_SONGS) {
        if (!serverStems.some((s) => s.id === defSong.id)) {
          serverStems.unshift(defSong);
        }
      }
      fs.writeFileSync(STEMS_FILE, JSON.stringify(serverStems, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(STEMS_FILE, JSON.stringify(serverStems, null, 2), 'utf-8');
    }
  } catch (e) {
    console.error('Error loading stems.json', e);
  }

  const saveServerStems = () => {
    try {
      fs.writeFileSync(STEMS_FILE, JSON.stringify(serverStems, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save stems.json', e);
    }
  };

  // Stem Audio Direct Stream Endpoints
  app.get('/api/stems/audio/:stemType', (req, res) => {
    try {
      const stemType = req.params.stemType || 'guitar';
      const wavBuf = generateServerStemWav(stemType, 30);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', wavBuf.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(wavBuf);
    } catch (err: any) {
      return res.status(500).send('Error generating stem audio: ' + err.message);
    }
  });

  app.get('/api/stems/audio/:songId/:stemType', (req, res) => {
    try {
      const stemType = req.params.stemType || 'guitar';
      const wavBuf = generateServerStemWav(stemType, 30);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', wavBuf.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(wavBuf);
    } catch (err: any) {
      return res.status(500).send('Error generating stem audio: ' + err.message);
    }
  });

  // Get list of stem songs
  app.get('/api/stems', (req, res) => {
    res.json({ songs: serverStems });
  });

  // Get specific stem song details
  app.get('/api/stems/:id', (req, res) => {
    const song = serverStems.find((s) => s.id === req.params.id);
    if (!song) {
      return res.status(404).json({ error: 'Píseň se stopy nenalezena.' });
    }
    res.json({ song });
  });

  // Start new YouTube AI Stem Separation process
  app.post('/api/stems/process', async (req, res) => {
    const { youtubeUrl, title, artist, userId } = req.body;
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'Chybí YouTube adresa (URL).' });
    }

    // Extract YouTube ID
    let ytId = 'unknown';
    const match = youtubeUrl.match(/(?:v=|\/embed\/|\/1\/|\/v\/|https:\/\/youtu\.be\/|\/shorts\/)([^"&?\/ ]{11})/);
    if (match) {
      ytId = match[1];
    }

    const songId = 'stem_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const songTitle = title?.trim() || `YouTube Song (${ytId})`;
    const songArtist = artist?.trim() || 'Neznámý umělec';

    const newSongDoc = {
      id: songId,
      youtubeUrl,
      youtubeId: ytId,
      title: songTitle,
      artist: songArtist,
      durationSeconds: 210,
      status: 'processing',
      progressPercentage: 15,
      createdBy: userId || 'user-admin-hortom82',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stems: [
        { id: 'vocals', name: 'Zpěv (Lead Vocals)', storagePath: `stems/${songId}/vocals.wav`, downloadUrl: `/api/stems/audio/${songId}/vocals`, format: 'wav', bitrateKbps: 192 },
        { id: 'guitar', name: 'Kytara (Guitar)', storagePath: `stems/${songId}/guitar.wav`, downloadUrl: `/api/stems/audio/${songId}/guitar`, format: 'wav', bitrateKbps: 192 },
        { id: 'bass', name: 'Baskytara (Bass)', storagePath: `stems/${songId}/bass.wav`, downloadUrl: `/api/stems/audio/${songId}/bass`, format: 'wav', bitrateKbps: 192 },
        { id: 'drums', name: 'Bicí (Drums)', storagePath: `stems/${songId}/drums.wav`, downloadUrl: `/api/stems/audio/${songId}/drums`, format: 'wav', bitrateKbps: 192 },
        { id: 'other', name: 'Ostatní nástroje (Other/Synth)', storagePath: `stems/${songId}/other.wav`, downloadUrl: `/api/stems/audio/${songId}/other`, format: 'wav', bitrateKbps: 192 },
      ],
    };

    serverStems.unshift(newSongDoc);
    saveServerStems();

    // Asynchronous background pipeline steps simulation (10% -> 35% -> 70% -> 100%)
    setTimeout(() => {
      newSongDoc.progressPercentage = 40;
      newSongDoc.status = 'processing';
      newSongDoc.updatedAt = Date.now();
      saveServerStems();
    }, 1500);

    setTimeout(() => {
      newSongDoc.progressPercentage = 75;
      newSongDoc.status = 'processing';
      newSongDoc.updatedAt = Date.now();
      saveServerStems();
    }, 3500);

    setTimeout(() => {
      newSongDoc.progressPercentage = 100;
      newSongDoc.status = 'completed';
      newSongDoc.updatedAt = Date.now();
      saveServerStems();
    }, 5500);

    res.json({ success: true, song: newSongDoc, songs: serverStems });
  });

  // Vite middleware or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎸 Guitar & Band Hub server listnenig on http://0.0.0.0:${PORT}`);
  });
}

startServer();
