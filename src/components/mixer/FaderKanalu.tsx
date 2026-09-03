import React from 'react';

/**
 * Proužek kanálu jako na pultu.
 *
 * Jeden díl pro všechna místa, kde se dá něco poslouchat — stopa
 * cvičení i vstup z kytary. Dvě různě vypadající ovládání téhož by
 * znamenala, že se člověk na každé obrazovce učí znovu, kde je hlasitost.
 *
 * Měřák je vlevo od faderu, protože se čte spolu s ním: podle sloupce se
 * fader posouvá.
 */

export interface VlastnostiFaderu {
  nazev: string;
  barva: string;
  /** Hlasitost 0–1. */
  hlasitost: number;
  onHlasitost: (v: number) => void;
  /** Efektivní hodnota 0–1; když chybí, měřák se nekreslí. */
  uroven?: number;
  /** Špička 0–1. */
  spicka?: number;
  preburacene?: boolean;
  /** Zesílení vstupu 0,1–8×. */
  gain?: number;
  onGain?: (v: number) => void;
  panorama?: number;
  onPanorama?: (v: number) => void;
  sirka?: number;
  onSirka?: (v: number) => void;
  ztlumeno?: boolean;
  onZtlumit?: () => void;
  /** Cokoli navíc pod fader — nahrávání, odposlech. */
  children?: React.ReactNode;
}

/** Popisek hladiny v decibelech; ticho se píše jako pomlčka. */
function dB(v: number): string {
  if (v <= 0.0005) return '−∞';
  const d = 20 * Math.log10(v);
  return `${d > 0 ? '+' : ''}${d.toFixed(0)} dB`;
}

export const FaderKanalu: React.FC<VlastnostiFaderu> = ({
  nazev, barva, hlasitost, onHlasitost, uroven, spicka, preburacene,
  gain, onGain, panorama, onPanorama, sirka, onSirka, ztlumeno, onZtlumit, children,
}) => {
  const maMerak = uroven !== undefined;

  return (
    <div className="bg-black/30 border border-white/[0.08] rounded-2xl p-3 space-y-2.5 min-w-[168px]">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: barva }} />
        <span className="text-drobne font-bold text-white truncate flex-1">{nazev}</span>
        {onZtlumit && (
          <button
            onClick={onZtlumit}
            className={`px-1.5 py-0.5 rounded text-stitek font-bold cursor-pointer ${
              ztlumeno ? 'bg-[#FF453A] text-white' : 'bg-white/[0.08] text-neutral-400 hover:text-white'
            }`}
            title="Ztlumit"
          >
            M
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {maMerak && (
          <div className="relative w-3 h-28 bg-black/50 rounded-sm overflow-hidden shrink-0">
            {/* Hranice, kde signál začíná řezat — červené pásmo nahoře. */}
            <div className="absolute inset-x-0 top-0 h-[12%] bg-[#FF453A]/20" />
            <div
              className="absolute inset-x-0 bottom-0 transition-[height] duration-75"
              style={{
                height: `${Math.min(100, (uroven || 0) * 100)}%`,
                background: preburacene ? '#FF453A' : barva,
              }}
            />
            {spicka !== undefined && spicka > 0.01 && (
              <div
                className="absolute inset-x-0 h-[2px] bg-white"
                style={{ bottom: `${Math.min(99, spicka * 100)}%` }}
              />
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between">
          {/* Fader hlasitosti. Svisle, aby vypadal jako na pultu. */}
          <input
            type="range"
            min={0}
            max={140}
            value={Math.round(hlasitost * 100)}
            onChange={(e) => onHlasitost(Number(e.target.value) / 100)}
            className="w-28 accent-[#FF9F0A] cursor-pointer"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', height: '112px', width: '20px' }}
            title={`Hlasitost ${Math.round(hlasitost * 100)} %`}
          />
        </div>

        <div className="flex-1 space-y-2 text-stitek">
          <div>
            <span className="text-neutral-500">Hlasitost</span>
            <div className="font-mono font-bold tabular-nums" style={{ color: barva }}>
              {Math.round(hlasitost * 100)} %
            </div>
          </div>
          {maMerak && (
            <div>
              <span className="text-neutral-500">Špička</span>
              <div
                className={`font-mono tabular-nums ${
                  preburacene ? 'text-[#FF453A] font-bold' : 'text-neutral-300'
                }`}
              >
                {dB(spicka || 0)}
              </div>
            </div>
          )}
        </div>
      </div>

      {onGain && gain !== undefined && (
        <label className="block space-y-0.5">
          <span className="text-stitek uppercase tracking-wider text-neutral-500 flex justify-between">
            <span>Gain</span>
            <span className="font-mono text-neutral-300">{gain.toFixed(1)}×</span>
          </span>
          <input
            type="range" min={10} max={800} value={Math.round(gain * 100)}
            onChange={(e) => onGain(Number(e.target.value) / 100)}
            className="w-full accent-[#30D158] cursor-pointer"
          />
        </label>
      )}

      {onPanorama && panorama !== undefined && (
        <label className="block space-y-0.5">
          <span className="text-stitek uppercase tracking-wider text-neutral-500 flex justify-between">
            <span>Panorama</span>
            <span className="font-mono text-neutral-300">
              {panorama === 0 ? 'střed' : panorama < 0 ? `L ${Math.round(-panorama * 100)}` : `P ${Math.round(panorama * 100)}`}
            </span>
          </span>
          <input
            type="range" min={-100} max={100} value={Math.round(panorama * 100)}
            onChange={(e) => onPanorama(Number(e.target.value) / 100)}
            className="w-full accent-[#0A84FF] cursor-pointer"
          />
        </label>
      )}

      {onSirka && sirka !== undefined && (
        <label className="block space-y-0.5">
          <span className="text-stitek uppercase tracking-wider text-neutral-500 flex justify-between">
            <span>Šířka</span>
            <span className="font-mono text-neutral-300">{Math.round(sirka * 100)} %</span>
          </span>
          <input
            type="range" min={0} max={100} value={Math.round(sirka * 100)}
            onChange={(e) => onSirka(Number(e.target.value) / 100)}
            className="w-full accent-[#BF5AF2] cursor-pointer"
          />
        </label>
      )}

      {children}
    </div>
  );
};
