import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as alphaTab from '@coderline/alphatab';
import { Play, Pause, Square, Upload, Repeat, Loader2 } from 'lucide-react';
import { Song } from '../types';
import { songDatabaseService } from '../services/songDatabaseService';
import { dataModulu } from './songbook/moduleRegistry';
import { nactiPrilohuJakoUrl } from '../services/assetLibraryService';
import { loadTabSoundfont } from '../services/tabSoundfontService';
import { FONT_DIRECTORY, FALLBACK_SOUNDFONT } from '../services/alphaTabNastaveni';
import { cas as formatCas } from '../services/vlnovka';

/**
 * Holá plocha alphaTabu s nastavením po ruce.
 *
 * Sekce Guitar Pro je přehrávač na hraní: má mixér stop, kostičky taktů,
 * smyčku, cvičení. Tohle je opak — knihovna tak, jak je, a k ní přepínače,
 * kterými se dá za běhu měnit, jak se partitura vykresluje. Hodí se, když
 * chceš zkusit, jak co vypadá, nebo rychle otevřít cizí soubor bez toho,
 * abys ho zakládal do zpěvníku.
 */

const ROZVRZENI = [
  { id: alphaTab.LayoutMode.Page, popis: 'Na stránku' },
  { id: alphaTab.LayoutMode.Horizontal, popis: 'Do jedné řady' },
];

const OSNOVA = [
  { id: alphaTab.StaveProfile.Default, popis: 'Podle souboru' },
  { id: alphaTab.StaveProfile.ScoreTab, popis: 'Noty + tab' },
  { id: alphaTab.StaveProfile.Score, popis: 'Jen noty' },
  { id: alphaTab.StaveProfile.Tab, popis: 'Jen tab' },
];

const RYCHLOSTI = [0.25, 0.5, 0.75, 1, 1.25, 1.5];

export const AlphaTabPlayground: React.FC = () => {
  const plocha = useRef<HTMLDivElement>(null);
  const api = useRef<alphaTab.AlphaTabApi | null>(null);
  /** Blob adresy, které jsme vyrobili — po výměně souboru se uvolňují. */
  const blobAdresy = useRef<string[]>([]);

  const [pisne, setPisne] = useState<Song[]>([]);
  const [nazev, setNazev] = useState<string | null>(null);
  const [nacita, setNacita] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const [hraje, setHraje] = useState(false);
  const [stopy, setStopy] = useState<alphaTab.model.Track[]>([]);
  const [rozvrzeni, setRozvrzeni] = useState<number>(alphaTab.LayoutMode.Page);
  const [osnova, setOsnova] = useState<number>(alphaTab.StaveProfile.ScoreTab);
  const [zvetseni, setZvetseni] = useState(1);
  const [rychlost, setRychlost] = useState(1);
  const [smycka, setSmycka] = useState(false);
  const [metronom, setMetronom] = useState(false);
  /** Kam se posouvá plocha při hraní. Musí to být ten prvek, který roluje. */
  const posuvnaPlocha = useRef<HTMLDivElement>(null);
  const [samoPosouvat, setSamoPosouvat] = useState(true);
  const [kde, setKde] = useState(0);
  const [delka, setDelka] = useState(0);

  useEffect(() => {
    setPisne(songDatabaseService.getSongs());
    return songDatabaseService.subscribe(setPisne);
  }, []);

  /** Písně, ke kterým vůbec nějaká tabulatura je. */
  const sTabem = pisne
    .map((s) => ({ song: s, prilohy: dataModulu(s, 'tabs').prilohy }))
    .filter((x) => x.prilohy.length > 0);

  /** Postaví plochu nad novými daty. */
  const otevri = useCallback(async (bajty: Uint8Array, jmeno: string) => {
    setChyba(null);
    setNazev(jmeno);
    setNacita(true);

    api.current?.destroy();
    api.current = null;
    if (!plocha.current) return;

    const nastaveni = new alphaTab.Settings();
    nastaveni.core.fontDirectory = FONT_DIRECTORY;
    nastaveni.player.enablePlayer = true;
    nastaveni.player.soundFont = FALLBACK_SOUNDFONT;
    nastaveni.display.layoutMode = rozvrzeni;
    nastaveni.display.staveProfile = osnova;
    nastaveni.display.scale = zvetseni;
    // Kurzor a posouvání jsou vlastnosti knihovny, jen se musí zapnout.
    // Bez `scrollElement` nemá alphaTab čím rolovat a takt si musíš hledat
    // sám; bez kurzoru není poznat, kde se zrovna hraje.
    nastaveni.player.enableCursor = true;
    nastaveni.player.enableAnimatedBeatCursor = true;
    if (posuvnaPlocha.current) nastaveni.player.scrollElement = posuvnaPlocha.current;
    nastaveni.player.scrollMode = alphaTab.ScrollMode.Continuous;
    // Kousek nad kurzorem, ať se hraný takt nelepí na horní hranu.
    nastaveni.player.scrollOffsetY = -40;

    const a = new alphaTab.AlphaTabApi(plocha.current, nastaveni);
    api.current = a;

    let vykresleno = false;
    let cekajiciBanka: Uint8Array | null = null;
    /**
     * Banka se nasazuje až po dokončeném vykreslení.
     *
     * Nasazení doprostřed vykreslování ho shodí: partitura se rozparsuje,
     * ale plocha zůstane prázdná a nikde není chyba. Poprvé to projde,
     * protože se 38 MB stahuje déle, než trvá vykreslení; podruhé je
     * banka v paměti prohlížeče a nasadí se okamžitě.
     */
    const nasad = () => {
      if (!vykresleno || !cekajiciBanka || !api.current) return;
      const b = cekajiciBanka;
      cekajiciBanka = null;
      api.current.loadSoundFont(b, false);
    };

    a.scoreLoaded.on((score) => {
      setStopy(score.tracks || []);
      setNacita(false);
    });
    a.renderFinished.on(() => { vykresleno = true; nasad(); });
    a.playerStateChanged.on((e) => setHraje(e.state === alphaTab.synth.PlayerState.Playing));
    a.playerPositionChanged.on((e) => {
      setKde(e.currentTime / 1000);
      setDelka(e.endTime / 1000);
    });
    a.error.on((e: any) => {
      setChyba(e?.message || 'alphaTab soubor nepřečetl.');
      setNacita(false);
    });

    loadTabSoundfont()
      .then((b) => { if (b) { cekajiciBanka = b; nasad(); } })
      .catch(() => { /* hraje se dál na vestavěnou banku */ });

    a.load(bajty);
  }, [rozvrzeni, osnova, zvetseni]);

  /** Změna nastavení se propíše do už otevřené partitury, bez znovunačtení. */
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.settings.display.layoutMode = rozvrzeni;
    a.settings.display.staveProfile = osnova;
    a.settings.display.scale = zvetseni;
    a.updateSettings();
    a.render();
  }, [rozvrzeni, osnova, zvetseni]);

  useEffect(() => { if (api.current) api.current.playbackSpeed = rychlost; }, [rychlost]);
  useEffect(() => { if (api.current) api.current.isLooping = smycka; }, [smycka]);
  useEffect(() => { if (api.current) api.current.metronomeVolume = metronom ? 1 : 0; }, [metronom]);
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.settings.player.scrollMode = samoPosouvat
      ? alphaTab.ScrollMode.Continuous
      : alphaTab.ScrollMode.Off;
    a.updateSettings();
  }, [samoPosouvat]);

  useEffect(() => () => {
    api.current?.destroy();
    for (const u of blobAdresy.current) URL.revokeObjectURL(u);
  }, []);

  /** Soubor z počítače. Nezakládá se do zpěvníku — jen se otevře. */
  const zeSouboru = async (f: File) => {
    try {
      await otevri(new Uint8Array(await f.arrayBuffer()), f.name);
    } catch {
      setChyba('Soubor se nepodařilo přečíst.');
    }
  };

  /** Tabulatura ze zpěvníku. */
  const zKnihovny = async (songId: string, index: number) => {
    const zaznam = sTabem.find((x) => x.song.id === songId);
    const p = zaznam?.prilohy[index];
    if (!p) return;
    setNacita(true);
    setChyba(null);
    try {
      const url = p.storagePath
        ? await nactiPrilohuJakoUrl(p.storageBucket || 'r2', p.storagePath)
        : p.dataUrl;
      if (p.storagePath) blobAdresy.current.push(url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await otevri(new Uint8Array(await res.arrayBuffer()), p.name);
    } catch (e: any) {
      setChyba(e?.message || 'Tabulaturu se nepodařilo načíst.');
      setNacita(false);
    }
  };

  const prepinac = (
    popis: string,
    hodnoty: { id: number; popis: string }[],
    kde: number,
    kam: (v: number) => void,
  ) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 shrink-0">{popis}</span>
      <div className="flex bg-black/40 border border-white/10 rounded-xl p-0.5">
        {hodnoty.map((h) => (
          <button
            key={h.id}
            onClick={() => kam(h.id)}
            className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-all ${
              kde === h.id ? 'bg-[#FF9F0A] text-black font-bold' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {h.popis}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-white">AlphaTab</h1>
          <p className="text-xs text-neutral-400 flex-1 min-w-[220px]">
            Holá plocha knihovny a k ní nastavení, kterým se za běhu mění vykreslení.
            Na hraní je sekce Guitar&nbsp;Pro; tohle je na zkoušení a na cizí soubory.
          </p>
        </div>

        {/* Odkud vzít partituru */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            defaultValue=""
            onChange={(e) => {
              const [id, i] = e.target.value.split('|');
              if (id) void zKnihovny(id, Number(i));
            }}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-200 cursor-pointer outline-none focus:border-[#FF9F0A] max-w-[420px]"
          >
            <option value="">— tabulatura ze zpěvníku ({sTabem.length}) —</option>
            {sTabem.map(({ song, prilohy }) => (
              <optgroup key={song.id} label={`${song.artist ? `${song.artist} — ` : ''}${song.title}`}>
                {prilohy.map((p, i) => (
                  <option key={p.id} value={`${song.id}|${i}`}>{p.name}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-300 cursor-pointer transition-all">
            <Upload className="w-3.5 h-3.5" />
            Soubor z počítače
            <input
              type="file"
              accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.musicxml,.xml,.cap"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void zeSouboru(f); }}
            />
          </label>

          {nazev && <span className="text-[11px] text-neutral-500 truncate">{nazev}</span>}
          {nacita && <Loader2 className="w-4 h-4 animate-spin text-[#FF9F0A]" />}
        </div>

        {chyba && (
          <p className="text-[11px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-xl px-3 py-2">
            {chyba}
          </p>
        )}

        {/* Přehrávání */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/[0.06]">
          <button
            onClick={() => api.current?.playPause()}
            disabled={!stopy.length}
            className="w-10 h-10 rounded-xl bg-[#FF9F0A] hover:bg-[#FFB340] text-black flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
            title={hraje ? 'Pauza' : 'Přehrát'}
          >
            {hraje ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => api.current?.stop()}
            disabled={!stopy.length}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
            title="Zastavit a na začátek"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>

          {/* Poloha ve skladbě. Klikni kamkoli a hraje se odtamtud. */}
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <span className="text-[11px] font-mono text-neutral-400 tabular-nums shrink-0">
              {formatCas(kde)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(1, delka)}
              step={0.1}
              value={Math.min(kde, delka || 1)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setKde(v);
                if (api.current) api.current.timePosition = v * 1000;
              }}
              disabled={!delka}
              className="flex-1 accent-[#FF9F0A] cursor-pointer disabled:opacity-40"
            />
            <span className="text-[11px] font-mono text-neutral-600 tabular-nums shrink-0">
              {formatCas(delka)}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-0.5">
            {RYCHLOSTI.map((r) => (
              <button
                key={r}
                onClick={() => setRychlost(r)}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono cursor-pointer ${
                  rychlost === r ? 'bg-[#FF9F0A] text-black font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {r}×
              </button>
            ))}
          </div>

          <button
            onClick={() => setSmycka((s) => !s)}
            className={`px-3 h-9 rounded-xl text-[11px] font-bold cursor-pointer flex items-center gap-1.5 ${
              smycka ? 'bg-[#FF9F0A] text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" /> Smyčka
          </button>
          <button
            onClick={() => setSamoPosouvat((p) => !p)}
            title="Plocha se při hraní posouvá za kurzorem"
            className={`px-3 h-9 rounded-xl text-[11px] font-bold cursor-pointer ${
              samoPosouvat ? 'bg-[#FF9F0A] text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10'
            }`}
          >
            Posouvat
          </button>
          <button
            onClick={() => setMetronom((m) => !m)}
            className={`px-3 h-9 rounded-xl text-[11px] font-bold cursor-pointer ${
              metronom ? 'bg-[#FF9F0A] text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10'
            }`}
          >
            Metronom
          </button>
        </div>

        {/* Vykreslení */}
        <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-white/[0.06]">
          {prepinac('Rozvržení', ROZVRZENI, rozvrzeni, setRozvrzeni)}
          {prepinac('Osnova', OSNOVA, osnova, setOsnova)}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Zvětšení</span>
            <input
              type="range"
              min={0.5} max={2} step={0.1}
              value={zvetseni}
              onChange={(e) => setZvetseni(Number(e.target.value))}
              className="w-28 accent-[#FF9F0A] cursor-pointer"
            />
            <span className="text-[11px] font-mono text-neutral-400 tabular-nums w-10">
              {Math.round(zvetseni * 100)} %
            </span>
          </div>
        </div>

        {stopy.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/[0.06]">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-full">
              Stopy ({stopy.length}) — klikni, co vykreslit
            </span>
            <button
              onClick={() => api.current?.renderTracks(stopy)}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-neutral-300 cursor-pointer"
            >
              všechny
            </button>
            {stopy.map((t) => (
              <button
                key={t.index}
                onClick={() => api.current?.renderTracks([t])}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-neutral-300 cursor-pointer max-w-[200px] truncate"
                title={t.name}
              >
                {t.name || `Stopa ${t.index + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Plocha. Bílá schválně: notová sazba je černá na bílé, jako na papíře. */}
      <div
        ref={posuvnaPlocha}
        className="bg-white rounded-3xl overflow-auto border border-white/10"
        style={{ minHeight: 420, maxHeight: '70vh' }}
      >
        <div ref={plocha} />
      </div>
    </div>
  );
};
