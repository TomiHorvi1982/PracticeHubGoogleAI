import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Square, Music4, Volume2, VolumeX, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { midiPlayerService, MidiSongState, MidiNote } from '../services/midiPlayerService';
import { assetLibraryService, LibraryAsset } from '../services/assetLibraryService';
import { INSTRUMENT_PROFILES, InstrumentProfile, midiToNoteName } from '../services/audioSynth';

/**
 * Přehrávač MIDI souborů z knihovny kapely.
 *
 * MIDI nenese zvuk, jen noty — jak to zní, určuje nástroj přiřazený každé
 * stopě. Ten jde změnit, takže se z party pro klavír dá poslechnout kytara,
 * aniž by se soubor upravoval.
 *
 * Editor not je záměrně jednoduchý: klikáním se noty přidávají a mažou.
 * Slouží k opravě zjevné chyby v partu nebo k vyzkoušení nápadu — ne jako
 * náhrada DAW, kam takové věci patří.
 */

const CERNE = new Set([1, 3, 6, 8, 10]);

function formatCas(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export const MidiPlayerPanel: React.FC = () => {
  const [stav, setStav] = useState<MidiSongState>(midiPlayerService.getState());
  const [soubory, setSoubory] = useState<LibraryAsset[]>([]);
  const [nacitamSeznam, setNacitamSeznam] = useState(false);
  const [hledat, setHledat] = useState('');
  const [celkem, setCelkem] = useState(0);
  const [vybranaStopa, setVybranaStopa] = useState(0);
  const [chybaSeznamu, setChybaSeznamu] = useState<string | null>(null);
  const rollRef = useRef<HTMLDivElement>(null);

  useEffect(() => midiPlayerService.subscribe(setStav), []);

  /** Načte jednu stránku. Knihovna má MIDI přes dvacet tisíc — vypsat je
   *  všechny by znamenalo zeď tlačítek a obrovský přenos. */
  const nactiSeznam = async (dotaz = hledat) => {
    setNacitamSeznam(true);
    setChybaSeznamu(null);
    try {
      const { assets, total } = await assetLibraryService.listPage({
        category: 'midi',
        search: dotaz.trim() || undefined,
        limit: 60,
      });
      setSoubory(assets);
      setCelkem(total);
    } catch (e: any) {
      setChybaSeznamu(e?.message || 'Seznam MIDI souborů se nepodařilo načíst.');
    } finally {
      setNacitamSeznam(false);
    }
  };

  useEffect(() => {
    nactiSeznam('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hledá se s odstupem od psaní, ať každé písmeno neposílá dotaz.
  useEffect(() => {
    const id = window.setTimeout(() => nactiSeznam(hledat), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hledat]);

  const stopa = stav.tracks[vybranaStopa];

  /** Rozsah tónů zobrazený v editoru — jen ten, který stopa opravdu používá. */
  const rozsah = useMemo(() => {
    if (!stopa || stopa.notes.length === 0) return { min: 48, max: 72 };
    const cisla = stopa.notes.map((n) => n.midi);
    return { min: Math.max(0, Math.min(...cisla) - 2), max: Math.min(127, Math.max(...cisla) + 2) };
  }, [stopa]);

  const radku = rozsah.max - rozsah.min + 1;
  const VYSKA_RADKU = 12;
  const PX_ZA_SEKUNDU = 60;
  const sirka = Math.max(600, stav.duration * PX_ZA_SEKUNDU);

  const smazNotu = (i: number) => {
    if (!stopa) return;
    midiPlayerService.setTrackNotes(stopa.index, stopa.notes.filter((_, idx) => idx !== i));
  };

  const pridejNotu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stopa || !rollRef.current) return;
    const box = rollRef.current.getBoundingClientRect();
    const x = e.clientX - box.left + rollRef.current.scrollLeft;
    const y = e.clientY - box.top;
    const cas = Math.max(0, x / PX_ZA_SEKUNDU);
    const midi = rozsah.max - Math.floor(y / VYSKA_RADKU);
    if (midi < 0 || midi > 127) return;
    const nova: MidiNote = { midi, time: cas, duration: 0.5, velocity: 0.8 };
    midiPlayerService.setTrackNotes(stopa.index, [...stopa.notes, nova]);
  };

  return (
    <div className="space-y-4">
      {/* Výběr souboru z knihovny */}
      <div className="bg-[#16161A]/90 border border-white/10 rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Music4 className="w-4 h-4 text-[#FF9F0A]" /> MIDI z knihovny
          </h3>
          <input
            type="search"
            value={hledat}
            onChange={(e) => setHledat(e.target.value)}
            placeholder="Hledat MIDI…"
            className="flex-1 min-w-[140px] bg-black/40 text-white text-[11px] font-medium px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-[#FF9F0A] placeholder:text-neutral-500"
          />
          <button
            onClick={() => nactiSeznam(hledat)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
            title="Načíst znovu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${nacitamSeznam ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {chybaSeznamu ? (
          <div className="text-xs text-[#FF453A]">{chybaSeznamu}</div>
        ) : soubory.length === 0 ? (
          <div className="text-xs text-neutral-500">
            {nacitamSeznam ? 'Načítám…' : 'V knihovně nejsou žádné MIDI soubory.'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {celkem > soubory.length && (
              <div className="w-full text-[11px] text-neutral-500 mb-1">
                Zobrazeno {soubory.length} z {celkem} — zbytek najdete hledáním.
              </div>
            )}
            {soubory.map((a) => (
              <button
                key={a.id}
                onClick={() => midiPlayerService.loadFromLibrary(a)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  stav.asset?.id === a.id
                    ? 'bg-[#FF9F0A]/20 border-[#FF9F0A] text-white'
                    : 'bg-black/40 border-white/10 text-neutral-300 hover:border-white/25'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {stav.loading && (
        <div className="flex items-center gap-2 text-sm text-neutral-400 px-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Načítám soubor…
        </div>
      )}
      {stav.error && (
        <div className="bg-[#FF453A]/10 border border-[#FF453A]/30 text-[#FF453A] text-xs rounded-2xl px-4 py-2.5">
          {stav.error}
        </div>
      )}

      {stav.tracks.length > 0 && (
        <>
          {/* Přehrávání */}
          <div className="bg-[#16161A]/90 border border-white/10 rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => (stav.isPlaying ? midiPlayerService.pause() : midiPlayerService.play())}
                className="flex items-center gap-2 bg-[#FF9F0A] hover:bg-[#FFB340] text-black font-black text-xs px-4 py-2 rounded-xl cursor-pointer"
              >
                {stav.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {stav.isPlaying ? 'Pauza' : 'Přehrát'}
              </button>
              <button
                onClick={() => midiPlayerService.stop()}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
                title="Zastavit"
              >
                <Square className="w-4 h-4" />
              </button>

              <span className="text-xs font-mono text-neutral-300">
                {formatCas(stav.position)} / {formatCas(stav.duration)}
              </span>

              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] text-neutral-400 font-medium">Rychlost</span>
                {[0.5, 0.75, 1, 1.25, 1.5].map((f) => (
                  <button
                    key={f}
                    onClick={() => midiPlayerService.setTempoFactor(f)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                      stav.tempoFactor === f ? 'bg-[#FF9F0A] text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    {f}×
                  </button>
                ))}
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(1, stav.duration)}
              step={0.05}
              value={stav.position}
              onChange={(e) => midiPlayerService.seek(parseFloat(e.target.value))}
              className="w-full accent-[#FF9F0A] cursor-pointer"
            />
          </div>

          {/* Stopy */}
          <div className="bg-[#16161A]/90 border border-white/10 rounded-3xl p-4 sm:p-5 space-y-2">
            <h3 className="text-sm font-black text-white mb-1">Stopy ({stav.tracks.length})</h3>
            {stav.tracks.map((t, i) => (
              <div
                key={t.index}
                onClick={() => setVybranaStopa(i)}
                className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${
                  i === vybranaStopa ? 'bg-white/[0.07] border-[#FF9F0A]/50' : 'bg-black/30 border-white/[0.06] hover:border-white/15'
                }`}
              >
                <span className="text-xs font-bold text-white truncate flex-1" title={t.programName}>
                  {t.name}
                  <span className="text-neutral-500 font-medium"> · {t.notes.length} not</span>
                </span>

                <select
                  value={t.profile}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => midiPlayerService.setTrackProfile(t.index, e.target.value as InstrumentProfile)}
                  className="bg-black/50 text-white text-[10px] font-bold px-2 py-1 rounded-lg border border-white/10 outline-none cursor-pointer max-w-[150px]"
                >
                  {INSTRUMENT_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={(e) => { e.stopPropagation(); midiPlayerService.toggleSolo(t.index); }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer ${
                    t.solo ? 'bg-[#FF9F0A] text-black' : 'bg-white/5 text-neutral-400'
                  }`}
                >
                  S
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); midiPlayerService.toggleMute(t.index); }}
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    t.muted ? 'bg-[#FF453A]/20 text-[#FF453A]' : 'bg-white/5 text-neutral-400'
                  }`}
                >
                  {t.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>

          {/* Editor not */}
          {stopa && (
            <div className="bg-[#16161A]/90 border border-white/10 rounded-3xl p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-white">Noty — {stopa.name}</h3>
                <span className="text-[11px] text-neutral-400">
                  Kliknutím do mřížky přidáte notu, kliknutím na notu ji smažete
                </span>
              </div>

              <div ref={rollRef} className="overflow-auto rounded-2xl border border-white/10 bg-black/50">
                <div
                  className="relative cursor-crosshair"
                  style={{ width: sirka, height: radku * VYSKA_RADKU }}
                  onClick={pridejNotu}
                >
                  {/* Pruhy podle půltónů, aby šlo poznat, kde je co */}
                  {Array.from({ length: radku }, (_, r) => {
                    const midi = rozsah.max - r;
                    return (
                      <div
                        key={r}
                        className={CERNE.has(midi % 12) ? 'absolute w-full bg-white/[0.03]' : 'absolute w-full'}
                        style={{ top: r * VYSKA_RADKU, height: VYSKA_RADKU }}
                      />
                    );
                  })}

                  {stopa.notes.map((n, i) => (
                    <div
                      key={i}
                      onClick={(e) => { e.stopPropagation(); smazNotu(i); }}
                      title={`${midiToNoteName(n.midi)} · ${n.time.toFixed(2)} s — kliknutím smazat`}
                      className="absolute rounded-[3px] bg-[#FF9F0A] hover:bg-[#FF453A] transition-colors"
                      style={{
                        left: n.time * PX_ZA_SEKUNDU,
                        top: (rozsah.max - n.midi) * VYSKA_RADKU + 1,
                        width: Math.max(3, n.duration * PX_ZA_SEKUNDU - 1),
                        height: VYSKA_RADKU - 2,
                        opacity: 0.45 + n.velocity * 0.55,
                      }}
                    />
                  ))}

                  {/* Kde se zrovna hraje */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-[#30D158] pointer-events-none"
                    style={{ left: stav.position * PX_ZA_SEKUNDU }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => midiPlayerService.setTrackNotes(stopa.index, [])}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-400 hover:text-[#FF453A] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Vymazat všechny noty stopy
                </button>
                <span className="text-[11px] text-neutral-500">
                  Úpravy platí jen v přehrávači — soubor v knihovně se nemění.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
