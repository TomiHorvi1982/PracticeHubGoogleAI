import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Repeat, Gauge, Save, Trash2, Music4, Timer, Search, Music2 } from 'lucide-react';
import { cviceniService, Cviceni, TypCviceni } from '../../services/cviceniService';
import { prehravacCviceni, StavCviceni } from '../../services/prehravacCviceni';
import { VyberZKnihovny } from '../songbook/VyberZKnihovny';
import { LibraryAsset } from '../../services/assetLibraryService';
import { odhadniTempoZUseku } from '../../services/detekceUderu';
import { TextovyTabPanel } from './TextovyTabPanel';

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
  /**
   * Přiblížení vlny.
   *
   * Na celé tříminutové nahrávce je jeden pražec širší než pixel a hranu
   * smyčky nejde trefit. Padesátinásobek znamená, že se na šířku vejdou
   * tři vteřiny — tam už se dá začátek riffu nastavit přesně.
   */
  const [zoom, setZoom] = useState(1);
  /** Začátek zobrazeného výřezu v sekundách. */
  const [oknoOd, setOknoOd] = useState(0);
  /** Co se zrovna táhne: hrana smyčky, nebo nový výběr. */
  const [tahne, setTahne] = useState<'od' | 'do' | 'novy' | null>(null);
  const [novyVyber, setNovyVyber] = useState<{ a: number; b: number } | null>(null);
  const [vybiram, setVybiram] = useState(false);
  const [tabText, setTabText] = useState('');
  const [nazev, setNazev] = useState('');
  const [asset, setAsset] = useState<LibraryAsset | null>(null);
  const [tempo, setTempo] = useState<number | null>(null);
  const platno = useRef<HTMLCanvasElement>(null);

  useEffect(() => cviceniService.subscribe((c) => setSeznam(c.filter((x) => x.typ === typ))), [typ]);
  useEffect(() => prehravacCviceni.subscribe(setStav), []);
  useEffect(() => () => prehravacCviceni.stop(), []);

  /** Šířka výřezu v sekundách a jeho konec. */
  const oknoDelka = stav.delka > 0 ? stav.delka / zoom : 0;
  const oknoDo = oknoOd + oknoDelka;
  /** Čas -> podíl na šířce plátna a zpátky. */
  const naPodil = (cas: number) => (oknoDelka > 0 ? (cas - oknoOd) / oknoDelka : 0);
  const naCas = (podil: number) => oknoOd + podil * oknoDelka;

  /** Posune výřez tak, aby byl daný čas uprostřed. */
  const ukazCas = (cas: number, zoomNa = zoom) => {
    if (stav.delka <= 0) return;
    const sirka = stav.delka / zoomNa;
    setOknoOd(Math.max(0, Math.min(Math.max(0, stav.delka - sirka), cas - sirka / 2)));
  };

  /**
   * Výřez sleduje smyčku.
   *
   * Když se smyčka do výřezu vejde, vystředí se. Když je delší — a při
   * padesátinásobku je skoro vždycky — ukáže se její začátek: obě hrany
   * naráz stejně vidět nejdou a začátek se posouvá první. Na druhou se
   * skočí tlačítkem, jinak by zůstala mimo obraz a nešla by chytit.
   */
  useEffect(() => {
    if (stav.delka <= 0) return;
    const sirka = stav.delka / zoom;
    const smycka = stav.do - stav.od;
    const cil = smycka > 0 && smycka <= sirka ? (stav.od + stav.do) / 2 : stav.od + sirka / 2;
    setOknoOd(Math.max(0, Math.min(Math.max(0, stav.delka - sirka), cil - sirka / 2)));
  }, [zoom, stav.delka]);

  // Vrcholky se počítají pro zobrazený výřez, ne pro celý soubor —
  // jinak by přiblížení jen roztáhlo tytéž sloupce.
  useEffect(() => {
    if (stav.delka <= 0) return;
    setVrcholky(prehravacCviceni.vrcholky(900, oknoOd, oknoDo));
  }, [oknoOd, oknoDo, stav.delka]);

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

    // Smyčka. Hrany jsou tlusté schválně — táhne se za ně myší.
    if (stav.delka > 0) {
      const vyber = novyVyber
        ? { od: Math.min(novyVyber.a, novyVyber.b), do: Math.max(novyVyber.a, novyVyber.b) }
        : { od: stav.od, do: stav.do };
      const od = naPodil(vyber.od) * w;
      const doo = naPodil(vyber.do) * w;

      ctx.fillStyle = 'rgba(255,159,10,0.15)';
      ctx.fillRect(od, 0, doo - od, h);
      ctx.strokeStyle = '#FF9F0A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(od, 0); ctx.lineTo(od, h);
      ctx.moveTo(doo, 0); ctx.lineTo(doo, h);
      ctx.stroke();

      // Úchyty, aby bylo vidět, že se za hrany dá vzít.
      ctx.fillStyle = '#FF9F0A';
      for (const x of [od, doo]) {
        ctx.fillRect(x - 4, 0, 8, 10);
        ctx.fillRect(x - 4, h - 10, 8, 10);
      }

      // Kde jsme
      const x = naPodil(stav.pozice) * w;
      if (x >= 0 && x <= w) {
        ctx.strokeStyle = '#30D158';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
        ctx.stroke();
      }
    }
  }, [vrcholky, stav.od, stav.do, stav.pozice, stav.delka, oknoOd, oknoDelka, novyVyber]);

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

  /** Čas pod myší. */
  const casPodMysi = (e: React.MouseEvent<HTMLCanvasElement>): number => {
    const r = e.currentTarget.getBoundingClientRect();
    return naCas(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  /**
   * Kterou hranu myš chytila.
   *
   * Pásmo se počítá v pixelech, ne v sekundách: při padesátinásobném
   * přiblížení odpovídá deset pixelů setinám vteřiny a v oddáleném
   * pohledu vteřinám — v obou případech jde o „trefil jsem čáru".
   */
  const hranaPodMysi = (e: React.MouseEvent<HTMLCanvasElement>): 'od' | 'do' | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const xOd = naPodil(stav.od) * r.width;
    const xDo = naPodil(stav.do) * r.width;
    if (Math.abs(x - xOd) <= 10) return 'od';
    if (Math.abs(x - xDo) <= 10) return 'do';
    return null;
  };

  const stiskVeVlne = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (stav.delka <= 0) return;
    const hrana = hranaPodMysi(e);
    if (hrana) {
      setTahne(hrana);
      return;
    }
    const cas = casPodMysi(e);
    setTahne('novy');
    setNovyVyber({ a: cas, b: cas });
  };

  const pohybVeVlne = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!tahne || stav.delka <= 0) return;
    const cas = casPodMysi(e);
    if (tahne === 'od') prehravacCviceni.nastavSmycku(Math.min(cas, stav.do - 0.2), stav.do);
    else if (tahne === 'do') prehravacCviceni.nastavSmycku(stav.od, Math.max(cas, stav.od + 0.2));
    else setNovyVyber((v) => (v ? { ...v, b: cas } : v));
  };

  const pusteniVeVlne = () => {
    if (tahne === 'novy' && novyVyber) {
      const a = Math.min(novyVyber.a, novyVyber.b);
      const b = Math.max(novyVyber.a, novyVyber.b);
      // Krátké tažení je kliknutí — to jen posune začátek, nezmenší smyčku
      // na nulu.
      if (b - a < 0.2) prehravacCviceni.nastavSmycku(a, stav.do > a ? stav.do : stav.delka);
      else prehravacCviceni.nastavSmycku(a, b);
    }
    setTahne(null);
    setNovyVyber(null);
  };

  /** Kolečko přibližuje k místu pod myší. */
  const koleckoVeVlne = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (stav.delka <= 0) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const podil = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const podKurzorem = naCas(podil);
    const novy = Math.max(1, Math.min(50, zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
    const sirka = stav.delka / novy;
    setZoom(novy);
    // Bod pod kurzorem zůstane na místě — jinak přiblížení uteče jinam.
    setOknoOd(Math.max(0, Math.min(stav.delka - sirka, podKurzorem - podil * sirka)));
  };

  return (
    <div className="space-y-4">
      {/* Cvičení z vloženého textového tabu.
          Nahoře, protože sem se chodí s tabem v schránce — hledat to
          pod uloženými riffy by znamenalo rolovat přes celou stránku. */}
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4">
        <TextovyTabPanel />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Uložené */}
        <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Music4 className="w-4 h-4 text-znacka" />
            {typ === 'riff' ? 'Moje riffy' : 'Moje sóla'}
            <span className="text-drobne text-neutral-500">({seznam.length})</span>
          </h3>

          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {seznam.map((c) => (
              <button
                key={c.id}
                onClick={() => void otevri(c)}
                className={`w-full text-left px-2.5 py-2 rounded-xl cursor-pointer group ${
                  vybrane?.id === c.id ? 'bg-znacka/15 border border-znacka/40' : 'bg-white/[0.03] hover:bg-white/[0.07]'
                }`}
              >
                <div className="text-xs font-semibold text-white truncate">{c.nazev}</div>
                <div className="text-stitek text-neutral-500">
                  {c.opakovani}× procvičeno
                  {c.bpm ? ` · ${c.bpm} BPM` : ''}
                  {c.posledniRychlost !== 1 ? ` · naposled ${Math.round(c.posledniRychlost * 100)} %` : ''}
                </div>
              </button>
            ))}
            {seznam.length === 0 && (
              <p className="text-drobne text-neutral-500 py-3">
                Zatím nic. Vyber zvuk z knihovny a ulož si první.
              </p>
            )}
          </div>

          <button
            onClick={() => setVybiram((v) => !v)}
            className="w-full text-drobne font-bold px-3 py-2 rounded-xl bg-white/[0.06] text-neutral-200 hover:text-white cursor-pointer"
          >
            {vybiram ? 'Zavřít knihovnu' : '+ Zvuk z knihovny'}
          </button>
        </div>

        {/* Přehrávač */}
        <div className="lg:col-span-3 space-y-3">
          {vybiram && (
            <div className="bg-[#16161A]/80 border border-znacka/30 rounded-2xl p-3">
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
            {stav.chyba && <p className="text-drobne text-chyba">{stav.chyba}</p>}
            {stav.nacita && <p className="text-drobne text-neutral-400">Načítám zvuk…</p>}

            {/* Vlna */}
            <canvas
              ref={platno}
              width={900}
              height={120}
              onMouseDown={stiskVeVlne}
              onMouseMove={pohybVeVlne}
              onMouseUp={pusteniVeVlne}
              onMouseLeave={pusteniVeVlne}
              onWheel={koleckoVeVlne}
              className={`w-full h-[120px] rounded-xl bg-black/40 ${
                tahne === 'od' || tahne === 'do' ? 'cursor-ew-resize' : 'cursor-crosshair'
              }`}
              title="Táhni za oranžové čáry hrany smyčky, jinde táhni pro nový výběr. Kolečkem přiblížíš."
            />

            {stav.delka > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-neutral-500" />
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={0.5}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-28 accent-info cursor-pointer"
                    title="Přiblížení vlny"
                  />
                  <span className="text-drobne font-mono text-info tabular-nums w-10">
                    {zoom.toFixed(0)}×
                  </span>
                </div>

                {/* Skok na hranu. Při velkém přiblížení je druhá hrana za
                    okrajem a bez tohohle by se k ní nedalo dostat. */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => ukazCas(stav.od)}
                    className="px-2 py-1 rounded-lg text-stitek font-semibold bg-white/[0.06] text-neutral-300 hover:text-white cursor-pointer"
                    title="Ukázat začátek smyčky"
                  >
                    ⟵ začátek
                  </button>
                  <button
                    onClick={() => ukazCas(stav.do)}
                    className="px-2 py-1 rounded-lg text-stitek font-semibold bg-white/[0.06] text-neutral-300 hover:text-white cursor-pointer"
                    title="Ukázat konec smyčky"
                  >
                    konec ⟶
                  </button>
                </div>

                <p className="text-stitek text-neutral-500">
                  Výřez {oknoOd.toFixed(2)}–{oknoDo.toFixed(2)} s · smyčka{' '}
                  {stav.od.toFixed(2)}–{stav.do.toFixed(2)} s ({(stav.do - stav.od).toFixed(2)} s)
                  {stav.kol > 0 && ` · ${stav.kol}. kolo`}
                </p>
              </div>
            )}

            {/* Ovládání */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => (stav.hraje ? prehravacCviceni.stop() : prehravacCviceni.prehraj())}
                disabled={stav.delka === 0}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-40 ${
                  stav.hraje ? 'bg-chyba text-white' : 'bg-white text-black'
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
                  className="w-28 accent-znacka cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-znacka w-12 tabular-nums">
                  {Math.round(stav.rychlost * 100)} %
                </span>
              </div>

              {/* Přeladění nahrávky na vlastní kytaru. */}
              <div className="flex items-center gap-2">
                <Music2 className="w-3.5 h-3.5 text-neutral-500" />
                <input
                  type="range" min={-12} max={12} step={1} value={stav.posun}
                  onChange={(e) => prehravacCviceni.nastavPosun(Number(e.target.value))}
                  className="w-28 accent-nastroj cursor-pointer"
                  title="Přeladit nahrávku o půltóny — ať nemusíš přelaďovat kytaru"
                />
                <span className="text-xs font-mono font-bold text-nastroj w-10 tabular-nums">
                  {stav.posun > 0 ? `+${stav.posun}` : stav.posun}
                </span>
                {stav.posun !== 0 && (
                  <button
                    onClick={() => prehravacCviceni.nastavPosun(0)}
                    className="text-stitek text-neutral-500 hover:text-white cursor-pointer"
                    title="Zpět na původní ladění"
                  >
                    ↺
                  </button>
                )}
              </div>

              <button
                onClick={() => prehravacCviceni.prepniDrzeniLadeni()}
                className={`px-2.5 py-1.5 text-drobne font-semibold rounded-xl border cursor-pointer ${
                  stav.drzetLadeni
                    ? 'bg-nastroj/15 border-nastroj/50 text-nastroj'
                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                }`}
                title="Při zpomalení držet původní výšku tónů. Vypnuto zní pomalejší nahrávka níž, jako na pásku."
              >
                Držet ladění
              </button>

              <div className="flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-drobne text-neutral-400">zrychlovat o</span>
                <input
                  type="number" min={0} max={20} value={stav.pridavat}
                  onChange={(e) => prehravacCviceni.nastavPridavani(Number(e.target.value))}
                  className="w-14 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-center"
                />
                <span className="text-drobne text-neutral-400">% za kolo</span>
              </div>

              <label className="flex items-center gap-1.5 text-drobne text-neutral-300 cursor-pointer">
                <input
                  type="checkbox" checked={stav.klik}
                  onChange={() => prehravacCviceni.prepniKlik()}
                  className="accent-znacka cursor-pointer"
                />
                Klik
              </label>

              <button
                onClick={() => {
                  const zvuk = prehravacCviceni.zvuk;
                  if (zvuk) setTempo(odhadniTempoZUseku(zvuk, stav.od, stav.do));
                }}
                disabled={stav.delka === 0}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] text-neutral-200 text-drobne font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
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
                className="px-3 py-2 rounded-xl bg-uspech text-black text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
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
                    className="p-2 rounded-xl text-neutral-600 hover:text-chyba cursor-pointer"
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
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-drobne font-mono leading-relaxed resize-y focus:outline-none focus:border-znacka"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
