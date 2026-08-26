import React, { useMemo, useState } from 'react';
import { Play, Lock, Unlock, Trash2, ListPlus, AlignJustify, LayoutGrid } from 'lucide-react';
import { Song } from '../../types';
import { KlicRazeni, SLOUPCE, seradPodle, odhadniJazyk } from '../../services/songSort';
import { MiniPrehravac } from './MiniPrehravac';

interface Props {
  songs: Song[];
  aktivniId?: string;
  onVybrat: (s: Song) => void;
  onZamknout: (s: Song, e?: React.MouseEvent) => void;
  onSmazat: (s: Song, e?: React.MouseEvent) => void;
  onDoPlaylistu: (s: Song, e?: React.MouseEvent) => void;
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
export const SeznamSkladeb: React.FC<Props> = ({
  songs, aktivniId, onVybrat, onZamknout, onSmazat, onDoPlaylistu,
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

  const [pohled, setPohled] = useState<'line' | 'detail'>(() => {
    try {
      return (localStorage.getItem('neverlate_pohled') as 'line' | 'detail') || 'line';
    } catch {
      return 'line';
    }
  });

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

  const nastavPohled = (p: 'line' | 'detail') => {
    setPohled(p);
    try {
      localStorage.setItem('neverlate_pohled', p);
    } catch {
      /* stejně jako výše */
    }
  };

  const serazene = useMemo(() => seradPodle(songs, razeni, sestupne), [songs, razeni, sestupne]);

  // Mřížka: ikona přehrání, název, po jednom sloupci na zapnutý údaj,
  // a nakonec tlačítka. Kdyby se šířky psaly natvrdo, každý zapnutý
  // sloupec by se musel dopočítávat ručně.
  const mrizka = {
    gridTemplateColumns: `28px minmax(0,2.2fr) ${zapnute.map(() => 'minmax(0,1fr)').join(' ')} 92px`,
  };

  const sipka = (k: KlicRazeni) =>
    razeni === k ? <span className="text-[#FF9F0A]">{sestupne ? '↓' : '↑'}</span> : null;

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Zaškrtávátka sloupců. Zapnutý údaj dostane vlastní sloupec
            a rovnou podle sebe seznam seřadí. */}
        {SLOUPCE.map((m) => {
          const zap = zapnute.includes(m.klic);
          return (
            <button
              key={m.klic}
              onClick={() => prepni(m.klic)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer transition-all flex items-center gap-1.5 ${
                zap
                  ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/40'
                  : 'bg-white/[0.04] text-neutral-400 border-white/[0.08] hover:text-white'
              }`}
              title={zap ? `Skrýt sloupec ${m.popis}` : `Ukázat sloupec ${m.popis}`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-[3px] border shrink-0 ${
                  zap ? 'bg-[#FF9F0A] border-[#FF9F0A]' : 'border-neutral-600'
                }`}
              />
              {m.popis}
            </button>
          );
        })}

        <div className="ml-auto flex items-center bg-black/50 border border-white/10 p-0.5 rounded-xl">
          {([
            { id: 'line', popis: 'Line', ikona: AlignJustify },
            { id: 'detail', popis: 'Detail', ikona: LayoutGrid },
          ] as const).map((p) => {
            const Ikona = p.ikona;
            return (
              <button
                key={p.id}
                onClick={() => nastavPohled(p.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                  pohled === p.id ? 'bg-[#FF9F0A] text-black font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Ikona className="w-3 h-3" />
                {p.popis}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-y-auto max-h-[52vh] rounded-2xl border border-white/[0.06] bg-black/20">
        {/* Hlavička drží u horního okraje, aby se při rolování vědělo,
            který sloupec je který. */}
        <div
          className="grid gap-2 px-3 py-1.5 sticky top-0 z-10 bg-[#101014] border-b border-white/[0.08] text-[9px] font-bold uppercase tracking-wider text-neutral-500"
          style={mrizka}
        >
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
          <div className="p-6 text-center text-[12px] text-neutral-500">Zatím tu nic není.</div>
        )}

        {serazene.map((s) => {
          const aktivni = s.id === aktivniId;
          const v = video(s);
          const jazyk = pohled === 'detail' ? odhadniJazyk(s.content || '') : null;
          const prehrava = hraje === s.id && v;

          return (
            <div key={s.id} className={`border-b border-white/[0.04] ${aktivni ? 'bg-[#FF9F0A]/15' : ''}`}>
              <div
                onClick={() => onVybrat(s)}
                style={mrizka}
                className={`grid gap-2 items-center px-3 py-2 cursor-pointer transition-all ${
                  aktivni ? '' : 'hover:bg-white/[0.04]'
                }`}
              >
                {/* Ukázka se nabídne jen tam, kde je co pustit. */}
                {v ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setHraje((p) => (p === s.id ? null : s.id));
                    }}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all justify-self-start ${
                      prehrava
                        ? 'bg-[#FF453A] text-white'
                        : 'bg-[#FF453A]/15 hover:bg-[#FF453A]/30 text-[#FF453A]'
                    }`}
                    title={prehrava ? 'Zavřít ukázku' : 'Přehrát ukázku'}
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[13px] font-semibold truncate ${aktivni ? 'text-[#FF9F0A]' : 'text-white'}`}
                  >
                    {s.title}
                  </span>
                  {s.isLocked && <Lock className="w-3 h-3 text-[#FF9F0A] shrink-0" />}
                </div>

                {zapnute.map((k) => (
                  <span
                    key={k}
                    className={`text-[11px] truncate ${
                      razeni === k ? 'text-neutral-200' : 'text-neutral-500'
                    } ${k === 'tempo' ? 'tabular-nums' : ''}`}
                  >
                    {hodnota(s, k) || <span className="text-neutral-700">—</span>}
                  </span>
                ))}

                <div className="flex items-center gap-0.5 justify-self-end">
                  <button
                    onClick={(e) => onDoPlaylistu(s, e)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-[#FF9F0A] cursor-pointer transition-all"
                    title="Přidat do playlistu"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => onZamknout(s, e)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer transition-all"
                    title={s.isLocked ? 'Odemknout' : 'Zamknout'}
                  >
                    {s.isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={(e) => onSmazat(s, e)}
                    className="p-1.5 rounded-lg hover:bg-[#FF453A]/20 text-neutral-500 hover:text-[#FF453A] cursor-pointer transition-all"
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
              {(prehrava || pohled === 'detail') && (
                <div className="px-3 pb-2 flex items-start gap-2 flex-wrap">
                  {prehrava ? (
                    <div className="w-64">
                      <MiniPrehravac
                        key={v!.id}
                        videoId={v!.id}
                        nazev={v!.title}
                        zdroj="Ukázka z knihovny"
                        sVideem={pohled === 'detail'}
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
                  {pohled === 'detail' && (
                    <div className="flex flex-wrap gap-1">
                      {jazyk && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400">
                          {jazyk}
                        </span>
                      )}
                      {(s.attachments?.length || 0) > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400">
                          {s.attachments!.length}× příloha
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
