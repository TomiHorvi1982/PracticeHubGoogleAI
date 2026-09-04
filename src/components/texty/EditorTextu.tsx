import React, { useMemo, useRef, useState } from 'react';
import { Sparkles, Save, Copy, Check } from 'lucide-react';
import { slabiky, posledniSlovo, schemaRymu, najdiRymy } from '../../services/cestinaTextu';

/**
 * Psaní textu.
 *
 * Vedle řádků stojí dvě čísla, která se při psaní ztrácejí: kolik má
 * řádek slabik a čemu se rýmuje. Obojí si zpěvák spočítá sám, ale až
 * když to zkusí zazpívat — a to je pozdě, protože sloka je hotová.
 *
 * Rýmy se hledají ve vlastních textech kapely, ne ve slovníku. Slovník
 * nabízí spisovná slova, která si do písně nikdo nedá.
 */
export const EditorTextu: React.FC<{
  text: string;
  onZmena: (t: string) => void;
  /** Texty ostatních písní — slovník na rýmy. */
  korpus: string[];
  onUlozit?: () => void;
  uklada?: boolean;
}> = ({ text, onZmena, korpus, onUlozit, uklada }) => {
  const [radek, setRadek] = useState(0);
  const [zkopirovano, setZkopirovano] = useState<string | null>(null);
  const pole = useRef<HTMLTextAreaElement>(null);

  const radky = useMemo(() => text.split('\n'), [text]);
  const schema = useMemo(() => schemaRymu(radky), [radky]);
  const pocty = useMemo(() => radky.map(slabiky), [radky]);

  const slovo = posledniSlovo(radky[radek] || '');
  const navrhy = useMemo(
    () => (slovo ? najdiRymy(slovo, [text, ...korpus]) : []),
    [slovo, text, korpus]
  );

  /** Kde v textu stojí kurzor, přepočteno na číslo řádku. */
  const zjistiRadek = () => {
    const el = pole.current;
    if (!el) return;
    setRadek(el.value.slice(0, el.selectionStart).split('\n').length - 1);
  };

  const vloz = (co: string) => {
    const el = pole.current;
    if (!el) return;
    const pozice = el.selectionStart;
    onZmena(text.slice(0, pozice) + co + text.slice(el.selectionEnd));
    // Kurzor musí skončit za vloženým slovem, ne skočit na začátek.
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(pozice + co.length, pozice + co.length);
    }, 0);
  };

  const celkem = pocty.reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-white flex-1">Text</h3>
          <span className="text-stitek text-neutral-500 tabular-nums">
            {radky.filter((r) => r.trim()).length} řádků · {celkem} slabik
          </span>
          {onUlozit && (
            <button
              onClick={onUlozit}
              disabled={uklada}
              className="px-3 py-1.5 rounded-xl bg-uspech text-black text-drobne font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> {uklada ? 'Ukládám…' : 'Uložit do písně'}
            </button>
          )}
        </div>

        {/*
          Čísla stojí vedle textového pole ve vlastním sloupci a rolují s
          ním. Vypisovat je do textu samotného by znamenalo, že se uloží
          do písně spolu s ním.
        */}
        <div className="relative flex gap-2 max-h-[52vh] overflow-y-auto">
          <div className="shrink-0 pt-[9px] font-mono text-drobne leading-6 text-right select-none">
            {radky.map((_, i) => (
              <div key={i} className="flex gap-1.5 justify-end px-1">
                <span
                  className={`w-4 ${
                    schema[i] === '·' ? 'text-neutral-700' : 'text-nastroj font-bold'
                  }`}
                >
                  {schema[i]}
                </span>
                <span className={`w-5 tabular-nums ${i === radek ? 'text-white' : 'text-neutral-600'}`}>
                  {pocty[i] || ''}
                </span>
              </div>
            ))}
          </div>

          <textarea
            ref={pole}
            value={text}
            onChange={(e) => onZmena(e.target.value)}
            onKeyUp={zjistiRadek}
            onClick={zjistiRadek}
            spellCheck={false}
            placeholder={'[Sloka]\nNebe nad městem hoří,\nptáci mlčí v korunách.'}
            className="flex-1 min-h-[40vh] bg-black/40 border border-white/10 rounded-xl px-3 py-2 font-mono text-drobne leading-6 text-white placeholder-neutral-700 outline-none focus:border-nastroj resize-none"
          />
        </div>

        <p className="text-stitek text-neutral-600">
          Písmeno vlevo je rýmová dvojice, číslo počet slabik. Sekce piš do hranatých závorek —
          <span className="text-neutral-500"> [Sloka]</span>,
          <span className="text-neutral-500"> [Refrén]</span> — do slabik se nepočítají.
        </p>
      </div>

      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3 self-start">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-nastroj" />
          <h4 className="text-sm font-bold text-white">Rýmy</h4>
        </div>

        {slovo ? (
          <>
            <p className="text-drobne text-neutral-400">
              Na konci řádku je <strong className="text-white">{slovo}</strong>
              {pocty[radek] ? ` — ${pocty[radek]} slabik` : ''}
            </p>
            {navrhy.length ? (
              <div className="flex flex-wrap gap-1">
                {navrhy.map((n) => (
                  <button
                    key={n}
                    onClick={() => { vloz(n); setZkopirovano(n); window.setTimeout(() => setZkopirovano(null), 900); }}
                    className="px-2 py-1 rounded-lg bg-white/[0.06] text-drobne text-neutral-200 hover:bg-nastroj hover:text-white cursor-pointer flex items-center gap-1"
                    title="Vložit na místo kurzoru"
                  >
                    {zkopirovano === n ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-40" />}
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-drobne text-neutral-600">
                Ve vašich textech se na tohle slovo nic nerýmuje. Čím víc písní v knihovně, tím víc
                slovník umí.
              </p>
            )}
          </>
        ) : (
          <p className="text-drobne text-neutral-600">
            Klikni do řádku a nabídnou se slova, která se rýmují s jeho koncem.
          </p>
        )}
      </div>
    </div>
  );
};
