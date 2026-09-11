import React from 'react';
import { ExterniSluzba } from './ExterniSluzba';

/**
 * Bandzone — česká a slovenská komunita kapel.
 *
 * Vložit dovnitř nejde a nepůjde: bandzone.cz posílá
 * `X-Frame-Options: SAMEORIGIN` (ověřeno hlavičkami), tedy „na cizím
 * webu se nezobrazuju". Je to vědomé rozhodnutí majitele — obejít by se
 * dalo jedině přeposíláním jejich stránky přes náš server, a to se dělat
 * nebude. Vlastní přehrávač pro vložení, jaký má BandLab, Bandzone
 * nenabízí; jejich nápověda o žádném nemluví.
 *
 * Odkazy níž jsou převzaté z jejich vlastní navigace, ne odhadnuté.
 */
export const BandzoneSekce: React.FC = () => (
  <ExterniSluzba
    nazev="Bandzone"
    popis="Česká a slovenská komunita kapel — profily, písničky, koncerty a kluby. Otevírá se v novém okně; účet i profil kapely zůstávají u nich."
    duvod={
      <>
        <strong>Vložit Bandzone dovnitř aplikace nejde.</strong> Posílá hlavičku{' '}
        <code>X-Frame-Options: SAMEORIGIN</code>, kterou zakazuje zobrazení na cizím webu —
        prohlížeč by tu nechal prázdné místo. Je to jejich vědomé rozhodnutí; obejít by šlo
        jedině přeposíláním jejich stránky přes náš server, a to dělat nebudeme. Přehrávač pro
        vložení na cizí web Bandzone nenabízí.
      </>
    }
    odkazy={[
      { nazev: 'Bandzone', adresa: 'https://bandzone.cz/', popis: 'Titulní strana — novinky, tipy týdne, žebříčky.' },
      { nazev: 'Kapely', adresa: 'https://bandzone.cz/kapely.html', popis: 'Profily kapel s písničkami k poslechu.' },
      { nazev: 'Koncerty', adresa: 'https://bandzone.cz/koncerty', popis: 'Kdo kde hraje.' },
      { nazev: 'Kluby', adresa: 'https://bandzone.cz/kluby.html', popis: 'Kde se dá hrát.' },
      { nazev: 'Videa', adresa: 'https://bandzone.cz/videa.html', popis: 'Klipy a živáky kapel.' },
      { nazev: 'Fanoušci', adresa: 'https://bandzone.cz/fanousci.html', popis: 'Komunita kolem kapel.' },
    ]}
  />
);
