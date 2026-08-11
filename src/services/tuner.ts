// Real-time Pitch Detection Engine using Autocorrelation

export interface PitchData {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
  clarity: number;
  stringIndex?: number; // 0 for String 6 (E2) ... 5 for String 1 (E4)
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class PitchDetector {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private buffer: Float32Array = new Float32Array(2048);

  public async start(onPitchDetected: (data: PitchData | null) => void): Promise<boolean> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;

      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      const processFrame = () => {
        if (!this.analyser || !this.audioCtx) return;
        this.analyser.getFloatTimeDomainData(this.buffer);

        const pitchData = this.autoCorrelate(this.buffer, this.audioCtx.sampleRate);
        onPitchDetected(pitchData);

        this.animationFrameId = requestAnimationFrame(processFrame);
      };

      processFrame();
      return true;
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      return false;
    }
  }

  public stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    this.analyser = null;
  }

  private autoCorrelate(buffer: Float32Array, sampleRate: number): PitchData | null {
    const size = buffer.length;
    let sumOfSquares = 0;

    for (let i = 0; i < size; i++) {
      sumOfSquares += buffer[i] * buffer[i];
    }

    const rms = Math.sqrt(sumOfSquares / size);
    if (rms < 0.01) {
      // Signal too quiet
      return null;
    }

    let r1 = 0;
    let r2 = size - 1;
    const threshold = 0.2;

    for (let i = 0; i < size / 2; i++) {
      if (Math.abs(buffer[i]) < threshold) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < size / 2; i++) {
      if (Math.abs(buffer[size - i]) < threshold) {
        r2 = size - i;
        break;
      }
    }

    const trimmedBuffer = buffer.slice(r1, r2);
    const newSize = trimmedBuffer.length;

    const c = new Float32Array(newSize);
    for (let i = 0; i < newSize; i++) {
      for (let j = 0; j < newSize - i; j++) {
        c[i] = c[i] + trimmedBuffer[j] * trimmedBuffer[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;

    let maxValue = -1;
    let maxIndex = -1;

    for (let i = d; i < newSize; i++) {
      if (c[i] > maxValue) {
        maxValue = c[i];
        maxIndex = i;
      }
    }

    let T0 = maxIndex;

    // Parabolic interpolation for fine frequency resolution
    if (T0 > 0 && T0 < newSize - 1) {
      const x1 = c[T0 - 1];
      const x2 = c[T0];
      const x3 = c[T0 + 1];
      const a = (x1 + x3 - 2 * x2) / 2;
      const b = (x3 - x1) / 2;
      if (a !== 0) {
        T0 = T0 - b / (2 * a);
      }
    }

    const frequency = sampleRate / T0;
    if (frequency < 40 || frequency > 1200) {
      return null;
    }

    // Convert frequency to note
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
    const roundedNoteNum = Math.round(noteNum);
    const noteIndex = (roundedNoteNum % 12 + 12) % 12;
    const note = NOTE_NAMES[noteIndex];
    const octave = Math.floor(roundedNoteNum / 12) - 1;

    // Cents offset
    const exactFrequency = 440 * Math.pow(2, (roundedNoteNum - 69) / 12);
    const cents = Math.round(1200 * Math.log2(frequency / exactFrequency));

    // Match string for standard guitar tuning [E2, A2, D3, G3, B3, E4]
    const guitarFreqs = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];
    let stringIndex: number | undefined;
    guitarFreqs.forEach((gFreq, idx) => {
      const diffCents = Math.abs(1200 * Math.log2(frequency / gFreq));
      if (diffCents <= 120) {
        stringIndex = idx;
      }
    });

    return {
      frequency: Math.round(frequency * 10) / 10,
      note,
      octave,
      cents: Math.max(-50, Math.min(50, cents)),
      clarity: rms,
      stringIndex,
    };
  }
}
