import React, { useState, useEffect, useRef } from 'react';
import { 
  Music2,
  Upload,
  Repeat,
  Square,
  Sliders, 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Music,   
  Sparkles, 
  Radio, 
  Layers,    
  Download,
  Cpu,
  Wand2,
  Check
} from 'lucide-react';
import { StemSongDocument, SongStem } from '../types';
import { stemAudioService, StemAudioState, ChannelState } from '../services/stemAudioService';
import { authorizedFetch } from '../services/assetLibraryService';
import { StopaVodorovne, SIRKA_OVLADANI } from './mixer/StopaVodorovne';
import { popiskyOsy, cas as casOsy } from '../services/vlnovka';
import { RYCHLOSTI } from '../services/prehravani';
import {
  rozeberStopu, rms, naDb, zastoupeniStop, vyrezZeStredu, stabilitaTempa,
  VTERIN_NA_TONINU, Tonina,
} from '../services/analyzaAudia';
import { odhadniTempoZUseku } from '../services/detekceUderu';
import { rolePodleNazvu } from '../services/roleStop';
import { skladby } from '../services/mnozneCislo';
import { assetLibraryService } from '../services/assetLibraryService';
import { VyberZKnihovny } from './songbook/VyberZKnihovny';
import { songDatabaseService } from '../services/songDatabaseService';
import { idZAdresy } from '../services/youtubeApi';
import { otisky, stabilniNove, OtiskSady } from '../services/sledovaniSlozky';
import { Song } from '../types';

/** Fadery pultu. Zůstávají pořád stejné, jen se na ně věší soubory. */
/** Jedna stopa, jak ji našel server ve složce se separovaným zvukem. */
interface MistniStopa { role: string | null; jmeno: string; cesta: string; velikost: number }
interface MistniSkladba { nazev: string; stopy: MistniStopa[] }
interface MistniOdpoved {
  dostupne: boolean;
  slozka: string;
  duvod?: string;
  skladby: MistniSkladba[];
}

/** Adresa, ze které si engine stáhne soubor ležící na disku. */
const odkazNaMistni = (cesta: string) =>
  `/api/stopy/mistni/soubor?cesta=${encodeURIComponent(cesta)}`;

const ROLE_FADERU: { id: string; popis: string }[] = [
  { id: 'vocals', popis: 'Zpěv' },
  { id: 'guitar', popis: 'Kytara' },
  // Doprovodná a sólová kytara na jednom faderu se nedají ztlumit zvlášť.
  { id: 'lead', popis: 'Sólo kytara' },
  { id: 'bass', popis: 'Basa' },
  { id: 'drums', popis: 'Bicí' },
  // Piano má vlastní tah; jinak by splynulo s Ostatními.
  { id: 'piano', popis: 'Piano' },
  // Klik, podle kterého se hraje, patří na vlastní tah — jinak se ztlumí
  // spolu s něčím jiným zrovna ve chvíli, kdy je nejpotřebnější.
  { id: 'metronome', popis: 'Metronom' },
  { id: 'other', popis: 'Ostatní' },
];

interface StemMixerSectionProps {
  currentUser?: any;
}

const stemColors: Record<string, { accent: string; badge: string; bg: string; border: string; label: string }> = {
  vocals: { accent: '#f43f5e', badge: 'bg-rose-500', bg: 'from-rose-500/10 to-rose-950/20', border: 'border-rose-500/30', label: 'Zpěv' },
  guitar: { accent: '#f59e0b', badge: 'bg-amber-500', bg: 'from-amber-500/15 to-amber-950/20', border: 'border-amber-500/40', label: 'Kytara' },
  lead: { accent: '#fb7185', badge: 'bg-rose-400', bg: 'from-rose-400/15 to-rose-950/20', border: 'border-rose-400/40', label: 'Sólo kytara' },
  bass: { accent: '#10b981', badge: 'bg-emerald-500', bg: 'from-emerald-500/10 to-emerald-950/20', border: 'border-emerald-500/30', label: 'Baskytara' },
  drums: { accent: '#3b82f6', badge: 'bg-blue-500', bg: 'from-blue-500/10 to-blue-950/20', border: 'border-blue-500/30', label: 'Bicí' },
  piano: { accent: '#6366f1', badge: 'bg-indigo-500', bg: 'from-indigo-500/10 to-indigo-950/20', border: 'border-indigo-500/30', label: 'Piano' },
  metronome: { accent: '#94a3b8', badge: 'bg-slate-400', bg: 'from-slate-400/10 to-slate-900/20', border: 'border-slate-400/30', label: 'Metronom' },
  other: { accent: '#a855f7', badge: 'bg-purple-500', bg: 'from-purple-500/10 to-purple-950/20', border: 'border-purple-500/30', label: 'Synth / Ostatní' },
};

export const StemMixerSection: React.FC<StemMixerSectionProps> = ({ currentUser }) => {
  const [audioState, setAudioState] = useState<StemAudioState>(stemAudioService.getState());
  const [loading, setLoading] = useState<boolean>(false);

  /** Na který fader se právě přiřazuje a co na nich visí. */
  const [cilovyFader, setCilovyFader] = useState<string>('vocals');
  /** Ukládání poskládaného mixu jako další skladby. */
  const [nazevMixu, setNazevMixu] = useState('');
  /** Ke které skladbě mix připojit. Prázdné = založit novou. */
  const [cilovaPisen, setCilovaPisen] = useState('');
  const [uklada, setUklada] = useState(false);
  const [hlaska, setHlaska] = useState<string | null>(null);
  /** Na faderu může viset soubor z knihovny (assetId) i z disku (url). */
  const [vlastniStopy, setVlastniStopy] = useState<
    { role: string; nazev: string; assetId?: string; url?: string }[]
  >([]);
  /** Odkud se právě vybírá: z databáze, nebo ze složky na disku. */
  const [zdroj, setZdroj] = useState<'knihovna' | 'disk'>('knihovna');
  const [mistni, setMistni] = useState<MistniOdpoved>({ dostupne: false, slozka: '', skladby: [] });
  const [mistniNacita, setMistniNacita] = useState(false);
  /** Sady, které ve složce přibyly, zatímco byl pult otevřený. */
  const [noveSady, setNoveSady] = useState<string[]>([]);
  /** Průběh nahrávání souborů z počítače do knihovny. */
  const [nahrava, setNahrava] = useState<{ hotovo: number; celkem: number } | null>(null);
  const otiskyMinule = useRef<Map<string, OtiskSady>>(new Map());
  const jizVidene = useRef<Set<string>>(new Set());
  /** Náhled videa: co hraješ, ať máš při mixu před očima. */
  const [pisne, setPisne] = useState<Song[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [odkazVidea, setOdkazVidea] = useState('');
  const [chybaVidea, setChybaVidea] = useState<string | null>(null);
  /** Šířka časové osy — popisky se podle ní ředí, ať se neslijí. */
  const osa = useRef<HTMLDivElement | null>(null);
  const [sirkaOsy, setSirkaOsy] = useState(0);
  /**
   * Rozbor načtené sady.
   *
   * Čísla, která dřív chodila hotová odjinud, se počítají tady z tvého
   * zvuku. Běží to na pozadí s pauzami mezi stopami — bez nich by okno
   * na pár vteřin ztuhlo, protože FFT přes celou stopu je práce na
   * miliony vzorků.
   */
  const [rozbor, setRozbor] = useState<{
    pocita: boolean;
    tonina: Tonina | null;
    bpm: number;
    lufs: number;
    spickaDb: number;
    dynamika: number;
    stabilita: number;
    zastoupeni: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    const unsub = stemAudioService.subscribe((state) => {
      setAudioState(state);
    });
    // The service's own initial fetch (at module load) usually fires before
    // the Supabase session is restored and 401s — refetch now, on mount,
    // when we're sure the user is actually signed in.
    stemAudioService.fetchSongs();
    return () => unsub();
  }, []);

  const { songs, selectedSong, isPlaying, currentTime, duration, audioReady, loadingAudio, globalPitch, dokola, rychlost, channels, meterLevels } = audioState;

  /**
   * Načte, co leží ve složce se stopami.
   *
   * Neural Mix Pro tam sype průběžně, takže se to dá vyvolat znovu
   * tlačítkem — jinak by nová sada byla vidět až po obnovení stránky.
   */
  const nactiMistni = React.useCallback(async (rezim: 'prvni' | 'rucne' | 'tise' = 'rucne') => {
    // Při hlídání na pozadí se s tlačítkem nehýbe — blikalo by co pár vteřin.
    if (rezim !== 'tise') setMistniNacita(true);
    try {
      const r = await authorizedFetch('/api/stopy/mistni');
      const d: MistniOdpoved = await r.json();
      setMistni(d);

      const ted = otisky(d.skladby || []);
      if (rezim === 'prvni') {
        // Co tam leželo, než jsi pult otevřel, není nové.
        for (const n of ted.keys()) jizVidene.current.add(n);
      } else {
        const pribylo = stabilniNove(otiskyMinule.current, ted, jizVidene.current);
        if (pribylo.length) {
          for (const n of pribylo) jizVidene.current.add(n);
          setNoveSady((p) => [...new Set([...p, ...pribylo])]);
        }
      }
      otiskyMinule.current = ted;
    } catch {
      setMistni({ dostupne: false, slozka: '', skladby: [], duvod: 'Složku se nepodařilo přečíst.' });
    } finally {
      if (rezim !== 'tise') setMistniNacita(false);
    }
  }, []);

  useEffect(() => { nactiMistni('prvni'); }, [nactiMistni]);

  /**
   * Hlídá složku, dokud je pult otevřený.
   *
   * Separace trvá pár vteřin a klikat po ní na „Načíst znovu" je přesně
   * ta drobnost, na kterou se zapomene. Ptáme se po šesti vteřinách;
   * je to výpis jedné složky, ne nic drahého. Když disk k dispozici
   * není (třeba na serveru), nehlídá se vůbec.
   */
  useEffect(() => {
    if (!mistni.dostupne) return;
    const t = setInterval(() => nactiMistni('tise'), 6000);
    return () => clearInterval(t);
  }, [mistni.dostupne, nactiMistni]);

  /**
   * Vytáhne z vloženého textu identifikátor videa.
   *
   * Bere celou adresu i holé jedenáctiznakové id — ze schránky chodí
   * obojí podle toho, odkud se kopírovalo.
   */
  const zobrazOdkaz = () => {
    const t = odkazVidea.trim();
    const id = idZAdresy(t) || (/^[\w-]{11}$/.test(t) ? t : null);
    if (!id) { setChybaVidea('V tom odkazu žádné video není.'); return; }
    setVideoId(id);
    setOdkazVidea('');
    setChybaVidea(null);
  };

  /**
   * Nahraje soubory z počítače do knihovny a pověsí je na fadery.
   *
   * Ukládá se, ne jen načítá: soubor z disku by po zavření stránky
   * zmizel a stopa na faderu by příště chyběla. V knihovně zůstane
   * a dá se použít i jinde.
   *
   * Role se hádá z názvu stejně jako u složky na disku — separátory
   * věší štítek za název, takže `Netáhlo-bass.wav` sedne na Basu.
   */
  const nahrajZPocitace = async (soubory: FileList) => {
    const seznam = Array.from(soubory).filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|flac|ogg|aif|aiff)$/i.test(f.name));
    if (!seznam.length) return;

    setNahrava({ hotovo: 0, celkem: seznam.length });
    const nove = [...vlastniStopy];
    for (let i = 0; i < seznam.length; i++) {
      const f = seznam[i];
      try {
        const a = await assetLibraryService.upload(f, 'stem_mix', 'stem', 'global');
        // Co se nepodaří zařadit podle názvu, jde na právě vybraný fader.
        const role = rolePodleNazvu(f.name) || cilovyFader;
        const polozka = { role, nazev: f.name, assetId: a.id };
        const k = nove.findIndex((v) => v.role === role);
        if (k >= 0) nove[k] = polozka; else nove.push(polozka);
      } catch (e: any) {
        setHlaska(`„${f.name}" se nepodařilo nahrát: ${e?.message || e}`);
      }
      setNahrava({ hotovo: i + 1, celkem: seznam.length });
    }

    setVlastniStopy(nove);
    stemAudioService.pouzijVlastniStopy(nove);
    setNahrava(null);
    setHlaska(`Nahráno do knihovny: ${skladby(seznam.length)}.`);
  };

  /** Zpěvník kvůli náhledu videa — bere se z něj, co má odkaz na YouTube. */
  useEffect(() => {
    setPisne(songDatabaseService.getSongs());
    return songDatabaseService.subscribe((s) => setPisne(s));
  }, []);

  /** Pověsí stopu na fader; na jednom faderu je vždycky jen jedna. */
  const povesNaFader = (role: string, polozka: { nazev: string; assetId?: string; url?: string }) => {
    const nove = [...vlastniStopy.filter((v) => v.role !== role), { role, ...polozka }];
    setVlastniStopy(nove);
    stemAudioService.pouzijVlastniStopy(nove);
    return nove;
  };

  /**
   * Naveze celou sadu ze složky naráz.
   *
   * Separátor vyplivne čtyři soubory a věšet je po jednom je čtyřikrát
   * ta samá práce; role se pozná z názvu, takže sedí samy.
   */
  const nactiSadu = (sk: MistniSkladba) => {
    const nove = [...vlastniStopy];
    for (const t of sk.stopy) {
      if (!t.role) continue;
      const polozka = { role: t.role, nazev: t.jmeno, url: odkazNaMistni(t.cesta) };
      const i = nove.findIndex((v) => v.role === t.role);
      if (i >= 0) nove[i] = polozka; else nove.push(polozka);
    }
    setVlastniStopy(nove);
    stemAudioService.pouzijVlastniStopy(nove);
  };

  // Poll processing songs progress
  useEffect(() => {
    const hasProcessing = songs.some((s) => s.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      stemAudioService.fetchSongs();
    }, 2000);

    return () => clearInterval(interval);
  }, [songs]);


  const handleDeleteStemSet = async (song: StemSongDocument) => {
    if (!window.confirm(`Opravdu odstranit "${song.title}"? Smažou se i případné nahrané stopy.`)) return;
    try {
      await stemAudioService.deleteStemSet(song.id);
    } catch (err: any) {
      setHlaska(err.message || 'Nepodařilo se odstranit sadu stop.');
    }
  };

  /** Spustí rozbor, jakmile jsou stopy načtené. */
  useEffect(() => {
    if (!audioReady) { setRozbor(null); return; }
    const stopy = stemAudioService.nactenaStopy();
    if (!stopy.length) { setRozbor(null); return; }

    let zruseno = false;
    // Pauza mezi kroky pustí prohlížeč k překreslení; bez ní se rozbor
    // udělá rychleji, ale okno mezitím nereaguje.
    const pauza = () => new Promise((r) => setTimeout(r, 0));

    (async () => {
      setRozbor((r) => ({
        pocita: true,
        tonina: r?.tonina ?? null,
        bpm: r?.bpm ?? 0,
        lufs: r?.lufs ?? -120,
        spickaDb: r?.spickaDb ?? -120,
        dynamika: r?.dynamika ?? 0,
        stabilita: r?.stabilita ?? 0,
        zastoupeni: r?.zastoupeni ?? {},
      }));

      // 1) Zastoupení stop podle efektivní hodnoty — jeden průchod polem.
      const hodnoty: Record<string, number> = {};
      let vzorkovaci = 48000;
      let delkaVyrezu = 0;
      for (const id of stopy) {
        const v = stemAudioService.vzorkyStopy(id);
        if (!v) continue;
        hodnoty[id] = rms(v.data);
        vzorkovaci = v.vzorkovaci;
        delkaVyrezu = Math.max(
          delkaVyrezu,
          Math.min(v.data.length, Math.floor(VTERIN_NA_TONINU * v.vzorkovaci)),
        );
        await pauza();
        if (zruseno) return;
      }

      // 2) Součet stop na hlasitost a tóninu celého mixu. Bere se výřez
      //    ze středu: na tónině ani hlasitosti se od celku neliší a
      //    ušetří to násobky práce i paměti.
      const mix = new Float32Array(delkaVyrezu);
      for (const id of stopy) {
        const v = stemAudioService.vzorkyStopy(id);
        if (!v) continue;
        const vyrez = vyrezZeStredu(v.data, v.vzorkovaci, VTERIN_NA_TONINU);
        const n = Math.min(vyrez.length, mix.length);
        for (let i = 0; i < n; i++) mix[i] += vyrez[i];
        await pauza();
        if (zruseno) return;
      }

      const r = rozeberStopu(mix, vzorkovaci);
      if (zruseno) return;

      // 3) Tempo z bicích; když je nemáme, ze součtu.
      let bpm = 0;
      const proTempo = stemAudioService.bufferStopy('drums')
        || stemAudioService.bufferStopy(stopy[0]);
      if (proTempo) {
        const doKonce = Math.min(proTempo.duration, 60);
        bpm = Math.round(odhadniTempoZUseku(proTempo, 0, doKonce) || 0);
      }

      if (zruseno) return;
      setRozbor({
        pocita: false,
        tonina: r.tonina,
        bpm,
        lufs: r.lufs,
        spickaDb: r.spickaDb,
        dynamika: r.dynamika,
        // Stabilitu z jednoho odhadu tempa spočítat nejde; drží se
        // místo, dokud nebude z čeho.
        stabilita: 0,
        zastoupeni: zastoupeniStop(hodnoty),
      });
    })();

    return () => { zruseno = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioReady, selectedSong?.id]);

  const popiskyCasu = React.useMemo(
    () => popiskyOsy(duration, sirkaOsy),
    [duration, sirkaOsy],
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Find any active processing song
  const activeProcessingSong = songs.find((s) => s.status === 'processing') || (selectedSong?.status === 'processing' ? selectedSong : null);

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4 sm:p-6 text-slate-100">

      {/* HEADER TITLE BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/30 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Sliders className="w-64 h-64 text-amber-400" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Vodorovné stopy na společné časové ose
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            Mixážní pult
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Osm stop pod sebou na jedné ose — <strong className="text-amber-400">Zpěv, Kytara, Sólo, Basa, Bicí, Piano, Metronom, Ostatní</strong> — takže je vidět, kde sloka končí i kde vypadnou bicí. Kliknutím do vlnovky se skočí kamkoli. Soubory se berou z knihovny, nebo z počítače — a rovnou se uloží do knihovny.
          </p>
        </div>
      </div>

      {/* PŘIŘAZENÍ STOP NA FADERY */}
      <div className="space-y-6">
        {/* Vlastní stopy: fadery zůstávají, jen se na ně věší soubory
            z knihovny. Hotových rozdělených sad je pár, kdežto jednotlivých
            stop leží v databázi spousta a nešlo z nich mix poskládat. */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400 shrink-0" />
            <h3 className="text-base font-bold text-white">Stopy na fadery</h3>
            <span className="text-xs text-slate-400">vyber fader a k němu soubor</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {ROLE_FADERU.map((r) => (
              <button
                key={r.id}
                onClick={() => setCilovyFader(r.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  cilovyFader === r.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {r.popis}
                {vlastniStopy.some((v) => v.role === r.id) && (
                  <span className="ml-1.5 text-emerald-400">•</span>
                )}
              </button>
            ))}
          </div>

          {/* Odkud brát soubory. Knihovna je sdílená s kapelou, disk je
              jen tenhle počítač — separátor tam sype rychleji, než by se
              stihlo cokoli nahrát nahoru. */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            {([
              ['knihovna', 'Z knihovny'],
              ['disk', 'Z počítače'],
            ] as const).map(([id, popis]) => (
              <button
                key={id}
                onClick={() => setZdroj(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  zdroj === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {popis}
              </button>
            ))}
            {zdroj === 'disk' && (
              <button
                onClick={() => nactiMistni('rucne')}
                disabled={mistniNacita}
                className="ml-auto px-3 py-1.5 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer disabled:opacity-50"
              >
                {mistniNacita ? 'Hledám…' : 'Načíst znovu'}
              </button>
            )}
          </div>

          {zdroj === 'disk' && (
            <div className="space-y-2">
              {/* Vybrané soubory se uloží do knihovny, ne jen načtou —
                  jinak by po zavření stránky zmizely. */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  Vybrat soubory z počítače
                  <input
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.aif,.aiff"
                    multiple
                    className="hidden"
                    disabled={!!nahrava}
                    onChange={(e) => { if (e.target.files) void nahrajZPocitace(e.target.files); e.target.value = ''; }}
                  />
                </label>
                {nahrava ? (
                  <span className="text-[11px] text-amber-400">
                    Nahrávám {nahrava.hotovo} z {nahrava.celkem}…
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    Uloží se do knihovny a rovnou pověsí na fadery podle názvu.
                  </span>
                )}
              </div>

              <div className="text-[11px] text-slate-500 font-mono truncate pt-1 border-t border-slate-800">
                Nebo ze složky: {mistni.slozka}
              </div>

              {!mistni.dostupne ? (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                  {mistni.duvod || 'Složku se stopami se nepodařilo přečíst.'}
                </div>
              ) : mistni.skladby.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                  Ve složce zatím žádné zvukové soubory nejsou.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {mistni.skladby.map((sk) => (
                    <div key={sk.nazev} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate flex-1">
                          {sk.nazev || '(bez názvu)'}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {sk.stopy.length} {sk.stopy.length === 1 ? 'stopa' : sk.stopy.length < 5 ? 'stopy' : 'stop'}
                        </span>
                        {sk.stopy.some((t) => t.role) && (
                          <button
                            onClick={() => nactiSadu(sk)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold cursor-pointer shrink-0"
                          >
                            Načíst na fadery
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sk.stopy.map((t) => (
                          <button
                            key={t.cesta}
                            onClick={() => povesNaFader(t.role || cilovyFader, { nazev: t.jmeno, url: odkazNaMistni(t.cesta) })}
                            title={`${t.jmeno} — pověsit na ${
                              ROLE_FADERU.find((r) => r.id === (t.role || cilovyFader))?.popis || t.role
                            }`}
                            className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-[10px] text-slate-300 cursor-pointer"
                          >
                            {ROLE_FADERU.find((r) => r.id === t.role)?.popis || '?'}
                            <span className="text-slate-500 ml-1">{Math.round(t.velikost / 1048576)} MB</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {zdroj === 'knihovna' && (
          <VyberZKnihovny
            kategorie="stem_mix,backing_tracks,recordings,samples"
            cil={`na ${ROLE_FADERU.find((r) => r.id === cilovyFader)?.popis || cilovyFader}`}
            prazdno="V knihovně zatím žádné použitelné stopy nejsou."
            sNahledem
            nahled={(u) => <audio src={u} controls className="w-full h-8" />}
            onVybrat={(a) => {
              // Na jednom faderu je jedna stopa; nová nahradí starou.
              const nove = [
                ...vlastniStopy.filter((v) => v.role !== cilovyFader),
                {
                  role: cilovyFader,
                  nazev: a.name,
                  assetId: a.id,
                  popisRole: ROLE_FADERU.find((r) => r.id === cilovyFader)?.popis,
                },
              ];
              setVlastniStopy(nove);
              stemAudioService.pouzijVlastniStopy(nove);
              // Posun na první fader, který je ještě prázdný. Stopy se
              // věší po sadách a přepínat cíl ručně mezi každými dvěma
              // kliknutími je přesně ta chvíle, kdy se na to zapomene.
              const volny = ROLE_FADERU.find((r) => !nove.some((v) => v.role === r.id));
              if (volny) setCilovyFader(volny.id);
            }}
          />
          )}

          {vlastniStopy.length > 0 && (
            <div className="border-t border-slate-800 pt-3 space-y-2">
              {/* Uložení mixu.
                  Poskládat stopy je práce na několik minut a dosud žila
                  jen v otevřené stránce — po načtení byla pryč. Ukládá se
                  jako další skladba se stopami, takže se objeví v seznamu
                  vedle ostatních a jde k ní vrátit. */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Připojit k existující skladbě je to obvyklé: stopy patří
                    k písni, kterou už v katalogu máš, a zakládat vedle ní
                    druhou se stejným názvem jen dělá nepořádek. */}
                <select
                  value={cilovaPisen}
                  onChange={(e) => setCilovaPisen(e.target.value)}
                  className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white cursor-pointer focus:border-amber-500 outline-none"
                >
                  <option value="">— založit novou skladbu —</option>
                  {pisne.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.artist ? `${p.artist} — ${p.title}` : p.title}
                    </option>
                  ))}
                </select>

                {!cilovaPisen && (
                  <input
                    value={nazevMixu}
                    onChange={(e) => setNazevMixu(e.target.value)}
                    placeholder="Název nové skladby…"
                    className="flex-1 min-w-[160px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 outline-none"
                  />
                )}

                <button
                  disabled={(!cilovaPisen && !nazevMixu.trim()) || uklada}
                  onClick={async () => {
                    setUklada(true);
                    setHlaska(null);
                    try {
                      const res = await authorizedFetch('/api/stems/vlastni', {
                        method: 'POST',
                        body: JSON.stringify({
                          nazev: nazevMixu.trim(),
                          songId: cilovaPisen || undefined,
                          stopy: vlastniStopy,
                          // Hlasitosti, panoramata a ztlumení — bez nich by
                          // se po otevření všechno vrátilo na výchozí.
                          nastaveni: channels,
                        }),
                      });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.error || 'Uložení selhalo.');
                      const kam = cilovaPisen
                        ? pisne.find((p) => p.id === cilovaPisen)?.title || 'skladbě'
                        : nazevMixu.trim();
                      setHlaska(
                        cilovaPisen
                          ? `Mix i s nastavením připojen ke skladbě „${kam}".`
                          : `Uloženo jako „${kam}" — najdeš to v seznamu skladeb.`,
                      );
                      setNazevMixu('');
                      // Seznam se musí načíst znovu, jinak by tam nová
                      // skladba nebyla vidět až do dalšího otevření sekce.
                      await stemAudioService.fetchSongs();
                    } catch (e: any) {
                      setHlaska(e?.message || 'Uložení selhalo.');
                    } finally {
                      setUklada(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {uklada ? 'Ukládám…' : cilovaPisen ? 'Připojit ke skladbě' : 'Uložit jako skladbu'}
                </button>
              </div>
              {hlaska && <div className="text-[11px] text-emerald-400">{hlaska}</div>}

              {vlastniStopy.map((v) => (
                <div key={v.role} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="text-[10px] font-bold text-amber-400 w-16 shrink-0 uppercase">
                    {ROLE_FADERU.find((r) => r.id === v.role)?.popis || v.role}
                  </span>
                  <span className="truncate flex-1">{v.nazev}</span>
                  <button
                    onClick={() => {
                      const nove = vlastniStopy.filter((x) => x.role !== v.role);
                      setVlastniStopy(nove);
                      stemAudioService.pouzijVlastniStopy(nove);
                    }}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 cursor-pointer"
                    title="Sundat z faderu"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AUDIO LOADING & BUFFER INITIALIZATION MODAL / BANNER */}
      {selectedSong && selectedSong.status === 'completed' && (loadingAudio || !audioReady) && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <RotateCcw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  Načítání zvukových stop do Web Audio DAW mixéru...
                </h4>
                <p className="text-xs text-slate-400">
                  Inicializace vícekanálového směrování, ekvalizérů a Mid/Side procesoru pro skladbu <span className="text-amber-300 font-semibold">{selectedSong.title}</span>
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Tone.js Engine Sync
            </div>
          </div>

          {/* Stems Audio Buffer Loading Progress Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2">
            {selectedSong.stems.map((stem) => {
              const theme = stemColors[stem.id] || stemColors['other'];
              return (
                <div
                  key={stem.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                      style={{ backgroundColor: theme.accent }}
                    />
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {theme.label}
                    </span>
                  </div>
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEB AUDIO API MIXER CONSOLE WITH SVILE FADERY */}
      {/* Co přibylo ve složce, zatímco byl pult otevřený.
          Sada se ohlásí až kolo po tom, co se objeví — separátor
          u čtyřicetimegabajtového wavu chvíli píše a načíst ho
          v půlce by dalo useknutou stopu. */}
      {noveSady.length > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <Layers className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300 mr-1">
            {noveSady.length === 1 ? 'Ve složce přibyla sada:' : 'Ve složce přibyly sady:'}
          </span>
          {noveSady.map((n) => {
            const sk = mistni.skladby.find((x) => x.nazev === n);
            return (
              <button
                key={n}
                disabled={!sk}
                onClick={() => {
                  if (sk) nactiSadu(sk);
                  setNoveSady((p) => p.filter((x) => x !== n));
                  setZdroj('disk');
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-40 max-w-[18rem] truncate"
                title={`Načíst „${n}" na fadery`}
              >
                {n || '(bez názvu)'} → na fadery
              </button>
            );
          })}
          <button
            onClick={() => setNoveSady([])}
            className="ml-auto p-1 rounded text-emerald-400/60 hover:text-emerald-300 cursor-pointer"
            title="Skrýt"
          >
            ×
          </button>
        </div>
      )}

      {/* NÁHLED VIDEA
          Při cvičení je půlka informace v tom, co ruce dělají. Zvuk si
          řídíš v přehrávači YouTube — hraje vedle stop, ne místo nich. */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <Music2 className="w-5 h-5 text-amber-400 shrink-0" />
          <h3 className="text-base font-bold text-white">Náhled videa</h3>
          <span className="text-xs text-slate-400">vyber skladbu ze zpěvníku, nebo vlož odkaz</span>
          {videoId && (
            <button
              onClick={() => setVideoId(null)}
              className="ml-auto px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
            >
              Zavřít video
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={videoId ?? ''}
            onChange={(e) => setVideoId(e.target.value || null)}
            className="flex-1 min-w-[200px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white cursor-pointer focus:border-amber-500 outline-none"
          >
            <option value="">— skladba ze zpěvníku —</option>
            {pisne
              .filter((p) => (p.youtubeVideos?.length ?? 0) > 0)
              .map((p) => (
                <optgroup key={p.id} label={`${p.artist ? p.artist + ' — ' : ''}${p.title}`}>
                  {p.youtubeVideos!.map((v) => (
                    <option key={v.id} value={v.id}>{v.title || v.type}</option>
                  ))}
                </optgroup>
              ))}
          </select>

          <input
            value={odkazVidea}
            onChange={(e) => setOdkazVidea(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') zobrazOdkaz(); }}
            placeholder="…nebo vlož odkaz na YouTube"
            className="flex-1 min-w-[200px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 outline-none"
          />
          <button
            onClick={zobrazOdkaz}
            disabled={!odkazVidea.trim()}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer disabled:opacity-40"
          >
            Zobrazit
          </button>
        </div>

        {chybaVidea && <div className="text-[11px] text-rose-400">{chybaVidea}</div>}

        {videoId && (
          <div className="relative w-full overflow-hidden rounded-2xl border border-slate-800" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}`}
              title="Náhled videa"
              allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        )}
      </div>

      {(
        <div className="bg-[#121217] border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-2xl space-y-6">
          {/* Kdo hraje. Ovládání je až pod stopami — patří k tomu,
              co řídí, a při klikání do vlnovky je ruka blíž. */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-xl font-bold">{selectedSong?.title || 'Mixážní pult'}</h2>
            <p className="text-xs text-slate-400 truncate">
              {selectedSong?.artist || 'Vyber soubory na fadery níž'}
            </p>
          </div>

          {/* PRUH S ÚDAJI
              Tahle čísla dřív chodila hotová z cizího nástroje. Teď se
              počítají z tvého zvuku, takže sedí i na stopy, které jsi
              nahrál z počítače. Co se spočítat nedá, se neukazuje —
              prázdné místo je poctivější než vymyšlená hodnota. */}
          {rozbor && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {[
                  ['Tónina', rozbor.tonina ? rozbor.tonina.popis : null,
                    rozbor.tonina ? `jistota ${rozbor.tonina.jistota} %` : null],
                  ['Tempo', rozbor.bpm > 0 ? `${rozbor.bpm} BPM` : null, null],
                  ['Hlasitost', rozbor.lufs > -119 ? `${rozbor.lufs.toFixed(1)} LUFS` : null,
                    rozbor.spickaDb > -119 ? `špička ${rozbor.spickaDb.toFixed(1)} dB` : null],
                  ['Dynamika', rozbor.dynamika > 0 ? `${rozbor.dynamika.toFixed(1)} dB` : null,
                    rozbor.dynamika >= 12 ? 'široká' : rozbor.dynamika >= 8 ? 'běžná' : 'stlačená'],
                  ['Délka', duration > 0 ? casOsy(duration) : null, null],
                ].map(([popis, hodnota, pod]) => (
                  <div key={String(popis)} className="min-w-[92px]">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">{popis}</div>
                    <div className="text-sm font-bold text-white tabular-nums">
                      {hodnota ?? <span className="text-slate-700">—</span>}
                    </div>
                    {pod && hodnota && (
                      <div className="text-[9px] text-slate-500">{pod}</div>
                    )}
                  </div>
                ))}

                {rozbor.pocita && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-400 self-center">
                    <RotateCcw className="w-3 h-3 animate-spin" />
                    počítám z audia…
                  </div>
                )}
              </div>

              {/* Zastoupení stop. Proti nejhlasitější, ne proti součtu:
                  u šesti stop by proti součtu měla každá sotva dvacet
                  procent i tam, kde je zřetelně slyšet. */}
              {Object.keys(rozbor.zastoupeni).length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-slate-800/70">
                  {ROLE_FADERU.filter((r) => rozbor.zastoupeni[r.id] !== undefined).map((r) => {
                    const p = rozbor.zastoupeni[r.id];
                    const barva = (stemColors[r.id] || stemColors['other']).accent;
                    return (
                      <div key={r.id} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: barva }} />
                        <span className="text-[10px] text-slate-400">{r.popis}</span>
                        <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: barva }}>
                          {p} %
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VODOROVNÉ STOPY S VLNOVKOU

              Svislé fadery ukazovaly hlasitost, ale ne průběh — nebylo
              z nich poznat, kde ve skladbě sloka končí ani kde bicí
              vypadnou. Vodorovně sedí všechny stopy pod sebou na jedné
              časové ose, takže se to čte na jeden pohled a dá se kamkoli
              kliknout. Levý sloupec má pevnou šířku, jinak by každý pruh
              začínal jinde a osa by nad ničím neseděla. */}
          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/40">
            <div className="flex items-stretch bg-slate-900/60">
              <div
                className="shrink-0 border-r border-slate-800/70 px-3 h-7 flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-500"
                style={{ width: SIRKA_OVLADANI }}
              >
                Mixér
              </div>
              <div ref={osa} className="flex-1 relative min-w-0 h-7">
                {popiskyCasu.map((t) => (
                  <div
                    key={t.cas}
                    className="absolute top-0 bottom-0 border-l border-slate-800/70 pl-1 text-[10px] text-slate-500 tabular-nums flex items-center"
                    style={{ left: t.x }}
                  >
                    {casOsy(t.cas)}
                  </div>
                ))}
              </div>
            </div>

            {ROLE_FADERU.map((role) => {
              const stem = selectedSong?.stems.find((x) => x.id === role.id);
              const naNem = vlastniStopy.find((v) => v.role === role.id);
              return (
                <StopaVodorovne
                  key={role.id}
                  stemId={role.id}
                  popis={role.popis}
                  naNem={naNem?.nazev || stem?.name || null}
                  barva={(stemColors[role.id] || stemColors['other']).accent}
                  channel={channels[role.id] || {
                    volume: 0, pan: 0, isMuted: false, isSolo: false,
                    pitchSemi: 0, isMono: false, stereoWidth: 1.0,
                  }}
                  delka={duration}
                  cas={currentTime}
                  jeCil={cilovyFader === role.id}
                  verze={`${selectedSong?.id || ''}:${audioReady}`}
                  onUpdate={(u) => stemAudioService.updateChannel(role.id, u)}
                  onVybrat={() => setCilovyFader(role.id)}
                />
              );
            })}
          </div>

          {/* TRANSPORT */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => stemAudioService.togglePlay()}
              disabled={!audioReady || loadingAudio}
              className={`w-11 h-11 rounded-2xl transition-all cursor-pointer flex items-center justify-center shadow-lg shrink-0 ${
                isPlaying
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              } disabled:opacity-40`}
              title={isPlaying ? 'Pauza' : 'Přehrát'}
            >
              {loadingAudio ? (
                <RotateCcw className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={() => { stemAudioService.stop(); stemAudioService.seek(0); }}
              disabled={!audioReady}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
              title="Zastavit a na začátek"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>

            <span className="font-mono text-sm text-slate-300 tabular-nums shrink-0">
              {formatTime(currentTime)}
              <span className="text-slate-600"> / {formatTime(duration)}</span>
            </span>

            <button
              onClick={() => stemAudioService.setDokola(!dokola)}
              className={`px-3 h-9 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 shrink-0 ${
                dokola ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Přehrávat pořád dokola"
            >
              <Repeat className="w-3.5 h-3.5" /> Smyčka
            </button>

            {/* Tempo. Zvuk se dopočítaně posune zpátky, takže pomalejší
                cvičení hraje pořád ve své tónině. */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 shrink-0">
              {RYCHLOSTI.map((rr) => (
                <button
                  key={rr}
                  onClick={() => stemAudioService.setRychlost(rr)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono cursor-pointer ${
                    rychlost === rr ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {rr}×
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-slate-950 px-3 h-9 rounded-xl border border-slate-800 text-xs shrink-0">
              <Music className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">Transpozice</span>
              <button
                onClick={() => stemAudioService.setGlobalPitch(Math.max(-12, globalPitch - 1))}
                className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-bold cursor-pointer"
              >
                −
              </button>
              <span className="w-9 text-center font-mono font-bold text-amber-400 tabular-nums">
                {globalPitch > 0 ? `+${globalPitch}` : globalPitch} st
              </span>
              <button
                onClick={() => stemAudioService.setGlobalPitch(Math.min(12, globalPitch + 1))}
                className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-bold cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROCESSING STATE DAW WORKSPACE PREVIEW (when active selected song is processing) */}
      {selectedSong && selectedSong.status === 'processing' && (
        <div className="bg-[#121217] border-2 border-amber-500/30 rounded-3xl p-6 sm:p-8 text-white shadow-2xl space-y-6 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold">
                <RotateCcw className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">{selectedSong.title}</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {selectedSong.progressPercentage}% HOTOVO
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {selectedSong.artist} — Příprava 5 samostatných stop pro svislý DAW mixážní pult
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono bg-slate-950 px-3.5 py-2 rounded-2xl border border-slate-800 text-amber-400">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>Automatické odemčení po dokončení</span>
            </div>
          </div>

          {/* Skeleton Fader Channel Strips with Separation Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {selectedSong.stems.map((stem) => {
              const theme = stemColors[stem.id] || stemColors['other'];
              return (
                <div
                  key={stem.id}
                  className="rounded-3xl border border-slate-800/80 bg-slate-950/60 p-4 flex flex-col justify-between space-y-4 relative overflow-hidden"
                >
                  {/* Channel Header */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.05]">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full animate-pulse"
                        style={{ backgroundColor: theme.accent }}
                      />
                      <span className="font-bold text-xs text-slate-200">
                        {theme.label}
                      </span>
                    </div>
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400/80 animate-spin" />
                  </div>

                  {/* Fader Track Shimmer Graphic */}
                  <div className="h-44 bg-[#0a0a0d] rounded-2xl border border-slate-800/60 flex items-center justify-center relative overflow-hidden p-3">
                    <div className="w-1.5 h-full bg-slate-800 rounded-full" />
                    {/* Pulsing Fader Cap Placeholder */}
                    <div
                      className="absolute w-8 h-8 rounded-xl border border-white/20 flex items-center justify-center shadow-lg transition-all duration-700"
                      style={{
                        bottom: `${Math.min(85, Math.max(15, selectedSong.progressPercentage))}%`,
                        backgroundColor: '#1f1f26',
                      }}
                    >
                      <div
                        className="w-4 h-1 rounded-full shadow-[0_0_6px_currentColor]"
                        style={{ backgroundColor: theme.accent }}
                      />
                    </div>
                  </div>

                  {/* Stem Separation Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Stav stopy</span>
                      <span className="text-amber-400 font-bold">{selectedSong.progressPercentage}%</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${selectedSong.progressPercentage}%`,
                          backgroundColor: theme.accent,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
