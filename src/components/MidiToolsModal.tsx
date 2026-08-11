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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 font-mono select-none">
      <div className="bg-[#0A0A0A] border-2 border-[#00FF41] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_0_30px_rgba(0,255,65,0.2)]">
        
        {/* Modal Header */}
        <div className="bg-[#0F1E13] border-b border-[#00FF41]/40 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-[#00FF41] text-black font-black px-2 py-0.5 text-xs uppercase tracking-wider">
              MIDI_TOOLS
            </span>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              NASTAVENÍ HARDWARE MIDI & MAPOVÁNÍ ZVUKŮ NÁSTROJŮ
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-[#888] hover:text-white hover:bg-[#222] border border-transparent hover:border-[#333]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-[#050505] p-2 border-b border-[#222] gap-1 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-3 py-1.5 font-bold uppercase transition-none flex items-center gap-1.5 ${
              activeTab === 'devices'
                ? 'bg-[#00FF41] text-black font-extrabold'
                : 'text-[#888] hover:text-white bg-[#111]'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>MIDI ZAŘÍZENÍ & MONITOR</span>
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`px-3 py-1.5 font-bold uppercase transition-none flex items-center gap-1.5 ${
              activeTab === 'channels'
                ? 'bg-[#00FF41] text-black font-extrabold'
                : 'text-[#888] hover:text-white bg-[#111]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>MAPOVÁNÍ MIDI KANÁLŮ (1-16)</span>
          </button>

          <button
            onClick={() => setActiveTab('roles')}
            className={`px-3 py-1.5 font-bold uppercase transition-none flex items-center gap-1.5 ${
              activeTab === 'roles'
                ? 'bg-[#00FF41] text-black font-extrabold'
                : 'text-[#888] hover:text-white bg-[#111]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>MAPOVÁNÍ ZVUKŮ PRO NÁSTROJE KAPELY</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          
          {/* TAB 1: MIDI DEVICES & MONITOR */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              
              {/* Device Detection Bar */}
              <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] pb-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#00FF41] animate-pulse" />
                    <span className="text-xs font-bold text-white uppercase">
                      PŘIPOJENÉ MIDI KLÁVESY & KONTROLÉRY ({devices.length})
                    </span>
                  </div>

                  <button
                    onClick={refreshDevices}
                    className="px-2.5 py-1 bg-[#141414] hover:bg-[#222] text-[#00FF41] text-[10px] font-bold uppercase border border-[#333] flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>OBNOVIT HLEDÁNÍ</span>
                  </button>
                </div>

                {devices.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {devices.map((dev) => (
                      <div
                        key={dev.id}
                        className="bg-[#050505] p-3 border border-[#00FF41]/30 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-extrabold text-xs text-white block">{dev.name}</span>
                          <span className="text-[10px] text-[#888]">
                            Výrobce: {dev.manufacturer || 'Standardní MIDI controller'}
                          </span>
                        </div>
                        <span className="bg-[#00FF41] text-black font-black text-[9px] px-2 py-0.5 uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-black" /> AKTIVNÍ
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#050505] p-4 border border-[#222] text-center space-y-1">
                    <AlertCircle className="w-6 h-6 text-[#FF3E00] mx-auto" />
                    <p className="text-xs font-bold text-white">ŽÁDNÝ HARDWARE MIDI KONTROLÉR NENÍ PŘIPOJEN</p>
                    <p className="text-[10px] text-[#888]">
                      Připojte USB/MIDI klávesnici k počítači a stiskněte &quot;Obnovit hledání&quot;. Můžete také hrát na virtuální klávesnici v aplikaci.
                    </p>
                  </div>
                )}

                {/* Hardware Scale Filter Status Box */}
                <div className="bg-[#051A0B] p-3 border border-[#00FF41]/40 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#00FF41]" />
                      <span className="text-xs font-bold text-white uppercase">
                        HARDWARE MIDI FILTR ZTMAVENÝCH TÓNŮ STUPNICE
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#00FF41]">
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
                        className="accent-[#00FF41] w-4 h-4"
                      />
                      <span>{scaleFilterState.enabled ? 'FILTR ZAPNUT' : 'FILTR VYPNUT'}</span>
                    </label>
                  </div>
                  <p className="text-[10px] text-[#AAA]">
                    {scaleFilterState.enabled ? (
                      <>
                        <span className="text-[#00FF41] font-bold">AKTIVNÍ BLOKOVÁNÍ: </span>
                        Při stisku klávesy na vašem fyzickém MIDI nástroji, která patří mezi ztmavené tóny mimo stupnici ({scaleFilterState.allowedNoteRoots.length > 0 ? `Povoleno: ${scaleFilterState.allowedNoteRoots.join(', ')}` : 'Vše zakázáno'}),
                        nebude tón přehrán.
                      </>
                    ) : (
                      <span className="text-[#888]">
                        Filtr je vypnut – všechny klávesy na vašem MIDI nástroji přehrávají zvuky bez omezení stupnicí.
                      </span>
                    )}
                  </p>
                </div>

                {/* Auto Audio Synth Checkbox */}
                <div className="flex items-center justify-between bg-[#050505] p-2 border border-[#222]">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#D1D1D1]">
                    <input
                      type="checkbox"
                      checked={isAutoSynth}
                      onChange={(e) => {
                        setIsAutoSynth(e.target.checked);
                        midiService.setAutoSynthEnabled(e.target.checked);
                      }}
                      className="accent-[#00FF41] w-4 h-4"
                    />
                    <span>AUTOMATICKY PŘEHRÁVAT ZVUK Z HARDWARE MIDI KLÁVESNICE</span>
                  </label>
                  <span className="text-[10px] text-[#00FF41] font-mono">POLYFONNÍ SYNTÉZA POVOLENA</span>
                </div>
              </div>

              {/* Active Playing Notes Visualizer */}
              <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-2">
                <span className="text-xs font-bold text-white uppercase block border-b border-[#222] pb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#FF3E00]" />
                  <span>ŽIVÝ DYSPLAY REÁLNĚ STISKNUTÝCH NOT (MIDI VISUALIZER)</span>
                </span>

                <div className="bg-[#050505] p-4 border border-[#222] min-h-[70px] flex flex-wrap items-center gap-2">
                  {activeNotes.size > 0 ? (
                    Array.from(activeNotes.entries()).map(([noteNum, vel]) => {
                      const noteNames = CHROMATIC_KEY_NAMES;
                      const name = `${noteNames[noteNum % 12]}${Math.floor(noteNum / 12) - 1}`;
                      return (
                        <div
                          key={noteNum}
                          className="bg-[#00FF41] text-black border border-black p-2 rounded-xs shadow-[0_0_15px_#00FF41] animate-bounce flex flex-col items-center min-w-[50px]"
                        >
                          <span className="font-extrabold text-xs">{name}</span>
                          <span className="text-[9px] font-mono">Vel: {Math.round(vel * 127)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-xs text-[#555] font-mono">
                      Stiskněte klávesy na svém MIDI kontroléru... Noty se objeví zde v reálném čase.
                    </span>
                  )}
                </div>
              </div>

              {/* Real-time MIDI Event Log */}
              <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-2">
                <span className="text-xs font-bold text-white uppercase block border-b border-[#222] pb-2">
                  HISTORIE PŘÍCHOZÍCH MIDI ZPRÁV (COMMUNICATION LOG)
                </span>

                <div className="bg-[#050505] p-2 border border-[#222] h-32 overflow-y-auto space-y-1 font-mono text-[10px]">
                  {recentEvents.length > 0 ? (
                    recentEvents.map((evt, idx) => (
                      <div key={idx} className="flex items-center justify-between border-b border-[#111] pb-0.5">
                        <span className={evt.isFilteredOut ? 'text-[#FF3E00] line-through opacity-70' : 'text-[#00FF41]'}>
                          [{evt.type.toUpperCase()}] Ch: {evt.channel} | Nota: {evt.noteName || evt.note || '-'}
                          {evt.isFilteredOut && <span className="ml-1 text-[9px] no-underline font-bold bg-[#FF3E00] text-black px-1">[ZTMAVENO - NEPŘEHRÁNO]</span>}
                        </span>
                        <span className="text-[#888]">
                          Vel: {evt.velocity ? Math.round(evt.velocity * 127) : evt.value || 0} | {evt.deviceName}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-[#444]">Čekám na signál...</span>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CHANNEL MAPPER (1-16) */}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase">
                    MAPOVÁNÍ MIDI KANÁLŮ (CHANNELS 1-16) NA ZVUKOVÉ PROFILY
                  </h3>
                  <p className="text-[10px] text-[#888] mt-1">
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
                        className="bg-[#050505] p-2.5 border border-[#222] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-[#FF3E00] text-black font-black text-[10px] px-2 py-0.5">
                            KANÁL {channel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <select
                            value={currentProfile}
                            onChange={(e) =>
                              handleChannelMappingChange(channel, e.target.value as InstrumentProfile)
                            }
                            className="bg-[#111] text-[#00FF41] font-bold text-xs p-1 border border-[#333] max-w-[200px]"
                          >
                            {INSTRUMENT_PROFILES.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleTestNote(60 + (channel % 12), currentProfile)}
                            className="px-2 py-1 bg-[#141414] hover:bg-[#00FF41] hover:text-black text-[#00FF41] font-bold text-[10px] border border-[#333]"
                            title="Vyzkoušet zvuk"
                          >
                            🔊 ZKOUŠKA
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
              <div className="border border-[#333] bg-[#0F0F0F] p-4 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase">
                    MAPOVÁNÍ ZVUKOVÝCH PROFILŮ PRO NÁSTROJE KAPELY SOUBORU
                  </h3>
                  <p className="text-[10px] text-[#888] mt-1">
                    Přizpůsobte zvuky pro jednotlivé členy zkušebny a virtuální moduly. Změna se okamžitě projeví ve zpěvníku i interaktivních nástrojích.
                  </p>
                </div>

                <div className="space-y-2">
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
                        className="bg-[#050505] p-3 border border-[#222] flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <span className="font-extrabold text-xs text-white block">{item.role}</span>
                          <span className="text-[10px] text-[#888]">{item.label}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={currentProf}
                            onChange={(e) =>
                              handleRoleMappingChange(item.role, e.target.value as InstrumentProfile)
                            }
                            className="bg-[#111] text-[#00FF41] font-bold text-xs p-1.5 border border-[#333] min-w-[220px]"
                          >
                            {INSTRUMENT_PROFILES.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => handleTestNote(60, currentProf)}
                            className="px-3 py-1.5 bg-[#141414] hover:bg-[#00FF41] hover:text-black text-[#00FF41] font-bold text-xs border border-[#333]"
                          >
                            🔊 TEST ZVUKU
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
        <div className="bg-[#0F0F0F] border-t border-[#222] p-3 flex items-center justify-between text-xs font-mono">
          <span className="text-[#888]">
            STRUM_OS // ENGINE REÁLNÉHO ZVUKU & HARDWARE MIDI V2.6
          </span>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-[#00FF41] text-black font-black uppercase border border-black hover:bg-white"
          >
            HOTOVO / ZAVŘÍT
          </button>
        </div>

      </div>
    </div>
  );
};
