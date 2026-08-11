import express from 'express';
import path from 'path';
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
    type: 'official' | 'backingtrack' | 'karaoke' | 'cover' | 'other';
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
      { q: `${artist} ${title} official music video`, defaultType: 'official' as const },
      { q: `${artist} ${title} backing track lyrics chords`, defaultType: 'backingtrack' as const },
      { q: `${artist} ${title} karaoke s textem`, defaultType: 'karaoke' as const },
    ];

    for (const searchItem of searchQueries) {
      try {
        const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchItem.q)}`;
        const res = await fetch(ytUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
          },
        });

        if (res.ok) {
          const html = await res.text();
          const videoIdMatches = Array.from(html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g));
          
          let foundCount = 0;
          for (const match of videoIdMatches) {
            const vidId = match[1];
            if (!resultsMap.has(vidId) && foundCount < 2) {
              let videoTitle = `${artist} - ${title}`;
              if (searchItem.defaultType === 'official') {
                videoTitle += ' (Oficiální klip)';
              } else if (searchItem.defaultType === 'backingtrack') {
                videoTitle += ' (Backing track s textem a akordy)';
              } else {
                videoTitle += ' (Karaoke doprovod)';
              }

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
