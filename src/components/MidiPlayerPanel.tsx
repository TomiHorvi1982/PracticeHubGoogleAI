import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, Square, Music4, Volume2, VolumeX, Loader2,
  ZoomIn, ZoomOut, ChevronDown, ChevronRight, Search, Trash2,
} from 'lucide-react';
import { midiPlayerService, MidiSongState, MidiNote } from '../services/midiPlayerService';
import { assetLibraryService, LibraryAsset } from '../services/assetLibraryService';
import { INSTRUMENT_PROFILES, InstrumentProfile, midiToNoteName } from '../services/audioSynth';

/**
 * MIDI přehrávač uspořádaný jako stopová aplikace: vlevo hlavičky stop,
 * vpravo jedna společná časová osa. Všechno v jednom rámu, aby se nedalo
 * ztratit, která nota patří které stopě a kde se zrovna hraje.
 *
 * Osa i stopy sdílejí jeden vodorovný posuv — jinak by se při posunutí
 * rozešly a pravítko by ukazovalo jinam než noty.
 */

const CERNE = new Set([1, 3, 6, 8, 10]);
const VYSKA_STOPY = 44;
const VYSKA_RADKU_ROLL = 11;
const SIRKA_HLAVICEK = 190;

function formatCas(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Složka, ze které soubor pochází — slouží k seskupení sbírky. */
function slozkaAssetu(a: LibraryAsset): string {
  const legacy = String((a.metadata as any)?.legacy_id || '');
  const casti = legacy.replace(/^sync:/, '').split('/');
  casti.pop();
  return casti.length ? casti[casti.length - 1] : 'Ostatní';
}

export const MidiPlayerPanel: React.FC = () => {
  const [stav, setStav] = useState<MidiSongState>(midiPlayerService.getState());
  const [soubory, setSoubory] = useState<LibraryAsset[]>([]);
  const [celkem, setCelkem] = useState(0);
  const [nacitam, setNacitam] = useState(false);
  const [hledat, setHledat] = useState('');
  const [knihovnaOtevrena, setKnihovnaOtevrena] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [vybranaStopa, setVybranaStopa] = useState(0);
  const [pxZaSekundu, setPxZaSekundu] = useState(40);
  const osaRef = useRef<HTMLDivElement>(null);

  useEffect(() => midiPlayerService.subscribe(setStav), []);

  const nacti = async (dotaz: string) => {
    setNacitam(true);
    setChyba(null);
    try {
      const { assets, total } = await assetLibraryService.listPage({
        category: 'midi',
        search: dotaz.trim() || undefined,
        limit: 120,
        sort: 'name',
      });
      setSoubory(assets);
      setCelkem(total);
    } catch (e: any) {
      setChyba(e?.message || 'Knihovnu se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => nacti(hledat), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hledat]);

  /** Soubory seskupené podle složky, obojí seřazené podle názvu. */
  const skupiny = useMemo(() => {
    const m = new Map<string, LibraryAsset[]>();
    for (const a of soubory) {
      const k = slozkaAssetu(a);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'cs'));
  }, [soubory]);

  const stopa = stav.tracks[vybranaStopa];
  const sirkaOsy = Math.max(700, stav.duration * pxZaSekundu);

  /** Rozsah tónů vybrané stopy — v editoru se ukazuje jen ten použitý. */
  const rozsah = useMemo(() => {
    if (!stopa || stopa.notes.length === 0) return { min: 48, max: 72 };
    const c = stopa.notes.map((n) => n.midi);
    return { min: Math.max(0, Math.min(...c) - 1), max: Math.min(127, Math.max(...c) + 1) };
  }, [stopa]);
  const radkuRoll = rozsah.max - rozsah.min + 1;

  // Přehrávací čára se drží v obraze, i když skladba uteče za okraj.
  useEffect(() => {
    if (!stav.isPlaying || !osaRef.current) return;
    const x = stav.position * pxZaSekundu;
    const el = osaRef.current;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 80) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
    }
  }, [stav.position, stav.isPlaying, pxZaSekundu]);

  const klikDoOsy = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!osaRef.current) return;
    const box = osaRef.current.getBoundingClientRect();
    midiPlayerService.seek((e.clientX - box.left + osaRef.current.scrollLeft) / pxZaSekundu);
  };

  const pridejNotu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stopa || !osaRef.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    const midi = rozsah.max - Math.floor((e.clientY - box.top) / VYSKA_RADKU_ROLL);
    if (midi < 0 || midi > 127) return;
    const cas = Math.max(0, (e.clientX - box.left) / pxZaSekundu);
    midiPlayerService.setTrackNotes(stopa.index, [...stopa.notes, { midi, time: cas, duration: 0.5, velocity: 0.8 }]);
  };

  // Značky na pravítku po rozumném kroku, ať nejsou natěsno ani řídce.
  const krok = pxZaSekundu >= 80 ? 1 : pxZaSekundu >= 30 ? 5 : 15;
  const znacky = Array.from({ length: Math.ceil(stav.duration / krok) + 1 }, (_, i) => i * krok);

  return (
    <div className="bg-[#16161A]/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
      {/* Knihovna */}
      <div className="border-b border-white/10">
        <button
          onClick={() => setKnihovnaOtevrena((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left cursor-pointer hover:bg-white/[0.03]"
        >
          {knihovnaOtevrena ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
          <Music4 className="w-4 h-4 text-[#FF9F0A]" />
          <span className="text-xs font-black text-white">Knihovna MIDI</span>
          {celkem > 0 && <span className="text-[11px] text-neutral-500">({celkem})</span>}
          {stav.asset && (
            <span className="ml-auto text-[11px] font-bold text-[#FF9F0A] truncate max-w-[45%]">{stav.asset.name}</span>
          )}
        </button>

        {knihovnaOtevrena && (
          <div className="px-4 pb-3 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={hledat}
                onChange={(e) => setHledat(e.target.value)}
                placeholder="Hledat skladatele, název…"
                className="w-full bg-black/50 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-white/10 outline-none focus:border-[#FF9F0A] placeholder:text-neutral-500"
              />
            </div>

            {chyba ? (
              <div className="text-[11px] text-[#FF453A]">{chyba}</div>
            ) : (
              <div className="max-h-52 overflow-auto space-y-2 pr-1">
                {nacitam && <div className="text-[11px] text-neutral-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Načítám…</div>}
                {!nacitam && soubory.length === 0 && (
                  <div className="text-[11px] text-neutral-500">Nic nenalezeno.</div>
                )}
                {skupiny.map(([slozka, polozky]) => (
                  <div key={slozka}>
                    <div className="text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">{slozka}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {polozky.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { midiPlayerService.loadFromLibrary(a); setVybranaStopa(0); }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                            stav.asset?.id === a.id
                              ? 'bg-[#FF9F0A]/20 border-[#FF9F0A] text-white'
                              : 'bg-black/40 border-white/10 text-neutral-300 hover:border-white/30'
                          }`}
                          title={a.name}
                        >
                          {a.name.replace(/\.midi?$/i, '').slice(0, 40)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {celkem > soubory.length && (
                  <div className="text-[11px] text-neutral-500 pt-1">
                    Zobrazeno {soubory.length} z {celkem} — zbytek najdete hledáním.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {stav.loading && (
        <div className="flex items-center gap-2 text-sm text-neutral-400 px-4 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Načítám soubor…
        </div>
      )}
      {stav.error && <div className="px-4 py-3 text-xs text-[#FF453A]">{stav.error}</div>}

      {stav.tracks.length > 0 && (
        <>
          {/* Ovládání */}
          <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-white/10 bg-black/30">
            <button
              onClick={() => (stav.isPlaying ? midiPlayerService.pause() : midiPlayerService.play())}
              className="flex items-center gap-1.5 bg-[#FF9F0A] hover:bg-[#FFB340] text-black font-black text-xs px-3.5 py-1.5 rounded-lg cursor-pointer"
            >
              {stav.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {stav.isPlaying ? 'Pauza' : 'Přehrát'}
            </button>
            <button
              onClick={() => midiPlayerService.stop()}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
              title="Zastavit"
            >
              <Square className="w-3.5 h-3.5" />
            </button>

            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {formatCas(stav.position)} <span className="text-neutral-500">/ {formatCas(stav.duration)}</span>
            </span>

            <div className="flex items-center gap-1">
              <span className="text-[10px] text-neutral-400 font-bold mr-1">TEMPO</span>
              {[0.5, 0.75, 1, 1.25, 1.5].map((f) => (
                <button
                  key={f}
                  onClick={() => midiPlayerService.setTempoFactor(f)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    stav.tempoFactor === f ? 'bg-[#FF9F0A] text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                  }`}
                >
                  {f}×
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setPxZaSekundu((z) => Math.max(8, z / 1.5))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
                title="Oddálit"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-neutral-400 w-12 text-center">{Math.round(pxZaSekundu)} px/s</span>
              <button
                onClick={() => setPxZaSekundu((z) => Math.min(240, z * 1.5))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
                title="Přiblížit"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Stopy + časová osa */}
          <div className="flex">
            {/* Hlavičky stop */}
            <div className="shrink-0 border-r border-white/10 bg-black/40" style={{ width: SIRKA_HLAVICEK }}>
              <div className="h-7 border-b border-white/10 px-3 flex items-center text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Stopy ({stav.tracks.length})
              </div>
              {stav.tracks.map((t, i) => (
                <div
                  key={t.index}
                  onClick={() => setVybranaStopa(i)}
                  style={{ height: VYSKA_STOPY }}
                  className={`px-2.5 py-1 border-b border-white/[0.06] cursor-pointer flex flex-col justify-center gap-1 ${
                    i === vybranaStopa ? 'bg-[#FF9F0A]/10 border-l-2 border-l-[#FF9F0A]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-white truncate flex-1" title={`${t.name} · ${t.programName}`}>
                      {t.name}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); midiPlayerService.toggleSolo(t.index); }}
                      className={`px-1 rounded text-[9px] font-black cursor-pointer ${t.solo ? 'bg-[#FF9F0A] text-black' : 'bg-white/10 text-neutral-400'}`}
                    >S</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); midiPlayerService.toggleMute(t.index); }}
                      className={`p-0.5 rounded cursor-pointer ${t.muted ? 'bg-[#FF453A]/25 text-[#FF453A]' : 'bg-white/10 text-neutral-400'}`}
                    >
                      {t.muted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                    </button>
                  </div>
                  <select
                    value={t.profile}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => midiPlayerService.setTrackProfile(t.index, e.target.value as InstrumentProfile)}
                    className="bg-black/60 text-neutral-300 text-[9px] px-1.5 py-0.5 rounded border border-white/10 outline-none cursor-pointer w-full"
                  >
                    {INSTRUMENT_PROFILES.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Osa — jeden posuv pro pravítko i stopy, jinak by se rozešly */}
            <div ref={osaRef} className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="relative" style={{ width: sirkaOsy }}>
                {/* Pravítko */}
                <div
                  onClick={klikDoOsy}
                  className="h-7 border-b border-white/10 relative cursor-pointer bg-black/50"
                >
                  {znacky.map((s) => (
                    <div key={s} className="absolute top-0 bottom-0 border-l border-white/10" style={{ left: s * pxZaSekundu }}>
                      <span className="text-[9px] font-mono text-neutral-500 pl-1">{formatCas(s)}</span>
                    </div>
                  ))}
                </div>

                {/* Stopy */}
                {stav.tracks.map((t, i) => {
                  const min = t.notes.length ? Math.min(...t.notes.map((n) => n.midi)) : 48;
                  const max = t.notes.length ? Math.max(...t.notes.map((n) => n.midi)) : 72;
                  const rozpeti = Math.max(1, max - min);
                  return (
                    <div
                      key={t.index}
                      onClick={() => setVybranaStopa(i)}
                      style={{ height: VYSKA_STOPY }}
                      className={`relative border-b border-white/[0.06] cursor-pointer ${
                        i === vybranaStopa ? 'bg-[#FF9F0A]/[0.06]' : ''
                      } ${t.muted ? 'opacity-35' : ''}`}
                    >
                      {t.notes.map((n, k) => (
                        <div
                          key={k}
                          className="absolute rounded-[2px] bg-[#FF9F0A]"
                          style={{
                            left: n.time * pxZaSekundu,
                            width: Math.max(2, n.duration * pxZaSekundu),
                            top: 4 + (1 - (n.midi - min) / rozpeti) * (VYSKA_STOPY - 12),
                            height: 4,
                            opacity: 0.35 + n.velocity * 0.65,
                          }}
                        />
                      ))}
                    </div>
                  );
                })}

                {/* Přehrávací čára přes celou osu */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-[#30D158] pointer-events-none z-10"
                  style={{ left: stav.position * pxZaSekundu }}
                />
              </div>
            </div>
          </div>

          {/* Editor vybrané stopy */}
          {stopa && (
            <div className="border-t border-white/10">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/30">
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Editor — {stopa.name}
                </span>
                <span className="text-[10px] text-neutral-500">
                  {stopa.notes.length} not · klik přidá, klik na notu smaže
                </span>
                <button
                  onClick={() => midiPlayerService.setTrackNotes(stopa.index, [])}
                  className="ml-auto flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-[#FF453A] cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Vymazat stopu
                </button>
              </div>

              <div className="overflow-auto max-h-64 bg-black/50">
                <div
                  className="relative cursor-crosshair"
                  style={{ width: sirkaOsy, height: radkuRoll * VYSKA_RADKU_ROLL }}
                  onClick={pridejNotu}
                >
                  {Array.from({ length: radkuRoll }, (_, r) => {
                    const midi = rozsah.max - r;
                    return CERNE.has(midi % 12) ? (
                      <div key={r} className="absolute w-full bg-white/[0.035]" style={{ top: r * VYSKA_RADKU_ROLL, height: VYSKA_RADKU_ROLL }} />
                    ) : null;
                  })}

                  {stopa.notes.map((n, k) => (
                    <div
                      key={k}
                      onClick={(e) => {
                        e.stopPropagation();
                        midiPlayerService.setTrackNotes(stopa.index, stopa.notes.filter((_, j) => j !== k));
                      }}
                      title={`${midiToNoteName(n.midi)} · ${n.time.toFixed(2)} s`}
                      className="absolute rounded-[2px] bg-[#FF9F0A] hover:bg-[#FF453A] transition-colors"
                      style={{
                        left: n.time * pxZaSekundu,
                        top: (rozsah.max - n.midi) * VYSKA_RADKU_ROLL + 1,
                        width: Math.max(3, n.duration * pxZaSekundu - 1),
                        height: VYSKA_RADKU_ROLL - 2,
                        opacity: 0.45 + n.velocity * 0.55,
                      }}
                    />
                  ))}

                  <div
                    className="absolute top-0 bottom-0 w-px bg-[#30D158] pointer-events-none"
                    style={{ left: stav.position * pxZaSekundu }}
                  />
                </div>
              </div>

              <div className="px-4 py-2 text-[10px] text-neutral-500 border-t border-white/[0.06]">
                Úpravy platí jen v přehrávači — soubor v knihovně se nemění.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
