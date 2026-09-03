import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Circle, Square, Headphones, AlertTriangle, Play, Download } from 'lucide-react';
import { kytaraKanal, StavKanalu } from '../../services/kytaraKanal';
import { FaderKanalu } from './FaderKanalu';

/**
 * Kytara jako kanál na pultu.
 *
 * Všude, kde appka poslouchá nástroj, má být vidět signál. Bez měřáku se
 * hraje naslepo: nepozná se, jestli vstup vůbec chodí, jestli je moc
 * potichu na detekci tónů, nebo naopak řeže — a to poslední se pozná až
 * podle toho, že rozpoznávání začne hlásit nesmysly.
 */
export const KytaraFader: React.FC<{
  /** Co udělat s nahrávkou, když ji člověk chce poslouchat. */
  onNahravka?: (b: Blob) => void;
  /** Nabízet nahrávání — jinde než ve cvičení nemá smysl. */
  sNahravanim?: boolean;
}> = ({ onNahravka, sNahravanim }) => {
  const [stav, setStav] = useState<StavKanalu>(kytaraKanal.getStav());
  const [maNahravku, setMaNahravku] = useState(false);

  useEffect(() => kytaraKanal.subscribe(setStav), []);
  // Odchod ze sekce nesmí nechat otevřený vstup ani běžet nahrávání.
  useEffect(() => () => kytaraKanal.stop(), []);

  const vezmiNahravku = (co: (b: Blob) => void) => {
    const b = kytaraKanal.vyzvedniNahravku();
    if (!b) return;
    setMaNahravku(false);
    co(b);
  };

  return (
    <FaderKanalu
      nazev="Kytara (vstup)"
      barva="#30D158"
      hlasitost={stav.hlasitost}
      onHlasitost={(v) => kytaraKanal.nastav({ hlasitost: v })}
      uroven={stav.bezi ? stav.uroven : 0}
      spicka={stav.bezi ? stav.spicka : 0}
      preburacene={stav.preburacene}
      gain={stav.gain}
      onGain={(v) => kytaraKanal.nastav({ gain: v })}
      panorama={stav.panorama}
      onPanorama={(v) => kytaraKanal.nastav({ panorama: v })}
      sirka={stav.sirka}
      onSirka={(v) => kytaraKanal.nastav({ sirka: v })}
    >
      <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
        <div className="flex gap-1">
          <button
            onClick={() => (stav.bezi ? kytaraKanal.stop() : void kytaraKanal.start())}
            className={`flex-1 px-2 py-1.5 rounded-lg text-stitek font-bold flex items-center justify-center gap-1 cursor-pointer ${
              stav.bezi ? 'bg-[#30D158] text-black' : 'bg-white/[0.06] text-neutral-300 hover:text-white'
            }`}
          >
            {stav.bezi ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
            {stav.bezi ? 'Vstup zapnut' : 'Zapnout vstup'}
          </button>

          <button
            onClick={() => kytaraKanal.nastav({ odposlech: !stav.odposlech })}
            disabled={!stav.bezi}
            className={`px-2 py-1.5 rounded-lg cursor-pointer disabled:opacity-30 ${
              stav.odposlech ? 'bg-[#FF9F0A] text-black' : 'bg-white/[0.06] text-neutral-400 hover:text-white'
            }`}
            title="Poslouchat sám sebe. Jen do sluchátek — z beden se to rozeřve zpětnou vazbou."
          >
            <Headphones className="w-3 h-3" />
          </button>
        </div>

        {stav.odposlech && (
          <p className="text-stitek text-[#FF9F0A] flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
            Odposlech jen do sluchátek.
          </p>
        )}

        {sNahravanim && (
          <>
            <button
              onClick={() => {
                if (stav.nahrava) {
                  kytaraKanal.zastavNahravani();
                  setMaNahravku(true);
                } else {
                  kytaraKanal.zacniNahravat();
                }
              }}
              disabled={!stav.bezi}
              className={`w-full px-2 py-1.5 rounded-lg text-stitek font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-30 ${
                stav.nahrava ? 'bg-[#FF453A] text-white' : 'bg-white/[0.06] text-neutral-300 hover:text-white'
              }`}
            >
              {stav.nahrava ? <Square className="w-3 h-3 fill-current" /> : <Circle className="w-3 h-3 fill-current" />}
              {stav.nahrava ? `Nahrávám ${stav.nahranoS.toFixed(1)} s` : 'Nahrát kytaru'}
            </button>

            {maNahravku && (
              <div className="flex gap-1">
                {onNahravka && (
                  <button
                    onClick={() => vezmiNahravku(onNahravka)}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-[#0A84FF] text-white text-stitek font-bold flex items-center justify-center gap-1 cursor-pointer"
                    title="Načíst do přehrávače a poslechnout si to ve smyčce"
                  >
                    <Play className="w-3 h-3" /> Poslechnout
                  </button>
                )}
                <button
                  onClick={() =>
                    vezmiNahravku((b) => {
                      // Stažení do počítače; do knihovny se nahrává v sekci
                      // Soubory, kde se dá rovnou zařadit.
                      const url = URL.createObjectURL(b);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `kytara-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
                      a.click();
                      URL.revokeObjectURL(url);
                    })
                  }
                  className="px-2 py-1.5 rounded-lg bg-white/[0.06] text-neutral-300 cursor-pointer"
                  title="Stáhnout nahrávku"
                >
                  <Download className="w-3 h-3" />
                </button>
              </div>
            )}
          </>
        )}

        {stav.chyba && <p className="text-stitek text-[#FF453A]">{stav.chyba}</p>}
      </div>
    </FaderKanalu>
  );
};
