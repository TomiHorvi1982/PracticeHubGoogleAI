import React, { useState } from 'react';
import { ExternalLink, Loader2, RotateCcw } from 'lucide-react';

/**
 * Karaoke texty — playlisty z karaoketexty.cz uvnitř aplikace.
 *
 * Běží tu jejich stránka v rámu, ne naše kopie textů. Texty písní jsou
 * autorská díla a do aplikace se nestahují ani neukládají; jejich web
 * je jen zobrazený, stejně jako by byl otevřený v jiné kartě.
 *
 * Vložení nezakazují: neposílají `X-Frame-Options` ani
 * `frame-ancestors` (ověřeno hlavičkami) a stránka se z rámu nesnaží
 * vyskočit.
 *
 * Rám má `credentialless`, protože aplikace běží cross-origin izolovaná
 * kvůli openDAW — bez něj by ho prohlížeč zablokoval. Cenou je, že
 * stránka v rámu nedostane cookies: přihlášení k jejich účtu tu nedrží.
 * Na vlastní playlisty je proto po ruce „Vlastní okno".
 *
 * Kam se v rámu doklikáš, přežije přepnutí sekce: sekce zůstávají
 * připojené (`ZiveSekce`), takže se rám nenačítá znovu.
 */

const ADRESA = 'https://www.karaoketexty.cz/playlisty';

export const KaraokeSekce: React.FC = () => {
  const [nacteno, setNacteno] = useState(false);
  // Změnou klíče se rám načte znovu od playlistů — návrat „domů",
  // když se člověk v rámu zatoulá.
  const [pokus, setPokus] = useState(0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-end gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setNacteno(false); setPokus((p) => p + 1); }}
            title="Zpátky na playlisty"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />Na playlisty
          </button>
          <a
            href={ADRESA}
            target="_blank"
            rel="noopener noreferrer"
            title="Otevřít ve vlastním okně — tam drží i přihlášení k jejich účtu"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />Vlastní okno
          </a>
        </div>
      </div>

      <div className="relative overflow-hidden">
        {!nacteno && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-drobne text-pismo-tlum">
            <Loader2 className="w-4 h-4 animate-spin" />Načítám karaoketexty.cz…
          </div>
        )}
        <iframe
          // Aplikace běží cross-origin izolovaná kvůli openDAW; bez
          // `credentialless` by prohlížeč tenhle rám zablokoval.
          credentialless=""
          key={pokus}
          src={ADRESA}
          title="Karaoke texty"
          onLoad={() => setNacteno(true)}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full h-[78vh] min-h-[560px] border-0 block bg-white"
        />
      </div>

    </div>
  );
};
