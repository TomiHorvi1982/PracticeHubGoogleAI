import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  sampledDrumEngine,
  DrumArticulation,
  DrumMixerChannelName,
  DrumMixerChannelConfig,
} from '../services/SampledDrumEngine';
import { drumKitFactory } from '../services/drumKitFactory';
import { customDrumKitService } from '../services/customDrumKitService';
import { WaveformPrehravac } from './songbook/WaveformPrehravac';
import { drumGrooveService, Groove, GroovePackFacet, LoopState } from '../services/drumGrooveService';
import { assetLibraryService, LibraryAsset } from '../services/assetLibraryService';
import { CustomDrumKit } from '../types';
import {
  Disc,
  Sliders,
  Play,
  Square,
  Repeat,
  Search,
  Loader2,
  X,
  Plus,
  FolderOpen,
  ChevronDown,
  Music4,
} from 'lucide-react';

interface SampledDrumsStudioProps {
  onOpenCustomKitModal?: () => void;
  onNavigateToLibrary?: () => void;
}

interface PadTriggerDef {
  id: DrumArticulation;
  czName: string;
  keyLabel: string;
  category: 'kick' | 'snare' | 'hihat' | 'toms' | 'cymbals' | 'perc';
  icon: string;
}

const DRUM_PAD_GRID: PadTriggerDef[] = [
  { id: 'kick', czName: 'Kopák', keyLabel: 'Q', category: 'kick', icon: '🥁' },
  { id: 'snare', czName: 'Virbl', keyLabel: 'W', category: 'snare', icon: '🪘' },
  { id: 'snare_rimshot', czName: 'Virbl — rimshot', keyLabel: 'E', category: 'snare', icon: '💥' },
  { id: 'snare_sidestick', czName: 'Virbl — side-stick', keyLabel: 'R', category: 'snare', icon: '🪵' },
  { id: 'hihat_closed', czName: 'Hi-hat zavřená', keyLabel: 'A', category: 'hihat', icon: '🪙' },
  { id: 'hihat_semi', czName: 'Hi-hat pootevřená', keyLabel: 'S', category: 'hihat', icon: '✨' },
  { id: 'hihat_open', czName: 'Hi-hat otevřená', keyLabel: 'D', category: 'hihat', icon: '🌟' },
  { id: 'hihat_pedal', czName: 'Hi-hat pedál', keyLabel: 'F', category: 'hihat', icon: '🦶' },
  { id: 'tom_high', czName: 'Přechod malý', keyLabel: 'T', category: 'toms', icon: '🪘' },
  { id: 'tom_mid', czName: 'Přechod střední', keyLabel: 'Y', category: 'toms', icon: '🪘' },
  { id: 'tom_low', czName: 'Kotel', keyLabel: 'U', category: 'toms', icon: '🥁' },
  { id: 'crash_left', czName: 'Crash 16"', keyLabel: 'G', category: 'cymbals', icon: '💥' },
  { id: 'crash_right', czName: 'Crash 18"', keyLabel: 'H', category: 'cymbals', icon: '⚡' },
  { id: 'ride_bow', czName: 'Ride', keyLabel: 'J', category: 'cymbals', icon: '🛸' },
  { id: 'ride_bell', czName: 'Ride — zvon', keyLabel: 'K', category: 'cymbals', icon: '🔔' },
  { id: 'china', czName: 'China', keyLabel: 'L', category: 'cymbals', icon: '🔥' },
  { id: 'splash', czName: 'Splash', keyLabel: 'Z', category: 'cymbals', icon: '💦' },
  { id: 'tambourine', czName: 'Tamburína', keyLabel: 'X', category: 'perc', icon: '🪇' },
  { id: 'cowbell', czName: 'Zvonec', keyLabel: 'C', category: 'perc', icon: '🛎️' },
  { id: 'shaker', czName: 'Šejkr', keyLabel: 'V', category: 'perc', icon: '🧂' },
  { id: 'handclap', czName: 'Tlesknutí', keyLabel: 'B', category: 'perc', icon: '👏' },
];

/** Barva rámečku podle dílu sady — kopák modrý, virbl jantarový a tak dál. */
const BARVA_PADU: Record<PadTriggerDef['category'], string> = {
  kick: 'from-blue-950/30 border-blue-500/20 hover:border-blue-400/50',
  snare: 'from-amber-950/30 border-amber-500/20 hover:border-amber-400/50',
  hihat: 'from-emerald-950/30 border-emerald-500/20 hover:border-emerald-400/50',
  toms: 'from-purple-950/30 border-purple-500/20 hover:border-purple-400/50',
  cymbals: 'from-yellow-950/30 border-yellow-500/20 hover:border-yellow-400/50',
  perc: 'from-neutral-900/60 border-white/10 hover:border-white/25',
};

/** Kolik variant zvuku smí mít jeden pad. Víc než pět už nikdo nerozezná. */
const MAX_VARIANT = 5;

const POPIS_ROLE: Record<string, string> = {
  groove: 'Doprovod',
  fill: 'Přechod',
  intro: 'Nájezd',
  end: 'Zakončení',
};

export const SampledDrumsStudio: React.FC<SampledDrumsStudioProps> = ({
  onOpenCustomKitModal,
  onNavigateToLibrary,
}) => {
  const [kit, setKit] = useState<CustomDrumKit | null>(null);
  const [mixerConfig, setMixerConfig] = useState<Record<DrumMixerChannelName, DrumMixerChannelConfig>>(
    sampledDrumEngine.getMixerConfig()
  );
  const [poslednirPad, setPoslednirPad] = useState<DrumArticulation | null>(null);

  /**
   * Úrovně pro ukazatele u faderů. Odečítají se ve smyčce vykreslování, ne
   * přes interval — jdou tak v krok se snímky obrazovky a při skryté kartě
   * se prohlížeč sám zastaví.
   */
  const [urovne, setUrovne] = useState<Record<string, number>>({});

  useEffect(() => {
    let bezi = true;
    let snimek = 0;
    const tik = () => {
      if (!bezi) return;
      setUrovne(sampledDrumEngine.getMeterLevels());
      snimek = requestAnimationFrame(tik);
    };
    snimek = requestAnimationFrame(tik);
    return () => {
      bezi = false;
      cancelAnimationFrame(snimek);
    };
  }, []);

  // --- SADA ---------------------------------------------------------------
  // Sada je jedna. Engine si ale pamatuje naposledy vybranou, což bývá
  // některá z vestavěných syntetizovaných — ty se už nenabízejí, takže se
  // musí přepnout, jinak by pady hrály náhradní zvuk místo vzorků.
  useEffect(() => {
    const nastav = async (kits: CustomDrumKit[]) => {
      const prvni = kits[0] || null;
      setKit(prvni);
      // Přepnout je potřeba i tehdy, když engine tuhle sadu už jako aktivní
      // vede — vybraná totiž neznamená načtená. `switchKit` si sám ověří,
      // jestli má vzorky v paměti, a případně je dotáhne; kdybych to volání
      // přeskočil, pady i smyčka by mlčely, dokud by sadu někdo nepřepnul ručně.
      if (prvni) {
        await drumKitFactory.switchKit(prvni.id);
      }
    };
    void nastav(customDrumKitService.getAllKits());
    const odhlas = customDrumKitService.subscribe((kits) => void nastav(kits));
    return odhlas;
  }, []);

  useEffect(() => {
    const odhlasStav = sampledDrumEngine.subscribeState(() => {
      setMixerConfig(sampledDrumEngine.getMixerConfig());
    });
    const odhlasHlas = sampledDrumEngine.subscribeVoice((e) => setPoslednirPad(e.articulation));
    return () => {
      odhlasStav();
      odhlasHlas();
    };
  }, []);

  // --- LOOPER -------------------------------------------------------------
  const [loop, setLoop] = useState<LoopState>(drumGrooveService.getState());
  useEffect(() => drumGrooveService.subscribe(setLoop), []);

  // Když uživatel odejde jinam, smyčka nesmí hrát dál na pozadí.
  useEffect(() => () => drumGrooveService.stop(), []);

  // --- PROHLÍŽEČ GROOVES --------------------------------------------------
  const [facets, setFacets] = useState<GroovePackFacet[]>([]);
  const [celkemVeSbirce, setCelkemVeSbirce] = useState(0);
  const [pack, setPack] = useState('');
  const [styl, setStyl] = useState('');
  const [role, setRole] = useState('');
  const [hledani, setHledani] = useState('');
  const [grooves, setGrooves] = useState<Groove[]>([]);
  const [celkemNalezeno, setCelkemNalezeno] = useState(0);
  const [nacitamSeznam, setNacitamSeznam] = useState(false);
  const [chybaSbirky, setChybaSbirky] = useState<string | null>(null);
  const [rozbaleny, setRozbaleny] = useState<string | null>(null);

  useEffect(() => {
    drumGrooveService
      .facets()
      .then((f) => {
        setFacets(f.packs);
        setCelkemVeSbirce(f.total);
        if (f.packs.length && !pack) setRozbaleny(f.packs[0].id);
      })
      .catch((e) => setChybaSbirky(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hledání čeká, až člověk dopíše. Dotaz na každé písmeno by poslal pět
  // požadavků na slovo a seznam by pod rukama poskakoval.
  useEffect(() => {
    const t = setTimeout(() => {
      setNacitamSeznam(true);
      drumGrooveService
        .browse({ pack, style: styl, role, search: hledani, limit: 150 })
        .then((r) => {
          setGrooves(r.grooves);
          setCelkemNalezeno(r.total);
          setChybaSbirky(null);
        })
        .catch((e) => setChybaSbirky(e.message))
        .finally(() => setNacitamSeznam(false));
    }, 250);
    return () => clearTimeout(t);
  }, [pack, styl, role, hledani]);

  const vyberGroove = useCallback((g: Groove) => {
    void drumGrooveService.load(g, true);
  }, []);

  // --- VÝBĚR VZORKŮ K PADŮM ----------------------------------------------
  const [otevrenyPad, setOtevrenyPad] = useState<DrumArticulation | null>(null);
  const [vzorky, setVzorky] = useState<LibraryAsset[]>([]);
  const [hledaniVzorku, setHledaniVzorku] = useState('');
  const [nacitamVzorky, setNacitamVzorky] = useState(false);
  const [pridavam, setPridavam] = useState<string | null>(null);
  /** Vzorek, jehož křivka je rozbalená. Vzorky bicích trvají zlomek sekundy,
   *  takže z křivky je líp než z čehokoli jiného vidět, jestli má úder náběh
   *  a doznění, nebo je useknutý. */
  const [krivkaVzorku, setKrivkaVzorku] = useState<{ klic: string; name: string; url: string } | null>(null);

  useEffect(() => {
    if (!otevrenyPad) return;
    setNacitamVzorky(true);
    assetLibraryService
      .listPage({ category: 'drum_kit_sample', search: hledaniVzorku || undefined, limit: 120, sort: 'name' })
      .then((r) => setVzorky(r.assets))
      .catch(() => setVzorky([]))
      .finally(() => setNacitamVzorky(false));
  }, [otevrenyPad, hledaniVzorku]);

  /** Varianty, které pad právě má — z vícevrstvé mapy sady. */
  const variantyPadu = useCallback(
    (art: DrumArticulation) => {
      const vrstvy = kit?.multiLayers?.[art];
      if (!vrstvy) return [] as { klic: string; name: string }[];
      return Object.entries(vrstvy).map(([klic, v]) => ({ klic, name: v.name, dataUrl: v.dataUrl }));
    },
    [kit]
  );

  const pridejVzorek = async (art: DrumArticulation, asset: LibraryAsset) => {
    if (!kit) return;
    const stavajici = variantyPadu(art);
    if (stavajici.length >= MAX_VARIANT) return;

    setPridavam(asset.id);
    try {
      const url = await assetLibraryService.getDownloadUrl(asset.id);
      if (!url) throw new Error('Knihovna nevrátila odkaz na soubor.');
      const res = await fetch(url);
      const blob = await res.blob();
      const dataUrl = await customDrumKitService.readFileAsDataUrl(blob);

      // Varianty jedné hlasitosti se střídají (round-robin), aby opakovaný
      // úder nezněl pokaždé úplně stejně. Nové číslo je první volné.
      const obsazena = new Set(stavajici.map((v) => v.klic));
      let rr = 1;
      while (obsazena.has(`hard:rr${rr}`) && rr <= MAX_VARIANT) rr++;

      const aktualizovana = await customDrumKitService.addMultiLayerSample(kit.id, art, {
        tier: 'hard',
        roundRobin: rr,
        name: asset.name,
        dataUrl,
        size: Number(asset.size_bytes || 0),
        uploadedAt: Date.now(),
      });

      if (aktualizovana) {
        setKit(aktualizovana);
        // Bez tohohle by se nový zvuk ozval až po přenačtení stránky.
        await sampledDrumEngine.preloadCustomKit(aktualizovana);
      }
    } catch {
      /* chyba se projeví tím, že varianta nepřibude */
    } finally {
      setPridavam(null);
    }
  };

  const odeberVzorek = async (art: DrumArticulation, klic: string) => {
    if (!kit) return;
    const [tier, rr] = klic.split(':');
    const aktualizovana = await customDrumKitService.removeMultiLayerSample(
      kit.id,
      art,
      tier as any,
      parseInt(rr.replace('rr', ''), 10)
    );
    if (aktualizovana) setKit(aktualizovana);
  };

  // --- HRANÍ --------------------------------------------------------------
  const zahrajPad = useCallback((art: DrumArticulation) => {
    sampledDrumEngine.triggerPad(art, 100);
  }, []);

  useEffect(() => {
    const naKlavesu = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const pad = DRUM_PAD_GRID.find((p) => p.keyLabel === e.key.toUpperCase());
      if (pad) {
        e.preventDefault();
        zahrajPad(pad.id);
      }
    };
    window.addEventListener('keydown', naKlavesu);
    return () => window.removeEventListener('keydown', naKlavesu);
  }, [zahrajPad]);

  const aktivniPack = facets.find((p) => p.id === pack);

  return (
    <div className="space-y-5">
      {/* 1. LOOPER — přehrávač grooves z knihovny */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Music4 className="w-4 h-4 text-[#FF9F0A]" /> Groovy z knihovny
            </h3>
            <p className="text-[11px] text-neutral-400">
              {celkemVeSbirce > 0
                ? `${celkemVeSbirce.toLocaleString('cs')} grooves ve sbírce. Vyber a hraje hned dokola.`
                : 'Sbírka bicích MIDI z knihovny.'}
            </p>
          </div>
          {onNavigateToLibrary && (
            <button
              onClick={onNavigateToLibrary}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-bold text-neutral-300 transition-all cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" /> Knihovna
            </button>
          )}
        </div>

        {chybaSbirky && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-[12px] text-red-300">
            {chybaSbirky}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* Členění sbírky */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={hledani}
                onChange={(e) => setHledani(e.target.value)}
                placeholder="Hledat groove…"
                className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-[12px] text-white placeholder-neutral-500 outline-none focus:border-[#FF9F0A]/50"
              />
            </div>

            <div className="flex gap-1">
              {[
                { id: '', label: 'Vše' },
                { id: 'groove', label: 'Doprovody' },
                { id: 'fill', label: 'Přechody' },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    role === r.id ? 'bg-[#FF9F0A] text-black' : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="bg-black/40 border border-white/10 rounded-2xl p-2 max-h-[340px] overflow-y-auto space-y-1 scrollbar-thin">
              <button
                onClick={() => {
                  setPack('');
                  setStyl('');
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  !pack ? 'bg-white/15 text-white' : 'text-neutral-400 hover:bg-white/5'
                }`}
              >
                Všechny balíky
              </button>

              {facets.map((p) => (
                <div key={p.id}>
                  <button
                    onClick={() => {
                      setPack(p.id);
                      setStyl('');
                      setRozbaleny(rozbaleny === p.id ? null : p.id);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      pack === p.id ? 'bg-[#FF9F0A]/15 text-[#FF9F0A]' : 'text-neutral-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <ChevronDown
                        className={`w-3 h-3 shrink-0 transition-transform ${rozbaleny === p.id ? '' : '-rotate-90'}`}
                      />
                      <span className="truncate">{p.label}</span>
                    </span>
                    <span className="text-[9px] font-mono text-neutral-500 shrink-0">{p.count}</span>
                  </button>

                  {rozbaleny === p.id && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                      {p.styles.map((s) => (
                        <button
                          key={s.style}
                          onClick={() => {
                            setPack(p.id);
                            setStyl(styl === s.style ? '' : s.style);
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-[10px] transition-all cursor-pointer ${
                            styl === s.style
                              ? 'bg-white/15 text-white font-bold'
                              : 'text-neutral-400 hover:bg-white/5'
                          }`}
                        >
                          <span className="truncate">{s.style}</span>
                          <span className="font-mono text-neutral-600 shrink-0">{s.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Seznam a přehrávání */}
          <div className="space-y-3">
            {/* Transport */}
            <div className="bg-black/50 border border-white/10 rounded-2xl p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => drumGrooveService.toggle()}
                  disabled={!loop.groove || loop.nacita}
                  className={`p-3 rounded-2xl transition-all cursor-pointer shadow-lg disabled:opacity-30 disabled:cursor-not-allowed ${
                    loop.hraje ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-[#30D158] hover:bg-[#28b84d] text-black'
                  }`}
                  title={loop.hraje ? 'Zastavit' : 'Přehrát'}
                >
                  {loop.nacita ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : loop.hraje ? (
                    <Square className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-white truncate">
                    {loop.groove ? loop.groove.name : 'Nic nevybráno'}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {loop.groove
                      ? `${loop.groove.packLabel} · ${loop.groove.style}${
                          loop.groove.bars ? ` · ${loop.groove.bars} t.` : ''
                        }`
                      : 'Vyber groove ze seznamu vpravo.'}
                  </div>
                </div>

                <button
                  onClick={() => drumGrooveService.setLoop(!loop.loop)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    loop.loop
                      ? 'bg-[#FF9F0A]/20 border-[#FF9F0A]/50 text-[#FF9F0A]'
                      : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                  }`}
                  title={loop.loop ? 'Smyčka zapnutá' : 'Smyčka vypnutá'}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-[10px] font-bold text-neutral-400">Tempo</span>
                  <input
                    type="number"
                    min={40}
                    max={300}
                    value={loop.bpm}
                    onChange={(e) => drumGrooveService.setBpm(parseInt(e.target.value, 10) || loop.bpm)}
                    className="w-14 bg-[#1C1C1E] text-white font-mono font-bold text-xs p-1 rounded-lg border border-white/10 text-center outline-none"
                  />
                  <span className="text-[9px] font-mono text-neutral-500">BPM</span>
                  {loop.puvodniBpm !== loop.bpm && (
                    <button
                      onClick={() => drumGrooveService.setBpm(loop.puvodniBpm)}
                      className="text-[9px] font-mono text-[#FF9F0A] hover:underline cursor-pointer"
                      title="Zpět na tempo ze souboru"
                    >
                      ↺ {loop.puvodniBpm}
                    </button>
                  )}
                </div>
              </div>

              {/* Když smyčka běží a nic není slyšet, musí být řečeno proč.
                  Nejčastěji sada nemá načtený vzorek pro díl, který groove
                  používá — a engine takový úder tiše zahodí. */}
              {loop.hraje && loop.poslano > 0 && loop.zaznelo === 0 && (
                <div className="flex items-start gap-2 text-[11px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-xl px-3 py-2">
                  <span className="shrink-0">⚠</span>
                  <span>
                    Smyčka běží, ale sada nezahrála ani jeden z {loop.poslano} úderů — chybí jí načtené
                    vzorky. Zkus dole u padů vybrat zvuky, nebo otevřít Správu sady.
                  </span>
                </div>
              )}
              {loop.hraje && loop.zaznelo > 0 && loop.zaznelo < loop.poslano && (
                <div className="text-[10px] text-neutral-500">
                  Zaznělo {loop.zaznelo} z {loop.poslano} úderů — zbytek nemá v sadě vzorek.
                </div>
              )}

              {/* Ukazatel pozice ve smyčce */}
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FF9F0A] rounded-full"
                  style={{ width: `${Math.round(loop.pozice * 100)}%`, transition: 'width 60ms linear' }}
                />
              </div>

              {/* Které díly sady hrát */}
              {loop.obsazene.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mr-1">Hraje:</span>
                  {loop.obsazene.map((art) => {
                    const pad = DRUM_PAD_GRID.find((p) => p.id === art);
                    const vypnuty = loop.vypnute.has(art);
                    return (
                      <button
                        key={art}
                        onClick={() => drumGrooveService.togglePart(art)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                          vypnuty
                            ? 'bg-transparent border-white/10 text-neutral-600 line-through'
                            : 'bg-[#30D158]/15 border-[#30D158]/40 text-[#30D158]'
                        }`}
                        title={vypnuty ? 'Zapnout' : 'Vypnout'}
                      >
                        {pad?.czName || art}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Seznam grooves */}
            <div className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  {aktivniPack ? aktivniPack.label : 'Vše'}
                  {styl && ` · ${styl}`}
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  {nacitamSeznam ? '…' : `${Math.min(grooves.length, celkemNalezeno)} z ${celkemNalezeno}`}
                </span>
              </div>

              <div className="max-h-[300px] overflow-y-auto scrollbar-thin divide-y divide-white/[0.04]">
                {grooves.length === 0 && !nacitamSeznam && (
                  <div className="p-6 text-center text-[12px] text-neutral-500">
                    {celkemVeSbirce === 0
                      ? 'Ve sbírce zatím nejsou žádné bicí groovy — nahrávání MIDI ještě běží.'
                      : 'Nic neodpovídá.'}
                  </div>
                )}

                {grooves.map((g) => {
                  const aktivni = loop.groove?.id === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => vyberGroove(g)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-all cursor-pointer ${
                        aktivni ? 'bg-[#FF9F0A]/15' : 'hover:bg-white/5'
                      }`}
                    >
                      <div
                        className={`w-1 h-8 rounded-full shrink-0 ${
                          aktivni && loop.hraje ? 'bg-[#30D158] animate-pulse' : aktivni ? 'bg-[#FF9F0A]' : 'bg-white/10'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-[12px] font-bold truncate ${aktivni ? 'text-[#FF9F0A]' : 'text-white'}`}>
                          {g.name}
                        </div>
                        <div className="text-[10px] text-neutral-500 truncate">
                          {g.style} · {POPIS_ROLE[g.role] || g.role}
                          {g.group ? ` · ${g.group}` : ''}
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-neutral-500 shrink-0 text-right">
                        {g.bpm ? <div>{g.bpm} BPM</div> : null}
                        {g.bars ? <div className="text-neutral-600">{g.bars} t.</div> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PADY — hraní a výběr zvuků */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Disc className="w-4 h-4 text-[#FF9F0A]" /> Sada {kit ? `— ${kit.czName || kit.name}` : ''}
            </h3>
            <p className="text-[11px] text-neutral-400">
              Klikni nebo hraj z klávesnice (Q, W, E, A, S, D…). Šipkou u padu vybereš, čím hraje.
            </p>
          </div>
          {onOpenCustomKitModal && (
            <button
              onClick={onOpenCustomKitModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-bold text-neutral-300 transition-all cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" /> Správa sady
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {DRUM_PAD_GRID.map((pad) => {
            const varianty = variantyPadu(pad.id);
            const prave = poslednirPad === pad.id;

            return (
              <div key={pad.id} className="relative">
                <button
                  onClick={() => zahrajPad(pad.id)}
                  className={`w-full flex flex-col justify-between p-3.5 h-[104px] rounded-2xl border text-left transition-all active:scale-95 cursor-pointer shadow-lg select-none bg-gradient-to-b to-black/60 ${
                    prave
                      ? 'from-[#FF9F0A]/30 border-[#FF9F0A] shadow-[0_0_20px_rgba(255,159,10,0.4)]'
                      : BARVA_PADU[pad.category]
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{pad.icon}</span>
                    <span className="px-2 py-0.5 bg-black/80 border border-white/20 text-[#FF9F0A] font-mono text-[10px] font-black rounded-lg">
                      {pad.keyLabel}
                    </span>
                  </div>
                  <div>
                    <div className="text-[12px] font-bold text-white truncate">{pad.czName}</div>
                    <div className="text-[10px] text-neutral-400">
                      {varianty.length > 0 ? (
                        <span className="text-[#30D158]">
                          {varianty.length} {varianty.length === 1 ? 'zvuk' : varianty.length < 5 ? 'zvuky' : 'zvuků'}
                        </span>
                      ) : (
                        <span className="text-neutral-600">bez zvuku</span>
                      )}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => { setOtevrenyPad(otevrenyPad === pad.id ? null : pad.id); setKrivkaVzorku(null); }}
                  className="absolute bottom-2.5 right-2.5 p-1 rounded-lg bg-black/70 border border-white/15 text-neutral-400 hover:text-[#FF9F0A] hover:border-[#FF9F0A]/50 transition-all cursor-pointer"
                  title="Vybrat zvuky"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${otevrenyPad === pad.id ? 'rotate-180' : ''}`} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Výběr zvuků pro jeden pad */}
        {otevrenyPad && (
          <div className="bg-black/60 border border-[#FF9F0A]/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-[13px] font-bold text-white">
                  Zvuky pro {DRUM_PAD_GRID.find((p) => p.id === otevrenyPad)?.czName}
                </h4>
                <p className="text-[10px] text-neutral-400">
                  Až {MAX_VARIANT} vzorků. Střídají se, aby opakovaný úder nezněl pokaždé stejně.
                </p>
              </div>
              <button
                onClick={() => setOtevrenyPad(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Co pad hraje teď */}
            <div className="flex flex-wrap gap-1.5">
              {variantyPadu(otevrenyPad).length === 0 && (
                <span className="text-[11px] text-neutral-500">Zatím žádný zvuk — vyber z knihovny níž.</span>
              )}
              {variantyPadu(otevrenyPad).map((v) => (
                <span
                  key={v.klic}
                  className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-[#30D158]/15 border border-[#30D158]/40 rounded-lg text-[10px] font-bold text-[#30D158]"
                >
                  <button
                    onClick={() =>
                      setKrivkaVzorku((p) =>
                        p?.klic === v.klic ? null : { klic: v.klic, name: v.name, url: v.dataUrl }
                      )
                    }
                    className="truncate max-w-[160px] cursor-pointer hover:underline"
                    title="Ukázat křivku a přehrát"
                  >
                    {v.name}
                  </button>
                  <button
                    onClick={() => void odeberVzorek(otevrenyPad, v.klic)}
                    className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-all cursor-pointer"
                    title="Odebrat"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            {krivkaVzorku && (
              <WaveformPrehravac url={krivkaVzorku.url} nazev={krivkaVzorku.name} />
            )}

            {/* Nabídka z knihovny */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={hledaniVzorku}
                onChange={(e) => setHledaniVzorku(e.target.value)}
                placeholder="Hledat vzorek v knihovně…"
                className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-[12px] text-white placeholder-neutral-500 outline-none focus:border-[#FF9F0A]/50"
              />
            </div>

            <div className="max-h-[180px] overflow-y-auto scrollbar-thin grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {nacitamVzorky && <span className="text-[11px] text-neutral-500 p-2">Načítám…</span>}
              {!nacitamVzorky && vzorky.length === 0 && (
                <span className="text-[11px] text-neutral-500 p-2">
                  V knihovně nejsou žádné vzorky bicích.
                </span>
              )}
              {vzorky.map((a) => {
                const plno = variantyPadu(otevrenyPad).length >= MAX_VARIANT;
                return (
                  <button
                    key={a.id}
                    onClick={() => void pridejVzorek(otevrenyPad, a)}
                    disabled={plno || pridavam === a.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-left transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {pridavam === a.id ? (
                      <Loader2 className="w-3 h-3 animate-spin text-[#FF9F0A] shrink-0" />
                    ) : (
                      <Plus className="w-3 h-3 text-neutral-500 shrink-0" />
                    )}
                    <span className="text-[11px] text-neutral-200 truncate">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. FADERY */}
      <div className="bg-[#16161A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="border-b border-white/[0.08] pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#30D158]" /> Mix
          </h3>
          <p className="text-[11px] text-neutral-400">Hlasitost, panorama a ztlumení jednotlivých dílů sady.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {(Object.keys(mixerConfig) as DrumMixerChannelName[]).map((chName) => {
            const ch = mixerConfig[chName];
            const uroven = urovne[chName] || 0;

            return (
              <div
                key={chName}
                className="bg-black/60 border border-white/10 p-3 rounded-2xl flex flex-col justify-between space-y-3 shadow-md"
              >
                <div className="text-center border-b border-white/[0.06] pb-2">
                  <div className="text-[11px] font-black text-white truncate">{ch.czLabel}</div>
                </div>

                <div className="flex flex-col items-center space-y-3 py-1">
                  <div className="h-36 flex items-center justify-center relative w-full gap-2">
                    {/* Ukazatel hlasitosti: roste zdola, jako na mixu. */}
                    <div className="h-32 w-1.5 rounded-full bg-black/60 border border-white/10 overflow-hidden flex flex-col justify-end shrink-0">
                      <div
                        className={`w-full rounded-full transition-[height] duration-75 ${
                          uroven > 0.85 ? 'bg-[#FF453A]' : uroven > 0.6 ? 'bg-[#FF9F0A]' : 'bg-[#30D158]'
                        }`}
                        style={{ height: `${Math.round(uroven * 100)}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.02"
                      value={ch.volume}
                      onChange={(e) => sampledDrumEngine.setChannelVolume(chName, parseFloat(e.target.value))}
                      className="w-32 h-2 -rotate-90 origin-center cursor-pointer accent-[#FF9F0A]"
                      title={`Hlasitost: ${Math.round(ch.volume * 100)}%`}
                    />
                  </div>

                  <div className="text-[11px] font-mono font-bold text-neutral-200">
                    {Math.round(ch.volume * 100)}%
                  </div>

                  <div className="w-full space-y-1">
                    <div className="flex justify-between text-[9px] font-mono text-neutral-400">
                      <span>L</span>
                      <span>{ch.pan > 0 ? `+${ch.pan}` : ch.pan === 0 ? 'C' : ch.pan}</span>
                      <span>R</span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={ch.pan}
                      onChange={(e) => sampledDrumEngine.setChannelPan(chName, parseFloat(e.target.value))}
                      className="w-full h-1.5 cursor-pointer accent-[#30D158]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.06]">
                  <button
                    onClick={() => sampledDrumEngine.setChannelMute(chName, !ch.mute)}
                    className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      ch.mute ? 'bg-red-500 text-white' : 'bg-white/5 hover:bg-white/10 text-neutral-400'
                    }`}
                  >
                    MUTE
                  </button>
                  <button
                    onClick={() => sampledDrumEngine.setChannelSolo(chName, !ch.solo)}
                    className={`py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      ch.solo ? 'bg-amber-400 text-black' : 'bg-white/5 hover:bg-white/10 text-neutral-400'
                    }`}
                  >
                    SOLO
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
