import React, { useEffect, useState } from 'react';
import { ListMusic, ChevronUp, ChevronDown, X, GripVertical, Maximize2 } from 'lucide-react';
import { Song } from '../../types';
import { setListy, SetList } from '../../services/setListy';

interface Props {
  songs: Song[];
  /** Otevře Pódium — odsud se set jen skládá, hraje se tam. */
  onNaPodium: () => void;
}

/**
 * Set list v knihovně.
 *
 * Skládá se tu program: co se bude hrát a v jakém pořadí. Přehrávání sem
 * nepatří — od toho je Pódium. Kdyby šlo pustit skladbu i odsud, byla by
 * na dvou místech dvě různá „právě hraje" a nikdo by nevěděl, které platí.
 */
export const SetListPanel: React.FC<Props> = ({ songs, onNaPodium }) => {
  const [sety, setSety] = useState<SetList[]>(setListy.hratelne());
  // Naskočí set, ve kterém něco je. Prázdný set na první pohled vypadá,
  // jako by se přidané skladby ztratily.
  const [vybrany, setVybrany] = useState<string>(() => {
    const h = setListy.hratelne();
    return (h.find((s) => s.songIds.length > 0) || h[0])?.id || '';
  });
  const [tazene, setTazene] = useState<number | null>(null);

  useEffect(() => setListy.subscribe(() => setSety(setListy.hratelne())), []);

  const set = sety.find((s) => s.id === vybrany) || sety[0] || null;
  const vSetu = set
    ? (set.songIds.map((id) => songs.find((s) => s.id === id)).filter(Boolean) as Song[])
    : [];

  // Skladba, která v knihovně chybí (smazaná), by v setu zůstala jako
  // prázdné místo — poznat by to šlo až na pódiu, kdy se nepřepne.
  const chybejici = set ? set.songIds.length - vSetu.length : 0;

  const presun = (z: number, na: number) => set && setListy.presun(set.id, z, na);

  return (
    <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 sm:p-5 shadow-xl space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <ListMusic className="w-4 h-4 text-[#FF9F0A] shrink-0" />
        <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Set list</h2>
        <span className="text-[10px] text-neutral-500">pořadí, ve kterém se bude hrát</span>

        {sety.length > 1 && (
          <select
            value={set?.id || ''}
            onChange={(e) => setVybrany(e.target.value)}
            className="bg-black/50 border border-white/10 text-white text-[11px] font-semibold rounded-lg px-2 py-1 outline-none focus:border-[#FF9F0A] cursor-pointer"
          >
            {sety.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.songIds.length})
              </option>
            ))}
          </select>
        )}

        <button
          onClick={onNaPodium}
          className="ml-auto px-3 py-1.5 bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Na Pódium
        </button>
      </div>

      {vSetu.length === 0 ? (
        <p className="text-[11px] text-neutral-600">
          Set je prázdný. Přidej skladby ikonou v seznamu vpravo.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-black/20 overflow-hidden">
          {vSetu.map((s, i) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => setTazene(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (tazene !== null && tazene !== i) presun(tazene, i);
                setTazene(null);
              }}
              onDragEnd={() => setTazene(null)}
              className={`flex items-center gap-2 px-3 py-1.5 transition-all ${
                tazene === i ? 'opacity-40' : 'hover:bg-white/[0.04]'
              }`}
            >
              <GripVertical className="w-3.5 h-3.5 text-neutral-600 shrink-0 cursor-grab active:cursor-grabbing" />
              <span className="w-5 text-[10px] font-mono text-neutral-600 tabular-nums shrink-0">
                {i + 1}.
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-white truncate">{s.title}</div>
                <div className="text-[10px] text-neutral-500 truncate">
                  {s.artist}
                  {s.bpm ? <span className="ml-1.5 tabular-nums">{s.bpm} BPM</span> : null}
                  {s.key ? <span className="ml-1.5">{s.key}</span> : null}
                </div>
              </div>

              {/* Šipky vedle tažení: myší se to táhne rychleji, ale na
                  dotyku a jednou rukou u kytary je klik spolehlivější. */}
              <button
                onClick={() => presun(i, i - 1)}
                disabled={i === 0}
                className="p-1 rounded-md hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                title="Posunout výš"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => presun(i, i + 1)}
                disabled={i === vSetu.length - 1}
                className="p-1 rounded-md hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                title="Posunout níž"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => set && setListy.odeber(set.id, s.id)}
                className="p-1 rounded-md hover:bg-[#FF453A]/20 text-neutral-500 hover:text-[#FF453A] cursor-pointer"
                title="Odebrat ze setu"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {chybejici > 0 && (
        <p className="text-[10px] text-[#FF9F0A]">
          {chybejici}× skladba v setu, která už v knihovně není — na Pódiu se přeskočí.
        </p>
      )}
    </div>
  );
};
