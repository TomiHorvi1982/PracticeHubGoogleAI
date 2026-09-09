import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, RotateCw, Search, Star, TriangleAlert } from 'lucide-react';

/**
 * TONE3000 přímo v aplikaci.
 *
 * Jejich stránka umí, co my ne: prohledat katalog nasnímaných aparátů,
 * poslechnout si ukázku a v Live Inputu rovnou zahrát přes vybraný tón.
 * Motor je pod tím týž, na kterém stojí náš kytarový fader — vydali ho
 * jako `neural-amp-modeler-wasm` — takže kopírovat jejich přehrávač by
 * znamenalo postavit podruhé, co už hraje. Rozumnější je je pustit dovnitř.
 *
 * Vkládá se rámem, ne přenesením obsahu: nic se nestahuje ani neobchází,
 * běží to na jejich serveru a pod jejich podmínkami. Kontrolovali jsme,
 * že vkládání nezakazují — hlavičky `X-Frame-Options` ani
 * `frame-ancestors` neposílají.
 *
 * Dvě věci ale rám neumí a nemá cenu předstírat opak:
 *
 * 1. Mikrofon musí povolit i naše stránka, proto `allow="microphone"`.
 *    Bez toho by Live Input neslyšel kytaru.
 * 2. Přihlášení v cizím rámu často neprojde — prohlížeče blokují
 *    soubory cookie třetích stran. Když se přihlásit nedaří, je od toho
 *    tlačítko, které stránku otevře samostatně.
 */

const ADRESA = 'https://www.tone3000.com';

interface Odkaz {
  nazev: string;
  cesta: string;
  ikona: React.FC<{ className?: string }>;
}

const ODKAZY: Odkaz[] = [
  { nazev: 'Hledat tóny', cesta: '/search', ikona: Search },
  { nazev: 'Oblíbené', cesta: '/favorites', ikona: Star },
];

export const Tone3000Sekce: React.FC = () => {
  const ram = useRef<HTMLIFrameElement>(null);
  const [cesta, setCesta] = useState('/search');
  /** Kolikátý pokus o načtení. Změnou se rám donutí načíst znovu. */
  const [pokus, setPokus] = useState(0);
  const [nacteno, setNacteno] = useState(false);
  const [dlouho, setDlouho] = useState(false);

  /*
   * Rám o zablokovaném vložení neřekne — `onLoad` se ozve i na chybové
   * stránce a do cizího původu se podívat nesmíme. Jediné, co poznáme,
   * je že se dlouho nic neozvalo.
   */
  useEffect(() => {
    setNacteno(false);
    setDlouho(false);
    const t = window.setTimeout(() => setDlouho(true), 9000);
    return () => window.clearTimeout(t);
  }, [cesta, pokus]);

  const plnaAdresa = `${ADRESA}${cesta}`;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="nadpis-sekce">TONE3000</h2>
        <p className="text-drobne text-pismo-tlum max-w-[70ch]">
          Katalog nasnímaných aparátů a jejich živý přehrávač, otevřený
          rovnou tady. Zapoj kytaru do zvukovky, vyber tón a dej Play —
          hraje to na stejném motoru jako náš kytarový fader.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {ODKAZY.map((o) => (
          <button
            key={o.cesta}
            onClick={() => setCesta(o.cesta)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-prvek text-drobne font-bold cursor-pointer ${
              cesta === o.cesta ? 'zlata-plocha' : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
            }`}
          >
            <o.ikona className="w-3.5 h-3.5" />{o.nazev}
          </button>
        ))}

        <button
          onClick={() => setPokus((p) => p + 1)}
          title="Načíst stránku znovu"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" />Znovu
        </button>

        {/* Únik pro případ, že přihlášení v rámu neprojde. */}
        <a
          href={plnaAdresa}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />Otevřít samostatně
        </a>
      </div>

      {dlouho && !nacteno && (
        <p className="flex items-start gap-2 text-drobne text-pozor bg-pozor/10 border border-pozor/30 rounded-panel p-2.5">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Stránka se načítá dlouho, nebo ji TONE3000 v rámu nepustí.
            Zkus <strong>Znovu</strong>, a když to nepomůže, otevři ji
            samostatně tlačítkem vpravo.
          </span>
        </p>
      )}

      {/*
        Výška se počítá z okna, ne z obsahu: rám z cizího původu svou
        výšku neohlásí, takže by se srazil na pár desítek pixelů. Zbývá
        mu tedy zbytek obrazovky pod lištami.
      */}
      <div className="karta overflow-hidden h-[calc(100vh-260px)] min-h-[420px]">
        <iframe
          key={pokus}
          ref={ram}
          src={plnaAdresa}
          title="TONE3000"
          onLoad={() => setNacteno(true)}
          // Mikrofon si rám sám nevezme — musí mu ho povolit stránka,
          // ve které sedí. Bez toho by Live Input neslyšel kytaru.
          allow="microphone; autoplay; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full h-full border-0 bg-white"
        />
      </div>

      <p className="text-stitek text-pismo-slaby max-w-[80ch]">
        Běží to na serveru TONE3000, ne u nás. Když se nedaří přihlásit,
        je to blokováním souborů cookie třetích stran — otevři stránku
        samostatně, přihlas se tam a vrať se sem. Na hraní naživo použij
        drátová sluchátka; bezdrátová přidají i přes sto milisekund zpoždění.
      </p>
    </div>
  );
};
