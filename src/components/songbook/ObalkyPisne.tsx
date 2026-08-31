import React from 'react';
import { Song } from '../../types';

/**
 * Obal alba a fotka interpreta u písně.
 *
 * V řádku seznamu je z obalu poznat skladbu dřív, než se stačí přečíst
 * název — proto je vepředu, ne někde v detailu. Fotka interpreta sedí
 * v rohu obalu: dva obrázky vedle sebe by v řádku zabraly dvojnásobek
 * místa, a přitom nesou míň, než když jsou spolu.
 *
 * Když píseň obrázky nemá, zůstane po nich prázdné místo stejné
 * velikosti — bez toho by řádky s obrázkem a bez něj měly text jinde
 * a seznam by se při procházení kýval.
 */

export const ObalkyPisne: React.FC<{ song: Song; velikost?: 'radek' | 'detail' }> = ({
  song,
  velikost = 'radek',
}) => {
  const velky = velikost === 'detail';
  const rozmer = velky ? 'w-14 h-14' : 'w-8 h-8';
  const foto = velky ? 'w-6 h-6' : 'w-3.5 h-3.5';

  return (
    <div className={`relative shrink-0 ${rozmer}`} title={song.nazevAlba || undefined}>
      {song.obalAlba ? (
        <img
          src={song.obalAlba}
          alt=""
          loading="lazy"
          className={`${rozmer} rounded-lg object-cover border border-white/10`}
        />
      ) : (
        <div className={`${rozmer} rounded-lg bg-white/[0.05] border border-white/[0.07]`} />
      )}

      {song.obrazekInterpreta && (
        <img
          src={song.obrazekInterpreta}
          alt=""
          loading="lazy"
          title={song.artist}
          className={`${foto} rounded-full object-cover absolute -bottom-1 -right-1 border-2 border-[#0B0B0E]`}
        />
      )}
    </div>
  );
};
