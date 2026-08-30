import React, { useEffect, useState } from 'react';
import { Play, Pause, Users, Music4, Plus, X, Wand2, Mic, Sparkles, Loader2, FileMusic } from 'lucide-react';
import { aiKapela, STYLY, StavKapely, Clen, Akord } from '../services/aiKapela';
import { spessaEngine, StavEngine } from '../services/spessaEngine';
import { aiSolista, StavSolisty } from '../services/aiSolista';
import { assetLibraryService } from '../services/assetLibraryService';
import { useMusicalContext } from '../context/MusicalContext';

/**
 * Zkušebna s virtuální kapelou.
 *
 * Kapela hraje podle akordů, ne podle nahrávky — dostane postup, tempo
 * a styl a zbytek si odvodí. Do toho si člověk hraje sám na svůj nástroj.
 */

const CLENOVE: { id: Clen; nazev: string; popis: string; barva: string }[] = [
  { id: 'bicí', nazev: 'Bubeník', popis: 'drží tempo a styl', barva: '#0A84FF' },
  { id: 'basa', nazev: 'Basák', popis: 'kořeny a průchody', barva: '#30D158' },
  { id: 'klavesy', nazev: 'Klávesák', popis: 'drží akordy', barva: '#BF5AF2' },
  { id: 'kytara', nazev: 'Rytmika', popis: 'rozklad akordů', barva: '#FF9F0A' },
];

export const AiKapelaSection: React.FC = () => {
  const [stav, setStav] = useState<StavKapely>(aiKapela.getStav());
  const [engine, setEngine] = useState<StavEngine>({
    pripraven: false, nacita: false, chyba: null, banka: null,
  });
  const [novyAkord, setNovyAkord] = useState('');
  const [solista, setSolista] = useState<StavSolisty>({
    stav: 'vypnuto', styl: '', chyba: null, kusu: 0, vterin: 0, drzeniAkordu: 2,
    posledniAkord: '', render: null,
  });
  const [kolRenderu, setKolRenderu] = useState(2);
  /** Hotové sólo, dokud si ho člověk neuloží nebo nepustí jiné. */
  const [hotoveSolo, setHotoveSolo] = useState<{ blob: Blob; url: string; vterin: number } | null>(null);
  const [uklada, setUklada] = useState(false);
  /** Čím se sólista popíše modelu. Slovy, ne notami — tak se ovládá. */
  const [stylSolisty, setStylSolisty] = useState(
    () => localStorage.getItem('neverlate_styl_solisty') || 'electric guitar solo over rock band',
  );
  useEffect(() => aiSolista.subscribe(setSolista), []);
  useEffect(() => () => aiSolista.stop(), []);
  const { key } = useMusicalContext();

  /**
   * Nechá vyrenderovat sólo přes celý postup.
   *
   * Kapela se zastaví: render bere tutéž službu a větší model, takže by
   * si vzájemně braly stroj a nedoběhlo by ani jedno.
   */
  const renderuj = async () => {
    aiKapela.stop();
    // Render jde přes tutéž službu, takže musí být spojení. Když sólista
    // neběží, připojí se kvůli renderu a po něm zase zmlkne.
    if (solista.stav !== 'hraje') {
      await aiSolista.start(stylSolisty);
      await new Promise((r) => window.setTimeout(r, 400));
    }
    if (hotoveSolo) URL.revokeObjectURL(hotoveSolo.url);
    setHotoveSolo(null);
    try {
      const takty = aiKapela.taktyProRender(kolRenderu);
      const blob = await aiSolista.vyrenderuj(stylSolisty, stav.bpm, 4, takty);
      const url = URL.createObjectURL(blob);
      // Délka z velikosti: 16 bitů, dva kanály, 48 kHz.
      const vterin = (blob.size - 44) / 2 / 2 / 48000;
      setHotoveSolo({ blob, url, vterin });
    } catch {
      /* chyba se ukáže ze stavu sólisty */
    }
  };

  const ulozSolo = async () => {
    if (!hotoveSolo) return;
    setUklada(true);
    try {
      const nazev = `AI sólo — ${stav.styl} ${stav.bpm} BPM ${new Date()
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ')}.wav`;
      const soubor = new File([hotoveSolo.blob], nazev, { type: 'audio/wav' });
      await assetLibraryService.upload(soubor, 'recordings', 'recording', 'global');
      URL.revokeObjectURL(hotoveSolo.url);
      setHotoveSolo(null);
    } finally {
      setUklada(false);
    }
  };

  useEffect(() => aiKapela.subscribe(setStav), []);
  useEffect(() => spessaEngine.subscribe(setEngine), []);
  // Kapela nesmí hrát dál po odchodu ze sekce.
  useEffect(() => () => aiKapela.stop(), []);

  const styl = STYLY.find((s) => s.id === stav.styl) || STYLY[0];

  return (
    <div className="space-y-4 font-sans text-white pb-12">
      {/* Hlavička */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="p-3 bg-[#BF5AF2]/10 border border-[#BF5AF2]/30 text-[#BF5AF2] rounded-2xl">
            <Users className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-[240px]">
            <span className="bg-[#BF5AF2] text-white font-bold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
              Jam Room
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
              AI Band — zkušebna, která na tebe počká
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Nastav akordy, tempo a styl. Kapela hraje pořád dokola, ty si k tomu hraj
              na svůj nástroj — a kdo zrovna nemá čas, toho vypneš.
            </p>
          </div>

          <button
            onClick={() => aiKapela.prepni()}
            disabled={engine.nacita}
            className={`px-5 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 ${
              stav.hraje ? 'bg-[#FF453A] text-white' : 'bg-white text-black hover:bg-neutral-200'
            }`}
          >
            {stav.hraje ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {stav.hraje ? 'Zastavit kapelu' : 'Spustit kapelu'}
          </button>
        </div>

        {engine.nacita && (
          <p className="text-[11px] text-[#FF9F0A] mt-3">Stahuji zvukovou banku (40 MB)…</p>
        )}
        {(engine.chyba || stav.chyba) && (
          <p className="text-[11px] text-[#FF453A] mt-3">{engine.chyba || stav.chyba}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Akordy */}
        <div className="lg:col-span-2 bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Music4 className="w-4 h-4 text-[#BF5AF2]" />
            <h3 className="text-sm font-bold text-white">Akordy dokola</h3>
            <span className="text-[11px] text-neutral-500">
              každý akord jeden takt — klikni pro odebrání
            </span>
            <button
              onClick={() => {
                const molovy = /m$/i.test(key || '');
                aiKapela.postupZToniny((key || 'C').replace(/m$/i, ''), !molovy);
              }}
              className="ml-auto text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.06] text-neutral-300 hover:text-white cursor-pointer flex items-center gap-1.5"
              title="Poskládá postup z tóniny nastavené v horní liště"
            >
              <Wand2 className="w-3.5 h-3.5" /> Z tóniny {key || 'C'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {stav.postup.map((a, i) => (
              <button
                key={`${a.nazev}-${i}`}
                onClick={() => aiKapela.nastavPostup(stav.postup.filter((_, j) => j !== i))}
                className={`px-3.5 py-2 rounded-xl font-bold text-sm cursor-pointer transition-all flex items-center gap-1.5 ${
                  stav.hraje && stav.akordIndex === i
                    ? 'bg-[#BF5AF2] text-white scale-105'
                    : 'bg-white/[0.06] text-neutral-200 hover:bg-white/[0.12]'
                }`}
              >
                {a.nazev}
                <X className="w-3 h-3 opacity-50" />
              </button>
            ))}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const n = novyAkord.trim();
                if (!n) return;
                aiKapela.nastavPostup([...stav.postup, { nazev: n, taktu: 1 } as Akord]);
                setNovyAkord('');
              }}
              className="flex items-center gap-1"
            >
              <input
                value={novyAkord}
                onChange={(e) => setNovyAkord(e.target.value)}
                placeholder="Am7, F, G…"
                className="w-28 bg-black/40 border border-white/10 rounded-xl px-2.5 py-2 text-sm focus:outline-none focus:border-[#BF5AF2]"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-white/[0.06] text-neutral-300 hover:text-white cursor-pointer"
                title="Přidat akord"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Kde v taktu jsme */}
          <div className="flex gap-1 pt-1">
            {Array.from({ length: 16 }, (_, k) => (
              <div
                key={k}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  stav.hraje && stav.krok === k
                    ? 'bg-[#BF5AF2]'
                    : k % 4 === 0
                    ? 'bg-white/20'
                    : 'bg-white/[0.06]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Tempo a styl */}
        <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Tempo</span>
              <span className="text-sm font-mono font-bold text-[#BF5AF2] tabular-nums">
                {stav.bpm} BPM
              </span>
            </div>
            <input
              type="range"
              min={40}
              max={220}
              value={stav.bpm}
              onChange={(e) => aiKapela.nastavBpm(Number(e.target.value))}
              className="w-full accent-[#BF5AF2] cursor-pointer"
            />
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">Styl</span>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {STYLY.map((s) => (
                <button
                  key={s.id}
                  onClick={() => aiKapela.nastavStyl(s.id)}
                  className={`px-2.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    stav.styl === s.id
                      ? 'bg-[#BF5AF2] text-white'
                      : 'bg-white/[0.05] text-neutral-400 hover:text-white'
                  }`}
                >
                  {s.nazev}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500 mt-2">{styl.popis}</p>
          </div>
        </div>
      </div>

      {/* Členové */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {CLENOVE.map((c) => {
          const hraje = stav.clenove[c.id];
          return (
            <div
              key={c.id}
              className={`rounded-2xl border p-4 transition-all ${
                hraje ? 'bg-[#16161A]/80 border-white/[0.10]' : 'bg-black/30 border-white/[0.05] opacity-60'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: hraje ? c.barva : '#3a3a3c' }}
                />
                <span className="text-sm font-bold text-white flex-1">{c.nazev}</span>
                <button
                  onClick={() => aiKapela.prepniClena(c.id)}
                  className={`text-[10px] px-2 py-1 rounded-lg font-bold cursor-pointer ${
                    hraje ? 'bg-white/[0.08] text-neutral-300' : 'bg-[#FF453A]/20 text-[#FF453A]'
                  }`}
                >
                  {hraje ? 'hraje' : 'mlčí'}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 mb-2">{c.popis}</p>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(stav.hlasitosti[c.id] * 100)}
                onChange={(e) => aiKapela.nastavHlasitost(c.id, Number(e.target.value) / 100)}
                disabled={!hraje}
                className="w-full accent-[#BF5AF2] cursor-pointer disabled:opacity-40"
              />
            </div>
          );
        })}
      </div>

      {/* AI sólista.
          Běží mimo prohlížeč, protože model potřebuje Apple Silicon.
          Když služba neběží, řekne se to a kapela hraje dál bez něj. */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#FF375F]" />
          <h3 className="text-sm font-bold text-white">AI sólista</h3>
          <span className="text-[11px] text-neutral-500">
            Magenta RealTime — běží na tomhle Macu, ne v prohlížeči
          </span>
          <span
            className={`ml-auto text-[10px] font-bold px-2 py-1 rounded-lg ${
              solista.stav === 'hraje'
                ? 'bg-[#30D158]/20 text-[#30D158]'
                : solista.stav === 'chyba'
                ? 'bg-[#FF453A]/20 text-[#FF453A]'
                : 'bg-white/[0.06] text-neutral-400'
            }`}
          >
            {solista.stav === 'hraje'
              ? `hraje · ${Math.round(solista.vterin)} s`
              : solista.stav === 'pripojuji'
              ? 'připojuji…'
              : solista.stav === 'chyba'
              ? 'nedostupný'
              : 'vypnutý'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={stylSolisty}
            onChange={(e) => {
              setStylSolisty(e.target.value);
              localStorage.setItem('neverlate_styl_solisty', e.target.value);
            }}
            onBlur={() => solista.stav === 'hraje' && aiSolista.zmenStyl(stylSolisty)}
            placeholder="anglicky, třeba „bluesy slide guitar, slow"
            className="flex-1 min-w-[220px] bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#FF375F]"
          />
          <button
            onClick={() =>
              solista.stav === 'hraje' || solista.stav === 'pripojuji'
                ? aiSolista.stop()
                : void aiSolista.start(stylSolisty)
            }
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
              solista.stav === 'hraje' ? 'bg-[#FF453A] text-white' : 'bg-[#FF375F] text-white hover:bg-[#FF375F]/85'
            }`}
          >
            {solista.stav === 'pripojuji' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {solista.stav === 'hraje' ? 'Zastavit sólistu' : 'Pustit sólistu'}
          </button>
        </div>

        {/*
          Render mimo reálný čas.
          Živě hraje malý model, protože větší nestíhá. Když se na sólo
          počká, může ho zahrát ten větší — a harmonii dostane přesně na
          takt, ne dopředu na blok, který zrovna počítá.
        */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
          <FileMusic className="w-3.5 h-3.5 text-[#BF5AF2]" />
          <span className="text-[11px] text-neutral-400 flex-1 min-w-[180px]">
            Nechat sólo vyrenderovat větším modelem — zní líp, ale musíš počkat.
          </span>

          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            kol
            <input
              type="number" min={1} max={16} value={kolRenderu}
              onChange={(e) => setKolRenderu(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
              className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white outline-none"
            />
          </label>

          <button
            onClick={() => void renderuj()}
            disabled={!!solista.render}
            className="px-3 py-1.5 rounded-xl bg-[#BF5AF2] text-white text-[11px] font-bold cursor-pointer disabled:opacity-30 flex items-center gap-1.5"
            title="Vyrenderovat sólo přes celý postup větším modelem"
          >
            {solista.render ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileMusic className="w-3.5 h-3.5" />}
            {solista.render
              ? `Renderuju ${solista.render.hotovo}/${solista.render.celkem} taktů`
              : 'Vyrenderovat sólo'}
          </button>
        </div>

        {solista.render && (
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#BF5AF2] transition-[width] duration-300"
              style={{ width: `${(solista.render.hotovo / Math.max(1, solista.render.celkem)) * 100}%` }}
            />
          </div>
        )}

        {hotoveSolo && (
          <div className="flex flex-wrap items-center gap-2 bg-[#BF5AF2]/10 border border-[#BF5AF2]/30 rounded-xl px-3 py-2">
            <span className="text-[11px] text-white flex-1">
              Sólo hotové — {hotoveSolo.vterin.toFixed(1)} s
            </span>
            <audio src={hotoveSolo.url} controls className="h-8 max-w-[240px]" />
            <button
              onClick={() => void ulozSolo()}
              disabled={uklada}
              className="px-2.5 py-1.5 rounded-lg bg-[#30D158] text-black text-[11px] font-bold cursor-pointer disabled:opacity-40"
            >
              {uklada ? 'Ukládám…' : 'Do knihovny'}
            </button>
            <a
              href={hotoveSolo.url}
              download={`ai-solo-${Date.now()}.wav`}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-neutral-300 text-[11px] font-bold cursor-pointer"
            >
              Stáhnout
            </a>
          </div>
        )}

        {solista.chyba && (
          <div className="text-[11px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/25 rounded-xl px-3 py-2">
            {solista.chyba}
            <div className="text-neutral-400 mt-1">
              Poprvé to stáhne váhy modelu — pár gigabajtů, jednorázově.
            </div>
          </div>
        )}

        {/* Jak silně sólistu tlačit do našich akordů.
            Model umí přijmout klavírní roli, takže nemusí jen „hrát ve
            stylu" — může hrát do harmonie, kterou drží kapela. */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500 shrink-0">
            Držet se akordů
          </span>
          <input
            type="range"
            min={0}
            max={8}
            step={0.5}
            value={solista.drzeniAkordu}
            onChange={(e) => aiSolista.nastavDrzeniAkordu(Number(e.target.value))}
            className="flex-1 min-w-[160px] accent-[#FF375F] cursor-pointer"
          />
          <span className="text-xs font-mono font-bold text-[#FF375F] tabular-nums w-8">
            {solista.drzeniAkordu}
          </span>
          {solista.posledniAkord && (
            <span className="text-[11px] text-neutral-400">
              posláno: <strong className="text-white">{solista.posledniAkord}</strong>
            </span>
          )}
        </div>

        <p className="text-[11px] text-neutral-500">
          Styl se popisuje slovy, ne notami — model rozumí anglicky. Změna se projeví
          za pochodu. Posuvník říká, jak moc se má držet akordů kapely: na nule si hraje
          po svém, výš jde do harmonie.
        </p>
      </div>

      <div className="bg-[#16161A]/50 border border-white/[0.06] rounded-2xl px-4 py-3 flex items-start gap-2.5">
        <Mic className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-neutral-400 leading-relaxed">
          Kapela zní přes tutéž zvukovou banku jako MIDI přehrávač a tabulatury. Hraj si k ní na
          cokoli — a v Hmatníku pod záložkou <strong className="text-neutral-300">Poslech kytary</strong> uvidíš, co
          hraješ, i s akordy, které do té tóniny patří.
        </p>
      </div>
    </div>
  );
};
