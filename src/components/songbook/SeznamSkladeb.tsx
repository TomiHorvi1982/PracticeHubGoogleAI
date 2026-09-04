import React, { useEffect, useMemo, useState } from 'react';
import { ObalkyPisne } from './ObalkyPisne';
import { stahniPrilohyPisne, souboru } from '../../services/stahovaniPriloh';
import { skladby } from '../../services/mnozneCislo';
import {
  Play, Trash2, ListPlus, ChevronDown, ChevronRight, Pencil,
  FileText, Music, Music4, FileCode, Youtube, Volume2, Sliders, Piano, Download,
} from 'lucide-react';
import { Song } from '../../types';
import { KlicRazeni, SLOUPCE, seradPodle, odhadniJazyk } from '../../services/songSort';
import { MiniPrehravac } from './MiniPrehravac';
import { dostupnostPisne } from '../../services/dostupnostPisne';

interface Props {
  songs: Song[];
  aktivniId?: string;
  onVybrat: (s: Song) => void;
  onSmazat: (s: Song, e?: React.MouseEvent) => void;
  /**
   * Přidá k písni zvuk z počítače.
   *
   * Uloží se do knihovny, ne jen k písni — jinak by soubor žil jen
   * v jedné skladbě a nešel použít třeba v mixážním pultu.
   */
  onNahratAudio?: (s: Song, soubor: File) => void | Promise<void>;
  onDoPlaylistu: (s: Song, e?: React.MouseEvent) => void;
  /** Přidá víc skladeb do playlistu naráz. */
  onDoPlaylistuHromadne?: (skladby: Song[]) => void | Promise<void>;
  /** Sety na pódium, do kterých jde hromadně zařadit. */
  sety?: { id: string; nazev: string }[];
  onDoSetuHromadne?: (skladby: Song[], setId: string) => void | Promise<number | void>;
  /** Smaže víc skladeb naráz. Vrací, kolik jich zmizelo. */
  onSmazatHromadne?: (skladby: Song[]) => void | Promise<number | void>;
  /** Otevře doplňování materiálů k písni. */
  onUpravit: (s: Song, e?: React.MouseEvent) => void;
}

/** Hodnota údaje do sloupce. */
function hodnota(s: Song, k: KlicRazeni): string {
  switch (k) {
    case 'band': return s.artist || '';
    case 'artist': return (s as any).author || '';
    case 'song': return s.title || '';
    case 'tempo': return s.bpm ? `${s.bpm}` : '';
    case 'key': return s.key || '';
    case 'tuning': return s.tuning || '';
    default: return '';
  }
}

/** První video u písně, pokud nějaké má. */
function video(s: Song): { id: string; title: string } | null {
  const v = s.youtubeVideos?.[0];
  if (!v) return null;
  // `id` u videa je identifikátor z YouTube; u starších záznamů jen adresa.
  const id = v.id || (v.url || '').match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1];
  return id ? { id, title: v.title || s.title } : null;
}

/**
 * Knihovna skladeb v řádcích.
 *
 * Zaškrtnutý údaj je opravdový sloupec, ne přívěsek za názvem. Když se
 * tempo píše pod sebe, jde srovnat pohledem; ve větě „Metal · 76 BPM" se
 * hledá očima pokaždé znovu.
 */
/**
 * Řádka značek pod názvem písně.
 *
 * Jen to, co píseň má — chybějící se nekreslí ani našedle. Sedm bledých
 * ikon u prázdné písně vypadá jako sedm možností, ne jako nic.
 */
const ZnackyDostupnosti: React.FC<{ song: Song }> = ({ song }) => {
  const co = dostupnostPisne(song);
  if (!co.length) return null;

  type Ikona = React.FC<{ className?: string; style?: React.CSSProperties }>;
  const IKONY: Record<string, { I: Ikona; barva: string }> = {
    text: { I: FileText, barva: '#0A84FF' },
    akordy: { I: Music4, barva: '#FF9F0A' },
    taby: { I: FileCode, barva: '#FFD60A' },
    video: { I: Youtube, barva: '#FF453A' },
    audio: { I: Volume2, barva: '#30D158' },
    stopy: { I: Sliders, barva: '#64D2FF' },
    midi: { I: Piano, barva: '#BF5AF2' },
  };

  return (
    <div className="flex items-center gap-1 mt-0.5">
      {co.map(({ co: k, popis }) => {
        const { I, barva } = IKONY[k];
        return (
          /**
           * Popisek naskočí hned, ne až po vteřině jako nativní bublina.
           *
           * Ikonek je pod názvem až sedm a liší se drobnostmi; než se
           * nativní bublina rozmyslí, člověk už myš odtáhne a nedozví
           * se nic. `aria-label` zůstává pro čtečky obrazovky.
           */
          <span key={k} className="relative group/znacka shrink-0">
            <span
              aria-label={popis}
              className="w-4 h-4 rounded flex items-center justify-center"
              style={{ background: `${barva}22` }}
            >
              <I className="w-2.5 h-2.5" style={{ color: barva }} />
            </span>
            <span
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1
                         hidden group-hover/znacka:block whitespace-nowrap rounded-md
                         bg-[#0B0B0E] border border-white/15 px-1.5 py-0.5 text-stitek
                         font-medium text-white shadow-lg z-20"
            >
              {popis}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const SeznamSkladeb: React.FC<Props> = ({
  songs, aktivniId, onVybrat, onSmazat, onNahratAudio, onDoPlaylistu, onDoPlaylistuHromadne,
  sety = [], onDoSetuHromadne, onSmazatHromadne, onUpravit,
}) => {
  const [zapnute, setZapnute] = useState<KlicRazeni[]>(() => {
    try {
      const u = JSON.parse(localStorage.getItem('neverlate_sloupce') || 'null');
      const platne = SLOUPCE.map((s) => s.klic);
      // Starší uložený výběr může obsahovat žánr nebo jazyk, které už
      // sloupec nemají. Neplatné klíče se tiše zahodí.
      const ocistene = Array.isArray(u) ? u.filter((k: KlicRazeni) => platne.includes(k)) : [];
      return ocistene.length ? ocistene : ['band'];
    } catch {
      return ['band'];
    }
  });

  /** Podle čeho se řadí. Kliknutí na hlavičku sloupce ho přepne. */
  const [razeni, setRazeni] = useState<KlicRazeni>('song');
  const [sestupne, setSestupne] = useState(false);

  /**
   * Které řádky jsou rozbalené.
   *
   * Dřív se detail zapínal pro celý seznam naráz. Osmdesát řádků tím
   * povyrostlo o náhledy, seznam se opticky natáhl a posuvník skončil
   * úplně jinde, než kde člověk zrovna četl. Rozbalit jde teď jen ten
   * řádek, o který jde — zbytek zůstane, kde byl.
   */
  const [rozbalene, setRozbalene] = useState<Set<string>>(new Set());

  /** Která skladba má puštěnou ukázku. Vždy nejvýš jedna. */
  const [hraje, setHraje] = useState<string | null>(null);

  const prepni = (k: KlicRazeni) => {
    setZapnute((p) => {
      const zapnuty = p.includes(k);
      const nove = zapnuty ? p.filter((x) => x !== k) : [...p, k];
      try {
        localStorage.setItem('neverlate_sloupce', JSON.stringify(nove));
      } catch {
        /* plné úložiště nesmí zabránit přepnutí */
      }
      return nove;
    });
    // Zapnutý sloupec rovnou převezme řazení — o to člověku jde, když si
    // ho zapíná. Vypnutý ho vrací názvu, aby se neřadilo podle něčeho,
    // co není vidět.
    setRazeni((r) => (zapnute.includes(k) ? (r === k ? 'song' : r) : k));
  };

  const serad = (k: KlicRazeni) => {
    if (razeni === k) setSestupne((v) => !v);
    else {
      setRazeni(k);
      setSestupne(false);
    }
  };

  /**
   * Hromadný výběr.
   *
   * Zapíná se zvlášť, aby zaškrtávátka nepřekážela při běžném
   * procházení — kliknutí na řádek jinak otevírá skladbu a dvě různé
   * reakce na tentýž pohyb se pletou.
   */
  const [vyberRezim, setVyberRezim] = useState(false);
  /**
   * Výběr se schválně nepamatuje mezi načteními stránky.
   *
   * Filtr si zapamatovat dává smysl, výběr určený k okamžitému
   * provedení ne: kdo si vybere pět skladeb, odejde a vrátí se, přidá
   * jich šest, aniž by chtěl. Naměřeno přesně takhle.
   */
  const [oznacene, setOznacene] = useState<Set<string>>(new Set());
  const [pridavaSe, setPridavaSe] = useState(false);
  const [cilovySet, setCilovySet] = useState('');
  /** Mazání se potvrzuje druhým kliknutím — hromadné je nevratné. */
  const [potvrditMazani, setPotvrditMazani] = useState(false);

  /**
   * Rozmyšlená otázka se sama zavře.
   *
   * Nechat „Opravdu smazat?" viset donekonečna znamená, že se k němu dá
   * po chvíli vrátit a odkliknout ho bez rozmyslu. Ztráta zaostření na
   * to nestačí — tlačítko ho po programovém kliknutí nemusí mít vůbec.
   */
  useEffect(() => {
    if (!potvrditMazani) return;
    const t = setTimeout(() => setPotvrditMazani(false), 4000);
    return () => clearTimeout(t);
  }, [potvrditMazani]);

  /** U které písně se zrovna stahuje — ať se nedá zmáčknout dvakrát. */
  const [stahujeSe, setStahujeSe] = useState<string | null>(null);
  const [stahovaniHlaska, setStahovaniHlaska] = useState<string | null>(null);

  /**
   * Stáhne přílohy jedné písně do počítače.
   *
   * Nabízí se jen tam, kde nějaká příloha je — u prázdné písně by to
   * bylo tlačítko, co nic neudělá.
   */
  const stahni = async (song: (typeof songs)[number], e: React.MouseEvent) => {
    e.stopPropagation();
    if (stahujeSe) return;
    setStahujeSe(song.id);
    setStahovaniHlaska(null);
    try {
      const v = await stahniPrilohyPisne(song);
      setStahovaniHlaska(
        v.chyby.length
          ? `Staženo ${v.stazeno}, nepovedlo se: ${v.chyby.join('; ')}`
          : `Staženo ${souboru(v.stazeno)} — ${song.title}.`,
      );
    } catch (err: any) {
      setStahovaniHlaska(err?.message || 'Stažení selhalo.');
    } finally {
      setStahujeSe(null);
      setTimeout(() => setStahovaniHlaska(null), 6000);
    }
  };

  /** Vybrané skladby v pořadí, v jakém jsou vidět. */
  const vybraneSkladby = () => serazene.filter((x) => oznacene.has(x.id));

  const rozbal = (id: string) => {
    setRozbalene((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const serazene = useMemo(() => seradPodle(songs, razeni, sestupne), [songs, razeni, sestupne]);

  // Mřížka: ikona přehrání, název, po jednom sloupci na zapnutý údaj,
  // a nakonec tlačítka. Kdyby se šířky psaly natvrdo, každý zapnutý
  // sloupec by se musel dopočítávat ručně.
  const mrizka = {
    gridTemplateColumns: `${vyberRezim ? '24px ' : ''}28px minmax(0,2.2fr) ${zapnute.map(() => 'minmax(0,1fr)').join(' ')} 148px`,
  };

  const sipka = (k: KlicRazeni) =>
    razeni === k ? <span className="text-znacka">{sestupne ? '↓' : '↑'}</span> : null;

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Jak stahování dopadlo. Prohlížeč o uloženém souboru sám nic
          neřekne, takže bez tohohle by kliknutí vypadalo bez odezvy. */}
      {stahovaniHlaska && (
        <p className="text-drobne text-info bg-info/10 border border-info/25 rounded-xl px-3 py-1.5">
          {stahovaniHlaska}
        </p>
      )}

      {/* Hromadný výběr.
          Přidat dvacet skladeb do setlistu po jedné je práce, kterou
          nikdo dělat nechce — a přesně to se před zkouškou dělá. */}
      {onDoPlaylistuHromadne && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => {
              setVyberRezim((v) => !v);
              if (vyberRezim) setOznacene(() => new Set<string>());
            }}
            className={`px-2.5 py-1 rounded-lg text-stitek font-semibold border cursor-pointer transition-all ${
              vyberRezim
                ? 'bg-znacka/15 text-znacka border-znacka/40'
                : 'bg-white/[0.04] text-neutral-400 border-white/10 hover:text-white'
            }`}
          >
            {vyberRezim ? 'Zrušit výběr' : 'Vybrat víc skladeb'}
          </button>

          {vyberRezim && (
            <>
              <span className="text-stitek text-neutral-500">
                {oznacene.size === 0 ? 'nic nevybráno' : `vybráno ${oznacene.size}`}
              </span>
              <button
                onClick={async () => {
                  if (!oznacene.size || pridavaSe) return;
                  setPridavaSe(true);
                  try {
                    // Pořadí ze seznamu, ne z toho, jak se klikalo —
                    // setlist má jít po sobě tak, jak je vidět.
                    await onDoPlaylistuHromadne(vybraneSkladby());
                    setStahovaniHlaska(`Do playlistu přidáno ${skladby(oznacene.size)}.`);
                    setOznacene(() => new Set<string>());
                    setVyberRezim(false);
                  } finally {
                    setPridavaSe(false);
                  }
                }}
                disabled={!oznacene.size || pridavaSe}
                className="px-2.5 py-1 rounded-lg text-stitek font-bold bg-uspech/15 text-uspech border border-uspech/30 cursor-pointer disabled:opacity-40"
              >
                {pridavaSe ? 'přidávám…' : 'Přidat do playlistu'}
              </button>

              {/* Do setu na pódium. Bez vybraného setu by tlačítko
                  nemělo kam přidávat, tak se nabídne až s ním. */}
              {onDoSetuHromadne && sety.length > 0 && (
                <>
                  <select
                    value={cilovySet}
                    onChange={(e) => setCilovySet(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-1.5 py-1 text-stitek text-white outline-none cursor-pointer"
                  >
                    <option value="">— set na pódium —</option>
                    {sety.map((x) => <option key={x.id} value={x.id}>{x.nazev}</option>)}
                  </select>
                  <button
                    onClick={async () => {
                      if (!oznacene.size || !cilovySet || pridavaSe) return;
                      setPridavaSe(true);
                      try {
                        const kolik = await onDoSetuHromadne(vybraneSkladby(), cilovySet);
                        const jmeno = sety.find((x) => x.id === cilovySet)?.nazev || 'setu';
                        // Hlásí se, kolik doopravdy přibylo: co v setu
                        // už bylo, se nepřidává podruhé.
                        setStahovaniHlaska(
                          typeof kolik === 'number' && kolik < oznacene.size
                            ? `Do „${jmeno}" přidáno ${skladby(kolik)}, zbytek už tam byl.`
                            : `Do „${jmeno}" přidáno ${skladby(oznacene.size)}.`,
                        );
                        setOznacene(() => new Set<string>());
                        setVyberRezim(false);
                      } finally {
                        setPridavaSe(false);
                      }
                    }}
                    disabled={!oznacene.size || !cilovySet || pridavaSe}
                    className="px-2.5 py-1 rounded-lg text-stitek font-bold bg-znacka/15 text-znacka border border-znacka/30 cursor-pointer disabled:opacity-40"
                  >
                    Do setu
                  </button>
                </>
              )}

              {/* Mazání na dvě kliknutí. Smazat dvacet skladeb omylem
                  je nevratné, takže první kliknutí jen zeptá. */}
              {onSmazatHromadne && (
                <button
                  onClick={async () => {
                    if (!oznacene.size || pridavaSe) return;
                    if (!potvrditMazani) { setPotvrditMazani(true); return; }
                    setPridavaSe(true);
                    try {
                      const kolik = await onSmazatHromadne(vybraneSkladby());
                      setStahovaniHlaska(
                        typeof kolik === 'number' && kolik < oznacene.size
                          ? `Smazáno ${skladby(kolik)}; zbytek se nepodařilo smazat.`
                          : `Smazáno ${skladby(oznacene.size)}.`,
                      );
                      setOznacene(() => new Set<string>());
                      setVyberRezim(false);
                    } finally {
                      setPridavaSe(false);
                      setPotvrditMazani(false);
                    }
                  }}
                  onBlur={() => setPotvrditMazani(false)}
                  disabled={!oznacene.size || pridavaSe}
                  className={`px-2.5 py-1 rounded-lg text-stitek font-bold border cursor-pointer disabled:opacity-40 ${
                    potvrditMazani
                      ? 'bg-chyba text-white border-chyba'
                      : 'bg-chyba/15 text-chyba border-chyba/30'
                  }`}
                >
                  {potvrditMazani ? `Opravdu smazat ${oznacene.size}?` : 'Smazat'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Zaškrtávátka sloupců. Zapnutý údaj dostane vlastní sloupec
            a rovnou podle sebe seznam seřadí. */}
        {SLOUPCE.map((m) => {
          const zap = zapnute.includes(m.klic);
          return (
            <button
              key={m.klic}
              onClick={() => prepni(m.klic)}
              className={`px-2 py-1 rounded-lg text-stitek font-semibold border cursor-pointer transition-all flex items-center gap-1.5 ${
                zap
                  ? 'bg-znacka/15 text-znacka border-znacka/40'
                  : 'bg-white/[0.04] text-neutral-400 border-white/[0.08] hover:text-white'
              }`}
              title={zap ? `Skrýt sloupec ${m.popis}` : `Ukázat sloupec ${m.popis}`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-[3px] border shrink-0 ${
                  zap ? 'bg-znacka border-znacka' : 'border-neutral-600'
                }`}
              />
              {m.popis}
            </button>
          );
        })}

      </div>

      <div className="overflow-y-auto max-h-[52vh] rounded-2xl border border-white/[0.06] bg-black/20">
        {/* Hlavička drží u horního okraje, aby se při rolování vědělo,
            který sloupec je který. */}
        <div
          className="grid gap-2 px-3 py-1.5 sticky top-0 z-10 bg-[#101014] border-b border-white/[0.08] text-stitek font-bold uppercase tracking-wider text-neutral-500"
          style={mrizka}
        >
          {vyberRezim && (
            <button
              onClick={() =>
                setOznacene(() =>
                  oznacene.size === serazene.length
                    ? new Set<string>()
                    : new Set(serazene.map((x) => x.id)),
                )
              }
              className="text-neutral-400 hover:text-white cursor-pointer"
              title={oznacene.size === serazene.length ? 'Zrušit výběr' : 'Vybrat všechny'}
            >
              {oznacene.size === serazene.length && serazene.length > 0 ? '☑' : '☐'}
            </button>
          )}
          <span />
          <button
            onClick={() => serad('song')}
            className="text-left hover:text-white cursor-pointer flex items-center gap-1"
          >
            Skladba {sipka('song')}
          </button>
          {zapnute.map((k) => (
            <button
              key={k}
              onClick={() => serad(k)}
              className="text-left hover:text-white cursor-pointer flex items-center gap-1 truncate"
            >
              {SLOUPCE.find((s) => s.klic === k)?.popis} {sipka(k)}
            </button>
          ))}
          <span />
        </div>

        {serazene.length === 0 && (
          <div className="p-6 text-center text-drobne text-neutral-500">Zatím tu nic není.</div>
        )}

        {serazene.map((s) => {
          const aktivni = s.id === aktivniId;
          const v = video(s);
          const otevreny = rozbalene.has(s.id);
          const jazyk = otevreny ? odhadniJazyk(s.content || '') : null;
          const prehrava = hraje === s.id && v;

          return (
            <div key={s.id} className={`border-b border-white/[0.04] ${aktivni ? 'bg-znacka/15' : ''}`}>
              <div
                onClick={() => onVybrat(s)}
                style={mrizka}
                className={`grid gap-2 items-center px-3 py-2 cursor-pointer transition-all ${
                  aktivni ? '' : 'hover:bg-white/[0.04]'
                }`}
              >
                {vyberRezim && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOznacene((p) => {
                        const n = new Set(p);
                        if (n.has(s.id)) n.delete(s.id);
                        else n.add(s.id);
                        return n;
                      });
                    }}
                    className={`text-drobne cursor-pointer ${
                      oznacene.has(s.id) ? 'text-znacka' : 'text-neutral-600 hover:text-white'
                    }`}
                  >
                    {oznacene.has(s.id) ? '☑' : '☐'}
                  </button>
                )}

                {/* Ukázka se nabídne jen tam, kde je co pustit. */}
                {v ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setHraje((p) => (p === s.id ? null : s.id));
                    }}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all justify-self-start ${
                      prehrava
                        ? 'bg-chyba text-white'
                        : 'bg-chyba/15 hover:bg-chyba/30 text-chyba'
                    }`}
                    title={prehrava ? 'Zavřít ukázku' : 'Přehrát ukázku'}
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                ) : (
                  <span />
                )}

                <div className="min-w-0 flex items-center gap-2.5">
                  <ObalkyPisne song={s} />
                  <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`text-drobne font-semibold truncate ${aktivni ? 'text-znacka' : 'text-white'}`}
                    >
                      {s.title}
                    </span>
                  </div>

                  {/* Co už je u písně po ruce. Bez toho se musí každá
                      otevřít, aby se zjistilo, jestli k ní vůbec něco je. */}
                  <ZnackyDostupnosti song={s} />
                  </div>
                </div>

                {zapnute.map((k) => (
                  <span
                    key={k}
                    className={`text-drobne truncate ${
                      razeni === k ? 'text-neutral-200' : 'text-neutral-500'
                    } ${k === 'tempo' ? 'tabular-nums' : ''}`}
                  >
                    {hodnota(s, k) || <span className="text-neutral-700">—</span>}
                  </span>
                ))}

                <div className="flex items-center gap-0.5 justify-self-end">
                  {/* Detail jen u téhle písně — celý seznam kvůli jedné
                      skladbě narůstat nemusí. */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      rozbal(s.id);
                    }}
                    className={`p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition-all ${
                      otevreny ? 'text-znacka' : 'text-neutral-500 hover:text-white'
                    }`}
                    title={otevreny ? 'Skrýt detail' : 'Ukázat detail'}
                  >
                    {otevreny ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => onUpravit(s, e)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-uspech cursor-pointer transition-all"
                    title="Doplnit materiály — tabulatury, text, MIDI, stopy…"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {(s.attachments?.length || 0) > 0 && (
                    <button
                      onClick={(e) => void stahni(s, e)}
                      disabled={stahujeSe === s.id}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-info cursor-pointer transition-all disabled:opacity-40"
                      title={`Stáhnout do počítače (${souboru(s.attachments!.length)})`}
                    >
                      <Download className={`w-3.5 h-3.5 ${stahujeSe === s.id ? 'animate-pulse' : ''}`} />
                    </button>
                  )}
                  {onNahratAudio && (
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-nastroj cursor-pointer transition-all inline-flex"
                      title="Přidat k písni zvuk z počítače — uloží se i do knihovny"
                    >
                      <Music className="w-3.5 h-3.5" />
                      <input
                        type="file"
                        accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void onNahratAudio(s, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  <button
                    onClick={(e) => onDoPlaylistu(s, e)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-znacka cursor-pointer transition-all"
                    title="Přidat do playlistu"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => onSmazat(s, e)}
                    className="p-1.5 rounded-lg hover:bg-chyba/20 text-neutral-500 hover:text-chyba cursor-pointer transition-all"
                    title="Smazat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Video se rozehraje přímo v náhledu — na tom samém místě
                  a ve stejné velikosti, kde do té chvíle byl obrázek.
                  Přehrávač pod řádkem odsouval seznam a oči šly jinam,
                  než na co se kliklo. */}
              {(prehrava || otevreny) && (
                <div className="px-3 pb-2 flex items-start gap-2 flex-wrap">
                  {prehrava ? (
                    <div className="w-64">
                      <MiniPrehravac
                        key={v!.id}
                        videoId={v!.id}
                        nazev={v!.title}
                        zdroj="Ukázka z knihovny"
                        sVideem={otevreny}
                        onZavrit={() => setHraje(null)}
                      />
                    </div>
                  ) : (
                    v && (
                      <img
                        src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                        alt=""
                        loading="lazy"
                        className="w-64 rounded-lg border border-white/10"
                      />
                    )
                  )}
                  {otevreny && (
                    <div className="flex flex-wrap gap-1">
                      {jazyk && (
                        <span className="text-stitek px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400">
                          {jazyk}
                        </span>
                      )}
                      {(s.attachments?.length || 0) > 0 && (
                        <span className="text-stitek px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400">
                          {s.attachments!.length}× příloha
                        </span>
                      )}
                      {s.nazevAlba && (
                        <span className="text-stitek px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400">
                          album: {s.nazevAlba}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
