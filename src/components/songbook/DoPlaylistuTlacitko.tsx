import React, { useState } from 'react';
import { ListPlus, Check } from 'lucide-react';
import { playlistService } from '../../services/playlistService';

/**
 * Přidá nalezenou skladbu do playlistu v přehrávači.
 *
 * Sedí u výsledků hledání venku — na Deezeru, Last.fm i v archivu.
 * Do knihovny se skladba přidávat nemusí: playlist je místo, kam si
 * člověk odloží, co ho zaujalo, a teprve když se to osvědčí, zařadí
 * si to k sobě nastálo.
 *
 * Položka nemá `youtubeId`, takže se přehraje z odkazu na ukázku, když
 * ho zdroj dá; bez něj zůstane v seznamu jako připomínka, co si najít.
 */

interface Props {
  nazev: string;
  interpret?: string;
  obal?: string;
  /** Odkaz na zvuk, pokud ho zdroj nabízí (ukázka z Deezeru apod.). */
  odkaz?: string;
  velikost?: 'drobne' | 'bezne';
}

export const DoPlaylistuTlacitko: React.FC<Props> = ({
  nazev, interpret, obal, odkaz, velikost = 'drobne',
}) => {
  const [stav, setStav] = useState<'nic' | 'pridavam' | 'hotovo'>('nic');

  const pridej = async (e: React.MouseEvent) => {
    // Řádek pod tlačítkem obvykle něco otevírá — tohle je vlastní akce.
    e.stopPropagation();
    if (stav !== 'nic') return;
    setStav('pridavam');
    try {
      await playlistService.addItem({
        youtubeId: '',
        title: nazev,
        artist: interpret,
        thumbnail: obal || '',
        notes: odkaz,
      });
      setStav('hotovo');
    } catch {
      setStav('nic');
    }
  };

  const rozmer = velikost === 'drobne' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      onClick={(e) => void pridej(e)}
      disabled={stav !== 'nic'}
      title={stav === 'hotovo' ? 'Je v playlistu' : 'Přidat do playlistu'}
      aria-label={stav === 'hotovo' ? `${nazev} je v playlistu` : `Přidat ${nazev} do playlistu`}
      className={`p-1.5 rounded-lg shrink-0 transition-colors cursor-pointer disabled:cursor-default
        min-h-dotyk min-w-dotyk lg:min-h-0 lg:min-w-0 inline-flex items-center justify-center
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-znacka ${
        stav === 'hotovo'
          ? 'text-uspech'
          : 'text-neutral-500 hover:text-znacka hover:bg-znacka/10'
      }`}
    >
      {stav === 'hotovo' ? <Check className={rozmer} /> : <ListPlus className={rozmer} />}
    </button>
  );
};
