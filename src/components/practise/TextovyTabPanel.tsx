import React, { useMemo, useState } from 'react';
import { FileText, AlertCircle, Eraser, FileUp, Loader2 } from 'lucide-react';
import { tabNaDoby, STANDARDNI_LADENI } from '../../services/textovyTab';
import { usekZDob, TIKU_NA_CTVRTKU } from '../../services/gpUsek';
import { HmatnikUseku } from './HmatnikUseku';
import { authService } from '../../services/authService';

/**
 * Cvičení z textové (ASCII) tabulatury.
 *
 * Vložený tab se přečte na struny a pražce a pustí se do téhož hmatníku
 * jako úsek z Guitar Pro. Rozdíl je v jedné věci, a ta musí být vidět:
 * textový tab nenese rytmus, takže se tóny rozestaví rovnoměrně a délku
 * si volí člověk. Předstírat přesný zápis by bylo horší než to přiznat.
 */

const DELKY: { nazev: string; tiku: number }[] = [
  { nazev: 'čtvrťky', tiku: TIKU_NA_CTVRTKU },
  { nazev: 'osminy', tiku: TIKU_NA_CTVRTKU / 2 },
  { nazev: 'šestnáctiny', tiku: TIKU_NA_CTVRTKU / 4 },
];

/** Ladění, se kterými se běžně setkáš. Půltón dolů a drop D pokryjí většinu. */
const LADENI: { nazev: string; tony: number[] }[] = [
  { nazev: 'Standardní E', tony: STANDARDNI_LADENI },
  { nazev: 'Půltón dolů', tony: STANDARDNI_LADENI.map((t) => t - 1) },
  { nazev: 'Drop D', tony: [64, 59, 55, 50, 45, 38] },
  { nazev: 'Drop C', tony: [62, 57, 53, 48, 43, 36] },
];

export const TextovyTabPanel: React.FC<{ bpm?: number }> = ({ bpm = 100 }) => {
  const [text, setText] = useState('');
  const [delka, setDelka] = useState(DELKY[1].tiku);
  const [ladeni, setLadeni] = useState(0);
  const [ctuPdf, setCtuPdf] = useState(false);
  const [zPdf, setZPdf] = useState<{ zpusob: 'text' | 'ocr'; stran: number } | null>(null);
  const [chybaPdf, setChybaPdf] = useState<string | null>(null);

  /**
   * Načte tabulaturu z PDF jako návrh.
   *
   * Text se vloží do pole, kde se dá opravit — a ne rovnou přehraje.
   * Ani dobré přečtení nemusí sloupce udržet a u skenu se rozpoznávání
   * plete tiše, takže poslední slovo musí mít člověk, ne nástroj.
   */
  const nactiPdf = async (soubor: File) => {
    setCtuPdf(true);
    setChybaPdf(null);
    setZPdf(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const r = await fetch('/api/pdf/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: await soubor.arrayBuffer(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'PDF se nepodařilo přečíst.');
      setText(d.text || '');
      setZPdf({ zpusob: d.zpusob, stran: d.stran });
    } catch (e: any) {
      setChybaPdf(e?.message || 'PDF se nepodařilo přečíst.');
    } finally {
      setCtuPdf(false);
    }
  };

  const usek = useMemo(() => {
    if (!text.trim()) return null;
    const doby = tabNaDoby(text, LADENI[ladeni].tony, delka);
    if (!doby.length) return null;
    const konec = doby[doby.length - 1].start + delka;
    return usekZDob(doby, 0, konec);
  }, [text, delka, ladeni]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-znacka" /> Textový tab
        </span>

        <label className="flex items-center gap-1.5">
          <span className="text-stitek uppercase tracking-widest text-neutral-500">Ladění</span>
          <select
            value={ladeni}
            onChange={(e) => setLadeni(Number(e.target.value))}
            className="bg-black/40 border border-white/10 rounded-xl px-2 py-1.5 text-drobne text-white outline-none cursor-pointer"
          >
            {LADENI.map((l, i) => <option key={l.nazev} value={i}>{l.nazev}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-stitek uppercase tracking-widest text-neutral-500">Nota</span>
          <select
            value={delka}
            onChange={(e) => setDelka(Number(e.target.value))}
            className="bg-black/40 border border-white/10 rounded-xl px-2 py-1.5 text-drobne text-white outline-none cursor-pointer"
          >
            {DELKY.map((d) => <option key={d.nazev} value={d.tiku}>{d.nazev}</option>)}
          </select>
        </label>

        <label className={`px-2.5 py-1.5 rounded-xl text-drobne font-semibold border flex items-center gap-1.5 cursor-pointer ${
          ctuPdf ? 'opacity-50' : 'bg-white/[0.06] border-white/10 text-neutral-300 hover:text-white'
        }`}>
          {ctuPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
          Načíst z PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={ctuPdf}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void nactiPdf(f);
              e.target.value = '';
            }}
          />
        </label>

        {text && (
          <button
            onClick={() => setText('')}
            className="px-2.5 py-1.5 rounded-xl text-drobne font-semibold bg-white/[0.06] border border-white/10 text-neutral-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" /> Vymazat
          </button>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder={'Vlož sem tabulaturu, šest řádků pod sebou:\n\ne|-----------5--|\nB|--------4-----|\nG|-----3--------|\nD|--2-----------|\nA|-0------------|\nE|--------------|'}
        className="w-full h-44 bg-black/40 border border-white/10 rounded-2xl px-3 py-2 text-drobne font-mono leading-snug text-white placeholder-neutral-700 outline-none focus:border-znacka resize-y"
      />

      {/* Rytmus v ASCII tabulatuře není. Kdo to neví, bude se divit,
          proč mu to nesedí na nahrávku. */}
      <p className="text-drobne text-amber-500/80 flex items-start gap-1.5 leading-relaxed">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Textový tab neobsahuje rytmus — jen to, co a kde se hraje. Tóny se proto rozestaví
        rovnoměrně podle zvolené noty. Přesné délky má jen Guitar Pro.
      </p>

      {chybaPdf && (
        <p className="text-drobne text-chyba flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {chybaPdf}
        </p>
      )}

      {/* Jak se k textu došlo. Z rozpoznaného skenu je potřeba být
          podezřívavější než z textové vrstvy. */}
      {zPdf && (
        <p className={`text-drobne flex items-start gap-1.5 leading-relaxed ${
          zPdf.zpusob === 'ocr' ? 'text-amber-500/90' : 'text-uspech'
        }`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {zPdf.zpusob === 'text'
            ? `Přečteno z textové vrstvy PDF (${zPdf.stran} str.). Projdi to — sloupce se při převodu občas rozjedou.`
            : `PDF nemá text, šlo to přes rozpoznávání znaků (${zPdf.stran} str.). U tabulatury se to plete: čísla i pomlčky si projdi řádek po řádku, než začneš cvičit.`}
        </p>
      )}

      {text.trim() && !usek && (
        <p className="text-drobne text-chyba">
          V tomhle textu žádnou tabulaturu nevidím. Čekám šest řádků s pomlčkami a čísly.
        </p>
      )}

      {usek && <HmatnikUseku usek={usek} bpm={bpm} />}
    </div>
  );
};
