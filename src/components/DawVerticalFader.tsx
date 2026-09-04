import React, { useState, useRef, useEffect } from 'react';
import { Radio, Volume2, VolumeX, Sparkles, RotateCcw } from 'lucide-react';
import { ChannelState } from '../services/stemAudioService';

interface DawVerticalFaderProps {
  stemId: string;
  name: string;
  channel: ChannelState;
  meterLevel: number; // 0 to 1
  isPlaying: boolean;
  isLoading?: boolean;
  onUpdate: (updates: Partial<ChannelState>) => void;
  colorTheme?: {
    accent: string;
    badge: string;
    bg: string;
    border: string;
  };
  compact?: boolean;
}

export const DawVerticalFader: React.FC<DawVerticalFaderProps> = ({
  stemId,
  name,
  channel,
  meterLevel = 0,
  isPlaying,
  isLoading = false,
  onUpdate,
  colorTheme = {
    accent: '#FF9F0A',
    badge: 'bg-amber-500',
    bg: 'from-amber-500/10 to-amber-950/20',
    border: 'border-amber-500/30',
  },
  compact = false,
}) => {
  const isGuitar = stemId === 'guitar';
  const faderTrackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // dB range: -60 dB to +6 dB (total 66 dB span)
  const minDb = -60;
  const maxDb = 6;
  const dbSpan = maxDb - minDb;

  // Convert volume dB to 0..1 percentage position (0 = bottom/-60dB, 1 = top/+6dB)
  const volumePercentage = Math.max(0, Math.min(1, (channel.volume - minDb) / dbSpan));

  // Handle vertical fader mouse dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateFromPointer(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const updateFromPointer = (clientY: number) => {
    if (!faderTrackRef.current) return;
    const rect = faderTrackRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    // Invert Y: top is 1 (maxDb), bottom is 0 (minDb)
    const ratio = Math.max(0, Math.min(1, 1 - relativeY / rect.height));
    let dbValue = minDb + ratio * dbSpan;
    // Snap close to 0 dB
    if (Math.abs(dbValue) < 0.35) {
      dbValue = 0;
    } else {
      dbValue = Math.round(dbValue * 10) / 10;
    }
    onUpdate({ volume: dbValue });
  };

  // Double click resets to 0.0 dB
  const handleResetVolume = () => {
    onUpdate({ volume: 0 });
  };

  // Meter height calculation
  const meterHeightPercent = isPlaying && !channel.isMuted ? Math.min(100, Math.max(0, meterLevel * 100)) : 0;
  const isClipping = meterHeightPercent > 92;

  // Format dB string
  const formatDb = (db: number) => {
    if (channel.isMuted) return 'MUTE';
    if (db <= -60) return '-inf dB';
    if (db > 0) return `+${db.toFixed(1)} dB`;
    return `${db.toFixed(1)} dB`;
  };

  // Ticks for vertical scale
  const ticks = [
    { label: '+6', db: 6 },
    { label: '0', db: 0 },
    { label: '-6', db: -6 },
    { label: '-18', db: -18 },
    { label: '-30', db: -30 },
    { label: '-inf', db: -60 },
  ];

  return (
    <div
      className={`rounded-3xl border ${
        channel.isSolo
          ? 'border-amber-400/90 shadow-[0_0_20px_rgba(255,159,10,0.25)] bg-[#1c1a16]'
          : `${colorTheme.border} bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95`
      } p-3.5 flex flex-col justify-between select-none shadow-xl transition-all relative overflow-hidden`}
    >
      {/* Channel Top Header: Name & Track Type Badge */}
      <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full ${colorTheme.badge} shrink-0`} />
          <span className="font-bold text-xs text-white truncate tracking-tight" title={name}>
            {name.split(' ')[0]}
          </span>
        </div>

        {/* Solo & Mute Buttons in DAW style */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onUpdate({ isMuted: !channel.isMuted })}
            className={`w-6 h-6 rounded-md font-black text-stitek flex items-center justify-center transition-all cursor-pointer border ${
              channel.isMuted
                ? 'bg-rose-600 text-white border-rose-400 shadow-[0_0_8px_rgba(225,29,72,0.6)]'
                : 'bg-neutral-800/80 text-neutral-400 hover:text-white border-neutral-700 hover:bg-neutral-700'
            }`}
            title={channel.isMuted ? 'Ztlumeno (Mute)' : 'Ztlumit stopu'}
          >
            M
          </button>
          <button
            onClick={() => onUpdate({ isSolo: !channel.isSolo })}
            className={`w-6 h-6 rounded-md font-black text-stitek flex items-center justify-center transition-all cursor-pointer border ${
              channel.isSolo
                ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)]'
                : 'bg-neutral-800/80 text-neutral-400 hover:text-amber-300 border-neutral-700 hover:bg-neutral-700'
            }`}
            title={channel.isSolo ? 'Solo aktivní' : 'Aktivovat Solo pro tuto stopu'}
          >
            S
          </button>
        </div>
      </div>

      {/* Main Center Area: Vertical DAW Fader + LED VU Meter */}
      <div className="my-3 flex items-center justify-center gap-3 px-1">
        {/* dB Tick Marks */}
        <div className="flex flex-col justify-between h-48 py-1 text-stitek font-mono text-neutral-500 select-none text-right w-6">
          {ticks.map((t) => (
            <span
              key={t.label}
              onClick={() => onUpdate({ volume: t.db })}
              className="cursor-pointer hover:text-neutral-300 transition-colors"
            >
              {t.label}
            </span>
          ))}
        </div>

        {/* FADER TRACK & THUMB CONTAINER */}
        <div
          ref={faderTrackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleResetVolume}
          className="relative w-8 h-48 bg-podklad rounded-xl border border-neutral-800 shadow-inner flex items-center justify-center cursor-ns-resize group"
          title="Tažením nahoru/dolů měníte hlasitost (Dvojklik = 0 dB)"
        >
          {/* Center Track Slot Groove */}
          <div className="absolute top-3 bottom-3 w-1.5 bg-podklad rounded-full border-r border-b border-neutral-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]" />

          {/* 0 dB Center Zero Mark Line */}
          <div
            className="absolute left-0 right-0 h-[1px] bg-neutral-700 pointer-events-none"
            style={{ bottom: `${((0 - minDb) / dbSpan) * 100}%` }}
          />

          {/* METALLIC DAW FADER CAP */}
          <div
            className="absolute left-0 right-0 h-9 -ml-0.5 -mr-0.5 rounded-lg transition-transform duration-75 flex flex-col items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.4)] cursor-ns-resize"
            style={{
              bottom: `calc(${volumePercentage * 100}% - 18px)`,
              background: 'linear-gradient(180deg, #4a4a52 0%, #2b2b32 45%, #18181c 50%, #2f2f36 55%, #3d3d46 100%)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {/* Grip Ridges */}
            <div className="w-4 h-[1px] bg-neutral-600 mb-0.5" />
            {/* Center Bright Indicator Line */}
            <div
              className="w-5 h-[2px] rounded-full shadow-[0_0_4px_currentColor]"
              style={{ backgroundColor: colorTheme.accent }}
            />
            <div className="w-4 h-[1px] bg-neutral-600 mt-0.5" />
          </div>
        </div>

        {/* LED VU / PEAK GAIN METER */}
        <div className="flex flex-col items-center gap-1">
          {/* Clip Indicator LED */}
          <div
            className={`w-2.5 h-2 rounded-sm border ${
              isClipping
                ? 'bg-rose-500 border-rose-300 shadow-[0_0_8px_#f43f5e]'
                : 'bg-rose-950/40 border-rose-900/40'
            }`}
            title="Clip Peak Level"
          />

          {/* Vertical Multi-segment LED Bar */}
          <div className="w-2.5 h-44 bg-podklad border border-neutral-800 rounded-sm overflow-hidden relative flex flex-col-reverse shadow-inner">
            {/* Active meter level bar */}
            <div
              className="w-full transition-all duration-75"
              style={{
                height: `${meterHeightPercent}%`,
                background:
                  'linear-gradient(0deg, #10b981 0%, #22c55e 60%, #eab308 80%, #f97316 92%, #ef4444 100%)',
              }}
            />

            {/* LED Ladder Segments Overlay Grid */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
              {Array.from({ length: 22 }).map((_, i) => (
                <div key={i} className="h-[1px] bg-black w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DIGITAL READOUT DISPLAY */}
      <div
        onDoubleClick={handleResetVolume}
        className="bg-[#0a0a0c] border border-white/10 rounded-xl py-1 px-2 text-center shadow-inner cursor-pointer hover:border-amber-500/40 transition-colors relative"
        title="Dvojklikem resetujete na 0.0 dB"
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-1 text-drobne font-mono text-amber-400 font-bold animate-pulse">
            <RotateCcw className="w-3 h-3 animate-spin" />
            <span>SYNC...</span>
          </div>
        ) : (
          <span
            className={`font-mono text-xs font-bold tracking-wider ${
              channel.isMuted
                ? 'text-rose-400'
                : channel.volume > 0
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {formatDb(channel.volume)}
          </span>
        )}
      </div>

      {/* ADDITIONAL DAW CONTROLS (PAN, PITCH, GUITAR M/S) */}
      {!compact && (
        <div className="mt-3 space-y-2.5 pt-2.5 border-t border-white/[0.08] text-xs">
          {/* Pan Rotary / Slider */}
          <div className="bg-black/40 p-2 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex justify-between text-stitek font-mono text-neutral-400">
              <span>Pan</span>
              <span className="font-bold text-emerald-400">
                {channel.pan === 0
                  ? 'Center'
                  : channel.pan < 0
                  ? `L ${Math.abs(Math.round(channel.pan * 100))}`
                  : `R ${Math.round(channel.pan * 100)}`}
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={channel.pan}
              onChange={(e) => onUpdate({ pan: parseFloat(e.target.value) })}
              className="w-full accent-emerald-500 h-1.5 bg-neutral-900 rounded-lg cursor-pointer"
            />
          </div>

          {/* Pitch Transpose */}
          <div className="bg-black/40 p-2 rounded-xl border border-white/[0.06] space-y-1">
            <div className="flex justify-between text-stitek font-mono text-neutral-400">
              <span>Pitch</span>
              <span className="font-bold text-purple-400">
                {channel.pitchSemi > 0 ? `+${channel.pitchSemi}` : channel.pitchSemi} st
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={() => onUpdate({ pitchSemi: Math.max(-12, channel.pitchSemi - 1) })}
                className="w-5 h-5 bg-white/10 hover:bg-white/20 text-white rounded font-bold text-stitek flex items-center justify-center cursor-pointer"
              >
                -
              </button>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={channel.pitchSemi}
                onChange={(e) => onUpdate({ pitchSemi: parseInt(e.target.value, 10) })}
                className="flex-1 accent-purple-500 h-1.5 bg-neutral-900 rounded-lg cursor-pointer"
              />
              <button
                onClick={() => onUpdate({ pitchSemi: Math.min(12, channel.pitchSemi + 1) })}
                className="w-5 h-5 bg-white/10 hover:bg-white/20 text-white rounded font-bold text-stitek flex items-center justify-center cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Guitar Mid/Side Processing Matrix */}
          {isGuitar && (
            <div className="bg-amber-500/10 p-2 rounded-xl border border-amber-500/20 space-y-1.5">
              <div className="flex items-center justify-between text-stitek">
                <span className="font-bold text-amber-400 flex items-center gap-1">
                  <Radio className="w-3 h-3" /> M/S Šířka
                </span>
                <button
                  onClick={() => onUpdate({ isMono: !channel.isMono })}
                  className={`px-1.5 py-0.5 rounded text-stitek font-mono font-bold border cursor-pointer ${
                    channel.isMono
                      ? 'bg-blue-600 text-white border-blue-400'
                      : 'bg-black/60 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {channel.isMono ? 'MONO' : 'STEREO'}
                </button>
              </div>

              <div className="flex justify-between text-stitek font-mono text-neutral-300">
                <span>Side Gain:</span>
                <span className="font-bold text-amber-400">
                  {(channel.isMono ? 0 : channel.stereoWidth * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                disabled={channel.isMono}
                value={channel.isMono ? 0 : channel.stereoWidth}
                onChange={(e) => onUpdate({ stereoWidth: parseFloat(e.target.value) })}
                className="w-full accent-amber-400 h-1.5 bg-black/60 rounded-lg cursor-pointer disabled:opacity-30"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
