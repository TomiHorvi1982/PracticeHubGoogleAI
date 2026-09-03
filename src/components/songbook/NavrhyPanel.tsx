import React, { useState } from 'react';
import { Check, X, Sparkles, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Song } from '../../types';
import { authService } from '../../services/authService';

/** Jeden nález, který si appka nebyla jistá dost na to, aby ho připojila. */
interface Navrh {
  druh: string;
  nazev: string;
  zdroj: string;
  jistota: number;
}

interface Props {
  song: Song;
  onZmena: () => void;
}

const POPIS_DRUHU: Record<string, string> = {
  guitar_pro: 'Tabulatura',
  akordy: 'Akordy',
  text: 'Text',
  midi: 'MIDI',
  groove: 'Bicí groove',
  noty: 'Noty',
};

/**
 * Co appka k písni našla, ale nebyla si tím jistá.
 *
 * Jisté nálezy se připojí samy; sem padá zbytek. Bez tohohle panelu by se
 * návrhy ukládaly k písni a nikdo by se k nim nedostal — hledání by
 * napůl vyšumělo.
 */
export const NavrhyPanel: React.FC<Props> = ({ song, onZmena }) => {
  const navrhy: Navrh[] = ((song as any).navrhy as Navrh[]) || [];
  const [otevreno, setOtevreno] = useState(false);
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [hlaska, setHlaska] = useState<string | null>(null);

  if (navrhy.length === 0) return null;

  const vyres = async (index: number, akce: 'prijmout' | 'odmitnout') => {
    setPracuji(index);
    setHlaska(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const res = await fetch(`/api/songs/${song.id}/navrhy/${index}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ akce }),
      });
      const d = await res.json();
      setHlaska(d.popis || (res.ok ? 'Hotovo.' : 'Nepodařilo se.'));
      // Seznam se musí přenačíst ze skladby — po vyřešení se pořadí posune
      // a další kliknutí by jinak mířilo na jiný návrh.
      if (res.ok) onZmena();
    } catch (e: any) {
      setHlaska(e?.message || 'Nepodařilo se.');
    } finally {
      setPracuji(null);
    }
  };

  return (
    <div className="bg-[#16161A]/80 backdrop-blur-xl border border-[#FF9F0A]/25 rounded-3xl p-4 shadow-xl space-y-3">
      <button
        onClick={() => setOtevreno((v) => !v)}
        className="w-full flex items-center gap-2 text-left cursor-pointer"
      >
        {otevreno ? (
          <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
        )}
        <Sparkles className="w-4 h-4 text-[#FF9F0A] shrink-0" />
        <span className="text-sm font-bold text-white">
          Appka našla ještě {navrhy.length} {navrhy.length < 5 ? 'věci' : 'věcí'}, ale není si jistá
        </span>
      </button>

      {!otevreno && (
        <p className="text-drobne text-neutral-400 pl-6">
          Klikni a vyber, co k písni patří. Co odmítneš, se znovu nenabídne.
        </p>
      )}

      {otevreno && (
        <div className="space-y-1.5">
          {navrhy.map((n, i) => (
            <div
              key={`${n.nazev}-${i}`}
              className="flex items-center gap-2 bg-black/30 border border-white/[0.06] rounded-2xl px-3 py-2"
            >
              <span className="text-stitek font-bold uppercase tracking-wider text-[#FF9F0A] bg-[#FF9F0A]/10 px-1.5 py-0.5 rounded shrink-0">
                {POPIS_DRUHU[n.druh] || n.druh}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-drobne text-white truncate">{n.nazev}</div>
                <div className="text-stitek text-neutral-500">
                  {n.zdroj} · shoda {Math.round(n.jistota * 100)} %
                </div>
              </div>
              {pracuji === i ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#FF9F0A] shrink-0" />
              ) : (
                <>
                  <button
                    onClick={() => void vyres(i, 'prijmout')}
                    className="p-1.5 rounded-lg bg-[#30D158]/15 hover:bg-[#30D158]/30 text-[#30D158] cursor-pointer transition-all shrink-0"
                    title="Připojit k písni"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => void vyres(i, 'odmitnout')}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-[#FF453A]/25 text-neutral-400 hover:text-[#FF453A] cursor-pointer transition-all shrink-0"
                    title="Nepatří k písni"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {hlaska && <p className="text-drobne text-[#30D158] pl-6">{hlaska}</p>}
    </div>
  );
};
