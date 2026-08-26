import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Trash2, Loader2, MessageSquare } from 'lucide-react';
import { Song } from '../../types';
import { vzkazyService, barvaAutora, Vzkaz } from '../../services/vzkazyService';
import { authService } from '../../services/authService';

interface Props {
  song: Song;
}

function cas(iso: string): string {
  const d = new Date(iso);
  const dnes = new Date();
  const stejnyDen = d.toDateString() === dnes.toDateString();
  return stejnyDen
    ? d.toLocaleTimeString('cs', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('cs', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Vzkazník u písně.
 *
 * Co si kapela u jedné písně řekne, patří k ní — ne do textu a ne do
 * paměti do příští zkoušky. Každý má svou barvu, aby šlo přeběhnout očima,
 * kdo co napsal, bez čtení jmen.
 */
export const VzkazyModul: React.FC<Props> = ({ song }) => {
  const [vzkazy, setVzkazy] = useState<Vzkaz[]>([]);
  const [text, setText] = useState('');
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const konec = useRef<HTMLDivElement>(null);
  const ja = authService.getCurrentSession()?.user?.id;

  const nacti = useCallback(async () => {
    try {
      setVzkazy(await vzkazyService.nacti(song.id));
      setChyba(null);
    } catch (e: any) {
      setChyba(e?.message || 'Vzkazy se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, [song.id]);

  useEffect(() => {
    setNacitam(true);
    void nacti();
    return vzkazyService.sleduj(song.id, () => void nacti());
  }, [song.id, nacti]);

  // Odroluje na poslední vzkaz. Vzkazník se čte odspodu — nahoře je to,
  // co už dávno padlo.
  useEffect(() => {
    konec.current?.scrollIntoView({ block: 'nearest' });
  }, [vzkazy.length]);

  const posli = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await vzkazyService.posli(song.id, t);
      await nacti();
    } catch (e: any) {
      setChyba(e?.message || 'Vzkaz se neodeslal.');
      setText(t); // ať se nemusí psát znovu
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      {chyba && <p className="text-[11px] text-[#FF453A] shrink-0">{chyba}</p>}

      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1">
        {nacitam && (
          <p className="text-[11px] text-neutral-600 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Načítám vzkazy…
          </p>
        )}

        {!nacitam && vzkazy.length === 0 && (
          <div className="text-center py-6 text-neutral-600 text-[11px] flex flex-col items-center gap-1.5">
            <MessageSquare className="w-5 h-5 text-neutral-700" />
            Zatím tu nic není. Napiš, na co si u téhle písně dát pozor.
          </div>
        )}

        {vzkazy.map((v) => {
          const b = barvaAutora(v.author_id);
          const moje = v.author_id === ja;
          return (
            <div
              key={v.id}
              className={`rounded-xl border px-2.5 py-1.5 group ${b.pozadi} ${b.okraj}`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[11px] font-bold ${b.text}`}>{v.author_name || 'Někdo'}</span>
                <span className="text-[9px] text-neutral-600 font-mono">{cas(v.created_at)}</span>
                {moje && (
                  <button
                    onClick={() => {
                      void vzkazyService.smaz(v.id).then(nacti);
                    }}
                    className="ml-auto p-0.5 rounded text-neutral-700 hover:text-[#FF453A] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Smazat vzkaz"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-[12px] text-neutral-200 whitespace-pre-wrap break-words">{v.body}</p>
            </div>
          );
        })}
        <div ref={konec} />
      </div>

      <div className="flex gap-1.5 shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void posli();
            }
          }}
          placeholder="Napiš vzkaz ke skladbě…"
          className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-[12px] text-white placeholder-neutral-600 outline-none focus:border-[#FF9F0A]"
        />
        <button
          onClick={() => void posli()}
          disabled={!text.trim()}
          className="px-2.5 py-1.5 bg-[#FF9F0A] hover:bg-[#FF9F0A]/85 text-black rounded-xl cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Odeslat"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
