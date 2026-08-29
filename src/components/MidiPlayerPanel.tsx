import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, Square, Music4, Volume2, VolumeX, Loader2,
  ZoomIn, ZoomOut, ChevronDown, ChevronRight, Search, Trash2, Undo2, Star,
} from 'lucide-react';
import { midiPlayerService, MidiSongState, MidiNote } from '../services/midiPlayerService';
import { assetLibraryService, LibraryAsset } from '../services/assetLibraryService';
import { authService } from '../services/authService';
import { spessaEngine, StavEngine } from '../services/spessaEngine';
import { audioSynth, INSTRUMENT_PROFILES, InstrumentProfile, midiToNoteName } from '../services/audioSynth';

/**
 * MIDI přehrávač uspořádaný jako stopová aplikace: vlevo hlavičky stop,
 * vpravo jedna společná časová osa. Všechno v jednom rámu, aby se nedalo
 * ztratit, která nota patří které stopě a kde se zrovna hraje.
 *
 * Osa i stopy sdílejí jeden vodorovný posuv — jinak by se při posunutí
 * rozešly a pravítko by ukazovalo jinam než noty.
 */

const CERNE = new Set([1, 3, 6, 8, 10]);
const VYSKA_STOPY = 44;
const VYSKA_RADKU_ROLL = 11;
const SIRKA_HLAVICEK = 190;
const KLIC_OBLIBENYCH = 'neverlate_midi_oblibene';

function formatCas(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Složka, ze které soubor pochází — slouží k seskupení sbírky. */
function slozkaAssetu(a: LibraryAsset): string {
  const legacy = String((a.metadata as any)?.legacy_id || '');
  const casti = legacy.replace(/^sync:/, '').split('/');
  casti.pop();
  return casti.length ? casti[casti.length - 1] : 'Ostatní';
}

export const MidiPlayerPanel: React.FC = () => {
  const [stav, setStav] = useState<MidiSongState>(midiPlayerService.getState());
  const [soubory, setSoubory] = useState<LibraryAsset[]>([]);
  const [celkem, setCelkem] = useState(0);
  const [nacitam, setNacitam] = useState(false);
  const [hledat, setHledat] = useState('');
  const [knihovnaOtevrena, setKnihovnaOtevrena] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [vybranaStopa, setVybranaStopa] = useState(0);
  const [hlasitost, setHlasitost] = useState(() => audioSynth.getMasterVolume());

  /**
   * Sbalené skupiny a oblíbené soubory. Oblíbené drží prohlížeč — je to
   * volba jednoho člověka na jednom stroji, ne data kapely, a ukládat kvůli
   * hvězdičce řádek do databáze by bylo víc práce než užitku.
   */
  const [sbalene, setSbalene] = useState<Set<string>>(new Set());
  /**
   * Všechny složky sbírky i s počty.
   *
   * Sbírka má přes šestnáct tisíc souborů. Stahovat je všechny jen proto,
   * aby šlo listovat složkami, by znamenalo čekat na desítky megabajtů;
   * počty tedy sečte databáze a obsah složky se dotáhne, až když ji
   * někdo rozbalí.
   */
  const [slozky, setSlozky] = useState<{ nazev: string; pocet: number }[]>([]);
  /** Obsah rozbalených složek — klíč je název složky. */
  const [obsahSlozek, setObsahSlozek] = useState<Record<string, LibraryAsset[]>>({});
  const [nacitaneSlozky, setNacitaneSlozky] = useState<Set<string>>(new Set());
  const [oblibene, setOblibene] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(KLIC_OBLIBENYCH) || '[]'));
    } catch {
      return new Set();
    }
  });
  const [jenOblibene, setJenOblibene] = useState(false);

  const prepniOblibeny = (id: string) => {
    setOblibene((prev) => {
      const novy = new Set(prev);
      novy.has(id) ? novy.delete(id) : novy.add(id);
      try {
        localStorage.setItem(KLIC_OBLIBENYCH, JSON.stringify([...novy]));
      } catch {
        /* plné úložiště nesmí shodit výběr */
      }
      return novy;
    });
  };
  const [pxZaSekundu, setPxZaSekundu] = useState(40);
  const osaRef = useRef<HTMLDivElement>(null);

  useEffect(() => midiPlayerService.subscribe(setStav), []);

  /**
   * Stav zvukové banky.
   *
   * Banka má čtyřicet megabajtů a stahuje se až při prvním přehrání.
   * Bez téhle hlášky vypadá čekání jako záseknutí a člověk mačká
   * přehrát podruhé.
   */
  const [engine, setEngine] = useState<StavEngine>({
    pripraven: false, nacita: false, chyba: null, banka: null,
  });
  useEffect(() => spessaEngine.subscribe(setEngine), []);

  const nacti = async (dotaz: string) => {
    setNacitam(true);
    setChyba(null);
    try {
      const { assets, total } = await assetLibraryService.listPage({
        category: 'midi',
        search: dotaz.trim() || undefined,
        limit: 120,
        sort: 'name',
      });
      setSoubory(assets);
      setCelkem(total);
    } catch (e: any) {
      setChyba(e?.message || 'Knihovnu se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => nacti(hledat), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hledat]);

  useEffect(() => {
    const token = authService.getCurrentSession()?.token;
    if (!token) return;
    void fetch('/api/midi/slozky', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.slozky) setSlozky(d.slozky); })
      .catch(() => { /* seznam složek je pohodlí, ne podmínka */ });
  }, []);

  /** Dotáhne obsah složky. Volá se až při rozbalení. */
  const nactiSlozku = async (nazev: string) => {
    if (obsahSlozek[nazev] || nacitaneSlozky.has(nazev)) return;
    setNacitaneSlozky((p) => new Set(p).add(nazev));
    try {
      const { assets } = await assetLibraryService.listPage({
        category: 'midi',
        slozka: nazev,
        limit: 500,
        sort: 'name',
      });
      setObsahSlozek((p) => ({ ...p, [nazev]: assets }));
    } catch {
      setObsahSlozek((p) => ({ ...p, [nazev]: [] }));
    } finally {
      setNacitaneSlozky((p) => { const n = new Set(p); n.delete(nazev); return n; });
    }
  };

  /** Soubory seskupené podle složky, obojí seřazené podle názvu. */
  /**
   * Co se ukazuje jako složky.
   *
   * Bez hledání celá sbírka — všech sto sedmdesát pět složek, sbalených,
   * s počty z databáze. Jakmile se hledá, ukazují se jen nalezené soubory:
   * seznam všech složek by na dotaz neodpovídal.
   */
  const vseSbaleno = !hledat.trim() && !jenOblibene;

  const skupiny = useMemo(() => {
    const zdroj = jenOblibene ? soubory.filter((a) => oblibene.has(a.id)) : soubory;
    const m = new Map<string, LibraryAsset[]>();
    for (const a of zdroj) {
      const k = slozkaAssetu(a);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    const serazene = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'cs'));

    // Oblíbené se ukazují navrch jako vlastní skupina — jinak by se
    // hvězdička hledala napříč stovkami složek, což je k ničemu.
    const hvezdicky = zdroj.filter((a) => oblibene.has(a.id));
    return hvezdicky.length && !jenOblibene
      ? ([['★ Oblíbené', hvezdicky], ...serazene] as [string, LibraryAsset[]][])
      : serazene;
  }, [soubory, oblibene, jenOblibene]);

  const stopa = stav.tracks[vybranaStopa];
  const sirkaOsy = Math.max(700, stav.duration * pxZaSekundu);

  /** Rozsah tónů vybrané stopy — v editoru se ukazuje jen ten použitý. */
  const rozsah = useMemo(() => {
    if (!stopa || stopa.notes.length === 0) return { min: 48, max: 72 };
    const c = stopa.notes.map((n) => n.midi);
    return { min: Math.max(0, Math.min(...c) - 1), max: Math.min(127, Math.max(...c) + 1) };
  }, [stopa]);
  const radkuRoll = rozsah.max - rozsah.min + 1;

  // Přehrávací čára se drží v obraze, i když skladba uteče za okraj.
  useEffect(() => {
    if (!stav.isPlaying || !osaRef.current) return;
    const x = stav.position * pxZaSekundu;
    const el = osaRef.current;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 80) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
    }
  }, [stav.position, stav.isPlaying, pxZaSekundu]);

  const klikDoOsy = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!osaRef.current) return;
    const box = osaRef.current.getBoundingClientRect();
    midiPlayerService.seek((e.clientX - box.left + osaRef.current.scrollLeft) / pxZaSekundu);
  };

  // --- EDITOR NOT --------------------------------------------------------
  //
  // Nota se dá chytit a přetáhnout, natáhnout za pravý okraj, označit víc
  // naráz a každý krok jde vrátit. Držení stavu je v ref, ne ve stavu
  // komponenty — během tažení se překresluje na každý pohyb myši a
  // setState by z toho udělal trhaný pohyb.

  const [vybrane, setVybrane] = useState<Set<number>>(new Set());
  const [ramecek, setRamecek] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [tahAktivni, setTahAktivni] = useState<'posun' | 'delka' | 'vyber' | null>(null);
  const historieRef = useRef<MidiNote[][]>([]);
  const [krokuZpet, setKrokuZpet] = useState(0);
  const rollRef = useRef<HTMLDivElement>(null);

  const tahRef = useRef<{
    druh: 'posun' | 'delka' | 'vyber';
    startX: number;
    startY: number;
    puvodni: MidiNote[];
    indexy: number[];
    pohnuto: boolean;
  } | null>(null);

  // Přepnutí stopy nebo souboru zahazuje historii — vracet krok zpět do
  // noty, která patřila jiné skladbě, by nadělalo víc škody než užitku.
  useEffect(() => {
    historieRef.current = [];
    setKrokuZpet(0);
    setVybrane(new Set());
  }, [vybranaStopa, stav.asset?.id]);

  const zapisNoty = (nove: MidiNote[], zaznamenat = true) => {
    if (!stopa) return;
    if (zaznamenat) {
      historieRef.current.push(stopa.notes.map((n) => ({ ...n })));
      if (historieRef.current.length > 60) historieRef.current.shift();
      setKrokuZpet(historieRef.current.length);
    }
    midiPlayerService.setTrackNotes(stopa.index, nove);
  };

  const zpet = () => {
    if (!stopa) return;
    const predchozi = historieRef.current.pop();
    if (!predchozi) return;
    setKrokuZpet(historieRef.current.length);
    setVybrane(new Set());
    midiPlayerService.setTrackNotes(stopa.index, predchozi);
  };

  const smazVybrane = () => {
    if (!stopa || vybrane.size === 0) return;
    zapisNoty(stopa.notes.filter((_, i) => !vybrane.has(i)));
    setVybrane(new Set());
  };

  /** Souřadnice myši převedené na čas a výšku tónu. */
  const zMysi = (e: { clientX: number; clientY: number }) => {
    const box = rollRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      cas: Math.max(0, (e.clientX - box.left) / pxZaSekundu),
      midi: rozsah.max - Math.floor((e.clientY - box.top) / VYSKA_RADKU_ROLL),
    };
  };

  const startNaNote = (e: React.MouseEvent, k: number, druh: 'posun' | 'delka') => {
    e.stopPropagation();
    if (!stopa) return;

    // Shift přidává do výběru, klik bez něj na neoznačenou notu výběr
    // nahradí. Kliknutí do už označené skupiny výběr nechává, aby se dalo
    // přetáhnout několik not naráz.
    let novy = new Set(vybrane);
    if (e.shiftKey) {
      novy.has(k) ? novy.delete(k) : novy.add(k);
    } else if (!novy.has(k)) {
      novy = new Set([k]);
    }
    setVybrane(novy);

    tahRef.current = {
      druh,
      startX: e.clientX,
      startY: e.clientY,
      puvodni: stopa.notes.map((n) => ({ ...n })),
      indexy: [...novy],
      pohnuto: false,
    };
    setTahAktivni(druh);
  };

  const startNaPlose = (e: React.MouseEvent) => {
    if (!stopa) return;
    const m = zMysi(e);
    if (!m) return;
    tahRef.current = {
      druh: 'vyber',
      startX: e.clientX,
      startY: e.clientY,
      puvodni: stopa.notes.map((n) => ({ ...n })),
      indexy: [],
      pohnuto: false,
    };
    setTahAktivni('vyber');
    setRamecek({ x: m.x, y: m.y, w: 0, h: 0 });
  };

  useEffect(() => {
    if (!tahAktivni || !stopa) return;

    const pohyb = (e: MouseEvent) => {
      const t = tahRef.current;
      if (!t) return;
      const dx = e.clientX - t.startX;
      const dy = e.clientY - t.startY;
      // Pár pixelů je ještě klik, ne tažení — jinak by se nedalo notu
      // označit, aniž by se nepatrně posunula.
      if (!t.pohnuto && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      t.pohnuto = true;

      if (t.druh === 'vyber') {
        const box = rollRef.current?.getBoundingClientRect();
        if (!box) return;
        const x0 = t.startX - box.left;
        const y0 = t.startY - box.top;
        setRamecek({ x: Math.min(x0, x0 + dx), y: Math.min(y0, y0 + dy), w: Math.abs(dx), h: Math.abs(dy) });
        return;
      }

      const dtCas = dx / pxZaSekundu;
      const dMidi = -Math.round(dy / VYSKA_RADKU_ROLL);
      const nove = t.puvodni.map((n, i) => {
        if (!t.indexy.includes(i)) return n;
        if (t.druh === 'delka') {
          // Nota nesmí zmizet do nuly, jinak by se pak nedala chytit zpět.
          return { ...n, duration: Math.max(0.05, n.duration + dtCas) };
        }
        return {
          ...n,
          time: Math.max(0, n.time + dtCas),
          midi: Math.max(0, Math.min(127, n.midi + dMidi)),
        };
      });
      midiPlayerService.setTrackNotes(stopa.index, nove);
    };

    const konec = (e: MouseEvent) => {
      const t = tahRef.current;
      tahRef.current = null;
      setTahAktivni(null);
      setRamecek(null);
      if (!t) return;

      if (t.druh === 'vyber') {
        const box = rollRef.current?.getBoundingClientRect();
        if (!box) return;
        if (!t.pohnuto) {
          // Klik do prázdna přidá notu — a zruší výběr, aby další tažení
          // nechytlo omylem něco z minula.
          const m = zMysi(e);
          if (m && m.midi >= 0 && m.midi <= 127) {
            zapisNoty([...t.puvodni, { midi: m.midi, time: m.cas, duration: 0.5, velocity: 0.8 }]);
          }
          setVybrane(new Set());
          return;
        }
        const x1 = Math.min(t.startX, e.clientX) - box.left;
        const x2 = Math.max(t.startX, e.clientX) - box.left;
        const y1 = Math.min(t.startY, e.clientY) - box.top;
        const y2 = Math.max(t.startY, e.clientY) - box.top;
        const chycene = new Set<number>();
        t.puvodni.forEach((n, i) => {
          const nx1 = n.time * pxZaSekundu;
          const nx2 = nx1 + n.duration * pxZaSekundu;
          const ny1 = (rozsah.max - n.midi) * VYSKA_RADKU_ROLL;
          const ny2 = ny1 + VYSKA_RADKU_ROLL;
          if (nx2 >= x1 && nx1 <= x2 && ny2 >= y1 && ny1 <= y2) chycene.add(i);
        });
        setVybrane(chycene);
        return;
      }

      // Posun i změna délky se do historie zapíšou až tady, jedním
      // záznamem za celé tažení. Kdyby se zapisovaly při každém pohybu
      // myši, jeden tah by spolykal celou historii.
      if (t.pohnuto) {
        historieRef.current.push(t.puvodni);
        if (historieRef.current.length > 60) historieRef.current.shift();
        setKrokuZpet(historieRef.current.length);
      }
    };

    window.addEventListener('mousemove', pohyb);
    window.addEventListener('mouseup', konec);
    return () => {
      window.removeEventListener('mousemove', pohyb);
      window.removeEventListener('mouseup', konec);
    };
  }, [tahAktivni, stopa, pxZaSekundu, rozsah.max]);

  // Klávesy editoru. Nechytají se, když člověk píše do pole hledání.
  useEffect(() => {
    const naKlavesu = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        zpet();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (vybrane.size === 0) return;
        e.preventDefault();
        smazVybrane();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && stopa) {
        e.preventDefault();
        setVybrane(new Set(stopa.notes.map((_, i) => i)));
      } else if (e.key === 'Escape') {
        setVybrane(new Set());
      }
    };
    window.addEventListener('keydown', naKlavesu);
    return () => window.removeEventListener('keydown', naKlavesu);
  });

  // Značky na pravítku po rozumném kroku, ať nejsou natěsno ani řídce.
  const krok = pxZaSekundu >= 80 ? 1 : pxZaSekundu >= 30 ? 5 : 15;
  const znacky = Array.from({ length: Math.ceil(stav.duration / krok) + 1 }, (_, i) => i * krok);

  return (
    <div className="bg-[#16161A]/90 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
      {/* Knihovna */}
      <div className="border-b border-white/10">
        <button
          onClick={() => setKnihovnaOtevrena((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left cursor-pointer hover:bg-white/[0.03]"
        >
          {knihovnaOtevrena ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
          <Music4 className="w-4 h-4 text-[#FF9F0A]" />
          <span className="text-xs font-black text-white">Knihovna MIDI</span>
          {celkem > 0 && (
            <span className="text-[11px] text-neutral-500">
              ({celkem.toLocaleString('cs')}
              {slozky.length ? ` v ${slozky.length} složkách` : ''})
            </span>
          )}
          {stav.asset && (
            <span className="ml-auto text-[11px] font-bold text-[#FF9F0A] truncate max-w-[45%]">{stav.asset.name}</span>
          )}
        </button>

        {knihovnaOtevrena && (
          <div className="px-4 pb-3 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={hledat}
                onChange={(e) => setHledat(e.target.value)}
                placeholder="Hledat skladatele, název…"
                className="w-full bg-black/50 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-white/10 outline-none focus:border-[#FF9F0A] placeholder:text-neutral-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setJenOblibene((v) => !v)}
                disabled={oblibene.size === 0}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  jenOblibene
                    ? 'bg-[#FF9F0A]/20 border-[#FF9F0A] text-[#FF9F0A]'
                    : 'bg-black/40 border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                <Star className={`w-3 h-3 ${jenOblibene ? 'fill-[#FF9F0A]' : ''}`} />
                Jen oblíbené{oblibene.size > 0 ? ` (${oblibene.size})` : ''}
              </button>
              <button
                onClick={() =>
                  setSbalene((prev) =>
                    prev.size
                      ? new Set()
                      : new Set(vseSbaleno ? slozky.map((s) => s.nazev) : skupiny.map(([k]) => k)),
                  )
                }
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-white/10 bg-black/40 text-neutral-400 hover:text-white transition-all cursor-pointer"
              >
                {sbalene.size ? 'Rozbalit vše' : 'Sbalit vše'}
              </button>
            </div>

            {chyba ? (
              <div className="text-[11px] text-[#FF453A]">{chyba}</div>
            ) : (
              <div className="max-h-72 overflow-auto space-y-2 pr-1">
                {nacitam && <div className="text-[11px] text-neutral-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Načítám…</div>}
                {!nacitam && soubory.length === 0 && !vseSbaleno && (
                  <div className="text-[11px] text-neutral-500">Nic nenalezeno.</div>
                )}
                {vseSbaleno && slozky.length > 0 && !nacitam &&
                  slozky.map(({ nazev, pocet }) => {
                    // Sbalená je výchozí stav: sto sedmdesát pět rozbalených
                    // složek by byl seznam, ve kterém se nedá nic najít.
                    const otevrena = sbalene.has(nazev);
                    const polozky = obsahSlozek[nazev] || [];
                    return (
                      <div key={nazev}>
                        <button
                          onClick={() => {
                            setSbalene((prev) => {
                              const novy = new Set(prev);
                              if (novy.has(nazev)) novy.delete(nazev);
                              else { novy.add(nazev); void nactiSlozku(nazev); }
                              return novy;
                            });
                          }}
                          className="w-full flex items-center gap-1 mb-1 text-left cursor-pointer group"
                        >
                          {otevrena ? (
                            <ChevronDown className="w-3 h-3 text-neutral-500 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-neutral-500 shrink-0" />
                          )}
                          <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300 truncate">
                            {nazev}
                          </span>
                          <span className="text-[10px] text-neutral-600 shrink-0">({pocet})</span>
                          {nacitaneSlozky.has(nazev) && (
                            <Loader2 className="w-3 h-3 animate-spin text-neutral-600 shrink-0" />
                          )}
                        </button>

                        {otevrena && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {polozky.map((a) => (
                              <div
                                key={`${nazev}:${a.id}`}
                                className={`flex items-center rounded-lg border transition-all ${
                                  stav.asset?.id === a.id
                                    ? 'bg-[#FF9F0A]/20 border-[#FF9F0A]'
                                    : 'bg-black/40 border-white/10 hover:border-white/30'
                                }`}
                              >
                                <button
                                  onClick={() => { midiPlayerService.loadFromLibrary(a); setVybranaStopa(0); }}
                                  className={`pl-2.5 pr-1.5 py-1 text-[11px] font-medium cursor-pointer ${
                                    stav.asset?.id === a.id ? 'text-white' : 'text-neutral-300'
                                  }`}
                                  title={a.name}
                                >
                                  {a.name.replace(/\.midi?$/i, '').slice(0, 40)}
                                </button>
                                <button
                                  onClick={() => prepniOblibeny(a.id)}
                                  className="pr-1.5 py-1 cursor-pointer"
                                  title={oblibene.has(a.id) ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
                                >
                                  <Star
                                    className={`w-3 h-3 transition-colors ${
                                      oblibene.has(a.id)
                                        ? 'text-[#FF9F0A] fill-[#FF9F0A]'
                                        : 'text-neutral-600 hover:text-neutral-300'
                                    }`}
                                  />
                                </button>
                              </div>
                            ))}
                            {!polozky.length && !nacitaneSlozky.has(nazev) && (
                              <span className="text-[10px] text-neutral-600">Prázdná složka.</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                {!vseSbaleno && skupiny.map(([slozka, polozky]) => {
                  const zavrena = sbalene.has(slozka);
                  return (
                    <div key={slozka}>
                      <button
                        onClick={() =>
                          setSbalene((prev) => {
                            const novy = new Set(prev);
                            novy.has(slozka) ? novy.delete(slozka) : novy.add(slozka);
                            return novy;
                          })
                        }
                        className="w-full flex items-center gap-1 mb-1 text-left cursor-pointer group"
                      >
                        {zavrena ? (
                          <ChevronRight className="w-3 h-3 text-neutral-500 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-neutral-500 shrink-0" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300 truncate">
                          {slozka}
                        </span>
                        <span className="text-[10px] text-neutral-600 shrink-0">({polozky.length})</span>
                      </button>

                      {!zavrena && (
                        <div className="flex flex-wrap gap-1.5">
                          {polozky.map((a) => {
                            const jeOblibeny = oblibene.has(a.id);
                            return (
                              <div
                                key={`${slozka}:${a.id}`}
                                className={`flex items-center rounded-lg border transition-all ${
                                  stav.asset?.id === a.id
                                    ? 'bg-[#FF9F0A]/20 border-[#FF9F0A]'
                                    : 'bg-black/40 border-white/10 hover:border-white/30'
                                }`}
                              >
                                <button
                                  onClick={() => { midiPlayerService.loadFromLibrary(a); setVybranaStopa(0); }}
                                  className={`pl-2.5 pr-1.5 py-1 text-[11px] font-medium cursor-pointer ${
                                    stav.asset?.id === a.id ? 'text-white' : 'text-neutral-300'
                                  }`}
                                  title={a.name}
                                >
                                  {a.name.replace(/\.midi?$/i, '').slice(0, 40)}
                                </button>
                                <button
                                  onClick={() => prepniOblibeny(a.id)}
                                  className="pr-1.5 py-1 cursor-pointer"
                                  title={jeOblibeny ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
                                >
                                  <Star
                                    className={`w-3 h-3 transition-colors ${
                                      jeOblibeny
                                        ? 'text-[#FF9F0A] fill-[#FF9F0A]'
                                        : 'text-neutral-600 hover:text-neutral-300'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {celkem > soubory.length && (
                  <div className="text-[11px] text-neutral-500 pt-1">
                    Zobrazeno {soubory.length} z {celkem} — zbytek najdete hledáním.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {stav.loading && (
        <div className="flex items-center gap-2 text-sm text-neutral-400 px-4 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Načítám soubor…
        </div>
      )}
      {stav.error && <div className="px-4 py-3 text-xs text-[#FF453A]">{stav.error}</div>}

      {stav.tracks.length > 0 && (
        <>
          {/* Ovládání */}
          <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-white/10 bg-black/30">
            <button
              onClick={() => (stav.isPlaying ? midiPlayerService.pause() : midiPlayerService.play())}
              className="flex items-center gap-1.5 bg-[#FF9F0A] hover:bg-[#FFB340] text-black font-black text-xs px-3.5 py-1.5 rounded-lg cursor-pointer"
            >
              {stav.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {stav.isPlaying ? 'Pauza' : 'Přehrát'}
            </button>

            {engine.nacita && (
              <span className="flex items-center gap-1.5 text-[11px] text-[#FF9F0A]">
                <Loader2 className="w-3 h-3 animate-spin" />
                Stahuji zvukovou banku (40 MB)…
              </span>
            )}
            {engine.chyba && (
              <span className="text-[11px] text-[#FF453A]">
                Zvuková banka: {engine.chyba}
              </span>
            )}
            <button
              onClick={() => midiPlayerService.stop()}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
              title="Zastavit"
            >
              <Square className="w-3.5 h-3.5" />
            </button>

            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {formatCas(stav.position)} <span className="text-neutral-500">/ {formatCas(stav.duration)}</span>
            </span>

            <div className="flex items-center gap-1">
              <span className="text-[10px] text-neutral-400 font-bold mr-1">TEMPO</span>
              {[0.5, 0.75, 1, 1.25, 1.5].map((f) => (
                <button
                  key={f}
                  onClick={() => midiPlayerService.setTempoFactor(f)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    stav.tempoFactor === f ? 'bg-[#FF9F0A] text-black' : 'bg-white/5 text-neutral-300 hover:bg-white/10'
                  }`}
                >
                  {f}×
                </button>
              ))}
            </div>

            {/* Hlavní hlasitost. Bez ní se dal zvuk ztlumit jedině v systému,
                což je při hraní s ostatními k ničemu. */}
            <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-white/10">
              <button
                onClick={() => {
                  const nova = hlasitost > 0 ? 0 : 0.85;
                  setHlasitost(nova);
                  audioSynth.setMasterVolume(nova);
                }}
                className="text-neutral-400 hover:text-white cursor-pointer"
                title={hlasitost > 0 ? 'Ztlumit' : 'Zapnout zvuk'}
              >
                {hlasitost > 0 ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-[#FF453A]" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={hlasitost}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setHlasitost(v);
                  audioSynth.setMasterVolume(v);
                }}
                className="w-20 h-1 cursor-pointer accent-[#FF9F0A]"
              />
              <span className="text-[9px] font-mono text-neutral-500 w-7 text-right">
                {Math.round(hlasitost * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setPxZaSekundu((z) => Math.max(8, z / 1.5))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
                title="Oddálit"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-neutral-400 w-12 text-center">{Math.round(pxZaSekundu)} px/s</span>
              <button
                onClick={() => setPxZaSekundu((z) => Math.min(240, z * 1.5))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
                title="Přiblížit"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Stopy + časová osa */}
          <div className="flex">
            {/* Hlavičky stop */}
            <div className="shrink-0 border-r border-white/10 bg-black/40" style={{ width: SIRKA_HLAVICEK }}>
              <div className="h-7 border-b border-white/10 px-3 flex items-center text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Stopy ({stav.tracks.length})
              </div>
              {stav.tracks.map((t, i) => (
                <div
                  key={t.index}
                  onClick={() => setVybranaStopa(i)}
                  style={{ height: VYSKA_STOPY }}
                  className={`px-2.5 py-1 border-b border-white/[0.06] cursor-pointer flex flex-col justify-center gap-1 ${
                    i === vybranaStopa ? 'bg-[#FF9F0A]/10 border-l-2 border-l-[#FF9F0A]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-white truncate flex-1" title={`${t.name} · ${t.programName}`}>
                      {t.name}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); midiPlayerService.toggleSolo(t.index); }}
                      className={`px-1 rounded text-[9px] font-black cursor-pointer ${t.solo ? 'bg-[#FF9F0A] text-black' : 'bg-white/10 text-neutral-400'}`}
                    >S</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); midiPlayerService.toggleMute(t.index); }}
                      className={`p-0.5 rounded cursor-pointer ${t.muted ? 'bg-[#FF453A]/25 text-[#FF453A]' : 'bg-white/10 text-neutral-400'}`}
                    >
                      {t.muted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={t.hlasitost}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => midiPlayerService.setTrackVolume(t.index, parseFloat(e.target.value))}
                    className="w-full h-1 cursor-pointer accent-[#FF9F0A] mb-1"
                    title={`Hlasitost stopy: ${Math.round(t.hlasitost * 100)} %`}
                  />
                  <select
                    value={t.profile}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => midiPlayerService.setTrackProfile(t.index, e.target.value as InstrumentProfile)}
                    className="bg-black/60 text-neutral-300 text-[9px] px-1.5 py-0.5 rounded border border-white/10 outline-none cursor-pointer w-full"
                  >
                    {INSTRUMENT_PROFILES.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Osa — jeden posuv pro pravítko i stopy, jinak by se rozešly */}
            <div ref={osaRef} className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="relative" style={{ width: sirkaOsy }}>
                {/* Pravítko */}
                <div
                  onClick={klikDoOsy}
                  className="h-7 border-b border-white/10 relative cursor-pointer bg-black/50"
                >
                  {znacky.map((s) => (
                    <div key={s} className="absolute top-0 bottom-0 border-l border-white/10" style={{ left: s * pxZaSekundu }}>
                      <span className="text-[9px] font-mono text-neutral-500 pl-1">{formatCas(s)}</span>
                    </div>
                  ))}
                </div>

                {/* Stopy */}
                {stav.tracks.map((t, i) => {
                  const min = t.notes.length ? Math.min(...t.notes.map((n) => n.midi)) : 48;
                  const max = t.notes.length ? Math.max(...t.notes.map((n) => n.midi)) : 72;
                  const rozpeti = Math.max(1, max - min);
                  return (
                    <div
                      key={t.index}
                      onClick={() => setVybranaStopa(i)}
                      style={{ height: VYSKA_STOPY }}
                      className={`relative border-b border-white/[0.06] cursor-pointer ${
                        i === vybranaStopa ? 'bg-[#FF9F0A]/[0.06]' : ''
                      } ${t.muted ? 'opacity-35' : ''}`}
                    >
                      {t.notes.map((n, k) => (
                        <div
                          key={k}
                          className="absolute rounded-[2px] bg-[#FF9F0A]"
                          style={{
                            left: n.time * pxZaSekundu,
                            width: Math.max(2, n.duration * pxZaSekundu),
                            top: 4 + (1 - (n.midi - min) / rozpeti) * (VYSKA_STOPY - 12),
                            height: 4,
                            opacity: 0.35 + n.velocity * 0.65,
                          }}
                        />
                      ))}
                    </div>
                  );
                })}

                {/* Přehrávací čára přes celou osu */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-[#30D158] pointer-events-none z-10"
                  style={{ left: stav.position * pxZaSekundu }}
                />
              </div>
            </div>
          </div>

          {/* Editor vybrané stopy */}
          {stopa && (
            <div className="border-t border-white/10">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/30">
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Editor — {stopa.name}
                </span>
                <span className="text-[10px] text-neutral-500">
                  {stopa.notes.length} not
                  {vybrane.size > 0 && <span className="text-[#FF9F0A] font-bold"> · {vybrane.size} označeno</span>}
                </span>

                <div className="ml-auto flex items-center gap-3">
                  <button
                    onClick={zpet}
                    disabled={krokuZpet === 0}
                    className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-white cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Krok zpět (Cmd+Z)"
                  >
                    <Undo2 className="w-3 h-3" /> Zpět{krokuZpet > 0 ? ` (${krokuZpet})` : ''}
                  </button>
                  <button
                    onClick={smazVybrane}
                    disabled={vybrane.size === 0}
                    className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-[#FF453A] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Smazat označené (Delete)"
                  >
                    <Trash2 className="w-3 h-3" /> Smazat výběr
                  </button>
                  <button
                    onClick={() => { zapisNoty([]); setVybrane(new Set()); }}
                    className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-[#FF453A] cursor-pointer"
                  >
                    Vymazat stopu
                  </button>
                </div>
              </div>

              <div className="px-4 pb-2 text-[10px] text-neutral-600">
                Klik do prázdna přidá notu · tažení notu posune · tažení za pravý okraj změní délku ·
                Shift přidá do výběru · tažení po ploše označí rámečkem · Delete smaže · Cmd+Z vrátí
              </div>

              <div className="overflow-auto max-h-64 bg-black/50">
                <div
                  ref={rollRef}
                  className={`relative select-none ${tahAktivni === 'vyber' ? 'cursor-crosshair' : 'cursor-crosshair'}`}
                  style={{ width: sirkaOsy, height: radkuRoll * VYSKA_RADKU_ROLL }}
                  onMouseDown={startNaPlose}
                >
                  {Array.from({ length: radkuRoll }, (_, r) => {
                    const midi = rozsah.max - r;
                    return CERNE.has(midi % 12) ? (
                      <div key={r} className="absolute w-full bg-white/[0.035]" style={{ top: r * VYSKA_RADKU_ROLL, height: VYSKA_RADKU_ROLL }} />
                    ) : null;
                  })}

                  {stopa.notes.map((n, k) => {
                    const oznacena = vybrane.has(k);
                    const sirka = Math.max(3, n.duration * pxZaSekundu - 1);
                    return (
                      <div
                        key={k}
                        onMouseDown={(e) => startNaNote(e, k, 'posun')}
                        title={`${midiToNoteName(n.midi)} · ${n.time.toFixed(2)} s · ${n.duration.toFixed(2)} s`}
                        className={`absolute rounded-[2px] cursor-grab active:cursor-grabbing ${
                          oznacena ? 'bg-white ring-1 ring-[#FF9F0A]' : 'bg-[#FF9F0A]'
                        }`}
                        style={{
                          left: n.time * pxZaSekundu,
                          top: (rozsah.max - n.midi) * VYSKA_RADKU_ROLL + 1,
                          width: sirka,
                          height: VYSKA_RADKU_ROLL - 2,
                          opacity: 0.45 + n.velocity * 0.55,
                        }}
                      >
                        {/* Úchyt pro změnu délky. Sahá jen na pravý okraj, aby
                            se dal zbytek noty pořád chytit a přetáhnout. */}
                        <div
                          onMouseDown={(e) => startNaNote(e, k, 'delka')}
                          className="absolute top-0 right-0 h-full cursor-ew-resize"
                          style={{ width: Math.min(6, Math.max(3, sirka / 3)) }}
                        />
                      </div>
                    );
                  })}

                  {ramecek && (
                    <div
                      className="absolute border border-[#FF9F0A] bg-[#FF9F0A]/10 pointer-events-none"
                      style={{ left: ramecek.x, top: ramecek.y, width: ramecek.w, height: ramecek.h }}
                    />
                  )}

                  <div
                    className="absolute top-0 bottom-0 w-px bg-[#30D158] pointer-events-none"
                    style={{ left: stav.position * pxZaSekundu }}
                  />
                </div>
              </div>

              <div className="px-4 py-2 text-[10px] text-neutral-500 border-t border-white/[0.06]">
                Úpravy platí jen v přehrávači — soubor v knihovně se nemění.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
