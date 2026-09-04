import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { audioSynth } from '../../services/audioSynth';
import { Aparat, NastaveniAparatu, VYCHOZI_APARAT, postavAparat } from '../../services/aparat';

/**
 * Ovládání kytarového aparátu.
 *
 * Sestaví řetěz nad zvukovým kontextem syntetizéru a zapojí ho do cesty
 * elektrických kytar. Ostatní nástroje jdou dál napřímo — zkreslený
 * klavír by nikdo nechtěl.
 */

const REGULATORY: { klic: keyof NastaveniAparatu; nazev: string; popis: string }[] = [
  { klic: 'drive', nazev: 'Drive', popis: 'Kolik se tlačí do zkreslení' },
  { klic: 'tone', nazev: 'Tone', popis: 'Od tupého k ostrému' },
  { klic: 'presence', nazev: 'Presence', popis: 'Lesk, kde je slyšet trsátko' },
  { klic: 'hlasitost', nazev: 'Hlasitost', popis: 'Výstup aparátu' },
];

export const AparatOvladani: React.FC = () => {
  const [zapnuty, setZapnuty] = useState(false);
  const [n, setN] = useState<NastaveniAparatu>(VYCHOZI_APARAT);
  const aparat = useRef<Aparat | null>(null);

  useEffect(() => () => {
    audioSynth.nastavAparat(null);
    aparat.current?.odpoj();
  }, []);

  const prepni = () => {
    if (zapnuty) {
      audioSynth.nastavAparat(null);
      aparat.current?.odpoj();
      aparat.current = null;
      setZapnuty(false);
      return;
    }

    const ctx = audioSynth.getKontext();
    const cil = audioSynth.getHlavniVstup();
    if (!ctx || !cil) {
      // Kontext vzniká až s prvním tónem; bez něj není co zapojit.
      audioSynth.playNote('E2', 'electric_strat_clean', 0.1, 0.001);
      setTimeout(prepni, 120);
      return;
    }

    aparat.current = postavAparat(ctx, cil, n);
    audioSynth.nastavAparat(aparat.current.vstup);
    setZapnuty(true);
  };

  const zmen = (klic: keyof NastaveniAparatu, hodnota: number) => {
    const nove = { ...n, [klic]: hodnota };
    setN(nove);
    aparat.current?.nastav({ [klic]: hodnota });
  };

  return (
    <div className="bg-black/40 border border-white/10 rounded-2xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-stitek uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-znacka" /> Aparát
        </span>
        <button
          onClick={prepni}
          className={`px-2.5 py-1 rounded-lg text-stitek font-bold border cursor-pointer ${
            zapnuty
              ? 'bg-znacka/20 border-znacka/50 text-znacka'
              : 'bg-white/[0.06] border-white/10 text-neutral-400'
          }`}
        >
          {zapnuty ? 'zapnutý' : 'vypnutý'}
        </button>
      </div>

      <p className="text-stitek text-neutral-500 leading-relaxed">
        Zkresluje se tady, ne ve vzorku — proto pouštěj čistý zvuk kytary a nechej aparát
        pracovat. Klavíru a bicích se to netýká.
      </p>

      <div className={zapnuty ? 'space-y-1.5' : 'space-y-1.5 opacity-40 pointer-events-none'}>
        {REGULATORY.map((r) => (
          <div key={r.klic} className="flex items-center gap-2" title={r.popis}>
            <span className="text-stitek text-neutral-400 w-16 shrink-0">{r.nazev}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(n[r.klic] * 100)}
              onChange={(e) => zmen(r.klic, Number(e.target.value) / 100)}
              className="flex-1 accent-znacka cursor-pointer"
            />
            <span className="text-stitek font-mono text-znacka tabular-nums w-8">
              {Math.round(n[r.klic] * 100)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
