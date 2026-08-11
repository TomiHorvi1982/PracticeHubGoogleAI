export interface TranscribedSong {
  title: string;
  artist: string;
  key: string;
  content: string; // [Chord] lyrics format
  chords: string[];
}

export async function transcribeSongPhoto(base64Image: string): Promise<TranscribedSong> {
  try {
    const response = await fetch('/api/transcribe-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: base64Image }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Přepis obrázku se nepodařil');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Gemini OCR transcription failed:', error);
    throw error;
  }
}
