import React, { useState, useEffect } from 'react';
import { midiService, MidiDevice, MidiEventPayload } from '../services/midiService';
import { audioSynth, INSTRUMENT_PROFILES, InstrumentProfile } from '../services/audioSynth';
import {
  Sliders, Music, Disc, Volume2, Zap, RefreshCw, X, Radio,
  Activity, CheckCircle2, AlertCircle, Laptop, Layers
} from 'lucide-react';

interface MidiToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CHROMATIC_KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const MidiToolsModal: React.FC<MidiToolsModalProps> = ({ isOpen, onClose }) => {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | 'all'>('all');
  const [isAutoSynth, setIsAutoSynth] = useState(true);
  const [recentEvents, setRecentEvents] = useState<MidiEventPayload[]>([]);
  const [activeNotes, setActiveNotes] = useState<Map<number, number>>(new Map()); // midiNote -> velocity
  const [scaleFilterState, setScaleFilterState] = useState(() => midiService.getScaleFilter());

  // Channel Mappings (1..16)
  const [channelMap, setChannelMap] = useState<Record<number, InstrumentProfile>>(() =>
    midiService.getAllChannelMappings()
  );

  // App Role Mappings
  const [roleMap, setRoleMap] = useState<Record<string, InstrumentProfile>>(() =>
    audioSynth.getAllMappings()
  );

  const [activeTab, setActiveTab] = useState<'devices' | 'channels' | 'roles'>('devices');

  // Initialize MIDI hardware scanning
  useEffect(() => {
    if (!isOpen) return;

    midiService.initMidi().then((devs) => {
      setDevices(devs);
    });

    const unsubscribe = midiService.subscribe((event) => {
      setRecentEvents((prev) => [event, ...prev.slice(0, 19)]);

      if (event.type === 'noteon' && event.note !== undefined && event.velocity !== undefined) {
        setActiveNotes((prev) => {
          const next = new Map(prev);
          next.set(event.note!, event.velocity!);
          return next;
        });
      } else if (event.type === 'noteoff' && event.note !== undefined) {
        setActiveNotes((prev) => {
          const next = new Map(prev);
          next.delete(event.note!);
          return next;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const refreshDevices = async () => {
    const devs = await midiService.initMidi();
    setDevices(devs);
  };

  const handleChannelMappingChange = (ch: number, profile: InstrumentProfile) => {
    midiService.setChannelMapping(ch, profile);
    setChannelMap((prev) => ({ ...prev, [ch]: profile }));
  };

  const handleRoleMappingChange = (role: string, profile: InstrumentProfile) => {
    audioSynth.setInstrumentMapping(role, profile);
    setRoleMap((prev) => ({ ...prev, [role]: profile }));
  };

  const handleTestNote = (midiNote: number, profile: InstrumentProfile) => {
    audioSynth.playNote(midiNote, profile, 2.0, 0.85);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 font-sans select-none animate-in fade-in duration-200">
      <div className="bg-[#16161A]/95 backdrop-blur-2xl border border-white/[0.12] rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="bg-white/[0.03] border-b border-white/[0.08] p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#30D158]/10 border border-[#30D158]/30 text-[#30D158] rounded-xl">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#30D158] text-black font-bold px-1.5 py-0.5 text-[9px] rounded uppercase tracking-wider">
                  MIDI Tools
                </span>
                <span className="text-xs text-neutral-400 font-medium">Hardware & mapování</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Nastavení Hardware MIDI & Mapování Zvuků
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-black/40 p-2 border-b border-white/[0.06] gap-1.5 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'devices'
                ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>MIDI Zařízení & Monitor</span>
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'channels'
                ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Mapování MIDI Kanálů (1-16)</span>
          </button>

          <button
            onClick={() => setActiveTab('roles')}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'roles'
                ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Mapování Zvuků Kapely</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* TAB 1: MIDI DEVICES & MONITOR */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              
              {/* Device Detection Bar */}
              <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#30D158] animate-pulse" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Připojené MIDI klávesy & kontroléry ({devices.length})
                    </span>
                  </div>

                  <button
                    onClick={refreshDevices}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[#30D158] text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Obnovit hledání</span>
                  </button>
                </div>

                {devices.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {devices.map((dev) => (
                      <div
                        key={dev.id}
                        className="bg-black/40 p-3 rounded-xl border border-white/10 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-xs text-white block">{dev.name}</span>
                          <span className="text-[11px] text-neutral-400">
                            Výrobce: {dev.manufacturer || 'Standardní MIDI controller'}
                          </span>
                        </div>
                        <span className="bg-[#30D158] text-black font-semibold text-[10px] px-2 py-0.5 rounded-md uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-black" /> Aktivní
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-center space-y-1.5">
                    <AlertCircle className="w-6 h-6 text-[#FF9F0A] mx-auto" />
                    <p className="text-xs font-bold text-white">Žádný hardware MIDI kontrolér není připojen</p>
                    <p className="text-[11px] text-neutral-400 max-w-md mx-auto">
                      Připojte USB/MIDI klávesnici k počítači a stiskněte „Obnovit hledání“. Můžete také hrát na virtuální klávesnici v aplikaci.
                    </p>
                  </div>
                )}

                {/* Hardware Scale Filter Status Box */}
                <div className="bg-[#30D158]/10 p-3.5 rounded-xl border border-[#30D158]/30 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#30D158]" />
                      <span className="text-xs font-bold text-white">
                        Hardware MIDI filtr ztmavených tónů stupnice
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#30D158]">
                      <input
                        type="checkbox"
                        checked={scaleFilterState.enabled}
                        onChange={(e) => {
                          const newConfig = {
                            ...scaleFilterState,
                            enabled: e.target.checked,
                          };
                          midiService.setScaleFilter(newConfig);
                          setScaleFilterState(newConfig);
                        }}
                        className="accent-[#30D158] rounded w-4 h-4"
                      />
                      <span>{scaleFilterState.enabled ? 'Filtr zapnut' : 'Filtr vypnut'}</span>
                    </label>
                  </div>
                  <p className="text-xs text-neutral-300">
                    {scaleFilterState.enabled ? (
                      <>
                        <span className="text-[#30D158] font-semibold">Aktivní blokování: </span>
                        Při stisku klávesy na vašem fyzickém MIDI nástroji, která patří mezi ztmavené tóny mimo stupnici ({scaleFilterState.allowedNoteRoots.length > 0 ? `Povoleno: ${scaleFilterState.allowedNoteRoots.join(', ')}` : 'Vše zakázáno'}),
                        nebude tón přehrán.
                      </>
                    ) : (
                      <span className="text-neutral-400">
                        Filtr je vypnut – všechny klávesy na vašem MIDI nástroji přehrávají zvuky bez omezení stupnicí.
                      </span>
                    )}
                  </p>
                </div>

                {/* Auto Audio Synth Checkbox */}
                <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-neutral-200">
                    <input
                      type="checkbox"
                      checked={isAutoSynth}
                      onChange={(e) => {
                        setIsAutoSynth(e.target.checked);
                        midiService.setAutoSynthEnabled(e.target.checked);
                      }}
                      className="accent-[#30D158] rounded w-4 h-4"
                    />
                    <span>Automaticky přehrávat zvuk z hardware MIDI klávesnice</span>
                  </label>
                  <span className="text-[11px] text-[#30D158] font-mono">Polyfonní syntéza povolena</span>
                </div>
              </div>

              {/* Active Playing Notes Visualizer */}
              <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider block border-b border-white/5 pb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#FF9F0A]" />
                  <span>Živý displej reálně stisknutých not (MIDI Visualizer)</span>
                </span>

                <div className="bg-black/40 p-3 rounded-xl border border-white/5 min-h-[60px] flex flex-wrap items-center gap-2">
                  {activeNotes.size > 0 ? (
                    Array.from(activeNotes.entries()).map(([noteNum, vel]) => {
                      const noteNames = CHROMATIC_KEY_NAMES;
                      const name = `${noteNames[noteNum % 12]}${Math.floor(noteNum / 12) - 1}`;
                      return (
                        <div
                          key={noteNum}
                          className="bg-[#30D158] text-black border border-black p-2 rounded-xl shadow-[0_0_15px_rgba(48,209,88,0.4)] animate-bounce flex flex-col items-center min-w-[50px]"
                        >
                          <span className="font-extrabold text-xs">{name}</span>
                          <span className="text-[9px] font-mono">Vel: {Math.round(vel * 127)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-xs text-neutral-500 font-mono">
                      Stiskněte klávesy na svém MIDI kontroléru... Noty se objeví zde v reálném čase.
                    </span>
                  )}
                </div>
              </div>

              {/* Real-time MIDI Event Log */}
              <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider block border-b border-white/5 pb-2">
                  Historie příchozích MIDI zpráv (Communication Log)
                </span>

                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 h-28 overflow-y-auto space-y-1 font-mono text-[10px]">
                  {recentEvents.length > 0 ? (
                    recentEvents.map((evt, idx) => (
                      <div key={idx} className="flex items-center justify-between border-b border-white/5 pb-0.5">
                        <span className={evt.isFilteredOut ? 'text-[#FF453A] line-through opacity-70' : 'text-[#30D158]'}>
                          [{evt.type.toUpperCase()}] Ch: {evt.channel} | Nota: {evt.noteName || evt.note || '-'}
                          {evt.isFilteredOut && <span className="ml-1 text-[9px] no-underline font-bold bg-[#FF453A] text-white px-1 rounded">[Ztmaveno]</span>}
                        </span>
                        <span className="text-neutral-400">
                          Vel: {evt.velocity ? Math.round(evt.velocity * 127) : evt.value || 0} | {evt.deviceName}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-neutral-500">Čekám na signál...</span>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CHANNEL MAPPER (1-16) */}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Mapování MIDI kanálů (1-16) na zvukové profily
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Nastavte, jaký zvukový filtr se přehraje při příjmu dat na konkrétním MIDI kanálu vašeho kontroléru. (např. Kanál 10 je standardně vyhrazen pro bicí).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: 16 }).map((_, idx) => {
                    const channel = idx + 1;
                    const currentProfile = channelMap[channel] || 'grand_piano';

                    return (
                      <div
                        key={channel}
                        className="bg-black/40 p-3 rounded-xl border border-white/5 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-[#FF9F0A] text-black font-bold text-[10px] px-2 py-0.5 rounded-md">
                            KANÁL {channel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <select
                            value={currentProfile}
                            onChange={(e) =>
                              handleChannelMappingChange(channel, e.target.value as InstrumentProfile)
                            }
                            className="bg-[#1C1C1E] text-white font-semibold text-xs p-1.5 rounded-lg border border-white/10 outline-none max-w-[200px]"
                          >
                            {INSTRUMENT_PROFILES.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleTestNote(60 + (channel % 12), currentProfile)}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-[#30D158] font-semibold text-xs rounded-lg border border-white/10 cursor-pointer"
                            title="Vyzkoušet zvuk"
                          >
                            🔊 Test
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: APP INSTRUMENT ROLE MAPPER */}
          {activeTab === 'roles' && (
            <div className="space-y-4">
              <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Mapování zvukových profilů pro nástroje kapely
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Přizpůsobte zvuky pro jednotlivé členy zkušebny a virtuální moduly. Změna se okamžitě projeví ve zpěvníku i interaktivních nástrojích.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {[
                    { role: 'Kytara', label: 'Hlavní kytara (Akustika / Elektrická)' },
                    { role: 'Elektrická kytara', label: 'Elektrická kytara (Skreslení / Lead)' },
                    { role: 'Basa', label: 'Baskytara (Bass Guitar)' },
                    { role: 'Klávesy', label: 'Klávesy / Akustické Piano' },
                    { role: 'Syntetizér', label: 'Syntetizér / Rhodes' },
                    { role: 'Bicí', label: 'Bicí automat / Percussion' },
                    { role: 'Zpěv', label: 'Zpěv / Vodící tóny' },
                  ].map((item) => {
                    const currentProf = roleMap[item.role] || 'acoustic_guitar';

                    return (
                      <div
                        key={item.role}
                        className="bg-black/40 p-3.5 rounded-xl border border-white/5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <span className="font-bold text-xs text-white block">{item.role}</span>
                          <span className="text-[11px] text-neutral-400">{item.label}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={currentProf}
                            onChange={(e) =>
                              handleRoleMappingChange(item.role, e.target.value as InstrumentProfile)
                            }
                            className="bg-[#1C1C1E] text-white font-semibold text-xs p-2 rounded-xl border border-white/10 outline-none min-w-[220px]"
                          >
                            {INSTRUMENT_PROFILES.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleTestNote(60, currentProf)}
                            className="px-3 py-2 bg-white/5 hover:bg-white/10 text-[#30D158] font-semibold text-xs rounded-xl border border-white/10 cursor-pointer"
                          >
                            🔊 Test zvuku
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-white/[0.03] border-t border-white/[0.08] p-4 flex items-center justify-between text-xs">
          <span className="text-neutral-400 font-medium">
            NeverLate Studio Audio Engine & MIDI 2.6
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white text-black hover:bg-neutral-200 font-semibold rounded-xl transition-all cursor-pointer shadow-md"
          >
            Hotovo
          </button>
        </div>

      </div>
    </div>
  );
};
