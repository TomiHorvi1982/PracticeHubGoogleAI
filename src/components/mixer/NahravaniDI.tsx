import React, { useEffect, useState } from 'react';
import { Circle, Download, Loader2, Square } from 'lucide-react';
import { kytaraVMixu } from '../../services/kytaraVMixu';
import { HotovaNahravka, nahravaniStopy } from '../../services/nahravaniStopy';
import { assetLibraryService } from '../../services/assetLibraryService';
import * as Tone from 'tone';

/**
 * Nahrávání kytary do nové stopy.
 *
 * Dvě místa, odkud se dá nahrávat, a rozdíl mezi nimi je celý smysl věci:
 *
 *   DI — čistá kytara před aparátem. Dá se později přehnat jiným modelem
 *   z TONE3000, jinou bednou, jinými efekty. Tohle chceš skoro vždycky.
 *
 *   Výstup — kytara i s aparátem, bednou a EQ. Hotová věc, kterou už
 *   nikdo nevrátí; hodí se, když víš, že zvuk sedí.
 *
 * Hotová nahrávka jde do knihovny, ne do dočasného seznamu v paměti.
 * Odtud se dá pověsit na kterýkoli fader, znovu použít v jiné písni
 * a přežije zavření prohlížeče.
 */

type Odkud = 'di' | 'vystup';

export const NahravaniDI: React.FC<{ bezi: boolean }> = ({ bezi }) => {
  const [odkud, setOdkud] = useState<Odkud>('di');
  const [nahrava, setNahrava] = useState(false);
  const [vterin, setVterin] = useState(0);
  const [uklada, setUklada] = useState(false);
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [hotova, setHotova] = useState<HotovaNahravka | null>(null);

  // Počitadlo. Bez něj člověk nepozná, jestli nahrávání vůbec běží.
  useEffect(() => {
    if (!nahrava) return;
    const vzorkovaci = (Tone.getContext().rawContext as AudioContext).sampleRate;
    const t = window.setInterval(() => setVterin(nahravaniStopy.vterin(vzorkovaci)), 250);
    return () => window.clearInterval(t);
  }, [nahrava]);

  const spust = async () => {
    setHlaska(null);
    setHotova(null);
    const zdroj = odkud === 'di' ? kytaraVMixu.dejDI() : kytaraVMixu.dejVystup();
    if (!zdroj) {
      setHlaska('Nejdřív zapni kytaru.');
      return;
    }
    const ctx = Tone.getContext().rawContext as AudioContext;
    if (!await nahravaniStopy.spust(zdroj, ctx)) {
      setHlaska('Nahrávání se nepodařilo spustit.');
      return;
    }
    setVterin(0);
    setNahrava(true);
  };

  const zastav = async () => {
    const n = await nahravaniStopy.zastav(odkud);
    setNahrava(false);
    if (!n) return;

    // Ticho se neukládá. Prázdná stopa v knihovně nikomu nepomůže a
    // hledá se pak hůř než cokoli jiného.
    if (n.spicka < 0.005 || n.vterin < 0.5) {
      setHlaska('Nic se nenahrálo. Zkontroluj vstup a měřák.');
      return;
    }

    setHotova(n);
    setUklada(true);
    try {
      const soubor = new File([n.wav as BlobPart], n.jmeno, { type: 'audio/wav' });
      await assetLibraryService.upload(
        soubor, 'stem_mix', 'audio', 'private',
        odkud === 'di' ? 'DI' : 'Kytara',
        { zdrojovaSlozka: 'Nahrávky', tagy: ['kytara', odkud === 'di' ? 'di' : 'aparát'] },
      );
      setHlaska(`Uloženo do knihovny jako ${n.jmeno}. Pověsit na fader jde přes „Načíst stopu".`);
    } catch (e: any) {
      // Knihovna je navíc — nahrávka je pořád v prohlížeči a dá se stáhnout.
      setHlaska(e?.message
        ? `Do knihovny se to neuložilo (${e.message}). Stáhnout to ale můžeš.`
        : 'Do knihovny se to neuložilo. Stáhnout to ale můžeš.');
    } finally {
      setUklada(false);
    }
  };

  const stahni = () => {
    if (!hotova) return;
    const url = URL.createObjectURL(new Blob([hotova.wav as BlobPart], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = hotova.jmeno;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-1.5 pt-2 border-t border-kresba-jemna">
      <div className="flex items-center gap-1.5">
        <span className="stitek-pole">Nahrát do stopy</span>
        {(['di', 'vystup'] as const).map((id) => (
          <button
            key={id}
            onClick={() => setOdkud(id)}
            disabled={nahrava}
            title={id === 'di'
              ? 'Čistá kytara před aparátem — dá se pak přehnat jiným zvukem'
              : 'Kytara i s aparátem a efekty — hotová věc'}
            className={`px-2 py-1 rounded-prvek text-stitek font-bold cursor-pointer disabled:opacity-40 ${
              odkud === id ? 'bg-znacka-tlum text-znacka ring-1 ring-znacka-okraj' : 'bg-plocha-3 text-pismo-slaby'
            }`}
          >
            {id === 'di' ? 'DI' : 'výstup'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {!nahrava ? (
          <button
            onClick={() => void spust()}
            disabled={!bezi || uklada}
            title={bezi ? 'Začít nahrávat' : 'Nejdřív zapni kytaru'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-chyba hover:bg-chyba/15 cursor-pointer disabled:opacity-40"
          >
            {uklada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Circle className="w-3.5 h-3.5 fill-current" />}
            {uklada ? 'Ukládám…' : 'Nahrávat'}
          </button>
        ) : (
          <button
            onClick={() => void zastav()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-chyba text-white cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            Stop · {vterin.toFixed(1)} s
          </button>
        )}

        {hotova && (
          <button
            onClick={stahni}
            title="Stáhnout WAV do počítače"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />WAV
          </button>
        )}
      </div>

      {hlaska && <p className="text-stitek text-pismo-tlum leading-snug">{hlaska}</p>}
    </div>
  );
};
