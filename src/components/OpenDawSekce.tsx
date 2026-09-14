import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ExterniSluzba } from './ExterniSluzba';

/**
 * openDAW uvnitř aplikace.
 *
 * Dlouho to vypadalo, že vložit nejde. Posílá `COEP: require-corp`,
 * jeho WASM engine chce `SharedArrayBuffer` a rám zůstával viset na
 * spinneru. Chyběly k tomu dvě věci, ne jedna:
 *
 *   1. Naše stránka musí být cross-origin izolovaná. To zařizuje server
 *      hlavičkami `COOP: same-origin` a `COEP: credentialless`.
 *   2. Rám musí izolaci dostat **delegovanou** přes
 *      `allow="cross-origin-isolated"`. Tohle se přehlíželo nejdřív —
 *      rodič byl izolovaný, rám ne, a openDAW vyhodil hlášku
 *      „crossOriginIsolated must be enabled". Ten věčný spinner byl ve
 *      skutečnosti zablokovaný `alert()`.
 *
 * Vkládá se jejich hostovaná stránka, ne kopie jejich kódu. Rozdíl je
 * podstatný: openDAW je pod AGPL v3, takže provozovat vlastní kopii by
 * znamenalo nabízet zdrojáky každému, kdo s ní po síti pracuje.
 * Odkázat na cizí web žádnou takovou povinnost nezakládá. Framing nám
 * nezakazují — neposílají `X-Frame-Options` ani `frame-ancestors` a
 * `CORP: cross-origin` je vědomé povolení.
 *
 * Projekty zůstávají u nich v prohlížeči, pod jejich doménou. My do
 * rámu nevidíme a nic z něj nečteme.
 */

const ADRESA = 'https://opendaw.studio/';

export const OpenDawSekce: React.FC = () => {
  const [nacteno, setNacteno] = useState(false);

  /*
   * Izolace se čte až po připojení komponenty.
   *
   * `crossOriginIsolated` je vlastnost dokumentu, která se od načtení
   * stránky nemění — číst ji při každém vykreslení nemá smysl a při
   * serverovém vykreslení by spadla.
   */
  const [izolovano, setIzolovano] = useState<boolean | null>(null);
  useEffect(() => {
    setIzolovano(typeof window !== 'undefined' && window.crossOriginIsolated === true);
  }, []);

  if (izolovano === null) return null;

  /*
   * Bez izolace se nepředstírá, že to jde.
   *
   * Prohlížeč, který nezná `COEP: credentialless` (dnes Safari), naši
   * hlavičku přeskočí a stránka zůstane neizolovaná. Zbytek aplikace
   * tím nijak netrpí, ale openDAW by se tu jen protočil donekonečna —
   * což vypadá jako rozbitá aplikace. Poctivý odkaz vypadá líp.
   */
  if (!izolovano) {
    return (
      <ExterniSluzba
        nazev="openDAW"
        duvod="V tomhle prohlížeči se openDAW vložit nedá — otevři ho v Chrome, Edge nebo Firefoxu, nebo v novém okně."
        odkazy={[
          { nazev: 'Studio', adresa: ADRESA },
          { nazev: 'O projektu', adresa: 'https://opendaw.org/' },
        ]}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative bg-plocha-2 border border-kresba rounded-2xl overflow-hidden">
        {!nacteno && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-drobne text-pismo-tlum">
            <Loader2 className="w-4 h-4 animate-spin" />Načítám openDAW…
          </div>
        )}
        <iframe
          src={ADRESA}
          title="openDAW"
          onLoad={() => setNacteno(true)}
          /*
           * `cross-origin-isolated` je ta delegace, na které to celé
           * stálo. Bez ní je izolovaný jen rodič a openDAW se nespustí.
           *
           * Mikrofon a MIDI si rám sám vzít nemůže — musí mu je povolit
           * stránka, která ho vkládá.
           */
          allow="cross-origin-isolated; microphone; midi; autoplay; clipboard-write; fullscreen"
          className="w-full h-[78vh] min-h-[560px] border-0 block"
        />
      </div>

    </div>
  );
};
