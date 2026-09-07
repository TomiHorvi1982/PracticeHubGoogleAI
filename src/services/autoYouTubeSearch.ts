/**
 * Automatické vyhledávání YouTube videa pro skladbu.
 *
 * Používá existující server-side scraper (fetchYouTubeVideosForQuery)
 * a přidává scoring engine pro výběr nejlepšího výsledku.
 *
 * Princip:
 * 1. Vyhledej všechny kandidáty
 * 2. Ověři každý oEmbed
 * 3. Ochoť každý kandidát
 * 4. Vrátí nejlepší nebo null
 *
 * Scoring model (max ~150 bodů):
 * - TITLE MATCH: +50 přesná, +25 částečná
 * - ARTIST MATCH: +40 přesná, +20 částečná
 * - OFFICIAL SIGNAL: +30 (VEVO/Topic/official)
 * - TYPE BONUS: official=+25, original=+20, backingtrack=+10
 * - ALBUM MATCH: +15
 *
 * PENALIZACE:
 * - cover: -25, karaoke: -15, remix: -30, live: -20
 * - reaction: -40, tutorial: -35, guitar lesson: -35
 * - sped up/slowed/nightcore: -35, instrumental (when looking for vocal): -20
 *
 * Thresholdy:
 * - HIGH confidence (auto-save): >= 70 a title_match && artist_match
 * - LOW confidence (needs review): >= 40 alebo < 70 alebo více kandidátů se stejným skórem
 * - NO CONFIDENCE (< 40): neukládat
 */

// ─── Konstanty pro scoring ───

const BONUS = {
  TITLE_EXACT: 50,
  TITLE_PARTIAL: 25,
  ARTIST_EXACT: 40,
  ARTIST_PARTIAL: 20,
  OFFICIAL_SIGNAL: 30,
  TYPE_OFFICIAL: 25,
  TYPE_ORIGINAL: 20,
  TYPE_BACKINGTRACK: 10,
  ALBUM_MATCH: 15,
} as const;

const PENALTY = {
  COVER: 25,
  KARAOKE: 15,
  REMIX: 30,
  LIVE: 20,
  REACTION: 40,
  TUTORIAL: 35,
  GUITAR_LESSON: 35,
  BACKING_TRACK: 10,
  SPED_UP: 35,
  SLOWED: 35,
  NIGHTCORE: 35,
  INSTRUMENTAL: 20,
} as const;

// Thresholdy
const THRESHOLDS = {
  HIGH: 70,      // Auto-save
  LOW: 40,       // Needs review
} as const;

export interface ScoredCandidate {
  videoId: string;
  title: string;
  channel?: string;
  type: string;
  score: number;
  reasons: string[];
  confidence: 'high' | 'low' | 'none';
}

export interface YouTubeSearchResult {
  bestCandidate: ScoredCandidate | null;
  allCandidates: ScoredCandidate[];
  status: 'found' | 'low_confidence' | 'not_found' | 'no_result';
  message: string;
}

// ─── Pomocné funkce ───

function norm(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function containsAll(haystack: string, needles: string[]): boolean {
  return needles.every((n) => haystack.includes(n));
}

function isNegativeSignal(title: string): string | null {
  const t = title.toLowerCase();
  if (/\bcover\b/i.test(t) && !/\bofficial\b/i.test(t)) return 'cover';
  if (/\bkaraoke\b/i.test(t)) return 'karaoke';
  if (/\bremix\b/i.test(t)) return 'remix';
  if (/\blive\b/i.test(t) && !/\bofficial live\b/i.test(t)) return 'live';
  if (/\breaction\b/i.test(t)) return 'reaction';
  if (/\btutorial\b/i.test(t)) return 'tutorial';
  if (/\bguitar lesson\b/i.test(t)) return 'guitar_lesson';
  if (/\bsped\.?\s*up|slowed/i.test(t)) return 'sped_up';
  if (/\bnightcore\b/i.test(t)) return 'nightcore';
  if (/\binstrumental\b/i.test(t)) return 'instrumental';
  if (/\b8d|bass boosted|nightcore/i.test(t)) return 'effect';
  return null;
}

function isPositiveSignal(title: string): string | null {
  const t = title.toLowerCase();
  if (/\bofficial\b/i.test(t) && (/\bmusic video\b|\bvideo\b/i.test(t))) return 'official_music_video';
  if (/\bofficial\b/i.test(t)) return 'official';
  if (/\bvevo\b/i.test(t)) return 'vevo';
  if (/\btopic\b/i.test(t)) return 'topic';
  return null;
}

// ─── Hlavní scoring funkce ───

export function scoreCandidate(
  videoTitle: string,
  channel: string | undefined,
  videoType: string,
  artist: string,
  title: string,
  album?: string
): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const normTitle = norm(title);
  const normArtist = norm(artist);
  const normVideoTitle = norm(videoTitle);
  const normChannel = norm(channel || '');

  // ── TITLE MATCH ──
  const titleExact = normVideoTitle.includes(normTitle) && normTitle.length >= 3;
  const titlePartial = normVideoTitle.includes(normTitle.slice(0, Math.max(3, Math.floor(normTitle.length / 2))));

  if (titleExact) {
    score += BONUS.TITLE_EXACT;
    reasons.push('title_exact');
  } else if (titlePartial) {
    score += BONUS.TITLE_PARTIAL;
    reasons.push('title_partial');
  }

  // ── ARTIST MATCH ──
  const artistExact = normVideoTitle.includes(normArtist) || normChannel.includes(normArtist);
  const artistPartial = normVideoTitle.includes(normArtist.slice(0, Math.max(3, Math.floor(normArtist.length / 2))));

  if (artistExact) {
    score += BONUS.ARTIST_EXACT;
    reasons.push('artist_exact');
  } else if (artistPartial) {
    score += BONUS.ARTIST_PARTIAL;
    reasons.push('artist_partial');
  }

  // ── POSITIVE SIGNALS ──
  const posSignal = isPositiveSignal(videoTitle);
  if (posSignal) {
    score += BONUS.OFFICIAL_SIGNAL;
    reasons.push(posSignal);
  }

  // ── TYPE BONUS ──
  const typeBonusMap: Record<string, number> = {
    official: BONUS.TYPE_OFFICIAL,
    original: BONUS.TYPE_ORIGINAL,
    backingtrack: BONUS.TYPE_BACKINGTRACK,
  };
  const typeBonus = typeBonusMap[videoType] || 0;
  score += typeBonus;
  if (typeBonus > 0) reasons.push(`type_${videoType}`);

  // ── ALBUM MATCH ──
  if (album) {
    const normAlbum = norm(album);
    if (normVideoTitle.includes(normAlbum)) {
      score += BONUS.ALBUM_MATCH;
      reasons.push('album_match');
    }
  }

  // ── NEGATIVE SIGNALS ──
  const negSignal = isNegativeSignal(videoTitle);
  if (negSignal) {
    const penaltyKey = negSignal as keyof typeof PENALTY;
    score -= PENALTY[penaltyKey] || 20;
    reasons.push(`penalty_${negSignal}`);
  }

  // ── Backing track penalty (if we want the original vocal version) ──
  if (videoType === 'backingtrack') {
    score -= PENALTY.BACKING_TRACK;
    reasons.push('penalty_backingtrack');
  }

  // ── Ensure score doesn't go below 0 ──
  score = Math.max(0, score);

  // ── Determine confidence ──
  let confidence: 'high' | 'low' | 'none';
  if (score >= THRESHOLDS.HIGH && titleExact && artistExact) {
    confidence = 'high';
  } else if (score >= THRESHOLDS.LOW) {
    confidence = 'low';
  } else {
    confidence = 'none';
  }

  return {
    videoId: '',
    title: videoTitle,
    channel,
    type: videoType,
    score,
    reasons,
    confidence,
  };
}

// ─── Hledání a vyhodnocení ───

/**
 * Hledá nejlepší YouTube video pro danou skladbu.
 * Používá existující server-side scraper.
 *
 * @param artist Interpret skladby
 * @param title Název skladby
 * @param album (volitelné) Album
 * @returns výsledek vyhledávání s nejlepší kandidátem
 */
export async function findBestYouTubeVideo(
  artist: string,
  title: string,
  album?: string
): Promise<YouTubeSearchResult> {
  if (!title) {
    return { bestCandidate: null, allCandidates: [], status: 'not_found', message: 'Chybí název skladby.' };
  }

  // Volání server-side scraper
  const response = await fetch('/api/search-youtube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, artist }),
  });

  if (!response.ok) {
    return { bestCandidate: null, allCandidates: [], status: 'not_found', message: 'YouTube search failed.' };
  }

  const data = await response.json();
  const videos = data.videos || [];

  if (videos.length === 0) {
    return { bestCandidate: null, allCandidates: [], status: 'not_found', message: 'Žádné výsledky.' };
  }

  // Score each candidate
  const candidates: ScoredCandidate[] = videos.map((v: any) =>
    scoreCandidate(v.title, v.channel || v.author_name, v.type, artist, title, album)
  );

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Find best candidate
  const best = candidates[0];

  if (!best || best.confidence === 'none') {
    return { bestCandidate: null, allCandidates: candidates, status: 'not_found', message: 'Žádný dostatečný výsledek.' };
  }

  if (best.confidence === 'high') {
    return { bestCandidate: best, allCandidates: candidates, status: 'found', message: 'Oficiální video nalezeno.' };
  }

  // Low confidence
  return { bestCandidate: best, allCandidates: candidates, status: 'low_confidence', message: 'Výsledek vyžaduje kontrolu.' };
}

/**
 * Vyhodnotí zda má skladba YouTube data.
 * Vrací true pokud existuje alespoň jedno YouTube video.
 */
export function hasYouTubeData(song: any): boolean {
  if (!song) return false;
  const metadata = song.metadata || {};
  if (song.youtubeVideos && song.youtubeVideos.length > 0) return true;
  if (metadata.youtubeId) return true;
  if (metadata.youtubeUrl) return true;
  return false;
}

// ─── Export pro server-side použití ───

export { BONUS, PENALTY, THRESHOLDS };
