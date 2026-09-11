import React from 'react';
import { ExternalLink, TriangleAlert } from 'lucide-react';

/**
 * Cizí služba, kterou nejde vložit dovnitř.
 *
 * Vkládání rámem je jinde v aplikaci běžné — TONE3000 i openDAW tak
 * běží přímo v sekci. BandLab to ale neumožňuje a obejít to nejde:
 * posílá `X-Frame-Options: SAMEORIGIN`, tedy „na cizím webu se
 * nezobrazuju", a prohlížeč rám odmítne vykreslit.
 *
 * Sekce proto nepředstírá, že tu služba je. Prázdný rám nebo věčný
 * spinner vypadá jako rozbitá aplikace; poctivý odkaz ne.
 *
 * Používá to i openDAW, ale jen jako záložní stav v prohlížeči bez
 * cross-origin izolace — viz `OpenDawSekce`.
 */

export interface OdkazSluzby {
  nazev: string;
  adresa: string;
  popis: string;
}

interface Props {
  nazev: string;
  popis: string;
  /** Proč to nejde vložit. Konkrétně, ne „z technických důvodů". */
  duvod: React.ReactNode;
  odkazy: OdkazSluzby[];
  poznamka?: React.ReactNode;
}

export const ExterniSluzba: React.FC<Props> = ({ nazev, popis, duvod, odkazy, poznamka }) => (
  <div className="space-y-4">
    <div>
      <h2 className="nadpis-sekce">{nazev}</h2>
      <p className="text-drobne text-pismo-tlum max-w-[70ch]">{popis}</p>
    </div>

    <p className="flex items-start gap-2 text-drobne text-pozor bg-pozor/10 border border-pozor/30 rounded-panel p-3 max-w-[74ch]">
      <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{duvod}</span>
    </p>

    <div className="grid gap-2 sm:grid-cols-3">
      {odkazy.map((o) => (
        <a
          key={o.adresa}
          href={o.adresa}
          target="_blank"
          rel="noopener noreferrer"
          className="karta karta-najeti p-4 flex flex-col gap-1 cursor-pointer"
        >
          <span className="flex items-center gap-1.5 nadpis-panelu">
            <ExternalLink className="w-3.5 h-3.5 text-znacka" />{o.nazev}
          </span>
          <span className="text-drobne text-pismo-tlum">{o.popis}</span>
        </a>
      ))}
    </div>

    {poznamka && (
      <p className="text-stitek text-pismo-slaby max-w-[80ch]">{poznamka}</p>
    )}
  </div>
);
