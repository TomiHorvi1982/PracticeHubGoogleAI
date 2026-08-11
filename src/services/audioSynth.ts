// Web Audio API Sound Synthesizer with Enhanced Instruments, Custom Sound Mappings, Effects Chain & MIDI Polyphony

export type InstrumentProfile =
  | 'acoustic_guitar'
  | 'electric_guitar'
  | 'nylon_guitar'
  | 'bass_guitar'
  | 'grand_piano'
  | 'rhodes_ep'
  | 'analog_synth'
  | 'drums';

export interface SoundProfileOption {
  id: InstrumentProfile;
  name: string;
  czCategory: string;
  description: string;
}

export const INSTRUMENT_PROFILES: SoundProfileOption[] = [
  { id: 'acoustic_guitar', name: 'Akustická kytara (Karplus-Strong)', czCategory: 'Kytary', description: 'Reálný zvuk brnkané akustické kytary s rezonancí těla' },
  { id: 'electric_guitar', name: 'Elektrická kytara (Overdrive/Distortion)', czCategory: 'Kytary', description: 'Sytý kreslený zvuk s lampovou saturací a simulací kabinetu' },
  { id: 'nylon_guitar', name: 'Španělka / Klasická kytara (Nylon)', czCategory: 'Kytary', description: 'Jemný, teplý tón klasické kytary s mekkým dopadem' },
  { id: 'bass_guitar', name: 'Baskytara (Electric / Sub Bass)', czCategory: 'Baskytary', description: 'Hluboké basové frekvence s průrazným attackem' },
  { id: 'grand_piano', name: 'Křídlo / Akustické piano', czCategory: 'Klávesy', description: 'Tří-strunné chorusing křídlo s akustickým dozvukem soundboardu' },
  { id: 'rhodes_ep', name: 'Rhodes / Elektrické piano', czCategory: 'Klávesy', description: 'Klasické retro FM piano s kovovým tónem a tremolo modulací' },
  { id: 'analog_synth', name: 'Analogový Synth Lead', czCategory: 'Syntetizéry', description: 'Dvojitý detunovaný pilový oscilátor s rezonančním filtrem' },
  { id: 'drums', name: 'Akustické & Synth Bicí', czCategory: 'Bicí', description: 'Sada bicích s kopákem, virblem, činely a tomy' },
];

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  // Track active notes for polyphonic MIDI sustain & noteOff release
  private activeNotes: Map<string, { stop: () => void; gainNode?: GainNode }> = new Map();

  // Role -> Instrument Mapping (Persisted or Default)
  private instrumentMappings: Record<string, InstrumentProfile> = {
    'Kytara': 'acoustic_guitar',
    'Akustická kytara': 'acoustic_guitar',
    'Elektrická kytara': 'electric_guitar',
    'Basa': 'bass_guitar',
    'Baskytara': 'bass_guitar',
    'Klávesy': 'grand_piano',
    'Piano': 'grand_piano',
    'Syntetizér': 'analog_synth',
    'Bicí': 'drums',
    'Zpěv': 'rhodes_ep',
  };

  constructor() {
    this.loadMappingsFromStorage();
  }

  private loadMappingsFromStorage() {
    try {
      const saved = localStorage.getItem('strum_instrument_sound_mappings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.instrumentMappings = { ...this.instrumentMappings, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load instrument sound mappings:', e);
    }
  }

  public setInstrumentMapping(role: string, profile: InstrumentProfile) {
    this.instrumentMappings[role] = profile;
    try {
      localStorage.setItem('strum_instrument_sound_mappings', JSON.stringify(this.instrumentMappings));
    } catch (e) {
      console.error('Failed to save instrument mappings:', e);
    }
  }

  public getMappedSound(role: string): InstrumentProfile {
    return this.instrumentMappings[role] || 'acoustic_guitar';
  }

  public getAllMappings(): Record<string, InstrumentProfile> {
    return { ...this.instrumentMappings };
  }

  private initCtx(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Compressor to prevent clipping & add punch
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      // Simple algorithmic impulse reverb node
      this.reverbNode = this.createReverbBuffer(this.ctx, 1.8, 2.5);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.setValueAtTime(0.25, this.ctx.currentTime); // Reverb mix 25%

      this.masterGain.connect(this.compressor);
      this.masterGain.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private createReverbBuffer(ctx: AudioContext, seconds: number, decay: number): ConvolverNode {
    const rate = ctx.sampleRate;
    const length = rate * seconds;
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      left[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
      right[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  // Convert note name (e.g. 'C4', 'A#3') or MIDI number to frequency Hz
  public noteToFreq(note: string | number): number {
    if (typeof note === 'number') {
      return 440 * Math.pow(2, (note - 69) / 12);
    }
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const match = String(note).trim().match(/^([A-Ga-g]#?)(\d+)$/);
    if (!match) return 440;
    const noteName = match[1].toUpperCase();
    const octave = parseInt(match[2], 10);
    const noteIndex = notes.indexOf(noteName);
    if (noteIndex === -1) return 440;
    const midi = (octave + 1) * 12 + noteIndex;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // --- UNIVERSAL PLAY NOTE METHOD ---
  public playNote(
    noteOrFreq: number | string,
    profile: InstrumentProfile = 'acoustic_guitar',
    duration = 2.0,
    velocity = 0.8
  ) {
    switch (profile) {
      case 'electric_guitar':
        this.playElectricGuitarNote(noteOrFreq, duration, velocity);
        break;
      case 'nylon_guitar':
        this.playNylonGuitarNote(noteOrFreq, duration, velocity);
        break;
      case 'bass_guitar':
        this.playBassNote(noteOrFreq, duration, velocity);
        break;
      case 'grand_piano':
        this.playPianoNote(noteOrFreq, duration, velocity);
        break;
      case 'rhodes_ep':
        this.playRhodesNote(noteOrFreq, duration, velocity);
        break;
      case 'analog_synth':
        this.playAnalogSynthNote(noteOrFreq, duration, velocity);
        break;
      case 'drums':
        if (typeof noteOrFreq === 'number') {
          const drumType = noteOrFreq % 2 === 0 ? 'kick' : 'snare';
          this.playDrumSound(drumType, velocity);
        } else {
          this.playDrumSound('snare', velocity);
        }
        break;
      case 'acoustic_guitar':
      default:
        this.playGuitarNote(noteOrFreq, duration, velocity);
        break;
    }
  }

  // --- MIDI REAL-TIME POLYPHONIC NOTE ON ---
  public noteOn(noteOrFreq: number | string, profile: InstrumentProfile = 'grand_piano', velocity = 0.8) {
    const freq = typeof noteOrFreq === 'number' ? this.noteToFreq(noteOrFreq) : this.noteToFreq(noteOrFreq);
    const noteKey = `${profile}-${freq.toFixed(1)}`;

    // Stop existing note if already playing
    this.noteOff(noteOrFreq, profile);

    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(velocity * 0.7, now + 0.008);

    let stopFn = () => {};

    if (profile === 'electric_guitar') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      // Distortion waveshaper
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.makeDistortionCurve(18);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, now);

      osc.connect(shaper);
      shaper.connect(filter);
      filter.connect(mainGain);
      if (this.masterGain) mainGain.connect(this.masterGain);

      osc.start(now);
      stopFn = () => {
        const t = ctx.currentTime;
        mainGain.gain.setValueAtTime(mainGain.gain.value, t);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.stop(t + 0.16);
      };
    } else if (profile === 'bass_guitar') {
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      osc.type = 'sawtooth';
      sub.type = 'sine';

      osc.frequency.setValueAtTime(freq, now);
      sub.frequency.setValueAtTime(freq, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);

      osc.connect(filter);
      sub.connect(filter);
      filter.connect(mainGain);
      if (this.masterGain) mainGain.connect(this.masterGain);

      osc.start(now);
      sub.start(now);
      stopFn = () => {
        const t = ctx.currentTime;
        mainGain.gain.setValueAtTime(mainGain.gain.value, t);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        osc.stop(t + 0.11);
        sub.stop(t + 0.11);
      };
    } else if (profile === 'analog_synth') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'square';

      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq, now);
      osc2.detune.setValueAtTime(8, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 3, now);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(mainGain);
      if (this.masterGain) mainGain.connect(this.masterGain);

      osc1.start(now);
      osc2.start(now);

      stopFn = () => {
        const t = ctx.currentTime;
        mainGain.gain.setValueAtTime(mainGain.gain.value, t);
        mainGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc1.stop(t + 0.21);
        osc2.stop(t + 0.21);
      };
    } else {
      // Piano & default fallback
      this.playNote(freq, profile, 2.5, velocity);
      return;
    }

    this.activeNotes.set(noteKey, { stop: stopFn, gainNode: mainGain });
  }

  // --- MIDI REAL-TIME POLYPHONIC NOTE OFF ---
  public noteOff(noteOrFreq: number | string, profile: InstrumentProfile = 'grand_piano') {
    const freq = typeof noteOrFreq === 'number' ? this.noteToFreq(noteOrFreq) : this.noteToFreq(noteOrFreq);
    const noteKey = `${profile}-${freq.toFixed(1)}`;

    const active = this.activeNotes.get(noteKey);
    if (active) {
      active.stop();
      this.activeNotes.delete(noteKey);
    }
  }

  // --- ACOUSTIC GUITAR SYNTH (Karplus-Strong) ---
  public playGuitarNote(freqOrNote: number | string, duration = 2.0, volume = 0.5) {
    const ctx = this.initCtx();
    const freq = typeof freqOrNote === 'number' ? freqOrNote : this.noteToFreq(freqOrNote);
    const now = ctx.currentTime;

    const bufferSize = Math.max(2, Math.round(ctx.sampleRate / freq));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // String brightness decay
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 6, 8000), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 200), now + duration);

    // Body resonance peak
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'peaking';
    bodyFilter.frequency.setValueAtTime(220, now);
    bodyFilter.gain.setValueAtTime(4, now);
    bodyFilter.Q.setValueAtTime(2, now);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(volume * 0.8, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    whiteNoise.connect(filter);
    filter.connect(bodyFilter);
    bodyFilter.connect(gainNode);
    if (this.masterGain) gainNode.connect(this.masterGain);

    whiteNoise.start(now);
    whiteNoise.stop(now + duration);
  }

  // --- ELECTRIC GUITAR WITH OVERDRIVE / TUBE SATURATION ---
  public playElectricGuitarNote(freqOrNote: number | string, duration = 2.2, volume = 0.5) {
    const ctx = this.initCtx();
    const freq = typeof freqOrNote === 'number' ? freqOrNote : this.noteToFreq(freqOrNote);
    const now = ctx.currentTime;

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'square';

    oscA.frequency.setValueAtTime(freq, now);
    oscB.frequency.setValueAtTime(freq, now);
    oscB.detune.setValueAtTime(5, now);

    // WaveShaper distortion distortion curve
    const distortion = ctx.createWaveShaper();
    distortion.curve = this.makeDistortionCurve(25);

    // Cabinet Simulator lowpass filter
    const cabinet = ctx.createBiquadFilter();
    cabinet.type = 'lowpass';
    cabinet.frequency.setValueAtTime(2800, now);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume * 0.6, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(volume * 0.25, now + 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscA.connect(distortion);
    oscB.connect(distortion);
    distortion.connect(cabinet);
    cabinet.connect(gainNode);
    if (this.masterGain) gainNode.connect(this.masterGain);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + duration);
    oscB.stop(now + duration);
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = typeof amount === 'number' ? amount : 20;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // --- NYLON GUITAR ---
  public playNylonGuitarNote(freqOrNote: number | string, duration = 2.0, volume = 0.5) {
    const ctx = this.initCtx();
    const freq = typeof freqOrNote === 'number' ? freqOrNote : this.noteToFreq(freqOrNote);
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + duration);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume * 0.7, now + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gainNode);
    if (this.masterGain) gainNode.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  // --- BASS GUITAR SYNTH ---
  public playBassNote(freqOrNote: number | string, duration = 2.0, volume = 0.6) {
    const ctx = this.initCtx();
    const freq = typeof freqOrNote === 'number' ? freqOrNote : this.noteToFreq(freqOrNote);
    const now = ctx.currentTime;

    const oscSub = ctx.createOscillator();
    const oscSaw = ctx.createOscillator();
    oscSub.type = 'sine';
    oscSaw.type = 'sawtooth';

    oscSub.frequency.setValueAtTime(freq, now);
    oscSaw.frequency.setValueAtTime(freq, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + duration);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume * 0.9, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscSub.connect(filter);
    oscSaw.connect(filter);
    filter.connect(gainNode);
    if (this.masterGain) gainNode.connect(this.masterGain);

    oscSub.start(now);
    oscSaw.start(now);
    oscSub.stop(now + duration);
    oscSaw.stop(now + duration);
  }

  // --- ACOUSTIC GRAND PIANO SYNTH ---
  public playPianoNote(freqOrNote: number | string, duration = 2.2, volume = 0.5) {
    const ctx = this.initCtx();
    const freq = typeof freqOrNote === 'number' ? freqOrNote : this.noteToFreq(freqOrNote);
    const now = ctx.currentTime;

    const oscMainA = ctx.createOscillator();
    const oscMainB = ctx.createOscillator();
    const oscOvertone = ctx.createOscillator();
    const oscSub = ctx.createOscillator();

    oscMainA.type = 'sine';
    oscMainB.type = 'sine';
    oscOvertone.type = 'triangle';
    oscSub.type = 'sine';

    const detuneCents = 1.8;
    oscMainA.frequency.setValueAtTime(freq, now);
    oscMainA.detune.setValueAtTime(detuneCents, now);

    oscMainB.frequency.setValueAtTime(freq, now);
    oscMainB.detune.setValueAtTime(-detuneCents, now);

    oscOvertone.frequency.setValueAtTime(freq * 2, now);
    oscSub.frequency.setValueAtTime(freq * 0.5, now);

    const mainGain = ctx.createGain();
    const overtoneGain = ctx.createGain();
    const subGain = ctx.createGain();

    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(volume * 0.7, now + 0.005);
    mainGain.gain.exponentialRampToValueAtTime(volume * 0.3, now + 0.15);
    mainGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    overtoneGain.gain.setValueAtTime(0, now);
    overtoneGain.gain.linearRampToValueAtTime(volume * 0.35, now + 0.003);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.35);

    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(volume * 0.15, now + 0.008);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.6);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 5, 7500), now);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 2, 2500), now + duration);

    oscMainA.connect(mainGain);
    oscMainB.connect(mainGain);
    oscOvertone.connect(overtoneGain);
    oscSub.connect(subGain);

    mainGain.connect(filter);
    overtoneGain.connect(filter);
    subGain.connect(filter);

    if (this.masterGain) filter.connect(this.masterGain);

    oscMainA.start(now);
    oscMainB.start(now);
    oscOvertone.start(now);
    oscSub.start(now);

    oscMainA.stop(now + duration);
    oscMainB.stop(now + duration);
    oscOvertone.stop(now + duration);
    oscSub.stop(now + duration);
  }

  // --- RHODES ELECTRIC PIANO SYNTH ---
  public playRhodesNote(freqOrNote: number | string, duration = 2.2, volume = 0.5) {
    const ctx = this.initCtx();
    const freq = typeof freqOrNote === 'number' ? freqOrNote : this.noteToFreq(freqOrNote);
    const now = ctx.currentTime;

    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();

    carrier.type = 'sine';
    modulator.type = 'sine';

    carrier.frequency.setValueAtTime(freq, now);
    modulator.frequency.setValueAtTime(freq * 4, now); // FM metallic tine ratio

    modGain.gain.setValueAtTime(freq * 2, now);
    modGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume * 0.7, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    carrier.connect(gainNode);
    if (this.masterGain) gainNode.connect(this.masterGain);

    carrier.start(now);
    modulator.start(now);
    carrier.stop(now + duration);
    modulator.stop(now + duration);
  }

  // --- ANALOG SYNTH LEAD ---
  public playAnalogSynthNote(freqOrNote: number | string, duration = 2.0, volume = 0.5) {
    const ctx = this.initCtx();
    const freq = typeof freqOrNote === 'number' ? freqOrNote : this.noteToFreq(freqOrNote);
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq, now);
    osc2.detune.setValueAtTime(10, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, now + duration);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume * 0.6, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    if (this.masterGain) gainNode.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }

  // --- GUITAR CHORD STRUM ---
  public playGuitarChord(frets: number[], baseTuning = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63], profile: InstrumentProfile = 'acoustic_guitar') {
    frets.forEach((fret, stringIdx) => {
      if (fret >= 0) {
        const baseFreq = baseTuning[stringIdx];
        const freq = baseFreq * Math.pow(2, fret / 12);
        setTimeout(() => {
          this.playNote(freq, profile, 2.5, 0.45);
        }, stringIdx * 35);
      }
    });
  }

  // --- PIANO CHORD STRUM ---
  public playPianoChord(keysOrNotes: (number | string)[], baseOctave = 4, duration = 2.5, volume = 0.45, profile: InstrumentProfile = 'grand_piano') {
    if (!keysOrNotes || keysOrNotes.length === 0) return;

    let previousMidi = -1;
    keysOrNotes.forEach((key, idx) => {
      let freq: number;
      if (typeof key === 'number') {
        let midi = key;
        if (key >= 0 && key <= 11) {
          midi = (baseOctave + 1) * 12 + key;
          if (midi <= previousMidi) {
            midi += 12;
          }
        }
        previousMidi = midi;
        freq = 440 * Math.pow(2, (midi - 69) / 12);
      } else {
        freq = this.noteToFreq(key);
      }

      setTimeout(() => {
        this.playNote(freq, profile, duration, volume);
      }, idx * 12);
    });
  }

  // --- DRUM SYNTH ---
  public playDrumSound(type: string, volume = 0.7) {
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    switch (type) {
      case 'kick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);

        gain.gain.setValueAtTime(volume * 1.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      case 'snare': {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        oscGain.gain.setValueAtTime(volume, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(volume * 0.85, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(oscGain);
        if (this.masterGain) oscGain.connect(this.masterGain);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        if (this.masterGain) noiseGain.connect(this.masterGain);

        osc.start(now);
        noise.start(now);
        osc.stop(now + 0.2);
        noise.stop(now + 0.2);
        break;
      }
      case 'hihat_closed': {
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        noise.connect(filter);
        filter.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        noise.start(now);
        break;
      }
      case 'hihat_open': {
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 6000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        noise.connect(filter);
        filter.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        noise.start(now);
        break;
      }
      case 'tom_low':
      case 'tom_high': {
        const isHigh = type === 'tom_high';
        const startFreq = isHigh ? 180 : 110;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 0.4, now + 0.3);

        gain.gain.setValueAtTime(volume * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
      case 'crash':
      case 'ride': {
        const duration = type === 'crash' ? 1.2 : 0.8;
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = type === 'crash' ? 4500 : 5500;
        filter.Q.value = 1.2;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        noise.start(now);
        break;
      }
    }
  }

  // --- METRONOME CLICK ---
  public playMetronomeClick(accent = false) {
    const ctx = this.initCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 1200 : 800, now);

    gain.gain.setValueAtTime(accent ? 0.9 : 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    if (this.masterGain) gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);
  }
}

export const audioSynth = new SoundSynthesizer();
