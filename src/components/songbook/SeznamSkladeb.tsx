import React, { useMemo, useState } from 'react';
import {
  Play, Lock, Unlock, Trash2, ListPlus, ChevronDown, AlignJustify, LayoutGrid, ArrowUpDown,
} from 'lucide-react';
import { Song } from '../../types';
import { KlicRazeni, MOZNOSTI_RAZENI, seradPodle, odhadniJazyk } from '../../services/songSort';

interface Props {
  songs: Song[];
  aktivniId?: string;
  onVybrat: (s: Song) => void;
  onZamknout: (s: Song, e?: React.MouseEvent) => void;
  onSmazat: (s: Song, e?: React.MouseEvent) => void;
  onDoPlaylistu: (s: Song, e?: React.MouseEvent) => void;
  /** Přehrání ukázky z YouTube. */
  onPrehrat: (s: Song, youtubeId: string, e?: React.MouseEvent) => void;
}

/** Hodnota údaje pro výpis v řádku. */
function hodnota(s: Song, k: KlicRazeni): string {
  switch (k) {
    case 'band': return s.artist || '';
    case 'artist': return (s as any).author || '';
    case 'song': return s.title || '';
    case 'tempo': return s.bpm ? `${s.bpm} BPM` : '';
    case 'key': return s.key || '';
    case 'tuning': return s.tuning || '';
    case 'genre': return (s as any).genre || '';
    case 'language': return odhadniJazyk(s.content || '') || '';
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
 * Řádek za řádkem, jak je zvykem na telefonu — sloupcová mřížka vypadala
 * hezky, ale hledat v ní očima konkrétní název znamenalo přeskakovat mezi
 * sloupci. Řadí se podle toho, co člověk na zkoušce hledá: kapela, tempo,
 * tónina, ladění.
 */
export const SeznamSkladeb: React.FC<Props> = ({
  songs, aktivniId, onVybrat, onZamknout, onSmazat, onDoPlaylistu, onPrehrat,
}) => {
  /**
   * Které údaje jsou zapnuté.
   *
   * Zaškrtnutí dělá dvě věci naráz: údaj se objeví v řádku a seznam se
   * podle něj seřadí. Dřív to byly dvě oddělené věci — nabídka řazení a
   * filtry jinde — a člověk musel dvakrát říct totéž, aby viděl tempo a
   * zároveň podle něj řadil.
   */
  const [zapnute, setZapnute] = useState<KlicRazeni[]>(() => {
    try {
      const u = JSON.parse(localStorage.getItem('neverlate_sloupce') || 'null');
      return Array.isArray(u) && u.length ? u : ['band'];
    } catch {
      return ['band'];
    }
  });
  const [sestupne, setSestupne] = useState(false);

  // Řadí se podle naposledy zapnutého — to je ten, o který má člověk
  // právě teď zájem.
  const razeni: KlicRazeni = zapnute[zapnute.length - 1] || 'song';

  const prepni = (k: KlicRazeni) => {
    setZapnute((p) => {
      const nove = p.includes(k) ? p.filter((x) => x !== k) : [...p, k];
      try {
        localStorage.setItem('neverlate_sloupce', JSON.stringify(nove));
      } catch {
        /* plné úložiště nesmí zabránit přepnutí */
      }
      return nove;
    });
  };
  const [pohled, setPohled] = useState<'line' | 'detail'>(() => {
    try {
      return (localStorage.getItem('neverlate_pohled') as 'line' | 'detail') || 'line';
    } catch {
      return 'line';
    }
  });

  const nastavPohled = (p: 'line' | 'detail') => {
    setPohled(p);
    try {
      localStorage.setItem('neverlate_pohled', p);
    } catch {
      /* stejně jako výše */
    }
  };

  const serazene = useMemo(() => seradPodle(songs, razeni, sestupne), [songs, razeni, sestupne]);
  const popisRazeni = MOZNOSTI_RAZENI.find((m) => m.klic === razeni)?.popis || 'Název skladby';

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Zaškrtávátka údajů. Zapnutý údaj je vidět v řádku a zároveň
            podle něj seznam řadí. */}
        {MOZNOSTI_RAZENI.filter((m) => m.klic !== 'recent').map((m) => {
          const zap = zapnute.includes(m.klic);
          return (
            <button
              key={m.klic}
              onClick={() => prepni(m.klic)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer transition-all ${
                razeni === m.klic
                  ? 'bg-[#FF9F0A] text-black border-[#FF9F0A]'
                  : zap
                    ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/40'
                    : 'bg-white/[0.04] text-neutral-400 border-white/[0.08] hover:text-white'
              }`}
              title={razeni === m.klic ? `Řadí se podle: ${m.popis}` : `Ukázat ${m.popis.toLowerCase()}`}
            >
              {m.popis}
            </button>
          );
        })}

        <button
          onClick={() => setSestupne((v) => !v)}
          className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-[10px] font-mono text-neutral-400 cursor-pointer transition-all"
          title={sestupne ? 'Sestupně' : 'Vzestupně'}
        >
          {sestupne ? '↓' : '↑'}
        </button>

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

      <div className="overflow-y-auto max-h-[52vh] divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-black/20">
        {serazene.length === 0 && (
          <div className="p-6 text-center text-[12px] text-neutral-500">Žádné skladby neodpovídají filtrům.</div>
        )}

        {serazene.map((s) => {
          const aktivni = s.id === aktivniId;
          const v = video(s);
          const jazyk = pohled === 'detail' ? odhadniJazyk(s.content || '') : null;

          return (
            <div
              key={s.id}
              onClick={() => onVybrat(s)}
              className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-all ${
                aktivni ? 'bg-[#FF9F0A]/15' : 'hover:bg-white/[0.04]'
              }`}
            >
              {/* Ukázka se nabídne jen tam, kde je co pustit. */}
              {v ? (
                <button
                  onClick={(e) => onPrehrat(s, v.id, e)}
                  className="mt-0.5 p-1.5 rounded-lg bg-[#FF453A]/15 hover:bg-[#FF453A]/30 text-[#FF453A] cursor-pointer shrink-0 transition-all"
                  title="Přehrát ukázku"
                >
                  <Play className="w-3 h-3 fill-current" />
                </button>
              ) : (
                <span className="mt-0.5 w-6 shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[13px] font-semibold truncate ${aktivni ? 'text-[#FF9F0A]' : 'text-white'}`}>
                    {s.title}
                  </span>
                  {s.isLocked && <Lock className="w-3 h-3 text-[#FF9F0A] shrink-0" />}
                </div>
                {/* V řádku je vidět jen to, co je zapnuté — jinak by se
                    do jednoho řádku mačkalo osm údajů, z nichž většina
                    člověka právě nezajímá. */}
                <div className="text-[11px] text-neutral-500 truncate">
                  {zapnute.map((k, i) => {
                    const v = hodnota(s, k);
                    if (!v) return null;
                    return (
                      <span key={k} className={razeni === k ? 'text-neutral-300' : ''}>
                        {i > 0 && <span className="text-neutral-700"> · </span>}
                        {v}
                      </span>
                    );
                  })}
                  {zapnute.every((k) => !hodnota(s, k)) && (
                    <span className="text-neutral-700">{s.artist || 'Neznámý interpret'}</span>
                  )}
                </div>

                {pohled === 'detail' && (
                  <div className="mt-1.5 space-y-1.5">
                    {v && (
                      <img
                        src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                        alt=""
                        loading="lazy"
                        className="w-40 rounded-lg border border-white/10"
                      />
                    )}
                    <div className="flex flex-wrap gap-1">
                      {(s as any).genre && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400">
                          {(s as any).genre}
                        </span>
                      )}
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
                  </div>
                )}
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
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
          );
        })}
      </div>
    </div>
  );
};
