import React, { useRef, useState } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { Song } from '../../types';
import { REGISTR_PODLE_ID } from './moduleRegistry';
import { pripojSouborKeSkladbe, NepodporovanySoubor } from './pripojSoubor';

interface Props {
  song: Song;
  modulId: string;
  onUpdateSong: (s: Song) => void;
  /** Text pro moduly, do kterých se vkládat nedá. */
  nahradniText?: string;
}

/**
 * Co modul ukáže, když k němu nejsou data.
 *
 * Prázdný modul býval slepá ulička — napsal, že nic nemá, a tím to skončilo;
 * soubor se musel jít přidat jinam a pak se vrátit. Tady se dá rovnou vložit
 * a uloží se ke skladbě, takže se příště načte sám.
 */
export const PrazdnyModul: React.FC<Props> = ({ song, modulId, onUpdateSong, nahradniText }) => {
  const smlouva = REGISTR_PODLE_ID[modulId];
  const [nadSebou, setNadSebou] = useState(false);
  const [nahravam, setNahravam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const vstupRef = useRef<HTMLInputElement>(null);

  const prijima = smlouva?.prijima || [];

  // Modul bez přijímaných přípon nemá co nabízet — jen řekne, že je prázdný.
  if (prijima.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-4">
        <p className="text-drobne text-neutral-500">{nahradniText || 'Zatím tu nic není.'}</p>
      </div>
    );
  }

  const zpracuj = async (soubor: File | undefined) => {
    if (!soubor) return;
    setChyba(null);
    setNahravam(true);
    try {
      onUpdateSong(await pripojSouborKeSkladbe(song, modulId, soubor));
    } catch (e: any) {
      setChyba(
        e instanceof NepodporovanySoubor
          ? e.message
          : `Nahrání se nepovedlo: ${e?.message || 'neznámá chyba'}`
      );
    } finally {
      setNahravam(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setNadSebou(true);
      }}
      onDragLeave={() => setNadSebou(false)}
      onDrop={(e) => {
        e.preventDefault();
        setNadSebou(false);
        void zpracuj(e.dataTransfer.files[0]);
      }}
      onClick={() => vstupRef.current?.click()}
      className={`flex-1 flex flex-col items-center justify-center gap-2 p-4 m-1 rounded-2xl border border-dashed transition-all cursor-pointer text-center ${
        nadSebou
          ? 'border-znacka bg-znacka/10'
          : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]'
      }`}
    >
      <input
        ref={vstupRef}
        type="file"
        accept={prijima.join(',')}
        className="hidden"
        onChange={(e) => {
          void zpracuj(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {nahravam ? (
        <>
          <Loader2 className="w-5 h-5 text-znacka animate-spin" />
          <p className="text-drobne text-neutral-300">Nahrávám…</p>
        </>
      ) : (
        <>
          <Upload className={`w-5 h-5 ${nadSebou ? 'text-znacka' : 'text-neutral-500'}`} />
          <p className="text-drobne font-semibold text-neutral-300">
            {nadSebou ? 'Pusť to sem' : 'Přetáhni soubor nebo klikni'}
          </p>
          <p className="text-stitek text-neutral-600">{prijima.join(' · ')}</p>
          <p className="text-stitek text-neutral-600">Uloží se ke skladbě — příště se načte sám.</p>
        </>
      )}

      {chyba && (
        <p className="text-stitek text-chyba flex items-center gap-1 mt-1">
          <AlertCircle className="w-3 h-3 shrink-0" /> {chyba}
        </p>
      )}
    </div>
  );
};
