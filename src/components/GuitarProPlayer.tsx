import React, { useEffect, useRef, useState } from 'react';
import { useMusicalContext } from '../context/MusicalContext';
import { tonikaZPredznamenani, tonika } from '../services/tonina';
import { usekZDob, VstupniDoba, Usek } from '../services/gpUsek';
import { HmatnikUseku } from './practise/HmatnikUseku';
import * as alphaTab from '@coderline/alphatab';
import { loadTabSoundfont } from '../services/tabSoundfontService';
import { NASTROJE_GM, RODINY_NASTROJU } from '../data/nastrojeGm';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Music,
  Sliders,
  Settings,
  Download,
  Gauge,
  Layers,
  Repeat,
  Sparkles,
  HelpCircle,
  Mic,
 
  Maximize2,
  Minimize2,
  AlertTriangle,
  X,
  Guitar,
} from 'lucide-react';

interface GuitarProPlayerProps {
  dataUrl: string;
  filename: string;
  artist?: string;
  bpm?: number;
}

/**
 * Verze se drží té nainstalované schválně. S `@latest` by si přehrávač
 * tahal notové písmo z jiného vydání, než na které je zbytek zkompilovaný,
 * a rozbila by ho cizí aktualizace.
 */
const ALPHATAB_VERSION = '1.8.4';
const FONT_DIRECTORY = `https://cdn.jsdelivr.net/npm/@coderline/alphatab@${ALPHATAB_VERSION}/dist/font/`;
const FALLBACK_SOUNDFONT = `https://cdn.jsdelivr.net/npm/@coderline/alphatab@${ALPHATAB_VERSION}/dist/soundfont/sonivox.sf3`;

/**
 * Tabulatura může přijít dvěma cestami: jako base64 z právě nahraného
 * souboru, nebo jako odkaz do Storage u tabů, které už jsou ve zpěvníku.
 * Dřív se počítalo jen s base64, takže `atob` nad adresou spadl a taby ze
 * zpěvníku se nezobrazily vůbec.
 */
async function fetchScoreBytes(source: string): Promise<Uint8Array> {
  // Stáhnout se dá i z `blob:` adresy nebo z cesty na náš server. Test jen
  // na `http` je propouštěl do větve pro base64, kde `atob` nad adresou
  // spadl a tab se ohlásil jako poškozený, přestože se v pořádku stáhl.
  if (/^(https?:\/\/|blob:|\/)/i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Soubor se nepodařilo stáhnout z knihovny (HTTP ${res.status}).`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error('Stažený soubor je prázdný (0 bajtů).');
    return bytes;
  }

  let base64 = source;
  if (base64.includes(',')) base64 = base64.split(',')[1];
  base64 = base64.trim().replace(/\s/g, '');
  if (base64.includes('%')) base64 = decodeURIComponent(base64);

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Soubor je poškozený — nepodařilo se ho dekódovat.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length === 0) throw new Error('Nahrávaná tabulatura je prázdná nebo poškozená (0 bajtů).');
  return bytes;
}

/**
 * Lišta pozice, která umí i vybrat smyčku.
 *
 * Kliknutí přeskočí, tažení vybere úsek. Vybraný úsek se v ní zakreslí,
 * takže je vidět, co se opakuje — jinak se člověk kouká na tabulaturu a
 * neví, proč mu to skáče zpátky.
 */
/**
 * Nástroje k výběru na stopu.
 *
 * Zlomek General MIDI, ne celá dvoustovka: v tabulatuře se mění nástroj
 * proto, aby se stopa dala odlišit nebo si ji člověk zkusil jinak
 * znějící, ne aby procházel seznam varhan.
 */

const ListaPozice: React.FC<{
  cas: number;
  delka: number;
  usek: { od: number; do: number } | null;
  celkemTiku: number;
  onSkok: (cas: number) => void;
  onVyber: (od: number, do_: number) => void;
}> = ({ cas, delka, usek, celkemTiku, onSkok, onVyber }) => {
  const pruh = useRef<HTMLDivElement>(null);
  const [tahne, setTahne] = useState<{ od: number; do: number } | null>(null);

  const casZUdalosti = (e: React.MouseEvent): number => {
    const el = pruh.current;
    if (!el || !delka) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * delka;
  };

  const podil = delka ? Math.min(1, cas / delka) : 0;
  // Úsek je v ticích, lišta v čase — přepočet je úměrou, na zákres stačí.
  const usekOd = usek && celkemTiku ? usek.od / celkemTiku : null;
  const usekDo = usek && celkemTiku ? usek.do / celkemTiku : null;

  const vyber = tahne
    ? { od: Math.min(tahne.od, tahne.do) / delka, do: Math.max(tahne.od, tahne.do) / delka }
    : null;

  return (
    <div
      ref={pruh}
      onMouseDown={(e) => {
        const t = casZUdalosti(e);
        setTahne({ od: t, do: t });
      }}
      onMouseMove={(e) => {
        if (tahne) setTahne({ ...tahne, do: casZUdalosti(e) });
      }}
      onMouseUp={(e) => {
        if (!tahne) return;
        const t = casZUdalosti(e);
        // Krátké tažení je kliknutí; delší je výběr úseku.
        if (Math.abs(t - tahne.od) < 0.3) onSkok(t);
        else onVyber(tahne.od, t);
        setTahne(null);
      }}
      onMouseLeave={() => setTahne(null)}
      className="relative w-full h-5 flex items-center cursor-pointer select-none group"
      title="Klikni pro přeskočení, táhni pro výběr úseku do smyčky"
    >
      <div className="absolute inset-x-0 h-2 bg-white/10 rounded-lg overflow-hidden">
        {usekOd !== null && usekDo !== null && (
          <div
            className="absolute inset-y-0 bg-[#30D158]/30 border-x border-[#30D158]"
            style={{ left: `${usekOd * 100}%`, width: `${(usekDo - usekOd) * 100}%` }}
          />
        )}
        {vyber && (
          <div
            className="absolute inset-y-0 bg-[#30D158]/40"
            style={{ left: `${vyber.od * 100}%`, width: `${(vyber.do - vyber.od) * 100}%` }}
          />
        )}
        <div className="absolute inset-y-0 left-0 bg-[#FF9F0A]/70" style={{ width: `${podil * 100}%` }} />
      </div>

      <div
        className="absolute w-3 h-3 -ml-1.5 rounded-full bg-[#FF9F0A] shadow ring-2 ring-black/40 pointer-events-none"
        style={{ left: `${podil * 100}%` }}
      />
    </div>
  );
};

export const GuitarProPlayer: React.FC<GuitarProPlayerProps> = ({
  dataUrl,
  filename,
  artist,
  bpm: initialBpm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  /**
   * Kytarista čte tabulaturu, ne noty.
   *
   * Výchozí „noty + tab" znamená, že polovinu výšky zabírá osnova, na
   * kterou se nikdo nedívá, a tabulatura se kvůli ní musí rolovat.
   */
  const [staveProfile, setStaveProfile] = useState<'default' | 'tab' | 'score'>('tab');
  const [isLooping, setIsLooping] = useState(false);
  const [isMetronome, setIsMetronome] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Maximization state
  const [isMaximized, setIsMaximized] = useState(false);

  // Time & Position State
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  /** Tiky ke konci skladby — kvůli zákresu smyčky do lišty. */
  const [totalTicks, setTotalTicks] = useState(0);
  /** Vybraný úsek ve smyčce, v ticích. */
  const [usek, setUsek] = useState<{ od: number; do: number } | null>(null);
  /**
   * Doby aktivní stopy i se strunami a pražci.
   *
   * Drží se ve stavu, ne že by se počítaly při každém vykreslení:
   * partitura má tisíce not a procházet ji kvůli každému překreslení
   * hmatníku by bylo znát.
   */
  const [dobyStopy, setDobyStopy] = useState<VstupniDoba[]>([]);
  /**
   * Posun ladění v půltónech.
   *
   * Mění se výška přehrávání, ne zápis — kdo má kytaru o půltón níž,
   * chce slyšet svoje ladění, ale hmaty na hmatníku zůstávají tam, kde
   * jsou napsané.
   */
  const [posunLadeni, setPosunLadeni] = useState(0);
  /** Nástroj po stopách; klíčem je index stopy, hodnotou GM program. */
  const [nastroje, setNastroje] = useState<Record<number, number>>({});
  const [songBpm, setSongBpm] = useState(initialBpm || 120);

  // Track info
  const [tracks, setTracks] = useState<alphaTab.model.Track[]>([]);
  /**
   * Hlasitost celku a jednotlivých stop.
   *
   * Mute a solo tu byly, ale hlasitost ne — a při cvičení je potřeba
   * něco stáhnout, ne umlčet: bicí potichu drží tempo, kdežto umlčené
   * nechají člověka bez opory.
   */
  const [hlasitostCelku, setHlasitostCelku] = useState(1);
  const [hlasitostiStop, setHlasitostiStop] = useState<Record<number, number>>({});
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(0);
  const [trackMutes, setTrackMutes] = useState<{ [index: number]: boolean }>({});
  const [trackSolos, setTrackSolos] = useState<{ [index: number]: boolean }>({});

  /**
   * Které takty která stopa hraje.
   *
   * Klíč je pořadí stopy, hodnota pole podle taktů — `false` znamená,
   * že v tom taktu stopa mlčí. AlphaTab tohle sám neumí: zná umlčení
   * celé stopy, ne po taktech. Přepíná se proto za běhu, jak se
   * přehrávač posouvá přes hranice taktů.
   */
  const [taktyStop, setTaktyStop] = useState<Record<number, boolean[]>>({});
  const [pocetTaktu, setPocetTaktu] = useState(0);
  /** Začátky taktů v tikách — podle nich se pozná, ve kterém taktu jsme. */
  const zacatkyTaktu = useRef<number[]>([]);
  const taktRef = useRef(-1);
  /** Aktuální podoba mřížky pro obsluhu pozice, která se nepřemontovává. */
  const taktyRef = useRef<Record<number, boolean[]>>({});
  taktyRef.current = taktyStop;
  const [aktualniTakt, setAktualniTakt] = useState(0);

  /** Tónina a stupnice vyčtené z tabulatury. */
  const [tonina, setTonina] = useState<{ nazev: string; durMoll: 'dur' | 'moll' } | null>(null);
  const [toninaPredana, setToninaPredana] = useState(false);
  // Tónina se nástrojům nepodstrkuje sama: kdo cvičí v jiné, nechce ji
  // po každém otevření tabulatury přepsat.
  const { setKey } = useMusicalContext();

  /**
   * Vytáhne z partitury doby aktivní stopy.
   *
   * Struna a pražec jsou v Guitar Pro souboru zapsané u každé noty —
   * proto se cvičí z něj a ne z not, kde ta informace není.
   */
  useEffect(() => {
    const api = apiRef.current;
    const stopa = api?.score?.tracks?.find((t: any) => t.index === activeTrackIndex);
    if (!stopa) { setDobyStopy([]); return; }

    /**
     * `playbackStart` je pozice uvnitř taktu, ne od začátku skladby.
     *
     * Naměřeno: napříč 719 dobami mělo jen šest různých hodnot, protože
     * se v každém taktu počítá znovu od nuly. Absolutní pozice se proto
     * skládá ze začátku taktu — tentýž údaj, podle kterého se v mřížce
     * pozná, který takt zrovna hraje.
     */
    const takty = api?.score?.masterBars || [];

    const doby: VstupniDoba[] = [];
    for (const osnova of stopa.staves || []) {
      for (const takt of osnova.bars || []) {
        const zacatekTaktu = takty[takt.index]?.start ?? 0;
        for (const hlas of takt.voices || []) {
          for (const doba of hlas.beats || []) {
            const noty = (doba.notes || [])
              // Notu bez struny zapsal editor jako notový zápis, ne hmat.
              .filter((n: any) => n.string > 0)
              .map((n: any) => ({
                struna: n.string,
                prazec: n.fret,
                midi: n.realValue ?? 0,
              }));
            if (noty.length) {
              doby.push({
                start: zacatekTaktu + doba.playbackStart,
                delka: doba.playbackDuration,
                noty,
              });
            }
          }
        }
      }
    }
    setDobyStopy(doby);
  }, [activeTrackIndex, dataUrl, isLoading]);

  /** Vybraný úsek přepočítaný na cvičení. */
  const usekKeCviceni: Usek | null = usek && dobyStopy.length
    ? usekZDob(dobyStopy, usek.od, usek.do)
    : null;

  // Handle Play/Pause
  const handlePlayPause = () => {
    if (!apiRef.current) return;
    apiRef.current.playPause();
  };

  // Handle Stop
  const handleStop = () => {
    if (!apiRef.current) return;
    apiRef.current.stop();
  };

  // Handle Speed Change
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (apiRef.current) {
      apiRef.current.playbackSpeed = speed;
    }
  };

  // Handle Zoom Change
  const handleZoomChange = (delta: number) => {
    const newZoom = Math.max(0.6, Math.min(2.0, zoomScale + delta));
    setZoomScale(newZoom);
    if (apiRef.current) {
      apiRef.current.settings.display.scale = newZoom;
      apiRef.current.updateSettings();
    }
  };

  // Handle Stave Profile Change (Score + Tab / Tab Only / Score Only)
  const handleStaveProfileChange = (profile: 'default' | 'tab' | 'score') => {
    setStaveProfile(profile);
    if (!apiRef.current) return;

    if (profile === 'tab') {
      apiRef.current.settings.display.staveProfile = alphaTab.StaveProfile.Tab;
    } else if (profile === 'score') {
      apiRef.current.settings.display.staveProfile = alphaTab.StaveProfile.Score;
    } else {
      apiRef.current.settings.display.staveProfile = alphaTab.StaveProfile.Default;
    }
    apiRef.current.updateSettings();
    // Bez tohohle se nic nestalo: `updateSettings` novou hodnotu jen uloží,
    // překreslit osnovu musí `render()`. Tlačítka se přepínala a partitura
    // zůstávala, jak byla.
    apiRef.current.render();
  };

  /**
   * Přeladí přehrávání, zápis nechá být.
   *
   * `changeTrackTranspositionPitch` posouvá jen to, co zní. Kdyby se
   * použilo nastavení transpozice, přepočítala by se i tabulatura a čísla
   * pražců by se rozešla s tím, co má člověk pod prsty.
   */
  const zmenLadeni = (poltonu: number) => {
    const v = Math.max(-12, Math.min(12, poltonu));
    setPosunLadeni(v);
    const api = apiRef.current;
    if (api?.score) api.changeTrackTranspositionPitch(api.score.tracks, v);
  };

  /**
   * Vymění nástroj stopy.
   *
   * Program se zapíše do modelu a MIDI se z partitury vygeneruje znovu —
   * banka podle něj sáhne po jiném zvuku. Jen přepsat číslo nestačí,
   * hrálo by se dál to staré.
   */
  const zmenNastroj = (track: alphaTab.model.Track, program: number) => {
    const api = apiRef.current;
    if (!api) return;
    track.playbackInfo.program = program;
    setNastroje((p) => ({ ...p, [track.index]: program }));
    api.loadMidiForScore();
  };

  /** Zruší vybraný úsek a vrátí přehrávání na celou skladbu. */
  const zrusUsek = () => {
    setUsek(null);
    if (apiRef.current) apiRef.current.playbackRange = null;
  };

  // Handle Loop Toggle
  const handleToggleLoop = () => {
    const next = !isLooping;
    setIsLooping(next);
    if (apiRef.current) {
      apiRef.current.isLooping = next;
    }
  };

  // Handle Metronome Toggle
  const handleToggleMetronome = () => {
    const next = !isMetronome;
    setIsMetronome(next);
    if (apiRef.current) {
      apiRef.current.metronomeVolume = next ? 1 : 0;
    }
  };

  // Handle Active Track Selection (renders selected track in tab canvas)
  const handleSelectTrack = (track: alphaTab.model.Track) => {
    setActiveTrackIndex(track.index);
    if (apiRef.current) {
      apiRef.current.renderTracks([track]);
    }
  };

  /** Hlasitost celého přehrávače. */
  const zmenHlasitostCelku = (v: number) => {
    setHlasitostCelku(v);
    if (apiRef.current) apiRef.current.masterVolume = v;
  };

  /** Hlasitost jedné stopy. AlphaTab bere rozsah 0 až 1. */
  const zmenHlasitostStopy = (track: alphaTab.model.Track, v: number) => {
    setHlasitostiStop((p) => ({ ...p, [track.index]: v }));
    apiRef.current?.changeTrackVolume([track], v);
  };

  // Handle Mute Toggle for Track
  const handleToggleMuteTrack = (track: alphaTab.model.Track) => {
    if (!apiRef.current) return;
    const isMuted = !trackMutes[track.index];
    setTrackMutes((prev) => ({ ...prev, [track.index]: isMuted }));
    apiRef.current.changeTrackMute([track], isMuted);
  };

  // Handle Solo Toggle for Track
  const handleToggleSoloTrack = (track: alphaTab.model.Track) => {
    if (!apiRef.current) return;
    const isSolo = !trackSolos[track.index];
    setTrackSolos((prev) => ({ ...prev, [track.index]: isSolo }));
    apiRef.current.changeTrackSolo([track], isSolo);
  };

  // Handle Manual Seeking via Slider
  const handleSeek = (timeInSeconds: number) => {
    setCurrentTime(timeInSeconds);
    if (apiRef.current) {
      apiRef.current.timePosition = timeInSeconds * 1000;
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    setIsLoading(true);
    setLoadError(null);

    // CRITICAL: Clear out previous container contents before initializing.
    // This resolves the double-mounting blank screen / silent fail in React 18 & 19
    containerRef.current.innerHTML = '';

    let cancelled = false;

    try {
      // Settings setup
      const settings = new alphaTab.Settings();
      settings.core.fontDirectory = FONT_DIRECTORY;
      settings.player.enablePlayer = true;
      // Tabulatura sama, bez notové osnovy — viz `staveProfile` výš.
      settings.display.staveProfile = alphaTab.StaveProfile.Tab;
      // Vestavěná banka je záchranná síť: nastaví se rovnou, aby tabulatura
      // hrála i kdyby se ta pořádná nestáhla, a přepíše se, jakmile dorazí.
      settings.player.soundFont = FALLBACK_SOUNDFONT;

      const api = new alphaTab.AlphaTabApi(containerRef.current, settings);
      apiRef.current = api;

      // Zvuková banka se nasazuje AŽ po dokončeném vykreslení.
      //
      // Nasazení banky doprostřed vykreslování ho shodí: partitura se
      // rozparsuje, stopy se vypíšou, ale plocha zůstane prázdná — uživatel
      // vidí bílé pole a nikde žádná chyba. Poprvé to projde, protože se
      // 38 MB stahuje déle než trvá vykreslení; podruhé je banka v paměti
      // prohlížeče, nasadí se okamžitě a tab se přestane zobrazovat.
      let vykresleno = false;
      let cekajiciBanka: Uint8Array | null = null;

      const nasadBanku = () => {
        if (!vykresleno || !cekajiciBanka || cancelled || !apiRef.current) return;
        const bytes = cekajiciBanka;
        cekajiciBanka = null;
        apiRef.current.loadSoundFont(bytes, false);
      };

      loadTabSoundfont()
        .then((bytes) => {
          if (cancelled || !bytes) return;
          cekajiciBanka = bytes;
          nasadBanku();
        })
        .catch(() => {
          /* hraje se dál na vestavěnou banku */
        });

      // Event listeners
      api.scoreLoaded.on((score) => {
        setIsLoading(false);
        if (score.tracks && score.tracks.length > 0) {
          setTracks(score.tracks);
          setActiveTrackIndex(score.tracks[0].index);
          // Nová skladba = nové stopy; staré hlasitosti by patřily jinam.
          setHlasitostiStop(
            Object.fromEntries(score.tracks.map((t) => [t.index, 1])),
          );
        }
        if (score.tempo > 0) {
          setSongBpm(score.tempo);
        }
        setNastroje(
          Object.fromEntries(
            (score.tracks || []).map((t) => [t.index, t.playbackInfo?.program ?? 0]),
          ),
        );
        // Nová skladba hraje ve svém ladění, ne v tom po předchozí.
        setPosunLadeni(0);
        setUsek(null);

        /**
         * Mřížka taktů a tónina.
         *
         * Takty se berou z `masterBars`, které jsou společné všem stopám
         * — počet i hranice tedy sedí napříč partiturou. Na začátku hraje
         * všechno; odškrtává se, co hrát nemá.
         */
        const takty = score.masterBars || [];
        zacatkyTaktu.current = takty.map((t) => t.start);
        setPocetTaktu(takty.length);
        setTaktyStop(
          Object.fromEntries(
            (score.tracks || []).map((t) => [t.index, new Array(takty.length).fill(true)]),
          ),
        );
        taktRef.current = -1;
        setAktualniTakt(0);
        setToninaPredana(false);

        /**
         * Tónina stojí v předznamenání prvního taktu.
         *
         * `keySignature` je počet křížků (kladně) nebo béček (záporně),
         * `keySignatureType` říká dur nebo moll. Bere se první takt:
         * modulace uvnitř skladby se tím minou, ale pro nastavení
         * nástrojů je rozhodující, v čem to začíná.
         */
        const prvni = takty[0];
        if (prvni) {
          const moll = String(prvni.keySignatureType ?? '').toLowerCase().includes('minor')
            || Number(prvni.keySignatureType) === 1;
          setTonina({ nazev: tonikaZPredznamenani(Number(prvni.keySignature) || 0, moll), durMoll: moll ? 'moll' : 'dur' });
        } else {
          setTonina(null);
        }
      });

      api.error.on((err) => {
        console.error('alphaTab load/render error:', err);
        setLoadError('Chyba při parsování tabulatury: ' + (err.message || String(err)));
        setIsLoading(false);
      });

      api.renderFinished.on(() => {
        setIsLoading(false);
        vykresleno = true;
        nasadBanku();
      });

      api.playerStateChanged.on((args) => {
        setIsPlaying(args.state === alphaTab.synth.PlayerState.Playing);
      });

      api.playerPositionChanged.on((args) => {
        setCurrentTime(args.currentTime / 1000);
        setTotalTime(args.endTime / 1000);
        setTotalTicks(args.endTick);

        /**
         * Umlčení podle taktu.
         *
         * Přepíná se jen na hranici taktu, ne při každém hlášení pozice —
         * to chodí desetkrát za vteřinu a přenastavovat kvůli tomu
         * hlasitosti by bylo slyšet.
         */
        const zacatky = zacatkyTaktu.current;
        if (!zacatky.length) return;
        let takt = 0;
        for (let i = zacatky.length - 1; i >= 0; i -= 1) {
          if (args.currentTick >= zacatky[i]) { takt = i; break; }
        }
        if (takt === taktRef.current) return;
        taktRef.current = takt;
        setAktualniTakt(takt);

        const mrizka = taktyRef.current;
        for (const stopa of api.score?.tracks || []) {
          const radek = mrizka[stopa.index];
          if (!radek) continue;
          api.changeTrackMute([stopa], radek[takt] === false);
        }
      });

      /**
       * Úsek se vybírá tažením myši přímo v tabulatuře.
       *
       * Umí to alphaTab sám, jen o tom nikdo nevěděl: výběr nastavil
       * rozsah přehrávání, ale nikde to nebylo vidět a smyčka zůstala
       * vypnutá, takže to vypadalo, že se neděje nic. Teď se výběr ukáže
       * v liště a smyčka se k němu rovnou zapne — kvůli tomu se úsek
       * vybírá.
       */
      api.playbackRangeChanged.on((args) => {
        const r = args.playbackRange;
        if (!r) {
          setUsek(null);
          return;
        }
        setUsek({ od: r.startTick, do: r.endTick });
        setIsLooping(true);
        api.isLooping = true;
      });

      // Tabulatura se načítá asynchronně — ze zpěvníku se musí nejdřív
      // stáhnout ze Storage, u nahraného souboru jde jen o dekódování.
      fetchScoreBytes(dataUrl)
        .then((bytes) => {
          if (cancelled) return;
          api.load(bytes);
        })
        .catch((err: any) => {
          if (cancelled) return;
          console.error('Failed to load Guitar Pro file:', err);
          setLoadError(err?.message || String(err));
          setIsLoading(false);
        });

      return () => {
        cancelled = true;
        try {
          api.destroy();
        } catch (e) {
          // ignore destroy errors
        }
        apiRef.current = null;
      };
    } catch (err: any) {
      console.error('Failed to initialize alphaTab player:', err);
      setLoadError(err?.message || String(err));
      setIsLoading(false);
    }
  }, [dataUrl]);


  /**
   * Přichytí tik na začátek nejbližší doby.
   *
   * Lišta zná čas, ne noty, a rozsah tažený myší by jinak začínal
   * uprostřed tónu. `tickCache` ví, kde doby jsou, takže se smyčka
   * chytne tam, kde se dá naskočit.
   */
  const naDobu = (tick: number): number => {
    const api = apiRef.current;
    const cache = api?.tickCache;
    if (!api?.score || !cache) return Math.max(0, Math.round(tick));
    const stopy = new Set(api.score.tracks.map((t) => t.index));
    const nalez = cache.findBeat(stopy, Math.max(0, Math.round(tick)));
    return nalez ? nalez.start : Math.max(0, Math.round(tick));
  };

  /**
   * Vybere úsek tažením po liště.
   *
   * Tiky se z času odhadují úměrou, protože lišta měří čas a smyčka se
   * zadává v ticích. U skladby, která mění tempo, by odhad ujel — proto
   * se výsledek ještě přichytí na nejbližší dobu.
   */
  const vyberUsekZListy = (odCas: number, doCas: number) => {
    const api = apiRef.current;
    if (!api || !totalTime || !totalTicks) return;
    const [a, b] = odCas <= doCas ? [odCas, doCas] : [doCas, odCas];
    // Kratší výběr než doba je omyl při klikání, ne úmysl.
    if (b - a < 0.3) return;
    const od = naDobu((a / totalTime) * totalTicks);
    const doTick = naDobu((b / totalTime) * totalTicks);
    if (doTick <= od) return;
    api.playbackRange = { startTick: od, endTick: doTick } as alphaTab.synth.PlaybackRange;
    setUsek({ od, do: doTick });
    setIsLooping(true);
    api.isLooping = true;
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const renderContent = () => {
    return (
      <div className={`font-sans text-white space-y-4 bg-[#16161A]/90 backdrop-blur-2xl p-5 border border-white/[0.1] rounded-3xl shadow-2xl ${isMaximized ? 'shadow-[#FF9F0A]/10' : ''}`}>
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-xl">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Guitar Pro Tablatura &amp; Přehrávač
                {isMaximized && (
                  <span className="bg-[#30D158] text-black px-2 py-0.5 text-[9px] font-bold uppercase rounded-md">
                    Maximalizováno
                  </span>
                )}
              </h3>
              <p className="text-xs text-neutral-400">
                {filename} {artist && `• ${artist}`} • <span className="text-[#FF9F0A] font-semibold">{Math.round(songBpm * playbackSpeed)} BPM</span>
                {tonina && (
                  <>
                    {' • '}
                    <span className="text-[#BF5AF2] font-semibold">
                      {tonina.nazev} {tonina.durMoll}
                    </span>
                    <button
                      onClick={() => {
                        // Do kontextu jde jen tónika; „moll" nese stupnice,
                        // kterou si nástroje odvodí samy.
                        setKey(tonika(tonina.nazev));
                        setToninaPredana(true);
                      }}
                      className="ml-1.5 text-[10px] font-bold text-[#BF5AF2] hover:text-white underline underline-offset-2 cursor-pointer"
                      title="Nastavit podle toho virtuální nástroje a hmatník"
                    >
                      {toninaPredana ? 'nastaveno' : 'nastavit nástroje'}
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Maximize Toggle Button */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 hover:text-white border border-white/10 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              title={isMaximized ? "Minimalizovat zpět do panelu" : "Maximalizovat taby na celou obrazovku"}
            >
              {isMaximized ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Zmenšit</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Na celou obrazovku</span>
                </>
              )}
            </button>

            {/* Download GP button */}
            <a
              href={dataUrl}
              download={filename}
              className="px-3 py-1.5 bg-[#FF9F0A]/10 hover:bg-[#FF9F0A] text-[#FF9F0A] hover:text-black border border-[#FF9F0A]/30 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> <span>Stáhnout .GP</span>
            </a>
          </div>
        </div>



        {/* Main Interactive Controls Toolbar */}
        <div className="bg-black/40 border border-white/5 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Playback Transport Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              className={`px-4 py-2 font-bold flex items-center gap-1.5 text-xs rounded-xl transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-[#FF453A] text-white shadow-lg shadow-red-500/30 hover:bg-red-600'
                  : 'bg-[#FF9F0A] hover:bg-[#ffb038] text-black shadow-lg shadow-amber-500/20'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-current" /> Pauza
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Přehrát
                </>
              )}
            </button>

            <button
              onClick={handleStop}
              className="p-2 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 rounded-xl transition-all cursor-pointer"
              title="Stop / Zpět na začátek"
            >
              <Square className="w-4 h-4" />
            </button>

            {/* Time Display */}
            <div className="bg-black/60 px-3 py-1.5 rounded-xl border border-white/10 font-mono text-xs font-semibold text-[#30D158]">
              {formatTime(currentTime)} / {formatTime(totalTime)}
            </div>
          </div>

          {/*
            Lišta pozice, která zároveň vybírá smyčku.
            Kliknutí přeskočí, tažení vybere úsek. Posuvník z prohlížeče
            tohle neumí — proto vlastní pruh.
          */}
          <div className="flex-1 min-w-[200px] flex items-center gap-2 px-2">
            <span className="text-[11px] text-neutral-400 font-semibold uppercase whitespace-nowrap">
              Pozice:
            </span>
            <ListaPozice
              cas={currentTime}
              delka={totalTime}
              usek={usek}
              celkemTiku={totalTicks}
              onSkok={handleSeek}
              onVyber={vyberUsekZListy}
            />
          </div>

          {/* Speed / Tempo Controls */}
          <div className="flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-[#FF9F0A] mr-1" />
            <span className="text-[11px] text-neutral-400 uppercase mr-1">Rychlost:</span>
            {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  playbackSpeed === speed
                    ? 'bg-[#FF9F0A] text-black border-[#FF9F0A] font-bold'
                    : 'bg-white/5 border-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {speed * 100}%
              </button>
            ))}
          </div>

          {/* Looping & Metronome */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToggleLoop}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 border transition-all cursor-pointer ${
                isLooping
                  ? 'bg-[#30D158] text-black border-[#30D158] font-bold'
                  : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
              }`}
              title="Smyčka přehrávání"
            >
              <Repeat className="w-3.5 h-3.5" /> Smyčka
            </button>

            {usek && (
              <button
                onClick={zrusUsek}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-[#30D158]/40 bg-[#30D158]/10 text-[#30D158] cursor-pointer flex items-center gap-1.5"
                title="Zrušit vybraný úsek a hrát celou skladbu"
              >
                úsek {formatTime((usek.od / (totalTicks || 1)) * totalTime)}–
                {formatTime((usek.do / (totalTicks || 1)) * totalTime)}
                <X className="w-3 h-3" />
              </button>
            )}

            {/*
              Přeladění. Mění se jen to, co zní — čísla na tabulatuře
              zůstávají, protože prsty se nikam nestěhují.
            */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5">
              <Guitar className="w-3.5 h-3.5 text-[#BF5AF2] mx-1.5" />
              <button
                onClick={() => zmenLadeni(posunLadeni - 1)}
                className="px-1.5 py-1 text-xs text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                title="O půltón níž"
              >
                −
              </button>
              <span
                className={`text-[11px] font-bold tabular-nums w-9 text-center ${
                  posunLadeni ? 'text-[#BF5AF2]' : 'text-neutral-500'
                }`}
                title="Posun ladění v půltónech; zápis se nemění"
              >
                {posunLadeni > 0 ? `+${posunLadeni}` : posunLadeni}
              </span>
              <button
                onClick={() => zmenLadeni(posunLadeni + 1)}
                className="px-1.5 py-1 text-xs text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                title="O půltón výš"
              >
                +
              </button>
              {posunLadeni !== 0 && (
                <button
                  onClick={() => zmenLadeni(0)}
                  className="px-1.5 py-1 text-[10px] text-neutral-500 hover:text-white cursor-pointer"
                  title="Zpět na původní ladění"
                >
                  ↺
                </button>
              )}
            </div>

            <button
              onClick={handleToggleMetronome}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 border transition-all cursor-pointer ${
                isMetronome
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF] font-bold'
                  : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
              }`}
              title="Metronom doprovod"
            >
              <Sparkles className="w-3.5 h-3.5" /> Metronom
            </button>
          </div>

          {/* Display Profile & Zoom */}
          <div className="flex items-center gap-2">
            <div className="flex bg-black/40 border border-white/10 rounded-xl p-0.5">
              <button
                onClick={() => handleStaveProfileChange('default')}
                className={`px-2 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                  staveProfile === 'default' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                }`}
                title="Noty + Tabulatura"
              >
                Noty+Tab
              </button>
              <button
                onClick={() => handleStaveProfileChange('tab')}
                className={`px-2 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                  staveProfile === 'tab' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                }`}
                title="Pouze Tabulatura"
              >
                Jen tab
              </button>
              <button
                onClick={() => handleStaveProfileChange('score')}
                className={`px-2 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                  staveProfile === 'score' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                }`}
                title="Pouze Noty"
              >
                Jen noty
              </button>
            </div>

            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5">
              <button
                onClick={() => handleZoomChange(-0.1)}
                className="p-1.5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition-all cursor-pointer"
                title="Zmenšit"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs px-1.5 font-semibold text-[#FF9F0A]">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={() => handleZoomChange(0.1)}
                className="p-1.5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition-all cursor-pointer"
                title="Zvětšit"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Track Mixer / Multi-Track Selector Bar */}
        {tracks.length > 0 && (
          <div className="bg-black/30 border border-white/5 p-3 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-[#FF9F0A]" />
                Stopy a míchání nástrojů ({tracks.length}):
              </span>
              <span className="text-[11px] text-neutral-400">
                Klikněte na stopu pro zobrazení
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-0.5">
              {tracks.map((track) => {
                const isActive = track.index === activeTrackIndex;
                const isMuted = !!trackMutes[track.index];
                const isSolo = !!trackSolos[track.index];

                return (
                  <div
                    key={track.index}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-[#FF9F0A]/15 border-[#FF9F0A]/50 text-white shadow-sm'
                        : 'bg-black/40 border-white/5 text-neutral-300 hover:border-white/20'
                    }`}
                  >
                    <button
                      onClick={() => handleSelectTrack(track)}
                      className="font-semibold text-xs hover:text-[#FF9F0A] text-left cursor-pointer"
                    >
                      🎸 {track.name || `Stopa ${track.index + 1}`}
                    </button>

                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() => handleToggleMuteTrack(track)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase cursor-pointer transition-all ${
                          isMuted ? 'bg-[#FF453A] text-white' : 'bg-white/10 text-neutral-400 hover:text-white'
                        }`}
                        title="Mute (Ztišit)"
                      >
                        M
                      </button>
                      <button
                        onClick={() => handleToggleSoloTrack(track)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase cursor-pointer transition-all ${
                          isSolo ? 'bg-[#30D158] text-black' : 'bg-white/10 text-neutral-400 hover:text-white'
                        }`}
                        title="Solo (Sólo)"
                      >
                        S
                      </button>
                    </div>

                    {/* Hlasitost stopy. Umlčená stopa posuvník nepotřebuje —
                        a šedý posuvník rovnou říká, že se s ním nedá hnout. */}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((hlasitostiStop[track.index] ?? 1) * 100)}
                      onChange={(e) => zmenHlasitostStopy(track, Number(e.target.value) / 100)}
                      disabled={isMuted}
                      className="w-20 accent-[#FF9F0A] cursor-pointer disabled:opacity-30"
                      title={`Hlasitost ${Math.round((hlasitostiStop[track.index] ?? 1) * 100)} %`}
                    />

                    {/* Nástroj stopy. Co je v souboru napsané jako čistá
                        kytara, si člověk může poslechnout zkreslené — a
                        hlavně tím od sebe odliší dvě stejně znějící stopy. */}
                    <select
                      value={nastroje[track.index] ?? track.playbackInfo?.program ?? 0}
                      onChange={(e) => zmenNastroj(track, Number(e.target.value))}
                      className="bg-black/40 border border-white/10 rounded-lg px-1.5 py-1 text-[10px] text-neutral-200 outline-none focus:border-[#FF9F0A] max-w-[130px] cursor-pointer"
                      title="Zvuk stopy"
                    >
                      {!NASTROJE_GM.some((n) => n.program === (nastroje[track.index] ?? track.playbackInfo?.program)) && (
                        <option value={nastroje[track.index] ?? track.playbackInfo?.program ?? 0}>
                          ze souboru ({nastroje[track.index] ?? track.playbackInfo?.program ?? 0})
                        </option>
                      )}
                      {/* Po rodinách: mezi sto dvaceti osmi položkami
                          v jednom sloupci se hledat nedá. */}
                      {RODINY_NASTROJU.map((r) => (
                        <optgroup key={r.nazev} label={r.nazev}>
                          {r.nastroje.map((n) => (
                            <option key={n.program} value={n.program}>{n.nazev}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Hlasitost celku */}
            <div className="flex items-center gap-2 pt-2 mt-2 border-t border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Celková hlasitost</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(hlasitostCelku * 100)}
                onChange={(e) => zmenHlasitostCelku(Number(e.target.value) / 100)}
                className="flex-1 max-w-[220px] accent-[#FF9F0A] cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-[#FF9F0A] tabular-nums w-10">
                {Math.round(hlasitostCelku * 100)} %
              </span>
            </div>
          </div>
        )}

        {/**
         * Mřížka taktů.
         *
         * Jeden řádek na stopu, jedna kostička na takt. Odškrtnutý takt
         * stopa přeskočí — hodí se, když se má sloka hrát jen s kytarou
         * a refrén s celou kapelou, aniž by se kvůli tomu skladba dělila.
         * Číslo taktu je v kostičce, takže je vidět, co se zrovna vypíná.
         */}
        {pocetTaktu > 0 && tracks.length > 0 && (
          <div className="bg-[#16161A]/70 border border-white/[0.08] rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Takty ({pocetTaktu}) — odškrtni, co hrát nemá
              </span>
              <button
                onClick={() =>
                  setTaktyStop(
                    Object.fromEntries(tracks.map((t) => [t.index, new Array(pocetTaktu).fill(true)])),
                  )
                }
                className="text-[10px] font-semibold text-neutral-400 hover:text-white cursor-pointer"
              >
                všechno zpět
              </button>
            </div>

            <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
              {tracks.map((track) => {
                const radek = taktyStop[track.index] || [];
                return (
                  <div key={track.index} className="flex items-center gap-2">
                    <span
                      className="text-[10px] text-neutral-400 truncate w-24 shrink-0"
                      title={track.name}
                    >
                      {track.name || `Stopa ${track.index + 1}`}
                    </span>
                    <div className="flex gap-0.5 overflow-x-auto pb-1">
                      {Array.from({ length: pocetTaktu }, (_, takt) => {
                        const hraje = radek[takt] !== false;
                        const ted = takt === aktualniTakt;
                        return (
                          <button
                            key={takt}
                            onClick={() =>
                              setTaktyStop((p) => {
                                const stary = p[track.index] || new Array(pocetTaktu).fill(true);
                                const novy = [...stary];
                                novy[takt] = !hraje;
                                return { ...p, [track.index]: novy };
                              })
                            }
                            title={`Takt ${takt + 1} — ${hraje ? 'hraje' : 'mlčí'}`}
                            className={`w-6 h-6 shrink-0 rounded text-[9px] font-bold tabular-nums border transition-colors cursor-pointer ${
                              hraje
                                ? 'bg-[#FF9F0A]/25 border-[#FF9F0A]/50 text-[#FF9F0A] hover:bg-[#FF9F0A]/40'
                                : 'bg-white/[0.04] border-white/10 text-neutral-600 hover:bg-white/10'
                            } ${ted ? 'ring-2 ring-[#30D158]' : ''}`}
                          >
                            {takt + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/**
         * Vybraný úsek na hmatníku.
         *
         * Ukáže se až s výběrem: bez něj není co cvičit a prázdný krk
         * by jen zabíral místo nad tabulaturou.
         */}
        {usekKeCviceni && usekKeCviceni.noty.length > 0 && (
          <div className="bg-[#16161A]/70 border border-white/[0.08] rounded-2xl p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              Vybraný úsek na hmatníku
            </div>
            <HmatnikUseku usek={usekKeCviceni} bpm={songBpm} />
          </div>
        )}

        {/* Tab Canvas Area */}
        <div className={`bg-[#FFFFFF] text-black border border-white/10 p-5 overflow-auto relative rounded-2xl shadow-inner ${isMaximized ? 'h-[70vh] min-h-[500px]' : 'min-h-[350px] max-h-[550px]'}`}>
          {isLoading && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2.5 z-20 text-white">
              <Music className="w-8 h-8 text-[#FF9F0A] animate-bounce" />
              <span className="text-xs font-bold text-white tracking-wide">
                Načítám a vykresluji tabulaturu Guitar Pro...
              </span>
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 text-white space-y-3">
              <AlertTriangle className="w-10 h-10 text-[#FF453A] animate-pulse" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#FF453A]">
                  Načítání tabulatury selhalo
                </p>
                <p className="text-xs text-neutral-400 max-w-md">
                  {loadError}
                </p>
              </div>
              <p className="text-xs text-neutral-400 max-w-sm">
                Zkuste soubor nahrát znovu nebo zkontrolujte, zda se jedná o korektní soubor Guitar Pro verze 3, 4, 5 nebo GPX.
              </p>
            </div>
          )}

          {/* AlphaTab Container */}
          <div ref={containerRef} className="alphatab w-full" />
        </div>
      </div>
    );
  };

  if (isMaximized) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[9999] p-6 overflow-y-auto flex flex-col justify-start">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          <div className="flex justify-between items-center bg-[#16161A]/90 border border-white/10 rounded-2xl p-4 shadow-xl">
            <span className="text-xs font-bold text-white tracking-wide flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#30D158]" /> Pódium: Celoobrazovkový režim čtení tabulatur
            </span>
            <button
              onClick={() => setIsMaximized(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Zavřít celou obrazovku ✕
            </button>
          </div>
          {renderContent()}
        </div>
      </div>
    );
  }

  return renderContent();
};
