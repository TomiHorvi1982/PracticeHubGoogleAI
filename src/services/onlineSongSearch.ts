import { YouTubeVideo } from '../types';

export interface OnlineSearchResult {
  title: string;
  artist: string;
  key: string;
  content: string;
  chords?: string[];
  sourceUrl?: string;
  sourceName?: string;
  youtubeVideos?: YouTubeVideo[];
}

export async function searchOnlineSongs(query: string): Promise<OnlineSearchResult[]> {
  const response = await fetch('/api/search-online-chords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Nepodařilo se vyhledat akordy online.');
  }

  const data = await response.json();
  return data.songs || [];
}

export async function searchYouTubeForSong(title: string, artist: string): Promise<YouTubeVideo[]> {
  try {
    const res = await fetch('/api/search-youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.videos || [];
  } catch (err) {
    console.error('YouTube search request failed:', err);
    return [];
  }
}
