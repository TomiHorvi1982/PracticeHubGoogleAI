import { HlavickaSekce } from './ui/HlavickaSekce';
import React, { useEffect, useMemo, useState } from 'react';
import { PenLine, Mic, FileText, Check, AlertCircle, Languages } from 'lucide-react';
import { songDatabaseService } from '../services/songDatabaseService';
import { Song } from '../types';
import { UsekPrepisu, cas } from '../services/textyService';
import { PrepisPanel } from './texty/PrepisPanel';
import { EditorTextu } from './texty/EditorTextu';
import { DiktovaniPanel } from './texty/DiktovaniPanel';

/**
 * Texty.
 *
 * Dvě strany jedné práce. Přepis vytáhne z nahrávky, co se zpívalo —
 * včetně časů, takže se text dá pustit na Pódiu vedle přehrávače.
 * Editor je na to, co se ještě nezpívalo: hlídá slabiky a rýmy, aby to
 * šlo zazpívat, ne jen přečíst.
 *
 * Text se ukládá do písně ve zpěvníku, ne stranou — jinak by kapela měla
 * dvě verze a nikdo by nevěděl, která platí.
 */

type Zalozka = 'psani' | 'prepis' | 'diktovani';

/** Časy z přepisu jako komentář nad řádkem — zůstanou, ale nezpívají se. */
function jakoText(useky: UsekPrepisu[], sCasy: boolean): string {
  if (!sCasy) return useky.map((u) => u.text).join('\n');
  return useky.map((u) => `{${cas(u.zacatek)}}\n${u.text}`).join('\n');
}

export const TextySection: React.FC = () => {
  const [zalozka, setZalozka] = useState<Zalozka>('psani');
  const [pisne, setPisne] = useState<Song[]>(songDatabaseService.getSongs());
  const [vybrana, setVybrana] = useState<string>('');
  const [text, setText] = useState('');
  const [sCasy, setSCasy] = useState(true);
  const [uklada, setUklada] = useState(false);
  const [hlaska, setHlaska] = useState<{ text: string; chyba?: boolean } | null>(null);

  useEffect(() => songDatabaseService.subscribe(setPisne), []);

  const pisen = useMemo(() => pisne.find((p) => p.id === vybrana) || null, [pisne, vybrana]);

  // Slovník na rýmy: texty všech ostatních písní. Vlastní se vynechá,
  // ať se nenabízí to, co už na obrazovce stojí.
  const korpus = useMemo(
    () => pisne.filter((p) => p.id !== vybrana).map((p) => p.content || '').filter((t) => t.length > 20),
    [pisne, vybrana]
  );

  const otevri = (id: string) => {
    setVybrana(id);
    setText(pisne.find((p) => p.id === id)?.content || '');
    setHlaska(null);
  };

  const uloz = async () => {
    if (!pisen) return;
    setUklada(true);
    setHlaska(null);
    try {
      await songDatabaseService.saveSong({ ...pisen, content: text });
      setHlaska({ text: `Uloženo do „${pisen.title}".` });
    } catch (e: any) {
      setHlaska({ text: e?.message || 'Uložení selhalo.', chyba: true });
    } finally {
      setUklada(false);
    }
  };

  const vlozPrepis = (useky: UsekPrepisu[]) => {
    const novy = jakoText(useky, sCasy);
    setText((t) => (t.trim() ? `${t.trim()}\n\n${novy}` : novy));
    setZalozka('psani');
  };

  return (
    <div className="space-y-4 font-sans text-white pb-12">
      {/* Hlavička je venku z karty: uvnitř zůstalo jen to, co se
          používá. Odznak nad nadpisem opakoval název sekce z navigace. */}
      <HlavickaSekce
        nazev="Psaní a přepis"
        klic="texty"
        napoveda="Přepis vytáhne text z nahrávky i s časy; editor hlídá slabiky a rýmy. Obojí se ukládá rovnou do písně ve zpěvníku."
      />

      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl">

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setZalozka('psani')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              zalozka === 'psani' ? 'bg-nastroj text-white' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
            }`}
          >
            <PenLine className="w-3.5 h-3.5" /> Psaní
          </button>
          <button
            onClick={() => setZalozka('prepis')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              zalozka === 'prepis' ? 'bg-nastroj text-white' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" /> Přepis z nahrávky
          </button>
          <button
            onClick={() => setZalozka('diktovani')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              zalozka === 'diktovani' ? 'bg-nastroj text-white' : 'bg-white/[0.05] text-neutral-400 hover:text-white'
            }`}
          >
            <Languages className="w-3.5 h-3.5" /> Diktování & překlad
          </button>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={vybrana}
              onChange={(e) => otevri(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-nastroj max-w-[240px]"
            >
              <option value="">— vyber píseň —</option>
              {pisne.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.artist} — {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hlaska && (
          <p
            className={`text-drobne mt-2 flex items-center gap-1.5 ${
              hlaska.chyba ? 'text-chyba' : 'text-uspech'
            }`}
          >
            {hlaska.chyba ? <AlertCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            {hlaska.text}
          </p>
        )}
      </div>

      {zalozka === 'diktovani' ? (
        <DiktovaniPanel
          onVlozit={(novy) => {
            // Diktovaný text se přidává pod ten stávající, ne místo něj —
            // sloka se často doříkává na několikrát.
            setText((p) => (p ? `${p}\n${novy}` : novy));
            setZalozka('psani');
            setHlaska({ text: 'Nadiktovaný text je v editoru.' });
          }}
        />
      ) : zalozka === 'psani' ? (
        <EditorTextu
          text={text}
          onZmena={setText}
          korpus={korpus}
          onUlozit={pisen ? uloz : undefined}
          uklada={uklada}
        />
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-drobne text-neutral-400 cursor-pointer">
            <input
              type="checkbox"
              checked={sCasy}
              onChange={(e) => setSCasy(e.target.checked)}
              className="accent-nastroj"
            />
            Vložit i časy ve složených závorkách — text pak jde na Pódiu rolovat podle přehrávače.
          </label>
          <PrepisPanel onVlozit={vlozPrepis} />
        </div>
      )}
    </div>
  );
};
