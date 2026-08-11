import { Midi } from '@tonejs/midi';
import * as pdfjsLib from 'pdfjs-dist';
import { Song, SongAttachment } from '../types';

// Set PDF.js worker
if (typeof window !== 'undefined' && pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
}

export interface ImportResult {
  song: Partial<Song>;
  attachment: SongAttachment;
}

export interface ChordProParseResult {
  title: string;
  artist: string;
  key: string;
  bpm: number;
  capo?: number;
  content: string;
}

/**
 * Parses ChordPro formatted strings ({title:...}, {artist:...}, {key:...}, {soc}, {eoc}, {capo:...}, etc.)
 */
export function parseChordProText(rawText: string, fallbackFilename: string): ChordProParseResult {
  const lines = rawText.split(/\r?\n/);

  let title = fallbackFilename;
  let artist = 'Neznámý autor';
  let key = 'C';
  let bpm = 120;
  let capo: number | undefined = undefined;

  const outputLines: string[] = [];
  let verseCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check directive e.g. {tag: value} or {tag}
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inside = trimmed.slice(1, -1).trim();
      const colonIdx = inside.indexOf(':');
      const tag = (colonIdx !== -1 ? inside.slice(0, colonIdx) : inside).toLowerCase().trim();
      const val = colonIdx !== -1 ? inside.slice(colonIdx + 1).trim() : '';

      switch (tag) {
        case 'title':
        case 't':
          if (val) title = val;
          break;
        case 'subtitle':
        case 'st':
        case 'artist':
        case 'a':
          if (val) artist = val;
          break;
        case 'key':
        case 'k':
          if (val) key = val;
          break;
        case 'tempo':
        case 'bpm':
          if (val && !isNaN(Number(val))) bpm = Number(val);
          break;
        case 'capo':
          if (val && !isNaN(Number(val))) capo = Number(val);
          break;
        case 'start_of_chorus':
        case 'soc':
          outputLines.push('');
          outputLines.push('[Refren]');
          break;
        case 'end_of_chorus':
        case 'eoc':
          outputLines.push('');
          break;
        case 'start_of_verse':
        case 'sov':
        case 'start_of_tab':
          verseCount++;
          outputLines.push('');
          outputLines.push(`[Sloha ${verseCount}]`);
          break;
        case 'end_of_verse':
        case 'eov':
        case 'end_of_tab':
          outputLines.push('');
          break;
        case 'start_of_bridge':
        case 'sob':
          outputLines.push('');
          outputLines.push('[Bridge]');
          break;
        case 'end_of_bridge':
        case 'eob':
          outputLines.push('');
          break;
        case 'chorus':
          outputLines.push('');
          outputLines.push('[Refren]');
          break;
        case 'comment':
        case 'c':
          if (val) outputLines.push(`(${val})`);
          break;
        default:
          // Omit unknown meta directive from output body
          break;
      }
    } else {
      outputLines.push(line);
    }
  }

  // Format content to ensure chords are in [Chord] brackets if they are on separate lines
  const formattedContent = formatLyricsWithChords(outputLines.join('\n'));

  return {
    title,
    artist,
    key,
    bpm,
    capo,
    content: formattedContent || rawText,
  };
}

/**
 * Parses Text and ChordPro files (.txt, .chopro, .pro, .chordpro, .crd, .tab)
 */
export async function parseTextFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const filename = file.name.replace(/\.[^/.]+$/, '');

  const parsed = parseChordProText(text, filename);
  const dataUrl = await fileToDataUrl(file);

  const attachment: SongAttachment = {
    id: 'att_' + Math.random().toString(36).substring(2, 9),
    name: file.name,
    type: 'txt',
    dataUrl,
    size: file.size,
    uploadedAt: Date.now(),
    parsedData: {
      title: parsed.title,
      artist: parsed.artist,
      key: parsed.key,
      bpm: parsed.bpm,
      extractedText: text,
    },
  };

  return {
    song: {
      title: parsed.title,
      artist: parsed.artist,
      key: parsed.key,
      bpm: parsed.bpm,
      capo: parsed.capo,
      content: parsed.content,
    },
    attachment,
  };
}

/**
 * Parses PDF files (.pdf)
 */
export async function parsePdfFile(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const filename = file.name.replace(/\.[^/.]+$/, '');
  let extractedText = '';

  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const maxPages = Math.min(pdf.numPages, 5);
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      extractedText += pageText + '\n';
    }
  } catch (err) {
    console.warn('PDF text extraction error, falling back to basic filename:', err);
  }

  // Guess title & artist
  let title = filename;
  let artist = 'PDF Zpěvník';

  if (filename.includes('-')) {
    const parts = filename.split('-');
    artist = parts[0].trim();
    title = parts.slice(1).join('-').trim();
  }

  const formattedContent = extractedText.trim()
    ? formatLyricsWithChords(extractedText)
    : `[C]Připojený PDF soubor: ${file.name}\n(Náhled a zobrazení PDF souboru v záložce příloh)`;

  const dataUrl = await fileToDataUrl(file);

  const attachment: SongAttachment = {
    id: 'att_' + Math.random().toString(36).substring(2, 9),
    name: file.name,
    type: 'pdf',
    dataUrl,
    size: file.size,
    uploadedAt: Date.now(),
    parsedData: {
      title,
      artist,
      extractedText,
    },
  };

  return {
    song: {
      title,
      artist,
      key: 'C',
      bpm: 120,
      content: formattedContent,
    },
    attachment,
  };
}

/**
 * Parses MIDI files (.mid, .midi)
 */
export async function parseMidiFile(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const filename = file.name.replace(/\.[^/.]+$/, '');

  let title = filename;
  let artist = 'MIDI Skladba';
  let bpm = 120;
  let trackNames: string[] = [];

  try {
    const midi = new Midi(arrayBuffer);
    if (midi.header.name) title = midi.header.name;
    if (midi.header.tempos && midi.header.tempos.length > 0) {
      bpm = Math.round(midi.header.tempos[0].bpm);
    }

    trackNames = midi.tracks
      .map((t) => t.name || `Stopa ${t.channel + 1}`)
      .filter(Boolean);
  } catch (err) {
    console.warn('MIDI parsing notice:', err);
  }

  const dataUrl = await fileToDataUrl(file);

  const content = `[C]MIDI Skladba: ${title}\n` +
    `Tempo: ${bpm} BPM\n` +
    `Stopy (${trackNames.length}): ${trackNames.join(', ') || 'Hlavní stopa'}\n` +
    `[G]Přehrát MIDI přímo v přehrávači v záložce příloh!`;

  const attachment: SongAttachment = {
    id: 'att_' + Math.random().toString(36).substring(2, 9),
    name: file.name,
    type: 'midi',
    dataUrl,
    size: file.size,
    uploadedAt: Date.now(),
    parsedData: {
      title,
      artist,
      bpm,
      trackNames,
    },
  };

  return {
    song: {
      title,
      artist,
      key: 'C',
      bpm,
      content,
    },
    attachment,
  };
}

/**
 * Parses Guitar Pro files (.gp, .gp3, .gp4, .gp5, .gpx)
 */
export async function parseGuitarProFile(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const filename = file.name.replace(/\.[^/.]+$/, '');

  let title = filename;
  let artist = 'Guitar Pro Tab';
  let bpm = 120;
  let trackNames: string[] = [];

  // Parse binary GP3/GP4/GP5 header strings if available
  try {
    const view = new DataView(arrayBuffer);
    const decoder = new TextDecoder('iso-8859-1');

    // GP files start with a string version header e.g. "FICHIER GUITAR PRO v3.00" or "FICHIER GUITAR PRO v5.00"
    let offset = 0;
    const versionLen = view.getUint8(0);
    if (versionLen > 0 && versionLen < 35) {
      const verStr = decoder.decode(new Uint8Array(arrayBuffer, 1, versionLen));
      if (verStr.includes('GUITAR PRO')) {
        offset = 1 + versionLen;
        // Skip header padding / triplets
        if (verStr.includes('v5')) offset += 30;

        // Try reading title string
        const titleLen = view.getUint8(offset + 4);
        if (titleLen > 0 && titleLen < 100) {
          const parsedTitle = decoder.decode(new Uint8Array(arrayBuffer, offset + 5, titleLen)).trim();
          if (parsedTitle && parsedTitle.length > 1) title = parsedTitle;
        }

        // Try reading artist string
        const artistOffset = offset + 5 + titleLen;
        const artistLen = view.getUint8(artistOffset + 4);
        if (artistLen > 0 && artistLen < 100) {
          const parsedArtist = decoder.decode(new Uint8Array(arrayBuffer, artistOffset + 5, artistLen)).trim();
          if (parsedArtist && parsedArtist.length > 1) artist = parsedArtist;
        }
      }
    }
  } catch (err) {
    // Binary fallback
  }

  if (filename.includes('-')) {
    const parts = filename.split('-');
    if (artist === 'Guitar Pro Tab') artist = parts[0].trim();
    if (title === filename) title = parts.slice(1).join('-').trim();
  }

  const dataUrl = await fileToDataUrl(file);

  const content = `[Am]Guitar Pro Tabulatura: ${title}\n` +
    `Interpret: ${artist}\n` +
    `[F]Soubor ${file.name} je připraven k prohlížení a stažení pro celou kapelu.`;

  const attachment: SongAttachment = {
    id: 'att_' + Math.random().toString(36).substring(2, 9),
    name: file.name,
    type: 'guitarpro',
    dataUrl,
    size: file.size,
    uploadedAt: Date.now(),
    parsedData: {
      title,
      artist,
      bpm,
      trackNames: ['Kytara (Solo)', 'Kytara (Rytmika)', 'Baskytara', 'Bicí'],
    },
  };

  return {
    song: {
      title,
      artist,
      key: 'Am',
      bpm,
      content,
    },
    attachment,
  };
}

/**
 * Helper to convert File to Base64 DataURL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Formats plain text chord sheets where chords sit on lines above text into [Chord] format
 */
function formatLyricsWithChords(rawText: string): string {
  const lines = rawText.split('\n');
  const result: string[] = [];

  const chordRegex = /^[A-G][b#]?(m|maj|min|dim|aug|sus[24]?|add[0-9]|7|9|11|13)*(\/[A-G][b#]?)?(\s+[A-G][b#]?(m|maj|min|dim|aug|sus[24]?|add[0-9]|7|9|11|13)*(\/[A-G][b#]?)?)*$/i;

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1];

    // If line already contains [Chord], keep it as is
    if (current.includes('[') && current.includes(']')) {
      result.push(current);
      continue;
    }

    // Check if current line looks like a chord line
    const words = current.trim().split(/\s+/);
    const isChordLine = words.length > 0 && words.every((w) => {
      return /^[A-G][b#]?(m|maj|min|dim|aug|sus|add|7|9|11|13|\/)*$/i.test(w);
    });

    if (isChordLine && next && next.trim().length > 0 && !next.includes('[')) {
      // Merge chord line with next lyrics line
      const chords = words.map((w) => `[${w.toUpperCase()}]`).join(' ');
      result.push(`${chords} ${next}`);
      i++; // skip next line
    } else {
      result.push(current);
    }
  }

  return result.join('\n');
}
