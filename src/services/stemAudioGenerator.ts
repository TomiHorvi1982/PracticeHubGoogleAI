/**
 * Studio Multitrack Stem Audio Synthesizer & Generator
 * Generates rich, authentic, 100% self-contained synchronized 5-track audio stems
 * (Vocals, Guitar, Bass, Drums, Other) with zero external network dependency.
 */

export interface GeneratedStemTracks {
  vocals: AudioBuffer;
  guitar: AudioBuffer;
  bass: AudioBuffer;
  drums: AudioBuffer;
  other: AudioBuffer;
}

export function generateSynchronizedStems(
  ctx: AudioContext,
  durationSec: number = 60,
  bpm: number = 108
): GeneratedStemTracks {
  const sampleRate = ctx.sampleRate || 44100;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const secondsPerBeat = 60 / bpm;
  const barDuration = secondsPerBeat * 4; // 4/4 time

  // Create stereo AudioBuffers for all 5 stems
  const createBuffer = () => ctx.createBuffer(2, totalSamples, sampleRate);

  const vocalBuf = createBuffer();
  const guitarBuf = createBuffer();
  const bassBuf = createBuffer();
  const drumBuf = createBuffer();
  const otherBuf = createBuffer();

  const vocalL = vocalBuf.getChannelData(0);
  const vocalR = vocalBuf.getChannelData(1);

  const guitarL = guitarBuf.getChannelData(0);
  const guitarR = guitarBuf.getChannelData(1);

  const bassL = bassBuf.getChannelData(0);
  const bassR = bassBuf.getChannelData(1);

  const drumL = drumBuf.getChannelData(0);
  const drumR = drumBuf.getChannelData(1);

  const otherL = otherBuf.getChannelData(0);
  const otherR = otherBuf.getChannelData(1);

  // Musical Progression in G Major: G (I) -> D (V) -> Em (vi) -> C (IV)
  // Chord Frequencies (Fundamental + Triad notes)
  const chordNotes = [
    { root: 49.00, chord: [98.00, 123.47, 146.83, 196.00, 246.94, 392.00], name: 'G' },    // G maj
    { root: 73.42, chord: [146.83, 220.00, 293.66, 369.99, 440.00], name: 'D' },            // D maj
    { root: 41.20, chord: [82.41, 123.47, 164.81, 196.00, 246.94, 329.63], name: 'Em' },   // E min
    { root: 65.41, chord: [130.81, 164.81, 196.00, 261.63, 329.63], name: 'C' },            // C maj
  ];

  // --- 1. DRUMS SYNTHESIS (Kick, Snare, Hi-Hats, Crash) ---
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatPos = (t / secondsPerBeat) % 4; // 0..4 in current bar
    const barPos = Math.floor(t / barDuration);
    const beatFract = beatPos % 1; // 0..1 inside beat

    let dL = 0;
    let dR = 0;

    // Kick Drum on Beat 1 & Beat 3, plus syncopated hit at Beat 3.5
    const isKickBeat = beatPos < 0.25 || (beatPos >= 2.0 && beatPos < 2.25) || (beatPos >= 2.5 && beatPos < 2.75 && (barPos % 2 === 1));
    if (isKickBeat) {
      const kickT = (beatPos < 0.25 ? beatPos : beatPos >= 2.5 ? beatPos - 2.5 : beatPos - 2.0) * secondsPerBeat;
      if (kickT < 0.35) {
        const pitch = 50 + 110 * Math.exp(-kickT * 32);
        const kickEnv = Math.exp(-kickT * 12);
        const kickBody = Math.sin(2 * Math.PI * pitch * kickT) * kickEnv;
        const kickClick = (Math.random() * 2 - 1) * Math.exp(-kickT * 85) * 0.3;
        const kickVal = (kickBody * 0.85 + kickClick) * 0.9;
        dL += kickVal;
        dR += kickVal;
      }
    }

    // Snare Drum on Beat 2 & Beat 4
    const isSnareBeat = (beatPos >= 1.0 && beatPos < 1.25) || (beatPos >= 3.0 && beatPos < 3.25);
    if (isSnareBeat) {
      const snareT = (beatPos >= 3.0 ? beatPos - 3.0 : beatPos - 1.0) * secondsPerBeat;
      if (snareT < 0.38) {
        const snareTone = Math.sin(2 * Math.PI * (185 * Math.exp(-snareT * 18)) * snareT) * Math.exp(-snareT * 16) * 0.6;
        const snareNoise = (Math.random() * 2 - 1) * Math.exp(-snareT * 11) * 0.7;
        const snareSnap = (Math.random() * 2 - 1) * Math.exp(-snareT * 60) * 0.4;
        const snareVal = (snareTone + snareNoise + snareSnap) * 0.8;
        dL += snareVal * 0.95;
        dR += snareVal * 1.05;
      }
    }

    // Closed Hi-Hat on 8th notes (0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5)
    const eighthPos = (beatPos * 2) % 1;
    const isEighth = eighthPos < 0.25;
    if (isEighth) {
      const hhT = eighthPos * (secondsPerBeat / 2);
      if (hhT < 0.08) {
        const hhNoise = (Math.random() * 2 - 1) * Math.exp(-hhT * 48);
        const hhMetal = Math.sin(2 * Math.PI * 8500 * hhT) * 0.3 * Math.exp(-hhT * 35);
        const hhVal = (hhNoise + hhMetal) * 0.32;
        // Panned slightly right
        dL += hhVal * 0.6;
        dR += hhVal * 0.9;
      }
    }

    // Crash Cymbal at start of bar 1 and bar 5
    if (barPos % 4 === 0 && beatPos < 1.0) {
      const crashT = beatPos * secondsPerBeat;
      if (crashT < 2.0) {
        const crashNoise = (Math.random() * 2 - 1) * Math.exp(-crashT * 2.8);
        const crashShimmer = Math.sin(2 * Math.PI * 6200 * crashT) * 0.2 * Math.exp(-crashT * 1.8);
        const crashVal = (crashNoise + crashShimmer) * 0.4;
        dL += crashVal * 1.1;
        dR += crashVal * 0.8;
      }
    }

    drumL[i] = Math.tanh(dL * 0.9);
    drumR[i] = Math.tanh(dR * 0.9);
  }

  // --- 2. BASS SYNTHESIS (Warm Analog Bassline) ---
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barDuration) % 4;
    const chord = chordNotes[barIdx];
    const beatPos = (t / secondsPerBeat) % 4;
    const noteBeat = Math.floor(beatPos * 2); // 8th note index 0..7
    const noteT = (beatPos % 0.5) * secondsPerBeat;

    // Bass rhythm pattern: Root notes on beats with octave hop on beat 3.5
    let freq = chord.root;
    if (noteBeat === 7) {
      freq = chord.root * 1.5; // fifth
    } else if (noteBeat === 5) {
      freq = chord.root * 2.0; // octave
    }

    const env = Math.exp(-noteT * 4.2) * (1 - Math.exp(-noteT * 90));
    const osc1 = Math.sin(2 * Math.PI * freq * t);
    const osc2 = Math.sin(2 * Math.PI * freq * 2 * t) * 0.45;
    const sub = Math.sin(2 * Math.PI * (freq / 2) * t) * 0.35;
    const rawBass = (osc1 + osc2 + sub) * env * 0.85;

    // Saturation and low warmth
    const warmBass = Math.tanh(rawBass * 1.3) * 0.8;
    bassL[i] = warmBass;
    bassR[i] = warmBass;
  }

  // --- 3. GUITAR SYNTHESIS (Strummed Acoustic & Electric Chords) ---
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barDuration) % 4;
    const chord = chordNotes[barIdx];
    const beatPos = (t / secondsPerBeat) % 4;

    // Strum times at: 0.0 (Down), 0.75 (Down), 1.5 (Up), 2.0 (Down), 2.75 (Up), 3.5 (Down-Up)
    const strums = [0.0, 0.75, 1.5, 2.0, 2.75, 3.5];
    let gL = 0;
    let gR = 0;

    for (let sIdx = 0; sIdx < strums.length; sIdx++) {
      const sBeat = strums[sIdx];
      if (beatPos >= sBeat && beatPos < sBeat + 0.9) {
        const strumT = (beatPos - sBeat) * secondsPerBeat;
        if (strumT >= 0 && strumT < 1.4) {
          // Strum across chord notes with slight string delay
          chord.chord.forEach((noteFreq, stringIdx) => {
            const stringDelay = stringIdx * 0.012; // 12ms per string strum
            const stringT = strumT - stringDelay;
            if (stringT > 0 && stringT < 1.2) {
              const pickTransient = (Math.random() * 2 - 1) * Math.exp(-stringT * 120) * 0.15;
              const stringHarmonic1 = Math.sin(2 * Math.PI * noteFreq * stringT);
              const stringHarmonic2 = Math.sin(2 * Math.PI * noteFreq * 2 * stringT) * 0.5;
              const stringHarmonic3 = Math.sin(2 * Math.PI * noteFreq * 3 * stringT) * 0.25;
              const stringEnv = Math.exp(-stringT * 3.6);
              const val = (stringHarmonic1 + stringHarmonic2 + stringHarmonic3 + pickTransient) * stringEnv;

              // Wide stereo acoustic spread
              const pan = (stringIdx / chord.chord.length) * 0.6 - 0.3; // -0.3..+0.3
              gL += val * (0.5 - pan * 0.5);
              gR += val * (0.5 + pan * 0.5);
            }
          });
        }
      }
    }

    guitarL[i] = Math.tanh(gL * 0.65) * 0.75;
    guitarR[i] = Math.tanh(gR * 0.65) * 0.75;
  }

  // --- 4. VOCALS SYNTHESIS (Warm Formant Lead Vocal Line) ---
  // Melody Notes in G Major over the 4 bars
  const melodyNotes = [
    // Bar 1 (G): D4, G4, B4, A4
    [293.66, 392.00, 493.88, 440.00],
    // Bar 2 (D): F#4, A4, D5, C#5
    [369.99, 440.00, 587.33, 554.37],
    // Bar 3 (Em): E4, G4, B4, G4
    [329.63, 392.00, 493.88, 392.00],
    // Bar 4 (C): E4, G4, C5, B4
    [329.63, 392.00, 523.25, 493.88],
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barDuration) % 4;
    const beatPos = (t / secondsPerBeat) % 4;
    const noteIdx = Math.min(3, Math.floor(beatPos));
    const targetFreq = melodyNotes[barIdx][noteIdx];
    const noteT = (beatPos % 1.0) * secondsPerBeat;

    // Vocal vibrato & expressive portamento
    const vibrato = 1 + Math.sin(2 * Math.PI * 5.6 * t) * (noteT > 0.2 ? 0.018 : 0.004);
    const f0 = targetFreq * vibrato;

    // Formant filter synthesis ('ah' and 'oh' vowel resonances at 800Hz & 1200Hz)
    const vocalEnv = Math.sin(Math.PI * Math.min(1.0, noteT / (secondsPerBeat * 0.95))) * (noteT < secondsPerBeat * 0.95 ? 1 : 0);
    const fundamental = Math.sin(2 * Math.PI * f0 * t);
    const formant1 = Math.sin(2 * Math.PI * f0 * 2 * t) * 0.7;
    const formant2 = Math.sin(2 * Math.PI * f0 * 3 * t) * 0.45;
    const formant3 = Math.sin(2 * Math.PI * f0 * 4 * t) * 0.25;
    const breath = (Math.random() * 2 - 1) * 0.05 * vocalEnv;

    const rawVocal = (fundamental + formant1 + formant2 + formant3 + breath) * vocalEnv * 0.7;
    const compressedVocal = Math.tanh(rawVocal * 1.4) * 0.8;

    vocalL[i] = compressedVocal;
    vocalR[i] = compressedVocal;
  }

  // --- 5. OTHER / SYNTH & STRINGS (Lush Atmospheric Pad) ---
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barDuration) % 4;
    const chord = chordNotes[barIdx];
    const barT = (t % barDuration) / barDuration; // 0..1 in bar

    // Smooth pad swell
    const padEnv = Math.sin(Math.PI * barT);
    let padL = 0;
    let padR = 0;

    // 3 upper triad harmonics with slow chorus detune
    chord.chord.slice(1, 4).forEach((freq, fIdx) => {
      const chorusL = Math.sin(2 * Math.PI * (freq * 1.002) * t);
      const chorusR = Math.sin(2 * Math.PI * (freq * 0.998) * t);
      const octave = Math.sin(2 * Math.PI * (freq * 2) * t) * 0.35;
      padL += (chorusL + octave) * 0.3;
      padR += (chorusR + octave) * 0.3;
    });

    otherL[i] = Math.tanh(padL * padEnv * 0.8) * 0.65;
    otherR[i] = Math.tanh(padR * padEnv * 0.8) * 0.65;
  }

  return {
    vocals: vocalBuf,
    guitar: guitarBuf,
    bass: bassBuf,
    drums: drumBuf,
    other: otherBuf,
  };
}
