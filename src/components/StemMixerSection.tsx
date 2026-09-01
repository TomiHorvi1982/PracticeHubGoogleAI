import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Music, 
  Disc, 
  Youtube, 
  Sparkles, 
  Radio, 
  Layers, 
  Zap, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  HelpCircle,
  Download,
  Activity,
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

/** Fadery pultu. Zůstávají pořád stejné, jen se na ně věší soubory. */
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

  // New Processing Form
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  /** Na který fader se právě přiřazuje a co na nich visí. */
  const [cilovyFader, setCilovyFader] = useState<string>('vocals');
  /** Ukládání poskládaného mixu jako další skladby. */
  const [nazevMixu, setNazevMixu] = useState('');
  const [uklada, setUklada] = useState(false);
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [vlastniStopy, setVlastniStopy] = useState<{ role: string; nazev: string; assetId: string }[]>([]);
  const [customTitle, setCustomTitle] = useState<string>('');
  const [customArtist, setCustomArtist] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  // Poll processing songs progress
  useEffect(() => {
    const hasProcessing = songs.some((s) => s.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      stemAudioService.fetchSongs();
    }, 2000);

    return () => clearInterval(interval);
  }, [songs]);

  const handleStartProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) {
      setSubmitError('Zadejte prosím platný odkaz na YouTube video.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await stemAudioService.processYoutubeUrl(
        youtubeUrl.trim(),
        customTitle.trim() || undefined,
        customArtist.trim() || undefined
      );
      setYoutubeUrl('');
      setCustomTitle('');
      setCustomArtist('');
    } catch (err: any) {
      setSubmitError(err.message || 'Chyba při odesílání požadavku.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStemSet = async (song: StemSongDocument) => {
    if (!window.confirm(`Opravdu odstranit "${song.title}"? Smažou se i případné nahrané stopy.`)) return;
    try {
      await stemAudioService.deleteStemSet(song.id);
    } catch (err: any) {
      setSubmitError(err.message || 'Nepodařilo se odstranit sadu stop.');
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
            <Sparkles className="w-3.5 h-3.5" /> AI Demucs 6-Stem Audio Separace &amp; DAW Svislý Mixážní Pult
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
            AI Stem Studio &amp; DAW Mixážní Pult
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            Stáhněte libovolnou písničku z YouTube, oddělte samostatné stopy (<strong className="text-amber-400">Zpěv, Kytara, Baskytara, Bicí, Synth</strong>) a namixujte si vlastní cvičební doprovod se <strong className="text-amber-400">svislými fadery v Logic DAW stylu, VU metry gainu</strong> a kytarovým <strong className="text-amber-400">Mid/Side procesorem</strong>.
          </p>
        </div>
      </div>

      {/* ACTIVE SEPARATION PIPELINE STATUS BANNER (shown whenever a song is being processed) */}
      {(activeProcessingSong || isSubmitting) && (
        <div className="bg-gradient-to-br from-slate-900 via-amber-950/20 to-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                <RotateCcw className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold uppercase tracking-wider animate-pulse flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" /> AI Separace Probíhá
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-300">
                    {activeProcessingSong?.progressPercentage || 15}%
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white mt-1">
                  {activeProcessingSong?.title || customTitle || 'Zpracování YouTube skladby'}
                </h3>
                <p className="text-xs text-slate-400">
                  {activeProcessingSong?.artist || customArtist || 'Neuronová extrakce vícestopého audia'}
                </p>
              </div>
            </div>

            {/* Audio Wave Bars Animation */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-950/80 px-4 py-2.5 rounded-2xl border border-slate-800">
              <span className="text-[11px] font-mono text-slate-400 mr-2 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" /> Demucs Neural Engine
              </span>
              <div className="flex items-end gap-1 h-5">
                <div className="w-1 bg-amber-500 rounded-full animate-[bounce_0.8s_infinite_100ms] h-3" />
                <div className="w-1 bg-amber-400 rounded-full animate-[bounce_0.8s_infinite_200ms] h-5" />
                <div className="w-1 bg-amber-500 rounded-full animate-[bounce_0.8s_infinite_300ms] h-2" />
                <div className="w-1 bg-amber-300 rounded-full animate-[bounce_0.8s_infinite_150ms] h-4" />
                <div className="w-1 bg-amber-500 rounded-full animate-[bounce_0.8s_infinite_250ms] h-5" />
              </div>
            </div>
          </div>

          {/* Master Progress Bar */}
          <div className="space-y-2 mb-5">
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 transition-all duration-700 shadow-lg shadow-amber-500/30"
                style={{ width: `${activeProcessingSong?.progressPercentage || 15}%` }}
              />
            </div>
          </div>

          {/* Step-by-Step Separation Stages */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Step 1 */}
            {(() => {
              const pct = activeProcessingSong?.progressPercentage || 15;
              const isDone = pct > 30;
              const isCurrent = pct <= 30;
              return (
                <div
                  className={`p-3 rounded-2xl border transition-all ${
                    isDone
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                      : isCurrent
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold">1. Extrakce &amp; Normalizace</span>
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-600" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Stahování YouTube audio streamu &amp; analýza spektra
                  </p>
                </div>
              );
            })()}

            {/* Step 2 */}
            {(() => {
              const pct = activeProcessingSong?.progressPercentage || 15;
              const isDone = pct >= 80;
              const isCurrent = pct > 30 && pct < 80;
              return (
                <div
                  className={`p-3 rounded-2xl border transition-all ${
                    isDone
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                      : isCurrent
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold">2. AI Demucs Separace</span>
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-600" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Rozdělení na 5 stop: Zpěv, Kytara, Bas, Bicí, Synth
                  </p>
                </div>
              );
            })()}

            {/* Step 3 */}
            {(() => {
              const pct = activeProcessingSong?.progressPercentage || 15;
              const isDone = pct >= 100;
              const isCurrent = pct >= 80 && pct < 100;
              return (
                <div
                  className={`p-3 rounded-2xl border transition-all ${
                    isDone
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                      : isCurrent
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold">3. DAW Sestavení</span>
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isCurrent ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-600" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Příprava faderů, směrování a automatické spuštění
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* YOUTUBE INPUT FORM & SONG SELECTOR GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submit YouTube URL Box */}
        <div className="lg:col-span-1 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <h3 className="text-base font-bold flex items-center gap-2 text-white">
            <Youtube className="w-5 h-5 text-red-500" />
            Separovat Písničku z YouTube
          </h3>

          <form onSubmit={handleStartProcess} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                YouTube URL
              </label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Název písně
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Volitelné..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Interpret
                </label>
                <input
                  type="text"
                  value={customArtist}
                  onChange={(e) => setCustomArtist(e.target.value)}
                  placeholder="Volitelné..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !youtubeUrl.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Zahajuji separaci...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Spustit AI Separaci Stop</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1.5">
            <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <HelpCircle className="w-3.5 h-3.5" /> Automatická Pipeline:
            </div>
            <p className="leading-normal">
              1. Stáhnutí zvuku z YouTube <br />
              2. Separace stop přes <code>Demucs AI</code> <br />
              3. Generování vícestopého DAW projektu <br />
              4. Propojení se zpěvníkem a svislými fadery
            </p>
            {/* Separaci nedělá appka, ale worker — a ten musí běžet.
                Bez téhle věty úloha jen tiše čeká ve frontě a vypadá to,
                že se nic neděje. */}
            <p className="leading-normal mt-2 pt-2 border-t border-slate-800">
              Separaci provádí worker, který si úlohy vyzvedává sám. Na tomhle Macu ho spustíte
              příkazem <code>./worker/run-local.sh</code> — úlohy počkají ve frontě, dokud neběží.
            </p>
          </div>
        </div>

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
              <div className="p-8 text-center text-slate-500 text-xs">Žádné dostupné skladby. Vložte YouTube odkaz výše.</div>
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
      {selectedSong && selectedSong.status === 'completed' && (
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
                  {selectedSong.title}
                </h2>
                <p className="text-xs text-slate-400">{selectedSong.artist} — Logic DAW Style Multi-Track Studio</p>
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

          {/* SVISLE DAW FADERY GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {selectedSong.stems.map((stem) => {
              const ch = channels[stem.id] || {
                volume: 0,
                pan: 0,
                isMuted: false,
                isSolo: false,
                pitchSemi: 0,
                isMono: false,
                stereoWidth: 1.0,
              };

              const meter = meterLevels[stem.id] || 0;
              const theme = stemColors[stem.id] || stemColors['other'];

              return (
                <DawVerticalFader
                  key={stem.id}
                  stemId={stem.id}
                  name={stem.name}
                  channel={ch}
                  meterLevel={meter}
                  isPlaying={isPlaying}
                  isLoading={loadingAudio || !audioReady}
                  onUpdate={(updates) => stemAudioService.updateChannel(stem.id, updates)}
                  colorTheme={theme}
                  compact={false}
                />
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
