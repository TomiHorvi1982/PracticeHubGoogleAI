import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Repeat, Gauge, Save, Trash2, Music4, Timer } from 'lucide-react';
import { cviceniService, Cviceni, TypCviceni } from '../../services/cviceniService';
import { prehravacCviceni, StavCviceni } from '../../services/prehravacCviceni';
import { VyberZKnihovny } from '../songbook/VyberZKnihovny';
import { LibraryAsset } from '../../services/assetLibraryService';
import { odhadniTempoZUseku } from '../../services/detekceUderu';

/**
 * Místnost na pilování riffů a sól.
 *
 * Rozdíl proti běžnému přehrávači je v tom, co se u cvičení dělá pořád:
 * vybrat pár vteřin, hrát je dokola, zpomalit a nechat tempo samo růst.
 * K tomu tabulatura před očima a klik, aby se to nerozjelo.
 */

export const RiffRoom: React.FC<{ typ: TypCviceni }> = ({ typ }) => {
  const [seznam, setSeznam] = useState<Cviceni[]>([]);
  const [vybrane, setVybrane] = useState<Cviceni | null>(null);
  const [stav, setStav] = useState<StavCviceni>(prehravacCviceni.subscribeStav());
  const [vrcholky, setVrcholky] = useState<number[]>([]);
  const [vybiram, setVybiram] = useState(false);
  const [tabText, setTabText] = useState('');
  const [nazev, setNazev] = useState('');
  const [asset, setAsset] = useState<LibraryAsset | null>(null);
  const [tempo, setTempo] = useState<number | null>(null);
  const platno = useRef<HTMLCanvasElement>(null);

  useEffect(() => cviceniService.subscribe((c) => setSeznam(c.filter((x) => x.typ === typ))), [typ]);
  useEffect(() => prehravacCviceni.subscribe(setStav), []);
  useEffect(() => () => prehravacCviceni.stop(), []);

  /** Překreslí vlnu i se smyčkou a ukazatelem. */
  useEffect(() => {
    const c = platno.current;
    if (!c || vrcholky.length === 0) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = c;
    ctx.clearRect(0, 0, w, h);

    // Vlna
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    vrcholky.forEach((v, i) => {
      const x = (i / vrcholky.length) * w;
      const vyska = Math.max(1, v * h * 0.92);
      ctx.fillRect(x, (h - vyska) / 2, Math.max(1, w / vrcholky.length - 0.5), vyska);
    });

    // Smyčka
    if (stav.delka > 0) {
      const od = (stav.od / stav.delka) * w;
      const doo = (stav.do / stav.delka) * w;
      ctx.fillStyle = 'rgba(255,159,10,0.15)';
      ctx.fillRect(od, 0, doo - od, h);
      ctx.strokeStyle = '#FF9F0A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(od, 0); ctx.lineTo(od, h);
      ctx.moveTo(doo, 0); ctx.lineTo(doo, h);
      ctx.stroke();

      // Kde jsme
      const x = (stav.pozice / stav.delka) * w;
      ctx.strokeStyle = '#30D158';
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.stroke();
    }
  }, [vrcholky, stav.od, stav.do, stav.pozice, stav.delka]);

  const nactiZvuk = async (assetId: string, c?: Cviceni) => {
    await prehravacCviceni.nacti(assetId);
    setVrcholky(prehravacCviceni.vrcholky(900));
    if (c?.do) prehravacCviceni.nastavSmycku(c.od, c.do);
    setTempo(null);
  };

  const otevri = async (c: Cviceni) => {
    setVybrane(c);
    setTabText(c.tab);
    setNazev(c.nazev);
    if (c.assetId) await nactiZvuk(c.assetId, c);
  };

  /** Klik do vlny nastaví začátek nebo konec smyčky. */
  const klikDoVlny = (e: React.MouseEvent<HTMLCanvasElement>, konec: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cas = ((e.clientX - r.left) / r.width) * stav.delka;
    if (konec) prehravacCviceni.nastavSmycku(stav.od, cas);
    else prehravacCviceni.nastavSmycku(cas, stav.do);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Uložené */}
        <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Music4 className="w-4 h-4 text-[#FF9F0A]" />
            {typ === 'riff' ? 'Moje riffy' : 'Moje sóla'}
            <span className="text-[11px] text-neutral-500">({seznam.length})</span>
          </h3>

          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {seznam.map((c) => (
              <button
                key={c.id}
                onClick={() => void otevri(c)}
                className={`w-full text-left px-2.5 py-2 rounded-xl cursor-pointer group ${
                  vybrane?.id === c.id ? 'bg-[#FF9F0A]/15 border border-[#FF9F0A]/40' : 'bg-white/[0.03] hover:bg-white/[0.07]'
                }`}
              >
                <div className="text-xs font-semibold text-white truncate">{c.nazev}</div>
                <div className="text-[10px] text-neutral-500">
                  {c.opakovani}× procvičeno
                  {c.bpm ? ` · ${c.bpm} BPM` : ''}
                  {c.posledniRychlost !== 1 ? ` · naposled ${Math.round(c.posledniRychlost * 100)} %` : ''}
                </div>
              </button>
            ))}
            {seznam.length === 0 && (
              <p className="text-[11px] text-neutral-500 py-3">
                Zatím nic. Vyber zvuk z knihovny a ulož si první.
              </p>
            )}
          </div>

          <button
            onClick={() => setVybiram((v) => !v)}
            className="w-full text-[11px] font-bold px-3 py-2 rounded-xl bg-white/[0.06] text-neutral-200 hover:text-white cursor-pointer"
          >
            {vybiram ? 'Zavřít knihovnu' : '+ Zvuk z knihovny'}
          </button>
        </div>

        {/* Přehrávač */}
        <div className="lg:col-span-3 space-y-3">
          {vybiram && (
            <div className="bg-[#16161A]/80 border border-[#FF9F0A]/30 rounded-2xl p-3">
              <VyberZKnihovny
                kategorie="stem_mix,recordings,samples,drum_loop,backing_tracks"
                prazdno="V knihovně zatím žádné nahrávky nejsou."
                cil="načíst"
                sNahledem
                nahled={(u) => <audio src={u} controls className="w-full h-8" />}
                onVybrat={(a) => {
                  setAsset(a);
                  setNazev(a.name.replace(/\.[^.]+$/, ''));
                  setVybrane(null);
                  setVybiram(false);
                  void nactiZvuk(a.id);
                }}
              />
            </div>
          )}

          <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3">
            {stav.chyba && <p className="text-[11px] text-[#FF453A]">{stav.chyba}</p>}
            {stav.nacita && <p className="text-[11px] text-neutral-400">Načítám zvuk…</p>}

            {/* Vlna */}
            <canvas
              ref={platno}
              width={900}
              height={120}
              onClick={(e) => klikDoVlny(e, false)}
              onContextMenu={(e) => { e.preventDefault(); klikDoVlny(e, true); }}
              className="w-full h-[120px] rounded-xl bg-black/40 cursor-crosshair"
              title="Klik nastaví začátek smyčky, pravý klik konec"
            />
            {stav.delka > 0 && (
              <p className="text-[10px] text-neutral-500">
                Klik = začátek smyčky, pravý klik = konec. Smyčka
                {' '}{stav.od.toFixed(1)}–{stav.do.toFixed(1)} s ({(stav.do - stav.od).toFixed(1)} s)
                {stav.kol > 0 && ` · ${stav.kol}. kolo`}
              </p>
            )}

            {/* Ovládání */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => (stav.hraje ? prehravacCviceni.stop() : prehravacCviceni.prehraj())}
                disabled={stav.delka === 0}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-40 ${
                  stav.hraje ? 'bg-[#FF453A] text-white' : 'bg-white text-black'
                }`}
              >
                {stav.hraje ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {stav.hraje ? 'Stop' : 'Hrát dokola'}
              </button>

              <div className="flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5 text-neutral-500" />
                <input
                  type="range" min={25} max={150} value={Math.round(stav.rychlost * 100)}
                  onChange={(e) => prehravacCviceni.nastavRychlost(Number(e.target.value) / 100)}
                  className="w-28 accent-[#FF9F0A] cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-[#FF9F0A] w-12 tabular-nums">
                  {Math.round(stav.rychlost * 100)} %
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-[11px] text-neutral-400">zrychlovat o</span>
                <input
                  type="number" min={0} max={20} value={stav.pridavat}
                  onChange={(e) => prehravacCviceni.nastavPridavani(Number(e.target.value))}
                  className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-center"
                />
                <span className="text-[11px] text-neutral-400">% za kolo</span>
              </div>

              <label className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer">
                <input
                  type="checkbox" checked={stav.klik}
                  onChange={() => prehravacCviceni.prepniKlik()}
                  className="accent-[#FF9F0A] cursor-pointer"
                />
                Klik
              </label>

              <button
                onClick={() => {
                  const zvuk = prehravacCviceni.zvuk;
                  if (zvuk) setTempo(odhadniTempoZUseku(zvuk, stav.od, stav.do));
                }}
                disabled={stav.delka === 0}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] text-neutral-200 text-[11px] font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                title="Spočítá tempo z vybraného úseku"
              >
                <Timer className="w-3.5 h-3.5" />
                {tempo ? `${tempo} BPM` : 'Zjistit tempo'}
              </button>
            </div>
          </div>

          {/* Tabulatura a uložení */}
          <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={nazev}
                onChange={(e) => setNazev(e.target.value)}
                placeholder="Název riffu"
                className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs"
              />
              <button
                onClick={async () => {
                  if (vybrane) {
                    await cviceniService.uprav(vybrane.id, {
                      nazev, tab: tabText, od: stav.od, do: stav.do,
                      bpm: tempo ?? vybrane.bpm,
                    });
                  } else if (asset) {
                    await cviceniService.uloz({
                      nazev: nazev || asset.name, typ, assetId: asset.id, tab: tabText,
                      od: stav.od, do: stav.do, bpm: tempo, tonina: null, poznamka: '',
                    });
                  }
                }}
                disabled={!nazev.trim() || (!vybrane && !asset)}
                className="px-3 py-2 rounded-xl bg-[#30D158] text-black text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" /> {vybrane ? 'Uložit změny' : 'Uložit'}
              </button>
              {vybrane && (
                <>
                  <button
                    onClick={() => void cviceniService.zapocitej(vybrane.id, stav.rychlost)}
                    className="px-3 py-2 rounded-xl bg-white/[0.06] text-neutral-200 text-xs font-bold cursor-pointer"
                    title="Zapíše, že jsi to zase procvičil"
                  >
                    Odcvičeno
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Smazat „${vybrane.nazev}"?`)) return;
                      await cviceniService.smaz(vybrane.id);
                      setVybrane(null);
                    }}
                    className="p-2 rounded-xl text-neutral-600 hover:text-[#FF453A] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            <textarea
              value={tabText}
              onChange={(e) => setTabText(e.target.value)}
              placeholder={"Tabulatura nebo akordy — uvidíš je při hraní.\ne|---------------|\nB|---------------|"}
              rows={8}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono leading-relaxed resize-y focus:outline-none focus:border-[#FF9F0A]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
