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
  const [razeni, setRazeni] = useState<KlicRazeni>(() => {
    try {
      return (localStorage.getItem('neverlate_razeni') as KlicRazeni) || 'song';
    } catch {
      return 'song';
    }
  });
  const [sestupne, setSestupne] = useState(false);
  const [nabidkaRazeni, setNabidkaRazeni] = useState(false);
  const [pohled, setPohled] = useState<'line' | 'detail'>(() => {
    try {
      return (localStorage.getItem('neverlate_pohled') as 'line' | 'detail') || 'line';
    } catch {
      return 'line';
    }
  });

  const nastavRazeni = (k: KlicRazeni) => {
    setRazeni(k);
    setNabidkaRazeni(false);
    try {
      localStorage.setItem('neverlate_razeni', k);
    } catch {
      /* plné úložiště nesmí zabránit řazení */
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
  const popisRazeni = MOZNOSTI_RAZENI.find((m) => m.klic === razeni)?.popis || 'Název skladby';

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setNabidkaRazeni((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-[11px] font-semibold text-neutral-300 cursor-pointer transition-all"
          >
            <ArrowUpDown className="w-3 h-3 text-[#FF9F0A]" />
            {popisRazeni}
            <ChevronDown className="w-3 h-3 text-neutral-500" />
          </button>

          {nabidkaRazeni && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-[#16161A] border border-white/[0.12] rounded-2xl shadow-2xl p-1.5 min-w-[180px]">
              {MOZNOSTI_RAZENI.map((m) => (
                <button
                  key={m.klic}
                  onClick={() => nastavRazeni(m.klic)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] cursor-pointer transition-all ${
                    razeni === m.klic ? 'bg-[#FF9F0A] text-black font-bold' : 'text-neutral-300 hover:bg-white/10'
                  }`}
                >
                  {m.popis}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setSestupne((v) => !v)}
          className="px-2 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-[11px] font-mono text-neutral-400 cursor-pointer transition-all"
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
                <div className="text-[11px] text-neutral-500 truncate">
                  {s.artist || 'Neznámý interpret'}
                  {s.key && <span className="ml-1.5 text-neutral-600">· {s.key}</span>}
                  {s.bpm ? <span className="ml-1.5 text-neutral-600">· {s.bpm} BPM</span> : null}
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
