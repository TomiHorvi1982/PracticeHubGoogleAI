import React from 'react';
import { Compass, Grid3x3, Mic, Clock, Piano, Wrench } from 'lucide-react';
import { useMusicalContext, DockToolId } from '../../context/MusicalContext';

/**
 * Spouštěč nástrojů v dolním panelu.
 *
 * Dolní panel se vykresluje jen tehdy, když je v něm nějaký nástroj
 * zapnutý (`if (!activeDockTool) return null`), a nemá vlastní tlačítko.
 * Byl tak dosažitelný jen z nitra jiných komponent — v horní liště po
 * něm zbyl komentář „Quick Dock Triggers" a žádná tlačítka.
 *
 * Proto měla aplikace Ladičku a Metronom i jako celostránkové sekce:
 * byla to jediná objevitelná cesta. Tady se ta cesta vrací na místo,
 * kam patří — vedle tempa a tóniny, se kterými nástroje souvisí, a
 * dostupná při hraní, ne místo něj.
 *
 * Na úzkém okně je z toho jedno tlačítko: dolní panel má vlastní
 * přepínač nástrojů, takže se přes něj dostaneš ke všem, a pět ikon
 * navíc by lištu na mobilu rozbilo.
 */

const NASTROJE: { id: NonNullable<DockToolId>; nazev: string; ikona: React.FC<{ className?: string }> }[] = [
  { id: 'fretboard', nazev: 'Hmatník', ikona: Compass },
  { id: 'chords', nazev: 'Akordy', ikona: Grid3x3 },
  { id: 'tuner', nazev: 'Ladička', ikona: Mic },
  { id: 'metronome', nazev: 'Metronom', ikona: Clock },
  { id: 'keyboard', nazev: 'Klávesy', ikona: Piano },
];

const TLACITKO = 'rounded-prvek transition-colors cursor-pointer flex items-center justify-center '
  + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-znacka';

export const NastrojeDocku: React.FC = () => {
  const { activeDockTool, setActiveDockTool } = useMusicalContext();

  /** Druhé kliknutí na týž nástroj panel zavře. */
  const prepni = (id: NonNullable<DockToolId>) =>
    setActiveDockTool(activeDockTool === id ? null : id);

  return (
    <>
      {/* Široké okno: nástroje rovnou po ruce. */}
      <div className="hidden lg:flex items-center gap-0.5 pr-2 mr-1 border-r border-kresba">
        {NASTROJE.map((n) => {
          const Ikona = n.ikona;
          // Hmatník a stupnice sdílejí obrazovku, tak svítí obojí.
          const aktivni = activeDockTool === n.id
            || (n.id === 'fretboard' && activeDockTool === 'scales');
          return (
            <button
              key={n.id}
              onClick={() => prepni(n.id)}
              title={n.nazev}
              aria-label={n.nazev}
              aria-pressed={aktivni}
              className={`${TLACITKO} p-2 ${
                aktivni ? 'bg-znacka-tlum text-znacka' : 'text-pismo-slaby hover:text-pismo hover:bg-plocha-2'
              }`}
            >
              <Ikona className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Úzké okno: jedno tlačítko, zbytek si člověk přepne v panelu. */}
      <button
        onClick={() => setActiveDockTool(activeDockTool ? null : 'fretboard')}
        aria-label="Nástroje"
        aria-pressed={!!activeDockTool}
        className={`${TLACITKO} lg:hidden min-h-dotyk min-w-dotyk ${
          activeDockTool ? 'bg-znacka-tlum text-znacka' : 'text-pismo-slaby hover:text-pismo hover:bg-plocha-2'
        }`}
      >
        <Wrench className="w-4 h-4" />
      </button>
    </>
  );
};
