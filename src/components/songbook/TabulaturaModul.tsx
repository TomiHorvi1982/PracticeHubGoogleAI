import React, { useState } from 'react';
import { FileText, ChevronDown } from 'lucide-react';
import { Song, SongAttachment } from '../../types';
import { GuitarProPlayer } from '../GuitarProPlayer';
import { PrazdnyModul } from './PrazdnyModul';

interface Props {
  song: Song;
  prilohy: SongAttachment[];
  onUpdateSong: (s: Song) => void;
}

/**
 * Tabulatura u písně — i s přehrávačem.
 *
 * Modul dřív jen vypsal soubory ke stažení. Kdo si chtěl tabulaturu
 * pustit, musel odejít do samostatné sekce Guitar Pro, tam ji znovu najít
 * a vrátit se. Přehrávač patří k písni, ne o dvě obrazovky vedle.
 */
export const TabulaturaModul: React.FC<Props> = ({ song, prilohy, onUpdateSong }) => {
  const [vybrana, setVybrana] = useState(0);

  if (prilohy.length === 0) {
    return <PrazdnyModul song={song} modulId="tabs" onUpdateSong={onUpdateSong} />;
  }

  const priloha = prilohy[Math.min(vybrana, prilohy.length - 1)];

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      {/* Přepínač se ukazuje jen když je z čeho vybírat. U jediné
          tabulatury by to byl ovládací prvek bez účelu. */}
      {prilohy.length > 1 && (
        <div className="flex items-center gap-2 shrink-0">
          <FileText className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0" />
          <div className="relative flex-1 min-w-0">
            <select
              value={vybrana}
              onChange={(e) => setVybrana(parseInt(e.target.value, 10))}
              className="w-full appearance-none bg-black/50 border border-white/10 rounded-lg pl-2.5 pr-7 py-1 text-[11px] text-white outline-none focus:border-[#FF9F0A] cursor-pointer"
            >
              {prilohy.map((p, i) => (
                <option key={p.id} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-neutral-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <span className="text-[10px] font-mono text-neutral-600 shrink-0">
            {vybrana + 1}/{prilohy.length}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {priloha.dataUrl ? (
          <GuitarProPlayer
            // Přepnutí tabulatury musí přehrávač postavit znovu. Bez klíče
            // by si nechal načtenou tu předchozí a přepínač by nic nedělal.
            key={priloha.id}
            dataUrl={priloha.dataUrl}
            filename={priloha.name}
            artist={song.artist}
            bpm={song.bpm}
          />
        ) : (
          <p className="text-[11px] text-neutral-500 p-4 text-center">
            Soubor se ještě načítá z úložiště…
          </p>
        )}
      </div>
    </div>
  );
};
