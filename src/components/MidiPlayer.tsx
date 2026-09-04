import React, { useState, useEffect, useRef } from 'react';
import { Midi } from '@tonejs/midi';
import { audioSynth, InstrumentProfile } from '../services/audioSynth';
import {
  Play, Pause, RotateCcw, Upload, Music, Disc, Volume2,
  VolumeX, Sliders, Check, FileAudio, PlayCircle
} from 'lucide-react';

interface MidiPlayerProps {
  className?: string;
}

interface ProcessedNote {
  midi: number;
  name: string;
  time: number; // start time in sec
  duration: number; // duration in sec
  velocity: number;
  trackIdx: number;
  isPercussion: boolean;
}

export const MidiPlayer: React.FC<MidiPlayerProps> = ({ className = '' }) => {
  const [midiData, setMidiData] = useState<Midi | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0); // 0.5, 0.75, 1.0, 1.25, 1.5
  const [selectedSound, setSelectedSound] = useState<'piano' | 'guitar' | 'drums'>('piano');
  const [mutedTracks, setMutedTracks] = useState<Record<number, boolean>>({});
  const [isLooping, setIsLooping] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);

  // Flattened active notes for fast lookup
  const allNotesRef = useRef<ProcessedNote[]>([]);
  const playedNoteSetRef = useRef<Set<string>>(new Set());

  // Load and parse ArrayBuffer MIDI
  const loadMidiBuffer = async (buffer: ArrayBuffer, name: string) => {
    try {
      const midi = new Midi(buffer);
      setMidiData(midi);
      setFileName(name);
      setCurrentTime(0);
      currentTimeRef.current = 0;
      setIsPlaying(false);
      playedNoteSetRef.current.clear();

      // Mute state reset
      const muted: Record<number, boolean> = {};
      midi.tracks.forEach((_, idx) => {
        muted[idx] = false;
      });
      setMutedTracks(muted);

      // Process all notes into flat array
      const flatNotes: ProcessedNote[] = [];
      midi.tracks.forEach((track, trackIdx) => {
        const isPercussion = track.channel === 9 || track.channel === 10;
        track.notes.forEach((note) => {
          flatNotes.push({
            midi: note.midi,
            name: note.name,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity,
            trackIdx,
            isPercussion,
          });
        });
      });

      // Sort by time
      flatNotes.sort((a, b) => a.time - b.time);
      allNotesRef.current = flatNotes;
    } catch (err) {
      console.error('Chyba při načítání MIDI souboru:', err);
      alert('Chyba při načítání MIDI souboru. Zkontrolujte, zda jde o platný tvar .mid/.midi.');
    }
  };

  // File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result instanceof ArrayBuffer) {
        loadMidiBuffer(event.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Sample MIDI Generator for instant demo testing
  const loadDemoMidi = (type: 'furelise' | 'blues' | 'bach') => {
    let demoNotes: ProcessedNote[] = [];
    let name = 'Demo MIDI';

    if (type === 'furelise') {
      name = 'Beethoven - Pro Elišku (Demo MIDI)';
      // E5, D#5, E5, D#5, E5, B4, D5, C5, A4
      const seq = [
        { midi: 76, name: 'E5', dur: 0.25 },
        { midi: 75, name: 'D#5', dur: 0.25 },
        { midi: 76, name: 'E5', dur: 0.25 },
        { midi: 75, name: 'D#5', dur: 0.25 },
        { midi: 76, name: 'E5', dur: 0.25 },
        { midi: 71, name: 'B4', dur: 0.25 },
        { midi: 74, name: 'D5', dur: 0.25 },
        { midi: 72, name: 'C5', dur: 0.25 },
        { midi: 69, name: 'A4', dur: 0.75 },
        { midi: 60, name: 'C4', dur: 0.25 },
        { midi: 64, name: 'E4', dur: 0.25 },
        { midi: 69, name: 'A4', dur: 0.25 },
        { midi: 71, name: 'B4', dur: 0.75 },
        { midi: 64, name: 'E4', dur: 0.25 },
        { midi: 68, name: 'G#4', dur: 0.25 },
        { midi: 71, name: 'B4', dur: 0.25 },
        { midi: 72, name: 'C5', dur: 0.75 },
      ];
      let t = 0;
      seq.forEach((item, idx) => {
        demoNotes.push({
          midi: item.midi,
          name: item.name,
          time: t,
          duration: item.dur,
          velocity: 0.7,
          trackIdx: 0,
          isPercussion: false,
        });
        t += item.dur * 1.1;
      });
    } else if (type === 'blues') {
      name = '12-Bar Blues Riff (Demo MIDI)';
      const bluesMidis = [60, 60, 64, 64, 65, 65, 64, 64, 65, 65, 69, 69, 60, 60, 67, 65];
      let t = 0;
      bluesMidis.forEach((midi, idx) => {
        demoNotes.push({
          midi,
          name: `Note ${midi}`,
          time: t,
          duration: 0.2,
          velocity: 0.8,
          trackIdx: 0,
          isPercussion: false,
        });
        t += 0.3;
      });
    } else {
      name = 'J.S. Bach - Preludium v C dur (Demo MIDI)';
      const bachArp = [60, 64, 67, 72, 76, 67, 72, 76, 60, 64, 67, 72, 76, 67, 72, 76];
      let t = 0;
      bachArp.forEach((midi) => {
        demoNotes.push({
          midi,
          name: `Note ${midi}`,
          time: t,
          duration: 0.22,
          velocity: 0.75,
          trackIdx: 0,
          isPercussion: false,
        });
        t += 0.25;
      });
    }

    const duration = demoNotes[demoNotes.length - 1].time + 1.0;
    const dummyMidi = {
      name,
      duration,
      header: {
        tempos: [{ bpm: 120 }],
        timeSignatures: [{ timeSignature: [4, 4] }],
      },
      tracks: [
        {
          name: 'Hlavní stopa',
          channel: 0,
          notes: demoNotes,
        },
      ],
    } as unknown as Midi;

    setMidiData(dummyMidi);
    setFileName(name);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setIsPlaying(false);
    playedNoteSetRef.current.clear();
    setMutedTracks({ 0: false });
    allNotesRef.current = demoNotes;
  };

  // Playback Loop Animation & Sound Scheduler
  useEffect(() => {
    if (!isPlaying || !midiData) return;

    lastTickTimeRef.current = performance.now();

    const loop = (now: number) => {
      const deltaSec = ((now - lastTickTimeRef.current) / 1000) * playbackRate;
      lastTickTimeRef.current = now;

      const nextTime = currentTimeRef.current + deltaSec;
      const totalDur = midiData.duration || 10;

      if (nextTime >= totalDur) {
        if (isLooping) {
          currentTimeRef.current = 0;
          setCurrentTime(0);
          playedNoteSetRef.current.clear();
        } else {
          setIsPlaying(false);
          setCurrentTime(totalDur);
          currentTimeRef.current = totalDur;
          return;
        }
      } else {
        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
      }

      // Check and trigger notes that fall in current time window
      const windowStart = currentTimeRef.current - 0.05;
      const windowEnd = currentTimeRef.current;

      allNotesRef.current.forEach((note) => {
        if (mutedTracks[note.trackIdx]) return;

        if (note.time >= windowStart && note.time <= windowEnd) {
          const noteKey = `${note.trackIdx}-${note.time}-${note.midi}`;
          if (!playedNoteSetRef.current.has(noteKey)) {
            playedNoteSetRef.current.add(noteKey);

            // Play sound based on selected sound or percussion
            if (note.isPercussion || selectedSound === 'drums') {
              const drumType = note.midi % 2 === 0 ? 'kick' : 'snare';
              audioSynth.playDrumSound(drumType, note.velocity);
            } else {
              let profile: InstrumentProfile = 'grand_piano';
              if (selectedSound === 'guitar') profile = 'electric_guitar';
              else if (selectedSound === 'piano') profile = 'grand_piano';
              else if (selectedSound === 'drums') profile = 'drums';

              // Polyphonic note trigger
              audioSynth.noteOn(note.midi, profile, note.velocity);
              
              // Schedule note off
              setTimeout(() => {
                audioSynth.noteOff(note.midi, profile);
              }, Math.max(80, note.duration * 1000));
            }
          }
        }
      });

      renderPianoRoll();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, midiData, playbackRate, selectedSound, mutedTracks, isLooping]);

  // Seek time handler
  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
    // Clear played notes after the new seek position so upcoming notes trigger
    playedNoteSetRef.current.clear();
    allNotesRef.current.forEach((note) => {
      if (note.time < newTime) {
        playedNoteSetRef.current.add(`${note.trackIdx}-${note.time}-${note.midi}`);
      }
    });
    renderPianoRoll();
  };

  // Canvas Piano Roll Renderer
  const renderPianoRoll = () => {
    const canvas = canvasRef.current;
    if (!canvas || !midiData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1C1C1C';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const curTime = currentTimeRef.current;
    const timeWindow = 4.0; // 4 seconds visible window
    const minMidi = 36; // C2
    const maxMidi = 96; // C7
    const midiRange = maxMidi - minMidi;

    // Draw notes
    allNotesRef.current.forEach((note) => {
      if (mutedTracks[note.trackIdx]) return;

      const relTime = note.time - curTime;
      if (relTime > -1 && relTime < timeWindow) {
        const x = (relTime / timeWindow) * width;
        const noteWidth = Math.max(4, (note.duration / timeWindow) * width);
        const y = height - ((note.midi - minMidi) / midiRange) * height;

        const isCurrent = Math.abs(relTime) < 0.1;

        if (isCurrent) {
          ctx.fillStyle = '#FF3E00';
          ctx.shadowColor = '#FF3E00';
          ctx.shadowBlur = 8;
        } else {
          ctx.fillStyle = note.trackIdx % 2 === 0 ? '#00FF41' : '#00E5FF';
          ctx.shadowBlur = 0;
        }

        ctx.fillRect(x, y - 3, noteWidth, 6);
      }
    });

    // Playhead line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#FF3E00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.stroke();
  };

  useEffect(() => {
    renderPianoRoll();
  }, [midiData, currentTime]);

  const totalDuration = midiData?.duration || 0;
  const initialBpm = midiData?.header?.tempos?.[0]?.bpm ? Math.round(midiData.header.tempos[0].bpm) : 120;

  return (
    <div className={`bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 font-sans space-y-4 shadow-xl text-white ${className}`}>
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-info/10 border border-info/30 text-info rounded-2xl">
            <Disc className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-info text-white font-bold px-2 py-0.5 text-stitek rounded-md uppercase tracking-wide">
                MIDI Player
              </span>
              <span className="text-xs text-neutral-400 font-medium">Syntetizér &amp; Piano Roll</span>
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight mt-0.5">
              Přehrávač a Vizualizér MIDI Souborů
            </h3>
          </div>
        </div>

        {/* Upload Button */}
        <label className="flex items-center gap-2 px-4 py-2.5 bg-info hover:bg-[#0071e3] text-white font-bold text-xs uppercase rounded-2xl cursor-pointer transition-all shadow-md active:scale-95">
          <Upload className="w-4 h-4" />
          <span>Nahrát soubor .mid</span>
          <input
            type="file"
            accept=".mid,.midi"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Demo Preset Buttons */}
      <div className="flex flex-wrap items-center gap-2 bg-black/40 p-3 rounded-2xl border border-white/5">
        <span className="text-xs text-neutral-400 font-medium mr-1">Ukázkové MIDI skladby:</span>
        <button
          onClick={() => loadDemoMidi('furelise')}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-uspech border border-white/10 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <PlayCircle className="w-3.5 h-3.5 text-uspech" /> Beethoven - Pro Elišku
        </button>
        <button
          onClick={() => loadDemoMidi('bach')}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-uspech border border-white/10 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <PlayCircle className="w-3.5 h-3.5 text-uspech" /> Bach - Preludium v C
        </button>
        <button
          onClick={() => loadDemoMidi('blues')}
          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-uspech border border-white/10 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <PlayCircle className="w-3.5 h-3.5 text-uspech" /> 12-Bar Blues Riff
        </button>
      </div>

      {midiData ? (
        <div className="space-y-4">
          
          {/* Active MIDI Info Bar */}
          <div className="bg-uspech/10 border border-uspech/30 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-uspech/20 text-uspech rounded-xl">
                <FileAudio className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white block text-sm">{fileName || midiData.name}</span>
                <span className="text-xs text-neutral-300">
                  Původní tempo: <strong className="text-white">{initialBpm} BPM</strong> | Stop: <strong className="text-white">{midiData.tracks.length}</strong> | Not: <strong className="text-white">{allNotesRef.current.length}</strong>
                </span>
              </div>
            </div>

            {/* Sound Synthesizer Selector */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              <span className="text-stitek text-neutral-400 font-semibold px-1.5 uppercase">Zvuk:</span>
              <button
                onClick={() => setSelectedSound('piano')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  selectedSound === 'piano' ? 'bg-white text-black font-bold shadow-md' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Klavír
              </button>
              <button
                onClick={() => setSelectedSound('guitar')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  selectedSound === 'guitar' ? 'bg-white text-black font-bold shadow-md' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Kytara
              </button>
              <button
                onClick={() => setSelectedSound('drums')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  selectedSound === 'drums' ? 'bg-white text-black font-bold shadow-md' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Bicí
              </button>
            </div>
          </div>

          {/* Interactive Visual Piano Roll Canvas */}
          <div className="border border-white/5 bg-black/40 rounded-2xl p-3 relative">
            <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
              <span className="font-medium">Vizuální Piano Roll osnova</span>
              <span className="font-mono text-white">{currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s</span>
            </div>
            <canvas
              ref={canvasRef}
              width={800}
              height={120}
              className="w-full h-28 bg-black/60 rounded-xl border border-white/5"
            />
          </div>

          {/* Playback Controls & Timeline Slider */}
          <div className="bg-black/40 p-4 sm:p-5 rounded-2xl border border-white/5 space-y-4">
            
            {/* Seek Bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-uspech">
                {Math.floor(currentTime / 60)}:{(Math.floor(currentTime) % 60).toString().padStart(2, '0')}
              </span>
              <input
                type="range"
                min={0}
                max={totalDuration || 1}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="flex-1 accent-uspech cursor-pointer"
              />
              <span className="text-xs font-mono text-neutral-400">
                {Math.floor(totalDuration / 60)}:{(Math.floor(totalDuration) % 60).toString().padStart(2, '0')}
              </span>
            </div>

            {/* Main Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`px-5 py-2.5 font-bold text-xs uppercase flex items-center gap-2 rounded-2xl shadow-lg cursor-pointer transition-all active:scale-95 ${
                    isPlaying
                      ? 'bg-chyba text-white hover:bg-[#ff5b52]'
                      : 'bg-uspech text-black hover:bg-[#34e260]'
                  }`}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{isPlaying ? 'Pauza' : 'Přehrát MIDI'}</span>
                </button>

                <button
                  onClick={() => handleSeek(0)}
                  className="p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/10 cursor-pointer transition-all"
                  title="Na začátek"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setIsLooping(!isLooping)}
                  className={`px-3 py-2 text-xs font-semibold rounded-2xl border transition-all cursor-pointer ${
                    isLooping ? 'bg-uspech/20 text-uspech border-uspech/40' : 'bg-white/5 text-neutral-400 border-white/10 hover:text-white'
                  }`}
                >
                  Smyčka: {isLooping ? 'Zapnuto' : 'Vypnuto'}
                </button>
              </div>

              {/* Playback Speed Multiplier */}
              <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-xl border border-white/10">
                <span className="text-xs text-neutral-400 font-medium mr-1.5">Rychlost:</span>
                {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setPlaybackRate(rate)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      playbackRate === rate
                        ? 'bg-white text-black font-bold shadow-md'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* MIDI Tracks Mute / Inspector Panel */}
          {midiData.tracks.length > 0 && (
            <div className="bg-black/40 p-4 sm:p-5 rounded-2xl border border-white/5 space-y-3">
              <span className="text-xs font-bold text-neutral-300 block border-b border-white/5 pb-2">
                Stopy souboru MIDI (možnost ztlumení):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {midiData.tracks.map((track, idx) => {
                  if (track.notes.length === 0) return null;
                  const isMuted = mutedTracks[idx];

                  return (
                    <button
                      key={idx}
                      onClick={() =>
                        setMutedTracks((prev) => ({ ...prev, [idx]: !prev[idx] }))
                      }
                      className={`p-3 text-left rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ${
                        isMuted
                          ? 'bg-red-500/10 border-red-500/20 text-neutral-500 opacity-60'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <span className="font-semibold block truncate text-sm">
                          {track.name || `Stopa #${idx + 1}`}
                        </span>
                        <span className="text-drobne text-neutral-400">
                          {track.notes.length} not • Kanál: {track.channel}
                        </span>
                      </div>

                      {isMuted ? (
                        <VolumeX className="w-4 h-4 text-red-400 shrink-0" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-uspech shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      ) : (
        /* Empty State */
        <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center bg-black/20 space-y-3">
          <FileAudio className="w-10 h-10 text-neutral-500 mx-auto" />
          <div>
            <h4 className="text-sm font-bold text-white">Žádný MIDI soubor není nahrán</h4>
            <p className="text-xs text-neutral-400 mt-1">
              Nahrajte soubor <strong className="text-white">.mid</strong> nebo <strong className="text-white">.midi</strong>, případně zvolte jednu z ukázkových skladeb výše.
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
