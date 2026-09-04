import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, Download, ExternalLink, Heart, Loader2, LogOut, Search, Star,
} from 'lucide-react';
import {
  GEARY, Gear, ModelT3K, Razeni, Strankovane, Ton, Uzivatel,
  jmenoTvurce, tone3000, typModelu,
} from '../../services/tone3000Api';
import { kytaraVMixu } from '../../services/kytaraVMixu';
import { platnyNamModel } from '../../services/namModel';
import { authorizedFetch } from '../../services/assetLibraryService';

/**
 * Katalog TONE3000 vedle kytarového faderu.
 *
 * Jde přes oficiální API: přihlášení přes OAuth s PKCE, pak vlastní
 * procházení. Vybraný soubor jde rovnou do kytarového kanálu — aparát
 * do NAM, bedna do konvoluce — a zároveň se odloží na disk, aby se
 * příště obešel i bez přihlášení.
 *
 * Rozvržení drží doporučení TONE3000 pro integrace: než se uživatel
 * přihlásí, uvidí, s kým to spolupracuje; u každého tónu je vidět tvůrce,
 * typ techniky i formát; a je odsud pořád cesta do celého katalogu.
 */

type Zalozka = 'objevit' | 'oblibene' | 'stazene' | 'vytvorene';

const ZALOZKY: { id: Zalozka; nazev: string }[] = [
  { id: 'objevit', nazev: 'Objevit' },
  { id: 'oblibene', nazev: 'Oblíbené' },
  { id: 'stazene', nazev: 'Stažené' },
  { id: 'vytvorene', nazev: 'Moje' },
];

const RAZENI: { id: Razeni; nazev: string }[] = [
  { id: 'trending', nazev: 'Teď populární' },
  { id: 'downloads-all-time', nazev: 'Nejstahovanější' },
  { id: 'newest', nazev: 'Nejnovější' },
];

/** Tisíce se čtou líp než holé číslo. */
const pocet = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10} tis.` : String(n));

const nazevGearu = (g: Gear) => GEARY.find((x) => x.id === g)?.nazev || g;

export const Tone3000Katalog: React.FC = () => {
  const [prihlasen, setPrihlasen] = useState(tone3000.prihlasen());
  const [ja, setJa] = useState<Uzivatel | null>(null);
  const [zalozka, setZalozka] = useState<Zalozka>('objevit');
  const [dotaz, setDotaz] = useState('');
  const [razeni, setRazeni] = useState<Razeni>('trending');
  const [tony, setTony] = useState<Ton[]>([]);
  const [nacita, setNacita] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [otevreny, setOtevreny] = useState<number | null>(null);
  const [modely, setModely] = useState<ModelT3K[]>([]);
  const [nacitaModely, setNacitaModely] = useState(false);
  const [pracuje, setPracuje] = useState<number | null>(null);
  const [hotovo, setHotovo] = useState<Record<number, string>>({});

  useEffect(() => tone3000.subscribe(() => setPrihlasen(tone3000.prihlasen())), []);

  /** Načte seznam podle zvolené záložky. */
  const nacti = useCallback(async (z: Zalozka, q: string, r: Razeni) => {
    if (!tone3000.prihlasen()) return;
    setNacita(true);
    setChyba(null);
    setOtevreny(null);
    try {
      let d: Strankovane<Ton> | { data: Ton[] };
      if (z === 'oblibene') d = await tone3000.oblibene();
      else if (z === 'stazene') d = await tone3000.stazene();
      else if (z === 'vytvorene') d = await tone3000.vytvorene();
      else if (q.trim()) d = await tone3000.hledej({ query: q.trim(), sort: 'best-match' });
      else if (r === 'newest') d = await tone3000.nejnovejsi();
      else if (r === 'trending') d = await tone3000.trending();
      else d = await tone3000.hledej({ sort: r });
      setTony(d.data || []);
    } catch (e: any) {
      setChyba(e?.message || 'Katalog se nepodařilo načíst.');
      setTony([]);
    } finally {
      setNacita(false);
    }
  }, []);

  useEffect(() => {
    if (!prihlasen) { setTony([]); setJa(null); return; }
    tone3000.ja().then(setJa).catch(() => setJa(null));
    void nacti(zalozka, dotaz, razeni);
    // Dotaz se posílá až odesláním formuláře, ať se nehledá na každé písmeno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prihlasen, zalozka, razeni, nacti]);

  const prihlas = async (vyber?: boolean) => {
    setChyba(null);
    const r = await tone3000.prihlas(vyber ? 'select_tone' : undefined);
    if (!r.ok) { setChyba(r.chyba || 'Přihlášení se nepovedlo.'); return; }
    // Z výběru se uživatel vrací s konkrétním tónem — rovnou ho otevřeme.
    if (r.toneId) { setZalozka('objevit'); await otevri(r.toneId); }
  };

  const otevri = async (id: number) => {
    if (otevreny === id) { setOtevreny(null); return; }
    setOtevreny(id);
    setModely([]);
    setNacitaModely(true);
    setChyba(null);
    try {
      const d = await tone3000.modely(id);
      setModely(d.data || []);
      // Tón vybraný přes Select nemusí být v načteném seznamu.
      if (!tony.some((t) => t.id === id)) {
        try { setTony([await tone3000.ton(id)]); } catch { /* seznam zůstane */ }
      }
    } catch (e: any) {
      setChyba(e?.message || 'Soubory se nepodařilo načíst.');
    } finally {
      setNacitaModely(false);
    }
  };

  /**
   * Soubor na fader.
   *
   * Nejdřív do zvuku, pak na disk. Kdyby ukládání selhalo (appka běží na
   * serveru, kde disk není), hraje to dál — jen se to příště stáhne znovu.
   */
  const naFader = async (t: Ton, m: ModelT3K) => {
    setPracuje(m.id);
    setChyba(null);
    try {
      const typ = typModelu(m);
      const data = await tone3000.stahni(m.model_url);
      const jmeno = `${t.title} — ${m.name}`;

      if (typ === 'nam') {
        const json = new TextDecoder().decode(data);
        const kontrola = platnyNamModel(json);
        if (!kontrola.platny) {
          throw new Error(`Tohle není platný NAM model. ${kontrola.duvod || ''}`.trim());
        }
        if (!await kytaraVMixu.nactiModel(json, jmeno)) {
          throw new Error('Model se nepodařilo načíst do aparátu.');
        }
      } else if (!await kytaraVMixu.nactiBednu(data, jmeno)) {
        throw new Error('Impuls se nepodařilo načíst do bedny.');
      }

      let ulozeno = false;
      try {
        const r = await authorizedFetch(
          `/api/tone3000/ulozit?typ=${typ}&id=${m.id}&nazev=${encodeURIComponent(jmeno)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: data,
          },
        );
        ulozeno = r.ok;
      } catch { /* na disk to nešlo, ve zvuku to je */ }

      setHotovo((h) => ({
        ...h,
        [m.id]: ulozeno ? 'na faderu, uloženo' : 'na faderu',
      }));
    } catch (e: any) {
      setChyba(e?.message || 'Soubor se nepodařilo použít.');
    } finally {
      setPracuje(null);
    }
  };

  const prepniOblibu = async (t: Ton) => {
    try {
      await tone3000.oblib(t.id, !t.is_favorite);
      setTony((s) => s.map((x) => (x.id === t.id ? { ...x, is_favorite: !x.is_favorite } : x)));
    } catch (e: any) {
      setChyba(e?.message || 'Oblíbené se nepodařilo změnit.');
    }
  };

  const hlavicka = (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-kresba-jemna">
      <Star className="w-4 h-4 text-znacka shrink-0" />
      <span className="text-drobne text-pismo font-medium">TONE3000</span>
      <span className="text-stitek text-pismo-slaby truncate">NAM aparáty a IR bedny</span>
      <div className="flex-1" />
      {ja && (
        <span className="flex items-center gap-1.5 text-stitek text-pismo-tlum min-w-0">
          {ja.avatar_url
            ? <img src={ja.avatar_url} alt="" className="w-5 h-5 rounded-full shrink-0" />
            : <span className="w-5 h-5 rounded-full bg-plocha-3 shrink-0" />}
          <span className="truncate max-w-24">{jmenoTvurce(ja)}</span>
        </span>
      )}
      {prihlasen && (
        <button
          onClick={() => tone3000.odhlas()}
          title="Odhlásit z TONE3000"
          className="p-1 rounded-prvek text-pismo-slaby hover:text-pismo hover:bg-plocha-3 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  /* Než se uživatel přihlásí, ať ví, kam ho posíláme a proč. */
  if (!tone3000.nastaveno()) {
    return (
      <div className="rounded-panel border border-kresba bg-plocha-1 overflow-hidden">
        {hlavicka}
        <p className="text-drobne text-pismo-tlum px-3 py-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-pozor" />
          <span>
            Chybí klíč k TONE3000. Založ si aplikaci v jejich nastavení a publishable
            key (<code className="text-pismo">t3k_pub_…</code>) dej do <code className="text-pismo">.env</code> jako
            {' '}<code className="text-pismo">VITE_TONE3000_CLIENT_ID</code>. Jako návratovou adresu
            tam zadej <code className="text-pismo">{window.location.origin}/tone3000-callback.html</code>.
          </span>
        </p>
      </div>
    );
  }

  if (!prihlasen) {
    return (
      <div className="rounded-panel border border-kresba bg-plocha-1 overflow-hidden">
        {hlavicka}
        <div className="px-3 py-4 space-y-3">
          <p className="text-drobne text-pismo-tlum">
            NeverLate Studio je propojený s TONE3000 — knihovnou nasnímaných aparátů
            (Neural Amp Modeler) a impulzů beden ze skutečné techniky, kterou plní
            muzikanti z celého světa.
          </p>
          {chyba && (
            <p className="text-drobne text-chyba flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{chyba}
            </p>
          )}
          <button
            onClick={() => void prihlas()}
            className="w-full text-drobne px-3 py-2 rounded-prvek bg-znacka/15 border border-znacka-okraj text-znacka hover:bg-znacka/25 transition-colors cursor-pointer"
          >
            Pokračovat
          </button>
          <p className="text-stitek text-pismo-slaby">
            Otevře se okno TONE3000, kde se přihlásíš. Heslo ani e-mail sem nezadáváš.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-kresba bg-plocha-1 overflow-hidden flex flex-col">
      {hlavicka}

      <div className="flex items-center gap-1 px-2 pt-2">
        {ZALOZKY.map((z) => (
          <button
            key={z.id}
            onClick={() => setZalozka(z.id)}
            className={`text-stitek px-2 py-1 rounded-prvek transition-colors cursor-pointer ${
              zalozka === z.id
                ? 'bg-plocha-3 text-pismo'
                : 'text-pismo-slaby hover:text-pismo-tlum hover:bg-plocha-2'
            }`}
          >
            {z.nazev}
          </button>
        ))}
      </div>

      {zalozka === 'objevit' && (
        <form
          onSubmit={(e) => { e.preventDefault(); void nacti('objevit', dotaz, razeni); }}
          className="flex gap-1.5 px-2 py-2"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-pismo-slaby" />
            <input
              value={dotaz}
              onChange={(e) => setDotaz(e.target.value)}
              placeholder="Marshall, Mesa, V30…"
              className="w-full bg-vhloubeni border border-kresba rounded-prvek pl-7 pr-2 py-1.5 text-stitek text-pismo placeholder:text-pismo-slaby focus:outline-none focus:border-znacka-okraj"
            />
          </div>
          <select
            value={razeni}
            onChange={(e) => setRazeni(e.target.value as Razeni)}
            className="bg-vhloubeni border border-kresba rounded-prvek px-1.5 text-stitek text-pismo focus:outline-none focus:border-znacka-okraj"
          >
            {RAZENI.map((r) => <option key={r.id} value={r.id}>{r.nazev}</option>)}
          </select>
        </form>
      )}

      {chyba && (
        <p className="mx-2 mb-2 text-stitek text-chyba bg-chyba/10 border border-chyba/30 rounded-prvek px-2 py-1.5 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{chyba}
        </p>
      )}

      <div className="px-2 pb-2 space-y-1 overflow-y-auto max-h-[28rem]">
        {nacita && (
          <p className="text-stitek text-pismo-tlum flex items-center gap-1.5 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />Načítám…
          </p>
        )}
        {!nacita && !tony.length && !chyba && (
          <p className="text-stitek text-pismo-slaby py-2">
            {zalozka === 'objevit' ? 'Nic takového se nenašlo.' : 'Zatím tu nic nemáš.'}
          </p>
        )}

        {tony.map((t) => (
          <div key={t.id} className="rounded-prvek border border-kresba-jemna bg-plocha-2 overflow-hidden">
            <div className="flex items-stretch">
              <button
                onClick={() => void otevri(t.id)}
                className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left hover:bg-plocha-3 transition-colors cursor-pointer"
              >
                {t.images?.[0]
                  ? <img src={t.images[0]} alt="" className="w-9 h-9 rounded-prvek object-cover shrink-0" />
                  : <span className="w-9 h-9 rounded-prvek bg-plocha-3 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-stitek text-pismo truncate">{t.title}</span>
                  <span className="block text-stitek text-pismo-slaby truncate">
                    {nazevGearu(t.gear)} · {t.format.toUpperCase()} · @{jmenoTvurce(t.user)}
                  </span>
                </span>
                <span className="text-stitek text-pismo-slaby shrink-0 tabular-nums">
                  ↓ {pocet(t.downloads_count)}
                </span>
              </button>
              <button
                onClick={() => void prepniOblibu(t)}
                title={t.is_favorite ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
                className="px-2 text-pismo-slaby hover:bg-plocha-3 transition-colors cursor-pointer"
              >
                <Heart className={`w-3.5 h-3.5 ${t.is_favorite ? 'fill-chyba text-chyba' : ''}`} />
              </button>
            </div>

            {otevreny === t.id && (
              <div className="px-2 pb-2 pt-1 border-t border-kresba-jemna space-y-1">
                {nacitaModely && (
                  <p className="text-stitek text-pismo-slaby flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />Načítám soubory…
                  </p>
                )}
                {!nacitaModely && !modely.length && (
                  <p className="text-stitek text-pismo-slaby">Žádné soubory ke stažení.</p>
                )}
                {modely.map((m) => {
                  const typ = typModelu(m);
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className={`text-stitek shrink-0 border rounded-md px-1.5 py-0.5 ${
                        typ === 'nam'
                          ? 'text-znacka border-znacka-okraj bg-znacka/10'
                          : 'text-nastroj border-nastroj/30 bg-nastroj/10'
                      }`}>
                        {typ === 'nam' ? 'aparát' : 'bedna'}
                      </span>
                      <span className="text-stitek text-pismo-tlum truncate flex-1">{m.name}</span>
                      {hotovo[m.id] ? (
                        <span className="text-stitek text-uspech flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3" />{hotovo[m.id]}
                        </span>
                      ) : (
                        <button
                          onClick={() => void naFader(t, m)}
                          disabled={pracuje === m.id}
                          className="text-stitek px-2 py-1 rounded-prvek border border-kresba text-pismo-tlum hover:text-pismo hover:bg-plocha-3 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0"
                        >
                          {pracuje === m.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Download className="w-3 h-3" />}
                          Na fader
                        </button>
                      )}
                    </div>
                  );
                })}
                <a
                  href={t.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-stitek text-pismo-slaby hover:text-pismo-tlum inline-flex items-center gap-1 pt-0.5"
                >
                  <ExternalLink className="w-3 h-3" />Otevřít na TONE3000
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Cesta do celého katalogu má být pořád po ruce. */}
      <button
        onClick={() => void prihlas(true)}
        className="text-stitek px-3 py-2 border-t border-kresba-jemna text-pismo-tlum hover:text-pismo hover:bg-plocha-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
      >
        <ExternalLink className="w-3 h-3" />Procházet celý katalog TONE3000
      </button>
    </div>
  );
};
