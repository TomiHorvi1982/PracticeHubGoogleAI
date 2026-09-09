import React, { useState } from 'react';
import { Radio, Disc3, Youtube, Music2 , Archive } from 'lucide-react';
import { Song, YouTubeVideo } from '../../types';
import { LastFmPanel } from './LastFmPanel';
import { DeezerPanel } from './DeezerPanel';
import { ArchivPanel } from './ArchivPanel';
import { MediaCenterSection } from '../MediaCenter/MediaCenterSection';
import { YouTubeSection } from '../YouTubeSection';

interface Props {
  /**
   * Přidání do knihovny. Doplnění materiálů se rozjede samo.
   *
   * `doplnky` nese, co zdroj o skladbě ví navíc — třeba tempo. Ne každý
   * zdroj to má, proto je volitelné.
   */
  onPridat: (interpret: string, nazev: string, doplnky?: { bpm?: number }) => void | Promise<void>;
  songs: Song[];
  activeSong: Song | null;
  onVybratSkladbu: (s: Song) => void;
  onPridatSkladbu: (s: Song) => void;
  onUlozitVidea: (songId: string, videa: YouTubeVideo[]) => void;
}

type Zdroj = 'lastfm' | 'deezer' | 'archiv' | 'mediacenter' | 'youtube';

const ZDROJE: { id: Zdroj; popis: string; ikona: React.FC<{ className?: string }>; co: string }[] = [
  { id: 'lastfm', popis: 'Last.fm', ikona: Radio, co: 'žebříčky, styly, alba' },
  { id: 'deezer', popis: 'Deezer', ikona: Music2, co: 'tempo, délka, ukázka' },
  // Jediný ze zdrojů, ze kterého se dá nahrávka opravdu stáhnout —
  // archiv ji sám nabízí a kapely to povolily.
  { id: 'archiv', popis: 'Live Music Archive', ikona: Archive, co: 'koncerty ke stažení' },
  { id: 'mediacenter', popis: 'Media Center', ikona: Disc3, co: 'fronta a knihovna' },
  { id: 'youtube', popis: 'YouTube Jam', ikona: Youtube, co: 'videa a backing tracky' },
];

/**
 * Základna pro hledání hudby venku.
 *
 * Čtyři místa, kde se dá hledat a poslouchat, pod jednou střechou. Dřív
 * byla každá vlastní položkou ve vrchní liště, takže hledání jedné písně
 * znamenalo přepínat sekce a pokaždé začít znovu — a přitom všechny
 * odpovídají na stejnou otázku: co si pustit a co si přidat do knihovny.
 *
 * Otevřený je vždycky jeden. Všechny naráz by daly čtyři přehrávače a
 * pár tisíc řádků na jednu obrazovku.
 */
export const ObjevSkladby: React.FC<Props> = ({
  onPridat, songs, activeSong, onVybratSkladbu, onPridatSkladbu, onUlozitVidea,
}) => {
  const [zdroj, setZdroj] = useState<Zdroj>(() => {
    try {
      return (localStorage.getItem('neverlate_zdroj_objevu') as Zdroj) || 'lastfm';
    } catch {
      return 'lastfm';
    }
  });

  const prepni = (z: Zdroj) => {
    setZdroj(z);
    try {
      localStorage.setItem('neverlate_zdroj_objevu', z);
    } catch {
      /* plné úložiště nesmí zabránit přepnutí */
    }
  };

  return (
    <div className="space-y-3">
      {/* Mřížka, ne zalamovaná řada.

          Každý zdroj má jinak dlouhý název, takže se tlačítka lišila
          šířkou (214 až 283 px) a zalomila se do rozsypaných 2+2+1.
          V mřížce mají všechna stejný díl místa a stojí pod sebou
          v pravidelných sloupcích. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-1.5">
        {ZDROJE.map((z) => {
          const Ikona = z.ikona;
          const aktivni = zdroj === z.id;
          return (
            <button
              key={z.id}
              onClick={() => prepni(z.id)}
              className={`px-3 py-1.5 rounded-xl text-drobne font-bold flex items-center gap-1.5 cursor-pointer border transition-all min-w-0 ${
                aktivni
                  ? 'zlata-plocha border-znacka'
                  : 'bg-white/[0.04] text-pismo-tlum border-white/[0.08] hover:text-white'
              }`}
              title={z.co}
            >
              <Ikona className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{z.popis}</span>
              {/* Popisek jen tam, kde je na něj místo — jinak by roztahoval
                  sloupce a mřížka by se zase rozjela. */}
              <span className={`hidden 2xl:inline font-normal truncate ${aktivni ? 'text-black/60' : 'text-pismo-slaby'}`}>
                {z.co}
              </span>
            </button>
          );
        })}
      </div>

      {zdroj === 'lastfm' && <LastFmPanel onPridat={onPridat} />}

      {zdroj === 'deezer' && <DeezerPanel onPridat={onPridat} />}

      {zdroj === 'archiv' && <ArchivPanel />}

      {/* Media Center a YouTube Jam byly celé stránky. Uvnitř karty
          dostanou vlastní výřez s rolováním, ať karta neroste do nekonečna. */}
      {zdroj === 'mediacenter' && (
        <div className="max-h-[62vh] overflow-y-auto -mx-4 sm:-mx-5 rounded-2xl">
          <MediaCenterSection songs={songs} onSelectSong={onVybratSkladbu} onAddSong={onPridatSkladbu} />
        </div>
      )}

      {zdroj === 'youtube' && (
        <div className="max-h-[62vh] overflow-y-auto -mx-4 sm:-mx-5 rounded-2xl">
          <YouTubeSection
            activeSong={activeSong}
            songs={songs}
            onSelectSong={onVybratSkladbu}
            onUpdateSongVideos={onUlozitVidea}
            onAddSong={onPridatSkladbu}
          />
        </div>
      )}
    </div>
  );
};
