import React, { useEffect, useState } from 'react';
import { Song } from '../types';
import { Podium } from './songbook/Podium';
import { SongModularWorkspace } from './SongModularWorkspace';
import { ChordDetailModal } from './ChordDetailModal';
import { useMusicalContext } from '../context/MusicalContext';
import { songDatabaseService } from '../services/songDatabaseService';
import { setListy, SetList } from '../services/setListy';
import { zaznamenejOtevreni } from '../services/songFilters';

/**
 * Pódium jako vlastní sekce.
 *
 * Bydlelo pod knihovnou, takže na jedné stránce bylo naráz hledání i hraní
 * a člověk mezi tím uhýbal očima. Tady se ke skladbám chystají okna a
 * odsud se pouští pódiový režim; skládání setu zůstalo v knihovně.
 */
export const PodiumSection: React.FC = () => {
  const {
    activeSong,
    setActiveSong,
    transposeSemitones,
    setTransposeSemitones,
    capo: capoFret,
    setCapo: setCapoFret,
  } = useMusicalContext();

  const [songs, setSongs] = useState<Song[]>(() => songDatabaseService.getSongs());
  const [sety, setSety] = useState<SetList[]>(setListy.hratelne());
  const [fontSize, setFontSize] = useState(16);
  const [akordDetail, setAkordDetail] = useState<string | null>(null);

  useEffect(() => songDatabaseService.subscribe(setSongs), []);
  useEffect(() => setListy.subscribe(() => setSety(setListy.hratelne())), []);

  const plocha = activeSong ? (
    <SongModularWorkspace
      song={activeSong}
      onUpdateSong={(s) => {
        void songDatabaseService.saveSong(s);
        setActiveSong(s);
      }}
      transposeSemitones={transposeSemitones}
      setTransposeSemitones={setTransposeSemitones}
      capoFret={capoFret}
      setCapoFret={setCapoFret}
      fontSize={fontSize}
      setFontSize={setFontSize}
      onSelectModalChord={setAkordDetail}
    />
  ) : (
    <div className="h-full flex items-center justify-center text-center text-[12px] text-neutral-600 border border-dashed border-white/[0.08] rounded-2xl p-10">
      Vyber skladbu ze set listu. Skládá se v knihovně skladeb.
    </div>
  );

  return (
    <div className="p-4 sm:p-6">
      <Podium
        songs={songs}
        playlists={sety}
        aktivni={activeSong}
        onVybrat={(s) => {
          setActiveSong(s);
          zaznamenejOtevreni(s.id);
          setTransposeSemitones(0);
        }}
        plocha={plocha}
        onPridatDoSetu={(sk) => {
          const set = sety[0];
          if (set) void setListy.prepni(set.id, sk.id);
        }}
      />

      <ChordDetailModal chordName={akordDetail} onClose={() => setAkordDetail(null)} />
    </div>
  );
};
