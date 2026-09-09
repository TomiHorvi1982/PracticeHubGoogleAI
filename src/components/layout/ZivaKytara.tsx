import React, { useEffect, useRef, useState } from 'react';
import { Guitar, Loader2, Volume2, VolumeX, X } from 'lucide-react';
import { StavKytary, kytaraVMixu } from '../../services/kytaraVMixu';
import { stemAudioService } from '../../services/stemAudioService';

/**
 * Živá kytara v horní liště.
 *
 * Kytara je služba, ne kus obrazovky — `kytaraVMixu` je jedináček, který
 * hraje dál, i když se mixážní pult odmontuje. Chybělo jen ovládání, které
 * je vidět odevšud: dosud se dala zapnout výhradně na faderu v pultu, takže
 * kdo si otevřel tabulaturu, neměl jak se ztlumit.
 *
 * Ikonka dělá to nejčastější — ztlumí a pustí vstup. Celý řetěz se odpojuje
 * až v rozbaleném panelu, protože odpojením se pouští mikrofon a příště se
 * musí povolovat znovu.
 */

/** Špička vstupu na jednoduchý sloupeček. Nad −6 dB svítí červeně. */
function barvaUrovne(u: number): string {
  if (u > 0.5) return 'bg-chyba';
  if (u > 0.2) return 'bg-uspech';
  return 'bg-znacka';
}

export const ZivaKytara: React.FC = () => {
  const [stav, setStav] = useState<StavKytary>(kytaraVMixu.getStav());
  const [otevreno, setOtevreno] = useState(false);
  const [ceka, setCeka] = useState(false);
  const [hlaska, setHlaska] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => kytaraVMixu.subscribe(setStav), []);

  // Kliknutí mimo panel ho zavře. Bez toho zůstane viset přes obsah
  // sekce, do které se uživatel zrovna proklikal.
  useEffect(() => {
    if (!otevreno) return;
    const mimo = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOtevreno(false);
    };
    document.addEventListener('mousedown', mimo);
    return () => document.removeEventListener('mousedown', mimo);
  }, [otevreno]);

  const zapni = async () => {
    setHlaska(null);
    setCeka(true);
    const ok = await stemAudioService.pripojKytaru();
    setCeka(false);
    if (!ok) {
      setHlaska(kytaraVMixu.getStav().chyba || 'Kytaru se nepodařilo spustit.');
      setOtevreno(true);
    }
  };

  /** Kliknutí na ikonku: nespuštěnou kytaru spustí, běžící ztlumí. */
  const klik = () => {
    if (ceka) return;
    if (!stav.bezi) { void zapni(); return; }
    kytaraVMixu.setZtlumeno(!stav.ztlumeno);
  };

  const hraje = stav.bezi && !stav.ztlumeno;
  const popis = !stav.bezi
    ? 'Zapnout živou kytaru'
    : stav.ztlumeno ? 'Pustit kytaru' : 'Ztlumit kytaru';

  return (
    <div className="relative" ref={panel}>
      <div className="flex items-center">
        <button
          onClick={klik}
          disabled={ceka}
          aria-label={popis}
          title={popis}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            hraje
              ? 'bg-uspech/15 border-uspech/40 text-uspech'
              : stav.bezi
                ? 'bg-pozor/10 border-pozor/40 text-pozor'
                : 'bg-plocha-2 border-kresba text-pismo-tlum hover:text-pismo'
          }`}
        >
          {ceka
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Guitar className={`w-4 h-4 ${hraje ? 'animate-pulse' : ''}`} />}
        </button>

        {/* Měřák vedle ikonky. Bez něj se nedá poznat, jestli do
            zvukovky vůbec něco jde — a to je první, co se ptáš,
            když není slyšet. */}
        {stav.bezi && (
          <button
            onClick={() => setOtevreno((p) => !p)}
            aria-label="Nastavení živé kytary"
            title={stav.model || 'Bez aparátu — kytara hraje čistá'}
            className="hidden sm:flex items-center gap-1.5 pl-2 pr-2 py-1.5 cursor-pointer"
          >
            <span className="w-1.5 h-6 rounded-full bg-vhloubeni overflow-hidden flex flex-col justify-end">
              <span
                className={`w-full rounded-full transition-all duration-100 ${barvaUrovne(stav.urovenVstupu)}`}
                style={{ height: `${Math.min(100, stav.urovenVstupu * 140)}%` }}
              />
            </span>
            <span className="text-stitek text-pismo-tlum max-w-[86px] truncate">
              {stav.model || 'čistá'}
            </span>
          </button>
        )}
      </div>

      {otevreno && (
        <div className="absolute right-0 top-full mt-2 w-72 z-50 bg-plocha-2 border border-kresba rounded-2xl p-3 shadow-2xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="nadpis-panelu">Živá kytara</span>
            <button
              onClick={() => setOtevreno(false)}
              aria-label="Zavřít"
              className="p-1 text-pismo-slaby hover:text-pismo cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {hlaska && <p className="text-drobne text-chyba">{hlaska}</p>}

          {stav.bezi ? (
            <>
              <div className="text-drobne text-pismo-tlum space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span className="stitek-pole">aparát</span>
                  <span className="truncate">{stav.model || 'žádný'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="stitek-pole">bedna</span>
                  <span className="truncate">{stav.bedna || 'žádná'}</span>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="stitek-pole">Vstup {stav.vstupDb.toFixed(0)} dB</span>
                <input
                  type="range"
                  min={-24}
                  max={24}
                  step={1}
                  value={stav.vstupDb}
                  onChange={(e) => kytaraVMixu.nastavVstupDb(Number(e.target.value))}
                  className="w-full accent-znacka cursor-pointer"
                />
              </label>

              <div className="flex gap-1.5">
                <button
                  onClick={() => kytaraVMixu.setZtlumeno(!stav.ztlumeno)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-drobne font-bold cursor-pointer ${
                    stav.ztlumeno ? 'bg-pozor text-black' : 'bg-plocha-3 text-pismo'
                  }`}
                >
                  {stav.ztlumeno
                    ? <><Volume2 className="w-3.5 h-3.5" />Pustit</>
                    : <><VolumeX className="w-3.5 h-3.5" />Ztlumit</>}
                </button>
                <button
                  onClick={() => { stemAudioService.odpojKytaru(); setOtevreno(false); }}
                  title="Zavře vstup i mikrofon. Aparát a nastavení zůstanou."
                  className="px-2.5 py-1.5 rounded-xl text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-chyba cursor-pointer"
                >
                  Odpojit
                </button>
              </div>

              <p className="text-stitek text-pismo-slaby leading-relaxed">
                Aparáty, presety a efekty se vybírají na kytarovém faderu
                v Mixážním pultu.
              </p>
            </>
          ) : (
            <>
              <button
                onClick={zapni}
                disabled={ceka}
                className="w-full px-3 py-2 rounded-xl bg-uspech text-black text-drobne font-bold cursor-pointer"
              >
                Zapnout kytaru
              </button>
              {/* Obojí je z praxe, ne z opatrnosti: přes Bluetooth je
                  zpoždění tak velké, že se do rytmu hrát nedá. */}
              <p className="text-stitek text-pismo-slaby leading-relaxed">
                Hraj do drátových sluchátek — bezdrátová přidají i přes sto
                milisekund zpoždění. Na zvukovce nastav co nejmenší buffer.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
