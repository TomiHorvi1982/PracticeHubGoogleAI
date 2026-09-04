import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, VolumeX, ShieldAlert, Check, CornerDownLeft, Loader2, Eraser } from 'lucide-react';
import { Moznosti, poslouchej, zjistiMoznosti } from '../../services/hlas/poslech';
import { doAnglictiny, prectiAnglicky, prestanCist, CestaPrekladu } from '../../services/hlas/prekladac';

/**
 * Diktování textu s překladem do angličtiny.
 *
 * Zpívá se do mikrofonu, appka to zapisuje, rovnou překládá a umí to
 * anglicky přečíst. Nahrává se po kouscích a ne souvisle: whisper stejně
 * počítá po úsecích a kratší kus se dřív objeví na obrazovce, takže je
 * vidět, jestli to vůbec zachytává správně.
 */

interface Props {
  onVlozit: (text: string) => void;
}

export const DiktovaniPanel: React.FC<Props> = ({ onVlozit }) => {
  const [moznosti, setMoznosti] = useState<Moznosti | null>(null);
  const [bezi, setBezi] = useState(false);
  const [cesky, setCesky] = useState('');
  const [anglicky, setAnglicky] = useState('');
  const [cestaPrekladu, setCestaPrekladu] = useState<CestaPrekladu | null>(null);
  const [prekladaSe, setPrekladaSe] = useState(false);
  const [cistNahlas, setCistNahlas] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const beziRef = useRef(false);
  const cistRef = useRef(false);
  cistRef.current = cistNahlas;

  useEffect(() => {
    void zjistiMoznosti().then(setMoznosti);
    return () => {
      beziRef.current = false;
      prestanCist();
    };
  }, []);

  /**
   * Přeloží, co zatím padlo.
   *
   * Překládá se celý text, ne jednotlivé kousky: věta rozseknutá mezi
   * dvěma nahrávkami by se po částech přeložila špatně.
   */
  const prelozVse = async (zdroj: string, precist: boolean) => {
    if (!zdroj.trim()) return;
    setPrekladaSe(true);
    try {
      const v = await doAnglictiny(zdroj);
      setAnglicky(v.text);
      setCestaPrekladu(v.cesta);
      if (precist) void prectiAnglicky(v.text);
    } catch (e: any) {
      setChyba(e?.message || 'Překlad se nepodařil.');
    } finally {
      setPrekladaSe(false);
    }
  };

  const zacni = async () => {
    if (!moznosti || moznosti.cesta === 'zadna') return;
    setChyba(null);
    setBezi(true);
    beziRef.current = true;

    // Poslouchá se v kolečku: jeden kousek, zapsat, další. Mezi kousky
    // je mikrofon na okamžik zavřený, což je daň za to, že je průběžně
    // vidět, co appka slyší.
    while (beziRef.current) {
      try {
        const kus = (await poslouchej(moznosti.cesta).vysledek).trim();
        if (!beziRef.current) break;
        if (kus) {
          setCesky((p) => {
            const cely = p ? `${p}\n${kus}` : kus;
            void prelozVse(cely, cistRef.current);
            return cely;
          });
        }
      } catch (e: any) {
        setChyba(e?.message || 'Nahrávání selhalo.');
        break;
      }
    }

    beziRef.current = false;
    setBezi(false);
  };

  const zastav = () => {
    beziRef.current = false;
    setBezi(false);
  };

  if (moznosti && moznosti.cesta === 'zadna') {
    return (
      <div className="bg-plocha-2 border border-white/[0.08] rounded-3xl p-5 text-xs text-neutral-400">
        {moznosti.duvod}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {moznosti && (
        <div
          className={`rounded-2xl border p-3 text-drobne flex items-start gap-2 ${
            moznosti.odesilaVen
              ? 'bg-amber-500/[0.08] border-amber-500/30 text-amber-200'
              : 'bg-uspech/[0.06] border-uspech/30 text-uspech'
          }`}
        >
          {moznosti.odesilaVen ? <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" /> : <Check className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>
            {moznosti.duvod}
            {cestaPrekladu && ` Překlad: ${cestaPrekladu === 'prohlížeč'
              ? 'vestavěný v prohlížeči, text nikam neodchází.'
              : 'přes server, text jde ke zpracování Googlu.'}`}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => (bezi ? zastav() : void zacni())}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${
            bezi ? 'bg-chyba text-white' : 'bg-nastroj text-white hover:bg-[#c96ff5]'
          }`}
        >
          {bezi ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          {bezi ? 'Zastavit' : 'Začít diktovat'}
        </button>

        <button
          onClick={() => {
            const zapnuto = !cistNahlas;
            setCistNahlas(zapnuto);
            if (!zapnuto) prestanCist();
            else if (anglicky) void prectiAnglicky(anglicky);
          }}
          title="Číst překlad anglicky nahlas"
          className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer ${
            cistNahlas
              ? 'bg-uspech/15 border-uspech/40 text-uspech'
              : 'bg-white/[0.06] border-white/10 text-neutral-300'
          }`}
        >
          {cistNahlas ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          Číst anglicky
        </button>

        {prekladaSe && <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />}

        {(cesky || anglicky) && (
          <button
            onClick={() => { setCesky(''); setAnglicky(''); setCestaPrekladu(null); prestanCist(); }}
            className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] border border-white/10 text-neutral-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" /> Vymazat
          </button>
        )}
      </div>

      {chyba && (
        <p className="text-drobne text-chyba">{chyba}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-plocha-2 border border-white/[0.08] rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-stitek uppercase tracking-widest text-neutral-500">Česky</span>
            {cesky && (
              <button
                onClick={() => onVlozit(cesky)}
                className="text-drobne text-nastroj hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <CornerDownLeft className="w-3 h-3" /> Vložit do textu
              </button>
            )}
          </div>
          <textarea
            value={cesky}
            onChange={(e) => setCesky(e.target.value)}
            onBlur={() => void prelozVse(cesky, false)}
            placeholder={bezi ? 'Poslouchám — zpívej nebo mluv…' : 'Zatím nic. Zmáčkni „Začít diktovat".'}
            className="w-full h-48 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs leading-relaxed resize-none outline-none focus:border-nastroj"
          />
        </div>

        <div className="bg-plocha-2 border border-white/[0.08] rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-stitek uppercase tracking-widest text-neutral-500">Anglicky</span>
            {anglicky && (
              <button
                onClick={() => void prectiAnglicky(anglicky)}
                className="text-drobne text-uspech hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3 h-3" /> Přečíst
              </button>
            )}
          </div>
          <textarea
            value={anglicky}
            readOnly
            placeholder="Překlad se doplní sám."
            className="w-full h-48 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs leading-relaxed resize-none outline-none text-neutral-300"
          />
        </div>
      </div>
    </div>
  );
};
