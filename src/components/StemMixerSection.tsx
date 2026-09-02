import React, { useState, useEffect, useRef } from 'react';
import { 
  Music2,
  Sliders, 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Music, 
  Disc,  
  Sparkles, 
  Radio, 
  Layers,  
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Download,
  Cpu,
  Wand2,
  Check
} from 'lucide-react';
import { StemSongDocument, SongStem } from '../types';
import { stemAudioService, StemAudioState, ChannelState } from '../services/stemAudioService';
import { StemDeckImport } from './stems/StemDeckImport';
import { authorizedFetch } from '../services/assetLibraryService';
import { DawVerticalFader } from './DawVerticalFader';
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
  const otiskyMinule = useRef<Map<string, OtiskSady>>(new Map());
  const jizVidene = useRef<Set<string>>(new Set());
  /** Náhled videa: co hraješ, ať máš při mixu před očima. */
  const [pisne, setPisne] = useState<Song[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [odkazVidea, setOdkazVidea] = useState('');
  const [chybaVidea, setChybaVidea] = useState<string | null>(null);

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

  const { songs, selectedSong, isPlaying, currentTime, duration, audioReady, loadingAudio, globalPitch, channels, meterLevels } = audioState;

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Find any active processing song
  const activeProcessingSong = songs.find((s) => s.status === 'processing') || (selectedSong?.status === 'processing' ? selectedSong : null);

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4 sm:p-6 text-slate-100">
      {/* Stopy hotové jinde.
          Separace u sebe na stroji je řádově rychlejší než přes vzdálený
          worker; sem se přenese jen výsledek. Panel se sám schová, když
          StemDeck neběží — na nasazené verzi to nikdy nebude. */}
      <StemDeckImport />

      {/* HEADER TITLE BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/30 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Sliders className="w-64 h-64 text-amber-400" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Mixážní pult se svislými fadery
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            Mixážní pult
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Fadery stojí pořád — <strong className="text-amber-400">Zpěv, Kytara, Sólo, Basa, Bicí, Metronom, Ostatní</strong> — a ke každému si vybereš soubor: z knihovny, nebo ze složky, kam ti separátor odkládá stopy. K tomu VU metry gainu a kytarový <strong className="text-amber-400">Mid/Side procesor</strong>.
          </p>
        </div>
      </div>

      {/* PŘIŘAZENÍ STOP NA FADERY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vlastní stopy: fadery zůstávají, jen se na ně věší soubory
            z knihovny. Hotových rozdělených sad je pár, kdežto jednotlivých
            stop leží v databázi spousta a nešlo z nich mix poskládat. */}
        <div className="lg:col-span-3 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400 shrink-0" />
            <h3 className="text-base font-bold text-white">Vlastní stopy z knihovny</h3>
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
            {([['knihovna', 'Z knihovny'], ['disk', 'Ze složky na disku']] as const).map(([id, popis]) => (
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
              <div className="text-[11px] text-slate-500 font-mono truncate">{mistni.slozka}</div>

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
                <input
                  value={nazevMixu}
                  onChange={(e) => setNazevMixu(e.target.value)}
                  placeholder="Název skladby…"
                  className="flex-1 min-w-[160px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 outline-none"
                />
                <button
                  disabled={!nazevMixu.trim() || uklada}
                  onClick={async () => {
                    setUklada(true);
                    setHlaska(null);
                    try {
                      const res = await authorizedFetch('/api/stems/vlastni', {
                        method: 'POST',
                        body: JSON.stringify({ nazev: nazevMixu.trim(), stopy: vlastniStopy }),
                      });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.error || 'Uložení selhalo.');
                      setHlaska(`Uloženo jako „${nazevMixu.trim()}" — najdeš to v seznamu skladeb.`);
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
                  {uklada ? 'Ukládám…' : 'Uložit jako skladbu'}
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

        {/* Songs Library & Active Selection */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold flex items-center gap-2 text-white">
                <Disc className="w-5 h-5 text-amber-400" />
                Dostupné Skladby se Stopy
              </h3>
              <span className="text-xs text-slate-400 font-mono">{songs.length} skladeb</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">Načítání skladeb...</div>
            ) : songs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">Zatím tu žádná hotová sada není — pověs si stopy na fadery níž.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                {songs.map((s) => {
                  const isSelected = selectedSong?.id === s.id;
                  const isProcessing = s.status === 'processing';
                  const isFailed = s.status === 'failed';

                  return (
                    <button
                      key={s.id}
                      onClick={() => stemAudioService.selectSong(s)}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/60 shadow-lg'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-xs text-white truncate">{s.title}</div>
                          <div className="text-[11px] text-slate-400 truncate">{s.artist}</div>
                        </div>

                        {s.status === 'completed' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3 h-3" /> Připraveno
                          </span>
                        )}

                        {isProcessing && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-1 animate-pulse shrink-0">
                            <Clock className="w-3 h-3" /> {s.progressPercentage}%
                          </span>
                        )}

                        {isFailed && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold flex items-center gap-1 shrink-0">
                            <AlertCircle className="w-3 h-3" /> Selhalo
                          </span>
                        )}
                      </div>

                      {isFailed && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-rose-300/80 leading-snug line-clamp-3">
                            {s.errorMessage || 'Separace selhala.'}
                          </p>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); handleDeleteStemSet(s); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleDeleteStemSet(s); } }}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400 hover:text-rose-300 cursor-pointer"
                          >
                            Odstranit
                          </span>
                        </div>
                      )}

                      {isProcessing && (
                        <div className="space-y-1">
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-amber-500 h-full transition-all duration-500"
                              style={{ width: `${s.progressPercentage}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-400">
                            <span>Separace stop</span>
                            <span>{s.progressPercentage}%</span>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Song Summary Bar */}
          {selectedSong && (
            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/40 p-3 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold shrink-0">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white">{selectedSong.title}</div>
                  <div className="text-slate-400 text-xs">{selectedSong.artist} • {selectedSong.stems.length} Stop</div>
                </div>
              </div>

              {selectedSong.status === 'completed' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-mono flex items-center gap-1.5">
                    {loadingAudio ? (
                      <>
                        <RotateCcw className="w-3 h-3 animate-spin text-amber-400" />
                        <span className="text-amber-400">Načítání bufferů...</span>
                      </>
                    ) : audioReady ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-emerald-400">Mixér Připraven</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        <span>Příprava</span>
                      </>
                    )}
                  </span>
                </div>
              ) : selectedSong.status === 'failed' ? (
                <div className="text-right text-[11px] text-rose-400 max-w-xs">
                  <div className="font-semibold flex items-center justify-end gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Separace selhala
                  </div>
                  <div className="text-rose-300/70 text-[10px] mt-0.5 leading-snug">
                    {selectedSong.errorMessage || 'Důvod se nepodařilo zjistit.'}
                  </div>
                </div>
              ) : (
                <div className="text-right font-mono text-amber-400 text-[11px] animate-pulse">
                  Právě probíhá separace ({selectedSong.progressPercentage}%)
                </div>
              )}
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
          {/* MASTER TRANSPORT BAR */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-6 gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => stemAudioService.togglePlay()}
                disabled={!audioReady || loadingAudio}
                className={`w-12 h-12 rounded-2xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center shadow-lg ${
                  isPlaying
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                } disabled:opacity-40`}
              >
                {loadingAudio ? (
                  <RotateCcw className="w-5 h-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                )}
              </button>

              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  {selectedSong?.title || 'Mixážní pult'}
                </h2>
                <p className="text-xs text-slate-400">{selectedSong?.artist || 'Vyber soubory na fadery níž'}</p>
              </div>
            </div>

            {/* Time Progress Seek Bar */}
            <div className="flex-1 max-w-md space-y-1.5 mx-auto">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={duration || 180}
                step="0.5"
                value={currentTime}
                onChange={(e) => stemAudioService.seek(parseFloat(e.target.value))}
                className="w-full accent-amber-500 h-2 bg-slate-950 rounded-lg cursor-pointer border border-slate-800"
              />
            </div>

            {/* Global Pitch Transposition */}
            <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800 text-xs">
              <Music className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-slate-300">Master Transpozice:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => stemAudioService.setGlobalPitch(Math.max(-12, globalPitch - 1))}
                  className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-bold text-xs"
                >
                  -
                </button>
                <span className="w-8 text-center font-mono font-bold text-amber-400">
                  {globalPitch > 0 ? `+${globalPitch}` : globalPitch} st
                </span>
                <button
                  onClick={() => stemAudioService.setGlobalPitch(Math.min(12, globalPitch + 1))}
                  className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-bold text-xs"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* SVISLE DAW FADERY GRID

              Tahy stojí pořád, i když je pult prázdný. Dřív se objevily
              až s načtenou skladbou, takže než se něco vybralo, nebylo
              z pultu poznat, kolik tahů vlastně má a co kam patří.
              Pod každým je vidět, co na něm visí — a kliknutím se z něj
              stane cíl pro další vybraný soubor. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {ROLE_FADERU.map((role) => {
              const stem = selectedSong?.stems.find((x) => x.id === role.id);
              const naNem = vlastniStopy.find((v) => v.role === role.id);
              const ch = channels[role.id] || {
                volume: 0,
                pan: 0,
                isMuted: false,
                isSolo: false,
                pitchSemi: 0,
                isMono: false,
                stereoWidth: 1.0,
              };
              const theme = stemColors[role.id] || stemColors['other'];

              return (
                <div key={role.id} className="space-y-1.5">
                  <DawVerticalFader
                    stemId={role.id}
                    name={role.popis}
                    channel={ch}
                    meterLevel={meterLevels[role.id] || 0}
                    isPlaying={isPlaying}
                    // Prázdný fader se netváří, že se načítá — čekal by věčně.
                    isLoading={!!stem && (loadingAudio || !audioReady)}
                    onUpdate={(updates) => stemAudioService.updateChannel(role.id, updates)}
                    colorTheme={theme}
                    compact={false}
                  />
                  <button
                    onClick={() => setCilovyFader(role.id)}
                    title={naNem?.nazev || stem?.name || 'Vyber sem soubor'}
                    className={`w-full px-2 py-1 rounded-lg text-[10px] truncate cursor-pointer transition-all border ${
                      cilovyFader === role.id
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                        : naNem || stem
                        ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        : 'bg-slate-950/50 border-dashed border-slate-800 text-slate-600 hover:border-slate-700'
                    }`}
                  >
                    {naNem?.nazev || stem?.name || 'prázdný'}
                  </button>
                </div>
              );
            })}
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
