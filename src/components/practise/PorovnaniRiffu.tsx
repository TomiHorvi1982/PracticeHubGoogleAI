import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2, AlertCircle, Star, Trash2, Play, Save } from 'lucide-react';
import { authService } from '../../services/authService';
import { porovnejNahravky, Hodnoceni } from '../../services/porovnaniHry';
import { riffyService, Riff, nejlepsiPokus } from '../../services/riffyService';

/**
 * Porovnání vlastní hry s předlohou a katalog riffů.
 *
 * Předlohou má být **oddělená kytarová stopa**, ne celý mix: proti mixu
 * by se měřila hlavně shoda s bicími, které mají v úderech i ve spektru
 * navrch. Panel proto nabízí stopy z knihovny a říká to nahlas.
 */

interface Polozka { id: string; name: string; category: string }

const cas = (v: number) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;

/** Slovní hodnocení. Číslo samo o sobě nikomu nic neřekne. */
function slovy(h: Hodnoceni): { text: string; barva: string } {
  if (h.tony < 0.5) return { text: 'Tóny zatím nesedí — zkontroluj hmaty.', barva: 'text-[#FF453A]' };
  if (h.tony < 0.8) return { text: 'Tóny většinou sedí, ale ne všude.', barva: 'text-amber-400' };
  if (h.rozptylMs > 80) return { text: 'Tóny sedí, časování skáče.', barva: 'text-amber-400' };
  if (h.rozptylMs > 40) return { text: 'Dobré. Časování ještě trochu plave.', barva: 'text-[#30D158]' };
  return { text: 'Sedí to — tóny i časování.', barva: 'text-[#30D158]' };
}

export const PorovnaniRiffu: React.FC = () => {
  const [stopy, setStopy] = useState<Polozka[]>([]);
  const [predloha, setPredloha] = useState('');
  const [od, setOd] = useState(0);
  const [doo, setDoo] = useState(8);
  const [nazev, setNazev] = useState('');

  const [nahravam, setNahravam] = useState(false);
  const [pocitam, setPocitam] = useState(false);
  const [vysledek, setVysledek] = useState<Hodnoceni | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  const [katalog, setKatalog] = useState<Riff[]>([]);
  const [ulozenyRiff, setUlozenyRiff] = useState<string | null>(null);

  const ctx = useRef<AudioContext | null>(null);
  const nahravac = useRef<MediaRecorder | null>(null);
  const kousky = useRef<Blob[]>([]);

  const hlavicky = () => {
    const t = authService.getCurrentSession()?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  };

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/assets?category=stem_mix,recordings,my_songs&limit=100', { headers: hlavicky() });
        const d = await r.json();
        setStopy((d.assets || []).filter((a: any) => /audio|mpeg|wav/.test(a.mime_type || '')));
      } catch { /* bez seznamu se dá předloha vybrat později */ }
    })();
    void riffyService.nacti().then(setKatalog);
    return () => { ctx.current?.close().catch(() => {}); };
  }, []);

  const kontext = () => {
    if (!ctx.current) ctx.current = new AudioContext();
    return ctx.current;
  };

  /** Načte výsek předlohy jako holý signál. */
  const vzorkyPredlohy = async (): Promise<Float32Array> => {
    const r = await fetch(`/api/assets/${predloha}/content`, { headers: hlavicky() });
    if (!r.ok) throw new Error('Předlohu se nepodařilo načíst.');
    const buf = await kontext().decodeAudioData(await r.arrayBuffer());
    const kanal = buf.getChannelData(0);
    const a = Math.max(0, Math.floor(od * buf.sampleRate));
    const b = Math.min(kanal.length, Math.floor(doo * buf.sampleRate));
    if (b - a < buf.sampleRate * 0.5) throw new Error('Výsek předlohy je moc krátký.');
    return kanal.slice(a, b);
  };

  const zacniNahravat = async () => {
    setChyba(null);
    setVysledek(null);
    try {
      const proud = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(proud);
      kousky.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) kousky.current.push(e.data); };
      rec.onstop = () => {
        for (const s of proud.getTracks()) s.stop();
        void porovnej();
      };
      nahravac.current = rec;
      rec.start();
      setNahravam(true);
    } catch (e: any) {
      setChyba(e?.message || 'Mikrofon se nepodařilo zapnout.');
    }
  };

  const zastavNahravani = () => {
    nahravac.current?.stop();
    nahravac.current = null;
    setNahravam(false);
  };

  const porovnej = async () => {
    setPocitam(true);
    setChyba(null);
    try {
      const zvuk = new Blob(kousky.current, { type: kousky.current[0]?.type || 'audio/webm' });
      const moje = (await kontext().decodeAudioData(await zvuk.arrayBuffer())).getChannelData(0);
      const ref = await vzorkyPredlohy();
      // Oba signály prošly týmž kontextem, takže mají stejnou vzorkovací
      // frekvenci a není co přepočítávat.
      const h = porovnejNahravky(moje, ref, kontext().sampleRate);
      if (!h.snimku) throw new Error('Nahrávka je moc krátká na porovnání.');
      setVysledek(h);
      if (ulozenyRiff) {
        await riffyService.ulozPokus(ulozenyRiff, h);
        setKatalog(await riffyService.nacti());
      }
    } catch (e: any) {
      setChyba(e?.message || 'Porovnání selhalo.');
    } finally {
      setPocitam(false);
    }
  };

  const ulozDoKatalogu = async () => {
    setChyba(null);
    try {
      const r = await riffyService.uloz({
        nazev: nazev || stopy.find((s) => s.id === predloha)?.name || 'Riff',
        assetId: predloha || null,
        odVteriny: od,
        doVteriny: doo,
      });
      setUlozenyRiff(r.id);
      if (vysledek) await riffyService.ulozPokus(r.id, vysledek);
      setKatalog(await riffyService.nacti());
    } catch (e: any) {
      setChyba(e?.message || 'Uložit se to nepodařilo.');
    }
  };

  const slovni = vysledek ? slovy(vysledek) : null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
          <Star className="w-4 h-4 text-[#FF9F0A]" /> Porovnání s předlohou
        </h3>
        <p className="text-[11px] text-neutral-500 leading-relaxed mt-0.5">
          Jako předlohu ber <strong className="text-neutral-300">oddělenou kytarovou stopu</strong>, ne
          celý mix — proti mixu se měří hlavně shoda s bicími.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select
          value={predloha}
          onChange={(e) => setPredloha(e.target.value)}
          className="sm:col-span-2 bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none focus:border-[#FF9F0A] cursor-pointer"
        >
          <option value="">— vyber předlohu —</option>
          {stopy.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Od</span>
          <input
            type="number" min={0} step={0.5} value={od}
            onChange={(e) => setOd(Math.max(0, Number(e.target.value)))}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">Do</span>
          <input
            type="number" min={0} step={0.5} value={doo}
            onChange={(e) => setDoo(Number(e.target.value))}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-xs text-white outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => (nahravam ? zastavNahravani() : void zacniNahravat())}
          disabled={!predloha || pocitam}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 ${
            nahravam ? 'bg-[#FF453A] text-white' : 'bg-[#FF9F0A] text-black hover:bg-[#ffb03a]'
          }`}
        >
          {pocitam ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : nahravam ? <Square className="w-3.5 h-3.5" />
            : <Mic className="w-3.5 h-3.5" />}
          {pocitam ? 'Porovnávám…' : nahravam ? 'Hotovo, porovnat' : 'Nahrát pokus'}
        </button>

        <input
          value={nazev}
          onChange={(e) => setNazev(e.target.value)}
          placeholder="název riffu"
          className="flex-1 min-w-[140px] bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none"
        />

        <button
          onClick={() => void ulozDoKatalogu()}
          disabled={!predloha || doo <= od}
          className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] border border-white/10 text-neutral-300 hover:text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" /> Do katalogu
        </button>
      </div>

      {chyba && (
        <p className="text-[11px] text-[#FF453A] flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {chyba}
        </p>
      )}

      {vysledek && slovni && (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-3 space-y-2">
          <div className={`text-sm font-bold ${slovni.barva}`}>{slovni.text}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-widest">Tóny</div>
              <div className="text-white font-bold tabular-nums">{Math.round(vysledek.tony * 100)} %</div>
            </div>
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-widest">Rozptyl</div>
              <div className="text-white font-bold tabular-nums">{Math.round(vysledek.rozptylMs)} ms</div>
            </div>
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-widest">Celkově</div>
              <div className="text-white font-bold tabular-nums">
                {vysledek.stredniPosunMs > 0 ? 'pozadu' : 'napřed'} {Math.abs(Math.round(vysledek.stredniPosunMs))} ms
              </div>
            </div>
            <div>
              <div className="text-neutral-500 text-[10px] uppercase tracking-widest">Nejhorší místo</div>
              <div className="text-white font-bold tabular-nums">
                {vysledek.nejhorsiCas.toFixed(1)} s
              </div>
            </div>
          </div>
          <p className="text-[10px] text-neutral-500 leading-relaxed">
            Celkový posun je jen tím, kdy jsi spustil nahrávání — na hru nemá vliv. Rozhoduje
            rozptyl: o kolik kolísáš uvnitř úseku.
          </p>
        </div>
      )}

      {/* Katalog */}
      {katalog.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">
            Moje riffy ({katalog.length})
          </div>
          {katalog.map((r) => {
            const nej = nejlepsiPokus(r.pokusy);
            return (
              <div key={r.id} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <button
                  onClick={() => {
                    setPredloha(r.assetId || '');
                    setOd(r.odVteriny);
                    setDoo(r.doVteriny);
                    setUlozenyRiff(r.id);
                    setVysledek(null);
                  }}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                  title="Načíst k procvičení"
                >
                  <div className="text-[12px] text-white truncate">{r.nazev}</div>
                  <div className="text-[10px] text-neutral-500 truncate">
                    {cas(r.odVteriny)}–{cas(r.doVteriny)}
                    {nej
                      ? ` · nejlíp ${Math.round(nej.tony * 100)} % / ${Math.round(nej.rozptylMs)} ms · ${r.pokusy.length}× zkoušeno`
                      : ' · zatím nezkoušeno'}
                  </div>
                </button>
                {ulozenyRiff === r.id && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#FF9F0A]/20 text-[#FF9F0A] shrink-0">
                    cvičí se
                  </span>
                )}
                <button
                  onClick={async () => {
                    await riffyService.smaz(r.id);
                    if (ulozenyRiff === r.id) setUlozenyRiff(null);
                    setKatalog(await riffyService.nacti());
                  }}
                  className="p-1.5 rounded-lg text-neutral-600 hover:text-[#FF453A] cursor-pointer shrink-0"
                  title="Smazat riff"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
