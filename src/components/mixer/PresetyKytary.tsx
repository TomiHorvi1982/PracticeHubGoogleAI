import React, { useState } from 'react';
import { Plus, Trash2, Save, Music2 } from 'lucide-react';
import {
  PresetKytary, navrhniNazevPresetu, prazdnyPreset, volnyProgram,
} from '../../services/presetyKytary';
import { kytaraVMixu } from '../../services/kytaraVMixu';

/**
 * Presety kytarového kanálu.
 *
 * Jedna skladba potřebuje víc zvuků — rytmiku, sólo v mezihře, akustiku
 * ve sloce. Preset drží celé nastavení kanálu pod jménem, takže se mezi
 * nimi dá přepnout jedním klikem, nebo nožním přepínačem přes MIDI.
 *
 * Model aparátu a bedna se pamatují **jménem**, ne obsahem: soubory leží
 * na disku a kopírovat je do každého presetu by z písně udělalo balík
 * megabajtů. Načte je volající, který na ně vidí.
 */

interface Props {
  presety: PresetKytary[];
  aktivni: string | null;
  onZmena: (p: PresetKytary[]) => void;
  onNasadit: (p: PresetKytary) => void;
}

export const PresetyKytary: React.FC<Props> = ({ presety, aktivni, onZmena, onNasadit }) => {
  const [prejmenovavany, setPrejmenovavany] = useState<string | null>(null);

  /** Uloží, jak kanál zní teď, jako nový preset. */
  const ulozSoucasny = () => {
    const novy: PresetKytary = {
      ...prazdnyPreset(navrhniNazevPresetu(presety)),
      ...kytaraVMixu.dejNastaveni(),
      id: prazdnyPreset().id,
      nazev: navrhniNazevPresetu(presety),
      midiProgram: volnyProgram(presety),
    };
    onZmena([...presety, novy]);
    setPrejmenovavany(novy.id);
  };

  /** Přepíše preset tím, jak kanál zní teď. */
  const prepis = (p: PresetKytary) => {
    onZmena(presety.map((x) => (x.id === p.id ? { ...x, ...kytaraVMixu.dejNastaveni() } : x)));
  };

  const prejmenuj = (id: string, nazev: string) => {
    onZmena(presety.map((x) => (
      x.id === id ? { ...x, nazev: nazev.trim().slice(0, 40) || x.nazev } : x
    )));
    setPrejmenovavany(null);
  };

  const zmenProgram = (id: string, hodnota: string) => {
    const n = hodnota === '' ? undefined : Math.max(0, Math.min(127, Math.round(Number(hodnota))));
    // Dvě stejná čísla by znamenala, že nožní přepínač vyvolá nepředvídatelný
    // preset — tomu druhému se číslo odebere.
    onZmena(presety.map((x) => {
      if (x.id === id) return { ...x, midiProgram: Number.isFinite(n as number) ? n : undefined };
      return x.midiProgram !== undefined && x.midiProgram === n ? { ...x, midiProgram: undefined } : x;
    }));
  };

  return (
    <div className="rounded-prvek border border-kresba bg-plocha-1 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Music2 className="w-3 h-3 text-znacka shrink-0" />
        <span className="stitek-pole flex-1">Presety</span>
        <button
          onClick={ulozSoucasny}
          title="Uložit, jak kytara zní teď, jako nový preset"
          className="flex items-center gap-1 text-stitek px-1.5 py-0.5 rounded text-pismo-slaby hover:text-pismo hover:bg-plocha-3 cursor-pointer"
        >
          <Plus className="w-3 h-3" />z aktuálního
        </button>
      </div>

      {!presety.length && (
        <p className="text-stitek text-pismo-slaby">
          Nastav kytaru, jak ji chceš mít, a ulož si to — pro rytmiku, sólo i akustiku zvlášť.
        </p>
      )}

      {presety.map((p) => (
        <div
          key={p.id}
          className={`flex items-center gap-1.5 px-1.5 py-1 rounded-prvek border ${
            aktivni === p.id
              ? 'border-znacka-okraj bg-znacka/10'
              : 'border-transparent hover:bg-plocha-2'
          }`}
        >
          {prejmenovavany === p.id ? (
            <input
              autoFocus
              defaultValue={p.nazev}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => prejmenuj(p.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') prejmenuj(p.id, (e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setPrejmenovavany(null);
              }}
              className="flex-1 min-w-0 bg-vhloubeni text-stitek text-pismo px-1 rounded outline-none"
            />
          ) : (
            <button
              onClick={() => onNasadit(p)}
              onDoubleClick={() => setPrejmenovavany(p.id)}
              title={`${p.nazev} — klikni pro nasazení, dvojklik přejmenuje${
                p.model ? `\naparát: ${p.model}` : ''}${p.bedna ? `\nbedna: ${p.bedna}` : ''}`}
              className={`flex-1 min-w-0 text-left text-stitek truncate cursor-pointer ${
                aktivni === p.id ? 'text-znacka font-bold' : 'text-pismo-tlum hover:text-pismo'
              }`}
            >
              {p.nazev}
            </button>
          )}

          {/* Číslo programu MIDI — na co slyší nožní přepínač. */}
          <input
            type="number"
            min={0}
            max={127}
            value={p.midiProgram ?? ''}
            onChange={(e) => zmenProgram(p.id, e.target.value)}
            title="Číslo programu MIDI, kterým se preset vyvolá"
            placeholder="—"
            className="w-10 shrink-0 bg-vhloubeni border border-kresba rounded px-1 text-stitek text-pismo-tlum text-center tabular-nums outline-none focus:border-znacka-okraj"
          />

          <button
            onClick={() => prepis(p)}
            title="Přepsat tím, jak kytara zní teď"
            className="p-0.5 rounded text-pismo-slaby hover:text-uspech cursor-pointer shrink-0"
          >
            <Save className="w-3 h-3" />
          </button>
          <button
            onClick={() => onZmena(presety.filter((x) => x.id !== p.id))}
            title="Smazat preset"
            className="p-0.5 rounded text-pismo-slaby hover:text-chyba cursor-pointer shrink-0"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
};
