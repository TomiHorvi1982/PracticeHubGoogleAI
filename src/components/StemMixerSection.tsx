import { HlavickaSekce } from './ui/HlavickaSekce';
import { DawVerticalFader } from './DawVerticalFader';
import {
  vyrez as spocitejVyrez, vyrezOd, srovnejPosun, sirkaVyrezu, jeVidet,
  najdiFazi, tempoZNastupu, MIN_ZOOM, MAX_ZOOM,
} from '../services/mrizkaDob';
import { CasovaOsa } from './mixer/CasovaOsa';
import { KanalKytary } from './mixer/KanalKytary';
import { Tone3000Katalog } from './mixer/Tone3000Katalog';
import { PasSekci, SekceZeSmycky } from './mixer/PasSekci';
import { Sekce, UlozenyPult, maObsah, prectiPult, srovnejSekce } from '../services/sekceSongu';
import { nactiVysku, srovnejVysku, ulozVysku } from '../services/rozvrzeniPultu';
import { KANAL_KYTARY } from '../services/kytaraVMixu';
import { ZdrojStopy, MistniPolozka } from './mixer/ZdrojStopy';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Music2,
  Upload,
  Repeat,
  Square,
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
  detekujNastupy,
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
  /** Přiblížení vlnovky a úsek, který je z něj vidět. */
  const [zoom, setZoom] = useState(1);
  /** Ruční posun vlnovky do stran. `null` = obraz sleduje hlavu. */
  const [posun, setPosun] = useState<number | null>(null);
  const plochaStop = React.useRef<HTMLDivElement>(null);
  const listaPosuvniku = React.useRef<HTMLDivElement>(null);
  /** Smyčka: `null`, dokud si ji člověk nevytáhne. */
  const [smycka, setSmycka] = useState<{ od: number; do: number } | null>(null);
  /** Doby odvozené z tempa; `shoda` říká, jestli jim věřit. */
  const [mrizka, setMrizka] = useState<{ faze: number; shoda: number; bpm: number }>(
    { faze: 0, shoda: 0, bpm: 0 },
  );
  /** Sekce skladby — sloka, refrén, sólo. Ukládají se k písni. */
  const [sekce, setSekce] = useState<Sekce[]>([]);
  const [vyskaStopy, setVyskaStopy] = useState(() => nactiVysku());
  const [ukladaPult, setUkladaPult] = useState(false);
  const [pultUlozen, setPultUlozen] = useState(false);

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
  /**
   * Všechny stopy ze složky v jednom seznamu.
   *
   * Server je vrací seskupené po skladbách, ale pod faderem se vybírá
   * jeden soubor — skupiny by tam jen přidaly patro navíc.
   */
  const mistniPloche: MistniPolozka[] = mistni.skladby.flatMap((sk) =>
    sk.stopy.map((t) => ({ jmeno: t.jmeno, cesta: t.cesta, velikost: t.velikost })));

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

      /*
       * Fáze mřížky dob — až tady, protože potřebuje hotové tempo.
       *
       * Nástupy se berou z bicích, když jsou: mají nejostřejší náběh
       * a doba se na nich pozná nejlíp. Tempo samo by dalo správné
       * rozestupy, ale mřížka by ležela kdekoli.
       */
      const proMrizku = ['drums', 'bass'].find((id) => stopy.includes(id)) || stopy[0];
      const vzorkyProMrizku = proMrizku ? stemAudioService.vzorkyStopy(proMrizku) : null;
      if (vzorkyProMrizku) {
        const nastupy = detekujNastupy(vzorkyProMrizku.data, vzorkyProMrizku.vzorkovaci);
        /*
         * Tempo pro mřížku se bere z nástupů, ne z rozboru.
         *
         * U zkoušené skladby vyšlo z rozboru 117 BPM, jenže údery bicích
         * chodily po 0,44 s, tedy kolem 136. Mřížka postavená na tom
         * prvním čísle by se nezarovnala nikdy. Když se z nástupů tempo
         * určit nedá, spadne se zpátky na rozbor.
         */
        const bpmMrizky = tempoZNastupu(nastupy) || bpm;
        const f = najdiFazi(nastupy, bpmMrizky);
        setMrizka({ ...f, bpm: bpmMrizky });
      } else {
        setMrizka({ faze: 0, shoda: 0, bpm: 0 });
      }
      await pauza();

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

  /**
   * Načte, co je u písně uložené.
   *
   * Běží při výměně skladby a při dopočítání délky — bez délky by se
   * sekce neměly do čeho srovnat a všechny by vypadly jako neplatné.
   */
  useEffect(() => {
    if (!(duration > 0)) { setSekce([]); return; }
    const ulozeno = prectiPult((selectedSong as any)?.pult, duration);
    setSekce(ulozeno.sekce || []);
    setPultUlozen(false);
    // Mřížka spočítaná dřív se jen převezme; počítat ji z audia znovu
    // trvá vteřiny a výsledek je týž.
    if (ulozeno.mrizka) setMrizka(ulozeno.mrizka);
    if (ulozeno.mix) {
      for (const [id, v] of Object.entries(ulozeno.mix)) {
        stemAudioService.updateChannel(id, v);
      }
    }
  }, [selectedSong?.id, duration]);

  /** Sesbírá, co má smysl uložit. */
  const sesbirejPult = React.useCallback((): UlozenyPult => {
    const mix: NonNullable<UlozenyPult['mix']> = {};
    for (const [id, c] of Object.entries(channels)) {
      if (!c) continue;
      mix[id] = {
        volume: c.volume, pan: c.pan, isMuted: c.isMuted, isSolo: c.isSolo,
        pitchSemi: c.pitchSemi,
      };
    }
    return {
      sekce,
      mrizka: mrizka.bpm > 0 ? mrizka : undefined,
      mix: Object.keys(mix).length ? mix : undefined,
    };
  }, [sekce, mrizka, channels]);

  const ulozPult = async () => {
    if (!selectedSong?.id) return;
    setUkladaPult(true);
    try {
      const pult = sesbirejPult();
      const r = await authorizedFetch(`/api/stems/${selectedSong.id}/pult`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pult: maObsah(pult) ? pult : null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Uložení selhalo.');
      setPultUlozen(true);
      window.setTimeout(() => setPultUlozen(false), 2500);
    } catch (e: any) {
      alert(e?.message || 'Pult se nepodařilo uložit.');
    } finally {
      setUkladaPult(false);
    }
  };

  /**
   * Kus skladby, který je při daném přiblížení vidět.
   *
   * `posun` je ruční odjetí do strany. Dokud je `null`, drží se obraz
   * přehrávací hlavy jako dřív. Jakmile se posuvníkem nebo prsty odjede
   * jinam, platí ruční poloha — a přehrávání ji zase přebere, teprve až
   * hlava z obrazu uteče. Jinak by při hraní nešlo nikam odjet.
   */
  const pohled = React.useMemo(
    () => (posun === null
      ? spocitejVyrez(duration || 0, zoom, currentTime)
      : vyrezOd(duration || 0, zoom, posun)),
    [duration, zoom, currentTime, posun],
  );

  useEffect(() => {
    if (posun === null || !isPlaying) return;
    if (!jeVidet(currentTime, pohled)) setPosun(null);
  }, [isPlaying, currentTime, pohled, posun]);

  /** Kolik z celé skladby je vidět. Pod 1 znamená, že je kam posouvat. */
  const podilVidet = duration > 0 ? sirkaVyrezu(duration, zoom) / duration : 1;
  const jdePosouvat = podilVidet < 0.999;

  const posunOJinak = React.useCallback((zmena: number) => {
    setPosun((p) => srovnejPosun(
      duration || 0, zoom, (p === null ? pohled.od : p) + zmena,
    ));
  }, [duration, zoom, pohled.od]);

  /*
   * Posouvání dvěma prsty.
   *
   * Trackpad hlásí vodorovné tažení jako `deltaX`; myš s kolečkem umí
   * totéž se Shiftem. Bere se jen to, co je vodorovné — svislé kolečko
   * musí dál rolovat stránkou, jinak by se v pultu nedalo hnout dolů.
   *
   * Posluchač se věší ručně, protože `preventDefault` v Reactu na
   * `onWheel` neprojde — kolečko je tam pasivní.
   */
  useEffect(() => {
    const el = plochaStop.current;
    if (!el || !jdePosouvat) return;
    const kolecko = (e: WheelEvent) => {
      const vodorovne = e.shiftKey ? e.deltaY : e.deltaX;
      if (Math.abs(vodorovne) < 1) return;
      // Svislé tažení nechat stránce: rozhoduje, co převažuje.
      if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) return;
      e.preventDefault();
      const sirkaPx = el.clientWidth - SIRKA_OVLADANI;
      if (sirkaPx <= 0) return;
      posunOJinak((vodorovne / sirkaPx) * sirkaVyrezu(duration || 0, zoom));
    };
    el.addEventListener('wheel', kolecko, { passive: false });
    return () => el.removeEventListener('wheel', kolecko);
  }, [jdePosouvat, duration, zoom, posunOJinak]);

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
    <div className="max-w-7xl mx-auto space-y-5 p-4 sm:p-6 text-slate-100">

      {/* Hlavička místo původního hero bloku: ten měl gradient,
          dekorativní ikonu 256×256 a odstavec, dohromady přes 300px,
          takže první fader začínal až na 473px a při každém otevření
          se četlo totéž vysvětlení. Text nezmizel, jen se sbalil. */}
      <HlavickaSekce
        nazev="Mixážní pult"
        klic="stemmixer"
        napoveda={(
          <>
            Osm stop pod sebou na jedné ose — Zpěv, Kytara, Sólo, Basa, Bicí,
            Piano, Metronom, Ostatní — takže je vidět, kde sloka končí i kde
            vypadnou bicí. Kliknutím do vlnovky se skočí kamkoli. Soubory se
            berou z knihovny, nebo z počítače — a rovnou se uloží do knihovny.
          </>
        )}
      />

      {/* PŘIŘAZENÍ STOP NA FADERY */}
      <div className="space-y-6">
        {/* Panel „Stopy na fadery" odsud zmizel: soubory se teď vybírají
            pod tím faderem, kterému patří, takže se nedá splést komu.
            Zůstalo jen nahrávání do knihovny — to není výběr stopy, ale
            uložení souboru, a jinde v pultu není. */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-prvek bg-plocha-3 border border-kresba text-drobne text-neutral-200 hover:border-kresba-silna cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5 text-znacka" />
            Nahrát stopy do knihovny
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) void nahrajZPocitace(e.target.files); e.target.value = ''; }}
            />
          </label>
          {nahrava && (
            <span className="text-drobne text-neutral-400 tabular-nums">
              Nahrávám {nahrava.hotovo} z {nahrava.celkem}…
            </span>
          )}
          <span className="text-stitek text-neutral-600">
            Vybrat, co na kterém faderu hraje, jde pod ním.
          </span>
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-drobne font-mono text-slate-300">
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
      {(
        <div className="bg-[#121217] border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-2xl space-y-6">
          {/* Kdo hraje. */}
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
                    <div className="text-stitek uppercase tracking-wider text-slate-500">{popis}</div>
                    <div className="text-sm font-bold text-white tabular-nums">
                      {hodnota ?? <span className="text-slate-700">—</span>}
                    </div>
                    {pod && hodnota && (
                      <div className="text-stitek text-slate-500">{pod}</div>
                    )}
                  </div>
                ))}

                {rozbor.pocita && (
                  <div className="flex items-center gap-1.5 text-drobne text-amber-400 self-center">
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
                        <span className="text-stitek text-slate-400">{r.popis}</span>
                        <span className="text-stitek font-mono font-bold tabular-nums" style={{ color: barva }}>
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
          {/* Ovládání nad stopami, hned pod jménem skladby: při klikání
              do vlnovky je ruka u něj a nemusí sjíždět dolů. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
            {/* Přiblížení vlnovky. Přibližuje se kolem přehrávací hlavy,
                ne kolem začátku — jinak by se po každém přiblížení
                muselo hledat, kde se to zrovna hraje. */}
            <div className="flex items-center gap-1.5 shrink-0 order-last sm:order-none">
              <button
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.5))}
                disabled={zoom <= MIN_ZOOM}
                title="Oddálit"
                aria-label="Oddálit vlnovku"
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                −
              </button>
              <span className="text-stitek text-slate-400 tabular-nums w-10 text-center">
                {zoom < 1.05 ? 'celá' : `${zoom.toFixed(1)}×`}
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.5))}
                disabled={zoom >= MAX_ZOOM}
                title="Přiblížit"
                aria-label="Přiblížit vlnovku"
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
              {smycka && (
                <button
                  onClick={() => { setSmycka(null); stemAudioService.setSmycka(null); }}
                  title="Zrušit smyčku"
                  className="px-2 h-8 rounded-lg bg-znacka/15 border border-znacka/40 text-znacka text-stitek font-bold cursor-pointer"
                >
                  smyčka {Math.round(smycka.do - smycka.od)} s ✕
                </button>
              )}
            </div>

            {/* Sekce a uložení. Sedí k ovládání nad stopami, protože se
                obojí týká celé skladby, ne jedné stopy. */}
            <div className="flex items-center gap-1.5 shrink-0">
              <SekceZeSmycky
                smycka={smycka}
                sekce={sekce}
                delka={duration || 0}
                onZmena={setSekce}
              />
              {selectedSong?.id && (
                <button
                  onClick={() => void ulozPult()}
                  disabled={ukladaPult}
                  title="Uložit sekce, mřížku a nastavení jezdců ke skladbě"
                  className={`flex items-center gap-1 text-stitek px-2 h-8 rounded-lg cursor-pointer disabled:opacity-50 ${
                    pultUlozen
                      ? 'bg-uspech/20 border border-uspech/40 text-uspech'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {pultUlozen ? 'Uloženo' : ukladaPult ? 'Ukládám…' : 'Uložit ke skladbě'}
                </button>
              )}
            </div>

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
            {/* Šest rychlostí v jedné neroztržitelné řadě mělo 310px
                v místě širokém 269. `shrink-0` jim navíc bránilo
                ustoupit, takže se řada ořízla místo zalomení. */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
              {RYCHLOSTI.map((rr) => (
                <button
                  key={rr}
                  onClick={() => stemAudioService.setRychlost(rr)}
                  className={`px-2 py-1 rounded-lg text-drobne font-mono cursor-pointer ${
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

          <div
            ref={plochaStop}
            id="stopy-vlnovky"
            className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/40"
          >
            <div className="flex items-stretch bg-slate-900/60">
              <div
                className="shrink-0 border-r border-slate-800/70 px-3 h-7 flex items-center text-stitek font-bold uppercase tracking-wider text-slate-500"
                style={{ width: SIRKA_OVLADANI }}
              >
                Mixér
              </div>
              <div ref={osa} className="flex-1 relative min-w-0">
                <CasovaOsa
                  delka={duration || 0}
                  od={pohled.od}
                  doKdy={pohled.do}
                  cas={currentTime}
                  bpm={mrizka.bpm || rozbor?.bpm || 0}
                  faze={mrizka.faze}
                  shodaMrizky={mrizka.shoda}
                  smycka={smycka}
                  onSmycka={(sm) => { setSmycka(sm); stemAudioService.setSmycka(sm); }}
                  onSeek={(t) => stemAudioService.seek(t)}
                />
              </div>
            </div>

            {/* SEKCE SKLADBY

                Pod osou a nad stopami, protože sekce popisuje čas, ne
                jednotlivou stopu — refrén platí pro celý pult naráz.
                Levý sloupec je prázdný, aby pruh začínal přesně tam,
                kde začínají vlnovky. */}
            <div className="flex items-stretch">
              <div
                className="shrink-0 border-r border-slate-800/70 bg-slate-900/50 border-b border-b-slate-800/70 px-3 flex items-center text-stitek uppercase tracking-wider text-slate-600"
                style={{ width: SIRKA_OVLADANI }}
              >
                Sekce
              </div>
              <div className="flex-1 min-w-0">
                <PasSekci
                  sekce={sekce}
                  delka={duration || 0}
                  od={pohled.od}
                  doKdy={pohled.do}
                  onZmena={(v) => setSekce(srovnejSekce(v, duration || 0))}
                  onSkok={(t) => stemAudioService.seek(t)}
                  onSmycka={(a2, b2) => {
                    const sm = { od: a2, do: b2 };
                    setSmycka(sm);
                    stemAudioService.setSmycka(sm);
                  }}
                />
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
                  od={pohled.od}
                  doKdy={pohled.do}
                  jeCil={cilovyFader === role.id}
                  verze={`${selectedSong?.id || ''}:${audioReady}`}
                  vyska={vyskaStopy}
                  onUpdate={(u) => stemAudioService.updateChannel(role.id, u)}
                  onVybrat={() => setCilovyFader(role.id)}
                  onVyska={(v) => {
                    const srovnana = srovnejVysku(v);
                    setVyskaStopy(srovnana);
                    ulozVysku(srovnana);
                  }}
                />
              );
            })}

            {/* POSUVNÍK

                Přiblížená vlnovka ukazuje jen kus skladby a beze změny
                se do zbytku nedalo dostat jinak než přehráváním. Jezdec
                je široký podle toho, kolik je vidět, takže je z něj
                zároveň poznat, jak hluboko je přiblíženo.

                Sedí pod stopami a začíná až za sloupcem s názvy, aby
                jeho délka odpovídala ploše, kterou posouvá. */}
            {jdePosouvat && (
              <div className="flex items-stretch border-t border-slate-800/70 bg-slate-900/40">
                <div className="shrink-0" style={{ width: SIRKA_OVLADANI }} />
                <div
                  ref={listaPosuvniku}
                  role="scrollbar"
                  aria-controls="stopy-vlnovky"
                  aria-orientation="horizontal"
                  aria-label="Posun vlnovky do stran"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(Math.max(0, duration - sirkaVyrezu(duration, zoom)))}
                  aria-valuenow={Math.round(pohled.od)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    const krok = sirkaVyrezu(duration || 0, zoom) / 8;
                    if (e.key === 'ArrowLeft') { e.preventDefault(); posunOJinak(-krok); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); posunOJinak(krok); }
                    if (e.key === 'Home') { e.preventDefault(); setPosun(0); }
                    if (e.key === 'End') {
                      e.preventDefault();
                      setPosun(srovnejPosun(duration || 0, zoom, duration));
                    }
                  }}
                  onPointerDown={(e) => {
                    const lista = listaPosuvniku.current;
                    if (!lista) return;
                    const r = lista.getBoundingClientRect();
                    const sirkaJezdce = r.width * podilVidet;
                    const levyJezdce = r.left + (pohled.od / duration) * r.width;
                    // Kliknutí mimo jezdce ho nejdřív přesune pod prst.
                    const uchop = (e.clientX >= levyJezdce && e.clientX <= levyJezdce + sirkaJezdce)
                      ? e.clientX - levyJezdce
                      : sirkaJezdce / 2;
                    const naCas = (x: number) => srovnejPosun(
                      duration || 0, zoom, ((x - uchop - r.left) / r.width) * duration,
                    );
                    setPosun(naCas(e.clientX));
                    const tahni = (ev: PointerEvent) => setPosun(naCas(ev.clientX));
                    const pust = () => {
                      window.removeEventListener('pointermove', tahni);
                      window.removeEventListener('pointerup', pust);
                    };
                    window.addEventListener('pointermove', tahni);
                    window.addEventListener('pointerup', pust);
                  }}
                  className="relative flex-1 min-w-0 h-3 cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/70"
                >
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-600 hover:bg-slate-500 transition-colors pointer-events-none"
                    style={{
                      left: `${(pohled.od / duration) * 100}%`,
                      width: `${Math.max(4, podilVidet * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/*
            Fadery ke stopám.
            Vodorovné stopy nad nimi ukazují, KDE ve skladbě něco je;
            fader říká, JAK to zní — hlasitost, panorama, výška, sólo,
            ztlumení a ukazatel úrovně. Obojí je potřeba: podle vlnovky
            se hledá místo, podle faderu se míchá.

            Je to týž `DawVerticalFader`, jaký má okno mixu na Pódiu —
            postavit sem druhý, který se chová jinak, by znamenalo dvě
            místa, která se musí držet v souladu.
          */}
          {/* Fadery si šířku dělí, místo aby ji každý měl pevnou.

              S pevnými 168 px se osm faderů na obrazovku nevešlo a
              poslední dva byly za okrajem — kdo mixuje, potřebuje vidět
              všechny naráz, jinak si sólo hledá posouváním. Spodní mez
              zůstává, aby se při zúženém okně místo nečitelné kaše
              objevil posuvník. */}
          <div className="overflow-x-auto">
            <div className="flex items-stretch gap-2 pb-1 min-w-[880px]">
              {ROLE_FADERU.map((role) => {
                const stem = selectedSong?.stems.find((x) => x.id === role.id);
                const naNem = vlastniStopy.find((v) => v.role === role.id);
                return (
                  <div key={role.id} className="flex flex-col flex-1 min-w-0 basis-0">
                    <DawVerticalFader
                      stemId={role.id}
                      name={role.popis}
                      channel={channels[role.id] || {
                        volume: 0, pan: 0, isMuted: false, isSolo: false,
                        pitchSemi: 0, isMono: false, stereoWidth: 1.0,
                      }}
                      meterLevel={meterLevels?.[role.id] || 0}
                      isPlaying={isPlaying}
                      isLoading={loadingAudio}
                      colorTheme={stemColors[role.id] || stemColors['other']}
                      vybrany={cilovyFader === role.id}
                      onVybrat={() => setCilovyFader(role.id)}
                      onUpdate={(u) => stemAudioService.updateChannel(role.id, u)}
                    />

                    {/* Zdroj u faderu, ke kterému patří. Dřív se soubory
                        vybíraly nahoře v jednom panelu a fader se k nim
                        volil zvlášť — u osmi stejných proužků se pak
                        lehko sáhlo vedle. */}
                    <ZdrojStopy
                      naNem={naNem?.nazev || stem?.name || null}
                      mistni={mistniPloche}
                      mistniDostupne={mistni.dostupne}
                      slozka={mistni.slozka}
                      onZMistnich={(m) => {
                        setCilovyFader(role.id);
                        povesNaFader(role.id, { nazev: m.jmeno, url: odkazNaMistni(m.cesta) });
                      }}
                      knihovna={(hotovo) => (
                        <VyberZKnihovny
                          kategorie="stem_mix,backing_tracks,recordings,samples"
                          cil={`na ${role.popis}`}
                          prazdno="V knihovně zatím žádné použitelné stopy nejsou."
                          onVybrat={(a) => {
                            povesNaFader(role.id, { nazev: a.name, assetId: a.id });
                            setCilovyFader(role.id);
                            hotovo();
                          }}
                        />
                      )}
                      onOdebrat={naNem ? () => {
                        const nove = vlastniStopy.filter((v) => v.role !== role.id);
                        setVlastniStopy(nove);
                        stemAudioService.pouzijVlastniStopy(nove);
                      } : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/*
            Živá kytara jako další kanál pultu.

            Není to samostatný nástroj vedle mixu, ale kanál v něm:
            fader, panorama, ztlumení i sólo má společné s ostatními
            a končí v témž součtu. Panel nad faderem řeší jen to, co má
            kytara navíc — odkud bere signál a čím prochází.
          */}
          <div className="overflow-x-auto">
            <div className="flex items-stretch gap-2 pb-1 min-w-[880px]">
              <div className="w-[300px] shrink-0 flex flex-col gap-2">
                <KanalKytary />
              </div>
              {channels[KANAL_KYTARY] && (
                <div className="flex flex-col w-[168px] shrink-0">
                  <DawVerticalFader
                    stemId={KANAL_KYTARY}
                    name="Kytara živě"
                    channel={channels[KANAL_KYTARY]}
                    meterLevel={meterLevels?.[KANAL_KYTARY] || 0}
                    isPlaying={isPlaying}
                    colorTheme={stemColors['guitar'] || stemColors['other']}
                    vybrany={cilovyFader === KANAL_KYTARY}
                    onVybrat={() => setCilovyFader(KANAL_KYTARY)}
                    onUpdate={(u) => stemAudioService.updateChannel(KANAL_KYTARY, u)}
                  />
                </div>
              )}
              {/* Katalog hned vedle faderu: aparát se vybírá tam, kde se
                  zapojuje kytara, ne o dvě sekce dál. Bere si, co zbylo —
                  seznam tónů je tu to nejširší a v úzkém sloupci se
                  z názvů nedalo nic přečíst. */}
              <div className="flex-1 min-w-[380px]">
                <Tone3000Katalog />
              </div>
            </div>
          </div>

        </div>
      )}

        {/* Náhled videa až pod fadery: při mixu se kouká na stopy,
            video je kontrola, ne to hlavní. */}
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
      <div className="flex flex-wrap items-center gap-2">
        <Music2 className="w-5 h-5 text-amber-400 shrink-0" />
        <h3 className="text-base font-bold text-white">Náhled videa</h3>
        <span className="text-xs text-slate-400">vyber skladbu ze zpěvníku, nebo vlož odkaz</span>
        {videoId && (
          <button
            onClick={() => setVideoId(null)}
            className="ml-auto px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-drobne cursor-pointer"
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

      {chybaVidea && <div className="text-drobne text-rose-400">{chybaVidea}</div>}

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
                  <span className="text-stitek font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
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
                  <div className="h-44 bg-podklad rounded-2xl border border-slate-800/60 flex items-center justify-center relative overflow-hidden p-3">
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
                    <div className="flex justify-between text-stitek font-mono text-slate-400">
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
